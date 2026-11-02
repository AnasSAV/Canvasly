// Builds what gets published: a clean `release/` folder with the bundled library and a public package.json.
// Inside this monorepo the package is `@canvasly/shared` and exports TypeScript source; GitHub Packages needs the
// owner's scope, and everyone else needs JavaScript and type declarations.
//
// Usage: node scripts/prepare-publish.mjs <version>
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2]?.replace(/^v/, '');
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('Usage: prepare-publish.mjs <version>, like 1.0.0');
  process.exit(1);
}

const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const release = join(root, 'release');
rmSync(release, { recursive: true, force: true });
mkdirSync(release);
cpSync(join(root, 'dist'), join(release, 'dist'), { recursive: true });
cpSync(join(root, 'README.md'), join(release, 'README.md'));
cpSync(join(root, '..', '..', 'LICENSE'), join(release, 'LICENSE'));

const pkg = {
  name: '@anassav/canvasly-shared',
  version,
  description: source.description,
  license: source.license,
  author: source.author,
  repository: source.repository,
  homepage: source.homepage,
  bugs: source.bugs,
  keywords: source.keywords,
  type: 'module',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
  files: ['dist'],
  sideEffects: false,
  dependencies: source.dependencies,
  peerDependencies: source.peerDependencies,
  publishConfig: { registry: 'https://npm.pkg.github.com', access: 'public' },
};
writeFileSync(join(release, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Prepared ${pkg.name}@${version} in ${release}`);
