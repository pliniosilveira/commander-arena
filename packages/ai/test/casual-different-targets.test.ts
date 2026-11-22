// "Put a -1/-1 counter on target creature, two on another target creature, and three on a third"
// (`differentFrom` / `differentFromAll`, CR 115.3, D-151): every slot has a minimum of 1, so the agent
// must name a different creature in each. It once ranked each slot on its own, named the best creature
// three times, and `withOtherTargets` dropped the repeats: the engine refused the one target left
// ("Choose 1 to 1 targets for t2"; casual, 4 seats, precons, seed 4, issue 453).
import type { ChosenTarget, TargetsDecision } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { chooseTargets } from '../src/casual-choices';

test('three slots that must differ get three different creatures', () => {
  const g = scenario()
    .seat(0)
    .battlefield('Swamp')
    .library('Swamp', { count: 4 })
    .seat(1)
    .battlefield('Grizzly Bears', 'Grizzly Bears', 'Grizzly Bears')
    .library('Swamp', { count: 4 })
    .build();
  const view = g.view(0);
  const ids = view.battlefield.filter((o) => o.name === 'Grizzly Bears').map((o) => o.id);
  expect(ids).toHaveLength(3);
  const legal = (specId: string): ChosenTarget[] =>
    ids.map((id) => ({ kind: 'object', id, specId }));
  const what = { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } };
  const decision = {
    kind: 'targets',
    seat: 0,
    source: ids[0],
    specs: [
      { specId: 't1', min: 1, max: 1, target: { id: 't1', what }, legal: legal('t1') },
      {
        specId: 't2',
        min: 1,
        max: 1,
        differentFrom: 't1',
        target: { id: 't2', what, differentFrom: 't1' },
        legal: legal('t2'),
      },
      {
        specId: 't3',
        min: 1,
        max: 1,
        differentFrom: 't2',
        differentFromAll: ['t1'],
        target: { id: 't3', what, differentFrom: 't2', alsoDifferentFrom: ['t1'] },
        legal: legal('t3'),
      },
    ],
    id: 'd1',
  } as unknown as TargetsDecision;
  const action = chooseTargets(view, decision);
  if (action.kind !== 'chooseTargets') throw new Error('expected chooseTargets');
  expect(action.targets.map((t) => t.specId)).toEqual(['t1', 't2', 't3']);
  const named = action.targets.map((t) => (t.kind === 'object' ? t.id : ''));
  expect(new Set(named).size).toBe(3);
});
