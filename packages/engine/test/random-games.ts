// Shared by scenario tests that need many real game states: two 100-card decks of the M1 fixtures,
// and a driver that plays them through the public API only, choosing with its own tiny generator
// (independent of the engine's PRNG).
import {
  type Action,
  applyAction,
  createGame,
  type DeckConfig,
  deckOf,
  type GameState,
  getLegalActions,
} from '../src/index';

export function deckA(): DeckConfig {
  const cards = deckOf([
    ['Isamaru, Hound of Konda', 1],
    ['Plains', 34],
    ['Sol Ring', 4],
    ['Command Tower', 4],
    ["Angel's Mercy", 20],
    ['Lightning Bolt', 12],
    ['Divination', 10],
    ['Unsummon', 8],
    ['Murder', 7],
  ]);
  return { cards, commanders: [0] };
}

export function deckB(): DeckConfig {
  const cards = deckOf([
    ['Yargle, Glutton of Urborg', 1],
    ['Swamp', 30],
    ['Island', 8],
    ['Mountain', 6],
    ['Llanowar Elves', 10],
    ['Grizzly Bears', 10],
    ['Counterspell', 8],
    ['Murder', 10],
    ['Lightning Bolt', 10],
    ['Forest', 6],
    ['Divination', 1],
  ]);
  return { cards, commanders: [0] };
}

export const newGame = (seed: number): GameState =>
  createGame({ seed, decks: [deckA(), deckB()] }).state;

export function lcg(seed: number) {
  let s = seed >>> 0;
  return (n: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

export type Policy = (legal: readonly Action[]) => Action;

export const randomPolicy = (pickSeed: number): Policy => {
  const pick = lcg(pickSeed);
  return (legal) => legal[pick(legal.length)] as Action;
};

/** Always the first legal action that is not a concession: a policy with no randomness at all. */
export const firstPolicy: Policy = (legal) => legal.find((a) => a.kind !== 'concede') as Action;

export interface Played {
  readonly state: GameState;
  readonly log: { seat: number; action: Action }[];
}

/** Plays from `start` until the game ends or `maxActions` actions were applied. */
export function play(
  start: GameState,
  policy: Policy,
  maxActions: number,
  onStep?: (state: GameState) => void,
): Played {
  let state = start;
  const log: { seat: number; action: Action }[] = [];
  for (let i = 0; i < maxActions && !state.result; i += 1) {
    const d = state.pending;
    if (d === null) throw new Error('no pending decision in a running game');
    const legal = getLegalActions(state, d.seat).filter((a) => a.kind !== 'concede');
    const action = policy(legal);
    const r = applyAction(state, d.seat, action);
    if (!r.ok) throw new Error(`legal action rejected: ${JSON.stringify(action)}: ${r.error}`);
    state = r.state;
    log.push({ seat: d.seat, action });
    onStep?.(state);
  }
  return { state, log };
}

// ---- Combat decks and a driver that answers the combat decisions from the decision itself.
//
// The legal-action lists for the combat decisions hold only a few answers (no attack, each attacker
// alone, the default damage division), so a random driver built on them never makes a double block,
// a partial attack or a trample split. `answerFromDecision` builds a random legal answer from the
// decision's own data instead, through the public API only.

import type {
  AttackTarget,
  DamageAssignment,
  DamageRecipient,
  PendingDecision,
} from '../src/index';

/** A 60-card combat deck: the M2 keyword creatures, the synthetic combat cards and a few spells. */
function combatDeck(commander: string): DeckConfig {
  const cards = deckOf([
    [commander, 1],
    ['Plains', 8],
    ['Swamp', 8],
    ['Forest', 8],
    ['Mountain', 8],
    ['Island', 4],
    ['Serra Angel', 2],
    ['Typhoid Rats', 3],
    ['Giant Spider', 2],
    ['Youthful Knight', 3],
    ['Fencing Ace', 3],
    ['Wall of Stone', 1],
    ['Raging Goblin', 2],
    ["Healer's Hawk", 2],
    ['SYNTHETIC Menace 2/2', 1],
    ['SYNTHETIC Trampler 4/4', 1],
    ['SYNTHETIC Deathtouch Trampler 4/4', 1],
    ['SYNTHETIC Vanilla 2/2', 1],
    ['SYNTHETIC Vanilla 3/3', 1],
    ['SYNTHETIC Vanilla 5/5', 1],
    ['SYNTHETIC Double Strike Lifelink 3/3', 1],
    ['SYNTHETIC Indestructible 2/2', 1],
    ['SYNTHETIC First Striker 2/2', 1],
    ['SYNTHETIC Flier 1/1', 1],
    ['SYNTHETIC Hasty Mana Elf', 1],
    ['SYNTHETIC Vanilla Planeswalker', 1],
    ['SYNTHETIC Vanilla Battle', 1],
    ['Lightning Bolt', 2],
    ['SYNTHETIC Lifelink Bolt', 1],
    ['Murder', 1],
    ['Unsummon', 1],
  ]);
  return { cards, commanders: [0] };
}

export const combatDecks = (): [DeckConfig, DeckConfig] => [
  combatDeck('Yargle, Glutton of Urborg'),
  combatDeck('Isamaru, Hound of Konda'),
];

type Pick = (n: number) => number;

/** Splits `units` over `recipients` at random, returning the amount for each (zeros dropped). */
function scatter(units: number, recipients: readonly number[], pick: Pick): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 0; i < units; i += 1) {
    const r = recipients[pick(recipients.length)] as number;
    out.set(r, (out.get(r) ?? 0) + 1);
  }
  return out;
}

