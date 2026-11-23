// Mnemonic Deluge (issue 576): the real line read through the whole pipeline (with `~` for the card's own name), and near misses the grammar must not read.
import { describe, expect, test } from 'vitest';
import { read } from './parser-p5-helpers';

const REAL =
  'Exile target instant or sorcery card from a graveyard. Copy that card three times. You may cast the copies without paying their mana costs. Exile ~.';

describe('Mnemonic Deluge: exile a card, copy it three times, cast the copies free (CR 707.12, 118.9)', () => {
  test('the real line: exile, copyCardAndCast with three copies, then the spell exiles itself', () => {
    const parsed = read(REAL, 'sorcery');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.spell).toMatchObject({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'graveyard' } },
        },
      ],
    });
    const effect = parsed.spell?.effect as { effects: readonly { kind: string }[] } | undefined;
    const effects = effect?.effects ?? [];
    expect(effects.map((e) => e.kind).slice(0, 2)).toEqual(['exile', 'copyCardAndCast']);
    expect(effects[1]).toEqual({
      kind: 'copyCardAndCast',
      objects: { kind: 'moved' },
      times: 3,
    });
  });

  test.each([
    [
      'the copies are not cast',
      REAL.replace(' You may cast the copies without paying their mana costs.', ''),
    ],
    ['the copies are cast by paying', REAL.replace('without paying', 'by paying')],
    ['one copy', REAL.replace('three times', 'once')],
    ['only your graveyard', REAL.replace('from a graveyard', 'from your graveyard')],
  ])('not read: %s', (_why, text) => {
    const parsed = read(text, 'sorcery');
    expect(JSON.stringify(parsed.spell ?? null)).not.toContain('copyCardAndCast');
  });
});
