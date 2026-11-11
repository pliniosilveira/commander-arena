// Unit tests for RandomLegalAgent: legality over every decision kind, handler exhaustiveness,
// reproducibility, the no-concede and no-cancel rules, and the fallback counter.
import {
  type Action,
  DECISION_KINDS,
  type DecisionHandlers,
  type DecisionKind,
  type GameView,
  legalActionsForDecision,
  type PendingDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { RandomLegalAgent } from '../src/index';
import { CTX, combatAnswerErrors } from './helpers';

// Only the agent reads the view, and the random agent ignores it; a decision handed in directly is
// enough for unit tests. The runner tests use real views.
const NO_VIEW = null as unknown as GameView;

const same = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);
const COMBAT_KINDS = ['declareAttackers', 'declareBlockers', 'assignDamage'] as const;
const isCombat = (decision: PendingDecision) =>
  (COMBAT_KINDS as readonly string[]).includes(decision.kind);

/**
 * The engine lists only some of the legal answers to a combat decision (any subset of attackers is
 * legal), so those kinds are checked against the rules in `combatAnswerErrors`; the other kinds
 * must be one of the listed actions.
 */
const isLegal = (decision: PendingDecision, action: Action) =>
  isCombat(decision)
    ? combatAnswerErrors(decision, action).length === 0
    : legalActionsForDecision(decision).some(
        (legal) => same(legal, action) || sameCards(legal, action),
      );

/**
 * The engine lists the cards of a chooseCards answer in the decision's order but accepts them in
 * any order (the order picks the destination of a search), so two answers with the same cards match.
 */
const sameCards = (a: Action, b: Action) =>
  a.kind === 'chooseCards' &&
  b.kind === 'chooseCards' &&
  a.objects.length === b.objects.length &&
  a.objects.every((id) => b.objects.includes(id));

const PLAYER_1 = { kind: 'player', seat: 1 } as const;
const WALKER = { kind: 'permanent', object: 'o20' } as const;

