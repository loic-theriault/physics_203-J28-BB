import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// ============================================================
//  COLORS
// ============================================================
const C = {
    A:        0x44aaff,
    B:        0xff8844,
    minkFill: 0x886644,
    minkEdge: 0xaa8855,
    origin:   0xffffff,
    simplex:  0x00ff88,
    support:  0xffff00,
    dir:      0xff00ff,
    grid:     0x333355,
    supportLn: 0x666666,
};

// ============================================================
//  PARAMETERS
// ============================================================
const params = {
    shapeA: 'rectangle',
    shapeB: 'pentagon',
    rotA: 0.0,
    rotB: 0.4,
    currentStep: 0,
    showMinkowski: true,
    showSupportLines: true,
    autoPlay: false,
    autoSpeed: 0.7,
};

let renderer;
let sceneWorld, sceneMink, cameraWorld, cameraMink, controls;
let polyA, polyB;
let polyAMesh, polyBMesh;
let worldOverlay, minkOverlay, minkShapeGroup;
let gjkResult = null;
let raycaster, mouseNDC;
let dragTarget = null;
let dragOffset = new THREE.Vector2();
let infoDiv;
let autoAccum = 0;

// ============================================================
//  SHAPE DEFINITIONS (local space, centered at origin)
// ============================================================
function makeShape(type) {
    switch (type) {
        case 'rectangle':
            return [new THREE.Vector2(-1.3, -0.75), new THREE.Vector2(1.3, -0.75),
                    new THREE.Vector2(1.3, 0.75),  new THREE.Vector2(-1.3, 0.75)];
        case 'triangle':
            return [new THREE.Vector2(0, 1.2), new THREE.Vector2(-1.1, -0.75), new THREE.Vector2(1.1, -0.75)];
        case 'pentagon': {
            const v = [];
            for (let i = 0; i < 5; i++) {
                const a = i * Math.PI * 2 / 5 - Math.PI / 2;
                v.push(new THREE.Vector2(Math.cos(a) * 1.2, Math.sin(a) * 1.2));
            }
            return v;
        }
        case 'hexagon': {
            const v = [];
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI * 2 / 6;
                v.push(new THREE.Vector2(Math.cos(a) * 1.2, Math.sin(a) * 1.2));
            }
            return v;
        }
    }
}

function worldVertices(poly) {
    const c = Math.cos(poly.rotation), s = Math.sin(poly.rotation);
    return poly.vertices.map(v => new THREE.Vector2(
        v.x * c - v.y * s + poly.position.x,
        v.x * s + v.y * c + poly.position.y
    ));
}

// ============================================================
//  SUPPORT FUNCTIONS
// ============================================================
function support(verts, d) {
    let best = verts[0], bestDot = verts[0].x * d.x + verts[0].y * d.y;
    for (let i = 1; i < verts.length; i++) {
        const dot = verts[i].x * d.x + verts[i].y * d.y;
        if (dot > bestDot) { best = verts[i]; bestDot = dot; }
    }
    return best;
}

// ============================================================
//  GJK ALGORITHM (2D, with step recording)
// ============================================================
function perpAway(edge, awayVec) {
    const p = new THREE.Vector2(-edge.y, edge.x);
    if (p.dot(awayVec) < 0) return p.normalize();
    return new THREE.Vector2(edge.y, -edge.x).normalize();
}

