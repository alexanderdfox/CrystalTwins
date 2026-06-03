#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'not-forks.html'), 'utf8');
const logicMatch = src.match(/<script>\s*'use strict';([\s\S]*)<\/script>\s*<\/body>/);
if (!logicMatch) throw new Error('script block not found');
let logic = logicMatch[1];

const domReplacement = `// ─── DOM ────────────────────────────────────────────────────────────────────────
const titleOverlay = document.getElementById('titleOverlay');
const pauseOverlay = document.getElementById('pauseOverlay');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const gameOverText = document.getElementById('gameOverText');
const flashMsg = document.getElementById('flashMsg');
const levelLabel = document.getElementById('levelLabel');
const loopCountEl = document.getElementById('loopCount');
const pointsEl = document.getElementById('points');
const bestScoreEl = document.getElementById('bestScore');
const titleBestEl = document.getElementById('titleBest');
const heartsEl = document.getElementById('heartsEl');
const livesSubEl = document.getElementById('livesSub');
const timerFillEl = document.getElementById('timerFill');
const timerSecEl = document.getElementById('timerSec');
const streakLabel = document.getElementById('streakLabel');
const statusBar = document.getElementById('statusBar');
const hintPanel = document.getElementById('hintPanel');
const startBtn = document.getElementById('startBtn');
const resumeBtn = document.getElementById('resumeBtn');
const quitBtn = document.getElementById('quitBtn');
const retryBtn = document.getElementById('retryBtn');
const levelDown = document.getElementById('levelDown');
const levelUp = document.getElementById('levelUp');
const btnRotate = document.getElementById('btnRotate');
const btnPlace = document.getElementById('btnPlace');
const btnSkip = document.getElementById('btnSkip');
const btnPause = document.getElementById('btnPause');
const touchHint = null;
const titleBest2El = null;
const mPointsEl = null;
const mLivesEl = null;
const mTimerEl = null;
const mPauseBtn = null;
const statusPauseBtn = null;
const soundToggle = null;
const touchControlsToggle = null;
const gpIndicator = document.getElementById('gpIndicator');
const fsToast = null;
const nextCanvas = null;
const nextCtx = null;
const mNextCanvas = null;
const mNextCtx = null;
`;

logic = logic.replace(/\/\/ ─── DOM[\s\S]*?\/\/ ─── STATE/, domReplacement + '\n// ─── STATE');

const strips = [
	[/\/\/ ─── ADAPTIVE MUSIC[\s\S]*?\/\/ ─── PIECE LOGIC/, '// ─── PIECE LOGIC'],
	[/function scheduleMusic[\s\S]*?function setMusicEnabled[\s\S]*?\n\}/, ''],
	[/function startMusic[\s\S]*?function stopMusic[\s\S]*?\n\}/, ''],
	[/const music = \{[\s\S]*?\/\/ ─── PIECE LOGIC/, '// ─── PIECE LOGIC'],
	[/\/\/ ─── DRAWING[\s\S]*?\/\/ ─── MAIN LOOP/, '// ─── MAIN LOOP'],
	[/function drawBoard[\s\S]*?function drawTimerBar[\s\S]*?\n\}/, ''],
	[/function drawNextPreview[\s\S]*?function drawActivePiece[\s\S]*?\n\}/, ''],
	[/\/\/ ─── PARTICLES[\s\S]*?\/\/ ─── INPUT/, `// ─── PARTICLES (3D) ─────────────────────────────────────────────────────────────
function spawnParticles(loop) {
	spawnParticles3d(loop);
}
function tickParticles() {}
function drawParticles() {}

// ─── INPUT`],
	[/function draw\(\) \{[\s\S]*?\n\}\n\n/, ''],
	[/function initLayoutFit[\s\S]*?function roundRectPath[\s\S]*?\n\}/, ''],
	[/let canvasDpr[\s\S]*?function enforceViewportFit[\s\S]*?\n\}/, ''],
	[/\/\/ ─── MOBILE[\s\S]*?(?=document\.addEventListener\('visibilitychange')/, ''],
	[/initMobile\(\);/, ''],
	[/drawNextPreview\(\);/g, 'drawNextPreview3d();'],
	[/scheduleMusic\(\);/g, ''],
	[/scheduleFitCanvas\(\);/g, ''],
	[/startMusic\(\);/g, ''],
	[/loadBest\(\)[\s\S]*?titleBest2El\) titleBest2El\.textContent = bestScore;\n\}/, `loadBest() {
	try { bestScore = parseInt(localStorage.getItem('notforks3d_best') || localStorage.getItem('notforks_best') || '0', 10) || 0; } catch {}
	if (bestScoreEl) bestScoreEl.textContent = bestScore;
	if (titleBestEl) titleBestEl.textContent = bestScore;
}`],
	[/function saveBest\(\) \{[\s\S]*?if \(titleBest2El\) titleBest2El\.textContent = bestScore;\n\t\}\n\}/, `function saveBest() {
	if (points > bestScore) {
		bestScore = points;
		try { localStorage.setItem('notforks3d_best', String(bestScore)); } catch {}
		if (bestScoreEl) bestScoreEl.textContent = bestScore;
		if (titleBestEl) titleBestEl.textContent = bestScore;
	}
}`],
];

