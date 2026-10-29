// Prepares a fresh checkout for `wrangler dev`: the assets directory must exist (Vite serves the SPA in
// dev), and local secrets come from .dev.vars.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../../web/dist', import.meta.url), { recursive: true });

const devVars = new URL('../.dev.vars', import.meta.url);
if (!existsSync(devVars)) {
  copyFileSync(new URL('../.dev.vars.example', import.meta.url), devVars);
  console.log('Created apps/worker/.dev.vars from .dev.vars.example');
}
