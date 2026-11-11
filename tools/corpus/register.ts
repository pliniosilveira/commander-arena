// Installs the resolution hooks of ts-resolve-hooks.ts for the rest of this process. Import this
// module first (`import './register.ts'`), then load anything that reaches a workspace package
// with a dynamic `await import(...)`: static imports are resolved before this code runs.

import { register } from 'node:module';

register('./ts-resolve-hooks.ts', import.meta.url);
