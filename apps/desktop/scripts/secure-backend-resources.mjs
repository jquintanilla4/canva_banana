import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const runtimeDir = resolve(repoRoot, 'packages/runtime');
const moduleRoots = [resolve(runtimeDir, 'node_modules'), resolve(repoRoot, 'node_modules')];
const readManifest = path => JSON.parse(readFileSync(path, 'utf8'));
const runtimeManifestPath = resolve(runtimeDir, 'package.json');
const runtimeModules = readManifest(runtimeManifestPath).files
  .filter(path => path.startsWith('node/') && path.endsWith('.mjs'))
  .map(path => path.slice('node/'.length));

const getRuntimePackages = () => {
  const packages = new Map();
  const visit = manifestPath => {
    const manifest = readManifest(manifestPath);
    const require = createRequire(manifestPath);
    const dependencyNames = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}).filter(name => !manifest.peerDependenciesMeta?.[name]?.optional),
    ]);
    for (const name of dependencyNames) {
      const candidateDirs = require.resolve.paths(name) ?? [];
      const candidates = candidateDirs.flatMap(dir => moduleRoots.flatMap(root => {
        const fromRoot = relative(root, dir);
        return fromRoot.startsWith('..') || isAbsolute(fromRoot) ? [] : [{
          source: resolve(dir, name),
          target: join(fromRoot, name),
        }];
      }));
      const dependency = candidates.find(({ source }) => existsSync(resolve(source, 'package.json')));
      if (!dependency) {
        if (name in (manifest.optionalDependencies ?? {})) continue;
        throw new Error(`Missing production dependency ${name} for ${manifest.name}.`);
      }
      const existing = packages.get(dependency.target);
      if (existing?.source === dependency.source) continue;
      if (existing) throw new Error(`Conflicting installed versions of ${name} for the desktop backend.`);
      packages.set(dependency.target, dependency);
      visit(resolve(dependency.source, 'package.json'));
    }
  };
  visit(runtimeManifestPath);
  return [...packages.values()];
};

export const getRequiredSecureBackendResources = destination => [
  ...runtimeModules.map(path => resolve(destination, path)),
  ...getRuntimePackages().map(({ target }) => resolve(destination, 'node_modules', target, 'package.json')),
  resolve(destination, 'node_modules/openai/index.mjs'),
  resolve(destination, 'node_modules/@google/genai/dist/node/index.mjs'),
];

export const stageSecureBackend = async destination => {
  const packages = getRuntimePackages();
  await mkdir(destination, { recursive: true });
  await Promise.all(runtimeModules.map(path => cp(resolve(runtimeDir, 'node', path), resolve(destination, path))));
  for (const { source, target } of packages) {
    await cp(source, resolve(destination, 'node_modules', target), {
      recursive: true,
      filter: path => basename(path) !== 'node_modules',
    });
  }
};
