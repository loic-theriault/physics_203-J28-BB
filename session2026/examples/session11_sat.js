import * as THREE from 'three';
import { OrbitControls } from 'jsm/controls/OrbitControls.js';
import { GUI } from 'https://unpkg.com/lil-gui@0.20.0/dist/lil-gui.esm.min.js';

// ============================================================
//  COLORS
// ============================================================
const C = {
    A:       0x44aaff,
    B:       0xff8844,
    axisCur: 0xffff00,
    gap:     0x00ff00,
    overlap: 0xff00ff,
    contact: 0x00ff88,
    projLn:  0x999999,
    grid:    0x333355,
    axisLn:  0x666688,
};

// ============================================================
//  PARAMETERS
// ============================================================
const params = {
    shapeA: 'rectangle',
    shapeB: 'rectangle',
    rotA: 0.0,
    rotB: 0.35,
    currentAxis: 0,
    showAllAxes: true,
    showProjLines: true,
    showVertexDots: true,
    autoPlay: false,
    autoSpeed: 0.8,
};

let camera, scene, renderer, controls;
let polyA, polyB;
let polyAMesh, polyBMesh;
let axisVizGroup, allAxesGroup, resultGroup, vertexDotsGroup;
let satResult = null;
let raycaster, mouseNDC;
let dragTarget = null;
let dragOffset = new THREE.Vector2();
let infoDiv;
let autoAccum = 0;
let gui;

// ============================================================
//  GEOMETRY — Shape definitions (local space, centered at origin)
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

// Transform local vertices to world space
function worldVertices(poly) {
    const c = Math.cos(poly.rotation), s = Math.sin(poly.rotation);
    return poly.vertices.map(v => new THREE.Vector2(
        v.x * c - v.y * s + poly.position.x,
        v.x * s + v.y * c + poly.position.y
    ));
}

// Face normals (perpendicular to each edge) — the SAT candidate axes
function faceNormals(verts) {
    const axes = [];
    const n = verts.length;
    for (let i = 0; i < n; i++) {
        const e1 = verts[i], e2 = verts[(i + 1) % n];
        const edge = new THREE.Vector2().subVectors(e2, e1);
        axes.push(new THREE.Vector2(-edge.y, edge.x).normalize());
    }
    return axes;
}

// Project all vertices onto an axis → returns interval [min, max]
function project(verts, axis) {
    let min = Infinity, max = -Infinity;
    for (const v of verts) {
        const p = v.x * axis.x + v.y * axis.y;
        if (p < min) min = p;
        if (p > max) max = p;
    }
    return { min, max };
}

