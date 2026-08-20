import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { EXRLoader } from 'jsm/loaders/EXRLoader.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// ============================================================
//  CONFIGURATION
// ============================================================
const TABLE_SIZE_X = 10;
const TABLE_SIZE_Z = 6;
const BALL_RADIUS = 0.5;
const BALL_MASS = 0.2;              // kg (boule de billard standard)

// Constantes physiques
const GRAVITY = 9.81;               // m/s²
let MU_SLIDE = 1.0;                 // coefficient de friction cinétique (glissement)
let MU_ROLL = 0.1;                  // coefficient de résistance au roulement
const SLIDE_THRESHOLD = 0.3;        // sous ce seuil, on considère v_P ≈ 0 (roulement pur)

// Moment d'inertie d'une sphère pleine : I = (2/5) m R²
const INERTIA = (2 / 5) * BALL_MASS * BALL_RADIUS * BALL_RADIUS;

// ============================================================
//  PARAMÈTRES GUI
// ============================================================
let IMPULSE_FORCE = 5.0;            // force du coup de queue (N)
let IMPACT_HEIGHT = 0.0;            // hauteur d'impact h (définit le bras de levier)
let TIME_SCALE = 1.0;               // ralentit la simulation (0 = pause, 1 = temps réel)

const params = {
    impulseForce: IMPULSE_FORCE,
    impactHeight: IMPACT_HEIGHT,
    timeScale: TIME_SCALE,
    muSlide: MU_SLIDE,
    muRoll: MU_ROLL,
    reset: resetGame,
    shoot: shootBall
};

function syncFromParams() {
    IMPULSE_FORCE = params.impulseForce;
    IMPACT_HEIGHT = params.impactHeight;
    TIME_SCALE = params.timeScale;
    MU_SLIDE = params.muSlide;
    MU_ROLL = params.muRoll;
}

// ============================================================
//  ÉTAT PHYSIQUE — le corps rigide (boule)
//  Linéaire : pos, vel   |   Angulaire : angVel, quat
// ============================================================
const physicsState = {
    pos: new THREE.Vector3(-4, BALL_RADIUS, 0),   // position du centre de masse
    vel: new THREE.Vector3(0, 0, 0),              // v_G (vitesse linéaire)
    angVel: new THREE.Vector3(0, 0, 0),           // ω (vitesse angulaire)
    quat: new THREE.Quaternion(),                 // orientation (quaternion)
    isSliding: false                              // mode : glissement vs roulement
};

// ============================================================
//  THREE.JS — Scène, caméra, rendu
// ============================================================
let camera, scene, renderer, controls;
let ballMesh, velArrow, slideArrow;
let gui;

init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
    camera.position.set(0, 8, 12);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;     // tone mapping HDR → écran
    renderer.toneMappingExposure = 0.6;
    document.body.appendChild(renderer.domElement);

    // Éclairage : HDR environment map (sunny grass field)
    // L'EXR est chargé, converti en cube map par PMREMGenerator,
    // puis assigné à scene.environment pour l'IBL (Image-Based Lighting).
    const pmrem = new THREE.PMREMGenerator(renderer);
    new EXRLoader().load('textures/hdrs/sunny-grass-field.exr', (texture) => {
        const envMap = pmrem.fromEquirectangular(texture).texture;
        scene.environment = envMap;       // éclairage PBR (réflexions, diffus)
        texture.dispose();
        pmrem.dispose();
    });

    // Spot léger au-dessus de la table pour les ombres portées
    const spotLight = new THREE.SpotLight(0xffffff, 100);
    spotLight.position.set(0, 10, 0);
    spotLight.angle = Math.PI / 4;
    spotLight.penumbra = 0.5;
    spotLight.castShadow = true;
    scene.add(spotLight);

    // Ambient faible pour remplir les noirs (zones non éclairées par le spot)
    scene.add(new THREE.AmbientLight(0xffffff, .15));

    createTable();
    createBall();
    setupGUI();

    controls = new OrbitControls(camera, renderer.domElement);
    addEventListener('resize', onResize);
    renderer.setAnimationLoop(animate);
}