for (const [re, rep] of strips) logic = logic.replace(re, rep);

const orientGrid6Dof = `// ─── 6DOF ORIENTATION GRID (15° steps; yaw synced to Z/X grid rotation) ───────────
const ORIENT_STEP = Math.PI / 12;
const ORIENT_YAW_STEPS_PER_90 = 3;
const ORIENT_PITCH_MIN = -6;
const ORIENT_PITCH_MAX = 6;
const ORIENT_YAW_STEPS = 24;
const ORIENT_ROLL_STEPS = 24;

function defaultOrientSteps(rotation = 0) {
	return { pitch: 0, yaw: yawStepsForRotation(rotation), roll: 0 };
}
function yawStepsForRotation(rot) {
	return ((rot % 4) + 4) % 4 * ORIENT_YAW_STEPS_PER_90;
}
function orientStepsToEuler(steps) {
	return {
		x: steps.pitch * ORIENT_STEP,
		y: steps.yaw * ORIENT_STEP,
		z: steps.roll * ORIENT_STEP,
	};
}
function wrapOrientStep(v, mod) {
	return ((v % mod) + mod) % mod;
}
function snapOrientSteps(steps) {
	return {
		pitch: Math.max(ORIENT_PITCH_MIN, Math.min(ORIENT_PITCH_MAX, Math.round(steps.pitch))),
		yaw: wrapOrientStep(Math.round(steps.yaw), ORIENT_YAW_STEPS),
		roll: wrapOrientStep(Math.round(steps.roll), ORIENT_ROLL_STEPS),
	};
}
function copyOrientSteps(steps) {
	return { pitch: steps.pitch, yaw: steps.yaw, roll: steps.roll };
}
function syncOrientFromSteps(p) {
	if (!p.orientSteps) p.orientSteps = defaultOrientSteps(p.rotation);
	p.orientSteps = snapOrientSteps(p.orientSteps);
	p.orient = orientStepsToEuler(p.orientSteps);
}
function syncOrientToGridRotation(p) {
	if (!p.orientSteps) p.orientSteps = defaultOrientSteps(p.rotation);
	p.orientSteps.yaw = yawStepsForRotation(p.rotation);
	syncOrientFromSteps(p);
}
function gridSnapPiecePose(p) {
	syncOrientFromSteps(p);
}

`;

logic = logic.replace(
	/function makePiece\(def, rotation\) \{[\s\S]*?\n\}\n\nfunction centerPiece/,
	`${orientGrid6Dof}function makePiece(def, rotation) {
	const cells = rotateCells(def.cells, rotation);
	const orientSteps = defaultOrientSteps(rotation);
	return { def, rotation, cells, px: 0, py: 0, orientSteps, orient: orientStepsToEuler(orientSteps) };
}

function centerPiece`
);