/** One hand-built decision of every kind, with enough options that a choice is real. */
const CRAFTED: { [K in DecisionKind]: Extract<PendingDecision, { kind: K }> } = {
  priority: {
    kind: 'priority',
    id: 'd1',
    seat: 0,
    options: [
      { kind: 'pass' },
      { kind: 'playLand', object: 'o1' },
      { kind: 'castSpell', object: 'o2' },
      { kind: 'activateAbility', source: 'o3', abilityIndex: 0, color: null },
      { kind: 'activateAbility', source: 'o4', abilityIndex: 1, color: 'G' },
      { kind: 'concede' },
    ],
  },
  mulligan: {
    kind: 'mulligan',
    id: 'd2',
    seat: 0,
    hand: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'],
    bottomCount: 0,
    canMulligan: true,
  },
  mulliganBottom: {
    kind: 'mulliganBottom',
    id: 'd3',
    seat: 1,
    count: 2,
    hand: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'],
  },
  targets: {
    kind: 'targets',
    id: 'd4',
    seat: 0,
    source: 'o9',
    specs: [
      {
        specId: 't1',
        min: 1,
        max: 1,
        legal: [
          { kind: 'player', seat: 1, specId: 't1' },
          { kind: 'object', id: 'o5', specId: 't1' },
          { kind: 'object', id: 'o6', specId: 't1' },
        ],
      },
    ],
  },
  payMana: {
    kind: 'payMana',
    id: 'd5',
    seat: 0,
    source: 'o9',
    totalCost: ['1', 'R'],
    manaSources: [
      { object: 'o1', abilityIndex: 0 },
      { object: 'o2', abilityIndex: 0 },
    ],
  },
  discard: {
    kind: 'discard',
    id: 'd6',
    seat: 1,
    count: 2,
    hand: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8'],
  },
  commanderZone: {
    kind: 'commanderZone',
    id: 'd7',
    seat: 0,
    card: 'c3',
    object: 'o3',
    from: 'graveyard',
  },
  // Three creatures may attack, two of them a player or a planeswalker.
  declareAttackers: {
    kind: 'declareAttackers',
    id: 'd8',
    seat: 0,
    candidates: [
      { attacker: 'o10', targets: [PLAYER_1, WALKER] },
      { attacker: 'o11', targets: [PLAYER_1, WALKER] },
      { attacker: 'o12', targets: [PLAYER_1] },
    ],
    mustAttack: [],
  },
  // o10 is an ordinary attacker, o11 has menace (two blockers needed). o30 and o31 can block
  // either, o32 only the menace creature.
  declareBlockers: {
    kind: 'declareBlockers',
    id: 'd9',
    seat: 1,
    attackers: [
      { attacker: 'o10', target: PLAYER_1, minBlockers: 1 },
      { attacker: 'o11', target: PLAYER_1, minBlockers: 2 },
    ],
    candidates: [
      { blocker: 'o30', canBlock: ['o10', 'o11'] },
      { blocker: 'o31', canBlock: ['o10', 'o11'] },
      { blocker: 'o32', canBlock: ['o11'] },
    ],
  },
  // o10 (power 5) is double blocked; o11 (power 4) has trample and deathtouch, so 1 is lethal.
  assignDamage: {
    kind: 'assignDamage',
    id: 'd10',
    seat: 0,
    step: 'regular',
    choices: [
      {
        source: 'o10',
        power: 5,
        deathtouch: false,
        trample: false,
        blockers: [
          { object: 'o30', lethal: 2 },
          { object: 'o31', lethal: 3 },
        ],
        tramplesOver: null,
      },
      {
        source: 'o11',
        power: 4,
        deathtouch: true,
        trample: true,
        blockers: [{ object: 'o32', lethal: 1 }],
        tramplesOver: PLAYER_1,
      },
    ],
  },
  // Sacrifice one of four permanents.
  choosePermanent: {
    kind: 'choosePermanent',
    id: 'd11',
    seat: 0,
    source: 'o40',
    purpose: 'sacrifice',
    min: 1,
    max: 1,
    legal: ['o1', 'o2', 'o3', 'o4'],
  },
  // A search for up to two of four cards: it may find none, one or two, in either order.
  chooseCards: {
    kind: 'chooseCards',
    id: 'd14',
    seat: 0,
    source: 'o40',
    purpose: 'search',
    zone: 'library',
    legal: ['o1', 'o2', 'o3', 'o4'],
    min: 0,
    max: 2,
    reveal: false,
    prompt:
      'Choose up to two basic land cards; the first goes onto the battlefield tapped, the second into your hand.',
  },
  // A scry 3: every card goes to the top or the bottom, in any order (CR 701.22a).
  arrangeCards: {
    kind: 'arrangeCards',
    id: 'd15',
    seat: 0,
    source: 'o40',
    purpose: 'scry',
    cards: ['o1', 'o2', 'o3'],
    piles: ['top', 'bottom'],
  },
  // Three different triggers of one player wait to be ordered.
  orderTriggers: {
    kind: 'orderTriggers',
    id: 'd12',
    seat: 0,
    triggers: [
      { source: 'o1', sourceName: 'A', sourceOracleText: '', abilityIndex: 0, count: 1 },
      { source: 'o2', sourceName: 'B', sourceOracleText: '', abilityIndex: 0, count: 2 },
      { source: 'o3', sourceName: 'C', sourceOracleText: '', abilityIndex: 1, count: 1 },
    ],
  },
  confirmOptional: {
    kind: 'confirmOptional',
    id: 'd13',
    seat: 0,
    source: 'o41',
    sourceName: 'A',
    sourceOracleText: 'When this creature enters, you may draw a card.',
  },
  chooseOption: {
    kind: 'chooseOption',
    id: 'd14',
    seat: 1,
    purpose: 'creatureType',
    options: ['Advisor', 'Elf', 'Goblin', 'Time Lord', 'Zombie'],
    source: 'o42',
    sourceName: 'B',
    sourceOracleText: 'As this creature enters, choose a creature type.',
  },
  chooseX: {
    kind: 'chooseX',
    id: 'd15',
    seat: 0,
    source: 'o43',
    sourceName: 'C',
    sourceOracleText: 'Deals X damage to any target.',
    purpose: 'spell',
    min: 0,
    max: 5,
    perX: { mana: 1, life: 0 },
  },
  chooseModes: {
    kind: 'chooseModes',
    id: 'd16',
    seat: 0,
    source: 'o44',
    sourceName: 'D',
    sourceOracleText: 'Choose one or more — • Draw a card. • You gain 2 life. • Scry 1.',
    purpose: 'spell',
    modes: [
      { index: 0, text: 'Draw a card.', legal: true },
      { index: 1, text: 'You gain 2 life.', legal: true },
      { index: 2, text: 'Scry 1.', legal: true },
    ],
    min: 1,
    max: 3,
    sets: [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]],
  },
  // Convoke (D-120): three creatures, two of them green; the engine names the sets that leave a payable cost.
  choosePayOptions: {
    kind: 'choosePayOptions',
    id: 'd17',
    seat: 0,
    source: 'o45',
    mechanism: 'convoke',
    cost: ['3', 'G'],
    candidates: ['o50', 'o51', 'o52'],
    colors: { o50: ['G'], o51: ['G'], o52: ['W'] },
    maxUsable: 3,
    suggested: ['o50', 'o52'],
    choices: [
      ['o50', 'o52'],
      ['o50', 'o51', 'o52'],
    ],
  },
};