// ============================================================
//  TABLE — sol + murs
// ============================================================
function createTable() {
    // Tapis (feutre — mat, non métallique)
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(TABLE_SIZE_X, TABLE_SIZE_Z),
        new THREE.MeshStandardMaterial({ color: 0x228822, roughness: 0.9, metalness: 0.0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Murs (bandes)
    const wallHeight = 0.5;
    const wallThick = 0.5;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x335533 });
    const walls = [
        { pos: [0, wallHeight / 2, -TABLE_SIZE_Z / 2 - wallThick / 2], size: [TABLE_SIZE_X + wallThick * 2, wallHeight, wallThick] },
        { pos: [0, wallHeight / 2, TABLE_SIZE_Z / 2 + wallThick / 2], size: [TABLE_SIZE_X + wallThick * 2, wallHeight, wallThick] },
        { pos: [-TABLE_SIZE_X / 2 - wallThick / 2, wallHeight / 2, 0], size: [wallThick, wallHeight, TABLE_SIZE_Z] },
        { pos: [TABLE_SIZE_X / 2 + wallThick / 2, wallHeight / 2, 0], size: [wallThick, wallHeight, TABLE_SIZE_Z] }
    ];
    walls.forEach(w => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
        mesh.position.set(...w.pos);
        mesh.castShadow = true;
        scene.add(mesh);
    });
}

// ============================================================
//  BOULE — mesh + flèches de visualisation
//  velArrow (bleu) : v_G       slideArrow (rouge) : v_P (glissement)
// ============================================================

// Génère une texture de grille UV colorée sur un canvas.
// Chaque cellule a une couleur distincte (hue répartie sur tout le spectre)
// et affiche son index — la rotation de la boule est visible dans toutes
// les directions, contrairement à une texture uniforme ou symétrique.
function createUVGridTexture(cols, rows) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const cellW = size / cols;
    const cellH = size / rows;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const hue = ((y * cols + x) / (cols * rows)) * 360;
            ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
            ctx.fillRect(x * cellW, y * cellH, cellW, cellH);

            // Bordure noire entre les cellules
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.strokeRect(x * cellW, y * cellH, cellW, cellH);

            // Numéro de la cellule
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 60px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(y * cols + x, x * cellW + cellW / 2, y * cellH + cellH / 2);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;     // nette vue de près (billes qui roulent vers la caméra)
    return texture;
}
function createBall() {
    // Texture : grille UV colorée générée procéduralement (pas de dépendance externe)
    // Chaque case a une couleur différente + son numéro — la rotation est visible
    // dans toutes les directions, contrairement à une texture symétrique.
    const tex = createUVGridTexture(4, 4);
    ballMesh = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_RADIUS, 32, 32),
        new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.15,       // boule laquée — presque polie
            metalness: 0.0,        // non métallique, mais très lisse
            envMapIntensity: 0.1  // réfléchit l'environnement HDR
        })
    );
    ballMesh.castShadow = true;
    scene.add(ballMesh);

    // Flèche vitesse linéaire (bleu)
    velArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x0000ff
    );
    scene.add(velArrow);

    // Flèche vitesse de glissement (rouge)
    slideArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xff0000
    );
    scene.add(slideArrow);
}