/** A random legal division for each attacker that has a choice (CR 510.1c, 702.19b). */
function randomDivision(
  choices: Extract<PendingDecision, { kind: 'assignDamage' }>['choices'],
  pick: Pick,
): DamageAssignment[] {
  const out: DamageAssignment[] = [];
  for (const c of choices) {
    // Recipients are indexes: blockers 0..n-1, and n for what the trampler attacks.
    const n = c.blockers.length;
    const give = new Map<number, number>();
    let left = c.power;
    const lethalSum = c.blockers.reduce((sum, b) => sum + b.lethal, 0);
    const canTrample = c.tramplesOver !== null && lethalSum <= c.power && pick(2) === 0;
    if (canTrample) {
      c.blockers.forEach((b, i) => {
        give.set(i, b.lethal);
        left -= b.lethal;
      });
    }
    const recipients = [...Array(n).keys(), ...(canTrample ? [n] : [])];
    for (const [i, amount] of scatter(left, recipients, pick))
      give.set(i, (give.get(i) ?? 0) + amount);
    for (const [i, amount] of give) {
      if (amount === 0) continue;
      const to: DamageRecipient =
        i === n
          ? (c.tramplesOver as DamageRecipient)
          : { kind: 'object', id: (c.blockers[i] as { object: string }).object as never };
      out.push({ source: c.source, to, amount });
    }
  }
  return out;
}

/**
 * A random legal answer to a combat decision, built from the decision's data; null for any other
 * decision (the caller then picks from getLegalActions).
 */
export function answerFromDecision(d: PendingDecision, pick: Pick): Action | null {
  switch (d.kind) {
    case 'declareAttackers': {
      const attacks = d.candidates
        .filter(() => pick(2) === 0)
        .map((c) => ({
          attacker: c.attacker,
          target: c.targets[pick(c.targets.length)] as AttackTarget,
        }));
      return { kind: 'declareAttackers', attacks };
    }
    case 'declareBlockers': {
      let blocks = d.candidates
        .filter(() => pick(2) === 0)
        .map((c) => ({
          blocker: c.blocker,
          attacker: c.canBlock[pick(c.canBlock.length)] as string,
        }));
      // Menace: an attacker blocked by fewer creatures than it needs gets no blocker at all.
      const need = new Map(d.attackers.map((a) => [a.attacker as string, a.minBlockers]));
      const count = new Map<string, number>();
      for (const b of blocks) count.set(b.attacker, (count.get(b.attacker) ?? 0) + 1);
      blocks = blocks.filter((b) => (count.get(b.attacker) ?? 0) >= (need.get(b.attacker) ?? 1));
      return { kind: 'declareBlockers', blocks: blocks as never };
    }
    case 'assignDamage':
      return { kind: 'assignDamage', assignments: randomDivision(d.choices, pick) };
    default:
      return null;
  }
}

/** Plays like `play`, but combat decisions are answered from the decision (see above). */
export function playCombatGame(
  start: GameState,
  pickSeed: number,
  maxActions: number,
  onStep?: (state: GameState) => void,
): Played {
  const pick = lcg(pickSeed);
  let state = start;
  const log: { seat: number; action: Action }[] = [];
  for (let i = 0; i < maxActions && !state.result; i += 1) {
    const d = state.pending;
    if (d === null) throw new Error('no pending decision in a running game');
    const action =
      answerFromDecision(d, pick) ??
      (() => {
        const legal = getLegalActions(state, d.seat).filter((a) => a.kind !== 'concede');
        return legal[pick(legal.length)] as Action;
      })();
    const r = applyAction(state, d.seat, action);
    if (!r.ok) throw new Error(`answer rejected: ${JSON.stringify(action)}: ${r.error}`);
    state = r.state;
    log.push({ seat: d.seat, action });
    onStep?.(state);
  }
  return { state, log };
}
