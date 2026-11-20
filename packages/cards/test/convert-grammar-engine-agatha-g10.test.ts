// Agatha deck (issue 345), group 10: Claim the Kingdom, "Landfall — Whenever a land you control enters, put a +1/+1 counter on target creature you control and a plan counter on
// ~." and "When the fourth plan counter is put on ~, sacrifice it. When you do, put an indestructible counter on target creature you control."
// Pins: CR 122.6 (counters), CR 603.2 (triggers), CR 603.4 (the fourth counter), CR 701.21a (sacrifice), CR 603.12 (the reflexive "when you do"), CR 702.12 (indestructible counter).
import { scenario } from '@commander-arena/engine/testing';
import { describe, test } from 'vitest';
import { real } from './agatha-helpers';

const CLAIM = real('Claim the Kingdom');
const BEARS = 'Grizzly Bears';

const game = (lands: number) => {
  const b = scenario().define(CLAIM).seat(0).battlefield(CLAIM.name).battlefield(BEARS);
  for (let i = 0; i < lands; i++) b.hand('Forest');
  return b.seat(1).library('Forest').at('precombatMain', { extraLandDrops: 5 }).build();
};

function landfall(g: ReturnType<typeof game>) {
  g.act(0).playLand('Forest[0]');
  g.passAll();
}

describe('Claim the Kingdom', () => {
  test('each land puts a +1/+1 counter on the creature and a plan counter on the enchantment', () => {
    const g = game(2);
    landfall(g);
    g.expect.counters(BEARS, { '+1/+1': 1 });
    g.expect.counters(CLAIM.name, { plan: 1 });
    landfall(g);
    g.expect.counters(BEARS, { '+1/+1': 2 });
    g.expect.counters(CLAIM.name, { plan: 2 });
    g.expect.invariants();
  });

  test('the fourth plan counter sacrifices it and the reflexive ability gives an indestructible counter', () => {
    const g = game(4);
    landfall(g);
    landfall(g);
    landfall(g);
    g.expect.zone(CLAIM.name, 'battlefield', { seat: 0 });
    g.act(0).playLand('Forest[0]');
    g.passAll();
    g.expect.zone(CLAIM.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.counters(BEARS, { '+1/+1': 4, indestructible: 1 });
    g.expect.invariants();
  });
});
