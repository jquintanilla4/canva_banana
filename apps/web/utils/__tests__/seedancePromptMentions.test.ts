import { describe, expect, it } from 'vitest';

import { convertReferencePromptMentionsToVolcengineTokens } from '../seedancePromptMentions';

describe('convertReferencePromptMentionsToVolcengineTokens', () => {
  it('converts canonical mentions to the Ark-mandated Chinese tokens', () => {
    expect(convertReferencePromptMentionsToVolcengineTokens('Replace the bottle in @Video1 with @Image2 and keep @Audio1.'))
      .toBe('Replace the bottle in 视频1 with 图片2 and keep 音频1.');
  });

  it('normalizes typed aliases before converting', () => {
    expect(convertReferencePromptMentionsToVolcengineTokens('@video 1 then @ image 2'))
      .toBe('视频1 then 图片2');
  });

  it('leaves prompts without mentions untouched', () => {
    expect(convertReferencePromptMentionsToVolcengineTokens('A calm product shot.'))
      .toBe('A calm product shot.');
  });
});
