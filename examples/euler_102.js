import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';

// --- Variables Globales ---
let camera, scene, renderer;
let ball, velArrow, accArrow;
const clock = new THREE.Clock();

// --- Paramètres Physique ---
const mass = 1.0;
const radius = 0.5;
const restitution = 0.8; // "Rebondissance" (1 = infini, 0 = pas de rebond)
const gravity = new THREE.Vector3(0, -9.81, 0);

// État initial de la balle (Position, Vitesse)
// On utilise des vecteurs mutables pour ne pas recréer d'objets (Memory friendly)
const position = new THREE.Vector3(-5, 5, 0); // En haut à gauche
const velocity = new THREE.Vector3(3, 0, 0);  // Lance vers la droite
const force = new THREE.Vector3();
const acceleration = new THREE.Vector3();

init();

function init() {
    // 1. Scène & Caméra
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd1e5);
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 5, 15);

    // 2. Rendu
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 3. Lumière & Sol
    scene.add(new THREE.HemisphereLight(0xffeeee, 0xaaccaa));
    const light = new THREE.DirectionalLight(0xFFFF22, 1);
    light.position.set(5, 10, 7);
    light.castShadow = true;
    scene.add(light);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    scene.add(new THREE.GridHelper(20, 20));

    // 4. Création de la Balle Physique
    createBall();

    // 5. Contrôles
    new OrbitControls(camera, renderer.domElement);
    window.addEventListener('resize', onWindowResize, false);
    
    // 6. Lancement
    renderer.setAnimationLoop(animate);
}

function createBall() {
    // La Balle Bleue
    ball = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0x0077ff })
    );
    ball.castShadow = true;
    scene.add(ball);

    // Flèche Vitesse (Noir)
    velArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), position, 1, 0x333333);
    scene.add(velArrow);

    // Flèche Accélération (Jaune)
    accArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), position, 1, 0xAA8800);
    scene.add(accArrow);
}

// --- COEUR DU MOTEUR PHYSIQUE (EULER) ---
function updatePhysics(dt) {
    // 1. Calcul des Forces
    force.set(0, 0, 0); // Reset
    
    // Ajout de la gravité (P = m * g)
    // On copie g, on multiplie par m, et on l'ajoute à la force totale
    const gravityForce = gravity.clone().multiplyScalar(mass);
    force.add(gravityForce);

    // 2. Deuxième Loi de Newton : a = F / m
    acceleration.copy(force).divideScalar(mass);

    // 3. Intégration d'Euler (Premier ordre)
    // v_nouveau = v_actuel + a * dt
    velocity.addScaledVector(acceleration, dt);

    // p_nouveau = p_actuel + v * dt
    position.addScaledVector(velocity, dt);

    // 4. Gestion des Collisions (Sol)
    if (position.y < radius) {
        // Correction de position (pour ne pas traverser le sol)
        position.y = radius;
        
        // Inversion de la vitesse (Rebond)
        velocity.y = -velocity.y * restitution;
        
        // (Optionnel) Frottement au sol pour arrêter de glisser à la fin
        velocity.x *= 0.95; 
        velocity.z *= 0.95;
    }
}

function updateVisuals() {
    // Synchroniser l'objet 3D avec le calcul physique
    ball.position.copy(position);

    // Mise à jour flèche vitesse
    velArrow.position.copy(position);
    velArrow.setDirection(velocity.clone().normalize());
    velArrow.setLength(velocity.length() * 0.3, 0.2, 0.1);

    // Mise à jour flèche accélération
    accArrow.position.copy(position);
    // On vérifie que l'accélération n'est pas nulle pour éviter les warnings
    if (acceleration.lengthSq() > 0.0001) {
        accArrow.setDirection(acceleration.clone().normalize());
        accArrow.setLength(acceleration.length() * 0.3, 0.2, 0.1);
    }
}

function animate() {
    // Temps écoulé entre deux images (en secondes)
    // Indispensable pour Euler !
    const dt = clock.getDelta();

    // On limite dt pour éviter des bugs si on change d'onglet
    // (Si dt est trop grand, la simulation explose)
    const safeDt = Math.min(dt, 0.1);

    updatePhysics(safeDt);
    updateVisuals();

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}