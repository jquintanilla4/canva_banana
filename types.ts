export enum Tool {
  SELECTION = 'SELECTION',
  PAN = 'PAN',
  ANNOTATE = 'ANNOTATE',
  INPAINT = 'INPAINT',
}

export type InpaintMode = 'STRICT' | 'CREATIVE';

export interface Point {
  x: number;
  y: number;
}

export interface Path {
  points: Point[];
  color: string;
  size: number;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CanvasImage {
  id: string;
  element: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  file: File;
}