// ============================================================
//  SAT ALGORITHM
// ============================================================
function runSAT(polyA, polyB) {
    const vA = worldVertices(polyA);
    const vB = worldVertices(polyB);
    const axesA = faceNormals(vA);
    const axesB = faceNormals(vB);
    const allAxes = [
        ...axesA.map(a => ({ axis: a, owner: 'A' })),
        ...axesB.map(a => ({ axis: a, owner: 'B' })),
    ];

    const results = [];
    let minOverlap = Infinity, minAxis = null, minIndex = -1;

    for (let i = 0; i < allAxes.length; i++) {
        const { axis, owner } = allAxes[i];
        const projA = project(vA, axis);
        const projB = project(vB, axis);
        const overlap = Math.min(projA.max, projB.max) - Math.max(projA.min, projB.min);
        const separates = overlap < 0;
        results.push({ axis, owner, projA, projB, overlap, separates });
        if (!separates && overlap < minOverlap) {
            minOverlap = overlap;
            minAxis = axis;
            minIndex = i;
        }
    }

    const collide = !results.some(r => r.separates);
    return { collide, minOverlap: collide ? minOverlap : 0,
             minAxis: collide ? minAxis : null, minIndex,
             axes: results, vA, vB };
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

// Thick bar (cylinder) between two 3D points
function makeBar(start, end, color, radius = 0.07) {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = Math.max(dir.length(), 0.001);
    const geo = new THREE.CylinderGeometry(radius, radius, len, 12);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
}

function makePolyMesh(poly, color) {
    const shape = new THREE.Shape(poly.vertices);
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(fillGeo, fillMat);

    // Edge outline
    const edgePts = poly.vertices.map(v => new THREE.Vector3(v.x, v.y, 0.001));
    const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
    const edges = new THREE.LineLoop(edgeGeo, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    mesh.add(edges);

    mesh.position.set(poly.position.x, poly.position.y, 0);
    mesh.rotation.z = poly.rotation;
    return mesh;
}

// Point-in-polygon test (ray casting)
function pointInPolygon(p, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        if ((verts[i].y > p.y) !== (verts[j].y > p.y) &&
            p.x < (verts[j].x - verts[i].x) * (p.y - verts[i].y) / (verts[j].y - verts[i].y) + verts[i].x)
            inside = !inside;
    }
    return inside;
}

// ============================================================
//  INIT
// ============================================================
init();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const aspect = window.innerWidth / window.innerHeight;
    const frustum = 9;
    camera = new THREE.OrthographicCamera(
        -frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 100
    );
    camera.position.set(0, 0, 20);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Grid for spatial reference
    const grid = new THREE.GridHelper(24, 48, C.grid, 0x222238);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.05;
    scene.add(grid);

    // Polygons (data = source of truth)
    polyA = { vertices: makeShape(params.shapeA), position: new THREE.Vector2(-1.8, 0), rotation: params.rotA };
    polyB = { vertices: makeShape(params.shapeB), position: new THREE.Vector2(1.8, 0),  rotation: params.rotB };

    polyAMesh = makePolyMesh(polyA, C.A);
    polyBMesh = makePolyMesh(polyB, C.B);
    scene.add(polyAMesh, polyBMesh);

    // Visualization groups (z-layered)
    allAxesGroup    = new THREE.Group(); scene.add(allAxesGroup);    // z ~ 0.015
    vertexDotsGroup = new THREE.Group(); scene.add(vertexDotsGroup); // z ~ 0.02
    axisVizGroup    = new THREE.Group(); scene.add(axisVizGroup);    // z ~ 0.01–0.04
    resultGroup     = new THREE.Group(); scene.add(resultGroup);     // z ~ 0.05

    // Info overlay
    infoDiv = document.getElementById('info');

    // Controls — LEFT reserved for polygon drag
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    controls.target.set(0, 0, 0);

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

// ============================================================
//  GUI
// ============================================================
function setupGUI() {
    gui = new GUI();

    const fShape = gui.addFolder('Shapes');
    fShape.add(params, 'shapeA', ['rectangle', 'triangle', 'pentagon', 'hexagon']).name('Shape A').onChange(rebuildPolygons);
    fShape.add(params, 'shapeB', ['rectangle', 'triangle', 'pentagon', 'hexagon']).name('Shape B').onChange(rebuildPolygons);
    fShape.add(params, 'rotA', -Math.PI, Math.PI, 0.02).name('Rotation A').onChange(() => { polyA.rotation = params.rotA; updateAll(); });
    fShape.add(params, 'rotB', -Math.PI, Math.PI, 0.02).name('Rotation B').onChange(() => { polyB.rotation = params.rotB; updateAll(); });

    const fViz = gui.addFolder('SAT Visualization');
    fViz.add(params, 'currentAxis', 0, 12, 1).name('Axis step').listen().onChange(updateAll);
    fViz.add(params, 'showAllAxes').name('Show all axes').onChange(updateAll);
    fViz.add(params, 'showProjLines').name('Projection lines').onChange(updateAll);
    fViz.add(params, 'showVertexDots').name('Vertex dots').onChange(updateAll);
    fViz.add(params, 'autoPlay').name('Auto-play');
    fViz.add(params, 'autoSpeed', 0.1, 3, 0.1).name('Auto speed');

    const fNav = gui.addFolder('Navigation');
    fNav.add({ prev: () => { if (satResult) { params.currentAxis = Math.max(0, params.currentAxis - 1); updateAll(); } } }, 'prev').name('◀ Prev axis');
    fNav.add({ next: () => { if (satResult) { params.currentAxis = Math.min(satResult.axes.length - 1, params.currentAxis + 1); updateAll(); } } }, 'next').name('Next axis ▶');
    fNav.add({ reset: () => {
        polyA.position.set(-1.8, 0); polyB.position.set(1.8, 0);
        params.rotA = 0; params.rotB = 0.35; params.currentAxis = 0;
        rebuildPolygons();
    } }, 'reset').name('Reset positions');
}

// ============================================================
//  REBUILD (shape change) vs UPDATE (transform change)
// ============================================================
function rebuildPolygons() {
    scene.remove(polyAMesh); polyAMesh.geometry.dispose(); polyAMesh.material.dispose();
    scene.remove(polyBMesh); polyBMesh.geometry.dispose(); polyBMesh.material.dispose();
    polyA.vertices = makeShape(params.shapeA);
    polyB.vertices = makeShape(params.shapeB);
    polyA.rotation = params.rotA;
    polyB.rotation = params.rotB;
    polyAMesh = makePolyMesh(polyA, C.A);
    polyBMesh = makePolyMesh(polyB, C.B);
    scene.add(polyAMesh, polyBMesh);
    updateAll();
}

function updateTransforms() {
    polyAMesh.position.set(polyA.position.x, polyA.position.y, 0);
    polyAMesh.rotation.z = polyA.rotation;
    polyBMesh.position.set(polyB.position.x, polyB.position.y, 0);
    polyBMesh.rotation.z = polyB.rotation;
}

// ============================================================
//  MAIN UPDATE — runs SAT and refreshes all visualization
// ============================================================
function updateAll() {
    updateTransforms();
    satResult = runSAT(polyA, polyB);

    // Clamp current axis
    if (satResult.axes.length > 0)
        params.currentAxis = Math.min(params.currentAxis, satResult.axes.length - 1);

    updateAllAxesViz();
    updateVertexDots();
    updateAxisStepViz();
    updateResultViz();
    updateInfo();
}

// ============================================================
//  SHOW ALL CANDIDATE AXES (face normals)
// ============================================================
function updateAllAxesViz() {
    clearGroup(allAxesGroup);
    allAxesGroup.visible = params.showAllAxes;
    if (!params.showAllAxes || !satResult) return;

    for (let i = 0; i < satResult.axes.length; i++) {
        const { axis, owner } = satResult.axes[i];
        const isCurrent = i === params.currentAxis;
        const color = isCurrent ? C.axisCur : (owner === 'A' ? C.A : C.B);
        const origin = owner === 'A' ? polyA.position : polyB.position;
        const len = isCurrent ? 1.8 : 1.3;
        const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(axis.x, axis.y, 0),
            new THREE.Vector3(origin.x, origin.y, 0.015),
            len, color, isCurrent ? 0.25 : 0.18, isCurrent ? 0.15 : 0.1
        );
        allAxesGroup.add(arrow);
    }
}

