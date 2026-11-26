// The default folder of the benchmark's baseline agent code (git ignores it): `tools/ai/baseline.ts`
// writes it, `tools/ai/benchmark.ts` reads it.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_BASELINE_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '.baseline');