function processSimplex2D(simplex, d) {
    if (simplex.length === 1) {
        const A = simplex[0];
        return { contains: false, simplex: [A], d: A.clone().negate().normalize(),
                 description: 'Single point — d = -A (toward origin)' };
    }
    if (simplex.length === 2) {
        const B = simplex[0], A = simplex[1]; // A is newest
        const AB = new THREE.Vector2().subVectors(B, A);
        const AO = A.clone().negate();
        if (AB.dot(AO) > 0) {
            const dNew = perpAway(AB, AO);
            return { contains: false, simplex: [B, A], d: dNew,
                     description: 'Origin beyond AB → d = perp(AB) toward origin' };
        } else {
            return { contains: false, simplex: [A], d: AO.normalize(),
                     description: 'Origin closest to A → remove B, d = -A' };
        }
    }
    if (simplex.length === 3) {
        const C = simplex[0], B = simplex[1], A = simplex[2]; // A is newest
        const AB = new THREE.Vector2().subVectors(B, A);
        const AC = new THREE.Vector2().subVectors(C, A);
        const AO = A.clone().negate();
        const ABperp = perpAway(AB, AC); // perp to AB pointing away from C
        const ACperp = perpAway(AC, AB); // perp to AC pointing away from B
        if (ABperp.dot(AO) > 0) {
            return { contains: false, simplex: [B, A], d: ABperp,
                     description: 'Origin outside AB edge → remove C' };
        } else if (ACperp.dot(AO) > 0) {
            return { contains: false, simplex: [C, A], d: ACperp,
                     description: 'Origin outside AC edge → remove B' };
        } else {
            return { contains: true,
                     description: 'Origin is INSIDE triangle → COLLISION!' };
        }
    }
    return { contains: false, simplex, d, description: '?' };
}

function runGJK(polyA, polyB) {
    const vA = worldVertices(polyA);
    const vB = worldVertices(polyB);
    const steps = [];

    // Initial direction: from A center toward B center
    let d = new THREE.Vector2(
        polyB.position.x - polyA.position.x,
        polyB.position.y - polyA.position.y
    );
    if (d.lengthSq() < 1e-6) d = new THREE.Vector2(1, 0);
    d.normalize();

    steps.push({
        type: 'init', d: d.clone(),
        description: `Initial direction d = (${d.x.toFixed(2)}, ${d.y.toFixed(2)}) — from A toward B`
    });

    // First support point
    const sa0 = support(vA, d);
    const sb0 = support(vB, d.clone().negate());
    const s0 = new THREE.Vector2(sa0.x - sb0.x, sa0.y - sb0.y);
    let simplex = [s0];

    steps.push({
        type: 'support', d: d.clone(), supportPoint: s0.clone(),
        supportA: sa0.clone(), supportB: sb0.clone(),
        simplex: simplex.map(p => p.clone()),
        description: `Support: S_A(d) - S_B(-d) = (${s0.x.toFixed(2)}, ${s0.y.toFixed(2)})`
    });

    if (s0.dot(d) < 0) {
        steps.push({
            type: 'no_collision',
            reason: 'S·d < 0 — origin cannot be enclosed',
            simplex: simplex.map(p => p.clone()),
            description: 'S·d < 0 → support point does not pass origin → NO COLLISION'
        });
        return { steps, collide: false };
    }

    d = s0.clone().negate().normalize();
    steps.push({
        type: 'update_dir', d: d.clone(),
        simplex: simplex.map(p => p.clone()),
        description: 'd = -S (point toward origin)'
    });

    for (let iter = 0; iter < 20; iter++) {
        const sa = support(vA, d);
        const sb = support(vB, d.clone().negate());
        const s = new THREE.Vector2(sa.x - sb.x, sa.y - sb.y);

        steps.push({
            type: 'support', d: d.clone(), supportPoint: s.clone(),
            supportA: sa.clone(), supportB: sb.clone(),
            simplex: simplex.map(p => p.clone()),
            description: `Support: S_A(d) - S_B(-d) = (${s.x.toFixed(2)}, ${s.y.toFixed(2)})`
        });

        if (s.dot(d) < 0) {
            steps.push({
                type: 'no_collision',
                reason: 'S·d < 0 — origin is outside A⊖B',
                simplex: simplex.map(p => p.clone()),
                description: 'S·d < 0 → support does not pass origin → NO COLLISION'
            });
            return { steps, collide: false };
        }

        simplex.push(s);

        const result = processSimplex2D(simplex, d);

        if (result.contains) {
            steps.push({
                type: 'collision',
                simplex: simplex.map(p => p.clone()),
                description: result.description || 'Origin is inside the simplex → COLLISION confirmed!'
            });
            return { steps, collide: true, simplex: simplex.map(p => p.clone()) };
        }

        steps.push({
            type: 'update_simplex', d: result.d.clone(),
            simplex: simplex.map(p => p.clone()),
            newSimplex: result.simplex.map(p => p.clone()),
            description: result.description
        });

        d = result.d;
        simplex = result.simplex;
    }

    steps.push({
        type: 'no_collision', reason: 'Max iterations',
        simplex: simplex.map(p => p.clone()),
        description: 'Max iterations reached → NO COLLISION'
    });
    return { steps, collide: false };
}

