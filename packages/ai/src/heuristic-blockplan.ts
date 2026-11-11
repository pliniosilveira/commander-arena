/**
 * The candidate blocks of the HeuristicAgent (M7c, PRIOR_ART 7.2 heuristic 2, D-163), in tiers, from the
 * view and the `declareBlockers` decision alone:
 *
 *  1. good blocks: a blocker that survives, killing the attacker when one can, the cheapest such
 *     creature (by `creatureValue`) for the strongest attackers first;
 *  2. value trades: a blocker and an attacker that both die, when the attacker is worth at least as
 *     much as the blocker (so an even trade is taken and a trade against a more valuable blocker is not);
 *  3. gang blocks: two blockers that kill an attacker between them while the attacker can kill only one
 *     (and a pair for a menace attacker, which needs two, CR 702.111b), when the attacker is worth at
 *     least the dearer of the two;
 *  4. chump blocks, only while the damage that would get through leaves the agent "in danger"
 *     (`heuristic-danger.ts`: low life, poison toward 10, one commander toward 21): the strongest
 *     unblocked attackers first, with the blocker that survives or kills when there is one, else the
 *     cheapest, until the danger is gone.
 *
 * `blockPlans` returns a small list of whole plans (no block, tiers 1, 1+2 and 1+2+3 each with and
 * without the chump fill, the chump fill alone, and a block-everything plan when the danger does not
 * go away). The agent scores each by playing it on a sample (`heuristic-blocks.ts`); without a sample
 * it takes `defaultPlan`, the deepest tier with its chump fill. The same planner stands in for the
 * opponent when an attack is simulated (the opponent is assumed to block this way).
 */
import type {
  DeclareBlockersDecision,
  GameView,
  ObjectId,
  ObjectView,
} from '@commander-arena/engine';
import { poisonDamageOf } from './casual-poison';
import { findObject, hasKeyword, powerOf, toughnessOf } from './casual-view';
import { creatureValue } from './evaluate';
import { type Breakthrough, hitDamage, verdict } from './heuristic-danger';
import { duel, gangWins } from './heuristic-duel';

export type BlockKind = 'no-block' | 'good-block' | 'trade-block' | 'gang-block' | 'chump-danger';

export interface Block {
  readonly blocker: ObjectId;
  readonly attacker: ObjectId;
}

export interface BlockPlan {
  readonly kind: BlockKind;
  readonly blocks: readonly Block[];
}

interface AttackerInfo {
  readonly id: ObjectId;
  readonly object: ObjectView;
  readonly minBlockers: number;
  readonly maxBlockers: number;
  readonly atMe: boolean;
}

interface BlockerInfo {
  readonly object: ObjectView;
  readonly canBlock: ReadonlySet<ObjectId>;
}

const RANK: Readonly<Record<BlockKind, number>> = {
  'no-block': 0,
  'good-block': 1,
  'trade-block': 2,
  'gang-block': 3,
  'chump-danger': 4,
};

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const key = (blocks: readonly Block[]): string =>
  blocks
    .map((b) => `${b.blocker}>${b.attacker}`)
    .sort(byId)
    .join(',');

/** A plan under construction: the blocks so far and the highest tier used. */
interface Draft {
  readonly blocks: Block[];
  readonly used: Set<ObjectId>;
  kind: BlockKind;
}

const emptyDraft = (): Draft => ({ blocks: [], used: new Set(), kind: 'no-block' });
const copyDraft = (d: Draft): Draft => ({
  blocks: [...d.blocks],
  used: new Set(d.used),
  kind: d.kind,
});
const finish = (d: Draft): BlockPlan => ({ kind: d.kind, blocks: [...d.blocks] });

class Planner {
  readonly attackers: AttackerInfo[];
  readonly blockers = new Map<ObjectId, BlockerInfo>();

  private readonly view: GameView;

  constructor(view: GameView, d: DeclareBlockersDecision) {
    this.view = view;
    this.attackers = d.attackers.flatMap((a) => {
      const object = findObject(view, a.attacker);
      return object === undefined
        ? []
        : [
            {
              id: a.attacker,
              object,
              minBlockers: a.minBlockers,
              maxBlockers: a.maxBlockers ?? Number.POSITIVE_INFINITY,
              atMe: a.target.kind === 'player' && a.target.seat === view.viewer,
            },
          ];
    });
    for (const c of d.candidates) {
      const object = findObject(view, c.blocker);
      if (object !== undefined) {
        this.blockers.set(c.blocker, { object, canBlock: new Set(c.canBlock) });
      }
    }
  }

