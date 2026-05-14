/**
 * DiffusionField — cube choreography hero.
 *
 * 256 individual axis-aligned cubes living on an invisible 1.0-unit 3D grid.
 * Cycle: A (dispersed cloud) → B (tight cluster) → C (vertical columns) → A …
 * Each transition is 3s with a per-cube 0–1s stagger and a 2s hold afterwards.
 * Phase length = 6s, full cycle = 18s.
 *
 * Cubes translate along grid axes only (Manhattan paths) with cubic-in-out
 * easing applied once to the global per-cube progress.
 *
 * Camera is a static 3/4-iso PerspectiveCamera (FOV 35), so every cube shows
 * three lit faces. Lighting = AmbientLight + DirectionalLight, MeshStandardMaterial
 * with flatShading.
 *
 * Public API (preserved from prior implementation):
 *   const field = new DiffusionField(canvas, opts?);
 *   field.start();
 *   field.setReducedMotion(true|false);
 *   field.renderStill(t);
 *   field.dispose();
 *   field.resize();
 */

import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";

export const DEFAULTS = {
  /** Number of cubes. Spec range: 200–400. */
  count: 256,
  /** Edge length per cube in world units (cellSize - cubeSize = inter-cube gap). */
  cubeSize: 0.8,
  /** Grid cell pitch in world units. */
  cellSize: 1.0,
  /** Half-width of the grid in cells (grid spans cells in [-gridExtent, +gridExtent]).
   *  At the default fov+cameraDistance, gridExtent=7 keeps State A's cloud inside the
   *  frustum and yields ~7.6% occupancy with count=256. */
  gridExtent: 7,

  baseColor: 0x1a1a1a,
  accentColor: 0xc84a3a,
  /** How many cubes use the accent material. Spec range: 8–12. */
  accentCount: 10,

  /** Per-cube transition time in seconds. */
  transitionDuration: 3.0,
  /** Hold time at each state before the next transition begins. */
  holdDuration: 2.0,
  /** Maximum stagger lead-in (per cube delay is in [0, maxStagger]). */
  maxStagger: 1.0,

  /** Camera FOV in degrees. */
  fov: 35,
  /** Camera position scalar (camera at (k, 0.78k, k) so it reads as 3/4 iso). */
  cameraDistance: 22,

  seed: 1337,
};

export type DiffusionFieldOptions = typeof DEFAULTS;

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32-ish — kept from prior impl for the same seed feel)
// ---------------------------------------------------------------------------

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Layout generators — produce N integer grid cells per state.
// ---------------------------------------------------------------------------

type Cell = readonly [number, number, number];

function cellKey(c: Cell): number {
  // Pack -64..63 per axis into a single int (gridExtent stays well below this).
  return ((c[0] + 64) << 14) | ((c[1] + 64) << 7) | (c[2] + 64);
}

/**
 * State A — dispersed cloud across the grid.
 * Sample N unique integer cells inside [-gridExtent, +gridExtent]^3.
 */
function buildLayoutCloud(count: number, gridExtent: number, rng: () => number): Cell[] {
  const span = gridExtent * 2 + 1;
  const cells: Cell[] = [];
  const seen = new Set<number>();
  let safety = count * 64;
  while (cells.length < count && safety-- > 0) {
    const x = Math.floor(rng() * span) - gridExtent;
    const y = Math.floor(rng() * span) - gridExtent;
    const z = Math.floor(rng() * span) - gridExtent;
    const c: Cell = [x, y, z];
    const k = cellKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    cells.push(c);
  }
  if (cells.length < count) {
    throw new Error(`buildLayoutCloud: could not place ${count} cubes in ${span}^3 grid`);
  }
  return cells;
}

/**
 * State B — tight on-grid sphere centred on origin. Take the `count` cells
 * with the smallest distance² to the origin, ties broken deterministically.
 */
function buildLayoutCluster(count: number, gridExtent: number): Cell[] {
  const candidates: { c: Cell; d2: number; tiebreak: number }[] = [];
  const r = Math.min(gridExtent, Math.ceil(Math.cbrt(count) * 0.85));
  for (let x = -r; x <= r; x++) {
    for (let y = -r; y <= r; y++) {
      for (let z = -r; z <= r; z++) {
        candidates.push({
          c: [x, y, z],
          d2: x * x + y * y + z * z,
          tiebreak: cellKey([x, y, z]),
        });
      }
    }
  }
  candidates.sort((a, b) => a.d2 - b.d2 || a.tiebreak - b.tiebreak);
  if (candidates.length < count) {
    throw new Error(`buildLayoutCluster: not enough candidate cells (have ${candidates.length}, need ${count})`);
  }
  return candidates.slice(0, count).map((entry) => entry.c);
}

/**
 * State C — three narrow vertical columns. Each column has a square footprint
 * in X-Z and stacks tall in Y. Cubes are split as evenly as possible across
 * the three columns so all pillars read at the same height from 3/4-iso.
 */
