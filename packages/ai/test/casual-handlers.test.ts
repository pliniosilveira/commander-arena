// CasualAgent decisions on hand-made views: each test builds the smallest view that poses one
// question and checks the answer. Combat answers are also checked with the independent legality
// checker from the combat tests (`combatAnswerErrors`).
import {
  type Action,
  type CardType,
  DECISION_KINDS,
  type DeclareAttackersDecision,
  type DeclareBlockersDecision,
  type GameView,
  type MulliganDecision,
  type ObjectId,
  type ObjectView,
  type PendingDecision,
  type PriorityDecision,
  type PriorityOption,
  type SeatView,
  type TargetsDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { CasualAgent, createCasualHandlers } from '../src/index';
import { CTX, combatAnswerErrors } from './helpers';

// ---- Builders for views and decisions

let nextId = 1;
const oid = (): ObjectId => `o${nextId++}`;

interface ObjSpec {
  readonly id?: ObjectId;
  readonly name?: string;
  readonly types?: readonly CardType[];
  readonly cost?: readonly string[] | null;
  readonly power?: number;
  readonly toughness?: number;
  readonly controller?: number;
  readonly tapped?: boolean;
  readonly keywords?: readonly string[];
  readonly text?: string;
}

function obj(spec: ObjSpec = {}): ObjectView {
  const types = spec.types ?? ['creature'];
  return {
    id: spec.id ?? oid(),
    owner: spec.controller ?? 0,
    controller: spec.controller ?? 0,
    zone: 'battlefield',
    name: spec.name ?? 'Thing',
    manaCost: spec.cost === undefined ? ['1'] : spec.cost,
    supertypes: [],
    types,
    subtypes: [],
    colors: [],
    power: types.includes('creature') ? (spec.power ?? 2) : null,
    toughness: types.includes('creature') ? (spec.toughness ?? 2) : null,
    oracleText: spec.text ?? '',
    tapped: spec.tapped ?? false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: spec.keywords ?? [],
    protector: null,
    support: 'supported',
    targets: [],
  };
}

const land = (name = 'Plains') => obj({ name, types: ['land'], cost: null });
const creature = (power: number, toughness: number, spec: ObjSpec = {}) =>
  obj({ ...spec, power, toughness });

interface ViewSpec {
  readonly hand?: readonly ObjectView[];
  readonly command?: readonly ObjectView[];
  readonly battlefield?: readonly ObjectView[];
  readonly stack?: readonly ObjectView[];
  readonly life?: number;
  readonly opponentLife?: number;
}

/** Seat 0 is the viewer, seat 1 the opponent. */
function view(spec: ViewSpec = {}): GameView {
  const seat = (id: number, life: number, hand: readonly ObjectView[] | null): SeatView => ({
    id,
    life,
    poison: 0,
    handCount: hand?.length ?? 7,
    libraryCount: 20,
    hand,
    graveyard: [],
    command: id === 0 ? (spec.command ?? []) : [],
    manaPool: [],
    hasLost: false,
    mulligans: 0,
    landsPlayedThisTurn: 0,
    lifeLostThisTurn: 0,
    spellsCastThisTurn: 0,
    landPlaysAllowed: 1,
    commanderTax: {},
  });
  return {
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    phase: 'precombatMain',
    step: 'precombatMain',
    prioritySeat: 0,
    seats: [seat(0, spec.life ?? 20, spec.hand ?? []), seat(1, spec.opponentLife ?? 20, null)],
    monarch: null,
    battlefield: spec.battlefield ?? [],
    exile: [],
    stack: spec.stack ?? [],
    combat: null,
    pending: null,
    decidingSeat: 0,
    commanderDamage: {},
    result: null,
  };
}

/** Everything the agent sees must come from the view, so the hand objects are in the view too. */
function answer(v: GameView, decision: PendingDecision, seed = 1): Action {
  const handlers = new CasualAgent({ seed }).decisionHandlers(v);
  // Same dispatch the agent uses, but synchronous so the tests stay simple.
  return (handlers[decision.kind] as (d: PendingDecision) => Action)(decision);
}

const base = { id: 'd1', seat: 0 } as const;

const priority = (...options: PriorityOption[]): PriorityDecision => ({
  ...base,
  kind: 'priority',
  options: [{ kind: 'pass' }, ...options, { kind: 'concede' }],
});
const castOpt = (o: ObjectView): PriorityOption => ({ kind: 'castSpell', object: o.id });
const landOpt = (o: ObjectView): PriorityOption => ({ kind: 'playLand', object: o.id });
const tapOpt = (o: ObjectView): PriorityOption => ({
  kind: 'activateAbility',
  source: o.id,
  abilityIndex: 0,
  color: null,
});

const spell = (cost: string[], spec: ObjSpec = {}) => obj({ types: ['sorcery'], cost, ...spec });

describe('handlers', () => {
  test('cover every decision kind', () => {
    const handlers = createCasualHandlers(view(), () => 0);
    expect(Object.keys(handlers).sort()).toEqual([...DECISION_KINDS].sort());
    for (const kind of DECISION_KINDS) expect(typeof handlers[kind]).toBe('function');
    const agent = new CasualAgent({ seed: 1 });
    expect(Object.keys(agent.decisionHandlers(view())).sort()).toEqual([...DECISION_KINDS].sort());
  });

  test('handlerOverrides replace a default and a throwing handler falls back and is recorded', async () => {
    const agent = new CasualAgent({
      seed: 1,
      handlerOverrides: {
        priority: () => {
          throw new Error('boom');
        },
      },
    });
    const v = view();
    const result = await agent.decide(v, priority(), CTX);
    expect(result).toEqual({ kind: 'pass' });
    expect(agent.fallbacks).toEqual([{ decisionKind: 'priority', message: 'boom' }]);
  });
});

describe('mulligan', () => {
  const mulligan = (hand: ObjectView[], bottomCount = 0, canMulligan = true): MulliganDecision => ({
    ...base,
    kind: 'mulligan',
    hand: hand.map((o) => o.id),
    bottomCount,
    canMulligan,
  });
  const handOf = (lands: number) => [
    ...Array.from({ length: lands }, () => land()),
    ...Array.from({ length: 7 - lands }, () => spell(['2'])),
  ];

  test('keeps a three-land hand', () => {
    const hand = handOf(3);
    expect(answer(view({ hand }), mulligan(hand))).toEqual({ kind: 'keepHand' });
  });

  test('keeps hands of 2 and 5 lands, mulligans 0, 1 and 6 lands', () => {
    for (const lands of [2, 5]) {
      const hand = handOf(lands);
      expect(answer(view({ hand }), mulligan(hand)).kind, `${lands} lands`).toBe('keepHand');
    }
    for (const lands of [0, 1, 6, 7]) {
      const hand = handOf(lands);
      expect(answer(view({ hand }), mulligan(hand)).kind, `${lands} lands`).toBe('takeMulligan');
    }
  });

  test('mulligans a zero-land hand', () => {
    const hand = handOf(0);
    expect(answer(view({ hand }), mulligan(hand))).toEqual({ kind: 'takeMulligan' });
  });

  test('keeps a bad hand when it may not mulligan or the kept size would drop below the minimum', () => {
    const hand = handOf(0);
    expect(answer(view({ hand }), mulligan(hand, 0, false))).toEqual({ kind: 'keepHand' });
    // Already two mulligans: another would keep 7 - 2 - 1 = 4 cards, below 5.
    expect(answer(view({ hand }), mulligan(hand, 2))).toEqual({ kind: 'keepHand' });
    expect(answer(view({ hand }), mulligan(hand, 1))).toEqual({ kind: 'takeMulligan' });
  });
});

describe('mulliganBottom and discard', () => {
  test('put back surplus lands first when holding more than four', () => {
    const lands = [land(), land(), land(), land(), land()];
    const spells = [spell(['5']), spell(['1'])];
    const hand = [...spells, ...lands];
    const d = { ...base, kind: 'mulliganBottom', count: 1, hand: hand.map((o) => o.id) } as const;
    const action = answer(view({ hand }), d);
    expect(action.kind).toBe('chooseCards');
    if (action.kind !== 'chooseCards') return;
    expect(action.objects).toHaveLength(1);
    expect(lands.map((l) => l.id)).toContain(action.objects[0]);
  });

  test('otherwise discard the highest mana value cards', () => {
    const hand = [land(), land(), spell(['1']), spell(['6']), spell(['4'])];
    const d = { ...base, kind: 'discard', count: 2, hand: hand.map((o) => o.id) } as const;
    const action = answer(view({ hand }), d);
    expect(action).toEqual({
      kind: 'chooseCards',
      objects: [hand[3]?.id, hand[4]?.id],
    });
  });
});

describe('priority', () => {
  test('plays a land before casting', () => {
    const l = land();
    const s = spell(['2']);
    const v = view({ hand: [s, l] });
    expect(answer(v, priority(castOpt(s), landOpt(l)))).toEqual({
      kind: 'playLand',
      object: l.id,
    });
  });

  test('casts the most expensive castable spell', () => {
    const cheap = spell(['1']);
    const mid = spell(['2', 'R']);
    const dear = spell(['4', 'R']);
    const v = view({ hand: [cheap, dear, mid] });
    expect(answer(v, priority(castOpt(cheap), castOpt(dear), castOpt(mid)))).toEqual({
      kind: 'castSpell',
      object: dear.id,
    });
  });

  test('casts the commander from the command zone when it is the best spell', () => {
    const cheap = spell(['1']);
    const commander = obj({ cost: ['3', 'W'], name: 'Commander' });
    const v = view({ hand: [cheap], command: [commander] });
    expect(answer(v, priority(castOpt(cheap), castOpt(commander)))).toEqual({
      kind: 'castSpell',
      object: commander.id,
    });
  });

  test('breaks mana value ties with its own PRNG, deterministically per seed', () => {
    const a = spell(['2']);
    const b = spell(['2']);
    const v = view({ hand: [a, b] });
    const d = priority(castOpt(a), castOpt(b));
    const picks = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      const first = answer(v, d, seed);
      expect(answer(v, d, seed)).toEqual(first);
      if (first.kind === 'castSpell') picks.add(first.object);
    }
    expect(picks.size).toBe(2);
  });

  test('passes with nothing castable, and never taps mana or concedes', () => {
    const l = land();
    const v = view({ battlefield: [l] });
    expect(answer(v, priority(tapOpt(l)))).toEqual({ kind: 'pass' });
    expect(answer(v, priority())).toEqual({ kind: 'pass' });
  });

  test('holds a removal instant without an opposing creature, casts it with one', () => {
    const murder = obj({
      types: ['instant'],
      cost: ['1', 'B', 'B'],
      text: 'Destroy target creature.',
    });
    const d = priority(castOpt(murder));
    expect(answer(view({ hand: [murder] }), d)).toEqual({ kind: 'pass' });
    // Only our own creature on the board: still no hostile target.
    const mine = creature(2, 2, { controller: 0 });
    expect(answer(view({ hand: [murder], battlefield: [mine] }), d)).toEqual({ kind: 'pass' });
    const theirs = creature(2, 2, { controller: 1 });
    expect(answer(view({ hand: [murder], battlefield: [theirs] }), d)).toEqual({
      kind: 'castSpell',
      object: murder.id,
    });
  });

  test('casts a counterspell only on top of the opponent’s spell', () => {
    const counter = obj({
      types: ['instant'],
      cost: ['U', 'U'],
      text: 'Counter target spell.',
    });
    const d = priority(castOpt(counter));
    const theirs = obj({ controller: 1, types: ['sorcery'] });
    const ours = obj({ controller: 0, types: ['sorcery'] });
    expect(answer(view({ hand: [counter] }), d)).toEqual({ kind: 'pass' });
    expect(answer(view({ hand: [counter], stack: [theirs, ours] }), d)).toEqual({ kind: 'pass' });
    expect(answer(view({ hand: [counter], stack: [ours, theirs] }), d)).toEqual({
      kind: 'castSpell',
      object: counter.id,
    });
  });

  test('casts burn that can go face without any target on the board', () => {
    const bolt = obj({
      types: ['instant'],
      cost: ['R'],
      text: 'Lightning Bolt deals 3 damage to any target.',
    });
    expect(answer(view({ hand: [bolt] }), priority(castOpt(bolt)))).toEqual({
      kind: 'castSpell',
      object: bolt.id,
    });
  });

  test('holds a sweeper unless the opponent has more creatures', () => {
    const wrath = obj({
      types: ['sorcery'],
      cost: ['2', 'W', 'W'],
      text: 'Destroy all creatures.',
    });
    const d = priority(castOpt(wrath));
    const mine = creature(2, 2, { controller: 0 });
    const t1 = creature(2, 2, { controller: 1 });
    const t2 = creature(2, 2, { controller: 1 });
    expect(answer(view({ hand: [wrath], battlefield: [mine, t1] }), d).kind).toBe('pass');
    expect(answer(view({ hand: [wrath], battlefield: [mine, t1, t2] }), d).kind).toBe('castSpell');
  });
});

