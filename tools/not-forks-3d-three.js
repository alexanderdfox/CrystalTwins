
// ─── 3D RENDERING (hollow pipes) ───────────────────────────────────────────────
const TILE_SIZE = 1.0;
const BOARD_OX = -COLS * TILE_SIZE / 2;
const BOARD_OZ = -ROWS * TILE_SIZE / 2;
const PIPE = { outer: 0.2, inner: 0.115, seg: 16, arm: TILE_SIZE * 0.46 };
const GHOST_LIFT = 0.55;
const ELBOW_R = TILE_SIZE * 0.38;
const ORIENT_STEP_3D = Math.PI / 12;

function applyOrientStepsGroup(group, steps) {
	if (!steps) return;
	group.rotation.order = 'YXZ';
	group.rotation.set(
		steps.pitch * ORIENT_STEP_3D,
		steps.yaw * ORIENT_STEP_3D,
		steps.roll * ORIENT_STEP_3D
	);
}

const viewport = document.getElementById('viewport');
let renderer = null;
let canvas3d = null;
let glReady = false;

const sceneDirty = { board: true, ghost: true };
function markBoardDirty() { sceneDirty.board = true; }
function markGhostDirty() { sceneDirty.ghost = true; }
function markSceneDirty() { sceneDirty.board = true; sceneDirty.ghost = true; }

const SHARED_GEOMS = new Set();
function shareGeom(g) {
	SHARED_GEOMS.add(g);
	return g;
}

const GEOM = {
	hub: shareGeom(new THREE.RingGeometry(PIPE.inner, PIPE.outer, PIPE.seg)),
	cap: shareGeom(new THREE.RingGeometry(PIPE.inner * 1.02, PIPE.outer * 0.98, PIPE.seg)),
	elbow: shareGeom(new THREE.TorusGeometry(
		ELBOW_R, (PIPE.outer - PIPE.inner) * 0.48, 10, PIPE.seg, Math.PI / 2
	)),
	gopher: shareGeom(new THREE.SphereGeometry(0.28, 12, 10)),
	particle: shareGeom(new THREE.SphereGeometry(0.06, 6, 6)),
};

function disposeGroupContents(group) {
	while (group.children.length) {
		const child = group.children[0];
		group.remove(child);
		child.traverse((node) => {
			if (node.geometry && !SHARED_GEOMS.has(node.geometry)) node.geometry.dispose();
		});
	}
}

function createRenderer() {
	glReady = false;
	if (renderer) {
		try { renderer.dispose(); } catch {}
		if (canvas3d?.parentNode) canvas3d.parentNode.removeChild(canvas3d);
		renderer = null;
		canvas3d = null;
	}
	try {
		renderer = new THREE.WebGLRenderer({
			antialias: false,
			alpha: false,
			powerPreference: 'default',
			failIfMajorPerformanceCaveat: false,
		});
	} catch (err) {
		console.warn('WebGL unavailable', err);
		return;
	}
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	renderer.setClearColor(0x08040f);
	renderer.shadowMap.enabled = false;
	canvas3d = renderer.domElement;
	const gl = renderer.getContext();
	if (!gl || gl.isContextLost()) {
		try { renderer.dispose(); } catch {}
		renderer = null;
		canvas3d = null;
		return;
	}

	canvas3d.addEventListener('webglcontextlost', (e) => {
		e.preventDefault();
		glReady = false;
	}, false);
	canvas3d.addEventListener('webglcontextrestored', () => {
		glReady = !renderer.getContext()?.isContextLost();
		if (glReady) {
			markSceneDirty();
			updateScene();
			resize();
		}
	}, false);
	const existing = viewport.querySelector('canvas');
	if (existing && existing !== canvas3d) existing.remove();
	viewport.appendChild(canvas3d);
	glReady = true;
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x08040f, 18, 42);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
const CAM = { dist: 16, yaw: 0.65, pitch: 0.52, targetY: 0.35 };
function updateCamera() {
	const cp = Math.cos(CAM.pitch);
	camera.position.set(
		CAM.dist * Math.sin(CAM.yaw) * cp,
		CAM.dist * Math.sin(CAM.pitch) + CAM.targetY,
		CAM.dist * Math.cos(CAM.yaw) * cp
	);
	camera.lookAt(0, CAM.targetY, 0);
}