// ============================================================
//  MINKOWSKI DIFFERENCE (for visualization — full shape)
// ============================================================
function convexHull(points) {
    if (points.length < 3) return points.slice();
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (O, A, B) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
    const lower = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function minkowskiDifference(polyA, polyB) {
    const vA = worldVertices(polyA);
    const vB = worldVertices(polyB);
    const diffs = [];
    for (const a of vA)
        for (const b of vB)
            diffs.push(new THREE.Vector2(a.x - b.x, a.y - b.y));
    return convexHull(diffs);
}

// ============================================================
//  THREE.JS HELPERS
// ============================================================
function clearGroup(g) {
    while (g.children.length) {
        const c = g.children[0];
        g.remove(c);
        c.traverse?.(o => { o.geometry?.dispose(); o.material?.dispose(); });
        c.geometry?.dispose();
        c.material?.dispose();
    }
}

function makePolyMesh(poly, color) {
    const shape = new THREE.Shape(poly.vertices);
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(fillGeo, fillMat);
    const edgePts = poly.vertices.map(v => new THREE.Vector3(v.x, v.y, 0.001));
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
    const edges = new THREE.LineLoop(edgeGeo, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    mesh.add(edges);
    mesh.position.set(poly.position.x, poly.position.y, 0);
    mesh.rotation.z = poly.rotation;
    return mesh;
}

function makeLabel(text, color = '#fff') {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.6, 0.3, 1);
    return sprite;
}

function makeDot(pos2D, color, radius = 0.08, z = 0.05) {
    const dot = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 16),
        new THREE.MeshBasicMaterial({ color })
    );
    dot.position.set(pos2D.x, pos2D.y, z);
    return dot;
}

function makeArrow2D(dir, origin2D, color, length = 1.5, z = 0.04) {
    return new THREE.ArrowHelper(
        new THREE.Vector3(dir.x, dir.y, 0).normalize(),
        new THREE.Vector3(origin2D.x, origin2D.y, z),
        length, color, 0.25, 0.15
    );
}

function makeDashedLine(p1, p2, color, z = 0.02) {
    const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(p1.x, p1.y, z), new THREE.Vector3(p2.x, p2.y, z)
    ]);
    const mat = new THREE.LineDashedMaterial({ color, dashSize: 0.15, gapSize: 0.1 });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    return line;
}

function pointInPolygon(p, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        if ((verts[i].y > p.y) !== (verts[j].y > p.y) &&
            p.x < (verts[j].x - verts[i].x) * (p.y - verts[i].y) / (verts[j].y - verts[i].y) + verts[i].x)
            inside = !inside;
    }
    return inside;
}

// Draw support function visualization: a direction line through the shape center,
// projection lines from each vertex to that line, and the support vertex highlighted.
function drawSupportProjection(group, verts, center, dir, supportVert, shapeColor, supportColor) {
    // Direction line through the center (dashed, semi-transparent)
    const lineLen = 2.5;
    const lineStart = new THREE.Vector2(center.x - dir.x * lineLen, center.y - dir.y * lineLen);
    const lineEnd = new THREE.Vector2(center.x + dir.x * lineLen, center.y + dir.y * lineLen);
    group.add(makeDashedLine(lineStart, lineEnd, 0x888888, 0.02));

    // Projection lines from each vertex to the direction line
    for (const v of verts) {
        const proj = (v.x - center.x) * dir.x + (v.y - center.y) * dir.y;
        const projPt = new THREE.Vector2(center.x + proj * dir.x, center.y + proj * dir.y);
        const isSupport = (v.x === supportVert.x && v.y === supportVert.y);
        const lineColor = isSupport ? supportColor : shapeColor;
        const mat = new THREE.LineBasicMaterial({
            color: lineColor, transparent: true, opacity: isSupport ? 0.9 : 0.3
        });
        const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(v.x, v.y, 0.03),
            new THREE.Vector3(projPt.x, projPt.y, 0.03)
        ]);
        group.add(new THREE.Line(geo, mat));

        // Small dot at projection point
        const projDot = new THREE.Mesh(
            new THREE.SphereGeometry(isSupport ? 0.07 : 0.04, 10, 10),
            new THREE.MeshBasicMaterial({ color: lineColor, transparent: !isSupport, opacity: isSupport ? 1 : 0.4 })
        );
        projDot.position.set(projPt.x, projPt.y, 0.04);
        group.add(projDot);
    }

    // Highlight the support vertex (large yellow dot)
    group.add(makeDot(supportVert, supportColor, 0.1, 0.06));
}