logic = logic.replace(
	/let onScreenControls = false;/,
	`const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let onScreenControls = false;`
);

logic = logic.replace(
	/let piecesPlaced = 0;/,
	`let piecesPlaced = 0;
let nextPlaceId = 1;`
);

logic = logic.replace(
	/statusBar\.innerHTML = IS_TOUCH \|\| onScreenControls[\s\S]*?gamepad supported';/,
	`statusBar.innerHTML = IS_TOUCH
		? 'Tap tile · <strong>PLACE</strong> drop · gamepad: stick move · A place'
		: 'Click tile · <strong>Space</strong> place · <strong>Z/X</strong> grid rotate · <strong>Q/E F/G T/H</strong> 15° tilt · gamepad';`
);

logic = logic.replace(
	/function startGame\(\) \{/,
	`function startGame() {
	nextPlaceId = 1;`
);

logic = logic.replace(
	/function rotatePiece\(dir = 1\) \{/,
	`function tiltPiece(axis, dir = 1) {
	if (!piece || piece.def.special === 'gopher') return;
	if (!piece.orientSteps) piece.orientSteps = defaultOrientSteps(piece.rotation);
	if (axis === 'x') piece.orientSteps.pitch += dir;
	else if (axis === 'y') piece.orientSteps.yaw += dir;
	else if (axis === 'z') piece.orientSteps.roll += dir;
	gridSnapPiecePose(piece);
	sfxRotate();
	updateHint();
}

function rotatePiece(dir = 1) {`
);

logic = logic.replace(
	/piece\.rotation = rot;\n\t\t\tpiece\.cells = newCells;\n\t\t\tpiece\.px = px \+ dx;\n\t\t\tpiece\.py = py \+ dy;\n\t\t\tsfxRotate\(\);/,
	`piece.rotation = rot;
			piece.cells = newCells;
			piece.px = px + dx;
			piece.py = py + dy;
			syncOrientToGridRotation(piece);
			sfxRotate();`
);

logic = logic.replace(
	/if \(!canPlace\(cells, px, py\)\) return false;\n\tfor \(const \{ dx, dy, mask \} of cells\) \{\n\t\tboard\[py \+ dy\]\[px \+ dx\] = \{ mask, pieceId: def\.id \};\n\t\}/,
	`if (!canPlace(cells, px, py)) return false;
	gridSnapPiecePose(piece);
	const placedOrient = copyOrientSteps(piece.orientSteps);
	const placeId = nextPlaceId++;
	for (const { dx, dy, mask } of cells) {
		board[py + dy][px + dx] = { mask, pieceId: def.id, placeId, orientSteps: placedOrient };
	}`
);

logic = logic.replace(
	/if \(edge\('z'\) \|\| edge\('Z'\) \|\| edge\('a'\) \|\| edge\('A'\)\) rotatePiece\(1\);\n\tif \(edge\('r'\) \|\| edge\('R'\)\) rotatePiece\(-1\);\n\tif \(edge\('x'\) \|\| edge\('X'\) \|\| edge\(' '\)\) placePiece\(\);\n\tif \(edge\('s'\) \|\| edge\('S'\)\) skipPiece\(\);/,
	`if (edge('z') || edge('Z')) rotatePiece(1);
	if (edge('x') || edge('X')) rotatePiece(-1);
	if (edge(' ')) placePiece();
	if (edge('q') || edge('Q')) tiltPiece('y', -1);
	if (edge('e') || edge('E')) tiltPiece('y', 1);
	if (edge('f') || edge('F')) tiltPiece('x', 1);
	if (edge('g') || edge('G')) tiltPiece('x', -1);
	if (edge('t') || edge('T')) tiltPiece('z', 1);
	if (edge('h') || edge('H')) tiltPiece('z', -1);
	if (edge('s') || edge('S')) skipPiece();`
);

logic = logic.replace(
	/if \(gpEdge\(snap, GP\.B\) \|\| gpEdge\(snap, GP\.L3\)\) skipPiece\(\);\n\tif \(gpTriggerEdge\(snap\.lt, prevGpLt\)\) rotatePiece\(-1\);\n\}/,
	`if (gpEdge(snap, GP.B)) skipPiece();
	if (gpEdge(snap, GP.L3)) tiltPiece('z', -1);
	if (gpEdge(snap, GP.R3)) tiltPiece('z', 1);
	if (gpTriggerEdge(snap.lt, prevGpLt)) tiltPiece('y', -1);
	const rsX = snap.axes[2] || 0;
	const rsY = snap.axes[3] || 0;
	if (piece && piece.def.special !== 'gopher') {
		const qx = Math.abs(rsX) > GP_DEADZONE ? (rsX > 0 ? 1 : -1) : 0;
		const qy = Math.abs(rsY) > GP_DEADZONE ? (rsY > 0 ? 1 : -1) : 0;
		let changed = false;
		if (!piece.orientSteps) piece.orientSteps = defaultOrientSteps(piece.rotation);
		if (qx !== gpStickQ.x && qx) { piece.orientSteps.yaw += qx; changed = true; }
		if (qy !== gpStickQ.y && qy) { piece.orientSteps.pitch += qy; changed = true; }
		gpStickQ.x = qx;
		gpStickQ.y = qy;
		if (changed) {
			gridSnapPiecePose(piece);
			updateGhostOrientation();
		}
	} else {
		gpStickQ.x = 0;
		gpStickQ.y = 0;
	}
}`
);

logic = logic.replace(
	/function gpMoveVector\(snap\) \{[\s\S]*?return \{ dx, dy \};\n\}/,
	`function gpMoveVector(snap) {
	let dx = 0, dy = 0;
	const lx = snap.axes[0] ?? 0;
	const ly = snap.axes[1] ?? 0;
	if (Math.abs(lx) > GP_DEADZONE) dx = lx > 0 ? 1 : -1;
	if (Math.abs(ly) > GP_DEADZONE) dy = ly > 0 ? 1 : -1;
	if (dx && dy) {
		if (Math.abs(lx) >= Math.abs(ly)) dy = 0;
		else dx = 0;
	}
	if (snap.axes.length >= 8) {
		const hx = snap.axes[6], hy = snap.axes[7];
		if (hx !== undefined && Math.abs(hx) > 0.5) dx = hx > 0 ? 1 : -1;
		if (hy !== undefined && Math.abs(hy) > 0.5) dy = hy > 0 ? 1 : -1;
	}
	if (gpDown(snap, GP.LEFT)) dx = -1;
	if (gpDown(snap, GP.RIGHT)) dx = 1;
	if (gpDown(snap, GP.UP)) dy = -1;
	if (gpDown(snap, GP.DOWN)) dy = 1;
	return { dx, dy };
}`
);

logic = logic.replace(
	/if \(gpEdge\(snap, GP\.A\) \|\| gpEdge\(snap, GP\.R3\) \|\| gpTriggerEdge\(snap\.rt, prevGpRt\)\) placePiece\(\);/,
	'if (gpEdge(snap, GP.A) || gpTriggerEdge(snap.rt, prevGpRt)) placePiece();'
);

logic = logic.replace(
	/function updatePauseUI\(\) \{[\s\S]*?\n\}/,
	`function updatePauseUI() {
	const paused = gameState === State.PAUSED;
	document.documentElement.classList.toggle('paused', paused);
	if (btnPause) {
		btnPause.textContent = paused ? 'Resume' : 'Pause';
		btnPause.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
	}
}`
);

logic = logic.replace(
	/function updateGpIndicator\(active\) \{[\s\S]*?\n\}/,
	`function updateGpIndicator(active) {
	if (!gpIndicator) return;
	gpIndicator.classList.toggle('show', !!active);
	if (active && gpConnectedName) {
		gpIndicator.title = gpConnectedName + ' — stick move · A/RT place · X/Y rotate · B skip · right stick tilt';
	}
}`
);

logic = logic.replace(
	/const snap = gpSnapshot\(gp\);\n\n\tif \(gameState === State\.TITLE\)/,
	`if (!gpConnectedName) {
		gpConnectedName = (gp.id || 'Controller').replace(/\\s*\\([^)]*\\)\\s*$/, '').trim() || 'Controller';
	}
	const snap = gpSnapshot(gp);

	if (gameState === State.TITLE)`
);

logic = logic.replace(
	/let gpConnectedName = '';/,
	`let gpConnectedName = '';
let gpStickQ = { x: 0, y: 0 };`
);

logic = logic.replace(
	/Click a tile to position · <strong>Space<\/strong> to place · drag to orbit/,
	'Click tile · <strong>Space</strong> place · <strong>Z/X</strong> snap · <strong>Q/E F/G T/H</strong> tilt · drag orbit'
);

logic = logic.replace(
	/function updateHUD\(\) \{/,
	`function updateHUD() {
	if (timerFillEl && timerMax > 0) {
		const pct = Math.max(0, (timerLeft / timerMax) * 100);
		timerFillEl.style.width = \`\${pct}%\`;
		timerFillEl.classList.toggle('low', pct < 25);
	}
	if (timerSecEl) timerSecEl.textContent = timerMax > 0 ? \`\${Math.ceil(timerLeft / 1000)}s\` : '—';`
);

logic = logic.replace(
	/function tick\(now\) \{[\s\S]*?requestAnimationFrame\(tick\);\n\}/,
	`function tick(now) {
	const dt = Math.min(now - lastTime, 50);
	lastTime = now;
	if (gameState === State.PLAYING && piece) {
		timerLeft -= dt;
		if (timerLeft <= 0) {
			if (piece.def.special === 'gopher') { piece = null; spawnPiece(true); }
			else loseLife();
		}
	}
	updateParticles(dt);
	handleInput();
	updateGhostOrientation();
	updateHUD();
	updateCamera();
	if (loopFlashTimer > 0) {
		loopFlashTimer--;
		if (loopFlashTimer === 0) {
			loopFlashCells = new Set();
			updateScene({ board: true, ghost: false });
		}
	}
	if (flashTimer > 0) { flashTimer--; if (flashTimer <= 0) flashMsg.classList.remove('show'); }
	prevKeys = { ...keys };
	if (glReady && renderer) renderer.render(scene, camera);
	requestAnimationFrame(tick);
}`
);

logic = logic.replace(
	/document\.addEventListener\('visibilitychange'[\s\S]*?\}\);?\s*$/,
	`document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'hidden' && gameState === State.PLAYING) pauseGame();
	else if (document.visibilityState === 'visible') updateScene();
});

if (startBtn) startBtn.addEventListener('click', () => { ensureAudio(); startGame(); });
if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
if (quitBtn) quitBtn.addEventListener('click', quitToTitle);
if (retryBtn) retryBtn.addEventListener('click', () => { ensureAudio(); gameOverOverlay.style.display = 'none'; startGame(); });
if (levelDown) levelDown.addEventListener('click', () => cycleLevel(-1));
if (levelUp) levelUp.addEventListener('click', () => cycleLevel(1));
if (btnRotate) btnRotate.addEventListener('click', () => { rotatePiece(1); updateScene(); });
if (btnPlace) btnPlace.addEventListener('click', () => { placePiece(); updateScene(); });
if (btnSkip) btnSkip.addEventListener('click', () => { skipPiece(); updateScene(); });
if (btnPause) btnPause.addEventListener('click', togglePause);

document.addEventListener('keydown', (e) => {
	const k = e.key;
	if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' ','z','x','Z','X','q','Q','e','E','f','F','g','G','t','T','h','H','p','P','s','S','Escape','c','C'].includes(k)) e.preventDefault();
	keys[k] = true;
	if (gameState === State.TITLE) {
		if (k === 'Enter' || k === ' ') { ensureAudio(); startGame(); return; }
		if (k === 'ArrowLeft') cycleLevel(-1);
		if (k === 'ArrowRight') cycleLevel(1);
		if (k === 'ArrowUp' || k === 'ArrowDown') cycleDifficulty(k === 'ArrowUp' ? 1 : -1);
		return;
	}
	handleInput();
});
document.addEventListener('keyup', (e) => { keys[e.key] = false; });

const _placePiece = placePiece;
placePiece = function() { const r = _placePiece(); updateScene(); return r; };
const _movePiece = movePiece;
movePiece = function(dx, dy) { const r = _movePiece(dx, dy); updateScene({ board: false, ghost: true }); refreshGhostMaterial(); return r; };
const _rotatePiece = rotatePiece;
rotatePiece = function(dir) { const r = _rotatePiece(dir); updateScene(); return r; };
const _tiltPiece = tiltPiece;
tiltPiece = function(axis, dir) { const r = _tiltPiece(axis, dir); updateGhostOrientation(); return r; };
const _skipPiece = skipPiece;
skipPiece = function() { const r = _skipPiece(); updateScene(); return r; };
const _spawnPiece = spawnPiece;
spawnPiece = function(fromQueue) { const r = _spawnPiece(fromQueue); updateScene(); return r; };
const _startGame = startGame;
startGame = function() { _startGame(); updateScene(); };
const _loseLife = loseLife;
loseLife = function() { _loseLife(); updateScene(); };
const _quitToTitle = quitToTitle;
quitToTitle = function() { _quitToTitle(); updateScene(); };

function stopMusic() {}
function stopTouchRepeat() {}

function showToast(msg, ms = 2800) {
	if (!flashMsg) return;
	flashMsg.textContent = msg;
	flashMsg.classList.add('show');
	flashTimer = ms;
}

function onGamepadConnected(gp) {
	gpSlot = gp.index;
	gpConnectedName = (gp.id || 'Controller').replace(/\\s*\\([^)]*\\)\\s*$/, '').trim() || 'Controller';
	prevGpSnap = null;
	updateGpIndicator(true);
	showToast(\`\${gpConnectedName} ready — Start or A to play\`, 2800);
}

window.addEventListener('gamepadconnected', (e) => {
	ensureAudio();
	onGamepadConnected(e.gamepad);
});
window.addEventListener('gamepaddisconnected', (e) => {
	if (e.gamepad.index === gpSlot) {
		gpSlot = null;
		gpConnectedName = '';
	}
	prevGpSnap = null;
	prevGpRt = 0;
	prevGpLt = 0;
	gpDasKey = null;
	gpDasTimer = 0;
	updateGpIndicator(getActiveGamepad() !== null);
});
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => {
	document.addEventListener(ev, () => pollGamepads(), { passive: true });
});
(function scanGamepadsOnLoad() {
	pollGamepads();
	const pads = navigator.getGamepads?.();
	if (!pads) return;
	for (const gp of pads) {
		if (gp?.connected) {
			onGamepadConnected(gp);
			break;
		}
	}
})();

init3d();
`
);

const domIdx = logic.indexOf('// ─── DOM');
const logicPre = logic.slice(0, domIdx);
const logicPost = logic.slice(domIdx);
const threeLayer = fs.readFileSync(path.join(__dirname, 'not-forks-3d-three.js'), 'utf8');

const html = fs.readFileSync(path.join(__dirname, 'not-forks-3d-shell.html'), 'utf8')
	.replace('__LOGIC_PRE__', logicPre)
	.replace('__THREE__', threeLayer)
	.replace('__LOGIC_POST__', logicPost);

fs.writeFileSync(path.join(root, 'not-forks-3d.html'), html);
console.log('Wrote not-forks-3d.html', html.length, 'bytes');
