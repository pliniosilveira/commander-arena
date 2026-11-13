// CasualAgent and HeuristicAgent on the cards of group 5 of the Danitha deck (D-1250 to D-1253, provisional), on real engine states built with the scenario DSL:
//   - "Blight 1" as the cost of an ability (a `choosePermanent` of purpose `blight`): the creature that suffers least gets the -1/-1 counter, and the answer is one the engine lists;
//   - "Whenever a creature enters, you may attach this Aura to that creature": the Aura goes onto the agent's own new creature, never onto an opponent's;
//   - "You may cast this spell as though it had flash if it targets a commander": held up for the opponent's removal of the agent's commander, otherwise cast like any Aura;
//   - "Search your library for an enchantment card, reveal it, then shuffle and put that card on top": a search answered with a card the engine lists.
import { syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { answer, answerFor, expectLegal } from './casual-helpers';
import { askHeuristic, lastReason } from './heuristic-helpers';

const BLIGHT = 'SYNTHETIC Blighting Aura';
const WANDERING = 'SYNTHETIC Wandering Aura';
const WARD = 'SYNTHETIC Warding Aura';
const GROVE = 'SYNTHETIC Grove Warden';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const COMMANDER = 'Isamaru, Hound of Konda';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

describe('which creature takes the -1/-1 counter of a blight cost', () => {
  const blightGame = (...mine: readonly string[]) =>
    scenario()
      .define(syntheticCard(BLIGHT))
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Plains', { count: 2 })
      .battlefield(...mine)
      .battlefield(BLIGHT, { attachedTo: 'theirBears' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirBears' })
      .at('precombatMain', { active: 0 })
      .build();

  test('a creature that survives it goes before one that would die, and the answer is listed', async () => {
    const g = blightGame(ELVES, SPIDER);
    g.act(0).activate(BLIGHT, { pay: true });
    g.expect.pending('choosePermanent', 0);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'choosePermanents', objects: [g.id(SPIDER)] });
    expectLegal(g, action);
    g.choose(action);
    g.expect.counters(SPIDER, { '-1/-1': 1 });
  });

  test('among creatures that all survive, the one it wants least: the cheaper card', async () => {
    const g = scenario()
      .define(syntheticCard(BLIGHT))
      .seat(0)
      .library(...LIBRARY)
      .battlefield('Plains', { count: 2 })
      .battlefield(SPIDER, { label: 'spider' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(BLIGHT, { attachedTo: 'theirBears' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirBears' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(BLIGHT, { pay: true });
    const action = await answer(g);
    expect(action).toEqual({ kind: 'choosePermanents', objects: [g.id('bears')] });
    expectLegal(g, action);
  });

  test('the HeuristicAgent and a random agent answer with a listed action too', async () => {
    const g = blightGame(ELVES, SPIDER);
    g.act(0).activate(BLIGHT, { pay: true });
    const heuristic = await answer(g, new HeuristicAgent({ seed: 1 }));
    expectLegal(g, heuristic);
    const random = await answer(g, new RandomLegalAgent({ seed: 3 }));
    expectLegal(g, random);
  });
});

describe('"Whenever a creature enters, you may attach this Aura to that creature"', () => {
  const entering = (own: boolean) =>
    scenario()
      .define(syntheticCard(WANDERING))
      .seat(0)
      .library(...LIBRARY)
      .hand(...(own ? [ELVES] : []))
      .battlefield(own ? 'Forest' : 'Plains')
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(WANDERING, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .hand(...(own ? [] : [ELVES]))
      .battlefield(own ? 'Plains' : 'Forest')
      .at('precombatMain', { active: own ? 0 : 1 })
      .build();

  test('a creature of its own enters: it moves the Aura onto it', async () => {
    const g = entering(true);
    g.act(0).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, action);
  });

  test('a creature of the opponent enters: it keeps the Aura where it is', async () => {
    const g = entering(false);
    g.act(1).cast(ELVES, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const action = await answer(g);
    expect(action).toEqual({ kind: 'declineOptional' });
    expectLegal(g, action);
  });

  test('the HeuristicAgent answers the same way', async () => {
    const own = entering(true);
    own.act(0).cast(ELVES, { pay: true });
    own.passAll();
    expect(await answer(own, new HeuristicAgent({ seed: 1 }))).toEqual({ kind: 'acceptOptional' });
    const theirs = entering(false);
    theirs.act(1).cast(ELVES, { pay: true });
    theirs.passAll();
    expect(await answer(theirs, new HeuristicAgent({ seed: 1 }))).toEqual({
      kind: 'declineOptional',
    });
  });
});

describe('"You may cast this spell as though it had flash if it targets a commander"', () => {
  /** Seat 1 casts Murder at the commander of seat 0 (or at its Bears) in its own main phase; seat 0 holds the Aura and three Plains and has priority. */
  const underRemoval = (at: 'commander' | 'bears') => {
    const g = scenario()
      .define(syntheticCard(WARD))
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains', { count: 3 })
      .battlefield(COMMANDER, { commander: true, label: 'commander' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder').targets([at]).pay();
    // The caster has priority first; it passes, and the agent of seat 0 is asked.
    g.act(1).pass();
    return g;
  };

  test('in response to a removal of its commander it casts the Aura on the commander', async () => {
    const g = underRemoval('commander');
    g.expect.pending('priority', 0);
    const action = await answerFor(g);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id(WARD) });
    expectLegal(g, action);
    g.choose(action);
    const targets = await answer(g);
    expect(targets).toMatchObject({ kind: 'chooseTargets' });
    if (targets.kind !== 'chooseTargets') throw new Error('targets expected');
    expect(targets.targets.map((t) => (t.kind === 'object' ? t.id : null))).toEqual([
      g.id('commander'),
    ]);
    expectLegal(g, targets);
  });

  test('the HeuristicAgent does the same, with the reason protect-commander', async () => {
    const g = underRemoval('commander');
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id(WARD) });
    expect(lastReason(agent)?.reason).toBe('protect-commander');
  });

  test('a removal of another creature does not make it cast the Aura', async () => {
    const g = underRemoval('bears');
    g.expect.pending('priority', 0);
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
    expect(await askHeuristic(g, new HeuristicAgent({ seed: 1 }))).toEqual({ kind: 'pass' });
  });

  test('with nothing on the stack in the opponent turn it holds the Aura', async () => {
    const g = scenario()
      .define(syntheticCard(WARD))
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains', { count: 3 })
      .battlefield(COMMANDER, { commander: true })
      .seat(1)
      .library(...LIBRARY)
      .at('upkeep', { active: 1, priority: 0 })
      .build();
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
  });

  test('in its own main phase it casts the Aura like any other', async () => {
    const g = scenario()
      .define(syntheticCard(WARD))
      .seat(0)
      .library(...LIBRARY)
      .hand(WARD)
      .battlefield('Plains', { count: 3 })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    const action = await answerFor(g);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id(WARD) });
  });
});

describe('the search that puts the card on top', () => {
  test('the agents answer the search with a card the engine lists', async () => {
    const g = scenario()
      .seat(0)
      .library('SYNTHETIC Might Aura', 'SYNTHETIC Wings Aura', ...LIBRARY)
      .battlefield(GROVE, 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(GROVE, { pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    for (const agent of [
      new CasualAgent({ seed: 1 }),
      new HeuristicAgent({ seed: 1 }),
      new RandomLegalAgent({ seed: 5 }),
    ]) {
      const action = await answer(g, agent);
      expectLegal(g, action);
    }
    const casual = await answer(g);
    expect(casual).toMatchObject({ kind: 'chooseCards' });
    if (casual.kind !== 'chooseCards') throw new Error('cards expected');
    expect(casual.objects).toHaveLength(1);
  });
});
