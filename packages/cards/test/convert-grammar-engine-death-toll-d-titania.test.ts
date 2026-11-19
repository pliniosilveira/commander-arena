// Death Toll deck, group D: "You may play Forests from your graveyard." (CR 305.1, 601.2a, 113.6, 604.1): a static ability that lets its controller play land cards of the named kind from
// their graveyard, as often as the land plays of the turn allow (no "once each turn": the permission is not used up). The wording is that of Titania, Nature's Force; every card name
// starts with "SYNTHETIC". Ruling 2022-10-14: it does not change when lands may be played, nor how many.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Plains', 'Swamp'] as const;

const titania = parsed(
  'SYNTHETIC Parsed Titania',
  'Legendary Creature — Elemental',
  'You may play Forests from your graveyard.',
  { manaCost: '{4}{G}{G}', power: '6', toughness: '6', colors: ['G'] },
);
const fields = parsed(
  'SYNTHETIC Parsed Fields',
  'Enchantment',
  'You may play an additional land on each of your turns.',
  { manaCost: '{2}{G}', colors: ['G'] },
);

const board = (permanents: readonly string[] = [titania.name]) => {
  let b = scenario()
    .define(titania)
    .define(fields)
    .seat(0)
    .library(...FILLER)
    .graveyard('Forest', { count: 2 })
    .graveyard('Island')
    .seat(1)
    .library(...FILLER)
    .graveyard('Forest');
  b = b.seat(0);
  for (const name of permanents) b = b.battlefield(name);
  return b.at('precombatMain', { active: 0 }).build();
};

describe('"You may play Forests from your graveyard." (CR 305.1)', () => {
  test('a Forest card of your graveyard is played onto the battlefield, as your land play of the turn', () => {
    const g = board();
    g.act(0).playLand({ name: 'Forest', zone: 'graveyard', seat: 0, nth: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 1 });
    expect(g.state.seats[0]?.graveyard).toHaveLength(2);
    g.expect.invariants();
  });

  test('only one land is played a turn: the second Forest waits (ruling 2022-10-14)', () => {
    const g = board();
    g.act(0).playLand({ name: 'Forest', zone: 'graveyard', seat: 0, nth: 0 });
    const second = g.act(0).try.playLand({ name: 'Forest', zone: 'graveyard', seat: 0, nth: 0 });
    expect(second.ok).toBe(false);
  });

  test('with an additional land play the permission is not used up by the first: two Forests in one turn', () => {
    const g = board([titania.name, fields.name]);
    g.act(0).playLand({ name: 'Forest', zone: 'graveyard', seat: 0, nth: 0 });
    g.act(0).playLand({ name: 'Forest', zone: 'graveyard', seat: 0, nth: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 2 });
    g.expect.invariants();
  });

  test('a land that is not a Forest stays in the graveyard', () => {
    const g = board();
    const island = g.act(0).try.playLand({ name: 'Island', zone: 'graveyard', seat: 0 });
    expect(island.ok).toBe(false);
  });

  test('without the permanent no land is played from the graveyard', () => {
    const g = board([]);
    const forest = g.act(0).try.playLand({ name: 'Forest', zone: 'graveyard', seat: 0, nth: 0 });
    expect(forest.ok).toBe(false);
  });

  test('only your own graveyard: a Forest in the graveyard of an opponent is not played', () => {
    const g = board();
    const theirs = g.act(0).try.playLand({ name: 'Forest', zone: 'graveyard', seat: 1 });
    expect(theirs.ok).toBe(false);
  });

  test('"You may play lands from your graveyard." (no land type named): any land card of the graveyard', () => {
    const excavator = parsed(
      'SYNTHETIC Parsed Excavator',
      'Creature — Elemental',
      'You may play lands from your graveyard.',
      { manaCost: '{2}{G}', power: '2', toughness: '3', colors: ['G'] },
    );
    const g = scenario()
      .define(excavator)
      .seat(0)
      .library(...FILLER)
      .graveyard('Island')
      .battlefield(excavator.name)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).playLand({ name: 'Island', zone: 'graveyard', seat: 0 });
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});
