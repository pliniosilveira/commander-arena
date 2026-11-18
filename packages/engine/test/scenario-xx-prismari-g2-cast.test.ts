// The Prismari deck (issue 87), group 2: effects that read the spell that was cast, with the SYNTHETIC siblings of Prismari Pianist, Rootha, Mastering the Moment, Renegade Bull (its
// pump) and Manaform Hellkite (src/cards/fixtures/synthetic-prismari-g2.ts). Pins: CR 202.3 and 202.3e (the mana value of a spell on the stack counts the X announced; a reduction of
// the cost changes nothing about it), CR 601.2h (mana spent to cast it, after the cost was reduced), CR 601.2i (a spell is cast once it is on the stack, whether or not it resolves; a copy
// is not cast, CR 707.10; an opponent's spell is not mine), CR 603.4 (an intervening "if" is checked as the ability triggers and again as it resolves), CR 608.2h and 113.7a (a spell that
// has left the stack is read from last-known information), CR 603.7c (the delayed exile names only the token this ability made) and CR 611.2a (until end of turn).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const PIANIST = 'SYNTHETIC Piano Elemental';
const ROOTHA = 'SYNTHETIC Moment Master';
const OX = 'SYNTHETIC Charging Ox';
const DRAKE = 'SYNTHETIC Manaform Drake';
const CANTRIP = 'SYNTHETIC Prismari Cantrip'; // instant {U}
const STUDY = 'SYNTHETIC Prismari Grand Study'; // sorcery {4}{U}: mana value 5
const BIG = 'SYNTHETIC Prismari Big Study'; // sorcery {4}{U}{U}: mana value 6
const XSPELL = 'SYNTHETIC Prismari X Spell'; // instant {X}{R}
const TRINKET = 'SYNTHETIC Prismari Trinket'; // artifact {2}
const FOCUS = 'SYNTHETIC Prismari Discounter'; // instants and sorceries cost {1} less
const BEARS = 'SYNTHETIC Prismari Apprentice'; // creature {1}{R}
const COUNTERSPELL = 'Counterspell';
const DIVINATION = 'Divination'; // sorcery {2}{U}: mana value 3
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

type Game = ReturnType<ReturnType<typeof scenario>['build']>;
type Builder = ReturnType<typeof scenario>;

const tokens = (g: Game, name: string, seat = 0) =>
  g.find({ name, zone: 'battlefield', seat }).filter((o) => o.token !== null);
const castHand = (g: Game, name: string, options: object = {}) =>
  g.act(0).cast({ name, zone: 'hand', seat: 0, nth: 0 }, { pay: true, ...options });

function build(setup: (b: Builder) => void, at: 'precombatMain' | 'upkeep' = 'precombatMain') {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY);
  setup(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .at(at, { active: 0 })
    .build();
}

