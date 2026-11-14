// Combat decisions in real games (SPEC 9, 12): the answers RandomLegalAgent gives to declareAttackers,
// declareBlockers and assignDamage are legal by an independent reading of the rules, the engine
// accepts what the independent check accepts and rejects what it rejects (a differential test of
// the engine's combat validators), everything the engine lists is accepted, and the combat games
// are reproducible. Games use creature-heavy decks of every combat fixture the engine exports.
import {
  type Action,
  applyAction,
  type DamageAssignment,
  type DamageChoice,
  type GameConfig,
  getView,
  legalActionsForDecision,
  type PendingDecision,
  stateHash,
} from '@commander-arena/engine';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { RandomLegalAgent, replayGame, runGame } from '../src/index';
import {
  addTally,
  type CombatTally,
  combatAnswerErrors,
  lcg,
  newTally,
  noteDecision,
  POOL_KEYWORDS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';

const LIMITS = { maxTurns: 150, maxActions: 5000 };
const COMBAT_KINDS = ['declareAttackers', 'declareBlockers', 'assignDamage'];
const fullTierDescribe = process.env.TEST_TIER === 'pr' ? describe.skip : describe;

const creatureConfig = (game: number): GameConfig =>
  smallGameConfig(game, game % 3 === 0 ? ['creatures', 'creatures'] : ['brawl', 'brawl']);

const agentPair = (seed: number) =>
  [
    new RandomLegalAgent({ seed: 7000 + 2 * seed }),
    new RandomLegalAgent({ seed: 7001 + 2 * seed }),
  ] as const;

interface Answered {
  readonly decision: PendingDecision;
  readonly action: Action;
}

/** Plays creature-deck games and returns every combat decision with the agent's answer. */
async function playCombatGames(
  games: number,
): Promise<{ answered: Answered[]; tally: CombatTally }> {
  const answered: Answered[] = [];
  const tally = newTally();
  for (let g = 1; g <= games; g += 1) {
    const agents = agentPair(g);
    // stepGame throws if the engine rejects an answer, so a game that returns had none rejected.
    const { state, capped } = await stepGame(creatureConfig(g), agents, LIMITS, (step) => {
      const decision = step.before.pending;
      if (decision === null) return;
      noteDecision(tally, getView(step.before, decision.seat), decision, step.action);
      if (COMBAT_KINDS.includes(decision.kind)) answered.push({ decision, action: step.action });
      expect(step.action.kind, `game ${g}: action ${step.index}`).not.toBe('concede');
    });
    expect(capped, `game ${g}`).toBe(false);
    expect(state.result, `game ${g}`).not.toBeNull();
    for (const agent of agents) expect(agent.fallbacks, `game ${g}`).toHaveLength(0);
  }
  return { answered, tally };
}

fullTierDescribe('RandomLegalAgent combat answers in real games', () => {
  test('attack, block and damage answers follow the rules and the engine accepted them all', async () => {
    const { answered, tally } = await playCombatGames(60);
    console.log(`combat answers in 60 games: ${JSON.stringify(tally)}`);
    const count = { declareAttackers: 0, declareBlockers: 0, assignDamage: 0 };
    let menaceUnblocked = 0;
    let menaceDoubleBlocked = 0;
    let tramplerAssigned = 0;
    for (const { decision, action } of answered) {
      const at = `${decision.kind} ${JSON.stringify(action)}`;
      expect(combatAnswerErrors(decision, action), at).toEqual([]);
      if (decision.kind === 'declareAttackers') count.declareAttackers += 1;
      if (decision.kind === 'declareBlockers' && action.kind === 'declareBlockers') {
        count.declareBlockers += 1;
        // Menace: a creature that needs two blockers is blocked by none or by two or more.
        for (const a of decision.attackers.filter((x) => x.minBlockers > 1)) {
          const n = action.blocks.filter((b) => b.attacker === a.attacker).length;
          expect(n, `${at}: menace attacker ${a.attacker}`).not.toBe(1);
          if (n === 0) menaceUnblocked += 1;
          else menaceDoubleBlocked += 1;
        }
      }
      if (decision.kind === 'assignDamage' && action.kind === 'assignDamage') {
        count.assignDamage += 1;
        for (const choice of decision.choices) {
          const mine = action.assignments.filter((a) => a.source === choice.source);
          // Every creature that has a choice divides exactly its power.
          expect(
            mine.reduce((sum, a) => sum + a.amount, 0),
            at,
          ).toBe(choice.power);
          // Damage never goes to a creature that is not blocking it, nor past blockers without trample.
          const blockers = new Set(choice.blockers.map((b) => b.object));
          for (const a of mine) {
            const onward = JSON.stringify(a.to) === JSON.stringify(choice.tramplesOver);
            if (a.to.kind === 'object' && blockers.has(a.to.id)) continue;
            // Otherwise it is excess trample damage to what the creature attacks (a player,
            // planeswalker or battle).
            expect(onward && choice.trample, at).toBe(true);
          }
          if (choice.trample) tramplerAssigned += 1;
        }
      }
    }
    // The audit was not vacuous.
    expect(count.declareAttackers).toBeGreaterThan(20);
    expect(count.declareBlockers).toBeGreaterThan(5);
    expect(count.assignDamage).toBeGreaterThan(0);
    if (POOL_KEYWORDS.has('menace'))
      expect(menaceUnblocked + menaceDoubleBlocked).toBeGreaterThan(0);
    if (POOL_KEYWORDS.has('trample')) expect(tramplerAssigned).toBeGreaterThan(0);
  }, 120_000);

  test('combat games through the runner: result, no fallback, no rejection, replay matches', async () => {
    let withCombat = 0;
    for (let g = 1; g <= 12; g += 1) {
      const config = creatureConfig(g);
      const run = await runGame(config, agentPair(g), LIMITS);
      const tag = `game ${g}`;
      expect(run.reason, tag).toBe('result');
      expect(run.result, tag).not.toBeNull();
      expect(run.counters.fallbacks, tag).toBe(0);
      expect(run.counters.rejectedActions, tag).toBe(0);
      expect(run.agentErrors, tag).toEqual([]);
      expect(stateHash(replayGame(config, run.log)), tag).toBe(stateHash(run.state));
      if (
        run.log.some((e) => e.action.kind === 'declareBlockers' || e.action.kind === 'assignDamage')
      )
        withCombat += 1;
    }
    expect(withCombat).toBeGreaterThan(0);
  }, 120_000);

  test('the same seeds give the same combat answers', async () => {
    const a = await playCombatGames(6);
    const b = await playCombatGames(6);
    expect(a.answered.length).toBeGreaterThan(0);
    expect(stateHash(a.answered)).toBe(stateHash(b.answered));
  }, 120_000);
});

// ---- Differential test: the engine's validators against the independent check

/** A random answer to `decision`, partly legal by construction and partly mutated or arbitrary. */
function probes(decision: PendingDecision, roll: (n: number) => number): Action[] {
  const out: Action[] = [];
  if (decision.kind === 'declareAttackers') {
    for (let i = 0; i < 5; i += 1) {
      const legal = decision.candidates.flatMap((c) => {
        const target = c.targets[roll(c.targets.length)];
        return roll(2) === 0 && target !== undefined ? [{ attacker: c.attacker, target }] : [];
      });
      out.push({ kind: 'declareAttackers', attacks: legal });
      const first = legal[0];
      if (first !== undefined) {
        // A creature declared twice, and an attack on one's own seat (neither is legal).
        out.push({ kind: 'declareAttackers', attacks: [...legal, first] });
        out.push({
          kind: 'declareAttackers',
          attacks: [{ ...first, target: { kind: 'player', seat: decision.seat } }],
        });
      }
    }
    out.push({
      kind: 'declareAttackers',
      attacks: [{ attacker: 'o999999', target: { kind: 'player', seat: 0 } }],
    });
  } else if (decision.kind === 'declareBlockers') {
    const attackerIds = decision.attackers.map((a) => a.attacker);
    for (let i = 0; i < 6; i += 1) {
      const blocks = decision.candidates.flatMap((c) => {
        if (roll(2) !== 0) return [];
        // Mostly a listed block; sometimes any attacker, which may be a block that is not allowed.
        const pool = roll(5) === 0 ? attackerIds : c.canBlock;
        const attacker = pool[roll(pool.length)];
        return attacker === undefined ? [] : [{ blocker: c.blocker, attacker }];
      });
      out.push({ kind: 'declareBlockers', blocks });
      const first = blocks[0];
      if (first !== undefined) {
        out.push({ kind: 'declareBlockers', blocks: [...blocks, { ...first }] }); // blocks twice
      }
    }
    // Menace: one blocker alone is illegal, two together are legal.
    for (const a of decision.attackers.filter((x) => x.minBlockers > 1)) {
      const able = decision.candidates.filter((c) => c.canBlock.includes(a.attacker));
      const [one, two] = able;
      if (one !== undefined) {
        out.push({
          kind: 'declareBlockers',
          blocks: [{ blocker: one.blocker, attacker: a.attacker }],
        });
      }
      if (one !== undefined && two !== undefined) {
        out.push({
          kind: 'declareBlockers',
          blocks: [one, two].map((c) => ({ blocker: c.blocker, attacker: a.attacker })),
        });
      }
    }
  } else if (decision.kind === 'assignDamage') {
    for (let i = 0; i < 8; i += 1) {
      const assignments = decision.choices.flatMap((c) => divide(c, roll, i));
      out.push({ kind: 'assignDamage', assignments });
    }
  }
  return out;
}

/** Splits `total` over `parts` slots, each non-negative, in a random way. */
function split(total: number, parts: number, roll: (n: number) => number): number[] {
  const shares = Array<number>(parts).fill(0);
  if (parts === 0) return shares;
  for (let i = 0; i < total; i += 1) {
    const slot = roll(parts);
    shares[slot] = (shares[slot] ?? 0) + 1;
  }
  return shares;
}

/**
 * A division of one creature's damage. Variant 0 to 3 are legal by construction (blockers only,
 * or lethal everywhere first and the excess onward); 4 to 7 are mutations that break one rule.
 */
function divide(c: DamageChoice, roll: (n: number) => number, variant: number): DamageAssignment[] {
  const toBlocker = (i: number, amount: number): DamageAssignment[] => {
    const b = c.blockers[i];
    return b === undefined || amount <= 0
      ? []
      : [{ source: c.source, to: { kind: 'object', id: b.object }, amount }];
  };
  const lethalTotal = c.blockers.reduce((sum, b) => sum + b.lethal, 0);
  const canTrample = c.trample && c.tramplesOver !== null && c.power >= lethalTotal;
  const excess = canTrample && roll(2) === 0 ? roll(c.power - lethalTotal + 1) : 0;
  let shares: number[];
  if (excess > 0) {
    // Lethal to every blocker, then the rest of the non-excess damage at random.
    const extra = split(c.power - excess - lethalTotal, c.blockers.length, roll);
    shares = c.blockers.map((b, i) => b.lethal + (extra[i] ?? 0));
  } else {
    shares = split(c.power, c.blockers.length, roll);
  }
  const legal = [
    ...shares.flatMap((amount, i) => toBlocker(i, amount)),
    ...(excess > 0 && c.tramplesOver !== null
      ? [{ source: c.source, to: c.tramplesOver, amount: excess }]
      : []),
  ];
  if (variant < 4) return legal;
  const first = c.blockers[0];
  switch (variant) {
    case 4: // one point too much
      return [...legal, ...toBlocker(0, 1)];
    case 5: // all of it to the player, past the blockers, whether or not it has trample
      return [{ source: c.source, to: { kind: 'player', seat: 1 }, amount: c.power }];
    case 6: // damage to a creature that is not blocking it
      return first === undefined
        ? legal
        : [{ source: c.source, to: { kind: 'object', id: 'o999999' }, amount: c.power }];
    default: {
      // Excess before lethal: one point to the blocker, the rest onward (legal only if lethal is 1).
      if (c.tramplesOver === null || first === undefined) return legal;
      return [
        ...toBlocker(0, 1),
        ...(c.power > 1 ? [{ source: c.source, to: c.tramplesOver, amount: c.power - 1 }] : []),
      ];
    }
  }
}

describe('engine combat validators against the independent check', () => {
  const creatureDeck = fc.constantFrom(...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const seed32 = fc.integer({ min: 0, max: 2 ** 31 - 1 });
  const input = fc.record({ game: creatureDeck, seed: seed32, agents: fc.tuple(seed32, seed32) });

  test('every listed action is accepted and every probe is judged like the independent check', async () => {
    const total = newTally();
    const probed = { declareAttackers: 0, declareBlockers: 0, assignDamage: 0 };
    const accepted = { declareAttackers: 0, declareBlockers: 0, assignDamage: 0 };
    const rejected = { declareAttackers: 0, declareBlockers: 0, assignDamage: 0 };
    let listed = 0;
    await fc.assert(
      fc.asyncProperty(input, async ({ game, seed, agents }) => {
        const config = { ...creatureConfig(game), seed };
        const pair = [
          new RandomLegalAgent({ seed: agents[0] }),
          new RandomLegalAgent({ seed: agents[1] }),
        ] as const;
        const tally = newTally();
        await stepGame(config, pair, LIMITS, ({ before, action }: StepInfo) => {
          const decision = before.pending;
          if (decision === null || !COMBAT_KINDS.includes(decision.kind)) return;
          noteDecision(tally, getView(before, decision.seat), decision, action);
          for (const offered of legalActionsForDecision(decision)) {
            const r = applyAction(before, decision.seat, offered);
            listed += 1;
            expect(r.ok, `${decision.kind}: listed ${JSON.stringify(offered)}`).toBe(true);
          }
          const roll = lcg(before.actionCount * 31 + seed);
          for (const probe of probes(decision, roll)) {
            const kind = decision.kind as keyof typeof probed;
            const errors = combatAnswerErrors(decision, probe);
            const r = applyAction(before, decision.seat, probe);
            probed[kind] += 1;
            if (r.ok) accepted[kind] += 1;
            else rejected[kind] += 1;
            expect(r.ok, `${decision.kind} ${JSON.stringify(probe)}: ${errors.join('; ')}`).toBe(
              errors.length === 0,
            );
          }
        });
        addTally(total, tally);
      }),
      { numRuns: 16, seed: 20250701 },
    );
    console.log(
      `combat validator probes: ${JSON.stringify({ listed, probed, accepted, rejected })}`,
    );
    // The probes were not vacuous: each kind saw both accepted and rejected answers.
    expect(listed).toBeGreaterThan(0);
    for (const kind of Object.keys(probed) as (keyof typeof probed)[]) {
      expect(accepted[kind], `${kind} accepted`).toBeGreaterThan(0);
    }
    expect(rejected.declareAttackers).toBeGreaterThan(0);
    expect(rejected.declareBlockers).toBeGreaterThan(0);
    expect(rejected.assignDamage).toBeGreaterThan(0);
  }, 120_000);
});