// ============================================================
//  COUP DE QUEUE — impulsion linéaire + angulaire
//  v = F/m   |   ω = (r × F) / I
// ============================================================
function shootBall() {
    resetGame();
    syncFromParams();

    // 1. Impulsion linéaire : v_G = F / m
    const direction = new THREE.Vector3(1, 0, 0);
    const linearSpeed = IMPULSE_FORCE / BALL_MASS;
    physicsState.vel.copy(direction.multiplyScalar(linearSpeed));

    // 2. Impulsion angulaire : τ = r × F  →  ω = τ / I
    //    r = (0, h, 0) est le bras de levier (hauteur d'impact)
    const r = new THREE.Vector3(0, IMPACT_HEIGHT, 0);
    const F = new THREE.Vector3(IMPULSE_FORCE, 0, 0);
    const torqueImpulse = new THREE.Vector3().crossVectors(r, F);
    physicsState.angVel.copy(torqueImpulse.divideScalar(INERTIA));
}

// ============================================================
//  PHYSIQUE — glissement vs roulement
//  v_P = v_G + (ω × r)   →   si v_P ≠ 0 : friction cinétique
// ============================================================
function updatePhysics(dt) {
    if (dt > 0.1) dt = 0.1;   // clamp : évite les explosions sur un lag spike

    const v = physicsState.vel;
    const omega = physicsState.angVel;

    // Vecteur du centre vers le point de contact : r = (0, -R, 0)
    const rVector = new THREE.Vector3(0, -BALL_RADIUS, 0);

    // Vitesse du point de contact : v_P = v_G + (ω × r)
    const rotationalVelAtPoint = new THREE.Vector3().crossVectors(omega, rVector);
    const slideVel = new THREE.Vector3().addVectors(v, rotationalVelAtPoint);
    slideVel.y = 0;   // on ignore la composante verticale (la boule reste sur le tapis)

    const slideSpeed = slideVel.length();

    if (slideSpeed > SLIDE_THRESHOLD) {
        // --- MODE GLISSEMENT : friction cinétique ---
        physicsState.isSliding = true;

        // Force de friction : opposée à la vitesse de glissement
        const frictionDir = slideVel.clone().normalize().negate();
        const frictionMag = MU_SLIDE * BALL_MASS * GRAVITY;
        const frictionForce = frictionDir.multiplyScalar(frictionMag);

        // A. Effet linéaire : ralentit v_G
        const linearAcc = frictionForce.clone().divideScalar(BALL_MASS);
        v.addScaledVector(linearAcc, dt);

        // B. Effet angulaire : τ = r × F  →  accélère ω
        const torque = new THREE.Vector3().crossVectors(rVector, frictionForce);
        const angularAcc = torque.divideScalar(INERTIA);
        omega.addScaledVector(angularAcc, dt);

    } else {
        // --- MODE ROULEMENT : résistance au roulement ---
        physicsState.isSliding = false;

        // Décroissance exponentielle : frame-rate independent
        // μᵣ=0.1 → ~10%/s de perte (roule plusieurs secondes)
        // μᵣ=0.5 → ~39%/s (arrêt modéré)
        const dragFactor = Math.exp(-MU_ROLL * dt * 1);
        v.multiplyScalar(dragFactor);

        // Friction statique à basse vitesse : garantit l'arrêt
        // (l'exponentielle seule n'atteint jamais zéro)
        const speed = v.length();
        if (speed > 0) {
            const staticDrag = 0.2 * dt;   // décélération constante (m/s²)
            const newSpeed = Math.max(0, speed - staticDrag);
            v.multiplyScalar(newSpeed / speed);
        }

        // Contraindre ω à la condition de roulement : v_G = ω × r
        omega.set(v.z / BALL_RADIUS, 0, -v.x / BALL_RADIUS);

        // Seuil d'arrêt : la boule s'arrête sous cette vitesse
        if (v.lengthSq() < 0.02) {
            v.set(0, 0, 0);
            omega.set(0, 0, 0);
        }
    }

    // --- Intégration (Euler explicite) ---
    // Position : r += v * dt
    physicsState.pos.addScaledVector(v, dt);

    // Orientation : quaternion (Partie 7 du cours)
    const axis = omega.clone().normalize();
    const angle = omega.length() * dt;
    if (angle > 1e-6) {
        const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
        physicsState.quat.premultiply(q);   // q_new = dq * q_old
    }

    // --- Collisions avec les murs ---
    const halfX = TABLE_SIZE_X / 2 - BALL_RADIUS;
    const halfZ = TABLE_SIZE_Z / 2 - BALL_RADIUS;

    let hitWall = false;
    if (physicsState.pos.x > halfX)  { physicsState.pos.x = halfX;  v.x *= -0.8; hitWall = true; }
    if (physicsState.pos.x < -halfX) { physicsState.pos.x = -halfX; v.x *= -0.8; hitWall = true; }
    if (physicsState.pos.z > halfZ)  { physicsState.pos.z = halfZ;  v.z *= -0.8; hitWall = true; }
    if (physicsState.pos.z < -halfZ) { physicsState.pos.z = -halfZ; v.z *= -0.8; hitWall = true; }

    // Après un rebond, recalculer ω pour maintenir la condition de roulement
    // (sinon v_G et ω sont désynchronisés → re-glissement parasite)
    if (hitWall) {
        omega.set(v.z / BALL_RADIUS, 0, 0 );
    }
}

