// Parsed text is only worth something if the engine runs it as written (stage P39). These tests import SYNTHETIC cards through the grammar (never through a
// fixture), define them in an engine scenario and play them through applyAction: the Korvold deck's mana-spent slice of D-183 and D-184 (ENGINE_VERSION
// 40). The amount of mana spent to cast a spell, read in its own cast trigger, and the creatures that enter with a counter for each mana from an artifact
// source spent to cast them. Every card name starts with "SYNTHETIC"; the wording of each text is that of the real cards of the slice (the owner's request
// file of 2026-10-29, names replaced by ~). No real card's text is claimed.
import { validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const RING = 'Sol Ring';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const named = (g: ScenarioGame, name: string, seat: 0 | 1 = 0): number =>
  g.find({ name, zone: 'battlefield', seat }).length;

describe('"When you cast this spell, create X 0/1 red Kobold creature tokens named Kobolds of Kher Keep, where X is the amount of mana spent to cast it."', () => {
  const dragon = parsed(
    'SYNTHETIC Parsed Dragon',
    'Legendary Creature — Dragon',
    'When you cast this spell, create X 0/1 red Kobold creature tokens named Kobolds of Kher Keep, where X is the amount of mana spent to cast it.\nFlying\nSacrifice another creature: ~ gets +1/+0 until end of turn.',
    { manaCost: '{3}{B}{R}{G}', colors: ['B', 'R', 'G'], power: '5', toughness: '5' },
  );
  const play = (lands: readonly string[], more: readonly string[] = []) => {
    const b = scenario()
      .seat(0)
      .define(dragon)
      .hand(dragon.name)
      .battlefield(...lands, ...more)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER);
    return b.at('precombatMain').build();
  };
  const SIX = ['Swamp', 'Mountain', 'Forest', 'Plains', 'Plains', 'Plains'];

  test('is valid', () => {
    expect(validateCard(dragon)).toEqual([]);
  });

  test('six mana spent: six Kobolds named as the card says, then the Dragon', () => {
    const g = play(SIX);
    g.act(0).cast(dragon.name, { pay: true });
    g.expect.stack([`${dragon.name} (ability)`, dragon.name]);
    g.passAll();
    expect(named(g, 'Kobolds of Kher Keep')).toBe(6);
    g.expect.zone(dragon.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('only what was spent: a seventh source stays untapped and is not counted', () => {
    const g = play([...SIX, 'Forest']);
    g.act(0).cast(dragon.name, { pay: true });
    g.passAll();
    expect(named(g, 'Kobolds of Kher Keep')).toBe(6);
    g.expect.tapped('Forest[1]', false);
  });

  test('countered in response, the trigger still counts what was spent (last-known information)', () => {
    const g = scenario()
      .seat(0)
      .define(dragon)
      .hand(dragon.name)
      .battlefield(...SIX)
      .library(...FILLER)
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(dragon.name, { pay: true });
    g.pass();
    g.act(1).cast('Counterspell', { targets: [{ name: dragon.name, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.zone(dragon.name, 'graveyard', { seat: 0 });
    expect(named(g, 'Kobolds of Kher Keep')).toBe(6);
  });

  test('the sacrifice ability is the one the card says: another creature, +1/+0 until end of turn', () => {
    const g = play(SIX);
    g.act(0).cast(dragon.name, { pay: true });
    g.passAll();
    g.act(0).activate(dragon.name);
    g.act(0).choosePermanents({ name: 'Kobolds of Kher Keep', nth: 0 });
    g.passAll();
    g.expect.pt(dragon.name, 6, 5);
    expect(named(g, 'Kobolds of Kher Keep')).toBe(5);
  });
});

describe('"Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it."', () => {
  const coin = parsed(
    'SYNTHETIC Parsed Coin',
    'Artifact',
    'Each creature you control enters with an additional +1/+1 counter on it for each mana from an artifact source spent to cast it.\n{T}: Create a Treasure token.',
    { manaCost: '{4}' },
  );
  const play = (spell: string, ...permanents: string[]) =>
    scenario()
      .seat(0)
      .define(coin)
      .hand(spell)
      .battlefield(coin.name, ...permanents)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('is valid', () => {
    expect(validateCard(coin)).toEqual([]);
  });

  test('Sol Ring pays two of the four mana of a Spider: two counters', () => {
    const g = play(SPIDER, RING, 'Forest', 'Forest');
    g.act(0).cast(SPIDER).payManual([RING, 'Forest[0]', 'Forest[1]']);
    g.passAll();
    g.expect.counters(SPIDER, { '+1/+1': 2 });
  });

  test('a Treasure that the Coin made pays one mana of a Bears: one counter', () => {
    const g = play(BEARS, 'Forest');
    g.act(0).activate(coin.name);
    g.passAll();
    g.act(0)
      .cast(BEARS)
      .payManual(['Forest', { source: 'Treasure', color: 'G' }]);
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 1 });
    g.expect.pt(BEARS, 3, 3);
  });

  test('lands alone: nothing', () => {
    const g = play(BEARS, 'Forest', 'Forest');
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
  });
});

// The cast trigger of the spell itself also reads the two lines of a hold-out card of the golden corpus (D-184): "When you cast this spell, search your
// library for a land card, put it onto the battlefield, then shuffle." and "When you cast this spell, if it was kicked, exile target land."
describe('"When you cast this spell, search your library for a land card ..." and "..., if it was kicked, exile target land."', () => {
  const seeder = parsed(
    'SYNTHETIC Parsed Seeder',
    'Creature — Eldrazi Fungus',
    'Devoid (This card has no color.)\nKicker {1}{C} (You may pay an additional {1}{C} as you cast this spell.)\nWhen you cast this spell, search your library for a land card, put it onto the battlefield, then shuffle.\nWhen you cast this spell, if it was kicked, exile target land.',
    { manaCost: '{3}{G}', colors: [], power: '3', toughness: '3' },
  );
  const play = () =>
    scenario()
      .seat(0)
      .define(seeder)
      .hand(seeder.name)
      .battlefield(RING)
      .battlefield('Forest', { count: 4 })
      .library('Swamp', ...FILLER)
      .seat(1)
      .battlefield('Mountain')
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('is valid', () => {
    expect(validateCard(seeder)).toEqual([]);
  });

  test('unkicked: only the search triggers; the land chosen comes onto the battlefield', () => {
    const g = play();
    g.act(0).cast(seeder.name, { kicked: false, pay: true });
    g.expect.stack([`${seeder.name} (ability)`, seeder.name]);
    g.pass();
    g.pass();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Swamp');
    g.passAll();
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.zone('Mountain', 'battlefield', { seat: 1 });
    g.expect.zone(seeder.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('kicked: the search and the exile of target land both trigger, the intervening "if" being true', () => {
    const g = play();
    g.act(0).cast(seeder.name, { kicked: true, pay: true });
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.act(0).chooseTargets({ name: 'Mountain', seat: 1 });
    g.expect.stack([`${seeder.name} (ability)`, `${seeder.name} (ability)`, seeder.name]);
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Swamp');
    g.passAll();
    g.expect.zone('Swamp', 'battlefield', { seat: 0 });
    g.expect.zone('Mountain', 'exile', { seat: 1 });
    g.expect.invariants();
  });

  test('not kicked: the second trigger does not trigger at all (CR 603.4)', () => {
    const g = play();
    g.act(0).cast(seeder.name, { kicked: false, pay: true });
    expect(g.state.pendingTriggers).toHaveLength(0);
    g.expect.stack([`${seeder.name} (ability)`, seeder.name]);
  });
});
