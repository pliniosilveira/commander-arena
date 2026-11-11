/**
 * RandomLegalAgent (SPEC 9): picks uniformly among the legal actions of each decision, using its
 * own seeded PRNG, a stream separate from the game's. It exists to test the engine and to be the
 * weakest opponent. It never throws: a failing handler falls back to the first safe legal action
 * and the fallback is recorded.
 */
import {
  type Action,
  createRng,
  type DecisionHandlers,
  defaultDivision,
  type GameView,
  handleDecision,
  nextInt,
  type PendingDecision,
  type RngState,
} from '@commander-arena/engine';
import type { Agent, DecideContext, FallbackRecord } from './agent';
import { firstSafeAction, preferredActions, withinAttackBudget, withinBlockBudget } from './legal';

/** CR 103.5 (London mulligan): a random agent never keeps fewer than this many cards. */
export const MIN_KEEP_SIZE = 5;

/** Probability, out of 100, that the agent keeps a hand it may still mulligan. */
const KEEP_PERCENT = 80;

export interface RandomLegalAgentOptions {
  readonly seed: number;
  readonly name?: string;
  /**
   * Test seam: handlers that replace the defaults for the listed decision kinds. The merged map is
   * still a full `DecisionHandlers`, so a kind can never be left without a handler.
   */
  readonly handlerOverrides?: Partial<DecisionHandlers<Action>>;
}

export class RandomLegalAgent implements Agent {
  readonly name: string;
  private rng: RngState;
  private readonly handlers: DecisionHandlers<Action>;
  private readonly fallbackList: FallbackRecord[] = [];

  constructor(options: RandomLegalAgentOptions) {
    this.name = options.name ?? `random-legal#${options.seed}`;
    this.rng = createRng(options.seed);
    this.handlers = {
      ...createRandomHandlers((n) => this.draw(n)),
      ...options.handlerOverrides,
    };
  }

  get fallbacks(): readonly FallbackRecord[] {
    return this.fallbackList;
  }

  /** The handler record, exposed so tests can check it covers every decision kind. */
  get decisionHandlers(): DecisionHandlers<Action> {
    return this.handlers;
  }

  private draw(maxExclusive: number): number {
    const [value, next] = nextInt(this.rng, maxExclusive);
    this.rng = next;
    return value;
  }

  decide(_view: GameView, decision: PendingDecision, _ctx: DecideContext): Promise<Action> {
    try {
      return Promise.resolve(handleDecision(decision, this.handlers));
    } catch (error) {
      this.fallbackList.push({
        decisionKind: decision.kind,
        message: error instanceof Error ? error.message : String(error),
      });
      return Promise.resolve(firstSafeAction(decision));
    }
  }
}

/** Uniform pick from a non-empty list using `draw(n)` for a number in [0, n). */
function pick<T>(items: readonly T[], draw: (n: number) => number): T {
  const item = items[draw(items.length)];
  if (item === undefined) throw new Error('no legal action to choose from');
  return item;
}

/**
 * `count` distinct cards from `hand`, uniformly (a partial Fisher-Yates shuffle), listed in hand
 * order so the answer has the same form as the engine's own `chooseCards` options.
 */
function pickCards<T>(hand: readonly T[], count: number, draw: (n: number) => number): T[] {
  if (count > hand.length) throw new Error('not enough cards to choose from');
  const pool = hand.map((card, index) => ({ card, index }));
  const chosen: { card: T; index: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const [entry] = pool.splice(draw(pool.length), 1);
    if (entry === undefined) throw new Error('not enough cards to choose from');
    chosen.push(entry);
  }
  return chosen.sort((a, b) => a.index - b.index).map((entry) => entry.card);
}

/**
 * `count` distinct cards from `cards`, uniformly, in the order they were drawn. The order is the
 * answer: a search puts the first card found at its first destination.
 */
function pickInOrder<T>(cards: readonly T[], count: number, draw: (n: number) => number): T[] {
  if (count > cards.length) throw new Error('not enough cards to choose from');
  const pool = [...cards];
  const chosen: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const [card] = pool.splice(draw(pool.length), 1);
    if (card === undefined) throw new Error('not enough cards to choose from');
    chosen.push(card);
  }
  return chosen;
}

/** A uniformly random order of 0..n-1 (Fisher-Yates), using `draw(n)` for a number in [0, n). */
function shuffled(n: number, draw: (n: number) => number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = draw(i + 1);
    const a = order[i] as number;
    order[i] = order[j] as number;
    order[j] = a;
  }
  return order;
}

