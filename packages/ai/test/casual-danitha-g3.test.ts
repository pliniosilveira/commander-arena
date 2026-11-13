// CasualAgent and HeuristicAgent on the cards of group 3 of the Danitha deck (D-1230 to D-1237, provisional), on real engine states built with the scenario DSL:
//   - "Destroy all creatures that aren't enchanted": cast only when the opponent loses more creatures than the agent (the enchanted creatures of both sides are spared);
//   - a cost that is cheaper for the enchanted creature ("Aura spells you cast that target enchanted creature cost {3} less", "Equip abilities ... cost {3} less"): when the agent can pay
//     only with the reduction the engine offers only the enchanted creature as a target, so the answer it gives is one the engine lists and can complete.
import { getLegalActions, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, HeuristicAgent } from '../src/index';
import { answer, answerFor, expectLegal } from './casual-helpers';
import { askHeuristic } from './heuristic-helpers';

const PURGE = 'SYNTHETIC Bare Purge';
const SPINE = 'SYNTHETIC Strong Spine Aura';
const COSTLY = 'SYNTHETIC Costly Blade';
const MIGHT = 'SYNTHETIC Might Aura';
const WINGS = 'SYNTHETIC Wings Aura';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';
const VANILLA = 'SYNTHETIC Vanilla 3/3';
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

describe('"Destroy all creatures that aren\'t enchanted. They can\'t be regenerated."', () => {
  /** Seat 0 holds the sorcery with five Plains; `mine` and `theirs` are creatures, each with an Aura when its name is in `enchanted`. */
  const game = (
    mine: readonly string[],
    theirs: readonly string[],
    enchanted: readonly string[],
  ) => {
    let b = scenario()
      .define(syntheticCard(PURGE))
      .seat(0)
      .library(...LIBRARY)
      .hand(PURGE)
      .battlefield('Plains', { count: 5 });
    for (const [i, name] of mine.entries()) b = b.battlefield(name, { label: `mine${i}` });
    b = b.seat(1).library(...LIBRARY);
    for (const [i, name] of theirs.entries()) b = b.battlefield(name, { label: `theirs${i}` });
    for (const label of enchanted) b = b.battlefield(WINGS, { attachedTo: label });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('the opponent has more creatures without an Aura than the agent: it casts it', async () => {
    const g = game([BEARS], [SPIDER, ELVES], []);
    const action = await answerFor(g);
    expect(action).toMatchObject({ kind: 'castSpell', object: g.id(PURGE) });
    expectLegal(g, action);
  });

  test('its own creature has an Aura and the opponent has one without: it casts it', async () => {
    const g = game([BEARS], [SPIDER], ['mine0']);
    expect(await answerFor(g)).toMatchObject({ kind: 'castSpell' });
  });

  test('the opponent creatures all have an Aura, the agent has one without: it holds the spell', async () => {
    const g = game([BEARS], [SPIDER, ELVES], ['theirs0', 'theirs1']);
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
    expect(await askHeuristic(g, new HeuristicAgent({ seed: 1 }))).not.toMatchObject({
      kind: 'castSpell',
      object: g.id(PURGE),
    });
  });

  test('an equal number without an Aura is no gain: it holds the spell', async () => {
    const g = game([BEARS], [SPIDER], []);
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
  });
});

describe('a cost that is cheaper for the enchanted creature', () => {
  test('an Aura spell it can pay only for the enchanted creature is aimed at it, and the answer is listed', async () => {
    const g = scenario()
      .define(syntheticCard(SPINE))
      .seat(0)
      .library(...LIBRARY)
      .hand(MIGHT)
      .battlefield('Forest', { count: 1 })
      .battlefield(VANILLA, { label: 'vanilla' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPINE, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    const cast = await answerFor(g);
    expect(cast).toMatchObject({ kind: 'castSpell', object: g.id(MIGHT) });
    expectLegal(g, cast);
    g.choose(cast);
    g.expect.pending('targets', 0);
    const picked = await answer(g);
    // The strongest creature (the 3/3) is not a legal target: with one Forest only the Bears give the {G}.
    expect(picked).toMatchObject({ kind: 'chooseTargets' });
    if (picked.kind !== 'chooseTargets') throw new Error('targets expected');
    expect(picked.targets.map((t) => (t.kind === 'object' ? t.id : null))).toEqual([g.id('bears')]);
    expectLegal(g, picked);
    g.choose(picked);
    g.expect.pending('payMana', 0);
  });

  test('an Equip it can pay only for the enchanted creature goes to that creature, for the HeuristicAgent too', async () => {
    const make = () =>
      scenario()
        .define(syntheticCard(SPINE))
        .seat(0)
        .library(...LIBRARY)
        .battlefield('Forest', { count: 1 })
        .battlefield(COSTLY)
        .battlefield(VANILLA, { label: 'vanilla' })
        .battlefield(BEARS, { label: 'bears' })
        .battlefield(SPINE, { attachedTo: 'bears' })
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0 })
        .build();
    for (const agent of [new CasualAgent({ seed: 1 }), new HeuristicAgent({ seed: 1 })]) {
      const g = make();
      const equip = getLegalActions(g.state, 0).find(
        (a) => a.kind === 'activate' && a.object === g.id(COSTLY),
      );
      expect(equip, 'the Equip is offered with one Forest').toBeDefined();
      if (equip === undefined) throw new Error('no equip');
      g.choose(equip);
      g.expect.pending('targets', 0);
      const picked = await answer(g, agent);
      expect(picked).toMatchObject({ kind: 'chooseTargets' });
      if (picked.kind !== 'chooseTargets') throw new Error('targets expected');
      expect(picked.targets.map((t) => (t.kind === 'object' ? t.id : null))).toEqual([
        g.id('bears'),
      ]);
      expectLegal(g, picked);
    }
  });
});
