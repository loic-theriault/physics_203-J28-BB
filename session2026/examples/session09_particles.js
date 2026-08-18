import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// ============================================================
//  CONFIGURATION
// ============================================================
const MAX_PARTICLES = 3000;          // taille fixe du pool (pas d'allocation par frame)

// Paramètres modifiables par la GUI
let EMISSION_RATE = 200;             // particules par seconde
let GRAVITY = -9.8;                  // m/s² (négatif = vers le bas, positif = flottabilité vers le haut)
let DRAG = 0.0;                      // coefficient de frottement
let LIFETIME = 2.0;                  // durée de vie en secondes
let EMITTER_SHAPE = 'point';         // 'point' | 'cone' | 'sphere'
let SPREAD = 0.3;                    // ouverture du cône (rad) / rayon de la sphère
let PRESET = 'rain';                 // 'rain' | 'fire' | 'smoke'
let TURBULENCE = 0.0;                // amplitude de la turbulence (section 4.D)
let RESTITUTION = 0.3;               // coefficient de rebond au sol (section 5)
const GROUND_Y = -2;                 // hauteur du sol pour la collision

// Position de l'émetteur — mise à jour par applyPreset (différente selon l'effet)
const emitterOrigin = new THREE.Vector3(0, 6, 0);

// ============================================================
//  PRESETS — un même moteur, trois effets très différents
// ============================================================
const PRESETS = {
    rain: {
        gravity: -9.8, drag: 0.1, lifetime: 1.5, shape: 'point', spread: 3.0,
        colorStart: new THREE.Color(0x88bbff), colorEnd: new THREE.Color(0x5588dd),
        size: 1.5, blending: THREE.NormalBlending, rate: 500,
        emitterPos: new THREE.Vector3(0, 6, 0),
        dir: new THREE.Vector3(0, -1, 0), speed: 12,
        turbulence: 0.0, restitution: 0.2
    },
    fire: {
        gravity: 2.5, drag: 0.4, lifetime: 1.2, shape: 'cone', spread: 0.35,
        colorStart: new THREE.Color(0xffee88), colorEnd: new THREE.Color(0x220000),
        size: 3.5, blending: THREE.AdditiveBlending, rate: 300,
        emitterPos: new THREE.Vector3(0, -1.5, 0),
        dir: new THREE.Vector3(0, 1, 0), speed: 2.0,
        turbulence: 4.0, restitution: 0.0
    },
    smoke: {
        gravity: 1.0, drag: 0.8, lifetime: 4.0, shape: 'cone', spread: 0.6,
        colorStart: new THREE.Color(0xaaaaaa), colorEnd: new THREE.Color(0x222222),
        size: 4.0, blending: THREE.NormalBlending, rate: 80,
        emitterPos: new THREE.Vector3(0, -1, 0),
        dir: new THREE.Vector3(0, 1, 0), speed: 1.5,
        turbulence: 2.5, restitution: 0.0
    }
};

// ============================================================
//  POOL DE PARTICULES (Object Pooling)
//  On alloue UNE FOIS au démarrage. Les particules mortes sont
//  recyclées (réinitialisées) plutôt que détruites : zéro GC.
// ============================================================
const pool = [];
for (let i = 0; i < MAX_PARTICLES; i++) {
    pool.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        color: new THREE.Color(),
        alpha: 0,            // 0 = invisible (morte ou pas encore spawnée)
        size: 1,
        life: 0,             // temps restant
        maxLife: 1,
        alive: false
    });
}
let spawnAccumulator = 0;   // accumulateur pour émettre à un taux précis

// ============================================================
//  THREE.JS — Scène, caméra, rendu
// ============================================================
let camera, scene, renderer, points, geometry, material, emitterMarker, gui;
let fpsDisplay = { value: 0 };

// Objet unique lié à la GUI — les contrôleurs lisent/écrivent dedans.
// On synchronise avec les variables globales dans la boucle.
const params = {
    rate: EMISSION_RATE,
    gravity: GRAVITY,
    drag: DRAG,
    life: LIFETIME,
    turb: TURBULENCE,
    rest: RESTITUTION,
    shape: EMITTER_SHAPE,
    spread: SPREAD,
    preset: PRESET
};

function syncFromParams() {
    EMISSION_RATE = params.rate;
    GRAVITY = params.gravity;
    DRAG = params.drag;
    LIFETIME = params.life;
    TURBULENCE = params.turb;
    RESTITUTION = params.rest;
    EMITTER_SHAPE = params.shape;
    SPREAD = params.spread;
}

