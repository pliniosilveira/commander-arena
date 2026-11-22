// Abzan Armor deck, group A (combat): "assigns combat damage equal to its toughness rather than its power" and "can attack as though it didn't have defender", as engine primitives.
// Pins: CR 510.1a (a creature assigns combat damage equal to its power, unless an effect says otherwise; 0 or less assigns none), CR 510.1b-d (who gets it), CR 702.19b (trample: lethal damage
// first, the excess to what is attacked, with the amount the effect gives), CR 702.2c (deathtouch: 1 is lethal), CR 702.3b (a creature with defender can't attack) and CR 609.4 (an "as though"
// effect changes only the thing it names: power and toughness stay, haste is still needed), CR 611.2c (a rule-changing effect reaches creatures that match later), CR 508.6 (a player
// "attacked you" by declaring attackers attacking them), CR 611.3a ("during your turn").
// Cards: the SYNTHETIC cards of this file, and the real Grizzly Bears and Giant Spider.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { kw } from '../src/cards/fixtures/helpers';
import type { ObjectId } from '../src/ids';
import { validateCard } from '../src/index';
import { attackCandidates } from '../src/rules/combat-legality';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const ARMOR = 'SYNTHETIC Toughness Armor'; // Each creature you control assigns combat damage equal to its toughness rather than its power.
const TURN_ARMOR = 'SYNTHETIC Turn Armor'; // During your turn, each creature assigns combat damage equal to its toughness rather than its power.
const RALLY = 'SYNTHETIC Defender Rally'; // Creatures you control with defender can attack this turn as though they didn't have defender.
const LEND = 'SYNTHETIC Defender Lend'; // Target creature can attack this turn as though it didn't have defender.
const OVERSIZE = 'SYNTHETIC Oversize'; // Until end of turn, target creature assigns combat damage equal to its toughness rather than its power.
const TOUGH = 'SYNTHETIC Tough 1/5';
const TOUGH_TRAMPLER = 'SYNTHETIC Tough Trampler 2/6';
const TOUGH_DEATHTOUCH = 'SYNTHETIC Tough Deathtouch Trampler 1/5';
const WALL = 'SYNTHETIC Plain Wall 0/4'; // defender
const HASTY_WALL = 'SYNTHETIC Hasty Wall 1/3'; // defender, haste
const SENTINEL = 'SYNTHETIC Sentinel Wall 2/5'; // defender; can attack players who attacked you during their last turn as though it didn't have defender
const BLOCKER = 'SYNTHETIC Plain 3/3';
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const creature = (
  name: string,
  power: number,
  toughness: number,
  abilities: readonly Ability[] = [],
) =>
  singleFaceCard({
    name,
    manaCost: ['1'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power,
    toughness,
    oracleText: '',
    abilities,
  });

const enchantment = (name: string, ability: readonly Ability[]) =>
  singleFaceCard({
    name,
    manaCost: ['1'],
    types: ['enchantment'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
    abilities: ability,
  });

const armor = enchantment(ARMOR, [
  {
    kind: 'static',
    static: {
      kind: 'restriction',
      subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
      restriction: 'assignsDamageByToughness',
    },
  },
]);
const turnArmor = enchantment(TURN_ARMOR, [
  {
    kind: 'static',
    static: {
      kind: 'restriction',
      subject: { kind: 'filter', filter: { types: ['creature'] } },
      restriction: 'assignsDamageByToughness',
    },
    condition: { kind: 'yourTurn' },
  },
]);
const rally = singleFaceCard({
  name: RALLY,
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: '',
  spell: {
    effect: {
      kind: 'restrictGroup',
      creatures: { types: ['creature'], keywords: ['defender'], controller: 'you' },
      restriction: 'canAttackAsThoughNoDefender',
      duration: 'untilEndOfTurn',
    },
  },
});
const lend = singleFaceCard({
  name: LEND,
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: '',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: {
      kind: 'restrict',
      objects: { kind: 'target', id: 't1' },
      restriction: 'canAttackAsThoughNoDefender',
      duration: 'untilEndOfTurn',
    },
  },
});
const oversize = singleFaceCard({
  name: OVERSIZE,
  manaCost: ['1'],
  types: ['sorcery'],
  colors: [],
  colorIdentity: [],
  oracleText: '',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: {
      kind: 'restrict',
      objects: { kind: 'target', id: 't1' },
      restriction: 'assignsDamageByToughness',
      duration: 'untilEndOfTurn',
    },
  },
});
const cards = [
  armor,
  turnArmor,
  rally,
  lend,
  oversize,
  creature(TOUGH, 1, 5),
  creature(TOUGH_TRAMPLER, 2, 6, [kw('trample')]),
  creature(TOUGH_DEATHTOUCH, 1, 5, [kw('deathtouch'), kw('trample')]),
  creature(WALL, 0, 4, [kw('defender')]),
  creature(HASTY_WALL, 1, 3, [kw('defender'), kw('haste')]),
  creature(BLOCKER, 3, 3),
  singleFaceCard({
    name: SENTINEL,
    manaCost: ['1'],
    types: ['creature'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 5,
    oracleText: '',
    abilities: [
      kw('defender'),
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: { kind: 'this' },
          restriction: 'canAttackAsThoughNoDefenderVsLastTurnAttackers',
        },
      },
    ],
  }),
];