// ============================================================
//  INIT
// ============================================================
init();

function init() {
    sceneWorld = new THREE.Scene();
    sceneWorld.background = new THREE.Color(0x1a1a2e);
    sceneMink = new THREE.Scene();
    sceneMink.background = new THREE.Color(0x1e1a2a);

    const frustum = 6;
    const aspect = window.innerWidth / window.innerHeight;
    const halfW = window.innerWidth / 2;
    cameraWorld = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 100);
    cameraWorld.position.set(0, 0, 20);
    cameraMink = new THREE.OrthographicCamera(-frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 100);
    cameraMink.position.set(0, 0, 20);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setScissorTest(true);
    document.body.appendChild(renderer.domElement);

    // Grids
    const gridWorld = new THREE.GridHelper(24, 48, C.grid, 0x222238);
    gridWorld.rotation.x = Math.PI / 2;
    gridWorld.position.z = -0.1;
    sceneWorld.add(gridWorld);

    const gridMink = new THREE.GridHelper(24, 48, C.grid, 0x222238);
    gridMink.rotation.x = Math.PI / 2;
    gridMink.position.z = -0.1;
    sceneMink.add(gridMink);

    // Origin marker in Minkowski space (always visible)
    const originDot = makeDot(new THREE.Vector2(0, 0), C.origin, 0.1, 0.1);
    sceneMink.add(originDot);
    const originLabel = makeLabel('O', '#fff');
    originLabel.position.set(0.25, 0.25, 0.15);
    sceneMink.add(originLabel);

    // Polygons
    // Polygons — start overlapping so collision is visible immediately
    polyA = { vertices: makeShape(params.shapeA), position: new THREE.Vector2(-0.8, 0), rotation: params.rotA };
    polyB = { vertices: makeShape(params.shapeB), position: new THREE.Vector2(0.8, 0),  rotation: params.rotB };
    polyAMesh = makePolyMesh(polyA, C.A);
    polyBMesh = makePolyMesh(polyB, C.B);
    sceneWorld.add(polyAMesh, polyBMesh);

    // Labels for A and B
    const labelA = makeLabel('A', '#88ccff');
    labelA.position.set(-0.8, 1.2, 0.2);
    sceneWorld.add(labelA);
    const labelB = makeLabel('B', '#ffaa66');
    labelB.position.set(0.8, 1.2, 0.2);
    sceneWorld.add(labelB);

    // Overlay groups
    worldOverlay = new THREE.Group(); sceneWorld.add(worldOverlay);
    minkShapeGroup = new THREE.Group(); sceneMink.add(minkShapeGroup);
    minkOverlay = new THREE.Group(); sceneMink.add(minkOverlay);

    infoDiv = document.getElementById('info');

    // Controls — pan/zoom only, left-click reserved for dragging
    controls = new OrbitControls(cameraMink, renderer.domElement);
    controls.enableRotate = false;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
    controls.addEventListener('change', syncCameras);

    raycaster = new THREE.Raycaster();
    mouseNDC = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    setupGUI();
    updateAll();

    window.addEventListener('resize', onResize);
    renderer.setAnimationLoop(animate);
}

function syncCameras() {
    cameraWorld.position.copy(cameraMink.position);
    cameraWorld.zoom = cameraMink.zoom;
    cameraWorld.updateProjectionMatrix();
}

