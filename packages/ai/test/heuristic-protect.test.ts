// HeuristicAgent and protection spells: "Target permanent you control gains hexproof and indestructible
// until end of turn. You gain 2 life." is cast in response to a removal spell aimed at a permanent of
// its own, and aimed at the permanent that is threatened (never at a land). The reminder text in
// parentheses of the real card ("effects that say destroy don't destroy it") must not make the spell
// read as hostile. Real engine states from the scenario DSL; the card is a SYNTHETIC copy of the shape.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { helpsItsTarget } from '../src/casual-helpful';
import { HeuristicAgent } from '../src/index';
import { answer, expectLegal } from './casual-helpers';
import { askHeuristic, lastReason } from './heuristic-helpers';

import { PROTECT_TEXT, SAFE } from './protect-card';

const COMMANDER = 'Isamaru, Hound of Konda';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 6 }, () => 'Forest');

/** Seat 1 casts Murder at `at` of seat 0, which holds the protection spell and a Forest, and has priority. */
function underRemoval(at: 'commander' | 'bears') {
  const g = scenario()
    .define(SAFE)
    .seat(0)
    .library(...LIBRARY)
    .hand(SAFE.name)
    .battlefield('Forest', 'Forest')
    .battlefield(COMMANDER, { commander: true, label: 'commander' })
    .battlefield(BEARS, { label: 'bears' })
    .seat(1)
    .library(...LIBRARY)
    .hand('Murder')
    .battlefield('Swamp', { count: 3 })
    .at('precombatMain', { active: 1 })
    .build();
  g.act(1).cast('Murder').targets([at]).pay();
  g.act(1).pass();
  return g;
}

describe('reading the text of a protection spell', () => {
  test('the reminder text in parentheses does not make it hostile', () => {
    expect(helpsItsTarget(PROTECT_TEXT)).toBe(true);
  });
});

describe('in response to a removal spell aimed at its permanent', () => {
  test.each(['commander', 'bears'] as const)(
    'the protection spell is cast, aimed at the %s',
    async (at) => {
      const g = underRemoval(at);
      g.expect.pending('priority', 0);
      const agent = new HeuristicAgent({ seed: 1 });
      const action = await askHeuristic(g, agent);
      expect(action).toMatchObject({ kind: 'castSpell', object: g.id(SAFE.name) });
      expect(lastReason(agent)?.reason).toBe('protect-threatened');
      g.choose(action);
      const targets = await answer(g, agent);
      if (targets.kind !== 'chooseTargets') throw new Error('targets expected');
      expect(targets.targets.map((t) => (t.kind === 'object' ? t.id : null))).toEqual([g.id(at)]);
      expectLegal(g, targets);
    },
  );

  test('with nothing threatened, the spell is held', async () => {
    const g = scenario()
      .define(SAFE)
      .seat(0)
      .library(...LIBRARY)
      .hand(SAFE.name)
      .battlefield('Forest', 'Forest')
      .battlefield(COMMANDER, { commander: true })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Swamp', { count: 3 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).pass();
    const action = await askHeuristic(g);
    expect(action.kind).not.toBe('castSpell');
  });
});