init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101018);

    camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
    camera.position.set(0, 2, 12);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // Sol discret pour repérer la chute (pluie)
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.MeshStandardMaterial({ color: 0x1a1a22, side: THREE.DoubleSide })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    scene.add(ground);

    // Marqueur de l'émetteur (position mise à jour par applyPreset)
    emitterMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xff5555 })
    );
    scene.add(emitterMarker);

    initParticles();
    setupGUI();
    applyPreset(PRESET);   // applique le preset au démarrage

    new OrbitControls(camera, renderer.domElement);
    addEventListener('resize', onResize);
    renderer.setAnimationLoop(animate);
}

// ============================================================
//  GÉOMÉTRIE & MATÉRIAU — THREE.Points + shader custom
//  Attributs par particule : position, color, aSize, aAlpha.
//  Le shader dessine des points ronds et doux (soft disc).
// ============================================================
function initParticles() {
    if (points) {
        scene.remove(points);
        geometry.dispose();
        material.dispose();
    }

    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    geometry.setDrawRange(0, MAX_PARTICLES);

    material = new THREE.ShaderMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
            uPixelRatio: { value: renderer.getPixelRatio() }
        },
        vertexShader: /* glsl */`
            attribute float aSize;
            attribute float aAlpha;
            varying vec3 vColor;
            varying float vAlpha;
            uniform float uPixelRatio;
            void main() {
                vColor = color;
                vAlpha = aAlpha;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                // Taille en pixels, atténuée par la distance
                gl_PointSize = aSize * uPixelRatio * (100.0 / -mv.z);
                gl_Position = projectionMatrix * mv;
            }
        `,
        fragmentShader: /* glsl */`
            varying vec3 vColor;
            varying float vAlpha;
            void main() {
                // Disque doux : on écarte ce qui dépasse le cercle
                vec2 uv = gl_PointCoord - 0.5;
                float d = length(uv);
                if (d > 0.5) discard;
                float soft = smoothstep(0.5, 0.0, d);
                gl_FragColor = vec4(vColor, vAlpha * soft);
            }
        `
    });

    points = new THREE.Points(geometry, material);
    scene.add(points);
}

// ============================================================
//  FONCTIONS À COMPLÉTER — les 5 missions du TP
// ============================================================

// ------------------------------------------------------------
//  MISSION 5 — sampleEmitter(shape, spread)
//  Renvoie { pos: Vector3, dir: Vector3 } pour une nouvelle particule.
//   - 'point'  : pos = emitterOrigin, dir = direction du preset
//   - 'cone'   : pos = emitterOrigin, dir = direction du preset + déviation
//                aléatoire dans un cône d'ouverture `spread` (radians)
//   - 'sphere' : pos = point aléatoire sur une sphère de rayon `spread`
//                autour de emitterOrigin, dir = normale sortante
//  Le preset courant (PRESETS[PRESET]) fournit emitterPos et dir.
//  Indice pour le cône : THREE.Quaternion().setFromUnitVectors(a, b)
//  crée une rotation de a vers b. On échantillonne dans un cône
//  aligné sur +Z, puis on rotate vers la direction du preset.
// ------------------------------------------------------------
function sampleEmitter(shape, spread) {
    const ps = PRESETS[PRESET];
    const pos = ps.emitterPos.clone();
    const dir = ps.dir.clone();
    // [À COMPLÉTER]
    return { pos, dir };
}

// ------------------------------------------------------------
//  MISSION 1 — spawnParticle(p)
//  Initialise une particule du pool (appelée à l'émission et au recyclage).
//   1. Récupérer { pos, dir } via sampleEmitter(EMITTER_SHAPE, SPREAD).
//   2. p.position = pos ; p.velocity = dir * ps.speed (avec un peu d'aléa).
//   3. p.life = p.maxLife = LIFETIME (+ un peu d'aléa pour éviter les paquets).
//   4. p.color = couleur de départ du preset ; p.alpha = 1 ; p.size = ps.size.
//   5. p.alive = true.
//  Utilise le preset courant : PRESETS[PRESET].
// ------------------------------------------------------------
function spawnParticle(p) {
    // [À COMPLÉTER]
}

// ------------------------------------------------------------
//  MISSION 2 — updateParticle(p, dt)
//  Met à jour une particule vivante pour un pas de temps dt.
//   1. Forces : accélération = gravité (GRAVITY en y) + drag (-DRAG * velocity).
//   2. Intégration d'Euler : velocity += acc * dt ; position += velocity * dt.
//      (Euler suffit pour la VFX : particules courtes et amorties.)
//   3. Lifetime : p.life -= dt. Si p.life <= 0 -> p.alive = false (elle sera recyclée).
//   4. Couleur/taille sur la vie : t = p.life / p.maxLife (1 = naissance, 0 = mort).
//      p.color = lerp(colorEnd, colorStart, t) ; p.alpha = t (fondu) ; p.size = lerp(...).
//  Indice : new THREE.Color().lerpColors(a, b, t) interpolate.
// ------------------------------------------------------------
function updateParticle(p, dt) {
    // [À COMPLÉTER]
}

