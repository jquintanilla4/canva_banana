import { describe, expect, it } from 'vitest';
import { hasValidJimengMultiframePrompt, parseJimengMultiframeTransitionPrompts } from '../jimengMultiframe';

describe('Jimeng Multi-frame prompt helpers', () => {
  it('normalizes non-empty transition segments', () => {
    expect(parseJimengMultiframeTransitionPrompts(' First || || Second ')).toEqual(['First', 'Second']);
  });

  it.each([
    ['', 2, false],
    ['One transition', 2, true],
    ['One transition', 3, false],
    ['First || Second', 3, true],
    ['First || || Second', 3, true],
    ['First || Second || Third', 3, false],
  ])('validates %j for %i images', (prompt, imageCount, expected) => {
    expect(hasValidJimengMultiframePrompt(prompt, imageCount)).toBe(expected);
  });
});
