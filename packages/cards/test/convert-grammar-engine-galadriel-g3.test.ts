// The Galadriel deck (issue 43), group 3 (D-1620 to D-1629 numbers): the REAL Oracle text of Defend the Rider, Eyes Everywhere, Jace, Mirror Mage, Koma, Cosmos Serpent, Mystic Speculation,
// Netherese Puzzle-Ward and Repulsive Mutation (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is
// played through applyAction, so the nodes the parser writes for the real text are what the engine runs. The abilities of each real card are also the ones of its SYNTHETIC sibling of the
// engine fixtures (`synthetic-galadriel-g3.ts`), which the engine tests and the AI soak play. Pins: CR 701.12 (exchange), 702.27a (buyback), 702.33 (kicker), 707.9b (a copy's exceptions),
// 306.5b (loyalty counters), 706.1a and 706.2 (a die and its natural result), 118.12a and 608.2c (counter unless pays an amount read as it resolves), 602.5 and 605.1a (abilities that
// can't be activated), 702.122a (crew).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const rider = real('Defend the Rider');
const eyes = real('Eyes Everywhere');
const jace = real('Jace, Mirror Mage');
const koma = real('Koma, Cosmos Serpent');
const mystic = real('Mystic Speculation');
const ward = real('Netherese Puzzle-Ward');
const mutation = real('Repulsive Mutation');

/** What a node says apart from the words the card uses for itself: the text of a mode is its Oracle text, and the token Koma makes has a name of its own. */
function plain<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value), (key, v) => (key === 'text' ? undefined : v)) as unknown;
}
function renamed<T>(value: T, from: string, to: string): T {
  return JSON.parse(JSON.stringify(value).split(from).join(to)) as T;
}

