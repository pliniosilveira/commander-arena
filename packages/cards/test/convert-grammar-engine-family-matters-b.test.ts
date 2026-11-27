// Family Matters (Bloomburrow Commander, issue 111), group B: the REAL Oracle text of the golden corpus goes through the grammar as cards with no override and is played through applyAction.
// Devilish Valet: "Whenever another creature you control enters, double this creature's power until end of turn." (CR 701.10 Double, 603.2, 611.2a).
// Rapid Augmenter: "..., if it wasn't cast, put a +1/+1 counter on this creature and this creature can't be blocked this turn." (CR 603.4, 601.2a, 509.1b).
// Rose Room Treasurer: "create a Treasure token if this is the first or second time this ability has resolved this turn. Otherwise, you may pay {X}. When you do, ..." (CR 608.2c, 603.12, 107.3f).
// Boss's Chauffeur: "enters with a number of +1/+1 counters on it equal to one plus the number of other creatures you control" (CR 614.12), "When this creature dies, create a ... token for
// each +1/+1 counter on it" (CR 603.10a, 113.7a: last-known information).
// Tetsuko Umezawa, Fugitive: "Creatures you control with power or toughness 1 or less can't be blocked." (CR 509.1b, 208.1, 613.4).
// The CR text was not available here: the numbers are those the engine's comments cite.
import { readFileSync } from 'node:fs';
import { applyAction, type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly, spellCard } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

/** A SYNTHETIC sorcery that puts one 1/1 creature token onto the battlefield: a creature that enters without being cast. */
function tokenMaker(): CardDefinition {
  const imported = parseOnly(
    spellCard('SYNTHETIC Token Maker', 'Create a 1/1 white Soldier creature token.', {
      type: 'Sorcery',
      manaCost: '{W}',
    }),
  );
  expect(imported.support.status).toBe('supported');
  return imported.definition;
}

const VALET = real('Devilish Valet');
const AUGMENTER = real('Rapid Augmenter');
const TREASURER = real('Rose Room Treasurer');
const CHAUFFEUR = real("Boss's Chauffeur");
const TETSUKO = real('Tetsuko Umezawa, Fugitive');
const MAKER = tokenMaker();
const BEARS = 'Grizzly Bears'; // 2/2, {1}{G}
const ELVES = 'Llanowar Elves'; // 1/1, {G}
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

test.each([VALET, AUGMENTER, TREASURER, CHAUFFEUR, TETSUKO])('$name is a valid card', (card) => {
  expect(validateCard(card)).toEqual([]);
});

/** Whether seat 1 may declare `blocker` blocking `attacker` at the declare blockers decision now (CR 509.1b), by what the engine accepts. */
function canBlock(g: ScenarioGame, blocker: string, attacker: string): boolean {
  return applyAction(g.state, 1, {
    kind: 'declareBlockers',
    blocks: [{ blocker: g.id(blocker), attacker: g.id(attacker) }],
  }).ok;
}

/** Seat 0 attacks seat 1 with the creatures labelled `attackers`, and the game stops at the declare blockers decision of seat 1. */
function attackWith(g: ScenarioGame, attackers: readonly string[]): void {
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack(attackers, { player: 1 });
  g.advanceTo('declareBlockers');
}

/** Seat 0 controls exactly `count` Treasure tokens. */
const treasures = (g: ScenarioGame, count: number): void =>
  g.expect.zone('Treasure', 'battlefield', { seat: 0, count });

