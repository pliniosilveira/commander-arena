// The Prismari deck (issue 87), group 2 (D-638 and later): the REAL Oracle text of Prismari Pianist, Rootha, Mastering the Moment, Renegade Bull, Manaform Hellkite, Magma Opus, Furygale
// Flocking, Leitmotif Composer, Restless Spire, Galazeth Prismari, Brazen Borrower // Petty Theft, Deep Analysis and Rousing Refrain (the corpus's golden.jsonl, taken from the issue)
// goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the
// engine runs. The abilities of each real card are also the ones of its SYNTHETIC sibling of the engine fixtures (`synthetic-prismari-g2.ts`), which the engine tests and the AI soak play.
// Pins: CR 202.3 (the mana value of a spell), CR 601.2h (the mana spent to cast it), CR 601.2i (a spell is cast once it is on the stack), CR 500.5 and 106.4 (mana empties as steps and
// phases end unless an effect says otherwise), CR 702.62b (a suspended card), CR 702.34a (flashback) and CR 119.4 (paying life), CR 509.1b (a blocker that can block only some
// attackers), CR 707.12 (a copy of a card, cast), CR 508.1d (a creature that attacks if able).
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
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const CANTRIP = 'SYNTHETIC Prismari Cantrip'; // instant {U}: mana value 1
const STUDY = 'SYNTHETIC Prismari Grand Study'; // sorcery {4}{U}: mana value 5
const BEARS_NAME = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Island');

const pianist = real('Prismari Pianist');
const rootha = real('Rootha, Mastering the Moment');
const bull = real('Renegade Bull');
const hellkite = real('Manaform Hellkite');
const opus = real('Magma Opus');
const flocking = real('Furygale Flocking');
const composer = real('Leitmotif Composer');
const spire = real('Restless Spire');
const galazeth = real('Galazeth Prismari');
const borrower = real('Brazen Borrower // Petty Theft');
const analysis = real('Deep Analysis');
const refrain = real('Rousing Refrain');
const jeskas = real("Jeska's Will");

type Game = ReturnType<ReturnType<typeof scenario>['build']>;
type Builder = ReturnType<typeof scenario>;

const tokens = (g: Game, name: string, seat = 0) =>
  g.find({ name, zone: 'battlefield', seat }).filter((o) => o.token !== null);
const castHand = (g: Game, name: string, options: object = {}) =>
  g.act(0).cast({ name, zone: 'hand', seat: 0, nth: 0 }, { pay: true, ...options });

