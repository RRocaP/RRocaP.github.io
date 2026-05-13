import { useEffect, useRef, useState } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3-force';
import { collaborators, collaboratorLinks, type CollabNode } from '../../data/collaborators.ts';

type Tooltip = { x: number; y: number; node: CollabNode } | null;

interface SimNode extends CollabNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  /** depth layer 0..2; affects size + alpha + perceived z */
  layer: number;
  /** per-node phase for ambient drift */
  phase: number;
  /** anchor angle for cluster placement (radians) */
  anchorAngle: number;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
  weight: number;
}

const COLOR = {
  bg: '#080B11',
  node: '#F7F4EE',
  nodeDim: 'rgba(247,244,238,0.45)',
  hub: '#DA291C',
  institution: '#C4956A',
  edge: 'rgba(196,149,106,0.55)',
  edgeStrong: 'rgba(255,215,155,1.0)',
  edgeMuted: 'rgba(196,149,106,0.10)',
};

function hash(seed: number) {
  let x = seed | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = (x + (x << 3)) | 0;
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return (x >>> 0) / 0xffffffff;
}

function stringHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const GROUP_ORDER = ['cmri', 'uab', 'eu', 'us', 'au', 'ramon'] as const;

function nodeRadius(n: SimNode) {
  const base = n.kind === 'primary' ? 9 : n.kind === 'institution' ? 6.5 : n.kind === 'collaborator' ? 5.5 : 2.6;
  const layerScale = 0.78 + n.layer * 0.18;
  return base * layerScale;
}

function nodeFill(n: SimNode, highlight: 'on' | 'neighbour' | 'off' | 'none') {
  if (highlight === 'on') return COLOR.edgeStrong;
  if (highlight === 'neighbour') return COLOR.node;
  if (highlight === 'off') return COLOR.nodeDim;
  if (n.kind === 'primary') return COLOR.hub;
  if (n.kind === 'institution') return COLOR.institution;
  if (n.kind === 'collaborator') return COLOR.node;
  return COLOR.nodeDim;
}

