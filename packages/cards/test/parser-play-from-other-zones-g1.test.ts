// The wordings of "play lands from your graveyard" and "play an additional land" cards, read through the grammar alone: each text is fully
// supported (no unparsed ability, no reason). Names are SYNTHETIC; the wording is the real Oracle text.
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const CASES: readonly (readonly [string, string, string, string])[] = [
  [
    'Graveyard lands with unearth',
    'Artifact Creature — Elemental',
    '{5}',
    'You may play lands from your graveyard.\nUnearth {G}{G}',
  ],
  [
    'Graveyard lands with reach',
    'Creature — Elemental',
    '{4}{G}{G}',
    'Reach\nYou may play lands from your graveyard.',
  ],
  [
    'Desert lands',
    'Legendary Creature — Human',
    '{4}{R}{G}',
    'You may play Desert lands from your graveyard.',
  ],
  [
    'Exile five and play',
    'Sorcery',
    '{3}{R}{G}',
    'Exile the top five cards of your library. You may play cards exiled this way until the end of your next turn. You may play an additional land this turn.',
  ],
  [
    'Extra land and draw',
    'Sorcery',
    '{1}{G}',
    'You may play an additional land this turn.\nDraw a card.',
  ],
  [
    'Top of library lands',
    'Creature — Elf Druid',
    '{3}{G}',
    'You may play an additional land on each of your turns.\nPlay with the top card of your library revealed.\nYou may play lands from the top of your library.',
  ],
];

describe('play lands and cards from other zones (group G1)', () => {
  test.each(CASES)('SYNTHETIC %s is supported', (name, typeLine, manaCost, oracleText) => {
    const imported = parseOnly(
      syntheticCard({
        name: `SYNTHETIC ${name}`,
        typeLine,
        manaCost,
        oracleText,
        ...(typeLine.includes('Creature') ? { power: '2', toughness: '2' } : {}),
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });
});