// ============================================================
//  VERTEX DOTS (on the polygons)
// ============================================================
function updateVertexDots() {
    clearGroup(vertexDotsGroup);
    vertexDotsGroup.visible = params.showVertexDots;
    if (!params.showVertexDots || !satResult) return;

    for (const v of satResult.vA) {
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 12, 12),
            new THREE.MeshBasicMaterial({ color: C.A })
        );
        dot.position.set(v.x, v.y, 0.02);
        vertexDotsGroup.add(dot);
    }
    for (const v of satResult.vB) {
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 12, 12),
            new THREE.MeshBasicMaterial({ color: C.B })
        );
        dot.position.set(v.x, v.y, 0.02);
        vertexDotsGroup.add(dot);
    }
}

// ============================================================
//  CURRENT AXIS STEP — the heart of the visualization
//  Shows: axis line, projection lines, interval bars, gap/overlap
// ============================================================
function updateAxisStepViz() {
    clearGroup(axisVizGroup);
    if (!satResult || satResult.axes.length === 0) return;
    const idx = Math.min(params.currentAxis, satResult.axes.length - 1);
    if (idx < 0) return;

    const { axis, owner, projA, projB, overlap, separates } = satResult.axes[idx];

    // Midpoint between polygon centers — axis line passes through here
    const mid = new THREE.Vector2(
        (polyA.position.x + polyB.position.x) / 2,
        (polyA.position.y + polyB.position.y) / 2
    );

    // Perpendicular offset for interval bars (so A and B bars don't overlap)
    const perp = new THREE.Vector2(-axis.y, axis.x);
    const aOff = 0.15, bOff = -0.15;

    // --- Compute projection extent for axis line length ---
    const allP = [...satResult.vA, ...satResult.vB].map(v => v.x * axis.x + v.y * axis.y);
    const pMin = Math.min(...allP), pMax = Math.max(...allP);
    const pad = (pMax - pMin) * 0.25 + 0.8;
    const lineMin = pMin - pad, lineMax = pMax + pad;

    // --- Axis line (dashed) ---
    const axisLineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(mid.x + lineMin * axis.x, mid.y + lineMin * axis.y, 0.008),
        new THREE.Vector3(mid.x + lineMax * axis.x, mid.y + lineMax * axis.y, 0.008),
    ]);
    const axisLineMat = new THREE.LineDashedMaterial({ color: C.axisLn, dashSize: 0.18, gapSize: 0.12 });
    const axisLine = new THREE.Line(axisLineGeo, axisLineMat);
    axisLine.computeLineDistances();
    axisVizGroup.add(axisLine);

    // --- Axis direction arrow (yellow) ---
    const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(axis.x, axis.y, 0),
        new THREE.Vector3(mid.x, mid.y, 0.01),
        1.5, C.axisCur, 0.28, 0.18
    );
    axisVizGroup.add(arrow);

    // --- Projection lines (vertex → its projection on axis) ---
    if (params.showProjLines) {
        const projMatA = new THREE.LineBasicMaterial({ color: C.A, transparent: true, opacity: 0.35 });
        const projMatB = new THREE.LineBasicMaterial({ color: C.B, transparent: true, opacity: 0.35 });
        for (const v of satResult.vA) {
            const p = v.x * axis.x + v.y * axis.y;
            const projPt = new THREE.Vector3(mid.x + p * axis.x, mid.y + p * axis.y, 0.006);
            const vPt = new THREE.Vector3(v.x, v.y, 0.006);
            axisVizGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([vPt, projPt]), projMatA));
        }
        for (const v of satResult.vB) {
            const p = v.x * axis.x + v.y * axis.y;
            const projPt = new THREE.Vector3(mid.x + p * axis.x, mid.y + p * axis.y, 0.006);
            const vPt = new THREE.Vector3(v.x, v.y, 0.006);
            axisVizGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([vPt, projPt]), projMatB));
        }
    }

    // --- Interval bars (thick cylinders along the axis) ---
    const aBarS = new THREE.Vector3(mid.x + projA.min * axis.x + perp.x * aOff, mid.y + projA.min * axis.y + perp.y * aOff, 0.025);
    const aBarE = new THREE.Vector3(mid.x + projA.max * axis.x + perp.x * aOff, mid.y + projA.max * axis.y + perp.y * aOff, 0.025);
    const bBarS = new THREE.Vector3(mid.x + projB.min * axis.x + perp.x * bOff, mid.y + projB.min * axis.y + perp.y * bOff, 0.025);
    const bBarE = new THREE.Vector3(mid.x + projB.max * axis.x + perp.x * bOff, mid.y + projB.max * axis.y + perp.y * bOff, 0.025);
    axisVizGroup.add(makeBar(aBarS, aBarE, C.A, 0.06));
    axisVizGroup.add(makeBar(bBarS, bBarE, C.B, 0.06));

    // --- Projected vertex dots on the bars ---
    for (const v of satResult.vA) {
        const p = v.x * axis.x + v.y * axis.y;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), new THREE.MeshBasicMaterial({ color: C.A }));
        dot.position.set(mid.x + p * axis.x + perp.x * aOff, mid.y + p * axis.y + perp.y * aOff, 0.04);
        axisVizGroup.add(dot);
    }
    for (const v of satResult.vB) {
        const p = v.x * axis.x + v.y * axis.y;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), new THREE.MeshBasicMaterial({ color: C.B }));
        dot.position.set(mid.x + p * axis.x + perp.x * bOff, mid.y + p * axis.y + perp.y * bOff, 0.04);
        axisVizGroup.add(dot);
    }

    // --- Gap or Overlap highlight ---
    if (separates) {
        // Gap between the intervals
        let gS, gE;
        if (projA.max < projB.min) { gS = projA.max; gE = projB.min; }
        else { gS = projB.max; gE = projA.min; }
        const gs = new THREE.Vector3(mid.x + gS * axis.x, mid.y + gS * axis.y, 0.035);
        const ge = new THREE.Vector3(mid.x + gE * axis.x, mid.y + gE * axis.y, 0.035);
        axisVizGroup.add(makeBar(gs, ge, C.gap, 0.045));
        // "GAP" indicator — small green sphere at gap center
        const gapC = new THREE.Vector3((gs.x + ge.x) / 2, (gs.y + ge.y) / 2, 0.045);
        const gapDot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), new THREE.MeshBasicMaterial({ color: C.gap }));
        gapDot.position.copy(gapC);
        axisVizGroup.add(gapDot);
    } else {
        // Overlap region
        const oS = Math.max(projA.min, projB.min);
        const oE = Math.min(projA.max, projB.max);
        const os = new THREE.Vector3(mid.x + oS * axis.x, mid.y + oS * axis.y, 0.035);
        const oe = new THREE.Vector3(mid.x + oE * axis.x, mid.y + oE * axis.y, 0.035);
        axisVizGroup.add(makeBar(os, oe, C.overlap, 0.04));
    }
}