function buildLayoutColumns(count: number, gridExtent: number): Cell[] {
  // Column centres on X are spaced 5 cells apart so the 3-cell footprints leave
  // a 2-cell empty gutter between pillars — the silhouette must read as three
  // distinct columns from a 3/4-iso angle, not as one slab.
  const colCenters: Array<[number, number]> = [
    [-5, 0],
    [0, 0],
    [5, 0],
  ];
  const footprint = 3; // 3×3 cells in X-Z per column = 9 cells per layer per column
  const half = Math.floor(footprint / 2);
  const slotsPerLayer = footprint * footprint;
  const baseCubes = Math.floor(count / colCenters.length);
  const extra = count - baseCubes * colCenters.length;

  const cells: Cell[] = [];
  for (let ci = 0; ci < colCenters.length; ci++) {
    const [cx, cz] = colCenters[ci];
    const cubesThisCol = baseCubes + (ci < extra ? 1 : 0);
    const layers = Math.ceil(cubesThisCol / slotsPerLayer);
    const yStart = -Math.floor(layers / 2);
    let placed = 0;
    for (let layer = 0; layer < layers && placed < cubesThisCol; layer++) {
      const y = yStart + layer;
      if (y < -gridExtent || y > gridExtent) continue;
      for (let dx = -half; dx <= half && placed < cubesThisCol; dx++) {
        for (let dz = -half; dz <= half && placed < cubesThisCol; dz++) {
          cells.push([cx + dx, y, cz + dz]);
          placed++;
        }
      }
    }
    if (placed < cubesThisCol) {
      throw new Error(`buildLayoutColumns: column ${ci} only fit ${placed} / ${cubesThisCol} cubes inside gridExtent`);
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Manhattan-path interpolation: travel one axis at a time in `order`.
// `t01` is the global, already-eased per-cube progress in [0, 1].
// ---------------------------------------------------------------------------

function manhattanInterpolate(
  start: Cell,
  target: Cell,
  order: readonly [number, number, number],
  t01: number,
  out: Vector3,
): Vector3 {
  const dx = target[0] - start[0];
  const dy = target[1] - start[1];
  const dz = target[2] - start[2];
  const dist = [Math.abs(dx), Math.abs(dy), Math.abs(dz)];
  const total = dist[0] + dist[1] + dist[2];
  if (total === 0) {
    out.set(start[0], start[1], start[2]);
    return out;
  }
  const traveled = t01 * total;
  const pos = [start[0], start[1], start[2]];
  const sign = [Math.sign(dx), Math.sign(dy), Math.sign(dz)];
  let acc = 0;
  for (const axis of order) {
    const seg = dist[axis];
    if (seg === 0) continue;
    if (traveled <= acc + seg) {
      pos[axis] = start[axis] + sign[axis] * (traveled - acc);
      out.set(pos[0], pos[1], pos[2]);
      return out;
    }
    pos[axis] = target[axis];
    acc += seg;
  }
  out.set(target[0], target[1], target[2]);
  return out;
}

// ---------------------------------------------------------------------------

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function easeInOutCubic(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const AXIS_ORDERS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

// ---------------------------------------------------------------------------

interface CubeRecord {
  mesh: Mesh;
  isAccent: boolean;
  stagger: number;
  axisOrder: readonly [number, number, number];
}

export class DiffusionField {
  private canvas: HTMLCanvasElement;
  private opts: DiffusionFieldOptions;

  private renderer!: WebGLRenderer;
  private scene!: Scene;
  private camera!: PerspectiveCamera;
  private geometry!: BoxGeometry;
  private darkMat!: MeshStandardMaterial;
  private accentMat!: MeshStandardMaterial;

  private cubes: CubeRecord[] = [];
  /** Three layouts in cycle order — index per phase. layouts[i] is "from", layouts[(i+1)%3] is "to". */
  private layouts: Cell[][] = [];

  private resizeObs?: ResizeObserver;
  private raf = 0;
  private running = false;
  private reduced = false;
  private loopStart = 0;

  private scratch = new Vector3();

  constructor(canvas: HTMLCanvasElement, opts?: Partial<DiffusionFieldOptions>) {
    this.canvas = canvas;
    this.opts = { ...DEFAULTS, ...opts };
    this.initRenderer();
    this.initScene();
    this.initLayouts();
    this.initCubes();
    this.snapToLayout(0); // start everyone at State A
    this.attachResize();
  }

  // ----------------- init -----------------

  private initRenderer() {
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = true;
    this.applyCanvasSize();
  }

  private applyCanvasSize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(w, h, false);
  }

  private initScene() {
    this.scene = new Scene();
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.camera = new PerspectiveCamera(this.opts.fov, aspect, 0.1, 200);
    const k = this.opts.cameraDistance;
    // 3/4-iso: equal X and Z, Y a bit lower so we look slightly down.
    this.camera.position.set(k, k * 0.78, k);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new AmbientLight(0xffffff, 0.45));
    const dir = new DirectionalLight(0xffffff, 0.85);
    dir.position.set(10, 15, 10); // same octant as camera so cube faces facing camera are lit
    this.scene.add(dir);
  }

  private initLayouts() {
    const rng = makeRng(this.opts.seed);
    this.layouts = [
      buildLayoutCloud(this.opts.count, this.opts.gridExtent, rng),
      buildLayoutCluster(this.opts.count, this.opts.gridExtent),
      buildLayoutColumns(this.opts.count, this.opts.gridExtent),
    ];
  }

  private initCubes() {
    const N = this.opts.count;
    const rng = makeRng(this.opts.seed ^ 0xa5a5);

    // Pick deterministic accent indices once. Fisher-Yates over [0..N), take first accentCount.
    const accentCount = Math.min(this.opts.accentCount, N);
    const idxs = Array.from({ length: N }, (_, i) => i);
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    const accentSet = new Set(idxs.slice(0, accentCount));

    this.geometry = new BoxGeometry(this.opts.cubeSize, this.opts.cubeSize, this.opts.cubeSize);
    this.darkMat = new MeshStandardMaterial({
      color: new Color(this.opts.baseColor),
      roughness: 0.55,
      metalness: 0.05,
      flatShading: true,
    });
    this.accentMat = new MeshStandardMaterial({
      color: new Color(this.opts.accentColor),
      roughness: 0.55,
      metalness: 0.05,
      flatShading: true,
    });

    for (let i = 0; i < N; i++) {
      const isAccent = accentSet.has(i);
      const mesh = new Mesh(this.geometry, isAccent ? this.accentMat : this.darkMat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.cubes.push({
        mesh,
        isAccent,
        stagger: rng() * this.opts.maxStagger,
        axisOrder: AXIS_ORDERS[Math.floor(rng() * AXIS_ORDERS.length)],
      });
    }
  }

  private attachResize() {
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.canvas);
  }

  // ----------------- per-frame -----------------

  /** Snap every cube to layout `index` and render once (used at boot + reduced motion). */
  private snapToLayout(layoutIndex: number) {
    const layout = this.layouts[layoutIndex];
    const s = this.opts.cellSize;
    for (let i = 0; i < this.cubes.length; i++) {
      const cell = layout[i];
      this.cubes[i].mesh.position.set(cell[0] * s, cell[1] * s, cell[2] * s);
    }
  }

  private updateCubes(t: number) {
    const phaseDuration = this.opts.transitionDuration + this.opts.maxStagger + this.opts.holdDuration;
    const cyclePeriod = phaseDuration * 3;
    const tWrapped = ((t % cyclePeriod) + cyclePeriod) % cyclePeriod;
    const phaseIndex = Math.floor(tWrapped / phaseDuration); // 0, 1, or 2
    const phaseElapsed = tWrapped - phaseIndex * phaseDuration;

    const fromLayout = this.layouts[phaseIndex];
    const toLayout = this.layouts[(phaseIndex + 1) % 3];
    const transition = this.opts.transitionDuration;
    const cellSize = this.opts.cellSize;

    for (let i = 0; i < this.cubes.length; i++) {
      const cube = this.cubes[i];
      const localT = clamp01((phaseElapsed - cube.stagger) / transition);
      const eased = easeInOutCubic(localT);
      manhattanInterpolate(fromLayout[i], toLayout[i], cube.axisOrder, eased, this.scratch);
      cube.mesh.position.set(this.scratch.x * cellSize, this.scratch.y * cellSize, this.scratch.z * cellSize);
    }
  }

  // ----------------- lifecycle -----------------

  start() {
    if (this.running) return;
    this.running = true;
    if (this.reduced) {
      this.snapToLayout(1); // cluster
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.loopStart = performance.now();
    this.runLoop();
  }

  private runLoop() {
    const tick = () => {
      if (!this.running || this.reduced) return;
      const t = (performance.now() - this.loopStart) / 1000;
      this.updateCubes(t);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setReducedMotion(value: boolean) {
    if (this.reduced === value) return;
    this.reduced = value;
    if (value) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.snapToLayout(1); // cluster
      this.renderer.render(this.scene, this.camera);
    } else if (this.running) {
      this.loopStart = performance.now();
      this.runLoop();
    }
  }

  /** Public seek used by the fallback-PNG script and for previewing specific frames. */
  renderStill(t: number) {
    this.updateCubes(t);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    this.applyCanvasSize();
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (this.reduced || !this.running) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    this.stop();
    this.resizeObs?.disconnect();
    this.resizeObs = undefined;
    for (const cube of this.cubes) this.scene.remove(cube.mesh);
    this.cubes = [];
    this.geometry.dispose();
    this.darkMat.dispose();
    this.accentMat.dispose();
    this.renderer.dispose();
    const ext = this.renderer.getContext().getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
}
