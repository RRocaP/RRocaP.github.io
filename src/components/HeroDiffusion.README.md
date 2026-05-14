# HeroDiffusion

WebGL hero animation for the portfolio. **256 individual axis-aligned cubes** living
on an invisible 1.0-unit 3D grid, choreographed through three named states. Cubes are
deliberate objects, not simulated particles.

| Phase | Duration | What you see |
|------:|---------|--------------|
| A → B | 6 s | Dispersed cloud collapses into a tight on-grid sphere (cluster) |
| B → C | 6 s | Cluster redistributes into three vertical columns |
| C → A | 6 s | Columns disperse back into the cloud |

Each transition is a 3 s motion window with a per-cube stagger of 0–1 s, followed by a
2 s hold (`6 s = 3 + 1 + 2`). Full cycle = **18 s**. Easing is `cubic-in-out` applied
once to the global per-cube progress; cubes translate along grid axes only (Manhattan
paths), never diagonally.

Cubes are real `THREE.Mesh` objects (not `Points`, not `Sprite`, not
`InstancedMesh`-of-billboards) sharing a single `BoxGeometry` and one of two
`MeshStandardMaterial` instances:

- 246 cubes use `#1A1A1A` (base, dark)
- 10 cubes use `#C84A3A` (accent, oxblood) — picked deterministically by seed and
  **stay accent across all states**

Lighting = `AmbientLight(0.45)` + `DirectionalLight(0.85)` placed in the same octant
as the camera so the camera sees three lit faces per cube (top, front-right, front-left).

Camera is a static `PerspectiveCamera` with **FOV 35°** in a 3/4-isometric position.
No orbit, no parallax — the cubes move, not the viewer.

The soft red glow you may see *under* the cluster is a pure CSS `radial-gradient`
painted behind the canvas at `rgba(200,74,58,0.06)`. It is not a WebGL effect — bloom,
glow, and motion-blur trails inside the canvas are explicitly avoided.

## Mounting

```astro
---
import HeroDiffusion from "../components/HeroDiffusion.astro";
---

<HeroDiffusion>
  <Fragment slot="kicker">Profile</Fragment>
  <Fragment slot="title">Protein engineering<br />from AI design<br />to preclinical validation.</Fragment>
  <Fragment slot="subtitle">
    Biomedical engineer combining computational protein design,
    wet-lab validation, and translational models.
  </Fragment>
  <Fragment slot="ctas">
    <a href="#works" class="btn">View research</a>
    <a href="#contact" class="btn btn-ghost">Contact</a>
  </Fragment>
</HeroDiffusion>
```

All four slots are optional.

## Tweakable parameters

All defaults live in `src/lib/diffusion-field.ts` and are exported as `DEFAULTS`. Pass
overrides via the constructor — but **for the production hero, edit `DEFAULTS`** so the
fallback PNG and the runtime render stay in sync.

| Constant | Default | Notes |
|----------|---------|-------|
| `count` | `256` | total cubes (spec range 200–400) |
| `cubeSize` | `0.8` | edge length per cube in world units |
| `cellSize` | `1.0` | grid cell pitch — `cellSize − cubeSize` is the inter-cube gap |
| `gridExtent` | `7` | half-width of the grid in cells (cells span `[-7, +7]` per axis = 15³ = 3375 cells, ~7.6% occupancy at `count=256`) |
| `baseColor` | `0x1A1A1A` | non-accent cube colour |
| `accentColor` | `0xC84A3A` | accent cube colour |
| `accentCount` | `10` | how many cubes are accent (spec range 8–12) |
| `transitionDuration` | `3.0` | per-cube motion duration in seconds |
| `holdDuration` | `2.0` | hold time at each state before the next transition |
| `maxStagger` | `1.0` | per-cube stagger lead-in is in `[0, maxStagger]` |
| `fov` | `35` | `PerspectiveCamera` FOV in degrees |
| `cameraDistance` | `22` | camera placed at `(k, 0.78k, k)` looking at origin |
| `seed` | `1337` | deterministic RNG seed for layouts + accent picks + stagger + axis order |

`phaseDuration = transitionDuration + maxStagger + holdDuration` and
`cyclePeriod = phaseDuration * 3` are derived.

## Performance

- DPR capped at `min(2, devicePixelRatio)`.
- 256 individual `Mesh` instances → ~256 draw calls per frame. Well within budget on
  any modern GPU; the per-frame CPU cost is one tight loop writing 256 transform
  matrices.
- `frustumCulled = false` on every mesh (the grid is bounded; skip culling math).
- Single shared `BoxGeometry` and 2 shared `MeshStandardMaterial` instances — no
  per-mesh allocations after init.
- Timeline is a hand-rolled RAF loop (`performance.now() / 1000`); GSAP is **not** a
  dependency of this component.

## Reduced motion

`window.matchMedia('(prefers-reduced-motion: reduce)')` is wired in. When set:

- The RAF loop halts.
- Every cube snaps to its **State B (cluster)** target cell — produces a static, ordered
  tableau that reads as the brand mark.
- Live toggling at runtime is supported.

## PNG fallback

If WebGL fails to initialise (very old GPU, blocked context, server-render), a static
PNG/WebP/AVIF poster is shown under the canvas at full size, with the canvas overlay
hidden via `opacity: 0` on the fallback element only **after** the first WebGL frame
renders.

To regenerate the poster after changing any of the tweakable params above:

```bash
npm run diffusion:fallback
```

This launches headless Chromium via Playwright, seeks the field to `phaseDuration * 0.5`
(mid State A→B — cluster forming) and writes `public/hero-diffusion-fallback.{png,webp,avif}`.
The script is **not** wired into `npm run build` automatically — re-run it manually
whenever the visual changes.

## Bundle cost

Measured against a clean route that only mounts `<HeroDiffusion>` (gzipped):

- `HeroDiffusion.astro` inline script (boot + sim): a few KB
- `vendor-utils` (three.js + small shared utils): ~150 KB

Three.js core is the dominant cost. The previous shader-driven draft was within a few
KB of this one — the byte budget is set by three.js, not by this component's logic.

## File map

```
src/components/HeroDiffusion.astro         — markup + scoped CSS + boot script
src/components/HeroDiffusion.README.md     — this file
src/lib/diffusion-field.ts                 — framework-agnostic choreography class
scripts/render-diffusion-fallback.mjs      — headless capture → public/*.{png,webp,avif}
public/hero-diffusion-fallback.png         — generated, committed for fast first paint
public/hero-diffusion-fallback.webp        — generated
public/hero-diffusion-fallback.avif        — generated
```
