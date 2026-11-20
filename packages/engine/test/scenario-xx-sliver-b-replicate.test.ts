// "Each Sliver spell you cast has replicate. The replicate cost is equal to its mana cost." (Sliver Swarm deck, group B): `grantKeywordToSpells` with `replicateAtManaCost`.
// Pins: CR 702.56a (Replicate: the count is asked as the spell is cast and each payment is a copy; the cost is an additional cost), CR 118.9 (the replicate cost equals the mana cost),
// CR 613.1f (an ability given to an object), CR 707.10 (copies are not cast), CR 707.10f (a copy of a permanent spell becomes a token), CR 113.7a (the trigger of the spell stays
// on the stack when the source leaves). Cards are SYNTHETIC (src/cards/fixtures/synthetic-sliver-b.ts, synthetic-copies.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseXDecision } from './pending-helpers';

const HIVE = 'SYNTHETIC Hive Replicator';
const PLAIN = 'SYNTHETIC Plain Sliver'; // {1}
const COSTLY = 'SYNTHETIC Costly Sliver'; // {1}{G}
const VARIABLE = 'SYNTHETIC Variable Sliver'; // {X}{G}
const IMP = 'SYNTHETIC Replicate Imp'; // {1}{R}, replicate {1} of its own
const BEARS = 'Grizzly Bears';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

function game(hand: readonly string[], forests: number, withHive = true): ScenarioGame {
  const b = scenario()
    .define(syntheticCard(PLAIN))
    .define(syntheticCard(COSTLY))
    .define(syntheticCard(VARIABLE))
    .seat(0)
    .library(...FILLER)
    .hand(...hand)
    .battlefield('Forest', { count: forests })
    .battlefield('Mountain', { count: 2 });
  if (withHive) b.battlefield(HIVE);
  return b
    .seat(1)
    .library(...FILLER)
    .build();
}

const slivers = (g: ScenarioGame, name: string) => g.find({ name, zone: 'battlefield' });

describe('the card is valid', () => {
  test(HIVE, () => {
    expect(validateCard(syntheticCard(HIVE))).toEqual([]);
  });
});

describe('"Each Sliver spell you cast has replicate" (CR 702.56a)', () => {
  test('a Sliver spell asks for the replicate count, the cost being its mana cost', () => {
    const g = game([COSTLY], 5);
    g.act(0).cast(COSTLY);
    const d = chooseXDecision(g);
    expect(d.purpose).toBe('replicate');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1', 'G'] }]);
    // 7 lands: {1}{G} for the spell and {1}{G} for each replica, two replicas at most.
    expect(d.max).toBe(2);
  });

  test('paying it twice copies the spell twice and the copies become tokens', () => {
    const g = game([COSTLY], 5);
    g.act(0).cast(COSTLY, { replicas: 2, pay: true });
    g.passAll();
    const all = slivers(g, COSTLY);
    expect(all).toHaveLength(3);
    expect(all.filter((o) => o.token !== null)).toHaveLength(2);
    g.expect.invariants();
  });

  test('paying it no times casts the spell once', () => {
    const g = game([COSTLY], 5);
    g.act(0).cast(COSTLY, { replicas: 0, pay: true });
    g.passAll();
    expect(slivers(g, COSTLY)).toHaveLength(1);
  });

  test('the mana of each payment is the mana cost: the colored mana is needed', () => {
    // One Forest and two Mountains: {1}{G} for the spell uses the Forest, so no replica ({G}) can be paid.
    const g = game([COSTLY], 1);
    g.act(0).cast(COSTLY, { pay: true });
    g.passAll();
    expect(slivers(g, COSTLY)).toHaveLength(1);
  });

  test('a spell that is not a Sliver gets none', () => {
    const g = game([BEARS], 5);
    g.act(0).cast(BEARS);
    expect(getView(g.state, 0).pending?.kind).not.toBe('chooseX');
  });

  test('a Sliver of the opponent gets none: the spells are the ones its controller casts', () => {
    const g = scenario()
      .define(syntheticCard(COSTLY))
      .seat(0)
      .library(...FILLER)
      .battlefield(HIVE)
      .seat(1)
      .library(...FILLER)
      .hand(COSTLY)
      .battlefield('Forest', { count: 5 })
      .at('precombatMain', { active: 1, priority: 1 })
      .build();
    g.act(1).cast(COSTLY);
    expect(getView(g.state, 1).pending?.kind).not.toBe('chooseX');
  });

  test('without the permanent a Sliver has no replicate', () => {
    const g = game([COSTLY], 5, false);
    g.act(0).cast(COSTLY);
    expect(getView(g.state, 0).pending?.kind).not.toBe('chooseX');
  });

  test('a Sliver with {X} in its mana cost gets none (the X is announced after the count)', () => {
    const g = game([VARIABLE], 5);
    g.act(0).cast(VARIABLE);
    const d = chooseXDecision(g);
    expect(d.purpose).not.toBe('replicate');
  });

  test('a spell that prints a replicate cost keeps its own (CR 702.56b)', () => {
    const g = game([IMP], 1);
    g.act(0).cast(IMP);
    const d = chooseXDecision(g);
    expect(d.purpose).toBe('replicate');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1'] }]);
  });

  test('the copies are still made when the permanent dies in response (CR 113.7a, 603.4)', () => {
    const g = scenario()
      .define(syntheticCard(COSTLY))
      .seat(0)
      .library(...FILLER)
      .hand(COSTLY)
      .battlefield('Forest', { count: 7 })
      .battlefield(HIVE)
      .seat(1)
      .library(...FILLER)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).cast(COSTLY, { replicas: 1, pay: true });
    // The trigger is on top of the spell: its controller passes, the opponent kills the permanent that gave replicate.
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', {
      targets: [{ name: HIVE }],
      pay: true,
    });
    g.passAll();
    g.expect.invariants();
    expect(g.find({ name: HIVE, zone: 'battlefield' })).toHaveLength(0);
    expect(slivers(g, COSTLY)).toHaveLength(2);
  });
});