function build(
  cards: readonly CardDefinition[],
  setup: (b: Builder) => void,
  at: 'precombatMain' | 'upkeep' | 'declareAttackers' = 'precombatMain',
) {
  let b = scenario();
  for (const card of cards) b = b.define(card);
  b = b.seat(0).library(...LIBRARY);
  setup(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .at(at, { active: 0 })
    .build();
}

describe('every card is valid and has the abilities of its SYNTHETIC sibling', () => {
  test.each([
    ['Prismari Pianist', pianist, 'SYNTHETIC Piano Elemental'],
    ['Rootha, Mastering the Moment', rootha, 'SYNTHETIC Moment Master'],
    ['Renegade Bull', bull, 'SYNTHETIC Charging Ox'],
    ['Manaform Hellkite', hellkite, 'SYNTHETIC Manaform Drake'],
    ['Magma Opus', opus, 'SYNTHETIC Opus Burst'],
    ['Furygale Flocking', flocking, 'SYNTHETIC Flocking Gale'],
    ['Leitmotif Composer', composer, 'SYNTHETIC Name Composer'],
    ['Restless Spire', spire, 'SYNTHETIC Spire Land'],
    ['Galazeth Prismari', galazeth, 'SYNTHETIC Prism Dragon'],
    ['Deep Analysis', analysis, 'SYNTHETIC Deep Study'],
    ['Rousing Refrain', refrain, 'SYNTHETIC Rushing Refrain'],
  ] as const)('%s', (_name, card, sibling) => {
    expect(validateCard(card)).toEqual([]);
    const other = syntheticCard(sibling);
    // A card that names itself ("creatures named ...") names its sibling in the fixture.
    const renamed = (value: unknown) =>
      JSON.parse(
        JSON.stringify(value).replaceAll(JSON.stringify(card.name), JSON.stringify(sibling)),
      );
    expect(renamed(card.faces[0]?.abilities)).toEqual(other.faces[0]?.abilities);
    expect(card.faces[0]?.spell).toEqual(other.faces[0]?.spell);
  });

  test('Brazen Borrower // Petty Theft: the creature face has the sibling’s abilities, the adventure is a spell', () => {
    expect(validateCard(borrower)).toEqual([]);
    const other = syntheticCard('SYNTHETIC Skittish Borrower');
    expect(borrower.faces[0]?.abilities).toEqual(other.faces[0]?.abilities);
    expect(borrower.faces[1]?.spell).toBeDefined();
  });
});

describe('Prismari Pianist: three tokens instead of one for a spell of mana value 5 or more', () => {
  const game = () =>
    build([pianist], (b) =>
      b.battlefield(pianist.name).battlefield('Island', { count: 5 }).hand(CANTRIP, STUDY),
    );

  test('mana value 1: one token; mana value 5: three', () => {
    const small = game();
    castHand(small, CANTRIP);
    small.passAll();
    expect(tokens(small, 'Elemental')).toHaveLength(1);
    const big = game();
    castHand(big, STUDY);
    big.passAll();
    expect(tokens(big, 'Elemental')).toHaveLength(3);
    big.expect.invariants();
  });
});

describe('Rootha, Mastering the Moment: an X/X token, X the greatest mana value cast this turn', () => {
  test('a mana value 1 spell then a mana value 5 spell: a 5/5 flying token with haste', () => {
    const g = build([rootha], (b) =>
      b.battlefield(rootha.name).battlefield('Island', { count: 6 }).hand(CANTRIP, STUDY),
    );
    castHand(g, STUDY);
    g.passAll();
    castHand(g, CANTRIP);
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    const made = tokens(g, 'Elemental');
    expect(made).toHaveLength(1);
    g.expect.pt(made[0]?.id as string, 5, 5);
    g.expect.derived(made[0]?.id as string, { keywords: ['flying', 'haste'] });
    g.expect.invariants();
  });

  test('no instant or sorcery cast this turn: no token (the intervening if)', () => {
    const g = build([rootha], (b) => b.battlefield(rootha.name));
    g.advanceTo('beginningOfCombat');
    g.passAll();
    expect(tokens(g, 'Elemental')).toHaveLength(0);
  });
});

describe('Manaform Hellkite: a Dragon Illusion as big as the mana spent, exiled at the end step', () => {
  test('a noncreature spell paid with five mana: a 5/5 flying haste token; at the end step it is exiled', () => {
    const g = build([hellkite], (b) =>
      b.battlefield(hellkite.name).battlefield('Island', { count: 5 }).hand(STUDY),
    );
    castHand(g, STUDY);
    g.passAll();
    const made = tokens(g, 'Dragon Illusion');
    expect(made).toHaveLength(1);
    g.expect.pt(made[0]?.id as string, 5, 5);
    g.expect.derived(made[0]?.id as string, { keywords: ['flying', 'haste'] });
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g, 'Dragon Illusion')).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('Renegade Bull: +X/+0 for the mana value of the spell cast', () => {
  test('a mana value 5 spell: 5/5 until the end of the turn', () => {
    const g = build([bull], (b) =>
      b.battlefield(bull.name, { label: 'bull' }).battlefield('Island', { count: 5 }).hand(STUDY),
    );
    castHand(g, STUDY);
    g.passAll();
    g.expect.pt('bull', 5, 5);
  });
});

describe('Leitmotif Composer: a copy of the creature when a spell of mana value 5 or more is cast', () => {
  test('mana value 5: a token copy; mana value 1: none', () => {
    const g = build([composer], (b) =>
      b.battlefield(composer.name).battlefield('Island', { count: 6 }).hand(CANTRIP, STUDY),
    );
    castHand(g, CANTRIP);
    g.passAll();
    expect(tokens(g, composer.name)).toHaveLength(0);
    castHand(g, STUDY);
    g.passAll();
    expect(tokens(g, composer.name)).toHaveLength(1);
    g.expect.invariants();
  });
});

describe('Rousing Refrain: mana for each card in the opponent’s hand that stays, then suspended', () => {
  test('three cards in the opponent’s hand: RRR that stays through the beginning of combat; the spell is in exile with three time counters', () => {
    const g = build([refrain], (b) => {
      b.hand(refrain.name).battlefield('Mountain', { count: 5 });
      b.seat(1).hand('Island', 'Island', 'Island');
    });
    castHand(g, refrain.name, { targets: [{ player: 1 }] });
    g.passAll();
    const [exiled] = g.find({ name: refrain.name, zone: 'exile', seat: 0 });
    expect(exiled?.counters.time).toBe(3);
    g.advanceTo('beginningOfCombat');
    expect(g.state.seats[0]?.manaPool.length).toBe(3);
    g.expect.invariants();
  });
});

describe('Deep Analysis: draws two, flashback for {1}{U} and 3 life', () => {
  test('cast from the graveyard with flashback: two cards drawn, 3 life paid, the card exiled', () => {
    const g = build([analysis], (b) =>
      b.graveyard(analysis.name).battlefield('Island', { count: 2 }),
    );
    const life = g.state.seats[0]?.life ?? 0;
    g.act(0).cast(
      { name: analysis.name, zone: 'graveyard', seat: 0 },
      { alternative: 'flashback', pay: true, targets: [{ player: 0 }] },
    );
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(life - 3);
    expect(g.find({ name: analysis.name, zone: 'exile', seat: 0 })).toHaveLength(1);
    g.expect.invariants();
  });
});

describe('Brazen Borrower // Petty Theft: can block only creatures with flying (CR 509.1b)', () => {
  const game = (attacker: string) =>
    build([borrower], (b) => {
      b.battlefield(attacker);
      b.seat(1).battlefield(borrower.name).battlefield(BEARS_NAME);
    });

  test('a creature without flying cannot be blocked by it; one with flying can', () => {
    const ground = game(BEARS_NAME);
    ground.advanceTo('declareAttackers');
    ground.act(0).attack({ name: BEARS_NAME, seat: 0 });
    ground.advanceTo('declareBlockers');
    ground.expect.canBlock({ name: borrower.name, seat: 1 }, { name: BEARS_NAME, seat: 0 }, false);
    const air = game('Serra Angel');
    air.advanceTo('declareAttackers');
    air.act(0).attack({ name: 'Serra Angel', seat: 0 });
    air.advanceTo('declareBlockers');
    air.expect.canBlock({ name: borrower.name, seat: 1 }, { name: 'Serra Angel', seat: 0 }, true);
  });
});

describe('Restless Spire, Galazeth Prismari, Magma Opus and Furygale Flocking', () => {
  test('Galazeth makes a Treasure when it enters', () => {
    const g = build([galazeth], (b) =>
      b
        .hand(galazeth.name)
        .battlefield('Island', { count: 2 })
        .battlefield('Mountain', { count: 2 }),
    );
    castHand(g, galazeth.name);
    g.passAll();
    expect(tokens(g, 'Treasure')).toHaveLength(1);
  });

  test('Magma Opus: discard it for a Treasure', () => {
    const g = build([opus], (b) => b.hand(opus.name).battlefield('Island', { count: 2 }));
    g.act(0).activate({ name: opus.name, zone: 'hand', seat: 0 });
    g.choose(0, { kind: 'payAuto' });
    g.passAll();
    expect(tokens(g, 'Treasure')).toHaveLength(1);
  });

  test('Furygale Flocking: two 3/3 flying tokens with haste for the opponent', () => {
    const g = build([flocking], (b) =>
      b
        .hand(flocking.name)
        .battlefield('Island', { count: 6 })
        .battlefield('Mountain', { count: 2 })
        .graveyard(CANTRIP, CANTRIP),
    );
    castHand(g, flocking.name);
    g.passAll();
    const made = tokens(g, 'Elemental');
    expect(made).toHaveLength(2);
    for (const token of made) {
      g.expect.pt(token.id, 3, 3);
      g.expect.derived(token.id, { keywords: ['flying', 'haste'] });
    }
    g.expect.invariants();
  });

  test('Restless Spire becomes a 2/1 blue and red Elemental land creature with first strike', () => {
    const g = build([spire], (b) =>
      b.battlefield(spire.name, { label: 'spire' }).battlefield('Island').battlefield('Mountain'),
    );
    g.act(0).activate({ name: spire.name, zone: 'battlefield', seat: 0 }, { ability: 2 });
    g.choose(0, { kind: 'payAuto' });
    g.passAll();
    g.expect.derived('spire', {
      types: ['land', 'creature'],
      subtypes: ['Elemental'],
      colors: ['U', 'R'],
      keywords: ['firstStrike'],
    });
    g.expect.pt('spire', 2, 1);
  });

  test('Restless Spire enters tapped', () => {
    const g = build([spire], (b) => b.hand(spire.name));
    g.act(0).playLand({ name: spire.name, zone: 'hand', seat: 0 });
    expect(g.find({ name: spire.name, zone: 'battlefield', seat: 0 })[0]?.tapped).toBe(true);
  });
});

describe("Jeska's Will (a card the same words unlock): red mana for each card in target opponent's hand", () => {
  test('the first mode: mana for each card in the opponent’s hand, with the opponent as the target', () => {
    const g = build([jeskas], (b) => {
      b.hand(jeskas.name).battlefield('Mountain', { count: 3 });
      b.seat(1).hand('Island', 'Island', 'Island', 'Island');
    });
    castHand(g, jeskas.name, { modes: [0], targets: [{ player: 1 }] });
    g.passAll();
    // {2}{R} was paid from three lands; the mana of the spell is four red.
    expect(g.state.seats[0]?.manaPool.filter((m) => m.color === 'R')).toHaveLength(4);
    g.expect.invariants();
  });
});