  private blocked(draft: Draft, attacker: ObjectId): boolean {
    return draft.blocks.some((b) => b.attacker === attacker);
  }

  /** Free creatures that may block `a`, cheapest first (ties by id). */
  private free(draft: Draft, a: AttackerInfo): BlockerInfo[] {
    return [...this.blockers.entries()]
      .filter(([id, b]) => !draft.used.has(id) && b.canBlock.has(a.id))
      .map(([, b]) => b)
      .sort(
        (x, y) =>
          creatureValue(x.object) - creatureValue(y.object) || byId(x.object.id, y.object.id),
      );
  }

  private assign(draft: Draft, a: AttackerInfo, group: readonly BlockerInfo[], kind: BlockKind) {
    for (const b of group) {
      draft.blocks.push({ blocker: b.object.id, attacker: a.id });
      draft.used.add(b.object.id);
    }
    if (RANK[kind] > RANK[draft.kind]) draft.kind = kind;
  }

  private strongestFirst(): AttackerInfo[] {
    return [...this.attackers].sort(
      (x, y) => creatureValue(y.object) - creatureValue(x.object) || byId(x.id, y.id),
    );
  }

  /**
   * Tier 1: survive, killing the attacker when possible. Two passes: first the blocks that survive AND
   * kill, strongest attacker first, then the blocks that only survive for the attackers left. One pass
   * over the attackers, strongest first, would give a lone blocker to the strongest attacker it merely
   * stops and leave a weaker one it would kill unblocked (issue 73: a reach blocker that stops a 3/5
   * flier instead of killing the 2/2 commander next to it).
   */
  good(draft: Draft): void {
    for (const killing of [true, false]) {
      for (const a of this.strongestFirst()) {
        if (a.minBlockers !== 1 || this.blocked(draft, a.id) || powerOf(a.object) <= 0) continue;
        const free = this.free(draft, a).filter((b) => !duel(a.object, b.object).blockerDies);
        const pick = killing ? free.find((b) => duel(a.object, b.object).attackerDies) : free[0];
        if (pick !== undefined) this.assign(draft, a, [pick], 'good-block');
      }
    }
  }

  /** Tier 2: a trade where the attacker is worth at least the blocker. */
  trades(draft: Draft): void {
    for (const a of this.strongestFirst()) {
      if (a.minBlockers !== 1 || this.blocked(draft, a.id)) continue;
      const pick = this.free(draft, a).find((b) => {
        const r = duel(a.object, b.object);
        return (
          r.attackerDies && r.blockerDies && creatureValue(a.object) >= creatureValue(b.object)
        );
      });
      if (pick !== undefined) this.assign(draft, a, [pick], 'trade-block');
    }
  }

  /** Tier 3: two blockers kill what neither could alone, losing at most one. */
  gangs(draft: Draft): void {
    for (const a of this.strongestFirst()) {
      if (this.blocked(draft, a.id) || a.maxBlockers < 2) continue;
      const free = this.free(draft, a);
      let best: [BlockerInfo, BlockerInfo] | undefined;
      for (let i = 0; i < free.length; i += 1) {
        for (let j = i + 1; j < free.length; j += 1) {
          const [x, y] = [free[i], free[j]];
          if (x === undefined || y === undefined || !gangWins(a.object, x.object, y.object))
            continue;
          const dear = Math.max(creatureValue(x.object), creatureValue(y.object));
          if (creatureValue(a.object) < dear) continue;
          if (best === undefined) best = [x, y];
        }
      }
      if (best !== undefined) this.assign(draft, a, best, 'gang-block');
    }
  }