// ============================================================
//  VISUALISATION — copie l'état physique vers Three.js
// ============================================================
function updateVisuals() {
    ballMesh.position.copy(physicsState.pos);
    ballMesh.quaternion.copy(physicsState.quat);

    // Flèche vitesse linéaire (bleu) : v_G
    if (physicsState.vel.length() > 0.1) {
        velArrow.position.copy(physicsState.pos);
        velArrow.setDirection(physicsState.vel.clone().normalize());
        velArrow.setLength(physicsState.vel.length() * 0.5 + 0.5);
        velArrow.visible = true;
    } else {
        velArrow.visible = false;
    }

    // Flèche vitesse de glissement (rouge) : v_P
    const rVector = new THREE.Vector3(0, -BALL_RADIUS, 0);
    const vRot = new THREE.Vector3().crossVectors(physicsState.angVel, rVector);
    const vSlide = new THREE.Vector3().addVectors(physicsState.vel, vRot);
    vSlide.y = 0;

    if (physicsState.isSliding && vSlide.length() > 0.1) {
        slideArrow.position.copy(physicsState.pos);
        slideArrow.position.y -= BALL_RADIUS * 0.8;
        slideArrow.setDirection(vSlide.normalize());
        slideArrow.setLength(vSlide.length() + 0.5);
        slideArrow.visible = true;
    } else {
        slideArrow.visible = false;
    }
}

// ============================================================
//  RESET
// ============================================================
function resetGame() {
    physicsState.pos.set(-4, BALL_RADIUS, 0);
    physicsState.vel.set(0, 0, 0);
    physicsState.angVel.set(0, 0, 0);
    physicsState.quat.identity();
}

// ============================================================
//  GUI
// ============================================================
function setupGUI() {
    gui = new GUI();
    const folder = gui.addFolder('Coup de Queue');
    folder.add(params, 'impulseForce', .1,5).name('Force (N)');
    folder.add(params, 'impactHeight', -BALL_RADIUS * 0.9, BALL_RADIUS * 0.9, 0.01).name('Hauteur Impact (h)');
    folder.add(params, 'shoot').name('TIRER !');

    const friction = gui.addFolder('Friction');
    friction.add(params, 'muSlide', 0.0, 2.0, 0.01).name('Glissement (μₛ)');
    friction.add(params, 'muRoll', 0.0, 0.5, 0.005).name('Roulement (μᵣ)');

    gui.add(params, 'timeScale', 0.0, 1.0).name('Vitesse Temps');
    gui.add(params, 'reset').name('Reset');
}

// ============================================================
//  BOUCLE DE RENDU
// ============================================================
function animate() {
    syncFromParams();
    updatePhysics(0.016 * TIME_SCALE);
    updateVisuals();
    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}
