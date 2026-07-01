import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRequiredPackageResources } from './scripts/verify-package-resources.mjs';

describe('package resources verifier', () => {
  it('requires staged app icon resources', () => {
    const desktopDir = '/repo/apps/desktop';
    const resources = getRequiredPackageResources(desktopDir);

    expect(resources).toContain(join(desktopDir, 'resources/app-icons/institute-preview.png'));
    expect(resources).toContain(join(desktopDir, 'resources/app-icons/institute-dock.png'));
  });
});
