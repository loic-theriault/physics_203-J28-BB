import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// --- Configuration ---
const GRID_W = 16;          // colonnes du drapeau
const GRID_H = 12;          // rangées du drapeau
const SPACING = 0.4;        // distance au repos entre particules
const GRAVITY = -9.8;

// Paramètres modifiables par la GUI (cf. cours : damping = section 2, itérations = section 4)
let DAMPING = 0.99;
let ITERATIONS = 15;
let WIND = 1.0;
let PIN_LEFT = true;

let camera, scene, renderer;
let particles = [];         // { position, prevPosition, acceleration, pinned }
let constraints = [];       // { a, b, restLength }
let clothGeometry, clothMesh;
let fpsDisplay = { value: 0 };

init();

function init() {
    // 1. Setup Three.js
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
    camera.position.set(0, 1, 12);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // 2. Mât du drapeau
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, GRID_H * SPACING + 2, 10),
        new THREE.MeshStandardMaterial({ color: 0x8B4513 })
    );
    pole.position.set(-GRID_W * SPACING / 2, 0, 0);
    scene.add(pole);

    // 3. Tissu
    initCloth();

    // 4. GUI
    setupGUI();

    // Controls & Loop
    new OrbitControls(camera, renderer.domElement);
    addEventListener('resize', onResize);
    renderer.setAnimationLoop(animate);
}

function initCloth() {
    particles = [];
    constraints = [];

    const offsetX = -GRID_W * SPACING / 2;
    const offsetY = GRID_H * SPACING / 2;

    // Grille de particules ; la colonne de gauche (x=0) est fixée au mât
    for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
            const pos = new THREE.Vector3(
                offsetX + x * SPACING,
                offsetY - y * SPACING,
                0
            );
            particles.push({
                position: pos.clone(),
                prevPosition: pos.clone(),
                acceleration: new THREE.Vector3(0, GRAVITY, 0),
                pinned: PIN_LEFT && x === 0
            });
        }
    }

    // Contraintes de distance : horizontales et verticales
    for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
            const i = y * GRID_W + x;
            if (x < GRID_W - 1) constraints.push({ a: i, b: i + 1, restLength: SPACING });
            if (y < GRID_H - 1) constraints.push({ a: i, b: i + GRID_W, restLength: SPACING });
        }
    }

    // Géométrie du drapeau (vertices indexés comme les particules)
    if (clothGeometry) clothGeometry.dispose();
    clothGeometry = new THREE.PlaneGeometry(
        (GRID_W - 1) * SPACING, (GRID_H - 1) * SPACING, GRID_W - 1, GRID_H - 1
    );
    if (!clothMesh) {
        clothMesh = new THREE.Mesh(
            clothGeometry,
            new THREE.MeshStandardMaterial({
                color: 0xd22b2b, side: THREE.DoubleSide
            })
        );
        scene.add(clothMesh);
    } else {
        clothMesh.geometry = clothGeometry;
    }
    updateMesh();
}

// ============================================================
//  INTÉGRATION DE VERLET (À COMPLÉTER — Mission 1, section 3)
// ============================================================
//  p possède : position (Vector3), prevPosition (Vector3),
//              acceleration (Vector3), pinned (bool).
//  Si p.pinned -> return (ne bouge pas).
//  Sinon : velocity = position - prevPosition
//          position += velocity * DAMPING + acceleration * dt²
//          prevPosition = ancienne position
function verletIntegrate(p, dt) {
    // [À COMPLÉTER]
}

// ============================================================
//  CONTRAINTE DE DISTANCE PBD (À COMPLÉTER — Mission 2, section 4)
// ============================================================
//  delta = p2.position - p1.position
//  dist  = delta.length()   (si 0 -> return)
//  diff  = (dist - restLength) / dist
//  correction = delta * 0.5 * diff
//  if (!p1.pinned) p1.position += correction
//  if (!p2.pinned) p2.position -= correction
function satisfyConstraint(p1, p2, restLength) {
    // [À COMPLÉTER]
}

// ============================================================
//  MOTEUR PHYSIQUE (fourni)
// ============================================================
function updatePhysics(dt) {
    const t = performance.now() * 0.001;

    // Vent : dominant en +X (le long du drapeau), avec un léger flutter en Z
    for (let p of particles) {
        if (p.pinned) continue;
        const windX = (1.0 + 0.3 * Math.sin(t * 2.0 + p.position.y * 0.5)) * WIND * 3.0;
        const windZ = Math.sin(t * 5.0 + p.position.x * 1.5) * WIND * 0.6;
        p.acceleration.set(windX, GRAVITY, windZ);
    }

    // 1. Intégration de Verlet (Mission 1)
    for (let p of particles) verletIntegrate(p, dt);

    // 2. Contraintes PBD itérées (Mission 2)
    for (let it = 0; it < ITERATIONS; it++) {
        for (let c of constraints) {
            satisfyConstraint(particles[c.a], particles[c.b], c.restLength);
        }
    }
}

function updateMesh() {
    const positions = clothGeometry.attributes.position;
    for (let i = 0; i < particles.length; i++) {
        positions.setXYZ(i, particles[i].position.x, particles[i].position.y, particles[i].position.z);
    }
    positions.needsUpdate = true;
    clothGeometry.computeVertexNormals();
}

function setupGUI() {
    const gui = new GUI();
    const f = gui.addFolder('Drapeau');
    f.add({ wind: WIND }, 'wind', 0, 5, 0.1).name('Vent').onChange(v => WIND = v);
    f.add({ damping: DAMPING }, 'damping', 0.9, 1.0, 0.005).name('Damping').onChange(v => DAMPING = v);
    f.add({ iter: ITERATIONS }, 'iter', 1, 30, 1).name('Itérations PBD').onChange(v => ITERATIONS = v);
    f.add({ pin: PIN_LEFT }, 'pin').name('Fixer colonne gauche').onChange(v => { PIN_LEFT = v; initCloth(); });
    gui.add({ reset: () => initCloth() }, 'reset').name('♻️ RESET');
    const perf = gui.addFolder('Performance');
    perf.add(fpsDisplay, 'value').name('FPS').disable().listen();
}

// ============================================================
//  BOUCLE D'ANIMATION
// ============================================================
let frameCount = 0, lastFps = performance.now();

function animate() {
    const dt = 0.016;
    updatePhysics(dt);
    updateMesh();
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