describe('handler map', () => {
  test('covers exactly the engine decision kinds (compile time and run time)', () => {
    type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
    const compileTimeCheck: Same<keyof DecisionHandlers<Action>, DecisionKind> = true;
    expect(compileTimeCheck).toBe(true);

    const agent = new RandomLegalAgent({ seed: 1 });
    expect(Object.keys(agent.decisionHandlers).sort()).toEqual([...DECISION_KINDS].sort());
    for (const handler of Object.values(agent.decisionHandlers)) {
      expect(typeof handler).toBe('function');
    }
    expect(Object.keys(CRAFTED).sort()).toEqual([...DECISION_KINDS].sort());
  });

  test('a handler record missing a decision kind does not compile', () => {
    // @ts-expect-error every DecisionKind needs a handler: this record lacks all but one
    const incomplete: DecisionHandlers<Action> = { priority: () => ({ kind: 'pass' }) };
    expect(Object.keys(incomplete)).toEqual(['priority']);
  });
});

describe('legal choices', () => {
  for (const kind of DECISION_KINDS) {
    test(`only legal actions for a ${kind} decision`, async () => {
      const decision = CRAFTED[kind];
      const seen = new Set<string>();
      for (let seed = 0; seed < 200; seed += 1) {
        const agent = new RandomLegalAgent({ seed });
        const action = await agent.decide(NO_VIEW, decision, CTX);
        expect(isLegal(decision, action), JSON.stringify(action)).toBe(true);
        expect(agent.fallbacks).toHaveLength(0);
        seen.add(JSON.stringify(action));
      }
      // Several seeds reach more than one answer wherever the decision leaves a real choice.
      if (kind === 'payMana') expect([...seen]).toEqual(['{"kind":"payAuto"}']);
      // The random agent always divides damage the engine's default way (lethal to each blocker
      // in order, the rest onward), so that answer is a single one; see 'combat decisions'.
      else if (kind === 'assignDamage') expect(seen.size).toBe(1);
      else expect(seen.size).toBeGreaterThan(1);
    });
  }

  test('a choice among many seeds covers every real option of a priority decision', async () => {
    const decision = CRAFTED.priority;
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed += 1) {
      const action = await new RandomLegalAgent({ seed }).decide(NO_VIEW, decision, CTX);
      seen.add(JSON.stringify(action));
    }
    // Every option except concede.
    expect(seen.size).toBe(decision.options.length - 1);
  });

  test('chooseCards answers have the exact count, distinct cards from the hand', async () => {
    for (const kind of ['mulliganBottom', 'discard'] as const) {
      const decision = CRAFTED[kind];
      for (let seed = 0; seed < 100; seed += 1) {
        const action = await new RandomLegalAgent({ seed }).decide(NO_VIEW, decision, CTX);
        if (action.kind !== 'chooseCards')
          throw new Error(`expected chooseCards, got ${action.kind}`);
        expect(action.objects).toHaveLength(decision.count);
        expect(new Set(action.objects).size).toBe(decision.count);
        for (const id of action.objects) expect(decision.hand).toContain(id);
      }
    }
  });
});

