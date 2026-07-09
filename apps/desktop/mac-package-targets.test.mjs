import { describe, expect, it } from 'vitest';
import {
  assertPackagedPythonBackendTargetArch,
  assertSingleConcreteArch,
  expectedFileArchitectureForTarget,
  getFlagValue,
  getMacAppPath,
  resolveConcreteTargetArchs,
} from './scripts/mac-package-targets.mjs';

describe('mac package target helpers', () => {
  it('reads inline and separated flag values', () => {
    expect(getFlagValue(['--arch=x64'], ['--arch', '-a'])).toBe('x64');
    expect(getFlagValue(['-a', 'arm64'], ['--arch', '-a'])).toBe('arm64');
    expect(getFlagValue(['--platform', 'darwin'], ['--platform', '-p'])).toBe('darwin');
  });

  it('resolves Forge multi-arch input to concrete macOS app outputs', () => {
    expect(resolveConcreteTargetArchs('all', 'darwin', '42.4.1')).toEqual(['x64', 'arm64', 'universal']);
    expect(resolveConcreteTargetArchs('x64,arm64', 'darwin')).toEqual(['x64', 'arm64']);
    expect(resolveConcreteTargetArchs('x64, arm64', 'darwin')).toEqual(['x64', 'arm64']);
    expect(resolveConcreteTargetArchs('universal', 'darwin')).toEqual(['universal']);
  });

  it('uses Packager architecture data for all targets', () => {
    expect(resolveConcreteTargetArchs('all', 'linux', '42.4.1')).toContain('x64');
  });

  it('rejects direct verifier calls for non-concrete arch values', () => {
    expect(() => assertSingleConcreteArch('all')).toThrow('requires one concrete architecture');
    expect(() => assertSingleConcreteArch('x64,arm64')).toThrow('requires one concrete architecture');
    expect(() => assertSingleConcreteArch('arm64')).not.toThrow();
  });

  it('rejects macOS package targets that cannot match the packaged Python backend', () => {
    expect(() => assertPackagedPythonBackendTargetArch('arm64', 'darwin', 'arm64')).not.toThrow();
    expect(() => assertPackagedPythonBackendTargetArch('x64', 'linux', 'arm64')).not.toThrow();
    expect(() => assertPackagedPythonBackendTargetArch('x64', 'darwin', 'arm64')).toThrow('does not match host Python backend architecture');
    expect(() => assertPackagedPythonBackendTargetArch('universal', 'darwin', 'arm64')).toThrow('requires one concrete architecture');
    expect(() => assertPackagedPythonBackendTargetArch('all', 'darwin', 'arm64')).toThrow('requires one concrete architecture');
  });

  it('builds package output paths and file architecture expectations', () => {
    expect(getMacAppPath('/repo', 'darwin', 'arm64')).toBe('/repo/out/The Institute-darwin-arm64/The Institute.app');
    expect(expectedFileArchitectureForTarget('x64')).toBe('x86_64');
    expect(expectedFileArchitectureForTarget('arm64')).toBe('arm64');
  });
});