scene.add(new THREE.AmbientLight(0x304060, 0.55));
const keyLight = new THREE.DirectionalLight(0xc0e8ff, 1.1);
keyLight.position.set(6, 14, 8);
scene.add(keyLight);
const rim = new THREE.DirectionalLight(0x40d0b0, 0.45);
rim.position.set(-8, 6, -6);
scene.add(rim);

const boardGroup = new THREE.Group();
const ghostGroup = new THREE.Group();
const particleGroup = new THREE.Group();
const floorGroup = new THREE.Group();
scene.add(floorGroup, boardGroup, ghostGroup, particleGroup);

const matPipe = new THREE.MeshStandardMaterial({
	color: 0x28b898, metalness: 0.35, roughness: 0.4,
	emissive: 0x186858, emissiveIntensity: 0.35,
});
const matPipeFlash = new THREE.MeshStandardMaterial({
	color: 0x60f0d0, metalness: 0.4, roughness: 0.3,
	emissive: 0x40e8c8, emissiveIntensity: 0.9,
});
const matInner = new THREE.MeshStandardMaterial({
	color: 0x061210, metalness: 0.1, roughness: 0.85, side: THREE.DoubleSide,
});
const matGhostOk = new THREE.MeshStandardMaterial({
	color: 0x40d0b0, transparent: true, opacity: 0.55,
	emissive: 0x30a888, emissiveIntensity: 0.5,
});
const matGhostBad = new THREE.MeshStandardMaterial({
	color: 0xf05070, transparent: true, opacity: 0.5,
	emissive: 0x802030, emissiveIntensity: 0.4,
});
const matGopher = new THREE.MeshStandardMaterial({
	color: 0xf0c040, metalness: 0.5, roughness: 0.35,
	emissive: 0x806020, emissiveIntensity: 0.6,
});
const matCap = new THREE.MeshStandardMaterial({
	color: 0x80ffe0, emissive: 0x40f0c0, emissiveIntensity: 0.8,
	transparent: true, opacity: 0.85,
});

const hollowGeomCache = new Map();
function hollowTubeGeom(length) {
	const key = length.toFixed(3);
	if (hollowGeomCache.has(key)) return hollowGeomCache.get(key);
	const shape = new THREE.Shape();
	shape.absarc(0, 0, PIPE.outer, 0, Math.PI * 2, false);
	const hole = new THREE.Path();
	hole.absarc(0, 0, PIPE.inner, 0, Math.PI * 2, true);
	shape.holes.push(hole);
	const g = new THREE.ExtrudeGeometry(shape, {
		depth: length, bevelEnabled: false, curveSegments: PIPE.seg, steps: 1,
	});
	g.translate(0, 0, -length / 2);
	shareGeom(g);
	hollowGeomCache.set(key, g);
	return g;
}

const DIR_VEC = {
	[N]: new THREE.Vector3(0, 0, -1),
	[E]: new THREE.Vector3(1, 0, 0),
	[S]: new THREE.Vector3(0, 0, 1),
	[W]: new THREE.Vector3(-1, 0, 0),
};

function orientArm(mesh, dir) {
	const v = DIR_VEC[dir];
	const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v);
	mesh.quaternion.copy(q);
}

function orientAlong(mesh, from, to) {
	const dir = new THREE.Vector3().subVectors(to, from);
	const len = dir.length();
	if (len < 1e-4) return len;
	dir.normalize();
	const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
	mesh.quaternion.copy(q);
	mesh.position.copy(from).addScaledVector(dir, len / 2);
	return len;
}

function isOpposite(d1, d2) {
	return (d1 & OPP[d2]) !== 0;
}