describe('concede and cancel', () => {
  test('never concedes or cancels while another action exists', async () => {
    for (const kind of DECISION_KINDS) {
      const decision = CRAFTED[kind];
      for (let seed = 0; seed < 200; seed += 1) {
        const action = await new RandomLegalAgent({ seed }).decide(NO_VIEW, decision, CTX);
        expect(action.kind, `${kind} seed ${seed}`).not.toBe('concede');
        expect(action.kind, `${kind} seed ${seed}`).not.toBe('cancel');
      }
    }
  });

  test('concedes when concede is the only legal action', async () => {
    const decision: PendingDecision = {
      kind: 'priority',
      id: 'd1',
      seat: 0,
      options: [{ kind: 'concede' }],
    };
    const action = await new RandomLegalAgent({ seed: 3 }).decide(NO_VIEW, decision, CTX);
    expect(action).toEqual({ kind: 'concede' });
  });

  test('cancels, not concedes, when cancel is the only way to back out of a cast', async () => {
    const decision: PendingDecision = {
      kind: 'targets',
      id: 'd4',
      seat: 0,
      source: 'o9',
      specs: [{ specId: 't1', min: 1, max: 1, legal: [] }],
    };
    expect(legalActionsForDecision(decision).map((a) => a.kind)).toEqual(['cancel', 'concede']);
    for (let seed = 0; seed < 20; seed += 1) {
      const action = await new RandomLegalAgent({ seed }).decide(NO_VIEW, decision, CTX);
      expect(action).toEqual({ kind: 'cancel' });
    }
  });
});

