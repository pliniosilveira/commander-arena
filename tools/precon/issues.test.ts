// The issues the workflow "Precon issues" opens, judged against a SYNTHETIC bulk file (tools/corpus/synthetic.ts): invented cards, no real precon.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { tempDir, writeForms } from '../corpus/fixture-files.ts';
import { syntheticCards } from '../corpus/synthetic.ts';
import { buildIssues } from './issues.ts';

const SUPPORTED = 'Commander\n1x SYNTHETIC Vanilla 1\n\nMainboard\n2x SYNTHETIC Vanilla 2\n';
const BLOCKED =
  'Commander\n1x SYNTHETIC Vanilla 1\n\nMainboard\n1x SYNTHETIC Glorper 1\n1x SYNTHETIC Does Not Exist\n';

describe('the issues of scanned decks', () => {
  test('a deck with a card the engine cannot run is a deck support issue, one the engine runs is a precon issue', async () => {
    const dir = await tempDir();
    const forms = await writeForms(syntheticCards(), dir);
    await writeFile(path.join(dir, '1.txt'), SUPPORTED);
    await writeFile(path.join(dir, '2.txt'), BLOCKED);
    await writeFile(
      path.join(dir, 'index.json'),
      JSON.stringify([
        { id: 1, name: 'Good Deck', file: '1.txt', cards: 3 },
        { id: 2, name: 'Blocked Deck', file: '2.txt', cards: 3 },
      ]),
    );
    const [good, blocked] = await buildIssues(dir, forms.gz);
    expect(good?.title).toBe('precon Good Deck');
    expect(good?.needsSupport).toBe(false);
    expect(blocked?.title).toBe('deck support Blocked Deck');
    expect(blocked?.body).toContain('Unsupported cards (1): SYNTHETIC Glorper 1');
    expect(blocked?.body).toContain('### SYNTHETIC Glorper 1');
    expect(blocked?.body).toContain('Names not found: SYNTHETIC Does Not Exist');
    expect(blocked?.body).toContain('1x SYNTHETIC Glorper 1');
  });
});
