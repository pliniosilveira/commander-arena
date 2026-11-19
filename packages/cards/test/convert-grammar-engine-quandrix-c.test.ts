// Quandrix Unlimited, group C (Stonecoil Serpent, Perplexing Test, Quandrix Command, Nexus Mentality): the REAL cards of the golden corpus, read through the grammar only and
// played through applyAction. Pins: CR 702.16a (protection from multicolored: a source with two or more colors, CR 105.2, can't target, damage, enchant or block it),
// CR 111.1 and 110.1 (a token is a permanent: "creature tokens"), CR 115.1 and 608.2b (a player and the cards of their graveyard as targets), CR 701.24 (the player
// shuffles their library), CR 122.1 and 122.6 (moving and removing counters), CR 608.2c ("for each counter removed this way"), CR 700.2 and 903.3 (choosing both modes
// with a commander). Stand-ins are the engine's real fixtures and SYNTHETIC cards written here.
import { readFileSync } from 'node:fs';
import type { CardDefinition, GameState } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  return imported.definition;
}

const SERPENT = real('Stonecoil Serpent');
const TEST = real('Perplexing Test');
const COMMAND = real('Quandrix Command');
const MENTALITY = real('Nexus Mentality');
// SYNTHETIC: two 1/1 Soldier creature tokens.
const MUSTER = parsed(
  'SYNTHETIC Muster Two',
  'Instant',
  'Create two 1/1 white Soldier creature tokens.',
  {
    manaCost: '{1}',
  },
);
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';

const soldiers = (g: { readonly state: GameState }, seat: 0 | 1) =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id];
    return o?.token != null && o.controller === seat;
  }).length;

describe('Stonecoil Serpent: reach, trample, protection from multicolored, enters with X counters', () => {
  test('reads as the three keywords and a replacement that puts X counters on it', () => {
    const face = SERPENT.faces[0];
    const keywords = (face?.abilities ?? []).flatMap((a) =>
      a.kind === 'keyword' ? [JSON.stringify(a.keyword)] : [],
    );
    expect(keywords).toContain('{"kind":"protection","from":"multicolored"}');
    expect(keywords).toContain('{"kind":"reach"}');
    expect(keywords).toContain('{"kind":"trample"}');
  });

  test('cast for X = 3 it enters with three +1/+1 counters: a 3/3 with reach and trample', () => {
    const g = scenario()
      .define(SERPENT)
      .seat(0)
      .hand(SERPENT.name)
      .battlefield('Forest', { count: 3 })
      .build();
    g.act(0).cast(SERPENT.name, { x: 3, pay: true });
    g.passAll();
    g.expect.zone(SERPENT.name, 'battlefield', { seat: 0 });
    g.expect.counters(SERPENT.name, { '+1/+1': 3 });
    g.expect.pt(SERPENT.name, 3, 3);
    g.expect.derived(SERPENT.name, { keywords: ['reach', 'trample', 'protection'] });
    g.expect.invariants();
  });

  test('a monocolored spell can target it, a multicolored spell (Quandrix Command) can not', () => {
    const g = scenario()
      .define(SERPENT)
      .define(COMMAND)
      .seat(0)
      .battlefield(SERPENT.name, { counters: { '+1/+1': 2 } })
      .battlefield('Forest', 'Island', 'Mountain')
      .hand(COMMAND.name, BOLT)
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain')
      .build();
    // The Command is green and blue: with the counters mode its creature targets exclude the Serpent.
    g.act(0).cast(COMMAND.name, { modes: [2, 3] });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const creatureSlot = (d.specs[0]?.legal ?? []).flatMap((t) =>
      t.kind === 'object' ? [t.id] : [],
    );
    expect(creatureSlot).toContain(g.id(BEARS));
    expect(creatureSlot).not.toContain(g.id(SERPENT.name));
  });

  test('damage from a monocolored source is dealt (Lightning Bolt)', () => {
    const g = scenario()
      .define(SERPENT)
      .seat(0)
      .battlefield(SERPENT.name, { counters: { '+1/+1': 4 } })
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain')
      .build();
    g.act(0).cast(BOLT, { targets: [SERPENT.name], pay: true });
    g.passAll();
    expect(g.object(SERPENT.name).damage).toBe(3);
    g.expect.invariants();
  });
});

