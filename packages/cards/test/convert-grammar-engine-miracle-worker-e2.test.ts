// The Miracle Worker deck (issue 109), group E2: statics and triggers about the spells you cast. The REAL Oracle text of Ancient Cellarspawn and Secret Arcade // Dusty Parlor (the golden
// corpus's golden.jsonl) goes through the grammar as a card with no override and is played through applyAction. Pins: CR 601.2f (the total cost: a reduction takes generic mana only), CR 601.2h
// (the mana spent), CR 202.3 and 202.3e (the mana value of a spell; X counted as chosen), CR 603.4 (an intervening "if" is checked as the event happens and as the ability resolves),
// CR 113.7a and 608.2h (last-known information of a spell that left the stack), CR 613.1d and 205.1b (a type added in layer 4), CR 110.4a (a permanent spell), CR 709.3 and 709.5 (a Room
// spell is one door).
import { readFileSync } from 'node:fs';
import type { CardDefinition } from '@commander-arena/engine';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const CELLARSPAWN = real('Ancient Cellarspawn');
const ROOM = real('Secret Arcade // Dusty Parlor');
const LIB = Array.from({ length: 12 }, () => 'Island');

const DEMON = parsed('SYNTHETIC E2 Demon', 'Creature — Demon', '', {
  manaCost: '{3}{B}',
  power: '3',
  toughness: '3',
  colors: ['B'],
});
const NIGHTMARE = parsed('SYNTHETIC E2 Nightmare', 'Creature — Nightmare', '', {
  manaCost: '{2}{B}',
  power: '2',
  toughness: '2',
  colors: ['B'],
});
const ELF = parsed('SYNTHETIC E2 Elf', 'Creature — Elf', '', {
  manaCost: '{2}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const LEAN_DEMON = parsed('SYNTHETIC E2 Lean Demon', 'Creature — Demon', '', {
  manaCost: '{B}{B}',
  power: '2',
  toughness: '2',
  colors: ['B'],
});
const X_HORROR = parsed('SYNTHETIC E2 X Horror', 'Creature — Horror', '', {
  manaCost: '{X}{B}',
  power: '1',
  toughness: '1',
  colors: ['B'],
});
const X_ELF = parsed('SYNTHETIC E2 X Elf', 'Creature — Elf', '', {
  manaCost: '{X}{G}',
  power: '1',
  toughness: '1',
  colors: ['G'],
});
const COLORLESS_DEMON = parsed('SYNTHETIC E2 Golem Demon', 'Artifact Creature — Demon', '', {
  manaCost: '{3}',
  power: '3',
  toughness: '3',
});
const DISCOUNT = parsed(
  'SYNTHETIC E2 Discount',
  'Artifact',
  'Creature spells you cast cost {2} less to cast.',
  { manaCost: '{1}' },
);
const RIVAL_BEAR = parsed('SYNTHETIC E2 Rival Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const DENY = parsed('SYNTHETIC E2 Deny', 'Instant', 'Counter target spell.', {
  manaCost: '{U}',
  colors: ['U'],
});
const GAIN = parsed('SYNTHETIC E2 Gain', 'Instant', 'You gain 2 life.', {
  manaCost: '{1}{W}',
  colors: ['W'],
});
const BEAR = parsed('SYNTHETIC E2 Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const BIG_BEAR = parsed('SYNTHETIC E2 Big Bear', 'Creature — Bear', '', {
  manaCost: '{3}{G}',
  power: '4',
  toughness: '4',
  colors: ['G'],
});
const GLOW = parsed('SYNTHETIC E2 Glow', 'Enchantment', '', { manaCost: '{W}', colors: ['W'] });
const RING = parsed('SYNTHETIC E2 Ring', 'Artifact', '', { manaCost: '{2}' });

type Builder = ReturnType<typeof scenario>;
const DEFS = [
  CELLARSPAWN,
  ROOM,
  DEMON,
  NIGHTMARE,
  ELF,
  LEAN_DEMON,
  X_HORROR,
  X_ELF,
  DENY,
  GAIN,
  BEAR,
  BIG_BEAR,
  GLOW,
  RING,
  COLORLESS_DEMON,
  DISCOUNT,
  RIVAL_BEAR,
];

function base(seats: 2 | 3 = 2): Builder {
  let b = scenario({ seats });
  for (const def of DEFS) b = b.define(def);
  return b;
}

