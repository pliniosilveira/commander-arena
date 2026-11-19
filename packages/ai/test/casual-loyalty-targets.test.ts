// CasualAgent and the targets of an activated ability (CR 606, 115): a planeswalker's "+1: Put a +1/+1 counter on up to one target creature" goes on the agent's own
// creature, not the opponent's (the opponent-first default is for removal). The planeswalker is SYNTHETIC, in the shape of a real one.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { answer } from './casual-helpers';

const NAME = 'SYNTHETIC Counter Walker';
const WALKER: CardDefinition = {
  oracleId: null,
  name: NAME,
  layout: 'normal',
  faces: [
    {
      name: NAME,
      manaCost: ['1', 'W', 'W'],
      supertypes: ['legendary'],
      types: ['planeswalker'],
      subtypes: ['Dack'],
      colors: ['W'],
      power: null,
      toughness: null,
      loyalty: 4,
      defense: null,
      oracleText: '+1: Put a +1/+1 counter on up to one target creature.',
      spell: null,
      abilities: [
        {
          kind: 'activated',
          cost: [{ kind: 'loyalty', change: 1 }],
          effect: {
            kind: 'addCounters',
            objects: { kind: 'target', id: 't1' },
            counter: '+1/+1',
            count: 1,
          },
          targets: [
            {
              id: 't1',
              what: { kind: 'object', filter: { types: ['creature'] } },
              min: 0,
              max: 1,
            },
          ],
        },
      ],
    },
  ],
  colorIdentity: ['W'],
  support: 'supported',
};

test("the +1 counter ability is aimed at the agent's own creature", async () => {
  const g = scenario()
    .seat(0)
    .define(WALKER)
    .battlefield(NAME)
    .battlefield('Grizzly Bears')
    .seat(1)
    .battlefield('Giant Spider')
    .build();
  g.act(0).activate(NAME);
  expect(g.state.pending?.kind).toBe('targets');
  const a = await answer(g);
  const own = g.view(0).battlefield.find((o) => o.name === 'Grizzly Bears');
  expect(a).toMatchObject({ kind: 'chooseTargets', targets: [{ id: own?.id }] });
});
