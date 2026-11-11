// Combat on a copy (M7c, PRIOR_ART 7.2 heuristic 3, D-163): for random small boards, the position that a
// block reaches on the determinized sample equals what the real game reaches when both seats pass
// through combat. First strike, deathtouch, trample, lifelink, menace, indestructible and double strike
// all come from the engine in both runs, so the property also proves the sample plays the same combat.
import {
  type Action,
  applyAction,
  createRng,
  defaultDivision,
  determinize,
  type GameState,
  getView,
  type ObjectId,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { simulateBlocks } from '../src/heuristic-blocks';
import { combatOver, playOut } from '../src/heuristic-sim';

const POOL = [
  'Grizzly Bears',
  'Giant Spider',
  'Typhoid Rats',
  'Serra Angel',
  'SYNTHETIC Vanilla 1/1',
  'SYNTHETIC Vanilla 3/3',
  'SYNTHETIC Vanilla 5/5',
  'SYNTHETIC Menace 2/2',
  'SYNTHETIC First Striker 2/2',
  'SYNTHETIC Double Strike Lifelink 3/3',
  'SYNTHETIC Indestructible 2/2',
  'SYNTHETIC Trampler 4/4',
  'SYNTHETIC Deathtouch Trampler 4/4',
  'SYNTHETIC Flier 1/1',
] as const;

const board = fc.record({
  attackers: fc.array(fc.constantFrom(...POOL), { minLength: 1, maxLength: 3 }),
  blockers: fc.array(fc.constantFrom(...POOL), { minLength: 1, maxLength: 3 }),
  // For each blocker, the index of the attacker it blocks (modulo the attackers), or -1 for none.
  picks: fc.array(fc.integer({ min: -1, max: 2 }), { minLength: 3, maxLength: 3 }),
  life: fc.integer({ min: 1, max: 12 }),
});

/** What of a state is public and must agree between the sample and the real game. */
function facts(state: GameState) {
  const v = getView(state, 0);
  return {
    lives: v.seats.map((s) => s.life),
    poison: v.seats.map((s) => s.poison),
    graveyards: v.seats.map((s) => s.graveyard.map((o) => o.name).sort()),
    battlefield: v.battlefield
      .map((o) => `${o.id}:${o.name}:${o.damage}:${o.tapped}:${JSON.stringify(o.counters)}`)
      .sort(),
    result: v.result,
  };
}

/** The real game: both seats pass through combat, damage divided by the engine's default division. */
function realCombat(start: GameState): GameState {
  let s = start;
  for (let i = 0; i < 80 && !combatOver(s); i += 1) {
    const d = s.pending;
    if (d === null) break;
    const action: Action =
      d.kind === 'assignDamage'
        ? { kind: 'assignDamage', assignments: defaultDivision(d.choices) }
        : { kind: 'pass' };
    const next = applyAction(s, d.seat, action);
    if (!next.ok) throw new Error(`the real game refused ${d.kind}: ${next.error}`);
    s = next.state;
  }
  return s;
}

describe('a block played on the sample equals the real game', () => {
  test('for random boards and random legal blocks', () => {
    let compared = 0;
    fc.assert(
      fc.property(board, (b) => {
        let builder = scenario().seat(0).life(b.life);
        for (const name of b.blockers) builder = builder.battlefield(name);
        builder = builder.library('Island', { count: 6 }).seat(1);
        for (const name of b.attackers) builder = builder.battlefield(name);
        const g = builder
          .library('Island', { count: 6 })
          .at('precombatMain', { active: 1 })
          .build();
        g.advanceTo('declareAttackers');
        const attackerIds = g
          .view(1)
          .battlefield.filter(
            (o) => o.controller === 1 && o.power !== null && !o.keywords.includes('defender'),
          );
        const attacked = g.view(1).pending;
        if (attacked?.kind !== 'declareAttackers') return;
        const attackIds = attacked.candidates.map((c) => c.attacker);
        if (attackIds.length === 0 || attackerIds.length === 0) return;
        g.act(1).attack(attackIds);
        g.advanceTo('declareBlockers', { block: false });
        const d = g.state.pending;
        if (d?.kind !== 'declareBlockers' || d.seat !== 0) return;
        // A random legal block assignment: each blocker blocks one attacker it may block, or none.
        const blocks: { blocker: ObjectId; attacker: ObjectId }[] = [];
        d.candidates.forEach((c, i) => {
          const pick = b.picks[i] ?? -1;
          const attacker = pick < 0 ? undefined : c.canBlock[pick % Math.max(c.canBlock.length, 1)];
          if (attacker !== undefined) blocks.push({ blocker: c.blocker, attacker });
        });
        const declared = applyAction(g.state, 0, { kind: 'declareBlockers', blocks });
        // An illegal assignment (a menace attacker with one blocker) is not a case of the property.
        fc.pre(declared.ok);
        if (!declared.ok) return;
        const real = realCombat(declared.state);
        const sample = determinize(g.state, 0, createRng(7));
        const simulated = simulateBlocks(sample, 0, blocks);
        expect(simulated).not.toBeNull();
        if (simulated === null) return;
        expect(facts(simulated)).toEqual(facts(real));
        compared += 1;
      }),
      { numRuns: 60, seed: 20261030 },
    );
    // Most cases must have reached the comparison, or the property proves nothing.
    expect(compared).toBeGreaterThan(30);
  });

  test('playOut returns null instead of guessing when the engine refuses', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack('Grizzly Bears');
    g.advanceTo('declareBlockers', { block: false });
    const sample = determinize(g.state, 0, createRng(1));
    expect(
      simulateBlocks(sample, 0, [{ blocker: 'o999' as ObjectId, attacker: 'o998' as ObjectId }]),
    ).toBeNull();
    expect(playOut(sample, 0, {}, () => false, 3)).toBeNull();
  });

  test('playOut drops the candidate when the policy says the time is up, before the next step (D-164)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears')
      .library('Island', { count: 4 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack('Grizzly Bears');
    g.advanceTo('declareBlockers', { block: false });
    const sample = determinize(g.state, 0, createRng(1));
    let asked = 0;
    // Third question: stop. Two steps were taken, so the third check is the one that ends it.
    const abort = () => ++asked >= 3;
    expect(playOut(sample, 0, { abort })).toBeNull();
    expect(asked).toBe(3);
    // Without the abort the same play-out reaches the end of combat.
    expect(playOut(sample, 0, { abort: () => false })).not.toBeNull();
  });
});
