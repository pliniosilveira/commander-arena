// An additional cost paid in one of three ways (CR 118.8, 601.2b): "As an additional cost to cast this spell, sacrifice a creature, discard a card, or pay 4 life."
// The caster is asked yes or no for the first way; declining asks again between the other two. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getLegalActions, getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { confirmOptionalDecision } from './pending-helpers';

const TRIO = 'SYNTHETIC Three Ways';
const BEARS = 'Grizzly Bears';
const trio = singleFace({
  name: TRIO,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'As an additional cost to cast this spell, sacrifice a creature, discard a card, or pay 4 life.\nDraw a card.',
  additionalCostChoice: [
    [{ kind: 'sacrifice', what: { types: ['creature'] } }],
    [{ kind: 'discard', count: 1 }],
    [{ kind: 'payLife', amount: 4 }],
  ],
  spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
});

function game(creature: boolean, extraCard: boolean): ScenarioGame {
  let b = scenario()
    .define(trio)
    .seat(0)
    .hand(TRIO, ...(extraCard ? ['Island'] : []))
    .battlefield('Swamp')
    .library('Plains', 'Plains', 'Plains');
  if (creature) b = b.battlefield(BEARS);
  return b.seat(1).library('Plains', 'Plains', 'Plains').build();
}

describe('a choice of three additional costs', () => {
  test('all three can be paid: the first way is asked first, and the view lists the three', () => {
    const g = game(true, true);
    const card = getView(g.state, 0).seats[0]?.hand.find((o) => o.name === TRIO);
    expect(card?.additionalCostChoice).toHaveLength(3);
    g.act(0).cast(TRIO);
    const d = confirmOptionalDecision(g);
    expect(d.purpose).toBe('costChoice');
    expect(d.cost).toEqual([{ kind: 'sacrifice', what: { types: ['creature'] } }]);
    expect(d.otherCost).toEqual([{ kind: 'discard', count: 1 }]);
    expect(d.moreCost).toEqual([{ kind: 'payLife', amount: 4 }]);
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toEqual([
      'acceptOptional',
      'declineOptional',
      'cancel',
      'concede',
    ]);
  });

  test('accepting the first way sacrifices a creature', () => {
    const g = game(true, true);
    g.act(0).cast(TRIO).additionalCost(true).pay();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.life(0, 40);
  });

  test('declining then accepting is the discard', () => {
    const g = game(true, true);
    const cast = g.act(0).cast(TRIO).additionalCost(false);
    expect(confirmOptionalDecision(g).cost).toEqual([{ kind: 'discard', count: 1 }]);
    expect(confirmOptionalDecision(g).otherCost).toEqual([{ kind: 'payLife', amount: 4 }]);
    cast.additionalCost(true).pay();
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.life(0, 40);
  });

  test('declining twice is the life payment', () => {
    const g = game(true, true);
    g.act(0).cast(TRIO).additionalCost(false).additionalCost(false).pay();
    g.expect.life(0, 36);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone('Island', 'hand', { seat: 0 });
  });

  test('a way that cannot be paid is not offered: with no creature the question is between the other two', () => {
    const g = game(false, true);
    g.act(0).cast(TRIO);
    const d = confirmOptionalDecision(g);
    expect(d.cost).toEqual([{ kind: 'discard', count: 1 }]);
    expect(d.otherCost).toEqual([{ kind: 'payLife', amount: 4 }]);
    expect(d.moreCost).toBeUndefined();
  });

  test('only the life payment: not asked', () => {
    const g = game(false, false);
    const cast = g.act(0).cast(TRIO);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    cast.pay();
    g.expect.life(0, 36);
  });

  test('cancelling at the second question rewinds the cast', () => {
    const g = game(true, true);
    g.act(0).cast(TRIO).additionalCost(false);
    g.act(0).cancel();
    expect(g.state.casting).toBeNull();
    g.expect.zone(TRIO, 'hand', { seat: 0 });
    g.expect.life(0, 40);
  });
});