describe('every card is valid and has the AST of its SYNTHETIC sibling', () => {
  test.each([
    ['Eyes Everywhere', eyes, 'SYNTHETIC Swap Eyes'],
    ['Jace, Mirror Mage', jace, 'SYNTHETIC Mirror Walker'],
    ['Netherese Puzzle-Ward', ward, 'SYNTHETIC Die Ward'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    expect(card.faces[0]?.abilities).toEqual(syntheticCard(sibling).faces[0]?.abilities);
  });

  test('Mystic Speculation: the buyback and the spell', () => {
    expect(validateCard(mystic)).toEqual([]);
    const twin = syntheticCard('SYNTHETIC Buyback Peek').faces[0];
    expect(mystic.faces[0]?.abilities).toEqual(twin?.abilities);
    expect(mystic.faces[0]?.spell).toEqual(twin?.spell);
  });

  test('Repulsive Mutation: the two targets and the effect', () => {
    expect(validateCard(mutation)).toEqual([]);
    expect(mutation.faces[0]?.spell).toEqual(
      syntheticCard('SYNTHETIC Mutation Counter').faces[0]?.spell,
    );
    expect(mutation.faces[0]?.manaCost).toEqual(['X', 'G', 'U']);
  });

  test('Defend the Rider: the modes (the words of a mode are the card\'s own)', () => {
    expect(validateCard(rider)).toEqual([]);
    expect(plain(rider.faces[0]?.spell)).toEqual(
      plain(syntheticCard('SYNTHETIC Rider Shield').faces[0]?.spell),
    );
    // The token is the same one, with the same words.
    expect(JSON.stringify(rider.faces[0]?.spell)).toContain(
      'This creature saddles Mounts and crews Vehicles as though its power were 2 greater.',
    );
  });

  test('Koma, with the token named as the sibling names it', () => {
    expect(validateCard(koma)).toEqual([]);
    const twin = syntheticCard('SYNTHETIC Coil Titan').faces[0];
    expect(plain(renamed(koma.faces[0]?.abilities, "Koma's Coil", 'SYNTHETIC Coil'))).toEqual(
      plain(twin?.abilities),
    );
  });
});

const LIB = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('Mystic Speculation (real text)', () => {
  test('buyback {2}: with three lands the card is cast for {U}{2} and is back in the hand; scry 3', () => {
    const g = scenario()
      .define(mystic)
      .seat(0)
      .library('Island', { label: 'a' })
      .library('Forest', { label: 'b' })
      .library('Plains', { label: 'c' })
      .library(...LIB)
      .hand(mystic.name)
      .battlefield('Island', { count: 3 })
      .seat(1)
      .library(...LIB)
      .at('precombatMain')
      .build();
    g.act(0).cast(mystic.name, { bought: true, pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['a', 'b', 'c'] });
    g.expect.zone(mystic.name, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('declined, it goes to the graveyard', () => {
    const g = scenario()
      .define(mystic)
      .seat(0)
      .library('Island', { label: 'a' })
      .library('Forest', { label: 'b' })
      .library('Plains', { label: 'c' })
      .library(...LIB)
      .hand(mystic.name)
      .battlefield('Island', { count: 3 })
      .seat(1)
      .library(...LIB)
      .at('precombatMain')
      .build();
    g.act(0).cast(mystic.name, { bought: false, pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['a', 'b', 'c'] });
    g.expect.zone(mystic.name, 'graveyard', { seat: 0 });
  });
});

describe('Eyes Everywhere (real text)', () => {
  test('{5}{U}: the enchantment and the nonland permanent exchange controllers, at sorcery speed', () => {
    const g = scenario()
      .define(eyes)
      .seat(0)
      .library(...LIB)
      .battlefield(eyes.name)
      .battlefield('Island', { count: 6 })
      .battlefield('Giant Spider', { label: 'spider' })
      .seat(1)
      .library(...LIB)
      .battlefield('Grizzly Bears')
      .at('precombatMain')
      .build();
    g.act(0).activate(eyes.name, { targets: [{ name: 'Grizzly Bears', seat: 1 }], pay: true });
    g.passAll();
    const control = (name: string) =>
      g.view(0).battlefield.find((o) => o.name === name)?.controller ??
      g.view(1).battlefield.find((o) => o.name === name)?.controller;
    expect(control(eyes.name)).toBe(1);
    expect(control('Grizzly Bears')).toBe(0);
    expect(control('Giant Spider')).toBe(0);
    g.expect.invariants();
  });

  test('a land is not a legal target', () => {
    const g = scenario()
      .define(eyes)
      .seat(0)
      .library(...LIB)
      .battlefield(eyes.name)
      .battlefield('Island', { count: 6 })
      .seat(1)
      .library(...LIB)
      .battlefield('Mountain')
      .at('precombatMain')
      .build();
    expect(() =>
      g.act(0).activate(eyes.name, { targets: [{ name: 'Mountain', seat: 1 }], pay: true }),
    ).toThrow();
  });
});

describe('Jace, Mirror Mage (real text)', () => {
  test('kicked: a token copy that is not legendary and has loyalty 1; the 0 ability reveals the card drawn and removes its mana value in loyalty', () => {
    const g = scenario()
      .define(jace)
      .seat(0)
      .library('Grizzly Bears', ...LIB)
      .hand(jace.name)
      .battlefield('Island', { count: 5 })
      .seat(1)
      .library(...LIB)
      .at('precombatMain')
      .build();
    g.act(0).cast(jace.name, { kicked: true, pay: true });
    g.passAll();
    const walkers = g.find({ name: jace.name, zone: 'battlefield' });
    expect(walkers).toHaveLength(2);
    expect(walkers.map((w) => w.counters.loyalty ?? 0).sort()).toEqual([1, 4]);
    const [card] = walkers.filter((w) => w.token === null);
    if (card === undefined) throw new Error('no card');
    g.act(0).activate(card.id, { ability: 3 });
    g.passAll();
    g.expect.counters(card.id, { loyalty: 2 });
    g.expect.eventLog([{ kind: 'cardsRevealed', seat: 0, names: ['Grizzly Bears'], from: 'hand' }]);
    g.expect.invariants();
  });

  test('not kicked: one planeswalker with loyalty 4 and no copy', () => {
    const g = scenario()
      .define(jace)
      .seat(0)
      .library(...LIB)
      .hand(jace.name)
      .battlefield('Island', { count: 5 })
      .seat(1)
      .library(...LIB)
      .at('precombatMain')
      .build();
    g.act(0).cast(jace.name, { kicked: false, pay: true });
    g.passAll();
    expect(g.find({ name: jace.name, zone: 'battlefield' })).toHaveLength(1);
    g.expect.counters(jace.name, { loyalty: 4 });
  });
});

describe('Koma, Cosmos Serpent (real text)', () => {
  test('it makes a Serpent token each upkeep, and a Serpent sacrificed taps a permanent and stops its abilities, or makes Koma indestructible', () => {
    const g = scenario()
      .define(koma)
      .seat(0)
      .library(...LIB)
      .battlefield(koma.name)
      .seat(1)
      .library(...LIB)
      .battlefield('Sol Ring')
      .at('end', { active: 1, turn: 4 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(g.find({ name: "Koma's Coil", zone: 'battlefield' })).toHaveLength(1);
    g.advanceTo('precombatMain');
    g.act(0).activate(koma.name, { modes: [0], targets: [{ name: 'Sol Ring', seat: 1 }] });
    g.passAll();
    g.expect.noObject("Koma's Coil", { zone: 'battlefield' });
    g.expect.tapped('Sol Ring', true);
    g.expect.invariants();
  });

  test('"This spell can\'t be countered."', () => {
    const g = scenario()
      .define(koma)
      .seat(0)
      .library(...LIB)
      .hand(koma.name)
      .battlefield('Forest', { count: 3 })
      .battlefield('Island', { count: 4 })
      .seat(1)
      .library(...LIB)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .at('precombatMain')
      .build();
    g.act(0).cast(koma.name, { pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [{ name: koma.name, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(koma.name, 'battlefield', { seat: 0 });
  });
});

describe('Netherese Puzzle-Ward (real text)', () => {
  test('at upkeep a d4 is rolled and that many cards are scried; a 4 draws a card too', () => {
    let fours = 0;
    for (let seed = 1; seed <= 16; seed += 1) {
      const g = scenario()
        .define(ward)
        .seed(seed)
        .seat(0)
        .library(...LIB, ...LIB)
        .battlefield(ward.name)
        .seat(1)
        .library(...LIB)
        .at('end', { active: 1, turn: 4 })
        .build();
      g.advanceTo('upkeep', { turn: 'next' });
      g.passAll();
      const roll = g.events.find((e) => e.kind === 'dieRolled');
      if (roll?.kind !== 'dieRolled') throw new Error('no roll');
      expect(roll.sides).toBe(4);
      const decision = g.state.pending;
      if (decision?.kind !== 'arrangeCards') throw new Error(`expected a scry, got ${decision?.kind}`);
      expect(decision.cards).toHaveLength(roll.result);
      g.act(0).arrange({ top: decision.cards });
      if (g.state.stack.length > 0) g.passAll();
      const draws = g.events.filter((e) => e.kind === 'cardDrawn' && e.seat === 0).length;
      expect(draws, `seed ${seed}`).toBe(roll.result === 4 ? 1 : 0);
      if (roll.result === 4) fours += 1;
    }
    expect(fours).toBeGreaterThan(0);
  });
});

describe('Repulsive Mutation (real text)', () => {
  test('X counters first, then the spell is countered unless its controller pays the greatest power', () => {
    const g = scenario()
      .define(mutation)
      .seat(0)
      .library(...LIB)
      .hand(mutation.name)
      .battlefield('Forest')
      .battlefield('Island', { count: 3 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .library(...LIB)
      .hand('Divination')
      .battlefield('Island', { count: 6 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Divination', { pay: true });
    g.act(1).pass();
    g.act(0).cast(mutation.name, {
      x: 2,
      targets: [
        { name: 'Grizzly Bears', seat: 0 },
        { name: 'Divination', seat: 1 },
      ],
      pay: true,
    });
    g.passAll();
    g.expect.counters('Grizzly Bears', { '+1/+1': 2 });
    // The Bears are 4/4: four mana is owed and three lands are left, so Divination is countered without a question.
    g.expect.zone('Divination', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});

describe('Defend the Rider (real text)', () => {
  test('the first mode gives hexproof and indestructible; the second makes a Pilot that crews as though its power were 2 greater', () => {
    const g = scenario()
      .define(rider)
      .seat(0)
      .library(...LIB)
      .hand(rider.name, { label: 'one' })
      .hand(rider.name, { label: 'two' })
      .battlefield('Forest', { count: 2 })
      .battlefield('SYNTHETIC Rattle Wagon')
      .battlefield('Grizzly Bears')
      .seat(1)
      .library(...LIB)
      .at('precombatMain')
      .build();
    g.act(0).cast('one', { modes: [0], targets: [{ name: 'Grizzly Bears', seat: 0 }], pay: true });
    g.passAll();
    g.expect.derived('Grizzly Bears', { keywords: ['hexproof', 'indestructible'] });
    g.act(0).cast('two', { modes: [1], pay: true });
    g.passAll();
    g.expect.pt('Pilot', 1, 1);
    g.act(0).activate('SYNTHETIC Rattle Wagon');
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected the crew choice, got ${d?.kind}`);
    expect(d.powers?.[g.id('Pilot')]).toBe(3);
    expect(d.powers?.[g.id('Grizzly Bears')]).toBe(2);
    g.act(0).choosePermanents('Pilot');
    g.passAll();
    g.expect.derived('SYNTHETIC Rattle Wagon', { types: ['artifact', 'creature'] });
  });
});
