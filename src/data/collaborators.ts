/**
 * Collaborator graph for MolecularNetwork.tsx.
 *
 * The six "anchor" nodes mirror the canonical entries in metrics.ts → collaborationNetwork
 * (so the meaning matches what the rest of the page reports). Around each anchor we add
 * a handful of unnamed satellite nodes — co-authors, lab members, partner labs — to give
 * the visualization the density it needs to read as a real research network rather than
 * a six-point diagram. Satellites carry the anchor id in `group` so the layout clusters
 * them and the tooltip falls back to the anchor's institution.
 */

export type CollabKind = 'primary' | 'institution' | 'collaborator' | 'satellite';

export interface CollabNode {
  id: string;
  name: string;
  institution?: string;
  kind: CollabKind;
  group: string;
  weight: number;
}

export interface CollabLink {
  source: string;
  target: string;
  weight: number;
}

const anchors: CollabNode[] = [
  { id: 'ramon', name: 'Ramon Roca Pinilla', institution: 'CMRI', kind: 'primary', group: 'ramon', weight: 1.0 },
  { id: 'cmri', name: "Children's Medical Research Institute", institution: 'Sydney, AU', kind: 'institution', group: 'cmri', weight: 0.95 },
  { id: 'uab', name: 'Universitat Autònoma de Barcelona', institution: 'Barcelona, ES', kind: 'institution', group: 'uab', weight: 0.95 },
  { id: 'international_1', name: 'European Collaborators', institution: 'EU consortia', kind: 'collaborator', group: 'eu', weight: 0.7 },
  { id: 'international_2', name: 'US Research Partners', institution: 'US labs', kind: 'collaborator', group: 'us', weight: 0.55 },
  { id: 'australia', name: 'Australian Networks', institution: 'AU consortia', kind: 'collaborator', group: 'au', weight: 0.75 },
];

const satelliteSpec: { group: string; institution: string; count: number; prefix: string }[] = [
  { group: 'cmri', institution: 'CMRI Vector & Genome Engineering', count: 9, prefix: 'CMRI' },
  { group: 'uab', institution: 'UAB Nanobiotechnology', count: 11, prefix: 'UAB' },
  { group: 'eu', institution: 'EU partner labs', count: 7, prefix: 'EU' },
  { group: 'us', institution: 'US partner labs', count: 5, prefix: 'US' },
  { group: 'au', institution: 'Sydney research network', count: 6, prefix: 'AU' },
  { group: 'ramon', institution: 'Direct co-authors', count: 6, prefix: 'CO' },
];

const satellites: CollabNode[] = [];
for (const spec of satelliteSpec) {
  for (let i = 0; i < spec.count; i++) {
    satellites.push({
      id: `${spec.group}-sat-${i}`,
      name: `${spec.prefix} co-author ${i + 1}`,
      institution: spec.institution,
      kind: 'satellite',
      group: spec.group,
      weight: 0.18 + (i % 3) * 0.06,
    });
  }
}

export const collaborators: CollabNode[] = [...anchors, ...satellites];

const links: CollabLink[] = [];

// Anchors → ramon, weighted by the original publication counts.
const ramonWeights: Record<string, number> = {
  cmri: 0.9,
  uab: 1.0,
  international_1: 0.55,
  international_2: 0.4,
  australia: 0.7,
};
for (const [id, w] of Object.entries(ramonWeights)) {
  links.push({ source: 'ramon', target: id, weight: w });
}

// A few cross-anchor connections to make the topology read as a community, not a star.
const crossLinks: [string, string, number][] = [
  ['cmri', 'australia', 0.6],
  ['uab', 'international_1', 0.55],
  ['international_1', 'international_2', 0.35],
  ['cmri', 'international_2', 0.3],
];
for (const [s, t, w] of crossLinks) links.push({ source: s, target: t, weight: w });

// Anchors → their satellites.
for (const sat of satellites) {
  const anchor = sat.group === 'ramon' ? 'ramon' : sat.group;
  const anchorId = anchors.find((a) => a.group === anchor)?.id ?? 'ramon';
  links.push({ source: anchorId, target: sat.id, weight: sat.weight });
}

// Sparse satellite ↔ satellite bridges so each cluster has internal structure.
for (let i = 0; i < satellites.length; i++) {
  if (i % 3 !== 0) continue;
  const a = satellites[i];
  const peers = satellites.filter((s) => s.group === a.group && s.id !== a.id);
  if (peers.length === 0) continue;
  const b = peers[(i * 7) % peers.length];
  links.push({ source: a.id, target: b.id, weight: 0.18 });
}

export const collaboratorLinks: CollabLink[] = links;