describe('combat decisions', () => {
  const answer = (decision: PendingDecision, seed: number) =>
    new RandomLegalAgent({ seed }).decide(NO_VIEW, decision, CTX);

  test('attack answers use listed candidates and targets, each creature once', async () => {
    const decision = CRAFTED.declareAttackers;
    const sizes = new Set<number>();
    const targets = new Set<string>();
    for (let seed = 0; seed < 400; seed += 1) {
      const action = await answer(decision, seed);
      if (action.kind !== 'declareAttackers') throw new Error(`got ${action.kind}`);
      expect(combatAnswerErrors(decision, action), `seed ${seed}`).toEqual([]);
      sizes.add(action.attacks.length);
      for (const a of action.attacks) targets.add(JSON.stringify(a.target));
    }
    // Nothing, some and all of the creatures attack; both a player and a planeswalker are chosen.
    expect([...sizes].sort()).toEqual([0, 1, 2, 3]);
    expect(targets).toEqual(new Set([JSON.stringify(PLAYER_1), JSON.stringify(WALKER)]));
  });

  test('a creature with menace is blocked by two or more creatures or not at all', async () => {
    const decision = CRAFTED.declareBlockers;
    const menaceBlockers = new Set<number>();
    const plainBlockers = new Set<number>();
    for (let seed = 0; seed < 600; seed += 1) {
      const action = await answer(decision, seed);
      if (action.kind !== 'declareBlockers') throw new Error(`got ${action.kind}`);
      expect(combatAnswerErrors(decision, action), `seed ${seed}`).toEqual([]);
      const on = (attacker: string) => action.blocks.filter((b) => b.attacker === attacker).length;
      expect(on('o11'), `seed ${seed}: menace attacker blocked once`).not.toBe(1);
      menaceBlockers.add(on('o11'));
      plainBlockers.add(on('o10'));
    }
    // The menace creature is sometimes unblocked, sometimes double and triple blocked.
    expect([...menaceBlockers].sort()).toEqual([0, 2, 3]);
    expect([...plainBlockers].sort()).toEqual([0, 1, 2]);
  });

  test('blockers are one creature per attacker, never an ineligible one', async () => {
    const decision = CRAFTED.declareBlockers;
    for (let seed = 0; seed < 300; seed += 1) {
      const action = await answer(decision, seed);
      if (action.kind !== 'declareBlockers') throw new Error(`got ${action.kind}`);
      const blockers = action.blocks.map((b) => b.blocker);
      expect(new Set(blockers).size).toBe(blockers.length);
      for (const b of action.blocks) {
        const candidate = decision.candidates.find((c) => c.blocker === b.blocker);
        expect(candidate?.canBlock).toContain(b.attacker);
      }
    }
  });

  test('damage answers total the power and go only to blockers or, with trample, onward', async () => {
    const decision = CRAFTED.assignDamage;
    for (let seed = 0; seed < 50; seed += 1) {
      const action = await answer(decision, seed);
      if (action.kind !== 'assignDamage') throw new Error(`got ${action.kind}`);
      expect(combatAnswerErrors(decision, action)).toEqual([]);
      // Double block: lethal to the first, the rest to the last. Deathtouch trample: 1 is lethal.
      expect(action.assignments).toEqual([
        { source: 'o10', to: { kind: 'object', id: 'o30' }, amount: 2 },
        { source: 'o10', to: { kind: 'object', id: 'o31' }, amount: 3 },
        { source: 'o11', to: { kind: 'object', id: 'o32' }, amount: 1 },
        { source: 'o11', to: PLAYER_1, amount: 3 },
      ]);
    }
  });

  test('trample goes onward only after every blocker has lethal damage', async () => {
    const choice = (power: number, lethals: number[], trample: boolean) => ({
      source: 'o1' as const,
      power,
      deathtouch: false,
      trample,
      blockers: lethals.map((lethal, i) => ({ object: `o${100 + i}` as const, lethal })),
      tramplesOver: trample ? PLAYER_1 : null,
    });
    const cases: [string, ReturnType<typeof choice>][] = [
      ['power below lethal, trample', choice(3, [4], true)],
      ['power exactly lethal, trample', choice(4, [4], true)],
      ['power covers one of two blockers, trample', choice(5, [3, 3], true)],
      ['power covers both blockers, trample', choice(8, [3, 3], true)],
      ['no trample, three blockers', choice(7, [2, 2, 2], false)],
      ['no trample, power below lethal', choice(1, [3, 3], false)],
    ];
    for (const [name, c] of cases) {
      const decision: PendingDecision = {
        kind: 'assignDamage',
        id: 'd10',
        seat: 0,
        step: 'firstStrike',
        choices: [c],
      };
      const action = await answer(decision, 1);
      if (action.kind !== 'assignDamage') throw new Error(`got ${action.kind}`);
      expect(combatAnswerErrors(decision, action), name).toEqual([]);
      const toPlayer = action.assignments
        .filter((a) => a.to.kind === 'player')
        .reduce((sum, a) => sum + a.amount, 0);
      const lethalTotal = c.blockers.reduce((sum, b) => sum + b.lethal, 0);
      expect(toPlayer, name).toBe(c.trample ? Math.max(0, c.power - lethalTotal) : 0);
    }
  });

  test('everything the engine lists for a combat decision passes the independent check', () => {
    for (const kind of COMBAT_KINDS) {
      const decision = CRAFTED[kind];
      const listed = legalActionsForDecision(decision).filter((a) => a.kind !== 'concede');
      expect(listed.length, kind).toBeGreaterThan(0);
      for (const action of listed) {
        expect(combatAnswerErrors(decision, action), `${kind}: ${JSON.stringify(action)}`).toEqual(
          [],
        );
      }
    }
  });

  test('the independent check does reject bad answers', () => {
    const attack = { kind: 'declareAttackers', attacks: [{ attacker: 'o99', target: PLAYER_1 }] };
    expect(combatAnswerErrors(CRAFTED.declareAttackers, attack as Action)).not.toEqual([]);
    const single = { kind: 'declareBlockers', blocks: [{ blocker: 'o30', attacker: 'o11' }] };
    expect(combatAnswerErrors(CRAFTED.declareBlockers, single as Action)).not.toEqual([]);
    const toPlayer = {
      kind: 'assignDamage',
      assignments: [
        { source: 'o10', to: PLAYER_1, amount: 5 },
        { source: 'o11', to: { kind: 'object', id: 'o32' }, amount: 4 },
      ],
    };
    expect(combatAnswerErrors(CRAFTED.assignDamage, toPlayer as Action)).not.toEqual([]);
    const early = {
      kind: 'assignDamage',
      assignments: [
        { source: 'o10', to: { kind: 'object', id: 'o30' }, amount: 5 },
        { source: 'o11', to: PLAYER_1, amount: 4 },
      ],
    };
    expect(combatAnswerErrors(CRAFTED.assignDamage, early as Action)).not.toEqual([]);
  });

  test('empty candidate lists give an empty, legal answer, not a concession', async () => {
    const noAttackers: PendingDecision = { ...CRAFTED.declareAttackers, candidates: [] };
    const noBlockers: PendingDecision = { ...CRAFTED.declareBlockers, candidates: [] };
    for (let seed = 0; seed < 20; seed += 1) {
      expect(await answer(noAttackers, seed)).toEqual({ kind: 'declareAttackers', attacks: [] });
      expect(await answer(noBlockers, seed)).toEqual({ kind: 'declareBlockers', blocks: [] });
    }
  });

  test('never concedes or cancels a combat decision', async () => {
    for (const kind of COMBAT_KINDS) {
      for (let seed = 0; seed < 300; seed += 1) {
        const action = await answer(CRAFTED[kind], seed);
        expect(action.kind, `${kind} seed ${seed}`).toBe(kind);
      }
    }
  });

  test('the same seed gives the same combat answers, another seed other ones', async () => {
    const run = async (seed: number) => {
      const agent = new RandomLegalAgent({ seed });
      const out: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        for (const kind of COMBAT_KINDS) {
          out.push(JSON.stringify(await agent.decide(NO_VIEW, CRAFTED[kind], CTX)));
        }
      }
      return out;
    };
    expect(await run(5)).toEqual(await run(5));
    expect(await run(5)).not.toEqual(await run(6));
  });

  test('a failing combat handler falls back to a legal answer that is not a concession', async () => {
    const boom = () => {
      throw new Error('handler exploded');
    };
    const agent = new RandomLegalAgent({
      seed: 1,
      handlerOverrides: { declareAttackers: boom, declareBlockers: boom, assignDamage: boom },
    });
    for (const kind of COMBAT_KINDS) {
      const action = await agent.decide(NO_VIEW, CRAFTED[kind], CTX);
      expect(action.kind).toBe(kind);
      expect(isLegal(CRAFTED[kind], action), kind).toBe(true);
    }
    expect(agent.fallbacks.map((f) => f.decisionKind)).toEqual([...COMBAT_KINDS]);
  });
});