// ------------------------------------------------------------
//  MISSION 3 — recycleParticle(p)
//  Réinjecte une particule morte dans le cycle : la remettre à l'émetteur.
//  Le plus simple : appeler spawnParticle(p) pour la relancer.
//  (On pourrait aussi la marquer inactive et attendre — mais ici on relance.)
// ------------------------------------------------------------
function recycleParticle(p) {
    // [À COMPLÉTER]
}

// ------------------------------------------------------------
//  MISSION 4 — updateBuffers()
//  Recopie l'état du pool dans les attributs de la BufferGeometry.
//   - position : p.position (x,y,z)
//   - color    : p.color (r,g,b)
//   - aSize    : p.alive ? p.size : 0
//   - aAlpha   : p.alive ? p.alpha : 0   (morte -> invisible)
//  Penser à flaguer needsUpdate = true sur chaque attribut utilisé.
// ------------------------------------------------------------
function updateBuffers() {
    // [À COMPLÉTER]
}

// ============================================================
//  MOTEUR (fourni) — émission, update, recyclage
// ============================================================
function updateEngine(dt) {
    // 1. Émettre de nouvelles particules selon le taux (accumulateur)
    spawnAccumulator += EMISSION_RATE * dt;
    const toSpawn = Math.floor(spawnAccumulator);
    spawnAccumulator -= toSpawn;
    let spawned = 0;
    for (let p of pool) {
        if (spawned >= toSpawn) break;
        if (!p.alive) {
            spawnParticle(p);
            spawned++;
        }
    }

    // 2. Mettre à jour les particules vivantes, recycler les mortes
    for (let p of pool) {
        if (!p.alive) continue;
        updateParticle(p, dt);
        if (!p.alive) recycleParticle(p);   // recyclage immédiat
    }

    // 3. Synchroniser le rendu
    updateBuffers();
}

// ============================================================
//  GUI
// ============================================================
function setupGUI() {
    gui = new GUI();
    const f = gui.addFolder('Moteur');
    f.add(params, 'rate', 0, 1000, 1).name('Taux (part/s)');
    f.add(params, 'gravity', -15, 5, 0.1).name('Gravité');
    f.add(params, 'drag', 0, 3, 0.05).name('Drag');
    f.add(params, 'life', 0.2, 6, 0.1).name('Lifetime (s)');
    f.add(params, 'turb', 0, 10, 0.1).name('Turbulence');
    f.add(params, 'rest', 0, 1, 0.05).name('Restitution');
    const fShape = gui.addFolder('Émetteur');
    fShape.add(params, 'shape', ['point', 'cone', 'sphere']).name('Forme');
    fShape.add(params, 'spread', 0, 2, 0.05).name('Spread');
    gui.add(params, 'preset', ['rain', 'fire', 'smoke']).name('Preset').onChange(applyPreset);
    gui.add({ reset: () => { for (let p of pool) p.alive = false; } }, 'reset').name('♻️ RESET');
    const perf = gui.addFolder('Performance');
    perf.add(fpsDisplay, 'value').name('FPS').disable().listen();
}

// Applique un preset : règle les paramètres, le matériau ET l'émetteur
function applyPreset(name) {
    const ps = PRESETS[name];
    PRESET = name;
    EMISSION_RATE = ps.rate; GRAVITY = ps.gravity; DRAG = ps.drag;
    LIFETIME = ps.lifetime; EMITTER_SHAPE = ps.shape; SPREAD = ps.spread;
    TURBULENCE = ps.turbulence; RESTITUTION = ps.restitution;
    // Mettre à jour l'objet params pour que la GUI reflète les nouvelles valeurs
    params.rate = ps.rate; params.gravity = ps.gravity; params.drag = ps.drag;
    params.life = ps.lifetime; params.shape = ps.shape; params.spread = ps.spread;
    params.turb = ps.turbulence; params.rest = ps.restitution; params.preset = name;
    if (gui) gui.controllersRecursive().forEach(c => c.updateDisplay());
    emitterOrigin.copy(ps.emitterPos);
    if (emitterMarker) emitterMarker.position.copy(emitterOrigin);
    material.blending = ps.blending;
    material.needsUpdate = true;
}

// ============================================================
//  BOUCLE D'ANIMATION
// ============================================================
let frameCount = 0, lastFps = performance.now();

function animate() {
    const dt = 0.016;
    syncFromParams();
    updateEngine(dt);
    renderer.render(scene, camera);

    frameCount++;
    const now = performance.now();
    if (now - lastFps > 500) {
        fpsDisplay.value = Math.round((frameCount * 1000) / (now - lastFps));
        frameCount = 0;
        lastFps = now;
    }
}

function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}