describe('targets', () => {
  const targets = (legal: TargetsDecision['specs'][number]['legal']): TargetsDecision => ({
    ...base,
    kind: 'targets',
    source: 'o999',
    specs: [{ specId: 's', min: 1, max: 1, legal }],
  });

  test('prefers the opponent’s creature, then the opponent player, over its own things', () => {
    const mine = creature(5, 5, { controller: 0 });
    const theirs = creature(1, 1, { controller: 1 });
    const v = view({ battlefield: [mine, theirs] });
    const own = { kind: 'object', id: mine.id, specId: 's' } as const;
    const their = { kind: 'object', id: theirs.id, specId: 's' } as const;
    const me = { kind: 'player', seat: 0, specId: 's' } as const;
    const opp = { kind: 'player', seat: 1, specId: 's' } as const;
    expect(answer(v, targets([own, me, opp, their]))).toEqual({
      kind: 'chooseTargets',
      targets: [their],
    });
    expect(answer(v, targets([own, me, opp]))).toEqual({ kind: 'chooseTargets', targets: [opp] });
  });

  test('with no opposing option it takes the first legal target and moves on', () => {
    const mine = creature(5, 5, { controller: 0 });
    const own = { kind: 'object', id: mine.id, specId: 's' } as const;
    const me = { kind: 'player', seat: 0, specId: 's' } as const;
    expect(answer(view({ battlefield: [mine] }), targets([own, me]))).toEqual({
      kind: 'chooseTargets',
      targets: [own],
    });
  });
});

