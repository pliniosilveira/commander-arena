// CR 611.2, 613.1b: the chosen player, rather than the spell's controller, controls the permanents.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { controllerOf } from '../src/rules/control';
import { getObject } from '../src/state/ops';
import { scenario } from '../src/testing/index';

const WILL = singleFace({
  name: 'SYNTHETIC Target Player Takes Control',
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'test',
  spell: {
    targets: [
      { id: 'p1', what: { kind: 'player', filter: 'any' } },
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: {
      kind: 'gainControl',
      player: { kind: 'target', id: 'p1' },
      objects: { kind: 'target', id: 't1' },
      duration: 'untilEndOfTurn',
    },
  },
});

describe('gain control for a chosen player (CR 611.2, 613.1b)', () => {
  test('gives the chosen player control, even when another player controls the spell', () => {
    const g = scenario()
      .define(WILL)
      .seat(0)
      .hand(WILL.name)
      .battlefield('Island')
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();

    g.act(0).cast(WILL.name, { targets: [{ player: 1 }, 'Grizzly Bears'], pay: true });
    g.passAll();

    const bears = getObject(g.state, g.id('Grizzly Bears'));
    expect(controllerOf(g.state, bears)).toBe(1);
    g.expect.invariants();
  });
});
