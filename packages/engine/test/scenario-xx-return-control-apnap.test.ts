// "Each player gains control of all creatures they own" with three seats: the per-owner control effects are made in APNAP order
// (CR 101.4, 613.7b), starting with the active player, not in seat number order. Cards are SYNTHETIC (src/cards/fixtures/synthetic-return-control.ts).
import { expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

test('with seat 1 active, the effects get timestamps in the order 1, 2, 0', () => {
  const g = scenario({ seats: 3 })
    .seat(0)
    .life(20)
    .battlefield('Grizzly Bears', { label: 'own0' })
    .library(...FILLER)
    .seat(1)
    .life(20)
    .battlefield('SYNTHETIC Mender of Ownership')
    .battlefield('Grizzly Bears', { label: 'own1' })
    .library(...FILLER)
    .seat(2)
    .life(20)
    .battlefield('Grizzly Bears', { label: 'own2' })
    .library(...FILLER)
    .at('precombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('end');
  g.passAll();
  const order = g.state.continuousEffects
    .filter((e) => e.change.kind === 'control')
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((e) => (e.change.kind === 'control' ? e.change.seat : -1));
  expect(order).toEqual([1, 2, 0]);
});