describe('payMana, commanderZone, assignDamage', () => {
  test('pays automatically and sends the commander to the command zone', () => {
    const pay = {
      ...base,
      kind: 'payMana',
      source: 'o1',
      totalCost: ['1'],
      manaSources: [],
    } as const;
    expect(answer(view(), pay)).toEqual({ kind: 'payAuto' });
    const zone = {
      ...base,
      kind: 'commanderZone',
      card: 'c1',
      object: 'o1',
      from: 'graveyard',
    } as const;
    expect(answer(view(), zone)).toEqual({ kind: 'moveToCommandZone' });
  });
});

describe('declareAttackers', () => {
  const player1 = { kind: 'player', seat: 1 } as const;
  const attackersOf = (...mine: ObjectView[]): DeclareAttackersDecision => ({
    ...base,
    kind: 'declareAttackers',
    candidates: mine.map((o) => ({ attacker: o.id, targets: [player1] })),
    mustAttack: [],
  });
  const attackIds = (action: Action) =>
    action.kind === 'declareAttackers' ? action.attacks.map((a) => a.attacker) : [];

  test('attacks into an empty board, at the opposing player', () => {
    const a = creature(2, 2);
    const d = attackersOf(a);
    const action = answer(view({ battlefield: [a] }), d);
    expect(action).toEqual({
      kind: 'declareAttackers',
      attacks: [{ attacker: a.id, target: player1 }],
    });
    expect(combatAnswerErrors(d, action)).toEqual([]);
  });

  test('does not attack into a bigger untapped blocker, but does when the blocker is tapped', () => {
    const a = creature(2, 2);
    const big = creature(4, 4, { controller: 1 });
    const d = attackersOf(a);
    expect(attackIds(answer(view({ battlefield: [a, big] }), d))).toEqual([]);
    const tapped = { ...big, tapped: true };
    expect(attackIds(answer(view({ battlefield: [a, tapped] }), d))).toEqual([a.id]);
  });

  test('attacks when its toughness exceeds every possible blocker’s power', () => {
    const a = creature(1, 5);
    const b = creature(5, 5, { controller: 1 });
    const small = creature(3, 3, { controller: 1 });
    expect(attackIds(answer(view({ battlefield: [a, small] }), attackersOf(a)))).toEqual([a.id]);
    expect(attackIds(answer(view({ battlefield: [a, small, b] }), attackersOf(a)))).toEqual([]);
  });

  test('a flier ignores blockers without flying or reach; a blocker with reach counts', () => {
    const flier = creature(2, 2, { keywords: ['flying'] });
    const ground = creature(5, 5, { controller: 1 });
    const reach = creature(5, 5, { controller: 1, keywords: ['reach'] });
    expect(attackIds(answer(view({ battlefield: [flier, ground] }), attackersOf(flier)))).toEqual([
      flier.id,
    ]);
    expect(
      attackIds(answer(view({ battlefield: [flier, ground, reach] }), attackersOf(flier))),
    ).toEqual([]);
  });

  test('attacks with everything when the attack is lethal', () => {
    const a = creature(2, 2);
    const b = creature(3, 3);
    const wall = creature(9, 9, { controller: 1 });
    const d = attackersOf(a, b);
    expect(
      attackIds(answer(view({ battlefield: [a, b, wall], opponentLife: 5 }), d)).sort(),
    ).toEqual([a.id, b.id].sort());
    expect(attackIds(answer(view({ battlefield: [a, b, wall], opponentLife: 6 }), d))).toEqual([]);
  });

  test('attacks a planeswalker only when it is the only target offered', () => {
    const a = creature(2, 2);
    const walker = obj({ types: ['planeswalker'], controller: 1, cost: ['3'] });
    const permanent = { kind: 'permanent', object: walker.id } as const;
    const both: DeclareAttackersDecision = {
      ...base,
      kind: 'declareAttackers',
      candidates: [{ attacker: a.id, targets: [permanent, player1] }],
      mustAttack: [],
    };
    const only: DeclareAttackersDecision = {
      ...base,
      kind: 'declareAttackers',
      candidates: [{ attacker: a.id, targets: [permanent] }],
      mustAttack: [],
    };
    const v = view({ battlefield: [a, walker] });
    expect(answer(v, both)).toEqual({
      kind: 'declareAttackers',
      attacks: [{ attacker: a.id, target: player1 }],
    });
    expect(answer(v, only)).toEqual({
      kind: 'declareAttackers',
      attacks: [{ attacker: a.id, target: permanent }],
    });
  });

  test('an empty attack is a valid answer', () => {
    expect(
      answer(view(), { ...base, kind: 'declareAttackers', candidates: [], mustAttack: [] }),
    ).toEqual({
      kind: 'declareAttackers',
      attacks: [],
    });
  });
});