  /** What gets past `draft`'s blocks to the agent: unblocked damage, and the excess of blocked tramplers. */
  through(draft: Draft): Breakthrough {
    let life = 0;
    let poison = 0;
    let commander = 0;
    for (const a of this.attackers) {
      if (!a.atMe) continue;
      const blockers = draft.blocks
        .filter((b) => b.attacker === a.id)
        .flatMap((b) => this.blockers.get(b.blocker)?.object ?? []);
      let dmg = hitDamage(a.object);
      let pois = poisonDamageOf(a.object);
      if (blockers.length > 0) {
        if (hasKeyword(a.object, 'trample')) {
          const absorbed = blockers.reduce((s, b) => s + Math.max(toughnessOf(b) - b.damage, 0), 0);
          dmg = Math.max(dmg - absorbed, 0);
          if (dmg === 0) pois = 0;
        } else {
          dmg = 0;
          pois = 0;
        }
      }
      life += dmg;
      poison += pois;
      if (a.object.isCommander && dmg > 0) commander = Math.max(commander, dmg);
    }
    return { life, poison, commander };
  }

  inDanger(draft: Draft): boolean {
    return verdict(this.view, this.view.viewer, this.through(draft)).danger;
  }

  /** The chump fill: block the strongest attackers until the danger is gone or nothing is left to block with. */
  chump(draft: Draft, everything = false): void {
    for (;;) {
      if (!everything && !this.inDanger(draft)) return;
      const open = this.attackers
        .filter((a) => (everything || a.atMe) && !this.blocked(draft, a.id))
        .filter(
          (a) => this.free(draft, a).length >= a.minBlockers && a.maxBlockers >= a.minBlockers,
        )
        .sort(
          (x, y) =>
            hitDamage(y.object) - hitDamage(x.object) ||
            creatureValue(y.object) - creatureValue(x.object) ||
            byId(x.id, y.id),
        );
      const decisive = open.find((a) => {
        const probe = copyDraft(draft);
        this.assign(probe, a, this.group(probe, a), 'chump-danger');
        return !this.inDanger(probe);
      });
      const pick = decisive ?? open[0];
      if (pick === undefined) return;
      this.assign(draft, pick, this.group(draft, pick), 'chump-danger');
    }
  }

  /** The blockers for `a`: one that survives and kills, else one that survives, else the cheapest. */
  private group(draft: Draft, a: AttackerInfo): BlockerInfo[] {
    const free = this.free(draft, a);
    if (a.minBlockers === 1) {
      const live = free.filter((b) => !duel(a.object, b.object).blockerDies);
      const killer = live.find((b) => duel(a.object, b.object).attackerDies);
      const pick = killer ?? live[0] ?? free[0];
      return pick === undefined ? [] : [pick];
    }
    return free.slice(0, a.minBlockers);
  }
}

/** The candidate whole plans for a block decision (see the module comment), no block first. */
export function blockPlans(view: GameView, d: DeclareBlockersDecision): BlockPlan[] {
  const p = new Planner(view, d);
  const plans = new Map<string, BlockPlan>();
  const add = (draft: Draft): void => {
    const k = key(draft.blocks);
    if (!plans.has(k)) plans.set(k, finish(draft));
  };
  add(emptyDraft());
  const tiers: ((draft: Draft) => void)[] = [
    (x) => p.good(x),
    (x) => p.trades(x),
    (x) => p.gangs(x),
  ];
  const draft = emptyDraft();
  for (const tier of tiers) {
    tier(draft);
    add(draft);
    const filled = copyDraft(draft);
    p.chump(filled);
    add(filled);
  }
  const defensive = emptyDraft();
  p.chump(defensive);
  add(defensive);
  // When the danger does not go away, the last resort is to block everything that can be blocked.
  const all = copyDraft(draft);
  p.chump(all);
  if (p.inDanger(all)) {
    p.chump(all, true);
    add(all);
  }
  return [...plans.values()];
}

/** Without a sample: the deepest tier with the chump fill (the last tier plan that adds the fill). */
export function defaultPlan(view: GameView, d: DeclareBlockersDecision): BlockPlan {
  const p = new Planner(view, d);
  const draft = emptyDraft();
  p.good(draft);
  p.trades(draft);
  p.gangs(draft);
  p.chump(draft);
  return finish(draft);
}

/** What an opponent that blocks only when it is in danger does: the chump fill alone. */
export function dangerOnlyPlan(view: GameView, d: DeclareBlockersDecision): BlockPlan {
  const p = new Planner(view, d);
  const draft = emptyDraft();
  p.chump(draft);
  return finish(draft);
}