describe('mulligans', () => {
  const mulligan = (bottomCount: number, canMulligan: boolean): PendingDecision => ({
    kind: 'mulligan',
    id: 'd2',
    seat: 0,
    hand: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'],
    bottomCount,
    canMulligan,
  });

  async function answers(decision: PendingDecision): Promise<Set<string>> {
    const out = new Set<string>();
    for (let seed = 0; seed < 300; seed += 1) {
      out.add((await new RandomLegalAgent({ seed }).decide(NO_VIEW, decision, CTX)).kind);
    }
    return out;
  }

  test('keeps most hands but does take a mulligan sometimes', async () => {
    const kinds = new Map<string, number>();
    for (let seed = 0; seed < 1000; seed += 1) {
      const action = await new RandomLegalAgent({ seed }).decide(NO_VIEW, mulligan(0, true), CTX);
      kinds.set(action.kind, (kinds.get(action.kind) ?? 0) + 1);
    }
    const kept = kinds.get('keepHand') ?? 0;
    const took = kinds.get('takeMulligan') ?? 0;
    expect(kept + took).toBe(1000);
    expect(kept).toBeGreaterThan(took);
    expect(took).toBeGreaterThan(0);
  });

  test('never mulligans below a 5 card keep', async () => {
    // bottomCount 1 means keeping now leaves 6; one more mulligan would leave 5, which is allowed.
    expect(await answers(mulligan(1, true))).toEqual(new Set(['keepHand', 'takeMulligan']));
    // bottomCount 2 means keeping now leaves 5; another mulligan would go below 5.
    expect(await answers(mulligan(2, true))).toEqual(new Set(['keepHand']));
    expect(await answers(mulligan(6, true))).toEqual(new Set(['keepHand']));
  });

  test('keeps when the engine no longer allows a mulligan', async () => {
    expect(await answers(mulligan(0, false))).toEqual(new Set(['keepHand']));
  });
});