/** Seat 0 has the permanents `field` and the cards `hand`, with plenty of mana of every color. */
function game(
  field: readonly string[],
  hand: readonly string[],
  options: { readonly seats?: 2 | 3; readonly rooms?: readonly number[] } = {},
) {
  let b = base(options.seats ?? 2).seat(0);
  b = b.library(...LIB);
  for (const name of field) b = b.battlefield(name);
  if (options.rooms !== undefined) b = b.battlefield(ROOM.name, { unlocked: options.rooms });
  b = b
    .battlefield('Swamp', { count: 8 })
    .battlefield('Plains', { count: 4 })
    .battlefield('Island', { count: 2 })
    .battlefield('Forest', { count: 4 })
    .hand(...hand);
  b = b.seat(1).library(...LIB);
  if ((options.seats ?? 2) === 3) b = b.seat(2).library(...LIB);
  return b.at('precombatMain', { active: 0, turn: 1 }).build();
}

describe('both cards read as supported and valid', () => {
  test('validateCard finds nothing', () => {
    expect(validateCard(CELLARSPAWN)).toEqual([]);
    expect(validateCard(ROOM)).toEqual([]);
  });

  test('Ancient Cellarspawn lowers to a reduction for the three types and an intervening if with the difference', () => {
    const [reduction, trigger] = CELLARSPAWN.faces[0]?.abilities ?? [];
    expect(reduction).toMatchObject({
      kind: 'static',
      static: {
        kind: 'costReduction',
        amount: 1,
        spells: {
          controller: 'you',
          anyOf: [{ subtypes: ['Demon'] }, { subtypes: ['Horror'] }, { subtypes: ['Nightmare'] }],
        },
      },
    });
    expect(trigger).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell', by: 'you' },
      interveningIf: { kind: 'manaSpentLessThanManaValue' },
      effect: {
        kind: 'loseLife',
        amount: {
          kind: 'difference',
          of: [
            { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
            { kind: 'manaSpent', of: { kind: 'triggerSubject' } },
          ],
        },
      },
    });
  });

  test('Secret Arcade lowers to a type for the permanents and one for the permanent spells', () => {
    expect(ROOM.faces[0]?.abilities).toMatchObject([
      { kind: 'static', static: { kind: 'setTypes', additive: true, types: ['enchantment'] } },
      { kind: 'static', static: { kind: 'giveTypesToPermanentSpells', types: ['enchantment'] } },
    ]);
  });
});

