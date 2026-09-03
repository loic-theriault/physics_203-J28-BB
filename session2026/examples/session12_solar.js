import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';
import { RGBELoader } from 'jsm/loaders/RGBELoader.js';

// ============================================================
//  CONFIGURATION PHYSIQUE
// ============================================================
const G = 100;              // Constante gravitationnelle (unités simulées)
const SUN_MASS = 3330;      // Masse du Soleil
const UA_SCALE = 18;        // 1 UA = 18 unités de monde
const SUB_STEPS = 20;       // Sous-étapes de physique par frame visuelle

// Données des planètes (masses relatives à la Terre, distances en UA)
const PLANET_DATA = {
    mercury: { name: "Mercure", mass: 0.055, dist: 0.39, color: 0xAAAAAA, size: 0.4 },
    venus:   { name: "Vénus",   mass: 0.815, dist: 0.72, color: 0xFFCC33, size: 0.9 },
    earth:   { name: "Terre",   mass: 1.000, dist: 1.00, color: 0x2277FF, size: 1.0 },
    mars:    { name: "Mars",    mass: 0.107, dist: 1.52, color: 0xFF4422, size: 0.5 },
    jupiter: { name: "Jupiter", mass: 317.8, dist: 5.20, color: 0xDDAA88, size: 3.0 },
    saturn:  { name: "Saturne", mass: 95.2,  dist: 9.54, color: 0xCCBB99, size: 2.5 },
};

// Durée d'une année terrestre en unités de simulation : T = 2π√(r³/GM)
const SIM_YEAR_DURATION = 2 * Math.PI * Math.sqrt(Math.pow(UA_SCALE, 3) / (G * SUN_MASS));

// ============================================================
//  PARAMÈTRES GUI
// ============================================================
const params = {
    integrator: 'RK4',       // 'Euler' ou 'RK4'
    timeScale: 0.05,
    subSteps: SUB_STEPS,
    showTrails: true,
    nBody: false,            // Gravité mutuelle entre planètes (bonus)
    reset: resetSimulation,
};

let camera, scene, renderer, controls;
let planets = [];
let totalPhysicsTime = 0;

init();

// ============================================================
//  INITIALISATION THREE.JS
// ============================================================
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.set(0, 180, 300);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    // HDR spatial pour le fond et l'éclairage ambiant
    new RGBELoader().load('./textures/space.hdr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.environment = texture;
    });

    // Lumière du Soleil (PointLight au centre)
    const sunLight = new THREE.PointLight(0xffffff, 3000, 30000);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.1));

    createSun();
    createPlanets();
    setupGUI();

    controls = new OrbitControls(camera, renderer.domElement);
    window.addEventListener('resize', onResize);
    renderer.setAnimationLoop(animate);
}

function createSun() {
    const geo = new THREE.SphereGeometry(3, 32, 32);
    const mat = new THREE.MeshStandardMaterial({ emissive: 0xFFCC00, emissiveIntensity: 2 });
    scene.add(new THREE.Mesh(geo, mat));
}

function createPlanets() {
    Object.keys(PLANET_DATA).forEach(key => {
        const d = PLANET_DATA[key];
        const distWorld = d.dist * UA_SCALE;

        // MISSION 1 : Calculer la vitesse orbitale pour une orbite circulaire
        // v = sqrt(G * M_soleil / r)
        const vOrbit = computeOrbitalVelocity(distWorld);

        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(d.size * 1.5, 24, 24),
            new THREE.MeshStandardMaterial({ color: d.color, metalness: 0.1, roughness: 0.7 })
        );

        // Trail (trajectoire)
        const trailMat = new THREE.LineBasicMaterial({ color: d.color, transparent: true, opacity: 0.3 });
        const trailMesh = new THREE.Line(new THREE.BufferGeometry(), trailMat);
        scene.add(trailMesh);
        scene.add(mesh);

        planets.push({
            id: key,
            name: d.name,
            mass: d.mass,
            mesh: mesh,
            pos: new THREE.Vector3(distWorld, 0, 0),
            vel: new THREE.Vector3(0, 0, -vOrbit),
            trailPoints: [],
            trailMesh: trailMesh,
        });
    });
}

// ============================================================
//  MISSION 1 — Vitesse Orbitale
// ============================================================
function computeOrbitalVelocity(distWorld) {
    // [À COMPLÉTER]
    // Pour une orbite circulaire, la force gravitationnelle = force centripète :
    //   G * M / r² = v² / r
    //   => v = sqrt(G * M / r)
    //
    // Utilisez G, SUN_MASS et distWorld.
    return 0; // Par défaut : les planètes tombent droit sur le Soleil
}

