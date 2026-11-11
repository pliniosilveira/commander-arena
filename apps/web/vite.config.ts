import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { readBuildInfo } from './build-info.ts';

const build = readBuildInfo(process.env);

export default defineConfig({
  // Relative base so the static build works from any path (GitHub Pages project sites).
  base: './',
  plugins: [react()],
  // The game Worker loads the hidden test decks as a chunk of their own (`game/precons.ts`), which
  // needs the code-splitting `es` format; it is already a module Worker (`game/client.ts`).
  worker: { format: 'es' },
  // The build identifier of the start screen's footer (`src/version.ts`, D-215).
  define: {
    __APP_COMMIT__: JSON.stringify(build.commit),
    __APP_COMMIT_DATE__: JSON.stringify(build.date),
  },
});