// ============================================================
//  RESULT — contact normal + penetration depth (if colliding)
// ============================================================
function updateResultViz() {
    clearGroup(resultGroup);
    if (!satResult || !satResult.collide || !satResult.minAxis) return;

    const mid = new THREE.Vector2(
        (polyA.position.x + polyB.position.x) / 2,
        (polyA.position.y + polyB.position.y) / 2
    );
    const axis = satResult.minAxis;

    // Contact normal arrow (teal, thicker)
    const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(axis.x, axis.y, 0),
        new THREE.Vector3(mid.x, mid.y, 0.05),
        2.2, C.contact, 0.3, 0.2
    );
    resultGroup.add(arrow);

    // Penetration depth bar (teal, short, perpendicular to normal for visibility)
    // Draw it along the normal at the midpoint
    const depthBarS = new THREE.Vector3(mid.x, mid.y, 0.055);
    const depthBarE = new THREE.Vector3(mid.x + axis.x * satResult.minOverlap, mid.y + axis.y * satResult.minOverlap, 0.055);
    resultGroup.add(makeBar(depthBarS, depthBarE, C.contact, 0.04));
}

// ============================================================
//  INFO OVERLAY
// ============================================================
function updateInfo() {
    if (!satResult) return;
    const n = satResult.axes.length;
    const i = Math.min(params.currentAxis, n - 1);
    const nA = satResult.axes.filter(a => a.owner === 'A').length;
    const nB = satResult.axes.filter(a => a.owner === 'B').length;

    let html = `<b style="font-size:15px">SAT — Separating Axis Theorem</b><br>`;
    html += `<span style="color:#aaa">Candidate axes: ${n}</span> `;
    html += `<span style="color:#44aaff">A: ${nA}</span> + <span style="color:#ff8844">B: ${nB}</span><br>`;

    if (i >= 0 && i < n) {
        const r = satResult.axes[i];
        const ownerColor = r.owner === 'A' ? '#44aaff' : '#ff8844';
        html += `<br><b>Step ${i + 1} / ${n}</b> — Axis from <span style="color:${ownerColor}">${r.owner}</span><br>`;
        html += `A interval: [${r.projA.min.toFixed(2)}, ${r.projA.max.toFixed(2)}]<br>`;
        html += `B interval: [${r.projB.min.toFixed(2)}, ${r.projB.max.toFixed(2)}]<br>`;
        if (r.separates) {
            html += `Gap = ${(-r.overlap).toFixed(2)} → <b style="color:#0f0">SEPARATING AXIS FOUND</b><br>`;
            html += `<span style="color:#0f0">→ No collision (algorithm stops here)</span>`;
        } else {
            html += `Overlap = ${r.overlap.toFixed(2)} → <span style="color:#f0f">overlaps</span><br>`;
            if (i === satResult.minIndex) {
                html += `<span style="color:#0f8">★ Minimum overlap → contact normal</span>`;
            }
        }
    }

    html += `<br><br><b>Result: </b>`;
    if (satResult.collide) {
        html += `<b style="color:#0f8">COLLISION</b><br>`;
        html += `Contact normal: (${satResult.minAxis.x.toFixed(2)}, ${satResult.minAxis.y.toFixed(2)})<br>`;
        html += `Penetration depth: ${satResult.minOverlap.toFixed(3)}`;
    } else {
        const sepIdx = satResult.axes.findIndex(r => r.separates);
        html += `<b style="color:#f44">NO COLLISION</b><br>`;
        html += `<span style="color:#aaa">Separated at axis ${sepIdx + 1}</span>`;
    }

    html += `<br><br><i style="color:#888;font-size:11px">Drag polygons to move • Right-drag rotate • Scroll zoom</i>`;
    infoDiv.innerHTML = html;
}