/** The default handler per decision kind. The record type makes a missing kind a compile error. */
export function createRandomHandlers(draw: (n: number) => number): DecisionHandlers<Action> {
  return {
    priority: (d) => pick(preferredActions(d), draw),
    mulligan: (d) => {
      // Taking one more mulligan keeps one card fewer (CR 103.5, London mulligan).
      const keepsAfterMulligan = d.hand.length - d.bottomCount - 1;
      const mayMulligan = d.canMulligan && keepsAfterMulligan >= MIN_KEEP_SIZE;
      if (!mayMulligan || draw(100) < KEEP_PERCENT) return { kind: 'keepHand' };
      return { kind: 'takeMulligan' };
    },
    mulliganBottom: (d) => ({ kind: 'chooseCards', objects: pickCards(d.hand, d.count, draw) }),
    targets: (d) => pick(preferredActions(d), draw),
    payMana: (d) => {
      const legal = preferredActions(d);
      return legal.find((a) => a.kind === 'payAuto') ?? pick(legal, draw);
    },
    discard: (d) => ({ kind: 'chooseCards', objects: pickCards(d.hand, d.count, draw) }),
    commanderZone: (d) => pick(preferredActions(d), draw),
    declareAttackers: (d) => {
      // Each creature independently attacks with probability 50%, at a random legal target. A
      // creature that attacks each combat if able (CR 508.1d) attacks anyway, at its first target;
      // the draws are the same, so a game without one is unchanged.
      const attacks = d.candidates.flatMap((c) => {
        const chosen = draw(2) === 0;
        if (chosen) return [{ attacker: c.attacker, target: pick(c.targets, draw) }];
        const first = c.targets[0];
        return d.mustAttack.includes(c.attacker) && first !== undefined
          ? [{ attacker: c.attacker, target: first }]
          : [];
      });
      // CR 508.1h (D-125): attacking a taxed target costs mana: only what can be paid for.
      return { kind: 'declareAttackers', attacks: withinAttackBudget(d, attacks) };
    },
    declareBlockers: (d) => {
      const wanted = d.candidates.flatMap((c) =>
        draw(2) === 0 ? [{ blocker: c.blocker, attacker: pick(c.canBlock, draw) }] : [],
      );
      // A creature that can't be blocked by more than N creatures keeps only its first N blockers (CR 509.1b).
      const most = new Map(
        d.attackers.map((a) => [a.attacker, a.maxBlockers ?? Infinity] as const),
      );
      const taken = new Map<string, number>();
      const allowed = wanted.filter((b) => {
        const n = (taken.get(b.attacker) ?? 0) + 1;
        taken.set(b.attacker, n);
        return n <= (most.get(b.attacker) ?? Infinity);
      });
      // A creature that needs several blockers (menace) is only blocked if enough were chosen.
      const need = new Map(d.attackers.map((a) => [a.attacker, a.minBlockers] as const));
      const count = new Map<string, number>();
      for (const b of allowed) count.set(b.attacker, (count.get(b.attacker) ?? 0) + 1);
      const blocks = allowed.filter(
        (b) => (count.get(b.attacker) ?? 0) >= (need.get(b.attacker) ?? 1),
      );
      // CR 509.1d (D-149): blocking may cost mana: only the blocks that can be paid for.
      return { kind: 'declareBlockers', blocks: withinBlockBudget(d, blocks) };
    },
    // Any legal division is fine for a random agent; the engine's default gives lethal to each
    // blocker in order and the rest onward.
    assignDamage: (d) => ({ kind: 'assignDamage', assignments: defaultDivision(d.choices) }),
    choosePermanent: (d) => {
      // A crew cost (CR 702.122a) is met only by creatures with enough total power: pick one of the
      // subsets the decision lists (`powers` and `minTotalPower` are in the decision).
      if (d.minTotalPower !== undefined) return pick(preferredActions(d), draw);
      const count = d.min + draw(d.max - d.min + 1);
      return { kind: 'choosePermanents', objects: pickCards(d.legal, count, draw) };
    },
    // A search may find nothing (min 0); a discard asks for exactly its count.
    chooseCards: (d) => {
      // D-139: "discard a card unless you discard an artifact card": the engine lists the answers (the single cards that do, and the full count).
      // D-262: a search for lands that share a land type: the answers the engine lists are the ones that do.
      if (d.orSingle !== undefined || d.shareLandType !== undefined) {
        return pick(preferredActions(d), draw);
      }
      const count = d.min + draw(d.max - d.min + 1);
      return { kind: 'chooseCards', objects: pickInOrder(d.legal, count, draw) };
    },
    // Any arrangement the decision lists (CR 701.22a, 701.25a), the identity and the all-bottom or
    // all-graveyard one among them.
    arrangeCards: (d) => pick(preferredActions(d), draw),
    orderTriggers: (d) => ({ kind: 'orderTriggers', order: shuffled(d.triggers.length, draw) }),
    confirmOptional: (d) => pick(preferredActions(d), draw),
    // CR 614.12a: any creature type or color, from the options the engine lists.
    chooseOption: (d) => ({ kind: 'chooseOption', option: pick(d.options, draw) }),
    // CR 107.3a (D-103): any value from 0 to the most the engine says it could pay.
    chooseX: (d) => ({ kind: 'chooseX', value: d.min + draw(d.max - d.min + 1) }),
    // CR 700.2 (D-114): any of the legal sets of modes the engine lists.
    chooseModes: (d) => ({ kind: 'chooseModes', modes: [...pick(d.sets, draw)] }),
    // CR 601.2f-h (D-120): any of the answers the engine lists, each of which leaves a cost it can pay.
    choosePayOptions: (d) => pick(preferredActions(d), draw),
  };
}