describe('Perplexing Test: return all creature tokens, or all nontoken creatures, to their owners hands', () => {
  const board = () =>
    scenario()
      .define(TEST)
      .define(MUSTER)
      .seat(0)
      .hand(TEST.name, MUSTER.name)
      .battlefield('Island', { count: 6 })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(ANGEL)
      .at('precombatMain')
      .build();

  test('the tokens mode returns the tokens of every player, which cease to exist, and no card', () => {
    const g = board();
    g.act(0).cast(MUSTER.name, { pay: true });
    g.passAll();
    expect(soldiers(g, 0)).toBe(2);
    g.act(0).cast(TEST.name, { modes: [0], pay: true });
    g.passAll();
    expect(soldiers(g, 0)).toBe(0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('the nontoken mode returns every nontoken creature to its owner and leaves the tokens', () => {
    const g = board();
    g.act(0).cast(MUSTER.name, { pay: true });
    g.passAll();
    g.act(0).cast(TEST.name, { modes: [1], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(ANGEL, 'hand', { seat: 1 });
    expect(soldiers(g, 0)).toBe(2);
    g.expect.invariants();
  });
});

describe('Quandrix Command: choose two', () => {
  const base = () =>
    scenario()
      .define(COMMAND)
      .seat(0)
      .hand(COMMAND.name)
      .battlefield('Forest', 'Island', 'Plains')
      .battlefield(BEARS)
      .graveyard(ANGEL, 'Murder', 'Llanowar Elves')
      .seat(1)
      .battlefield('Giant Spider')
      .graveyard('Typhoid Rats')
      .at('precombatMain');

  test('shuffle mode: the targeted player puts up to three target cards of their graveyard into their library', () => {
    const g = base().build();
    const libraryBefore = g.state.seats[0]?.library.length ?? 0;
    const cast = g.act(0).cast(COMMAND.name, { modes: [2, 3] });
    cast.targets([
      BEARS,
      { player: 0 },
      { name: ANGEL, zone: 'graveyard', seat: 0 },
      { name: 'Llanowar Elves', zone: 'graveyard', seat: 0 },
    ]);
    cast.pay();
    g.passAll();
    g.expect.zone(ANGEL, 'library', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'library', { seat: 0 });
    g.expect.zone('Murder', 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.library.length).toBe(libraryBefore + 2);
    g.expect.invariants();
  });

  test('"up to": no card may be chosen, and the player still shuffles', () => {
    const g = base().build();
    g.act(0).cast(COMMAND.name, { modes: [2, 3], targets: [BEARS, { player: 0 }], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the cards must be in the graveyard of the targeted player (CR 115.1): another player is chosen, their cards are the targets', () => {
    const g = base().build();
    const cast = g.act(0).cast(COMMAND.name, { modes: [2, 3] });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const slot = d.specs.find((s) => s.ownedBy !== undefined);
    expect(slot?.max).toBe(3);
    expect(slot?.min).toBe(0);
    // Targeting the opponent and a card of the controller's own graveyard is refused.
    expect(() =>
      cast.targets([BEARS, { player: 1 }, { name: ANGEL, zone: 'graveyard', seat: 0 }]),
    ).toThrow();
    cast.targets([BEARS, { player: 1 }, { name: 'Typhoid Rats', zone: 'graveyard', seat: 1 }]);
    cast.pay();
    g.passAll();
    g.expect.zone('Typhoid Rats', 'library', { seat: 1 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('two modes at once: counters on a creature and the shuffle', () => {
    const g = base().build();
    g.act(0).cast(COMMAND.name, {
      modes: [2, 3],
      targets: [BEARS, { player: 0 }, { name: ANGEL, zone: 'graveyard', seat: 0 }],
      pay: true,
    });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 2 });
    g.expect.zone(ANGEL, 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('the first mode returns a creature to its owner hand', () => {
    const g = base().build();
    g.act(0).cast(COMMAND.name, { modes: [0, 2], targets: ['Giant Spider', BEARS], pay: true });
    g.passAll();
    g.expect.zone('Giant Spider', 'hand', { seat: 1 });
    g.expect.counters(BEARS, { '+1/+1': 2 });
    g.expect.invariants();
  });
});

describe('Nexus Mentality: move all counters, or remove them and draw for each', () => {
  const base = () =>
    scenario()
      .define(MENTALITY)
      .seat(0)
      .hand(MENTALITY.name)
      .battlefield('Island', { count: 4 })
      .battlefield(BEARS, { counters: { '+1/+1': 2, charge: 3 } })
      .battlefield(ANGEL)
      .library('Plains', { count: 10 })
      .at('precombatMain');

  test('move mode: every counter of every kind goes onto the other permanent', () => {
    const g = base().build();
    g.act(0).cast(MENTALITY.name, { modes: [0], targets: [BEARS, ANGEL], pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
    g.expect.counters(ANGEL, { '+1/+1': 2, charge: 3 });
    g.expect.invariants();
  });

  test('the two targets must be different permanents (CR 115.3: "another target")', () => {
    const g = base().build();
    const cast = g.act(0).cast(MENTALITY.name, { modes: [0] });
    expect(() => cast.targets([BEARS, BEARS])).toThrow();
  });

  test('remove mode: every counter comes off and its controller draws a card for each', () => {
    const g = base().build();
    const handBefore = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(MENTALITY.name, { modes: [1], targets: [BEARS], pay: true });
    g.passAll();
    g.expect.counters(BEARS, {});
    // The spell left the hand and five cards were drawn: 2 +1/+1 and 3 charge counters.
    expect(g.state.seats[0]?.hand.length).toBe(handBefore - 1 + 5);
    g.expect.invariants();
  });

  test('remove mode on a permanent with no counters draws nothing', () => {
    const g = base().build();
    const handBefore = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast(MENTALITY.name, { modes: [1], targets: [ANGEL], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(handBefore - 1);
    g.expect.invariants();
  });

  test('without a commander only one mode may be chosen', () => {
    const g = base().build();
    g.act(0).cast(MENTALITY.name);
    const d = g.state.pending;
    if (d?.kind !== 'chooseModes') throw new Error(`expected modes, got ${d?.kind}`);
    expect(d.max).toBe(1);
  });

  test('with a commander on the battlefield both modes may be chosen, and they happen in order: the counters move, then all come off the new holder', () => {
    const g = base().battlefield('Raging Goblin', { commander: true }).build();
    const handBefore = g.state.seats[0]?.hand.length ?? 0;
    const cast = g.act(0).cast(MENTALITY.name);
    const d = g.state.pending;
    if (d?.kind !== 'chooseModes') throw new Error(`expected modes, got ${d?.kind}`);
    expect(d.max).toBe(2);
    cast.modes(0, 1);
    cast.targets([BEARS, ANGEL, ANGEL]);
    cast.pay();
    g.passAll();
    g.expect.counters(BEARS, {});
    g.expect.counters(ANGEL, {});
    expect(g.state.seats[0]?.hand.length).toBe(handBefore - 1 + 5);
    g.expect.invariants();
  });
});
