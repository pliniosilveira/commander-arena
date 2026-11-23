// "{T}: Add one mana of any color among legendary creature cards in your graveyard." (The Grey Havens): the grammar reads the words into the engine's `anyColorAmong`
// production (CR 106.1b, 105.2, 605.3b), the engine validates what is lowered, and the near misses stop where they say. Lines are real Oracle wording of the card as given by
// the deck-support request; the other lines are SYNTHETIC variations of the same words.
import { type Ability, validateAbility } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const TAP = { kind: 'tap' } as const;
const abilities = (text: string): readonly Ability[] => readAll(text, 'land').abilities;
const among = (filter: Record<string, unknown>) => ({
  kind: 'mana',
  cost: [TAP],
  production: { kind: 'anyColorAmong', filter },
});

describe('effect.add-mana: one mana of any color among cards (CR 106.1b, 105.2)', () => {
  test('the line of The Grey Havens: legendary creature cards in your graveyard', () => {
    const read = abilities(
      '{T}: Add one mana of any color among legendary creature cards in your graveyard.',
    );
    expect(read).toEqual([
      among({
        zone: 'graveyard',
        types: ['creature'],
        supertypes: ['legendary'],
        controller: 'you',
      }),
    ]);
    for (const ability of read) expect(validateAbility(ability)).toEqual([]);
  });

  test('SYNTHETIC: cards of any kind in your graveyard, and in all graveyards', () => {
    expect(abilities('{T}: Add one mana of any color among cards in your graveyard.')).toEqual([
      among({ zone: 'graveyard', controller: 'you' }),
    ]);
    expect(
      abilities('{T}: Add one mana of any color among creature cards in all graveyards.'),
    ).toEqual([among({ zone: 'graveyard', types: ['creature'] })]);
  });

  test.each([
    // A library is hidden information: its colors are not read.
    '{T}: Add one mana of any color among cards in your library.',
    // The permanents of the battlefield are not cards of a zone this reading takes.
    '{T}: Add one mana of any color among creatures you control.',
    // A cost that gives up a permanent could change the colors read before it is paid.
    '{T}, Sacrifice a creature: Add one mana of any color among creature cards in your graveyard.',
    // The singular and a misspelt plural are not the words.
    '{T}: Add one mana of any color among creature card in your graveyard.',
    '{T}: Add one mana of any colors among creature cards in your graveyard.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'land')).toBeDefined();
  });

  test('an instruction of a spell has no color choice, so it is reported, never guessed', () => {
    const first = dropped(
      'Add one mana of any color among legendary creature cards in your graveyard.',
      'instant',
    );
    expect(first.reason).not.toBe('unrecognised');
  });
});