// ============================================================
//  GUI
// ============================================================
function setupGUI() {
    const gui = new GUI();

    const fShape = gui.addFolder('Shapes');
    fShape.add(params, 'shapeA', ['rectangle', 'triangle', 'pentagon', 'hexagon']).name('Shape A').onChange(rebuildPolygons);
    fShape.add(params, 'shapeB', ['rectangle', 'triangle', 'pentagon', 'hexagon']).name('Shape B').onChange(rebuildPolygons);
    fShape.add(params, 'rotA', -Math.PI, Math.PI, 0.02).name('Rotation A').onChange(() => { polyA.rotation = params.rotA; updateAll(); });
    fShape.add(params, 'rotB', -Math.PI, Math.PI, 0.02).name('Rotation B').onChange(() => { polyB.rotation = params.rotB; updateAll(); });

    const fViz = gui.addFolder('GJK Visualization');
    fViz.add(params, 'currentStep', 0, 30, 1).name('Step').listen().onChange(updateAll);
    fViz.add(params, 'showMinkowski').name('Show A⊖B shape').onChange(updateAll);
    fViz.add(params, 'showSupportLines').name('Support lines').onChange(updateAll);
    fViz.add(params, 'autoPlay').name('Auto-play');
    fViz.add(params, 'autoSpeed', 0.2, 3, 0.1).name('Auto speed');

    const fNav = gui.addFolder('Navigation');
    fNav.add({ prev: () => { if (gjkResult) { params.currentStep = Math.max(0, params.currentStep - 1); updateAll(); } } }, 'prev').name('◀ Prev step');
    fNav.add({ next: () => { if (gjkResult) { params.currentStep = Math.min(gjkResult.steps.length - 1, params.currentStep + 1); updateAll(); } } }, 'next').name('Next step ▶');
    fNav.add({ reset: () => {
        polyA.position.set(-0.8, 0); polyB.position.set(0.8, 0);
        params.rotA = 0; params.rotB = 0.4; params.currentStep = 0;
        rebuildPolygons();
    } }, 'reset').name('Reset');
}

// ============================================================
//  REBUILD / UPDATE
// ============================================================
function rebuildPolygons() {
    sceneWorld.remove(polyAMesh); polyAMesh.geometry.dispose(); polyAMesh.material.dispose();
    sceneWorld.remove(polyBMesh); polyBMesh.geometry.dispose(); polyBMesh.material.dispose();
    polyA.vertices = makeShape(params.shapeA);
    polyB.vertices = makeShape(params.shapeB);
    polyA.rotation = params.rotA;
    polyB.rotation = params.rotB;
    polyAMesh = makePolyMesh(polyA, C.A);
    polyBMesh = makePolyMesh(polyB, C.B);
    sceneWorld.add(polyAMesh, polyBMesh);
    updateAll();
}

function updateTransforms() {
    polyAMesh.position.set(polyA.position.x, polyA.position.y, 0);
    polyAMesh.rotation.z = polyA.rotation;
    polyBMesh.position.set(polyB.position.x, polyB.position.y, 0);
    polyBMesh.rotation.z = polyB.rotation;
}

function updateAll() {
    updateTransforms();
    gjkResult = runGJK(polyA, polyB);
    if (gjkResult.steps.length > 0)
        params.currentStep = Math.min(params.currentStep, gjkResult.steps.length - 1);
    updateMinkowskiShape();
    updateStepViz();
    updateInfo();
}