function cellWorldPos(gx, gy, lift = 0) {
	return new THREE.Vector3(
		BOARD_OX + (gx + 0.5) * TILE_SIZE,
		lift,
		BOARD_OZ + (gy + 0.5) * TILE_SIZE
	);
}

function neighborMask(gx, gy, dir) {
	const nx = gx + DIR_DX[dir], ny = gy + DIR_DY[dir];
	if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return 0;
	return board[ny][nx]?.mask ?? 0;
}

function addPortCapAt(group, pos, dir, material) {
	const v = DIR_VEC[dir];
	const ring = new THREE.Mesh(GEOM.cap, material);
	ring.position.copy(pos);
	ring.lookAt(pos.clone().add(v));
	group.add(ring);
}

function addHollowTubeBetween(group, from, to, material) {
	const len = from.distanceTo(to);
	if (len < 1e-4) return;
	const arm = new THREE.Mesh(hollowTubeGeom(len * 0.98), material);
	orientAlong(arm, from, to);
	group.add(arm);
}

function addExternalArm(group, center, dir, material, capMat, showCap) {
	const v = DIR_VEC[dir];
	const len = PIPE.arm;
	const arm = new THREE.Mesh(hollowTubeGeom(len), material);
	arm.position.copy(center).addScaledVector(v, len / 2);
	orientArm(arm, dir);
	group.add(arm);
	if (showCap) {
		const end = center.clone().addScaledVector(v, len);
		addPortCapAt(group, end, dir, capMat);
	}
}

function addElbow(group, center, dir1, dir2, material) {
	const v1 = DIR_VEC[dir1];
	const v2 = DIR_VEC[dir2];
	const torus = new THREE.Mesh(GEOM.elbow, material);
	torus.rotation.x = Math.PI / 2;
	const a1 = Math.atan2(v1.x, v1.z);
	const a2 = Math.atan2(v2.x, v2.z);
	torus.rotation.y = (a1 + a2) / 2 - Math.PI / 4;
	const corner = center.clone().add(
		v1.clone().add(v2).normalize().multiplyScalar(ELBOW_R * 0.65)
	);
	torus.position.copy(corner);
	group.add(torus);
	const hub = new THREE.Mesh(GEOM.hub, material);
	hub.rotation.x = -Math.PI / 2;
	hub.position.copy(center);
	group.add(hub);
}

