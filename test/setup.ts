import { afterAll, beforeAll, vi } from 'vitest';

const hasCanvasElement = typeof HTMLCanvasElement !== 'undefined';
const originalGetContext = hasCanvasElement ? HTMLCanvasElement.prototype.getContext : null;

beforeAll(() => {
  if (!hasCanvasElement) {
    return; // Node-only tests do not provide canvas globals.
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    rect: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    roundRect: vi.fn(),
    arc: vi.fn(),
    setLineDash: vi.fn(),
    measureText: () => ({ width: 0 }),
    font: '',
    textBaseline: '',
    textAlign: '',
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterAll(() => {
  if (!hasCanvasElement || !originalGetContext) {
    return; // Nothing was patched in Node-only tests.
  }
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});