describe('Devilish Valet', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(VALET)
      .define(MAKER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(VALET.name, { label: 'valet' })
      .battlefield('Forest', 'Forest', 'Plains')
      .hand(BEARS, ELVES, MAKER.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('another creature enters under my control: its power is doubled until end of turn (CR 701.10, 611.2a)', () => {
    const g = board();
    g.expect.pt('valet', 1, 3);
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.pt('valet', 2, 3);
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    // Doubled again: 2 becomes 4 (a power change, not a set, so the effects stack, CR 613.4).
    g.expect.pt('valet', 4, 3);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('valet', 1, 3);
    g.expect.invariants();
  });

  test('a token that enters (nothing was cast) triggers it too', () => {
    const g = board();
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    g.expect.pt('valet', 2, 3);
    g.expect.invariants();
  });

  test('it does not trigger on itself, and not on a creature another player controls', () => {
    const g = scenario({ seats: 3 })
      .define(VALET)
      .seat(0)
      .library(...LIBRARY)
      .hand(VALET.name)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield('Forest', 'Forest')
      .battlefield(VALET.name, { label: 'other' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(VALET.name, { pay: true });
    g.passAll();
    g.expect.pt(`${VALET.name}[0]`, 1, 3);
    g.expect.pt('other', 1, 3);
    g.expect.invariants();
  });
});

describe('Rapid Augmenter', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(AUGMENTER)
      .define(MAKER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(AUGMENTER.name, { label: 'aug' })
      .battlefield('Forest', 'Forest', 'Plains')
      .hand(BEARS, ELVES, MAKER.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'blocker' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a creature that was put onto the battlefield without being cast: +1/+1 counter and it cannot be blocked this turn (CR 603.4, 509.1b)', () => {
    const g = board();
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    // The 1/1 token has base power 1, so the haste ability triggers too: two triggers of mine to order (CR 603.3b).
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.counters('aug', { '+1/+1': 1 });
    g.expect.pt('aug', 2, 4);
    attackWith(g, ['aug']);
    expect(canBlock(g, 'blocker', 'aug')).toBe(false);
    g.expect.invariants();
  });

  test('it lasts this turn only (CR 514.2): next turn the creature can be blocked again', () => {
    const g = board();
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    // Three players: the turns of seats 1 and 2 pass, and it is my turn again.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    attackWith(g, ['aug']);
    expect(canBlock(g, 'blocker', 'aug')).toBe(true);
  });

  test('a creature that was cast: nothing happens (the intervening "if" fails, CR 603.4)', () => {
    const g = board();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.counters('aug', {});
    attackWith(g, ['aug']);
    expect(canBlock(g, 'blocker', 'aug')).toBe(true);
    g.expect.invariants();
  });

  test('a creature another player controls: no trigger', () => {
    const g = scenario({ seats: 3 })
      .define(AUGMENTER)
      .define(MAKER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(AUGMENTER.name, { label: 'aug' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Plains')
      .hand(MAKER.name)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(MAKER.name, { pay: true });
    g.passAll();
    g.expect.counters('aug', {});
    g.expect.invariants();
  });

  test('a creature with base power 1 that enters gains haste until end of turn (CR 702.10)', () => {
    const g = scenario()
      .define(AUGMENTER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(AUGMENTER.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .hand(BEARS, ELVES)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(ELVES, true);
    g.expect.canAttack(BEARS, false);
    g.expect.invariants();
  });
});

describe('Rose Room Treasurer', () => {
  /** Seat 0 has the Treasurer, three token makers, three Plains and `lands` Mountains; seats 1 and 2 have a Bears each. */
  const board = (lands: number) => {
    const b = scenario({ seats: 3 })
      .define(TREASURER)
      .define(MAKER)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TREASURER.name, { label: 'treasurer' })
      .battlefield('Plains', 'Plains', 'Plains')
      .hand(MAKER.name, MAKER.name, MAKER.name);
    for (let i = 0; i < lands; i += 1) b.battlefield('Mountain');
    return b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'b1' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'b2' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };
  const makeThree = (g: ScenarioGame) => {
    for (let i = 0; i < 3; i += 1) {
      g.act(0).cast(`${MAKER.name}[0]`, { pay: true });
      g.passAll();
    }
  };

  test('the first and the second time it resolves this turn each make a Treasure (CR 608.2c)', () => {
    const g = board(0);
    g.act(0).cast(`${MAKER.name}[0]`, { pay: true });
    g.passAll();
    treasures(g, 1);
    g.act(0).cast(`${MAKER.name}[0]`, { pay: true });
    g.passAll();
    treasures(g, 2);
    g.expect.invariants();
  });

  test('the third time: no Treasure; I may pay {X} and, when I do, it deals X damage to any target (CR 603.12)', () => {
    const g = board(3);
    makeThree(g);
    treasures(g, 2);
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseX');
    if (d?.kind !== 'chooseX') return;
    expect(d.min).toBe(0);
    // Three Mountains and the two Treasures could pay (the Plains were tapped for the token makers).
    expect(d.max).toBe(5);
    g.act(0).chooseX(2);
    g.act(0).payAuto();
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ name: BEARS, seat: 2 });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('X = 1 is not enough to kill a 2/2: it deals exactly X damage', () => {
    const g = board(3);
    makeThree(g);
    g.act(0).chooseX(1);
    g.act(0).payAuto();
    g.passAll();
    g.act(0).chooseTargets({ name: BEARS, seat: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.damage({ name: BEARS, seat: 1 }, 1);
    g.expect.invariants();
  });

  test('X = 0: nothing is paid and nothing happens', () => {
    const g = board(3);
    makeThree(g);
    g.act(0).chooseX(0);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 2 });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('X is at most the mana I could pay: with no land untapped only the two Treasures just made can (CR 118.3)', () => {
    const g = board(0);
    makeThree(g);
    treasures(g, 2);
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseX');
    if (d?.kind !== 'chooseX') return;
    expect(d.max).toBe(2);
    g.expect.invariants();
  });
});

describe("Boss's Chauffeur", () => {
  const board = (others: number) => {
    const b = scenario({ seats: 3 })
      .define(CHAUFFEUR)
      .seat(0)
      .library(...LIBRARY)
      .hand(CHAUFFEUR.name, ELVES, BOLT)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Forest', 'Mountain');
    for (let i = 0; i < others; i += 1) b.battlefield(BEARS, { label: `mine${i}` });
    return b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };

  test('it enters with one plus the other creatures I control; the creatures of other players are not counted (CR 614.12)', () => {
    const g = board(2);
    g.act(0).cast(CHAUFFEUR.name, { pay: true });
    g.passAll();
    g.expect.counters(CHAUFFEUR.name, { '+1/+1': 3 });
    g.expect.pt(CHAUFFEUR.name, 3, 3);
    g.expect.invariants();
  });

  test('with no other creature it enters with one counter', () => {
    const g = board(0);
    g.act(0).cast(CHAUFFEUR.name, { pay: true });
    g.passAll();
    g.expect.counters(CHAUFFEUR.name, { '+1/+1': 1 });
    g.expect.invariants();
  });

  test('Alliance: another creature entering under my control adds a counter; when it dies, one Citizen for each counter it had (CR 603.10a, 113.7a)', () => {
    const g = board(1);
    g.act(0).cast(CHAUFFEUR.name, { pay: true });
    g.passAll();
    g.expect.counters(CHAUFFEUR.name, { '+1/+1': 2 });
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.counters(CHAUFFEUR.name, { '+1/+1': 3 });
    g.act(0).cast(BOLT, { targets: [CHAUFFEUR.name], pay: true });
    g.passAll();
    g.expect.zone(CHAUFFEUR.name, 'graveyard', { seat: 0 });
    g.expect.zone('Citizen', 'battlefield', { seat: 0, count: 3 });
    g.expect.invariants();
  });
});

describe('Tetsuko Umezawa, Fugitive', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(TETSUKO)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TETSUKO.name, { label: 'tetsuko' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(ELVES, { label: 'elves' })
      .battlefield(ELVES, { label: 'grown', counters: { '+1/+1': 1 } })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'blocker' })
      .battlefield(ELVES, { label: 'theirs' })
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('my creatures with power or toughness 1 or less cannot be blocked; the others can (CR 509.1b)', () => {
    const g = board();
    // Tetsuko is 1/3 and one Elves 1/1 (power 1); the Bears 2/2 and the Elves with a counter 2/2 have neither.
    attackWith(g, ['tetsuko', 'bears', 'elves', 'grown']);
    expect(canBlock(g, 'blocker', 'tetsuko')).toBe(false);
    expect(canBlock(g, 'blocker', 'elves')).toBe(false);
    expect(canBlock(g, 'blocker', 'bears')).toBe(true);
    expect(canBlock(g, 'blocker', 'grown')).toBe(true);
    g.expect.invariants();
  });

  test('the group is mine only: a creature of another player with power 1 is blocked as usual', () => {
    const g = scenario({ seats: 3 })
      .define(TETSUKO)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'blocker' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(TETSUKO.name, { label: 'tetsuko' })
      .battlefield(ELVES, { label: 'elves' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 2, turn: 2 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(2).attack(['theirs'], { player: 0 });
    g.advanceTo('declareBlockers');
    expect(
      applyAction(g.state, 0, {
        kind: 'declareBlockers',
        blocks: [{ blocker: g.id('blocker'), attacker: g.id('theirs') }],
      }).ok,
    ).toBe(true);
  });
});