// ============================================================
//  MINKOWSKI DIFFERENCE SHAPE (full, for reference)
// ============================================================
function updateMinkowskiShape() {
    clearGroup(minkShapeGroup);
    minkShapeGroup.visible = params.showMinkowski;
    if (!params.showMinkowski) return;

    const hull = minkowskiDifference(polyA, polyB);
    if (hull.length < 3) return;

    const shape = new THREE.Shape(hull);
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillMat = new THREE.MeshBasicMaterial({ color: C.minkFill, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(fillGeo, fillMat);
    mesh.position.z = 0.001;
    minkShapeGroup.add(mesh);

    const edgePts = hull.map(v => new THREE.Vector3(v.x, v.y, 0.002));
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
    const edges = new THREE.LineLoop(edgeGeo, new THREE.LineBasicMaterial({ color: C.minkEdge, linewidth: 2 }));
    minkShapeGroup.add(edges);

    // Label
    const label = makeLabel('A⊖B', '#ccaa77');
    const centroid = hull.reduce((s, v) => s.add(v), new THREE.Vector2()).multiplyScalar(1 / hull.length);
    label.position.set(centroid.x, centroid.y, 0.15);
    minkShapeGroup.add(label);
}

// ============================================================
//  STEP VISUALIZATION — the heart of the GJK visualizer
// ============================================================
function updateStepViz() {
    clearGroup(worldOverlay);
    clearGroup(minkOverlay);
    if (!gjkResult || gjkResult.steps.length === 0) return;

    const idx = Math.min(params.currentStep, gjkResult.steps.length - 1);
    // Show all steps up to current to build up the picture
    const visibleSteps = gjkResult.steps.slice(0, idx + 1);

    // Collect all simplex points and support points from visible steps
    let lastSupportStep = null;
    let lastDirStep = null;
    let currentSimplex = [];
    let currentDir = null;

    for (const step of visibleSteps) {
        if (step.type === 'init' || step.type === 'update_dir' || step.type === 'update_simplex') {
            currentDir = step.d;
        }
        if (step.type === 'support') {
            lastSupportStep = step;
            currentSimplex = step.simplex;
        }
        if (step.type === 'update_simplex') {
            currentSimplex = step.newSimplex || step.simplex;
            currentDir = step.d;
        }
        if (step.type === 'collision' || step.type === 'no_collision') {
            currentSimplex = step.simplex;
        }
    }

    // --- WORLD SPACE: show support function visualization ---
    if (lastSupportStep && params.showSupportLines) {
        const { supportA, supportB, d } = lastSupportStep;
        const vA = worldVertices(polyA);
        const vB = worldVertices(polyB);
        const dNeg = d.clone().negate();

        // For each shape, draw a line through its center in direction d,
        // then projection lines from each vertex to that line.
        // The support vertex (max projection) is highlighted in yellow.

        // --- Shape A: support in direction d ---
        drawSupportProjection(worldOverlay, vA, polyA.position, d, supportA, C.A, C.support);
        // Direction arrow d from A's support vertex
        worldOverlay.add(makeArrow2D(d, supportA, C.dir, 1.0, 0.08));

        // --- Shape B: support in direction -d ---
        drawSupportProjection(worldOverlay, vB, polyB.position, dNeg, supportB, C.B, C.support);
        // Direction arrow -d from B's support vertex
        worldOverlay.add(makeArrow2D(dNeg, supportB, C.dir, 1.0, 0.08));

        // Dashed line connecting the two support vertices (shows the Minkowski point = A - B)
        worldOverlay.add(makeDashedLine(supportA, supportB, 0xaaaaaa, 0.04));
    }

    // --- MINKOWSKI SPACE: show simplex, support point, direction ---

    // Draw all previous support points as faded dots (history)
    const seenPoints = new Set();
    for (const step of visibleSteps) {
        if (step.type === 'support' && step.supportPoint) {
            const key = `${step.supportPoint.x.toFixed(3)},${step.supportPoint.y.toFixed(3)}`;
            if (!seenPoints.has(key)) {
                seenPoints.add(key);
                const isLast = step === lastSupportStep;
                const dot = makeDot(step.supportPoint, isLast ? C.support : 0x886600,
                                    isLast ? 0.1 : 0.06, isLast ? 0.06 : 0.04);
                if (!isLast) { dot.material.opacity = 0.4; dot.material.transparent = true; }
                minkOverlay.add(dot);
            }
        }
    }

    // Draw simplex (lines + filled if triangle)
    if (currentSimplex.length >= 2) {
        const linePts = currentSimplex.map(p => new THREE.Vector3(p.x, p.y, 0.05));
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
        const lineMat = new THREE.LineBasicMaterial({ color: C.simplex, linewidth: 3 });
        if (currentSimplex.length === 3) {
            minkOverlay.add(new THREE.LineLoop(lineGeo, lineMat));
        } else {
            minkOverlay.add(new THREE.Line(lineGeo, lineMat));
        }

        // Filled triangle
        if (currentSimplex.length === 3) {
            const triShape = new THREE.Shape(currentSimplex);
            const triGeo = new THREE.ShapeGeometry(triShape);
            const triMat = new THREE.MeshBasicMaterial({ color: C.simplex, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
            const tri = new THREE.Mesh(triGeo, triMat);
            tri.position.z = 0.045;
            minkOverlay.add(tri);
        }
    }

    // Simplex vertex dots (green, prominent)
    for (const p of currentSimplex) {
        minkOverlay.add(makeDot(p, C.simplex, 0.08, 0.07));
    }

    // Current direction arrow (from origin)
    if (currentDir) {
        minkOverlay.add(makeArrow2D(currentDir, new THREE.Vector2(0, 0), C.dir, 1.5, 0.08));
    }

    // If last support step, draw line from origin to support point (S·d check)
    if (lastSupportStep) {
        const sp = lastSupportStep.supportPoint;
        minkOverlay.add(makeDashedLine(new THREE.Vector2(0, 0), sp, 0x888888, 0.03));

        // If no_collision step, show the "S·d < 0" visualization
        const lastStep = visibleSteps[visibleSteps.length - 1];
        if (lastStep.type === 'no_collision') {
            // Red X near origin or red highlight on the support point
            const xMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
            const xGeo = new THREE.RingGeometry(0.12, 0.16, 16);
            const ring = new THREE.Mesh(xGeo, xMat);
            ring.position.set(sp.x, sp.y, 0.09);
            minkOverlay.add(ring);
        }
    }

    // Collision result — green highlight on origin
    const lastStep = visibleSteps[visibleSteps.length - 1];
    if (lastStep.type === 'collision') {
        const ringGeo = new THREE.RingGeometry(0.15, 0.22, 24);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
        ring.position.set(0, 0, 0.12);
        minkOverlay.add(ring);
    }
}

// ============================================================
//  INFO OVERLAY
// ============================================================
function updateInfo() {
    if (!gjkResult) return;
    const steps = gjkResult.steps;
    const idx = Math.min(params.currentStep, steps.length - 1);
    const step = steps[idx];

    let html = `<b style="font-size:15px">GJK — Gilbert-Johnson-Keerthi</b><br>`;
    html += `<span style="color:#aaa">Step ${idx + 1} / ${steps.length}</span><br><br>`;

    // Step type badge
    const typeColors = {
        init: '#aaa', support: '#ff0', update_dir: '#f0f',
        update_simplex: '#0f0', collision: '#0f0', no_collision: '#f44'
    };
    const typeLabels = {
        init: 'INIT', support: 'SUPPORT', update_dir: 'UPDATE DIR',
        update_simplex: 'UPDATE SIMPLEX', collision: 'COLLISION', no_collision: 'NO COLLISION'
    };
    html += `<b style="color:${typeColors[step.type] || '#fff'}">[${typeLabels[step.type] || step.type}]</b><br>`;
    html += step.description || '';

    // Show support details
    if (step.supportPoint) {
        html += `<br><br><span style="color:#aaa">Support point (Minkowski):</span><br>`;
        html += `&nbsp;&nbsp;S = (${step.supportPoint.x.toFixed(2)}, ${step.supportPoint.y.toFixed(2)})<br>`;
        html += `<span style="color:#44aaff">S_A(d) = A vertex (${step.supportA.x.toFixed(2)}, ${step.supportA.y.toFixed(2)})</span><br>`;
        html += `<span style="color:#ff8844">S_B(-d) = B vertex (${step.supportB.x.toFixed(2)}, ${step.supportB.y.toFixed(2)})</span><br>`;
        if (step.d) {
            const sDotD = step.supportPoint.x * step.d.x + step.supportPoint.y * step.d.y;
            html += `<span style="color:#aaa">S·d = ${sDotD.toFixed(2)}</span> `;
            html += sDotD < 0 ? `<span style="color:#f44">→ origin not reachable</span>` : `<span style="color:#0f0">→ passes origin ✓</span>`;
        }
    }

    // Show simplex state
    if (step.simplex && step.simplex.length > 0) {
        html += `<br><br><span style="color:#aaa">Simplex (${step.simplex.length} pts):</span><br>`;
        for (let i = 0; i < step.simplex.length; i++) {
            html += `&nbsp;&nbsp;[${i}] (${step.simplex[i].x.toFixed(2)}, ${step.simplex[i].y.toFixed(2)})<br>`;
        }
    }

    // Final result
    html += `<br><b>Result: </b>`;
    if (gjkResult.collide) {
        html += `<b style="color:#0f8">COLLISION</b><br>`;
        html += `<span style="color:#aaa">Origin is inside A⊖B</span><br>`;
        html += `<span style="color:#888;font-size:11px">(Use EPA for normal & depth)</span>`;
    } else {
        html += `<b style="color:#f44">NO COLLISION</b><br>`;
        html += `<span style="color:#aaa">Origin is outside A⊖B</span>`;
    }

    html += `<br><br><i style="color:#888;font-size:11px">Drag polygons to move • Middle-drag pan • Scroll zoom</i>`;
    infoDiv.innerHTML = html;
}

// ============================================================
//  DRAG INTERACTION
// ============================================================
// Compute NDC relative to the LEFT half of the screen (world viewport)
function updateMouseNDCWorld(e) {
    const halfW = window.innerWidth / 2;
    const h = window.innerHeight;
    mouseNDC.x = (e.clientX / halfW) * 2 - 1;
    mouseNDC.y = -((e.clientY) / h) * 2 + 1;
}

function raycastToPlane(camera) {
    raycaster.setFromCamera(mouseNDC, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const point = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, point);
    return new THREE.Vector2(point.x, point.y);
}

function onPointerDown(e) {
    if (e.button !== 0) return;
    // Only drag from left half of screen (world view)
    if (e.clientX > window.innerWidth / 2) return;
    updateMouseNDCWorld(e);
    const point = raycastToPlane(cameraWorld);
    if (!point) return;
    if (pointInPolygon(point, worldVertices(polyA))) {
        dragTarget = polyA;
        dragOffset.set(polyA.position.x - point.x, polyA.position.y - point.y);
        controls.enabled = false;
        renderer.domElement.style.cursor = 'grabbing';
    } else if (pointInPolygon(point, worldVertices(polyB))) {
        dragTarget = polyB;
        dragOffset.set(polyB.position.x - point.x, polyB.position.y - point.y);
        controls.enabled = false;
        renderer.domElement.style.cursor = 'grabbing';
    }
}

function onPointerMove(e) {
    if (dragTarget) {
        updateMouseNDCWorld(e);
        const point = raycastToPlane(cameraWorld);
        if (!point) return;
        dragTarget.position.set(point.x + dragOffset.x, point.y + dragOffset.y);
        updateAll();
        return;
    }
    // Hover cursor: show grab hand when over a polygon in the world view
    if (e.clientX <= window.innerWidth / 2) {
        updateMouseNDCWorld(e);
        const point = raycastToPlane(cameraWorld);
        if (point && (pointInPolygon(point, worldVertices(polyA)) || pointInPolygon(point, worldVertices(polyB)))) {
            renderer.domElement.style.cursor = 'grab';
        } else {
            renderer.domElement.style.cursor = 'default';
        }
    } else {
        renderer.domElement.style.cursor = 'default';
    }
}

function onPointerUp() {
    dragTarget = null;
    controls.enabled = true;
    renderer.domElement.style.cursor = 'default';
}

// ============================================================
//  ANIMATION LOOP — dual viewport rendering
// ============================================================
function animate() {
    if (params.autoPlay && gjkResult && gjkResult.steps.length > 0) {
        autoAccum += 1 / 60 * params.autoSpeed;
        if (autoAccum >= 1.0) {
            autoAccum = 0;
            params.currentStep = (params.currentStep + 1) % gjkResult.steps.length;
            updateAll();
        }
    }

    const w = window.innerWidth, h = window.innerHeight;
    const halfW = Math.floor(w / 2);

    // Left viewport — World space
    renderer.setScissor(0, 0, halfW, h);
    renderer.setViewport(0, 0, halfW, h);
    cameraWorld.aspect = halfW / h;
    cameraWorld.updateProjectionMatrix();
    renderer.render(sceneWorld, cameraWorld);

    // Right viewport — Minkowski space
    renderer.setScissor(halfW, 0, w - halfW, h);
    renderer.setViewport(halfW, 0, w - halfW, h);
    cameraMink.aspect = (w - halfW) / h;
    cameraMink.updateProjectionMatrix();
    renderer.render(sceneMink, cameraMink);
}

function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    // Camera aspect updated in animate()
}
