// CasualAgent answers "As this creature enters, remove all counters from any number of artifacts, creatures, and enchantments" (`purpose` 'entersRemoveCounters', Sin, Unending Cataclysm,
// CR 614.12, 122.1): the counters of its opponents' permanents come off, its own only when they hurt it, and the answer is one the engine accepts. RandomLegalAgent answers with some
// legal choice. The card is a SYNTHETIC probe built here with the abilities of Sin as the engine's AST.
import {
  type Action,
  applyAction,
  type CardDefinition,
  getLegalActions,
  syntheticCard,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

/** The engine's synthetic Vanilla 5/5 with the two as-enters abilities of Sin. */
function sinLike(): CardDefinition {
  const base = syntheticCard('SYNTHETIC Vanilla 5/5');
  const face = base.faces[0];
  if (face === undefined) throw new Error('no face');
  return {
    ...base,
    name: 'SYNTHETIC Sin Probe',
    faces: [
      {
        ...face,
        name: 'SYNTHETIC Sin Probe',
        manaCost: ['1'],
        oracleText:
          'As this creature enters, remove all counters from any number of artifacts, creatures, and enchantments. This creature enters with X +1/+1 counters on it, where X is twice the number of counters removed this way.',
        abilities: [
          {
            kind: 'replacement',
            replacement: {
              kind: 'asEntersRemoveCounters',
              filter: {
                anyOf: [
                  { types: ['artifact'] },
                  { types: ['creature'] },
                  { types: ['enchantment'] },
                ],
              },
            },
          },
          {
            kind: 'replacement',
            replacement: {
              kind: 'entersWithCounters',
              counter: '+1/+1',
              count: { kind: 'countersRemovedAsEntered', times: 2 },
            },
          },
        ],
      },
    ],
  } as CardDefinition;
}

const PROBE = sinLike();
const BEARS = 'Grizzly Bears';
const WALL = 'SYNTHETIC Vanilla 3/3';
const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

function asked(): ScenarioGame {
  const g = scenario({ seats: 3 })
    .define(PROBE)
    .define(syntheticCard(WALL))
    .seat(0)
    .library(...LIBRARY)
    .hand(PROBE.name)
    .battlefield('Forest')
    // Its own creature with +1/+1 counters, and one with a -1/-1 counter: only the second is worth giving up.
    .battlefield(BEARS, { counters: { '+1/+1': 2 } })
    .battlefield(WALL, { counters: { '-1/-1': 1 } })
    .seat(1)
    .library(...LIBRARY)
    // An opponent's creature with a +1/+1 counter (taken), one with only a -1/-1 counter (kept: removing it helps them).
    .battlefield(BEARS, { counters: { '+1/+1': 1 } })
    .battlefield(WALL, { counters: { '-1/-1': 2 } })
    .seat(2)
    .library(...LIBRARY)
    .battlefield('Sol Ring', { counters: { charge: 1 } })
    .build();
  g.act(0).cast(PROBE.name, { pay: true });
  g.passAll();
  return g;
}

async function decide(g: ScenarioGame, agent: CasualAgent | RandomLegalAgent): Promise<Action> {
  const view = g.view(0);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

describe('remove all counters from any number of permanents as it enters', () => {
  test('the casual agent takes the counters of its opponents and its own drawbacks, and keeps its own +1/+1 counters', async () => {
    const g = asked();
    g.expect.pending('choosePermanent', 0);
    const a = await decide(g, new CasualAgent({ seed: 1 }));
    if (a.kind !== 'choosePermanents') throw new Error('expected choosePermanents');
    const named = a.objects.map((id) => {
      const o = g.state.objects[id];
      return `${o?.zone === 'battlefield' ? o.controller : '?'}:${id}`;
    });
    const mine = g.find({ name: BEARS, zone: 'battlefield', seat: 0 })[0];
    const theirs = g.find({ name: BEARS, zone: 'battlefield', seat: 1 })[0];
    const sol = g.find({ name: 'Sol Ring', zone: 'battlefield', seat: 2 })[0];
    const myDrawback = g.find({ name: WALL, zone: 'battlefield', seat: 0 })[0];
    const theirDrawback = g.find({ name: WALL, zone: 'battlefield', seat: 1 })[0];
    expect(a.objects).toContain(theirs?.id);
    expect(a.objects).toContain(sol?.id);
    expect(a.objects).toContain(myDrawback?.id);
    expect(a.objects).not.toContain(mine?.id);
    expect(a.objects).not.toContain(theirDrawback?.id);
    expect(named.length).toBe(3);
    expect(getLegalActions(g.state, 0).length).toBeGreaterThan(0);
    const applied = applyAction(g.state, 0, a);
    expect(applied.ok).toBe(true);
  });

  test('the random agent answers with a choice the engine accepts', async () => {
    const g = asked();
    for (let seed = 1; seed <= 5; seed++) {
      const a = await decide(g, new RandomLegalAgent({ seed }));
      expect(applyAction(g.state, 0, a).ok).toBe(true);
    }
  });
});