describe('the cards are valid', () => {
  test.each([PIANIST, ROOTHA, OX, DRAKE, BIG, XSPELL, TRINKET])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('Prismari Pianist: three tokens instead of one for a spell of mana value 5 or more (CR 202.3)', () => {
  const pianist = (extra: (b: Builder) => void = () => {}) =>
    build((b) => {
      b.battlefield(PIANIST)
        .battlefield('Island', { count: 4 })
        .battlefield('Mountain', { count: 4 })
        .hand(CANTRIP, STUDY, BIG, XSPELL, BEARS, DIVINATION);
      extra(b);
    });

  test('a spell of mana value 1: one token', () => {
    const g = pianist();
    castHand(g, CANTRIP);
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(1);
    g.expect.pt(tokens(g, 'Elemental')[0]?.id as string, 1, 1);
    g.expect.derived(tokens(g, 'Elemental')[0]?.id as string, { colors: ['U', 'R'] });
    g.expect.invariants();
  });

  test('mana value 4 (the edge below): still one token', () => {
    const g = pianist();
    castHand(g, DIVINATION);
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(1);
  });

  test('mana value 5 exactly: three tokens, not four and not one', () => {
    const g = pianist();
    castHand(g, STUDY);
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(3);
  });

  test('mana value 6: three tokens', () => {
    const g = pianist();
    castHand(g, BIG);
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(3);
  });

  test('an {X} spell counts the X announced: X = 4 is mana value 5 (CR 202.3e), X = 1 is mana value 2', () => {
    const big = pianist();
    castHand(big, XSPELL, { x: 4 });
    big.passAll();
    expect(tokens(big, 'Elemental')).toHaveLength(3);
    const small = pianist();
    castHand(small, XSPELL, { x: 1 });
    small.passAll();
    expect(tokens(small, 'Elemental')).toHaveLength(1);
  });

  test('a cost reduction does not change the mana value: a spell of mana value 5 that cost {3} still makes three', () => {
    const g = pianist((b) => b.battlefield(FOCUS));
    castHand(g, STUDY);
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(3);
    g.expect.invariants();
  });

  test('a creature spell does not trigger it', () => {
    const g = pianist();
    castHand(g, BEARS);
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(0);
  });

  test('an opponent’s spell does not trigger it (the cast is "you cast")', () => {
    const g = pianist((b) => b.seat(1).hand(CANTRIP).battlefield('Island'));
    g.act(0).pass();
    g.act(1).cast(CANTRIP, { pay: true });
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(0);
  });

  test('the spell was countered before the trigger resolved: the mana value is read from last-known information (CR 608.2h)', () => {
    const g = pianist((b) => b.seat(1).hand(COUNTERSPELL).battlefield('Island', { count: 2 }));
    castHand(g, BIG);
    // The trigger is on top of the spell; the opponent counters the spell with the trigger still on the stack.
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { pay: true, targets: [{ name: BIG, zone: 'stack', seat: 0 }] });
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(3);
    g.expect.invariants();
  });

  test('two spells, two triggers: tokens add up', () => {
    const g = pianist();
    castHand(g, CANTRIP);
    g.passAll();
    castHand(g, STUDY);
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(4);
  });
});

describe('Rootha, Mastering the Moment: X is the greatest mana value among the spells cast this turn (CR 202.3, 601.2i)', () => {
  const rootha = (extra: (b: Builder) => void = () => {}) =>
    build((b) => {
      b.battlefield(ROOTHA)
        .battlefield('Island', { count: 5 })
        .battlefield('Mountain', { count: 4 })
        .hand(CANTRIP, BIG, XSPELL, BEARS, TRINKET);
      extra(b);
    });
  const toCombat = (g: Game) => {
    g.advanceTo('beginningOfCombat');
    g.passAll();
  };

  test('no instant or sorcery cast: no trigger and no token (the intervening "if", CR 603.4)', () => {
    const g = rootha();
    toCombat(g);
    expect(tokens(g, 'Elemental')).toHaveLength(0);
    g.expect.invariants();
  });

  test('a creature spell and an artifact spell are not instants or sorceries: no token', () => {
    const g = rootha();
    castHand(g, BEARS);
    g.passAll();
    castHand(g, TRINKET);
    g.passAll();
    toCombat(g);
    expect(tokens(g, 'Elemental')).toHaveLength(0);
  });

  test('one spell of mana value 1: a 1/1 with flying and haste', () => {
    const g = rootha();
    castHand(g, CANTRIP);
    g.passAll();
    toCombat(g);
    const made = tokens(g, 'Elemental');
    expect(made).toHaveLength(1);
    g.expect.pt(made[0]?.id as string, 1, 1);
    g.expect.derived(made[0]?.id as string, { keywords: ['flying', 'haste'] });
    g.expect.invariants();
  });

  test('the greatest of several: a spell of mana value 6 and one of mana value 1 make a 6/6, not a 7/7', () => {
    const g = rootha();
    castHand(g, CANTRIP);
    g.passAll();
    castHand(g, BIG);
    g.passAll();
    toCombat(g);
    g.expect.pt(tokens(g, 'Elemental')[0]?.id as string, 6, 6);
  });

  test('an {X} spell counts the X it was cast with: X = 3 is mana value 4', () => {
    const g = rootha();
    castHand(g, XSPELL, { x: 3 });
    g.passAll();
    toCombat(g);
    g.expect.pt(tokens(g, 'Elemental')[0]?.id as string, 4, 4);
  });

  test('a spell that was countered still counts: it was cast (CR 601.2i)', () => {
    const g = rootha((b) => b.seat(1).hand(COUNTERSPELL).battlefield('Island', { count: 2 }));
    castHand(g, BIG);
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { pay: true, targets: [{ name: BIG, zone: 'stack', seat: 0 }] });
    g.passAll();
    toCombat(g);
    g.expect.pt(tokens(g, 'Elemental')[0]?.id as string, 6, 6);
  });

  test('the history is of this turn: nothing was cast in this turn, so the next turn has no token', () => {
    const g = rootha();
    castHand(g, CANTRIP);
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(1);
    // Two turns on, with nothing cast in that turn: no new token.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(1);
  });

  test('the token is created once, at the beginning of combat on its controller’s turn only', () => {
    const g = rootha();
    castHand(g, CANTRIP);
    g.passAll();
    toCombat(g);
    expect(tokens(g, 'Elemental')).toHaveLength(1);
    g.advanceTo('postcombatMain');
    expect(tokens(g, 'Elemental')).toHaveLength(1);
  });
});

