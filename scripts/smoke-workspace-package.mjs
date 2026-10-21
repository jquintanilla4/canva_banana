import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'canva-workspace-consumer-'));
const run = (args, cwd = repoRoot, capture = false) => {
  const result = spawnSync('npm', args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed: ${result.stderr ?? result.error ?? result.status}`);
  return result.stdout;
};

run(['run', 'build:workspace']);
const packages = {};
const packedEntries = {};
for (const name of ['workspace', 'runtime']) {
  const [packed] = Object.values(JSON.parse(run(['pack', '-w', `@canva-banana/${name}`, '--pack-destination', directory, '--json'], repoRoot, true))); // npm returns an array or a package-keyed object.
  assert(packed.files.length > 0);
  assert(!packed.files.some(file => /(?:^|\/)\.env(?:\.|$)|node_modules|\.venv|__pycache__/.test(file.path)));
  if (name === 'workspace') assert(packed.files.some(file => file.path === 'dist/style.css'));
  packedEntries[`node_modules/@canva-banana/${name}`] = { version: packed.version, resolved: `file:${join(directory, packed.filename)}`, integrity: packed.integrity };
  packages[`@canva-banana/${name}`] = `file:${join(directory, packed.filename)}`;
}
await cp(join(repoRoot, 'test/consumer'), directory, { recursive: true });
const sourceLock = JSON.parse(await readFile(join(repoRoot, 'package-lock.json'), 'utf8'));
const exact = name => sourceLock.packages[`node_modules/${name}`].version;
const consumerPackage = { name: 'canva-banana-independent-smoke', version: '1.0.0', private: true, type: 'module',
  scripts: { build: 'vite build', dev: 'vite --host 127.0.0.1 --port 3100 --strictPort', typecheck: 'tsc --noEmit' },
  dependencies: { ...packages, react: exact('react'), 'react-dom': exact('react-dom') },
  devDependencies: { vite: exact('vite'), typescript: exact('typescript'), '@types/react': exact('@types/react'), '@types/react-dom': exact('@types/react-dom') },
};
await writeFile(join(directory, 'package.json'), JSON.stringify(consumerPackage, null, 2));
const lockedPackages = Object.fromEntries(Object.entries(sourceLock.packages).filter(([name, value]) => name.startsWith('node_modules/') && !value.link));
await writeFile(join(directory, 'package-lock.json'), JSON.stringify({ name: consumerPackage.name, version: '1.0.0', lockfileVersion: 3, requires: true,
  packages: { '': consumerPackage, ...lockedPackages, ...packedEntries },
}, null, 2)); // Reuse the verified dependency lock instead of resolving newer registry metadata during a packaging test.
await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, skipLibCheck: false, lib: ['ES2022', 'DOM'], noUncheckedSideEffectImports: true }, include: ['main.tsx'] }));
run(['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'], directory);
run(['run', 'typecheck'], directory);
run(['run', 'build'], directory);
const runtimeSmoke = spawnSync(process.execPath, ['runtime-smoke.mjs'], { cwd: directory, stdio: 'inherit' });
assert.equal(runtimeSmoke.status, 0, 'Installed runtime smoke failed');
const entry = resolve(directory, 'node_modules/@canva-banana/workspace/dist/workspace.js');
const code = await readFile(entry, 'utf8');
assert(!/process\.env\.(?:API_KEY|GEMINI_API_KEY|SECURE_BACKEND_API_BASE_URL|JIMENG_API_BASE_URL|VOLCENGINE_API_BASE_URL)/.test(code), 'Browser distribution must not need host environment substitutions');
assert(!code.includes(repoRoot), 'Distribution must not depend on the source checkout');
console.log(`Independent consumer ready: ${directory}`);
await writeFile('/tmp/canva-workspace-consumer-path', directory);

// Prove a new private artifact replaces installed implementation without source aliases or edits to host controls.
const upgradeDirectory = join(directory, 'upgrade-artifact');
await mkdir(upgradeDirectory);
await cp(join(directory, 'node_modules/@canva-banana/workspace'), upgradeDirectory, { recursive: true });
const upgradeManifest = JSON.parse(await readFile(join(upgradeDirectory, 'package.json'), 'utf8'));
upgradeManifest.version = `${upgradeManifest.version}-upgrade-smoke`;
await writeFile(join(upgradeDirectory, 'package.json'), JSON.stringify(upgradeManifest));
await writeFile(join(upgradeDirectory, 'dist/workspace.js'), `${await readFile(entry, 'utf8')}\nexport const packageUpgradeSmoke = 'new-artifact';\n`);
const [upgrade] = Object.values(JSON.parse(run(['pack', '--pack-destination', directory, '--json'], upgradeDirectory, true)));
run(['install', '--save-exact', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund', join(directory, upgrade.filename)], directory);
const upgradedEntry = await readFile(entry, 'utf8');
assert(upgradedEntry.includes("export const packageUpgradeSmoke = 'new-artifact'"));
assert.equal(JSON.parse(await readFile(join(directory, 'node_modules/@canva-banana/workspace/package.json'), 'utf8')).version, upgradeManifest.version);
run(['run', 'typecheck'], directory);
run(['run', 'build'], directory);
run(['install', '--save-exact', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund', packages['@canva-banana/workspace'].slice(5)], directory);
assert(!((await readFile(entry, 'utf8')).includes('packageUpgradeSmoke')));
console.log('Private artifact upgrade and rollback passed (synthetic implementation marker; host source unchanged).');
