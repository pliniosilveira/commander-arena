// SYNTHETIC card. CR 701.12a (Exchange), 613.1b (layer 2), 611.2c, 611.2a, 506.4: a group exchange of control between the controller and one other player.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { controllerOf } from '../src/rules/control';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SWAP = singleFace({
  name: 'SYNTHETIC Mass Swap',
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'test',
  spell: {
    targets: [{ id: 'p1', what: { kind: 'player', filter: 'opponent' } }],
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'exchangeControlOfAll',
          objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
          player: { kind: 'target', id: 'p1' },
          duration: 'untilEndOfTurn',
        },
        {
          kind: 'grantKeyword',
          objects: { kind: 'moved' },
          keyword: { kind: 'haste' },
          duration: 'untilEndOfTurn',
        },
      ],
    },
  },
});

const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const ISAMARU = 'Isamaru, Hound of Konda';
const ctl = (g: ScenarioGame, name: string) => {
  const [found] = g.find({ name, zone: 'battlefield' });
  if (found === undefined) throw new Error(`${name} missing`);
  return controllerOf(g.state, found);
};

describe('exchange control of all (CR 701.12a, 613.1b)', () => {
  test('valid', () => {
    expect(validateCard(SWAP)).toEqual([]);
  });

  test('swaps the creatures of you and the target opponent, leaves a third player alone, gives haste, and ends with the turn', () => {
    const g = scenario({ seats: 3 })
      .define(SWAP)
      .seat(0)
      .hand(SWAP.name)
      .battlefield('Island', ANGEL)
      .seat(1)
      .battlefield(BEARS)
      .seat(2)
      .battlefield(ISAMARU)
      .at('precombatMain')
      .build();
    g.act(0).cast(SWAP.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(ctl(g, ANGEL)).toBe(1);
    expect(ctl(g, BEARS)).toBe(0);
    expect(ctl(g, ISAMARU)).toBe(2);
    const view = g.view(0).battlefield;
    for (const name of [ANGEL, BEARS]) {
      expect(view.find((o) => o.name === name)?.keywords).toContain('haste');
    }
    expect(view.find((o) => o.name === ISAMARU)?.keywords ?? []).not.toContain('haste');
    g.expect.invariants();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(ctl(g, ANGEL)).toBe(0);
    expect(ctl(g, BEARS)).toBe(1);
    expect(ctl(g, ISAMARU)).toBe(2);
  });

  test('with no creature on one side the other group still changes hands', () => {
    const g = scenario()
      .define(SWAP)
      .seat(0)
      .hand(SWAP.name)
      .battlefield('Island', ANGEL)
      .seat(1)
      .build();
    g.act(0).cast(SWAP.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(ctl(g, ANGEL)).toBe(1);
  });
});