/** One welded pipe assembly from a set of connected cells. */
function buildUnifiedPipeAssembly(entries, options) {
	const {
		material,
		capMaterial = matCap,
		local = false,
		centerOffset = { cx: 0, cy: 0 },
		showAllCaps = false,
		openPort = null,
	} = options;
	const group = new THREE.Group();
	const map = new Map();

	for (const e of entries) {
		const lx = local ? e.dx - centerOffset.cx : e.gx;
		const ly = local ? e.dy - centerOffset.cy : e.gy;
		map.set(`${lx},${ly}`, { mask: e.mask, lx, ly, gx: e.gx, gy: e.gy });
	}

	const centerAt = (lx, ly) => new THREE.Vector3(
		local ? lx * TILE_SIZE : BOARD_OX + (lx + 0.5) * TILE_SIZE,
		0.04,
		local ? ly * TILE_SIZE : BOARD_OZ + (ly + 0.5) * TILE_SIZE
	);

	const hasPartner = (lx, ly, dir) => {
		const nx = lx + DIR_DX[dir], ny = ly + DIR_DY[dir];
		const p = map.get(`${nx},${ny}`);
		return p && (p.mask & OPP[dir]);
	};

	const segKey = (ax, ay, bx, by) => (ax < bx || (ax === bx && ay < by) ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`);
	const addedSeg = new Set();

	for (const { lx, ly, mask, gx, gy } of map.values()) {
		const c = centerAt(lx, ly);
		const dirs = [N, E, S, W].filter(d => mask & d);

		if (dirs.length === 2 && !isOpposite(dirs[0], dirs[1])) {
			addElbow(group, c, dirs[0], dirs[1], material);
		} else if (dirs.length >= 3) {
			const hub = new THREE.Mesh(GEOM.hub, material);
			hub.rotation.x = -Math.PI / 2;
			hub.position.copy(c);
			group.add(hub);
		}

		for (const dir of dirs) {
			if (hasPartner(lx, ly, dir)) {
				const nx = lx + DIR_DX[dir], ny = ly + DIR_DY[dir];
				const key = segKey(lx, ly, nx, ny);
				if (addedSeg.has(key)) continue;
				addedSeg.add(key);
				addHollowTubeBetween(group, c, centerAt(nx, ny), material);
			} else {
				let cap = showAllCaps;
				if (!cap && openPort) {
					const wx = local ? (gx ?? lx) : lx;
					const wy = local ? (gy ?? ly) : ly;
					cap = openPort(wx, wy, dir);
				}
				addExternalArm(group, c, dir, material, capMaterial, cap);
			}
		}
	}
	return group;
}

function buildPieceMesh(cells, px, py, material, lift) {
	const cen = pieceCenter(cells);
	const entries = cells.map(({ dx, dy, mask }) => ({
		dx, dy, mask, gx: px + dx, gy: py + dy,
	}));
	const group = buildUnifiedPipeAssembly(entries, {
		local: true,
		centerOffset: cen,
		material,
		showAllCaps: true,
	});
	group.position.copy(cellWorldPos(px + cen.cx, py + cen.cy, lift));
	return group;
}

function buildPipeCell(gx, gy, mask, material, isGopher, setWorldPos = true) {
	const group = new THREE.Group();
	if (isGopher) {
		const sphere = new THREE.Mesh(GEOM.gopher, matGopher);
		sphere.position.y = 0.32;
		if (setWorldPos) group.position.copy(cellWorldPos(gx, gy));
		return group;
	}
	const groupMesh = buildUnifiedPipeAssembly([{ gx, gy, mask }], {
		material,
		openPort: (x, y, dir) => !(neighborMask(x, y, dir) & OPP[dir]),
	});
	group.add(groupMesh);
	if (setWorldPos) group.position.set(0, 0, 0);
	return group;
}

function collectPlaceIdGroups() {
	const groups = new Map();
	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			const cell = board[y][x];
			if (!cell?.placeId) continue;
			if (!groups.has(cell.placeId)) groups.set(cell.placeId, []);
			groups.get(cell.placeId).push({ gx: x, gy: y, mask: cell.mask });
		}
	}
	return groups;
}

function syncBoardMeshes() {
	disposeGroupContents(boardGroup);

	const placeGroups = collectPlaceIdGroups();
	const drawnPlace = new Set();

	for (const [pid, entries] of placeGroups) {
		const flash = entries.some(({ gx, gy }) => loopFlashCells.has(`${gx},${gy}`));
		const mesh = buildUnifiedPipeAssembly(entries, {
			material: flash ? matPipeFlash : matPipe,
			openPort: (gx, gy, dir) => !(neighborMask(gx, gy, dir) & OPP[dir]),
		});
		const ref = entries[0];
		const placed = board[ref.gy]?.[ref.gx];
		if (placed?.orientSteps) applyOrientStepsGroup(mesh, placed.orientSteps);
		boardGroup.add(mesh);
		for (const { gx, gy } of entries) drawnPlace.add(`${gx},${gy}`);
	}

	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			if (drawnPlace.has(`${x},${y}`)) continue;
			const cell = board[y][x];
			if (!cell) continue;
			const flash = loopFlashCells.has(`${x},${y}`);
			boardGroup.add(buildPipeCell(x, y, cell.mask, flash ? matPipeFlash : matPipe, false));
		}
	}
}

function applyPieceOrientation(group) {
	if (!piece) return;
	if (piece.orientSteps) applyOrientStepsGroup(group, piece.orientSteps);
	else if (piece.orient) {
		group.rotation.order = 'YXZ';
		group.rotation.set(piece.orient.x, piece.orient.y, piece.orient.z);
	}
}

function updateGhostOrientation() {
	if (!piece || !ghostGroup.children.length) return;
	applyPieceOrientation(ghostGroup.children[0]);
}

function syncGhostMesh() {
	disposeGroupContents(ghostGroup);
	if (!piece || gameState !== State.PLAYING) return;
	const ok = canPlaceCurrent(piece.cells, piece.px, piece.py, piece.def);
	const mat = ok ? matGhostOk : matGhostBad;
	if (piece.def.special === 'gopher') {
		const g = buildPipeCell(piece.px, piece.py, 0, matGopher, true);
		g.position.y = GHOST_LIFT;
		ghostGroup.add(g);
		return;
	}
	const g = buildPieceMesh(piece.cells, piece.px, piece.py, mat, GHOST_LIFT);
	applyPieceOrientation(g);
	ghostGroup.add(g);
}

let floorBuilt = false;
const floorTileMats = [
	new THREE.MeshStandardMaterial({ color: 0x100818, metalness: 0.1, roughness: 0.9 }),
	new THREE.MeshStandardMaterial({ color: 0x0c0610, metalness: 0.1, roughness: 0.9 }),
];
const floorTileGeom = shareGeom(new THREE.BoxGeometry(TILE_SIZE * 0.92, 0.02, TILE_SIZE * 0.92));
const floorPlateGeom = shareGeom(new THREE.BoxGeometry(COLS * TILE_SIZE + 0.4, 0.12, ROWS * TILE_SIZE + 0.4));

function buildFloor() {
	if (floorBuilt) return;
	floorBuilt = true;
	const plate = new THREE.Mesh(
		floorPlateGeom,
		new THREE.MeshStandardMaterial({ color: 0x0a0612, metalness: 0.2, roughness: 0.85 })
	);
	plate.position.set(0, -0.06, 0);
	floorGroup.add(plate);

	const grid = new THREE.GridHelper(COLS * TILE_SIZE, COLS, 0x304050, 0x1a2030);
	grid.position.y = 0.001;
	floorGroup.add(grid);

	for (let y = 0; y < ROWS; y++) {
		for (let x = 0; x < COLS; x++) {
			const tile = new THREE.Mesh(floorTileGeom, floorTileMats[(x + y) % 2]);
			tile.position.copy(cellWorldPos(x, y, 0.01));
			floorGroup.add(tile);
		}
	}
}

let particles3d = [];
function spawnParticles3d(loop) {
	for (const key of loop) {
		const [x, y] = key.split(',').map(Number);
		const p = cellWorldPos(x, y, 0.3);
		for (let i = 0; i < 4; i++) {
			particles3d.push({
				mesh: null,
				x: p.x + (Math.random() - 0.5) * 0.4,
				y: 0.3 + Math.random() * 0.5,
				z: p.z + (Math.random() - 0.5) * 0.4,
				vx: (Math.random() - 0.5) * 0.04,
				vy: 0.02 + Math.random() * 0.03,
				vz: (Math.random() - 0.5) * 0.04,
				life: 1,
			});
		}
	}
	const mat = new THREE.MeshBasicMaterial({ color: 0x80ffe0, transparent: true });
	for (const pt of particles3d.slice(-loop.size * 4)) {
		const m = new THREE.Mesh(GEOM.particle, mat);
		m.position.set(pt.x, pt.y, pt.z);
		particleGroup.add(m);
		pt.mesh = m;
	}
}

function updateParticles(dt) {
	tickParticles();
	for (let i = particles3d.length - 1; i >= 0; i--) {
		const p = particles3d[i];
		p.life -= dt / 600;
		p.y += p.vy * dt * 0.06;
		p.x += p.vx * dt;
		p.z += p.vz * dt;
		if (p.mesh) {
			p.mesh.position.set(p.x, p.y, p.z);
			p.mesh.material.opacity = Math.max(0, p.life);
		}
		if (p.life <= 0) {
			if (p.mesh) {
				particleGroup.remove(p.mesh);
				if (p.mesh.material) p.mesh.material.dispose();
			}
			particles3d.splice(i, 1);
		}
	}
}

function updateScene({ board = true, ghost = true } = {}) {
	if (board) sceneDirty.board = true;
	if (ghost) sceneDirty.ghost = true;
	if (sceneDirty.board) {
		syncBoardMeshes();
		sceneDirty.board = false;
	}
	if (sceneDirty.ghost) {
		syncGhostMesh();
		sceneDirty.ghost = false;
	} else {
		updateGhostOrientation();
	}
}

function refreshGhostMaterial() {
	if (!piece || gameState !== State.PLAYING) return;
	const ok = canPlaceCurrent(piece.cells, piece.px, piece.py, piece.def);
	const want = ok ? matGhostOk : matGhostBad;
	const g = ghostGroup.children[0];
	if (!g) {
		markGhostDirty();
		return;
	}
	g.traverse((node) => {
		if (node.isMesh && node.material !== matGopher) node.material = want;
	});
}

function drawNextPreview3d() {
	const c = document.getElementById('next3d');
	if (!c || !nextPieceDef) return;
	const ctx = c.getContext('2d');
	ctx.fillStyle = '#0a0612';
	ctx.fillRect(0, 0, 88, 88);
	if (nextPieceDef.special === 'gopher') {
		ctx.fillStyle = '#f0c040';
		ctx.beginPath();
		ctx.arc(44, 44, 18, 0, Math.PI * 2);
		ctx.fill();
		return;
	}
	const cells = nextPieceDef.cells;
	const b = pieceBounds(cells);
	const scale = 14;
	const ox = 44 - ((b.minX + b.maxX) / 2) * scale;
	const oy = 44 - ((b.minY + b.maxY) / 2) * scale;
	ctx.strokeStyle = '#40d0b0';
	ctx.lineWidth = 5;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	const drawn = new Set();
	for (const { dx, dy, mask } of cells) {
		const cx = ox + dx * scale, cy = oy + dy * scale;
		for (const dir of [N, E, S, W]) {
			if (!(mask & dir)) continue;
			const nx = dx + DIR_DX[dir], ny = dy + DIR_DY[dir];
			const n = cells.find(c => c.dx === nx && c.dy === ny);
			if (n && (n.mask & OPP[dir])) {
				const key = dx < nx || (dx === nx && dy < ny) ? `${dx},${dy}|${nx},${ny}` : `${nx},${ny}|${dx},${dy}`;
				if (drawn.has(key)) continue;
				drawn.add(key);
				ctx.beginPath();
				ctx.moveTo(cx, cy);
				ctx.lineTo(ox + nx * scale, oy + ny * scale);
				ctx.stroke();
			} else {
				const ex = cx + DIR_DX[dir] * scale * 0.45;
				const ey = cy + DIR_DY[dir] * scale * 0.45;
				ctx.beginPath();
				ctx.moveTo(cx, cy);
				ctx.lineTo(ex, ey);
				ctx.stroke();
			}
		}
	}
}

// Raycast pick + orbit
const raycaster = new THREE.Raycaster();
const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const mouse = new THREE.Vector2();
let viewDrag = { active: false, id: null, x: 0, y: 0, moved: false };

function resize() {
	if (!renderer || !glReady) return;
	const w = viewport.clientWidth, h = viewport.clientHeight;
	renderer.setSize(w, h, false);
	camera.aspect = w / h;
	camera.updateProjectionMatrix();
}

function pointerSurface() {
	return canvas3d || viewport;
}

function pointerToNDC(e) {
	const el = pointerSurface();
	const r = el.getBoundingClientRect();
	if (!r.width || !r.height) return;
	mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
	mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}

function pickGrid(e) {
	pointerToNDC(e);
	raycaster.setFromCamera(mouse, camera);
	const hit = new THREE.Vector3();
	if (!raycaster.ray.intersectPlane(pickPlane, hit)) return null;
	const gx = Math.floor((hit.x - BOARD_OX) / TILE_SIZE);
	const gy = Math.floor((hit.z - BOARD_OZ) / TILE_SIZE);
	if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return null;
	return { gx, gy };
}

function endDrag(e) {
	if (e.pointerId !== viewDrag.id) return;
	const surface = pointerSurface();
	surface.classList.remove('dragging');
	if (viewDrag.active && !viewDrag.moved && gameState === State.PLAYING) {
		const cell = pickGrid(e);
		if (cell) {
			movePieceToGrid(cell.gx, cell.gy);
			updateScene({ board: false, ghost: true });
			refreshGhostMaterial();
			updateHint();
		}
	}
	viewDrag.active = false;
	try { surface.releasePointerCapture(e.pointerId); } catch {}
}

function bindViewportInput() {
	if (!viewport || viewport.dataset.inputBound) return;
	viewport.dataset.inputBound = '1';
	viewport.addEventListener('pointerdown', (e) => {
		if (e.button !== 0) return;
		viewDrag = { active: true, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
		pointerSurface().classList.add('dragging');
		try { pointerSurface().setPointerCapture(e.pointerId); } catch {}
	});
	viewport.addEventListener('pointermove', (e) => {
		if (!viewDrag.active || e.pointerId !== viewDrag.id) return;
		const dx = e.clientX - viewDrag.x;
		const dy = e.clientY - viewDrag.y;
		if (Math.abs(dx) + Math.abs(dy) > 5) viewDrag.moved = true;
		if (viewDrag.moved) {
			CAM.yaw -= dx * 0.006;
			CAM.pitch = Math.max(0.15, Math.min(1.1, CAM.pitch + dy * 0.004));
			viewDrag.x = e.clientX;
			viewDrag.y = e.clientY;
			updateCamera();
		}
	});
	viewport.addEventListener('pointerup', endDrag);
	viewport.addEventListener('pointercancel', endDrag);
}
bindViewportInput();

window.addEventListener('pageshow', (e) => {
	if (e.persisted) {
		createRenderer();
		if (glReady) {
			markSceneDirty();
			updateScene();
			resize();
		}
	}
});

function init3d() {
	createRenderer();
	if (!glReady) return;
	new ResizeObserver(resize).observe(viewport);
	resize();
	buildFloor();
	updateCamera();
	loadBest();
	if (!nextPieceDef) nextPieceDef = pickPieceDef();
	markSceneDirty();
	updateScene();
	requestAnimationFrame(tick);
}

// Touch bar
document.querySelectorAll('#touchBar [data-act]').forEach(btn => {
	btn.addEventListener('click', () => {
		const act = btn.dataset.act;
		if (gameState === State.TITLE) { startGame(); return; }
		if (gameState === State.PAUSED && act === 'pause') { resumeGame(); return; }
		if (gameState !== State.PLAYING) return;
		if (act === 'up') movePiece(0, -1);
		else if (act === 'down') movePiece(0, 1);
		else if (act === 'left') movePiece(-1, 0);
		else if (act === 'right') movePiece(1, 0);
		else if (act === 'rotate') rotatePiece(1);
		else if (act === 'rotate-ccw') rotatePiece(-1);
		else if (act === 'yaw-left') tiltPiece('y', -1);
		else if (act === 'yaw-right') tiltPiece('y', 1);
		else if (act === 'pitch-up') tiltPiece('x', 1);
		else if (act === 'pitch-down') tiltPiece('x', -1);
		else if (act === 'roll-left') tiltPiece('z', -1);
		else if (act === 'roll-right') tiltPiece('z', 1);
		else if (act === 'place') placePiece();
		else if (act === 'pause') togglePause();
		updateScene();
		updateHint();
	});
});
