// The agents never choose an illegal target (CR 702.11b hexproof, CR 702.18a shroud, CR 115) and
// the flash windows (CR 702.8a) reach them as ordinary castSpell options. Both agents answer from
// the engine's legal answers, so this follows; the test pins it with checks written from the
// rules and the view alone (keywords and controllers), not from the engine's own legality code.
//
// Hand-built case: the opponent controls a hexproof and a shroud creature and one ordinary
// creature; every targeting answer of both agents, over many seeds, avoids the first two.
// Soak: `soakGames()` games (random vs random, then casual vs casual) over the 'keywords' deck style; every
// chooseTargets answer is checked against the view of the moment, and the games must really
// contain hexproof or shroud permanents the agent could not target and flash casts outside
// sorcery timing, or the check would be vacuous.
import {
  type Action,
  applyAction,
  type GameState,
  getView,
  type ObjectView,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX, smallGameConfig, stepGame } from './helpers';
import { soakGames, soakTimeout } from './soak';

// 100 games with the whole engine: about 100 s alone, more on a loaded machine (CI, a full local run).
const TIMEOUT_MS = 300_000;
const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

type AnyAgent = Agent & { readonly fallbacks: readonly unknown[] };

/** Targeting answers that break the rules, from the view of the deciding seat alone. */
function illegalTargetChoices(state: GameState, seat: number, action: Action): string[] {
  if (action.kind !== 'chooseTargets') return [];
  const battlefield = getView(state, seat).battlefield;
  const problems: string[] = [];
  for (const t of action.targets) {
    if (t.kind !== 'object') continue;
    const o: ObjectView | undefined = battlefield.find((b) => b.id === t.id);
    if (o === undefined) continue; // a card on the stack or in a graveyard: not a permanent
    if (o.keywords.includes('shroud')) problems.push(`${o.name} has shroud`);
    if (o.keywords.includes('hexproof') && o.controller !== seat) {
      problems.push(`${o.name} has hexproof and an opponent controls the spell`);
    }
  }
  return problems;
}

const makeAgent = (kind: 'random' | 'casual', seed: number): AnyAgent =>
  kind === 'casual' ? new CasualAgent({ seed }) : new RandomLegalAgent({ seed });

describe('agents and hexproof or shroud permanents', () => {
  function board() {
    return scenario()
      .seat(0)
      .hand('Lightning Bolt', 'Murder')
      .battlefield('Mountain')
      .battlefield('Swamp', { count: 3 })
      .seat(1)
      .battlefield('SYNTHETIC Hexproof Bear')
      .battlefield('SYNTHETIC Shroud Bear')
      .battlefield('Grizzly Bears')
      .build();
  }

  for (const kind of ['random', 'casual'] as const) {
    test(`${kind}: whatever it picks for Bolt and Murder, hexproof and shroud are never chosen`, async () => {
      let targetsDecisions = 0;
      for (let seed = 1; seed <= 40; seed += 1) {
        const g = board();
        const agent = makeAgent(kind, seed);
        for (const spell of ['Lightning Bolt', 'Murder']) {
          g.act(0).cast(spell);
          const pending = g.state.pending;
          expect(pending?.kind).toBe('targets');
          const view = getView(g.state, 0);
          if (view.pending === null) throw new Error('no pending decision in the view');
          const action = await agent.decide(view, view.pending, CTX);
          targetsDecisions += 1;
          expect(illegalTargetChoices(g.state, 0, action), `${kind} ${spell} seed ${seed}`).toEqual(
            [],
          );
          expect(applyAction(g.state, 0, action).ok, `${kind} ${spell} seed ${seed}`).toBe(true);
          g.act(0).cancel();
        }
        expect(agent.fallbacks).toHaveLength(0);
      }
      expect(targetsDecisions).toBe(80);
    });
  }

  test('the engine lists only the ordinary creature as a target for Murder', () => {
    const g = board();
    g.act(0).cast('Murder');
    const pending = g.state.pending;
    if (pending?.kind !== 'targets') throw new Error('expected targets');
    const legal = pending.specs[0]?.legal ?? [];
    // Murder: creatures only, and only Grizzly Bears qualifies.
    expect(legal).toEqual([{ kind: 'object', id: g.id('Grizzly Bears'), specId: 't1' }]);
  });
});

describe(`${GAMES}-game soak over flash, hexproof and shroud cards`, () => {
  for (const kind of ['random', 'casual'] as const) {
    test(
      `${kind} vs ${kind}: no rejected answer, no illegal target, and the keywords really occur`,
      async () => {
        let protectedPresent = 0;
        let targetDecisions = 0;
        let flashOutsideSorceryTiming = 0;
        let plainOutsideSorceryTiming = 0;
        for (let game = 1; game <= GAMES; game += 1) {
          const config = smallGameConfig(game, ['keywords', 'keywords']);
          const agents = [
            makeAgent(kind, 7000 + 2 * game),
            makeAgent(kind, 7001 + 2 * game),
          ] as const;
          const result = await stepGame(config, agents, LIMITS, (step) => {
            const { before, seat, action } = step;
            const tag = `${kind} game ${game} step ${step.index}`;
            expect(illegalTargetChoices(before, seat, action), tag).toEqual([]);
            const decision = before.pending;
            if (decision?.kind === 'targets') {
              targetDecisions += 1;
              const battlefield = getView(before, seat).battlefield;
              for (const o of battlefield) {
                const protectedFromUs =
                  o.keywords.includes('shroud') ||
                  (o.keywords.includes('hexproof') && o.controller !== seat);
                if (!protectedFromUs) continue;
                protectedPresent += 1;
                const offered = decision.specs.some((s) =>
                  s.legal.some((t) => t.kind === 'object' && t.id === o.id),
                );
                expect(offered, `${tag}: ${o.name} offered as a target`).toBe(false);
              }
            }
            if (action.kind === 'castSpell') {
              const view = getView(before, seat);
              const card = [
                ...(view.seats[seat]?.hand ?? []),
                ...(view.seats[seat]?.command ?? []),
              ].find((o) => o.id === action.object);
              if (card === undefined || card.types.includes('instant')) return;
              const sorceryTiming =
                before.turn.activeSeat === seat &&
                (before.turn.step === 'precombatMain' || before.turn.step === 'postcombatMain') &&
                before.stack.length === 0;
              if (sorceryTiming) return;
              if (card.keywords.includes('flash')) flashOutsideSorceryTiming += 1;
              else plainOutsideSorceryTiming += 1;
            }
          });
          expect(result.capped, `${kind} game ${game}`).toBe(false);
          for (const agent of agents) expect(agent.fallbacks).toHaveLength(0);
        }
        expect(plainOutsideSorceryTiming, 'a non-flash card cast outside sorcery timing').toBe(0);
        expect(flashOutsideSorceryTiming, 'no flash cast outside sorcery timing').toBeGreaterThan(
          0,
        );
        expect(
          protectedPresent,
          'no hexproof or shroud permanent was ever in play',
        ).toBeGreaterThan(0);
        expect(targetDecisions).toBeGreaterThan(0);
      },
      soakTimeout(TIMEOUT_MS),
    );
  }
});