describe('declareBlockers', () => {
  const me = { kind: 'player', seat: 0 } as const;
  function blockersDecision(
    attackers: { o: ObjectView; minBlockers?: number }[],
    blockers: { o: ObjectView; canBlock?: ObjectView[] }[],
  ): DeclareBlockersDecision {
    return {
      ...base,
      kind: 'declareBlockers',
      attackers: attackers.map((a) => ({
        attacker: a.o.id,
        target: me,
        minBlockers: a.minBlockers ?? 1,
      })),
      candidates: blockers.map((b) => ({
        blocker: b.o.id,
        canBlock: (b.canBlock ?? attackers.map((a) => a.o)).map((x) => x.id),
      })),
    };
  }
  const pairs = (action: Action) =>
    action.kind === 'declareBlockers' ? action.blocks.map((b) => [b.blocker, b.attacker]) : [];

  test('blocks with a blocker that survives and kills, preferring the cheaper one', () => {
    const atk = creature(2, 2, { controller: 1 });
    const cheap = creature(3, 3, { cost: ['2'] });
    const dear = creature(4, 4, { cost: ['5'] });
    const d = blockersDecision([{ o: atk }], [{ o: dear }, { o: cheap }]);
    const action = answer(view({ battlefield: [atk, cheap, dear] }), d);
    expect(pairs(action)).toEqual([[cheap.id, atk.id]]);
    expect(combatAnswerErrors(d, action)).toEqual([]);
  });

  test('does not make a bad block when life is not threatened', () => {
    const atk = creature(4, 4, { controller: 1 });
    const small = creature(1, 1);
    const d = blockersDecision([{ o: atk }], [{ o: small }]);
    expect(pairs(answer(view({ battlefield: [atk, small], life: 20 }), d))).toEqual([]);
  });

  test('chump-blocks only when the unblocked attackers would be lethal', () => {
    const atk = creature(4, 4, { controller: 1 });
    const chump = creature(1, 1);
    const d = blockersDecision([{ o: atk }], [{ o: chump }]);
    expect(pairs(answer(view({ battlefield: [atk, chump], life: 5 }), d))).toEqual([]);
    expect(pairs(answer(view({ battlefield: [atk, chump], life: 4 }), d))).toEqual([
      [chump.id, atk.id],
    ]);
  });

  test('trades an equal creature when hurt, and not a more expensive one when healthy', () => {
    const atk = creature(3, 3, { controller: 1, cost: ['3'] });
    const dear = creature(3, 3, { cost: ['5'] });
    const even = creature(3, 3, { cost: ['3'] });
    const d1 = blockersDecision([{ o: atk }], [{ o: dear }]);
    expect(pairs(answer(view({ battlefield: [atk, dear], life: 20 }), d1))).toEqual([]);
    expect(pairs(answer(view({ battlefield: [atk, dear], life: 10 }), d1))).toEqual([
      [dear.id, atk.id],
    ]);
    const d2 = blockersDecision([{ o: atk }], [{ o: even }]);
    expect(pairs(answer(view({ battlefield: [atk, even], life: 20 }), d2))).toEqual([
      [even.id, atk.id],
    ]);
  });

  test('uses each blocker once, biggest attacker first', () => {
    const big = creature(5, 5, { controller: 1 });
    const small = creature(1, 1, { controller: 1 });
    const wall = creature(1, 8);
    const d = blockersDecision([{ o: small }, { o: big }], [{ o: wall }]);
    const action = answer(view({ battlefield: [big, small, wall] }), d);
    expect(pairs(action)).toEqual([[wall.id, big.id]]);
    expect(combatAnswerErrors(d, action)).toEqual([]);
  });

  test('respects canBlock: no block of an attacker the creature cannot block', () => {
    const flier = creature(2, 2, { controller: 1, keywords: ['flying'] });
    const ground = creature(2, 2, { controller: 1 });
    const blocker = creature(5, 5);
    const d = blockersDecision([{ o: flier }, { o: ground }], [{ o: blocker, canBlock: [ground] }]);
    const action = answer(view({ battlefield: [flier, ground, blocker] }), d);
    expect(pairs(action)).toEqual([[blocker.id, ground.id]]);
    expect(combatAnswerErrors(d, action)).toEqual([]);
  });

  test('respects menace: never a single blocker, two when they kill it', () => {
    const atk = creature(2, 3, { controller: 1, keywords: ['menace'] });
    const b1 = creature(2, 4);
    const b2 = creature(2, 4);
    const d = blockersDecision([{ o: atk, minBlockers: 2 }], [{ o: b1 }, { o: b2 }]);
    const two = answer(view({ battlefield: [atk, b1, b2] }), d);
    expect(pairs(two)).toHaveLength(2);
    expect(combatAnswerErrors(d, two)).toEqual([]);
    // One potential blocker cannot satisfy menace: no block at all, even when lethal is coming.
    const dOne = blockersDecision([{ o: atk, minBlockers: 2 }], [{ o: b1 }]);
    const one = answer(view({ battlefield: [atk, b1], life: 1 }), dOne);
    expect(pairs(one)).toEqual([]);
    expect(combatAnswerErrors(dOne, one)).toEqual([]);
  });

  test('chump-blocks a menace attacker with two creatures when that is the only way to live', () => {
    const atk = creature(9, 9, { controller: 1, keywords: ['menace'] });
    const b1 = creature(1, 1);
    const b2 = creature(1, 1);
    const d = blockersDecision([{ o: atk, minBlockers: 2 }], [{ o: b1 }, { o: b2 }]);
    const action = answer(view({ battlefield: [atk, b1, b2], life: 5 }), d);
    expect(pairs(action)).toHaveLength(2);
    expect(combatAnswerErrors(d, action)).toEqual([]);
  });
});

describe('assignDamage', () => {
  test('uses the engine’s default division', () => {
    const d = {
      ...base,
      kind: 'assignDamage',
      step: 'regular',
      choices: [
        {
          source: 'o1',
          power: 3,
          deathtouch: false,
          trample: false,
          blockers: [{ object: 'o2', lethal: 2 }],
          tramplesOver: null,
        },
      ],
    } as const;
    const action = answer(view(), d);
    expect(combatAnswerErrors(d, action)).toEqual([]);
    expect(action.kind).toBe('assignDamage');
  });
});
