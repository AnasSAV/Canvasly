// Prints the numbers behind the charts in the README, so that they can be checked and refreshed rather than trusted.
// Run after a build, to include bundle sizes: pnpm build && node scripts/repo-stats.mjs
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const LANGUAGES = {
  ts: 'TypeScript',
  tsx: 'TypeScript (React)',
  mjs: 'JavaScript',
  css: 'CSS',
  sql: 'SQL',
};

const files = execSync('git ls-files', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((f) => !/pnpm-lock|worker-configuration\.d\.ts/.test(f));

const nonBlankLines = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim()).length;

const byLanguage = {};
const byArea = {};
for (const file of files) {
  const language = LANGUAGES[file.split('.').pop()];
  if (!language) continue;
  const lines = nonBlankLines(file);
  byLanguage[language] = (byLanguage[language] ?? 0) + lines;
  if (!/\.tsx?$/.test(file)) continue;
  const area = /\.test\.ts$|\/e2e\//.test(file)
    ? 'Tests'
    : file.startsWith('apps/web')
      ? 'Web app'
      : file.startsWith('apps/worker')
        ? 'Worker'
        : file.startsWith('packages/shared')
          ? 'Shared library'
          : null;
  if (area) byArea[area] = (byArea[area] ?? 0) + lines;
}

console.log('Lines of code by language', byLanguage);
console.log('Lines of TypeScript by area', byArea);

const assets = 'apps/web/dist/assets';
if (existsSync(assets)) {
  const kb = (bytes) => Math.round(bytes / 1024);
  console.log('Bundles, gzipped KB:');
  for (const file of readdirSync(assets).filter((f) => /\.(js|mjs|css)$/.test(f))) {
    console.log(`  ${file}: ${kb(gzipSync(readFileSync(join(assets, file))).length)}`);
  }
}
