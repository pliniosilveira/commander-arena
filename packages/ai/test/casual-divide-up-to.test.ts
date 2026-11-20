// CasualAgent and an "up to" division of a triggered ability (src/casual-divide.ts, CR 601.2d, 603.3d): "distribute up to that many +1/+1 counters among any number of other
// target creatures". The card is SYNTHETIC: the engine's divided-damage enterer with the division changed to counters, up to 4, on other creatures.
import { type CardDefinition, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answer } from './casual-helpers';

const base = syntheticCard('SYNTHETIC Divided Enterer');
const face = base.faces[0];
const ability = face?.abilities[0];
if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
const GIVER: CardDefinition = {
  ...base,
  name: 'SYNTHETIC Counter Giver',
  faces: [
    {
      ...face,
      name: 'SYNTHETIC Counter Giver',
      abilities: [
        {
          ...ability,
          targets: [
            {
              id: 't1',
              what: {
                kind: 'object',
                filter: { zone: 'battlefield', types: ['creature'], other: true },
              },
              divide: { total: 4, upTo: true },
            },
          ],
          effect: {
            kind: 'distributeCounters',
            to: { kind: 'target', id: 't1' },
            counter: '+1/+1',
          },
        },
      ],
    },
  ],
} as CardDefinition;
const V22 = 'SYNTHETIC Vanilla 2/2';
const V55 = 'SYNTHETIC Vanilla 5/5';

describe('the agent gives an "up to" division to its own strongest creature', () => {
  const game = (mine: readonly string[]) => {
    const b = scenario()
      .define(GIVER)
      .seat(0)
      .hand(GIVER.name)
      .battlefield('Mountain', { count: 6 });
    for (const [i, name] of mine.entries()) b.battlefield(name, { label: `m${i}` });
    b.seat(1).battlefield(V55, { label: 'theirs' });
    return b.build();
  };

  test('all of it on its strongest creature, never on the opponent', async () => {
    const g = game([V22, V55]);
    g.act(0).cast(GIVER.name, { pay: true });
    g.passAll();
    const action = await answer(g);
    expect(action.kind).toBe('chooseTargets');
    if (action.kind !== 'chooseTargets') return;
    expect(action.targets.map((t) => [t.kind === 'object' ? t.id : -1, t.share])).toEqual([
      [g.id('m1'), 4],
    ]);
    g.act(0).choose(action);
    g.passAll();
    g.expect.counters('m1', { '+1/+1': 4 });
  });

  test('with no creature of its own to help, it chooses no target', async () => {
    const g = game([]);
    g.act(0).cast(GIVER.name, { pay: true });
    g.passAll();
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseTargets', targets: [] });
  });
});
