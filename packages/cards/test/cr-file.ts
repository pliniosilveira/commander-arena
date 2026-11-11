// Where the tests of this package read the Comprehensive Rules text from (D-246): the file `COMMANDER_ARENA_CR_FILE` names, else the
// repository's own ignored path, which `pnpm rules:fetch` fills. The tests that need it skip when the file is not there.
import { fileURLToPath } from 'node:url';

export const CR_PATH: string =
  process.env.COMMANDER_ARENA_CR_FILE ??
  fileURLToPath(new URL('../../../docs/rules/comprehensive-rules.txt', import.meta.url));