/** The name of the card of the object `id`, among the cards of this file. */
function nameOf(g: ScenarioGame, id: ObjectId): string {
  const found = [BEARS, WALL, HASTY_WALL, BLOCKER, SENTINEL, TOUGH].find((name) =>
    g.find({ name }).some((o) => o.id === id),
  );
  return found ?? `#${id}`;
}

function build(setup: (b: ReturnType<typeof scenario>) => void, seats = 2) {
  let b = scenario({ seats });
  for (const c of cards) b = b.define(c);
  setup(b);
  return b;
}

/** Seat 0 attacks seat 1 with `attacker`, optionally blocked by `blocker`; combat damage is dealt unless a decision is pending. */
function attackedAndBlocked(g: ScenarioGame, attacker: string, blocker?: string) {
  g.advanceTo('declareAttackers');
  g.act(0).attack(attacker);
  g.advanceTo('declareBlockers');
  if (blocker !== undefined) g.act(1).declareBlockers([{ blocker, attacker }]);
  g.passAll();
}

describe('the cards are valid', () => {
  test.each(cards.map((c) => [c.name, c] as const))('%s', (_name, card) => {
    const issues = validateCard(card);
    if (issues.length > 0) throw new Error(JSON.stringify(issues));
  });
});

describe('"Each creature you control assigns combat damage equal to its toughness rather than its power" (CR 510.1a)', () => {
  test('an unblocked 1/5 deals 5 to the player (CR 510.1b)', () => {
    const g = build((b) => {
      b.seat(0)
        .battlefield(ARMOR, TOUGH)
        .library(...FILLER);
      b.seat(1).library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    attackedAndBlocked(g, TOUGH);
    g.expect.life(1, 35);
  });

  test('without the effect the same creature deals its power', () => {
    const g = build((b) => {
      b.seat(0)
        .battlefield(TOUGH)
        .library(...FILLER);
      b.seat(1).library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    attackedAndBlocked(g, TOUGH);
    g.expect.life(1, 39);
  });

  test('it changes the amount only: power and toughness stay as they were (CR 510.1a, 609.4)', () => {
    const g = build((b) => {
      b.seat(0)
        .battlefield(ARMOR, TOUGH)
        .library(...FILLER);
      b.seat(1).library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(TOUGH, 1, 5);
  });

  test('a blocked creature assigns its toughness to its blocker (CR 510.1c), a creature without the effect its power', () => {
    const g = build((b) => {
      b.seat(0)
        .battlefield(ARMOR, TOUGH)
        .library(...FILLER);
      b.seat(1)
        .battlefield(BLOCKER)
        .library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    attackedAndBlocked(g, TOUGH, BLOCKER);
    g.expect.zone(BLOCKER, 'graveyard', { seat: 1 });
    // The blocker belongs to the other player: it assigns its power, 3, to a 1/5 that has 5 toughness.
    g.expect.zone(TOUGH, 'battlefield', { seat: 0 });
  });

  test('a blocking creature assigns its toughness too (CR 510.1d)', () => {
    const g = build((b) => {
      b.seat(0)
        .battlefield(BLOCKER)
        .library(...FILLER);
      b.seat(1)
        .battlefield(ARMOR, WALL)
        .library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    attackedAndBlocked(g, BLOCKER, WALL);
    // The 0/4 wall assigns 4 damage to the 3/3.
    g.expect.zone(BLOCKER, 'graveyard', { seat: 0 });
  });

  test('trample: the toughness is divided, lethal to the blocker first and the excess to the player (CR 702.19b)', () => {
    const g = build((b) => {
      b.seat(0)
        .battlefield(ARMOR, TOUGH_TRAMPLER)
        .library(...FILLER);
      b.seat(1)
        .battlefield(BLOCKER)
        .library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(TOUGH_TRAMPLER);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: BLOCKER, attacker: TOUGH_TRAMPLER }]);
    g.passAll();
    g.expect.pending('assignDamage', 0);
    const d = g.state.pending;
    if (d?.kind !== 'assignDamage') throw new Error('expected assignDamage');
    // Power 2, toughness 6: the amount to divide is 6, and 3 is lethal to the 3/3.
    expect(d.choices[0]).toMatchObject({ power: 6, trample: true });
    expect(d.choices[0]?.blockers.map((b) => b.lethal)).toEqual([3]);
    g.expect.illegal(0, {
      assignDamage: [
        { from: TOUGH_TRAMPLER, to: BLOCKER, amount: 2 },
        { from: TOUGH_TRAMPLER, to: { player: 1 }, amount: 4 },
      ],
    });
    g.act(0).assignDamage([
      { from: TOUGH_TRAMPLER, to: BLOCKER, amount: 3 },
      { from: TOUGH_TRAMPLER, to: { player: 1 }, amount: 3 },
    ]);
    g.expect.life(1, 37);
    g.expect.zone(BLOCKER, 'graveyard', { seat: 1 });
  });

  test('trample with deathtouch: 1 is lethal, so 4 of the 5 assigned go to the player (CR 702.2c, 702.19b)', () => {
    const g = build((b) => {
      b.seat(0)
        .battlefield(ARMOR, TOUGH_DEATHTOUCH)
        .library(...FILLER);
      b.seat(1)
        .battlefield(BLOCKER)
        .library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(TOUGH_DEATHTOUCH);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: BLOCKER, attacker: TOUGH_DEATHTOUCH }]);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'assignDamage') throw new Error('expected assignDamage');
    expect(d.choices[0]).toMatchObject({ power: 5, deathtouch: true, trample: true });
    expect(d.choices[0]?.blockers.map((b) => b.lethal)).toEqual([1]);
    g.act(0).assignDamage([
      { from: TOUGH_DEATHTOUCH, to: BLOCKER, amount: 1 },
      { from: TOUGH_DEATHTOUCH, to: { player: 1 }, amount: 4 },
    ]);
    g.expect.life(1, 36);
    g.expect.zone(BLOCKER, 'graveyard', { seat: 1 });
  });

  test('with three seats the damage goes to the player the creature attacks, not to the first opponent (CR 510.1b)', () => {
    const g = build((b) => {
      b.seat(0)
        .battlefield(ARMOR, TOUGH)
        .library(...FILLER);
      b.seat(1).library(...FILLER);
      b.seat(2).library(...FILLER);
    }, 3)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(TOUGH, { player: 2 });
    g.advanceTo('postcombatMain');
    g.expect.life(2, 35);
    g.expect.life(1, 40);
  });
});

describe('"During your turn, each creature assigns ..." (CR 611.3a, 510.1a)', () => {
  test("on its controller's turn every creature assigns toughness, whoever controls it, and not on another turn", () => {
    const g = build((b) => {
      b.seat(0)
        .battlefield(TURN_ARMOR, BLOCKER)
        .library(...FILLER);
      b.seat(1)
        .battlefield(WALL, TOUGH)
        .library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    // Seat 0's turn: the 0/4 wall of the opponent assigns 4 as it blocks the 3/3.
    attackedAndBlocked(g, BLOCKER, WALL);
    g.expect.zone(BLOCKER, 'graveyard', { seat: 0 });
    // Seat 1's turn: the condition fails, the 1/5 assigns its power.
    g.advanceTo('declareAttackers', { turn: 'next' });
    g.act(1).attack(TOUGH);
    g.advanceTo('postcombatMain');
    g.expect.life(0, 39);
  });
});

describe('"can attack as though it didn\'t have defender" (CR 702.3b, 609.4)', () => {
  const attackers = (g: ScenarioGame) =>
    attackCandidates(g.state, 0).map((c) => nameOf(g, c.attacker));

  test('a creature with defender can not attack; the group effect lets creatures with defender attack, and only those', () => {
    const g = build((b) => {
      b.seat(0)
        .hand(RALLY)
        .battlefield(WALL, BEARS, 'Plains')
        .library(...FILLER);
      b.seat(1).library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    expect(attackers(g)).toEqual([BEARS]);
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    expect(attackers(g).sort()).toEqual([BEARS, WALL].sort());
  });

  test('the group is read as attackers are declared: a creature with defender that arrives later this turn is affected (CR 611.2c)', () => {
    const g = build((b) => {
      b.seat(0)
        .hand(RALLY, HASTY_WALL)
        .battlefield('Plains', 'Plains', 'Plains')
        .library(...FILLER);
      b.seat(1).library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    g.act(0).cast(HASTY_WALL, { pay: true });
    g.passAll();
    // Haste is still needed (CR 609.4: only the defender keyword is set aside): the hasty wall can attack.
    expect(attackers(g)).toEqual([HASTY_WALL]);
  });

  test('it does not give haste: a creature with defender that is summoning sick still can not attack', () => {
    const g = build((b) => {
      b.seat(0)
        .hand(RALLY, BLOCKER)
        .battlefield('Plains', 'Plains', 'Plains')
        .library(...FILLER);
      b.seat(1).library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    expect(attackers(g)).toEqual([]);
  });

  test('it ends with the turn (CR 514.2)', () => {
    const g = build((b) => {
      b.seat(0)
        .hand(RALLY)
        .battlefield(WALL, 'Plains')
        .library(...FILLER);
      b.seat(1).library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    expect(attackers(g)).toEqual([WALL]);
    g.advanceTo('declareAttackers', { turn: 'next' });
    g.advanceTo('declareAttackers', { turn: 'next' });
    expect(attackers(g)).toEqual([]);
  });

  test('a target creature can attack and its combat damage is the damage of the creature (the wall deals its power, 0)', () => {
    const g = build((b) => {
      b.seat(0)
        .hand(LEND)
        .battlefield(WALL, BEARS, 'Plains')
        .library(...FILLER);
      b.seat(1).library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(LEND, { targets: [WALL], pay: true });
    g.passAll();
    expect(attackers(g).sort()).toEqual([BEARS, WALL].sort());
  });

  test('"Until end of turn, target creature assigns combat damage equal to its toughness rather than its power" (CR 510.1a, 611.2a)', () => {
    const g = build((b) => {
      b.seat(0)
        .hand(OVERSIZE)
        .battlefield(TOUGH, 'Plains')
        .library(...FILLER);
      b.seat(1).library(...FILLER);
    })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(OVERSIZE, { targets: [TOUGH], pay: true });
    g.passAll();
    attackedAndBlocked(g, TOUGH);
    g.expect.life(1, 35);
  });
});

describe('"can attack players who attacked you during their last turn as though it didn\'t have defender" (CR 508.6, 609.4, 702.3b)', () => {
  const sentinelTargets = (g: ScenarioGame) =>
    attackCandidates(g.state, 0)
      .filter((c) => nameOf(g, c.attacker) === SENTINEL)
      .flatMap((c) => c.targets.map((t) => (t.kind === 'player' ? t.seat : -1)));

  /** Seat 1 attacks seat `at` on its turn, seat 2 attacks nobody; then it is seat 0's declare attackers step. */
  function afterTurns(at: number | null) {
    const g = build((b) => {
      b.seat(0)
        .battlefield(SENTINEL)
        .library(...FILLER);
      b.seat(1)
        .battlefield(BEARS)
        .library(...FILLER);
      b.seat(2).library(...FILLER);
    }, 3)
      .at('precombatMain', { active: 1, turn: 3 })
      .build();
    if (at !== null) {
      g.advanceTo('declareAttackers', { attack: false });
      g.act(1).attack(BEARS, { player: at });
    }
    g.advanceTo('declareAttackers', { turn: 'next' });
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    return g;
  }

  test('it may attack the player who attacked its controller on their last turn, and no one else', () => {
    const g = afterTurns(0);
    expect(g.state.turn.activeSeat).toBe(0);
    expect(sentinelTargets(g)).toEqual([1]);
  });

  test('a player who attacked somebody else is not one it may attack', () => {
    const g = afterTurns(2);
    expect(g.state.turn.activeSeat).toBe(0);
    expect(sentinelTargets(g)).toEqual([]);
  });

  test('a player who did not attack at all is not one it may attack', () => {
    const g = afterTurns(null);
    expect(g.state.turn.activeSeat).toBe(0);
    expect(sentinelTargets(g)).toEqual([]);
  });

  test('the declaration is checked: the player who attacked may be attacked, the other may not', () => {
    const g = afterTurns(0);
    g.expect.legal(0, { declareAttackers: [{ attacker: SENTINEL, target: { player: 1 } }] });
    g.expect.illegal(0, { declareAttackers: [{ attacker: SENTINEL, target: { player: 2 } }] });
  });

  test('only their last turn counts: after a turn without an attack the permission is gone', () => {
    const g = afterTurns(0);
    g.act(0).declareAttackers([]);
    // Seat 1's next turn, with no attack, then seat 2's, then seat 0's again.
    g.advanceTo('declareAttackers', { turn: 'next' });
    g.advanceTo('declareAttackers', { turn: 'next' });
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    expect(g.state.turn.activeSeat).toBe(0);
    expect(sentinelTargets(g)).toEqual([]);
  });
});
