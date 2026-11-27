// A choice made as a permanent entered ("choose a creature type") survives phasing out (CR 702.26b: a phased-out permanent is treated as though it does not exist but stays as it was;
// phasing is not a change of zone, so CR 400.7 does not apply), so `checkInvariants` must accept it there and still reject it on a card that left the battlefield.
// The states are built by hand. Found by the property test of the nightly, which phased out a SYNTHETIC Kin Walker that had chosen Varmint.
import { describe, expect, test } from 'vitest';
import type { Zone } from '../src/ast/types';
import type { ObjectId } from '../src/ids';
import { checkInvariants } from '../src/index';
import { addToZone, isSeatZone, removeFromZone, setObject } from '../src/state/ops';
import type { GameObject, GameState } from '../src/state/types';
import { scenario } from '../src/testing/index';

const WALKER = 'SYNTHETIC Kin Walker'; // as it enters, choose a creature type

function chosenIn(zone: Zone) {
  const g = scenario().seat(0).battlefield(WALKER, { label: 'perm' }).seat(1).build();
  const id: ObjectId = g.id('perm');
  const obj = g.state.objects[id];
  if (obj === undefined) throw new Error(`no object ${id}`);
  const zoneOwner = isSeatZone(zone) ? 0 : null;
  const moved = addToZone(removeFromZone(g.state, obj), zone, zoneOwner, id);
  const state: GameState = setObject(moved, {
    ...obj,
    chosen: { creatureType: 'Varmint' },
    zone,
    zoneOwner,
  } as GameObject);
  return checkInvariants(state);
}

describe('the choice a permanent made as it entered', () => {
  test('is kept while it is on the battlefield', () => {
    expect(chosenIn('battlefield')).toEqual([]);
  });

  test('is kept while it is phased out (CR 702.26b)', () => {
    expect(chosenIn('phased')).toEqual([]);
  });

  test.each(['graveyard', 'exile', 'hand'] as const)(
    'is gone from a card in %s (CR 400.7)',
    (zone) => {
      expect(chosenIn(zone)).toEqual([
        expect.stringContaining('has a choice but is not on the battlefield'),
      ]);
    },
  );
});
