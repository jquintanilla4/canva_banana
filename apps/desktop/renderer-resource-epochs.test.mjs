import { describe, expect, it } from 'vitest';
import { createRendererResourceEpochs } from './renderer-resource-epochs.mjs';

describe('renderer resource epochs', () => {
  it('invalidates resources from the disappeared renderer generation', () => {
    const epochs = createRendererResourceEpochs();
    const firstDocument = epochs.capture(7);
    const invalidation = epochs.invalidate(7);
    const reloadedDocument = epochs.capture(7);

    expect(epochs.isCurrent(firstDocument)).toBe(false);
    expect(epochs.wasInvalidated(firstDocument, invalidation)).toBe(true);
    expect(epochs.isCurrent(reloadedDocument)).toBe(true);
    expect(epochs.wasInvalidated(reloadedDocument, invalidation)).toBe(false);
    expect(() => epochs.assertCurrent(firstDocument, 'stale renderer')).toThrow('stale renderer');
    expect(epochs.assertCurrent(reloadedDocument)).toBe(reloadedDocument);
  });

  it('does not invalidate another renderer or confuse repeated generations', () => {
    const epochs = createRendererResourceEpochs();
    const otherRenderer = epochs.capture(8);
    const firstInvalidation = epochs.invalidate(7);
    const secondDocument = epochs.capture(7);
    const secondInvalidation = epochs.invalidate(7);

    expect(epochs.wasInvalidated(otherRenderer, secondInvalidation)).toBe(false);
    expect(epochs.wasInvalidated(secondDocument, firstInvalidation)).toBe(false);
    expect(epochs.wasInvalidated(secondDocument, secondInvalidation)).toBe(true);
    expect(epochs.isSame(otherRenderer, epochs.capture(8))).toBe(true);
  });

  it('rejects an owner captured before an async dialog outlives its document', async () => {
    const epochs = createRendererResourceEpochs();
    const dialogOwner = epochs.capture(7);
    const dialogResult = Promise.resolve().then(() => {
      epochs.invalidate(7);
      return { canceled: false, filePaths: ['/tmp/large.bcsnap'] };
    });

    await expect(dialogResult.then(() => epochs.assertCurrent(dialogOwner, 'stale dialog'))).rejects.toThrow('stale dialog');
  });
});
