// CasualAgent, HeuristicAgent and a random agent with "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard"
// (`playFromGraveyardEachType`, the SYNTHETIC avatar of the engine fixtures), on real engine states: a card with two permanent types is listed once for each type, the agents answer
// with an action the engine lists and accepts (naming no type lets the engine choose one), and they use the permission in a main phase without ever repeating a slot.
import { type Action, type PendingDecision, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';

const AVATAR = 'SYNTHETIC Gravetide Avatar';
const GEAR = 'SYNTHETIC Gear Golem'; // {2} artifact creature
const IDOL = 'SYNTHETIC Brass Idol'; // {2} artifact
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

const game = () =>
  scenario()
    .define(syntheticCard(AVATAR))
    .seat(0)
    .library(...LIBRARY)
    .battlefield(AVATAR)
    .battlefield('Forest', { count: 6 })
    .graveyard(GEAR, IDOL, BEARS, 'Mountain')
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('the options of a card with two permanent types', () => {
  test('the golem is listed once as the artifact and once as the creature', () => {
    const g = game();
    const options = g.legalActions(0).flatMap((a) => {
      if (a.kind !== 'castSpell' || g.object(a.object).zone !== 'graveyard') return [];
      return g.object(a.object).card === g.object({ name: GEAR, zone: 'graveyard' }).card
        ? [a.permanentType]
        : [];
    });
    expect(options.sort()).toEqual(['artifact', 'creature']);
  });
});

describe('the agents answer with an action the engine lists and accepts', () => {
  test.each([
    ['CasualAgent', () => new CasualAgent({ seed: 1 })],
    ['HeuristicAgent', () => new HeuristicAgent({ seed: 1 })],
    ['RandomLegalAgent', () => new RandomLegalAgent({ seed: 3 })],
  ] as const)('%s', async (_name, make) => {
    const g = game();
    const action = await answer(g, make());
    expectLegal(g, action);
  });
});

describe('a main phase with the permission', () => {
  test.each([
    ['CasualAgent', () => new CasualAgent({ seed: 1 })],
    ['HeuristicAgent', () => new HeuristicAgent({ seed: 1 })],
  ] as const)(
    '%s plays from the graveyard and the engine accepts every action',
    async (_name, make) => {
      const g = game();
      const agent = make();
      let steps = 0;
      while (g.state.turn.step === 'precombatMain' && steps < 40) {
        steps += 1;
        const d = g.state.pending as PendingDecision | null;
        if (d === null || d.kind !== 'priority') break;
        let action: Action;
        if (d.seat === 0) {
          action = await answer(g, agent);
          if (action.kind === 'pass' && g.state.stack.length === 0) break;
        } else {
          action = { kind: 'pass' };
        }
        g.choose(d.seat, action);
      }
      const slots = g.state.turnLog.graveyardSlots ?? [];
      expect(slots.length).toBeGreaterThan(0);
      // Never one slot twice.
      expect(new Set(slots.map((s) => `${s.source}:${s.type}`)).size).toBe(slots.length);
      g.expect.invariants();
    },
  );
});