describe('Renegade Bull: +X/+0 where X is the mana value of the spell cast (CR 202.3)', () => {
  const ox = (extra: (b: Builder) => void = () => {}) =>
    build((b) => {
      b.battlefield(OX, { label: 'ox' })
        .battlefield('Island', { count: 6 })
        .battlefield('Mountain', { count: 3 })
        .hand(CANTRIP, BIG, XSPELL, BEARS);
      extra(b);
    });

  test('a spell of mana value 1 and one of mana value 6: +1/+0 then +6/+0, until end of turn', () => {
    const g = ox();
    g.expect.pt('ox', 4, 4);
    castHand(g, CANTRIP);
    g.passAll();
    g.expect.pt('ox', 5, 4);
    castHand(g, BIG);
    g.passAll();
    g.expect.pt('ox', 11, 4);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('ox', 4, 4);
    g.expect.invariants();
  });

  test('an {X} spell: X = 2 is +3/+0', () => {
    const g = ox();
    castHand(g, XSPELL, { x: 2 });
    g.passAll();
    g.expect.pt('ox', 7, 4);
  });

  test('a creature spell gives nothing', () => {
    const g = ox();
    castHand(g, BEARS);
    g.passAll();
    g.expect.pt('ox', 4, 4);
  });

  test('an opponent’s spell gives nothing', () => {
    const g = ox((b) => b.seat(1).hand(CANTRIP).battlefield('Island'));
    g.act(0).pass();
    g.act(1).cast(CANTRIP, { pay: true });
    g.passAll();
    g.expect.pt('ox', 4, 4);
  });
});

describe('Manaform Hellkite: an X/X token, X the mana spent to cast the spell, exiled at the end step (CR 601.2h)', () => {
  const drake = (extra: (b: Builder) => void = () => {}) =>
    build((b) => {
      b.battlefield(DRAKE)
        .battlefield('Island', { count: 6 })
        .battlefield('Mountain', { count: 4 })
        .hand(CANTRIP, STUDY, XSPELL, BEARS, TRINKET);
      extra(b);
    });

  test('an artifact spell paid with {2}: a 2/2 Dragon Illusion with flying and haste', () => {
    const g = drake();
    castHand(g, TRINKET);
    g.passAll();
    const made = tokens(g, 'Dragon Illusion');
    expect(made).toHaveLength(1);
    g.expect.pt(made[0]?.id as string, 2, 2);
    g.expect.derived(made[0]?.id as string, { keywords: ['flying', 'haste'], colors: ['R'] });
    g.expect.invariants();
  });

  test('X is the mana actually spent, not the mana value: a spell of mana value 5 reduced by {1} makes a 4/4', () => {
    const g = drake((b) => b.battlefield(FOCUS));
    castHand(g, STUDY);
    g.passAll();
    // {4}{U} reduced by {1}: four mana were spent.
    g.expect.pt(tokens(g, 'Dragon Illusion')[0]?.id as string, 4, 4);
  });

  test('an {X} spell: the mana spent includes the X and the {R}', () => {
    const g = drake();
    castHand(g, XSPELL, { x: 3 });
    g.passAll();
    g.expect.pt(tokens(g, 'Dragon Illusion')[0]?.id as string, 4, 4);
  });

  test('a creature spell does not trigger it', () => {
    const g = drake();
    castHand(g, BEARS);
    g.passAll();
    expect(tokens(g, 'Dragon Illusion')).toHaveLength(0);
  });

  test('the token is exiled at the beginning of the next end step, and only that token', () => {
    const g = drake();
    castHand(g, TRINKET);
    g.passAll();
    castHand(g, CANTRIP);
    g.passAll();
    expect(tokens(g, 'Dragon Illusion')).toHaveLength(2);
    g.advanceTo('end');
    // Two delayed abilities begin together: their controller orders them (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    expect(tokens(g, 'Dragon Illusion')).toHaveLength(0);
    // The Drake itself is not exiled.
    expect(g.find({ name: DRAKE, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.invariants();
  });

  test('a token made after the end step began (an instant in the end step) is exiled at the next end step, not this one', () => {
    const g = drake();
    // An instant cast in the end step: its token waits for the NEXT end step, the one of the next turn.
    g.advanceTo('end');
    castHand(g, CANTRIP);
    g.passAll();
    expect(tokens(g, 'Dragon Illusion')).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(tokens(g, 'Dragon Illusion')).toHaveLength(1);
  });
});
