// "Up to one target creature for each opponent" (`onePerGroup`, CR 601.2c, D-149): a slot of a triggered
// ability takes at most one target of each controller. `chooseSlot` once ignored it and named two
// creatures of the same opponent, which the engine refused (7 refused answers in 40 precon games).
import type { ChosenTarget, TargetsDecision } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { chooseSlot, HARM_BY_DEFAULT } from '../src/casual-triggers';

test('a slot that takes one target per controller gets one of the two creatures of the same opponent', () => {
  const g = scenario()
    .seat(0)
    .battlefield('Swamp')
    .library('Swamp', { count: 4 })
    .seat(1)
    .battlefield('Grizzly Bears', 'Grizzly Bears')
    .library('Swamp', { count: 4 })
    .build();
  const view = g.view(0);
  const bears = view.battlefield.filter((o) => o.name === 'Grizzly Bears');
  expect(bears).toHaveLength(2);
  const legal: ChosenTarget[] = bears.map((o) => ({
    kind: 'object',
    id: o.id,
    specId: 't1',
    group: 1,
  }));
  const slot: TargetsDecision['specs'][number] = {
    specId: 't1',
    min: 0,
    max: 2,
    onePerGroup: true,
    legal,
  } as never;
  expect(chooseSlot(view, slot, HARM_BY_DEFAULT)).toHaveLength(1);
  // Without the restriction both are taken, as before.
  expect(
    chooseSlot(view, { ...slot, onePerGroup: undefined } as never, HARM_BY_DEFAULT),
  ).toHaveLength(2);
});
