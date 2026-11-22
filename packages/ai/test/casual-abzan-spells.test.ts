// The AI's answers to the two choices of the Abzan Armor spells (group C): "Choose a number between 0 and 10" (a `chooseX` decision of purpose `chooseNumber`, Expel the Interlopers, CR 608.2d)
// and "chooses any number of creatures they control with total power 4 or less, then sacrifices all other creatures" (a `choosePermanent` decision of purpose `keep`, Slaughter the Strong,
// CR 608.2d, 701.21a). The spells are SYNTHETIC (written as the engine's AST); the creatures are real fixtures. The engine's own validation judges every answer.
import {
  applyAction,
  type CardDefinition,
  type Effect,
  getLegalActions,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
} from '../src/index';
import { CTX } from './helpers';

/** A SYNTHETIC sorcery whose text is the AST of `effect`. */
function sorcery(name: string, effect: Effect): CardDefinition {
  return {
    oracleId: null,
    name,
    layout: 'normal',
    faces: [
      {
        name,
        manaCost: ['1'],
        supertypes: [],
        types: ['sorcery'],
        subtypes: [],
        colors: [],
        power: null,
        toughness: null,
        loyalty: null,
        defense: null,
        oracleText: 'SYNTHETIC spell.',
        abilities: [],
        spell: { effect },
      },
    ],
    colorIdentity: [],
    support: 'supported',
  };
}

const SWEEP = sorcery('SYNTHETIC AI Number Sweep', {
  kind: 'sequence',
  effects: [
    { kind: 'chooseNumber', min: 0, max: 10 },
    {
      kind: 'destroy',
      objects: {
        kind: 'each',
        filter: { zone: 'battlefield', types: ['creature'], powerAtLeastChosenNumber: true },
      },
    },
  ],
});

const KEEP = sorcery('SYNTHETIC AI Keep Sweep', {
  kind: 'keepOrSacrifice',
  players: { kind: 'eachPlayer' },
  filter: { types: ['creature'] },
  totalPowerAtMost: 4,
});

const agents: readonly (readonly [string, () => Agent])[] = [
  ['casual', () => new CasualAgent({ seed: 1 })],
  ['greedy', () => new GreedyAgent({ seed: 1 })],
  ['heuristic', () => new HeuristicAgent({ seed: 1 })],
  ['random', () => new RandomLegalAgent({ seed: 1 })],
];

async function answerOf(g: ScenarioGame, make: () => Agent, seat = 0) {
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  const action = await make().decide(view, view.pending, CTX);
  // Whatever the agent answers, the engine lists it or at least accepts it.
  expect(applyAction(g.state, seat, action).ok, JSON.stringify(action)).toBe(true);
  return action;
}

describe('"Choose a number between 0 and 10" (Expel the Interlopers)', () => {
  const sweep = (mine: readonly string[], theirs: readonly string[]) => {
    const g = scenario()
      .define(SWEEP)
      .seat(0)
      .hand(SWEEP.name)
      .pool('C')
      .battlefield(...mine)
      .seat(1)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(SWEEP.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseX', 0);
    return g;
  };

  test('every agent answers a number the engine accepts', async () => {
    for (const [, make] of agents) {
      const g = sweep(['Grizzly Bears'], ['Serra Angel']);
      const action = await answerOf(g, make);
      expect(action).toMatchObject({ kind: 'chooseX' });
    }
  });

  test('the casual agent picks the number that kills the big creatures of the opponent and spares its own', async () => {
    // 3 and 4 both kill only the Angel (power 4) and spare the Bears and the Spider (power 2); 2 or less would kill the agent's own Bears too. The highest of the equal numbers is chosen.
    const g = sweep(['Grizzly Bears'], ['Serra Angel', 'Giant Spider']);
    const action = await answerOf(g, () => new CasualAgent({ seed: 1 }));
    expect(action).toEqual({ kind: 'chooseX', value: 4 });
    g.choose(action);
    g.passAll();
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
  });

  test('with only its own creatures to lose it chooses a number that destroys nothing', async () => {
    const g = sweep(['Serra Angel', 'Grizzly Bears'], []);
    const action = await answerOf(g, () => new CasualAgent({ seed: 1 }));
    expect(action).toEqual({ kind: 'chooseX', value: 10 });
  });

  test('the engine lists every number from 0 to 10 and no way back', () => {
    const g = sweep([], []);
    const actions = getLegalActions(g.state, 0);
    expect(actions.filter((a) => a.kind === 'chooseX')).toHaveLength(11);
    expect(actions.some((a) => a.kind === 'cancel')).toBe(false);
  });
});

describe('"Each player chooses any number of creatures they control with total power 4 or less" (Slaughter the Strong)', () => {
  const sweep = (mine: readonly string[], theirs: readonly string[]) => {
    const g = scenario()
      .define(KEEP)
      .seat(0)
      .hand(KEEP.name)
      .pool('C')
      .battlefield(...mine)
      .seat(1)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(KEEP.name, { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', purpose: 'keep', seat: 0 });
    return g;
  };

  test('every agent keeps a set with total power of at most 4', async () => {
    for (const [name, make] of agents) {
      const g = sweep(['Serra Angel', 'Grizzly Bears', 'Llanowar Elves'], ['Grizzly Bears']);
      const action = await answerOf(g, make);
      expect(action, name).toMatchObject({ kind: 'choosePermanents' });
    }
  });

  test('the casual agent keeps the creatures it values most that fit, and the engine sacrifices the rest', async () => {
    const g = sweep(['Serra Angel', 'Grizzly Bears', 'Llanowar Elves'], []);
    const action = await answerOf(g, () => new CasualAgent({ seed: 1 }));
    g.choose(action);
    // The Angel (power 4) is worth the most and uses the whole limit; the others are sacrificed.
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
  });

  test('a creature with 0 power fits beside any others', async () => {
    const g = sweep(['Wall of Stone', 'Serra Angel'], []);
    const action = await answerOf(g, () => new CasualAgent({ seed: 1 }));
    expect(action).toMatchObject({ kind: 'choosePermanents' });
    g.choose(action);
    g.expect.zone('Wall of Stone', 'battlefield', { seat: 0 });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 0 });
  });

  test('the engine lists the sets that fit, the ones that keep the most first, and never one above the limit', () => {
    const g = sweep(['Serra Angel', 'Grizzly Bears', 'Llanowar Elves'], []);
    const kept = getLegalActions(g.state, 0).flatMap((a) =>
      a.kind === 'choosePermanents' ? [a.objects.length] : [],
    );
    expect(kept.length).toBeGreaterThan(0);
    // The Angel alone (4), or the Bears and the Elves (3): never the Angel and another.
    expect(Math.max(...kept)).toBe(2);
    expect(kept[0]).toBe(2);
    for (const a of getLegalActions(g.state, 0)) {
      if (a.kind === 'choosePermanents') {
        expect(applyAction(g.state, 0, a).ok).toBe(true);
      }
    }
  });
});