// ============================================================
//  MISSION 2 — Accélération Gravitationnelle
// ============================================================
function getAcceleration(position) {
    // [À COMPLÉTER]
    // Calcule l'accélération exercée par le Soleil sur un objet à `position`.
    //
    // Étapes :
    //   1. Direction du Soleil (origine) vers la planète : -position
    //   2. Distance r = position.length()
    //   3. Magnitude de l'accélération : a = G * M / r²
    //   4. Retourner le vecteur accélération (direction normalisée * magnitude)
    //
    // Attention : si r est trop petit (collision avec le Soleil), retourner
    // un vecteur nul pour éviter une division par zéro.
    return new THREE.Vector3(0, 0, 0);
}

// ============================================================
//  MISSION 3 — Intégration d'Euler
// ============================================================
function updatePhysicsEuler(p, dt) {
    // [À COMPLÉTER]
    // Intégration d'Euler explicite :
    //   1. Calculer l'accélération à la position actuelle
    //   2. v_new = v + a * dt
    //   3. pos_new = pos + v_new * dt
    //
    // Observer : avec Euler, les orbites "dérapent" — l'énergie augmente
    // progressivement et les planètes s'éloignent de leur orbite circulaire.
}

// ============================================================
//  MISSION 4 — Intégration de Runge-Kutta 4 (RK4)
// ============================================================
function updatePhysicsRK4(p, dt) {
    // [À COMPLÉTER]
    // RK4 "sonde" l'accélération à 4 endroits du pas de temps :
    //
    //   k1 = f(y)          — évaluer à t
    //   k2 = f(y + k1*h/2) — évaluer à t + h/2
    //   k3 = f(y + k2*h/2) — évaluer à t + h/2
    //   k4 = f(y + k3*h)   — évaluer à t + h
    //
    //   y_new = y + (k1 + 2*k2 + 2*k3 + k4) / 6 * h
    //
    // Pour la gravité, l'état y = (pos, vel) et f(y) = (vel, acc(pos)).
    // On a donc 4 paires (k_x, k_v) à calculer :
    //
    //   k1_x = v,           k1_v = a(pos)
    //   k2_x = v + k1_v/2,  k2_v = a(pos + k1_x*h/2)
    //   k3_x = v + k2_v/2,  k3_v = a(pos + k2_x*h/2)
    //   k4_x = v + k3_v,    k4_v = a(pos + k3_x*h)
    //
    //   pos += (k1_x + 2*k2_x + 2*k3_x + k4_x) / 6 * dt
    //   vel += (k1_v + 2*k2_v + 2*k3_v + k4_v) / 6 * dt
    //
    // Attention : ne pas modifier p.pos et p.vel pendant le calcul !
    // Utiliser des .clone() pour les positions/vitesses intermédiaires.
}

// ============================================================
//  MISSION 5 — Sub-stepping
// ============================================================
function updatePhysics(dtFrame) {
    // [À COMPLÉTER]
    // Le sub-stepping consiste à diviser le dt d'une frame visuelle en
    // plusieurs sous-étapes plus petites pour améliorer la stabilité.
    //
    //   dtSubStep = dtFrame / params.subSteps
    //   for (let i = 0; i < params.subSteps; i++) {
    //       pour chaque planète, appeler updatePhysicsEuler ou updatePhysicsRK4
    //       totalPhysicsTime += dtSubStep
    //   }
    //
    // Choisir l'intégrateur selon params.integrator ('Euler' ou 'RK4').
}

// ============================================================
//  BOUCLE D'ANIMATION (fournie)
// ============================================================
function animate() {
    const dtFrame = 0.016 * params.timeScale;

    // --- PHYSIQUE (avec sub-stepping) ---
    updatePhysics(dtFrame);

    // --- MISE À JOUR VISUELLE (une fois par frame) ---
    updateHUD();

    for (const p of planets) {
        p.mesh.position.copy(p.pos);
        if (params.showTrails) {
            p.trailPoints.push(p.pos.clone());
            if (p.trailPoints.length > 1500) p.trailPoints.shift();
            p.trailMesh.geometry.setFromPoints(p.trailPoints);
        }
    }

    renderer.render(scene, camera);
}

function updateHUD() {
    const years = totalPhysicsTime / SIM_YEAR_DURATION;
    const currentYear = Math.floor(years);
    const currentDay = Math.floor((years - currentYear) * 365.25);
    document.getElementById('hud').innerText = `An ${currentYear}, Jour ${currentDay}`;
}

// ============================================================
//  RESET & GUI (fournies)
// ============================================================
function resetSimulation() {
    for (const p of planets) {
        scene.remove(p.mesh);
        scene.remove(p.trailMesh);
    }
    planets = [];
    totalPhysicsTime = 0;
    createPlanets();
}

function setupGUI() {
    const gui = new GUI();
    gui.add(params, 'integrator', ['Euler', 'RK4']).name('Intégrateur');
    gui.add(params, 'timeScale', 0.01, 1.5, 0.01).name('⏱️ Vitesse');
    gui.add(params, 'subSteps', 1, 50, 1).name('Sub-steps');
    gui.add(params, 'showTrails').name('🌐 Trajectoires');
    gui.add(params, 'nBody').name('N-body (bonus)');
    gui.add(params, 'reset').name('♻️ Reset');
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
