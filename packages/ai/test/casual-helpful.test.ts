// CasualAgent and spells that help their target (src/casual-helpful.ts): a pump or a keyword gain
// goes on the agent's own best creature and is cast only when it has one; a spell that hurts its
// target (a Turn to Frog shape: "loses all abilities and becomes a blue Frog with base power and
// toughness 1/1") still goes on the opponent's creature and is not cast with only our own
// creatures around. The cards are the SYNTHETIC ones of src/cards/fixtures/synthetic-layers.ts,
// in states built with the scenario DSL and answered through the same decision handling the agent
// uses in a game.
import type { Action } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { helpsItsTarget } from '../src/casual-helpful';
import { answer } from './casual-helpers';

const GROWTH = 'SYNTHETIC Growth Spurt';
const FROG = 'SYNTHETIC Frog Hex';
const WINGS = 'SYNTHETIC Gust of Wings';
const SMALL = 'SYNTHETIC Vanilla 2/2';
const BIG = 'SYNTHETIC Vanilla 5/5';

/** The name of the creature a chooseTargets answer names, with its controller. */
function chosen(g: ScenarioGame, action: Action): { name: string; controller: number }[] {
  if (action.kind !== 'chooseTargets')
    throw new Error(`expected chooseTargets, got ${action.kind}`);
  return action.targets.map((t) => {
    if (t.kind !== 'object') throw new Error('expected an object target');
    const o = g.view(0).battlefield.find((b) => b.id === t.id);
    if (o === undefined) throw new Error('target not on the battlefield');
    return { name: o.name, controller: o.controller };
  });
}

function game(
  hand: string,
  mine: string[],
  theirs: string[],
  mana = ['Forest', 'Island', 'Island'],
) {
  const b = scenario()
    .seat(0)
    .hand(hand)
    .battlefield(...mana);
  for (const name of mine) b.battlefield(name);
  b.seat(1);
  for (const name of theirs) b.battlefield(name);
  return b.build();
}

describe('what reads as helping', () => {
  test.each([
    ['Target creature gets +3/+3 until end of turn.', true],
    ['Target creature gains flying until end of turn.', true],
    ['Target creature gets +2/+2 and gains first strike until end of turn.', true],
    ['Target creature gets -2/-2 until end of turn.', false],
    ['Target creature gets +2/-2 until end of turn.', false],
    ['Target creature loses all abilities and becomes a blue Frog.', false],
    ['Destroy target creature.', false],
    ['Tap target creature.', false],
    ['~ deals 3 damage to target creature.', false],
    ['Draw a card.', false],
  ])('%s', (text, helps) => {
    expect(helpsItsTarget(text)).toBe(helps);
  });
});

describe('where a helpful spell goes', () => {
  test('Giant Growth goes on the agent own best creature, not on the opponent bigger one', async () => {
    const g = game(GROWTH, [SMALL, 'SYNTHETIC Vanilla 3/3'], [BIG]);
    g.act(0).cast(GROWTH);
    expect(chosen(g, await answer(g))).toEqual([{ name: 'SYNTHETIC Vanilla 3/3', controller: 0 }]);
  });

  test('a keyword gain goes on the agent own creature too', async () => {
    const g = game(WINGS, [SMALL], [BIG]);
    g.act(0).cast(WINGS);
    expect(chosen(g, await answer(g))).toEqual([{ name: SMALL, controller: 0 }]);
  });

  test('Turn to Frog goes on the opponent best creature, never on the agent own', async () => {
    const g = game(FROG, [SMALL], [BIG, 'SYNTHETIC Vanilla 3/3']);
    g.act(0).cast(FROG);
    expect(chosen(g, await answer(g))).toEqual([{ name: BIG, controller: 1 }]);
  });
});

describe('whether a helpful or hostile spell is cast at all', () => {
  const casts = async (g: ScenarioGame, name: string): Promise<boolean> => {
    const action = await answer(g);
    const view = g.view(0);
    const hand = view.seats[0]?.hand ?? [];
    return action.kind === 'castSpell' && hand.find((o) => o.id === action.object)?.name === name;
  };

  test('Giant Growth is cast with a creature of our own, and not with only the opponent creatures', async () => {
    expect(await casts(game(GROWTH, [SMALL], [BIG]), GROWTH)).toBe(true);
    expect(await casts(game(GROWTH, [], [BIG]), GROWTH)).toBe(false);
  });

  test('Turn to Frog is cast against an opposing creature, and not with only our own', async () => {
    expect(await casts(game(FROG, [SMALL], [BIG]), FROG)).toBe(true);
    expect(await casts(game(FROG, [SMALL], []), FROG)).toBe(false);
  });
});