describe('Ancient Cellarspawn: each spell you cast that is a Demon, Horror, or Nightmare costs {1} less (CR 601.2f)', () => {
  test.each([
    ['Demon', DEMON.name],
    ['Nightmare', NIGHTMARE.name],
  ])('a %s spell costs {1} less: one mana less is spent', (_type, name) => {
    const g = game([CELLARSPAWN.name], [name]);
    const before = g.state.seats[0]?.life;
    g.act(0).cast(name, { pay: true });
    // The mana value is unchanged (CR 202.3), so the trigger found a gap of one.
    g.passAll();
    g.expect.life(1, 39);
    expect(g.state.seats[0]?.life).toBe(before);
    g.expect.invariants();
  });

  test('a creature of another type, cast at full cost, costs the whole mana value and loses nobody life', () => {
    const g = game([CELLARSPAWN.name], [ELF.name]);
    g.act(0).cast(ELF.name, { pay: true });
    // The intervening "if" is false as the spell is cast (CR 603.4): the ability never goes on the stack.
    g.expect.stack([ELF.name]);
    g.passAll();
    g.expect.life(1, 40);
  });

  test('a reduction takes generic mana only: {B}{B} has none to take, so the full cost is spent', () => {
    const g = game([CELLARSPAWN.name], [LEAN_DEMON.name]);
    g.act(0).cast(LEAN_DEMON.name, { pay: true });
    g.passAll();
    g.expect.life(1, 40);
  });

  test('the spells of an opponent are not reduced', () => {
    const g = base()
      .seat(0)
      .library(...LIB)
      .battlefield(CELLARSPAWN.name)
      .seat(1)
      .library(...LIB)
      .battlefield('Swamp', { count: 4 })
      .hand(DEMON.name)
      .at('precombatMain', { active: 1, turn: 1 })
      .build();
    g.act(1).cast(DEMON.name, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.life(1, 40);
  });
});

describe('Ancient Cellarspawn: whenever you cast a spell, if less mana was spent than its mana value, target opponent loses the difference (CR 603.4)', () => {
  test('a spell that costs nothing to cast spent 0: the opponent loses life equal to its whole mana value', () => {
    // {3} with the reduction of {1} and a reduction of {2} from another permanent: no mana is spent at all (CR 601.2f, 601.2h).
    const g = game([CELLARSPAWN.name, DISCOUNT.name], [COLORLESS_DEMON.name]);
    g.act(0).cast(COLORLESS_DEMON.name, { pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('a spell of a type the reduction does not name, cast for its cost, spends its mana value: no trigger', () => {
    const g = game([CELLARSPAWN.name], [GAIN.name, GLOW.name, RING.name]);
    // Nothing is put on the stack by the ability: the intervening "if" is false as the event happens (CR 603.4).
    g.act(0).cast(GAIN.name, { pay: true });
    g.expect.stack([GAIN.name]);
    g.passAll();
    g.act(0).cast(GLOW.name, { pay: true });
    g.expect.stack([GLOW.name]);
    g.passAll();
    g.act(0).cast(RING.name, { pay: true });
    g.expect.stack([RING.name]);
    g.passAll();
    g.expect.life(1, 40);
  });

  test('an X spell: the mana value counts the X chosen (CR 202.3e), a Horror cast with X = 2 is mana value 3 for {2}{B}', () => {
    const g = game([CELLARSPAWN.name], [X_HORROR.name]);
    g.act(0).cast(X_HORROR.name, { x: 2, pay: true });
    g.passAll();
    // Mana value 3, mana spent 2 (one less from the reduction): the opponent loses 1.
    g.expect.life(1, 39);
  });

  test('an X spell that is not reduced spends exactly its mana value: no life lost', () => {
    const g = game([CELLARSPAWN.name], [X_ELF.name]);
    g.act(0).cast(X_ELF.name, { x: 3, pay: true });
    g.passAll();
    g.expect.life(1, 40);
  });

  test('the ability resolves before the spell, and it resolves even if the spell is countered, with the mana value it last had on the stack', () => {
    const g = game([CELLARSPAWN.name], [DEMON.name, DENY.name]);
    g.act(0).cast(DEMON.name, { pay: true });
    // The trigger is above the Demon spell.
    g.expect.stack(['Ancient Cellarspawn (ability)', DEMON.name]);
    g.act(0).cast(DENY.name, { targets: [{ name: DEMON.name, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.zone(DEMON.name, 'graveyard', { seat: 0 });
    g.expect.life(1, 39);
    g.expect.invariants();
  });

  test('three seats: the controller chooses which opponent loses the life, and not themselves', () => {
    const g = game([CELLARSPAWN.name, DISCOUNT.name], [COLORLESS_DEMON.name], { seats: 3 });
    g.act(0).cast(COLORLESS_DEMON.name);
    g.act(0).chooseTargets({ player: 2 });
    g.passAll();
    g.expect.life(2, 37);
    g.expect.life(1, 40);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('three seats: a player that is not an opponent cannot be chosen', () => {
    const g = game([CELLARSPAWN.name, DISCOUNT.name], [COLORLESS_DEMON.name], { seats: 3 });
    g.act(0).cast(COLORLESS_DEMON.name);
    expect(() => g.act(0).chooseTargets({ player: 0 })).toThrow();
  });
});

describe('Secret Arcade: nonland permanents and permanent spells you control are enchantments (CR 613.1d, 205.1b)', () => {
  const game2 = (rooms: readonly number[], hand: readonly string[] = [], extra = false) => {
    let b = base()
      .seat(0)
      .library(...LIB)
      .battlefield(ROOM.name, { unlocked: rooms })
      .battlefield(BEAR.name)
      .battlefield(RING.name)
      .battlefield('Forest', { count: 6 })
      .battlefield('Plains', { count: 6 })
      .hand(...hand);
    if (extra) b = b.hand(ROOM.name);
    return b
      .seat(1)
      .library(...LIB)
      .battlefield(ELF.name)
      .battlefield('Forest', { count: 2 })
      .hand(RIVAL_BEAR.name)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };

  test('your nonland permanents are enchantments in addition to their other types; your lands, and the permanents of an opponent, are not', () => {
    const g = game2([0]);
    g.expect.derived(BEAR.name, { types: ['creature', 'enchantment'] });
    g.expect.derived(RING.name, { types: ['artifact', 'enchantment'] });
    g.expect.derived({ name: 'Forest', seat: 0, nth: 0 }, { types: ['land'] });
    g.expect.derived(ELF.name, { types: ['creature'] });
  });

  test('the door must be unlocked: with only Dusty Parlor unlocked, nothing is an enchantment', () => {
    const g = game2([1]);
    g.expect.derived(BEAR.name, { types: ['creature'] });
  });

  test('a permanent spell you control is an enchantment spell while it is on the stack; an instant is not; the spell of an opponent is not', () => {
    const g = game2([0], [BIG_BEAR.name, GAIN.name]);
    g.act(0).cast(BIG_BEAR.name, { pay: true });
    g.expect.derived(
      { name: BIG_BEAR.name, zone: 'stack' },
      { types: ['creature', 'enchantment'] },
    );
    g.passAll();
    g.expect.derived(BIG_BEAR.name, { types: ['creature', 'enchantment'] });
    g.act(0).cast(GAIN.name, { pay: true });
    g.expect.derived({ name: GAIN.name, zone: 'stack' }, { types: ['instant'] });
    g.passAll();
  });

  test('the spell of an opponent is not made an enchantment', () => {
    const g = game2([0]);
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).cast(RIVAL_BEAR.name, { pay: true });
    g.expect.derived({ name: RIVAL_BEAR.name, zone: 'stack' }, { types: ['creature'] });
  });
});

describe('Dusty Parlor: whenever you cast an enchantment spell, put counters equal to its mana value on up to one target creature (CR 202.3, 601.2i)', () => {
  const counters = (g: ReturnType<typeof game>, name: string) =>
    g.find({ name, zone: 'battlefield', seat: 0 })[0]?.counters['+1/+1'] ?? 0;

  test('with both doors unlocked a creature spell is an enchantment spell: counters equal to its mana value', () => {
    const g = game([BEAR.name], [BIG_BEAR.name], { rooms: [0, 1] });
    g.act(0).cast(BIG_BEAR.name, { pay: true });
    g.act(0).chooseTargets({ name: BEAR.name, zone: 'battlefield' });
    g.passAll();
    expect(counters(g, BEAR.name)).toBe(4);
    g.expect.invariants();
  });

  test('a real enchantment spell triggers it with only Dusty Parlor unlocked; a creature spell does not', () => {
    const g = game([BEAR.name], [GLOW.name, ELF.name], { rooms: [1] });
    g.act(0).cast(ELF.name, { pay: true });
    expect(g.state.stack.length).toBe(1);
    g.passAll();
    g.act(0).cast(GLOW.name, { pay: true });
    g.act(0).chooseTargets({ name: BEAR.name, zone: 'battlefield' });
    g.passAll();
    expect(counters(g, BEAR.name)).toBe(1);
  });

  test('an instant is not an enchantment spell, even with Secret Arcade', () => {
    const g = game([BEAR.name], [GAIN.name], { rooms: [0, 1] });
    g.act(0).cast(GAIN.name, { pay: true });
    expect(g.state.stack.length).toBe(1);
  });

  test('an X spell: the X chosen counts for the mana value (CR 202.3e)', () => {
    const g = game([BEAR.name], [X_ELF.name], { rooms: [0, 1] });
    g.act(0).cast(X_ELF.name, { x: 3, pay: true });
    g.act(0).chooseTargets({ name: BEAR.name, zone: 'battlefield' });
    g.passAll();
    expect(counters(g, BEAR.name)).toBe(4);
  });

  test('up to one target: none can be chosen, and then no counters are put', () => {
    const g = game([BEAR.name], [BIG_BEAR.name], { rooms: [0, 1] });
    g.act(0).cast(BIG_BEAR.name, { pay: true });
    g.act(0).chooseTargets();
    g.passAll();
    expect(counters(g, BEAR.name)).toBe(0);
  });

  test('the spell is countered before the ability resolves: the counters use the mana value it last had on the stack', () => {
    const g = game([BEAR.name], [BIG_BEAR.name, DENY.name], { rooms: [0, 1] });
    g.act(0).cast(BIG_BEAR.name, { pay: true });
    g.act(0).chooseTargets({ name: BEAR.name, zone: 'battlefield' });
    g.act(0).cast(DENY.name, { targets: [{ name: BIG_BEAR.name, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.zone(BIG_BEAR.name, 'graveyard', { seat: 0 });
    expect(counters(g, BEAR.name)).toBe(4);
  });

  test('a Room spell is one door: casting Dusty Parlor counts only its own mana value, 3', () => {
    const g = game([BEAR.name], [ROOM.name], { rooms: [0, 1] });
    g.act(0).cast(ROOM.name, { face: 1, pay: true });
    g.act(0).chooseTargets({ name: BEAR.name, zone: 'battlefield' });
    g.passAll();
    expect(counters(g, BEAR.name)).toBe(3);
    g.expect.invariants();
  });
});