// ============================================================
//  DRAG INTERACTION
// ============================================================
function updateMouseNDC(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function raycastToPlane() {
    raycaster.setFromCamera(mouseNDC, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const point = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, point);
    return new THREE.Vector2(point.x, point.y);
}

function onPointerDown(e) {
    if (e.button !== 0) return; // left button only
    updateMouseNDC(e);
    const point = raycastToPlane();
    if (!point) return;
    if (pointInPolygon(point, worldVertices(polyA))) {
        dragTarget = polyA;
        dragOffset.set(polyA.position.x - point.x, polyA.position.y - point.y);
        controls.enabled = false;
    } else if (pointInPolygon(point, worldVertices(polyB))) {
        dragTarget = polyB;
        dragOffset.set(polyB.position.x - point.x, polyB.position.y - point.y);
        controls.enabled = false;
    }
}

function onPointerMove(e) {
    if (!dragTarget) return;
    updateMouseNDC(e);
    const point = raycastToPlane();
    if (!point) return;
    dragTarget.position.set(point.x + dragOffset.x, point.y + dragOffset.y);
    updateAll();
}

function onPointerUp() {
    dragTarget = null;
    controls.enabled = true;
}

// ============================================================
//  ANIMATION LOOP
// ============================================================
function animate() {
    // Auto-play: cycle through axes
    if (params.autoPlay && satResult && satResult.axes.length > 0) {
        autoAccum += 1 / 60 * params.autoSpeed;
        if (autoAccum >= 1.0) {
            autoAccum = 0;
            params.currentAxis = (params.currentAxis + 1) % satResult.axes.length;
            updateAll();
        }
    }
    renderer.render(scene, camera);
}

function onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustum = 9;
    camera.left = -frustum * aspect;
    camera.right = frustum * aspect;
    camera.top = frustum;
    camera.bottom = -frustum;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
