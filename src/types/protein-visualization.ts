/**
 * Type definitions for the Protein Visualization component
 */

export interface ProteinVisualizationConfig {
  frameCount: number;
  frameBasePath: string;
  frameFormat: '.webp' | '.png' | '.jpg' | '.jpeg';
  scrollSensitivity: number;
  smoothingFactor: number;
  width?: number;
  height?: number;
}

export interface ProteinFrame {
  index: number;
  image: HTMLImageElement;
  loaded: boolean;
}

export interface ProteinStructureData {
  name: string;
  description: string;
  pdbId?: string;
  frameCount: number;
  defaultRotation?: number;
}

export interface AtomData {
  type: string;
  residue: string;
  chain: string;
  x: number;
  y: number;
  z: number;
  element: string;
  screenX?: number;
  screenY?: number;
  depth?: number;
}

export interface VisualizationState {
  currentFrame: number;
  targetFrame: number;
  isLoading: boolean;
  loadProgress: number;
  frames: ProteinFrame[];
}

export type FrameGeneratorOptions = {
  pdbId?: string;
  frameCount?: number;
  outputDir?: string;
  width?: number;
  height?: number;
  format?: 'webp' | 'png' | 'jpg' | 'jpeg';
  quality?: number;
};

export interface ScrollEvent {
  deltaY: number;
  timestamp: number;
  velocity: number;
}