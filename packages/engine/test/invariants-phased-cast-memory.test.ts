// What a permanent remembers of the spell it came from (the zone it was cast from, the X, being kicked) survives phasing out (CR 702.26b: a phased-out permanent is treated as though
// it does not exist but stays as it was), so `checkInvariants` must accept it there and still reject it on a card that is not a permanent. The states are built by hand.
import { describe, expect, test } from 'vitest';
import type { Zone } from '../src/ast/types';
import type { ObjectId } from '../src/ids';
import { checkInvariants } from '../src/index';
import { addToZone, isSeatZone, removeFromZone, setObject } from '../src/state/ops';
import type { GameObject, GameState } from '../src/state/types';
import { scenario } from '../src/testing/index';

const CUB = 'SYNTHETIC Strider Cub'; // multikicker {1}: a permanent with kicker
const HYDRA = 'SYNTHETIC Hydra Cub'; // enters with X +1/+1 counters

function withMemory(card: string, memory: Partial<GameObject>, zone: Zone) {
  const g = scenario().seat(0).battlefield(card, { label: 'perm' }).seat(1).build();
  const id: ObjectId = g.id('perm');
  const obj = g.state.objects[id];
  if (obj === undefined) throw new Error(`no object ${id}`);
  // Move the object properly: out of its zone list and into the new one, so only what it remembers can be wrong.
  // A card in a graveyard, a hand or a library has an owner; the shared zones have none.
  const zoneOwner = isSeatZone(zone) ? 0 : null;
  const moved = addToZone(removeFromZone(g.state, obj), zone, zoneOwner, id);
  const state: GameState = setObject(moved, {
    ...obj,
    ...memory,
    zone,
    zoneOwner,
  } as GameObject);
  return checkInvariants(state);
}

describe('a phased-out permanent keeps what it remembers of its spell', () => {
  test('the zone it was cast from (CR 601.2a)', () => {
    expect(withMemory(CUB, { castFrom: 'command' }, 'phased')).toEqual([]);
  });

  test('being kicked (CR 702.33d)', () => {
    expect(withMemory(CUB, { kicked: true, kicks: 1 }, 'phased')).toEqual([]);
  });

  test('the X of its spell (CR 107.3m)', () => {
    expect(withMemory(HYDRA, { castX: 2 }, 'phased')).toEqual([]);
  });
});

describe('a card that is not a permanent remembers none of it', () => {
  test.each(['graveyard', 'exile', 'hand'] as const)('the zone it was cast from, in %s', (zone) => {
    expect(withMemory(CUB, { castFrom: 'command' }, zone)).toEqual([
      expect.stringContaining('remembers a cast but is not a permanent'),
    ]);
  });

  test('being kicked, in a graveyard', () => {
    expect(withMemory(CUB, { kicked: true, kicks: 1 }, 'graveyard')).toEqual([
      expect.stringContaining('remembers being kicked'),
    ]);
  });

  test('the X of its spell, in a graveyard', () => {
    expect(withMemory(HYDRA, { castX: 2 }, 'graveyard')).toEqual([
      expect.stringContaining('remembers the X 2 of a spell'),
    ]);
  });
});
