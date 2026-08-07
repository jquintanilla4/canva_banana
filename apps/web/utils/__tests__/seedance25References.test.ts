import { describe, expect, it } from 'vitest';
import {
  getSeedance25AudioReferenceFileError,
  getSeedance25VideoReferenceFileError,
} from '../seedance25References';

const withSize = (file: File, size: number): File => {
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('Seedance 2.5 reference file validation', () => {
  it('accepts documented video formats and geometry', () => {
    expect(getSeedance25VideoReferenceFileError(new File(['video'], 'reference.mp4', { type: 'video/mp4' }), 1920, 1080)).toBeNull();
    expect(getSeedance25VideoReferenceFileError(new File(['video'], 'reference.mov', { type: 'video/quicktime' }), 720, 1280)).toBeNull();
    expect(getSeedance25VideoReferenceFileError(new File(['video'], 'reference', { type: 'video/mp4; codecs=avc1' }), 1920, 1080)).toBeNull();
    expect(getSeedance25VideoReferenceFileError(new File(['video'], 'reference.mov', { type: 'application/octet-stream' }), 720, 1280)).toBeNull();
  });

  it('rejects invalid video formats, sizes, dimensions, and aspect ratios', () => {
    expect(getSeedance25VideoReferenceFileError(new File(['video'], 'reference.webm', { type: 'video/webm' }))).toMatch(/MP4 or MOV/);
    expect(getSeedance25VideoReferenceFileError(new File(['video'], 'renamed.mp4', { type: 'video/webm' }))).toMatch(/MP4 or MOV/);
    expect(getSeedance25VideoReferenceFileError(withSize(new File([], 'reference.mp4', { type: 'video/mp4' }), 200 * 1024 * 1024 + 1))).toMatch(/200 MB/);
    expect(getSeedance25VideoReferenceFileError(new File([], 'reference.mp4', { type: 'video/mp4' }), 299, 400)).toMatch(/between 300 and 6,000/);
    expect(getSeedance25VideoReferenceFileError(new File([], 'reference.mp4', { type: 'video/mp4' }), 300, 1000)).toMatch(/between 0.4 and 2.5/);
  });

  it('accepts nominal NTSC rates and rejects frame rates outside 24 to 60 FPS', () => {
    const file = new File(['video'], 'reference.mp4', { type: 'video/mp4' });

    expect(getSeedance25VideoReferenceFileError(file, 1920, 1080, 23.976)).toBeNull();
    expect(getSeedance25VideoReferenceFileError(file, 1920, 1080, 59.94)).toBeNull();
    expect(getSeedance25VideoReferenceFileError(file, 1920, 1080, 23)).toMatch(/between 24 and 60 FPS/);
    expect(getSeedance25VideoReferenceFileError(file, 1920, 1080, 61)).toMatch(/between 24 and 60 FPS/);
  });

  it('accepts MP3/WAV audio and rejects invalid formats and oversized clips', () => {
    expect(getSeedance25AudioReferenceFileError(new File(['audio'], 'reference.mp3', { type: 'audio/mpeg' }))).toBeNull();
    expect(getSeedance25AudioReferenceFileError(new File(['audio'], 'reference.wav', { type: 'audio/wav' }))).toBeNull();
    expect(getSeedance25AudioReferenceFileError(new File(['audio'], 'reference.bin', { type: 'audio/wav; codecs=1' }))).toBeNull();
    expect(getSeedance25AudioReferenceFileError(new File(['audio'], 'reference.wav', { type: 'application/octet-stream' }))).toBeNull();
    expect(getSeedance25AudioReferenceFileError(new File(['audio'], 'reference.m4a', { type: 'audio/mp4' }))).toMatch(/MP3 or WAV/);
    expect(getSeedance25AudioReferenceFileError(new File(['audio'], 'renamed.wav', { type: 'audio/mp4' }))).toMatch(/MP3 or WAV/);
    expect(getSeedance25AudioReferenceFileError(withSize(new File([], 'reference.wav', { type: 'audio/wav' }), 15 * 1024 * 1024 + 1))).toMatch(/15 MB/);
  });
});
