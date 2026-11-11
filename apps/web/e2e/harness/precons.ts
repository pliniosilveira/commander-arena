import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The ids of the precon snapshots in the checkout (apps/web/src/precons/snapshots/<id>.json). The
 * menu lists exactly these (D-137).
 */
export function installedPrecons(): string[] {
  const folder = fileURLToPath(new URL('../../src/precons/snapshots/', import.meta.url));
  return readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}