describe('reproducibility', () => {
  async function sequence(seed: number): Promise<string[]> {
    const agent = new RandomLegalAgent({ seed });
    const out: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      for (const kind of DECISION_KINDS) {
        out.push(JSON.stringify(await agent.decide(NO_VIEW, CRAFTED[kind], CTX)));
      }
    }
    return out;
  }

  test('the same seed gives the same answers', async () => {
    expect(await sequence(42)).toEqual(await sequence(42));
  });

  test('a different seed gives different answers', async () => {
    expect(await sequence(42)).not.toEqual(await sequence(43));
  });
});

describe('fallbacks', () => {
  const boom = () => {
    throw new Error('handler exploded');
  };

  test('a throwing handler falls back to the first safe legal action and is recorded', async () => {
    const agent = new RandomLegalAgent({ seed: 1, handlerOverrides: { priority: boom } });
    const decision = CRAFTED.priority;
    const action = await agent.decide(NO_VIEW, decision, CTX);
    expect(action).toEqual({ kind: 'pass' }); // first option, and not concede
    expect(agent.fallbacks).toEqual([{ decisionKind: 'priority', message: 'handler exploded' }]);
  });

  test('the fallback never concedes or cancels while another action exists', async () => {
    const agent = new RandomLegalAgent({
      seed: 1,
      handlerOverrides: { targets: boom, payMana: boom, mulligan: boom, commanderZone: boom },
    });
    for (const kind of ['targets', 'payMana', 'mulligan', 'commanderZone'] as const) {
      const action = await agent.decide(NO_VIEW, CRAFTED[kind], CTX);
      expect(isLegal(CRAFTED[kind], action)).toBe(true);
      expect(['concede', 'cancel']).not.toContain(action.kind);
    }
    expect(agent.fallbacks.map((f) => f.decisionKind)).toEqual([
      'targets',
      'payMana',
      'mulligan',
      'commanderZone',
    ]);
  });

  test('only failing kinds count, working handlers do not', async () => {
    const agent = new RandomLegalAgent({ seed: 1, handlerOverrides: { discard: boom } });
    await agent.decide(NO_VIEW, CRAFTED.priority, CTX);
    await agent.decide(NO_VIEW, CRAFTED.mulligan, CTX);
    expect(agent.fallbacks).toHaveLength(0);
    await agent.decide(NO_VIEW, CRAFTED.discard, CTX);
    await agent.decide(NO_VIEW, CRAFTED.discard, CTX);
    expect(agent.fallbacks).toHaveLength(2);
  });

  test('a non-Error throw is recorded as text and decide still resolves', async () => {
    const agent = new RandomLegalAgent({
      seed: 1,
      handlerOverrides: {
        commanderZone: () => {
          throw 'plain string';
        },
      },
    });
    await expect(agent.decide(NO_VIEW, CRAFTED.commanderZone, CTX)).resolves.toEqual({
      kind: 'moveToCommandZone',
    });
    expect(agent.fallbacks[0]?.message).toBe('plain string');
  });

  test('a malformed decision that makes a handler throw still returns an action', async () => {
    // mulliganBottom asks for more cards than the hand holds: the default handler throws.
    const decision: PendingDecision = {
      kind: 'mulliganBottom',
      id: 'd3',
      seat: 0,
      count: 3,
      hand: ['o1'],
    };
    const agent = new RandomLegalAgent({ seed: 1 });
    const action = await agent.decide(NO_VIEW, decision, CTX);
    expect(action).toEqual({ kind: 'concede' }); // nothing else is legal, so conceding is safe
    expect(agent.fallbacks).toHaveLength(1);
  });
});
