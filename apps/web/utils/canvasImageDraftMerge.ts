import type { CanvasImage } from '../types';

const hasOwn = (value: CanvasImage, key: keyof CanvasImage): boolean =>
  Object.prototype.hasOwnProperty.call(value, key); // Optional fields can be intentionally removed by a staged edit.

const applyStagedImageChanges = (
  baseline: CanvasImage,
  staged: CanvasImage,
  latest: CanvasImage,
): CanvasImage => {
  const keys = new Set<keyof CanvasImage>([
    ...(Object.keys(baseline) as Array<keyof CanvasImage>),
    ...(Object.keys(staged) as Array<keyof CanvasImage>),
  ]); // Compare every top-level field while keeping nested media objects untouched.
  let merged = latest;

  keys.forEach(key => {
    if (key === 'id') {
      return;
    }
    const baselineHasKey = hasOwn(baseline, key);
    const stagedHasKey = hasOwn(staged, key);
    if (baselineHasKey === stagedHasKey && Object.is(baseline[key], staged[key])) {
      return;
    }
    if (merged === latest) {
      merged = { ...latest }; // Clone only an image that the live edit actually changed.
    }
    if (!stagedHasKey) {
      Reflect.deleteProperty(merged, key);
      return;
    }
    Object.assign(merged, { [key]: staged[key] });
  });

  return merged;
};

export const mergeCanvasImageDraft = (
  baseline: CanvasImage[],
  staged: CanvasImage[],
  latest: CanvasImage[],
): CanvasImage[] => {
  const baselineById = new Map(baseline.map(image => [image.id, image]));
  const stagedById = new Map(staged.map(image => [image.id, image]));
  const latestIds = new Set(latest.map(image => image.id));
  const merged = latest.map(latestImage => {
    const baselineImage = baselineById.get(latestImage.id);
    const stagedImage = stagedById.get(latestImage.id);
    if (!baselineImage || !stagedImage) {
      return latestImage; // Preserve concurrent additions and never infer deletion from draft omission.
    }
    return applyStagedImageChanges(baselineImage, stagedImage, latestImage);
  });

  staged.forEach(stagedImage => {
    if (!baselineById.has(stagedImage.id) && !latestIds.has(stagedImage.id)) {
      merged.push(stagedImage); // Keep a genuinely new staged item exactly once.
    }
  });

  return merged;
};

export const extendCanvasImageDraftBaseline = (
  baseline: CanvasImage[],
  latest: CanvasImage[],
): CanvasImage[] => {
  const baselineIds = new Set(baseline.map(image => image.id));
  const additions = latest.filter(image => !baselineIds.has(image.id));
  return additions.length > 0 ? [...baseline, ...additions] : baseline; // Capture each arriving item once for later three-way merges.
};