export default function MolecularNetwork() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tooltip, setTooltip] = useState<Tooltip>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = wrapper.clientWidth;
    let height = wrapper.clientHeight;

    function setCanvasSize() {
      width = wrapper!.clientWidth;
      height = wrapper!.clientHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    setCanvasSize();

    // Cluster anchor positions: spread groups around centre, ramon is the centre itself.
    function anchorFor(group: string) {
      const idx = GROUP_ORDER.indexOf(group as (typeof GROUP_ORDER)[number]);
      if (group === 'ramon') return { x: width / 2, y: height / 2, a: 0 };
      const total = GROUP_ORDER.length - 1;
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
      const r = Math.min(width, height) * 0.32;
      return { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r, a: angle };
    }

    const nodes: SimNode[] = collaborators.map((c) => {
      const seed = stringHash(c.id);
      const layer = (seed % 3) as 0 | 1 | 2;
      const a = anchorFor(c.group);
      return {
        ...c,
        layer,
        phase: hash(seed),
        anchorAngle: a.a,
        x: a.x + (hash(seed + 1) - 0.5) * 30,
        y: a.y + (hash(seed + 2) - 0.5) * 30,
      };
    });

    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const links: SimLink[] = collaboratorLinks
      .map((l) => {
        const s = nodeById.get(l.source);
        const t = nodeById.get(l.target);
        if (!s || !t) return null;
        return { source: s, target: t, weight: l.weight };
      })
      .filter((l): l is SimLink => l !== null);

    // Pin ramon to centre — keeps semantic meaning of the "primary" node.
    const ramon = nodeById.get('ramon');
    if (ramon) {
      ramon.fx = width / 2;
      ramon.fy = height / 2;
    }

    const adjacency = new Map<string, Set<string>>();
    for (const n of nodes) adjacency.set(n.id, new Set());
    for (const l of links) {
      adjacency.get(l.source.id)!.add(l.target.id);
      adjacency.get(l.target.id)!.add(l.source.id);
    }

    const sim = forceSimulation<SimNode>(nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => 60 + (1 - l.weight) * 80)
          .strength((l) => 0.25 + l.weight * 0.45)
      )
      .force('charge', forceManyBody<SimNode>().strength((n) => (n.kind === 'satellite' ? -30 : -180)))
      .force('center', forceCenter(width / 2, height / 2).strength(0.04))
      .force(
        'x',
        forceX<SimNode>((n) => anchorFor(n.group).x).strength((n) => (n.kind === 'satellite' ? 0.18 : 0.05))
      )
      .force(
        'y',
        forceY<SimNode>((n) => anchorFor(n.group).y).strength((n) => (n.kind === 'satellite' ? 0.18 : 0.05))
      )
      .force('collide', forceCollide<SimNode>((n) => nodeRadius(n) + 3))
      .alpha(1)
      .alphaDecay(0.04);

    const reducedNow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedNow) {
      for (let i = 0; i < 240; i++) sim.tick();
      sim.stop();
    } else {
      // Let the layout settle without animating the ticks — drift takes over after.
      sim.alpha(0.9);
      for (let i = 0; i < 80; i++) sim.tick();
      sim.alphaTarget(0.04).restart();
    }

    let hoveredId: string | null = null;
    let mouseInside = false;
    let mouseX = 0;
    let mouseY = 0;
    let visible = true;

    const intersectObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          visible = e.isIntersecting;
          if (!visible) sim.alphaTarget(0);
          else if (!reducedNow) sim.alphaTarget(0.04).restart();
        }
      },
      { threshold: 0 }
    );
    intersectObs.observe(wrapper);

    const resizeObs = new ResizeObserver(() => {
      setCanvasSize();
      syncGlowSize();
      const r = anchorFor('ramon');
      if (ramon) { ramon.fx = r.x; ramon.fy = r.y; }
      sim.force('center', forceCenter(width / 2, height / 2).strength(0.04));
      sim.alpha(0.5).restart();
    });
    resizeObs.observe(wrapper);

    function pick(px: number, py: number): SimNode | null {
      let best: SimNode | null = null;
      let bestDist = 18 * 18;
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        const dx = px - n.x;
        const dy = py - n.y;
        const d2 = dx * dx + dy * dy;
        const hitR = (nodeRadius(n) + 10) ** 2;
        if (d2 < hitR && d2 < bestDist) {
          bestDist = d2;
          best = n;
        }
      }
      return best;
    }

    function onMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      mouseInside = true;
      const hit = pick(mouseX, mouseY);
      const newId = hit?.id ?? null;
      if (newId !== hoveredId) {
        hoveredId = newId;
        if (hit) {
          setTooltip({ x: hit.x ?? mouseX, y: hit.y ?? mouseY, node: hit });
        } else {
          setTooltip(null);
        }
      } else if (hit) {
        setTooltip({ x: hit.x ?? mouseX, y: hit.y ?? mouseY, node: hit });
      }
    }
    function onLeave() {
      mouseInside = false;
      hoveredId = null;
      setTooltip(null);
    }

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    let raf = 0;
    let last = performance.now();

    // Offscreen canvas for bloom layer.
    const glow = document.createElement('canvas');
    const gctx = glow.getContext('2d')!;
    function syncGlowSize() {
      glow.width = Math.floor(width * dpr * 0.55);
      glow.height = Math.floor(height * dpr * 0.55);
      gctx.setTransform(dpr * 0.55, 0, 0, dpr * 0.55, 0, 0);
    }
    syncGlowSize();

    function renderEdges(target: CanvasRenderingContext2D, hovered: SimNode | null, strong: boolean) {
      for (const l of links) {
        const s = l.source;
        const t = l.target;
        if (s.x == null || s.y == null || t.x == null || t.y == null) continue;

        let strokeStyle: string;
        let lineWidth: number;
        if (hovered) {
          const incident = s.id === hovered.id || t.id === hovered.id;
          strokeStyle = incident ? COLOR.edgeStrong : COLOR.edgeMuted;
          lineWidth = (incident ? 1.6 : 0.7) * (strong ? 1.8 : 1);
        } else {
          strokeStyle = COLOR.edge;
          lineWidth = (0.6 + l.weight * 1.1) * (strong ? 1.8 : 1);
        }

        const layerAvg = (s.layer + t.layer) / 2;
        target.globalAlpha = (0.6 + layerAvg * 0.2) * (strong ? 0.8 : 1);

        const mx = (s.x + t.x) / 2;
        const my = (s.y + t.y) / 2;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const bow = Math.min(40, len * 0.18);
        const cx1 = mx + nx * bow;
        const cy1 = my + ny * bow;

        target.beginPath();
        target.moveTo(s.x, s.y);
        target.quadraticCurveTo(cx1, cy1, t.x, t.y);
        target.strokeStyle = strokeStyle;
        target.lineWidth = lineWidth;
        target.stroke();
      }
      target.globalAlpha = 1;
    }

    function renderNodes(target: CanvasRenderingContext2D, hovered: SimNode | null, neighbours: Set<string> | null, strong: boolean) {
      const sorted = [...nodes].sort((a, b) => a.layer - b.layer);
      for (const n of sorted) {
        if (n.x == null || n.y == null) continue;
        let state: 'on' | 'neighbour' | 'off' | 'none' = 'none';
        if (hovered) {
          if (n.id === hovered.id) state = 'on';
          else if (neighbours?.has(n.id)) state = 'neighbour';
          else state = 'off';
        }
        const baseR = nodeRadius(n);
        const r = baseR * (strong ? 1.4 : 1);
        const layerAlpha = (0.55 + n.layer * 0.22) * (strong ? 0.9 : 1);
        target.globalAlpha = state === 'off' ? 0.25 : layerAlpha;

        if (n.kind !== 'satellite' || state === 'on' || state === 'neighbour') {
          target.beginPath();
          target.arc(n.x, n.y, r * 2.6, 0, Math.PI * 2);
          target.fillStyle = nodeFill(n, state);
          target.globalAlpha *= 0.10;
          target.fill();
          target.globalAlpha = state === 'off' ? 0.25 : layerAlpha;
        }

        target.beginPath();
        target.arc(n.x, n.y, r, 0, Math.PI * 2);
        target.fillStyle = nodeFill(n, state);
        target.fill();

        if ((n.kind === 'primary' || n.kind === 'institution') && !strong) {
          target.beginPath();
          target.arc(n.x, n.y, baseR * 0.45, 0, Math.PI * 2);
          target.fillStyle = COLOR.bg;
          target.globalAlpha = 0.7;
          target.fill();
        }
      }
      target.globalAlpha = 1;
    }

    function draw(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      ctx!.clearRect(0, 0, width, height);

      // Ambient drift on satellite nodes — gentle, non-distracting.
      if (!reducedNow) {
        for (const n of nodes) {
          if (n.kind === 'satellite' && n.vx != null && n.vy != null) {
            const t = now / 1000;
            n.vx += Math.cos(t * 0.4 + n.phase * 6.28) * 0.012 * dt * 60;
            n.vy += Math.sin(t * 0.33 + n.phase * 6.28) * 0.012 * dt * 60;
          }
        }
      }

      const hovered = hoveredId ? nodeById.get(hoveredId) ?? null : null;
      const neighbours = hovered ? adjacency.get(hovered.id)! : null;

      // Bloom pass: render thicker, slightly transparent strokes onto offscreen canvas,
      // blur it, composite back additively. Cheap, GPU-accelerated cinematic glow.
      gctx.clearRect(0, 0, glow.width / (dpr * 0.55), glow.height / (dpr * 0.55));
      gctx.lineCap = 'round';
      renderEdges(gctx, hovered, true);
      renderNodes(gctx, hovered, neighbours, true);

      // Composite the blurred glow under the sharp layer.
      ctx!.save();
      ctx!.globalCompositeOperation = 'lighter';
      ctx!.filter = 'blur(10px)';
      ctx!.globalAlpha = 0.85;
      ctx!.drawImage(glow, 0, 0, width, height);
      ctx!.restore();

      ctx!.lineCap = 'round';
      renderEdges(ctx!, hovered, false);
      renderNodes(ctx!, hovered, neighbours, false);

      if (visible && !reducedNow) raf = requestAnimationFrame(draw);
    }

    if (reducedNow) {
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      intersectObs.disconnect();
      resizeObs.disconnect();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      sim.stop();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="molecular-network">
      <canvas ref={canvasRef} className="molecular-network__canvas" aria-label="Collaboration network" role="img" />
      {tooltip && (
        <div
          className="molecular-network__tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
          role="tooltip"
        >
          <div className="molecular-network__tt-name">{tooltip.node.name}</div>
          {tooltip.node.institution && (
            <div className="molecular-network__tt-inst">{tooltip.node.institution}</div>
          )}
        </div>
      )}
      <style>{`
        .molecular-network {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 24rem;
        }
        .molecular-network__canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          cursor: crosshair;
        }
        .molecular-network__tooltip {
          position: absolute;
          transform: translate(-50%, calc(-100% - 14px));
          background: rgba(8, 11, 17, 0.92);
          border: 1px solid rgba(196, 149, 106, 0.45);
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
          pointer-events: none;
          backdrop-filter: blur(6px);
          z-index: 5;
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #F7F4EE;
          font-size: 0.78rem;
          letter-spacing: 0.01em;
          white-space: nowrap;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .molecular-network__tt-name {
          font-weight: 600;
        }
        .molecular-network__tt-inst {
          font-family: 'JetBrains Mono', 'SF Mono', monospace;
          font-size: 0.68rem;
          color: rgba(247,244,238,0.6);
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
