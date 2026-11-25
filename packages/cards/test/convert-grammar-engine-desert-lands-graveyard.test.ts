// "You may play Desert lands from your graveyard." (CR 305.1, 604.1, 205.3i): the land-type form of
// the graveyard land permission, for a land type that is not basic. Every card name starts with
// "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Plains', 'Swamp'] as const;

const shaper = parsed(
  'SYNTHETIC Parsed Dune Shaper',
  'Legendary Creature — Human',
  'You may play Desert lands from your graveyard.',
  { manaCost: '{4}{R}{G}', power: '5', toughness: '5', colors: ['R', 'G'] },
);
const desert = parsed('SYNTHETIC Parsed Desert', 'Land — Desert', '');

const board = (withShaper: boolean) => {
  let b = scenario()
    .define(shaper)
    .define(desert)
    .seat(0)
    .library(...FILLER)
    .graveyard(desert.name)
    .graveyard('Forest')
    .seat(1)
    .library(...FILLER)
    .graveyard(desert.name);
  b = b.seat(0);
  if (withShaper) b = b.battlefield(shaper.name);
  return b.at('precombatMain', { active: 0 }).build();
};

describe('"You may play Desert lands from your graveyard." (CR 305.1)', () => {
  test('a Desert land card of your graveyard is played as your land play', () => {
    const g = board(true);
    g.act(0).playLand({ name: desert.name, zone: 'graveyard', seat: 0 });
    g.expect.zone(desert.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('a land that is not a Desert stays in the graveyard', () => {
    const g = board(true);
    const forest = g.act(0).try.playLand({ name: 'Forest', zone: 'graveyard', seat: 0 });
    expect(forest.ok).toBe(false);
  });

  test("an opponent's graveyard is not used", () => {
    const g = board(true);
    const theirs = g.act(0).try.playLand({ name: desert.name, zone: 'graveyard', seat: 1 });
    expect(theirs.ok).toBe(false);
  });

  test('without the permanent no Desert is played from the graveyard', () => {
    const g = board(false);
    const none = g.act(0).try.playLand({ name: desert.name, zone: 'graveyard', seat: 0 });
    expect(none.ok).toBe(false);
  });
});
