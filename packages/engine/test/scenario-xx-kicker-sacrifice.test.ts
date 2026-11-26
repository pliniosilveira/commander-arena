// A kicker cost that is a sacrifice ("Kicker—Sacrifice a creature."): CR 702.33a (paid by the
// rules for additional costs, 601.2b and 601.2f-h), CR 118.8 (additional costs), CR 701.21a
// (sacrifice), CR 118.3 (a cost that can't be paid isn't paid, so the kicker is not offered),
// CR 603.10a (a creature that dies as a cost still triggers), CR 733 (cancel rewinds the cast).
// The card is SYNTHETIC (src/cards/fixtures/synthetic-kicker.ts).
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, getView, SYNTHETIC_CARDS, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { choosePermanentDecision, confirmOptionalDecision } from './pending-helpers';

const CARD = 'SYNTHETIC Kicker Sacrifice Draw';

const game = (...creatures: string[]) =>
  scenario()
    .seat(0)
    .hand(CARD)
    .battlefield('Swamp', { count: 2 })
    .battlefield(...creatures)
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .seat(1)
    .build();

describe('a kicker cost that sacrifices a permanent (CR 702.33a)', () => {
  test('the synthetic card is valid and runnable', () => {
    expect(validateCard(SYNTHETIC_CARDS[CARD] as never)).toEqual([]);
  });

  test('the kicker question names the sacrifice, asked before anything is paid', () => {
    const g = game('Grizzly Bears');
    g.act(0).cast(CARD);
    const d = confirmOptionalDecision(g);
    expect(d.purpose).toBe('kicker');
    expect(d.cost).toEqual([{ kind: 'sacrifice', what: { types: ['creature'] } }]);
    expect(g.find({ name: 'Swamp' }).filter((o) => o.tapped)).toHaveLength(0);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });

  test('accepting pays the mana, then the caster chooses what to sacrifice (CR 601.2f-h)', () => {
    const g = game('Grizzly Bears', 'Llanowar Elves');
    g.act(0).cast(CARD);
    g.act(0).accept();
    // The total cost is the mana cost alone: the kicker adds no mana.
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['1', 'B']);
    g.act(0).payAuto();
    expect(g.state.casting?.stage).toBe('sacrifice');
    const d = choosePermanentDecision(g);
    expect(d).toMatchObject({ purpose: 'sacrifice', forCost: true, min: 1, max: 1, seat: 0 });
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    expect(getView(g.state, 0).stack[0]?.kicked).toBe(true);
    g.expect.stack([CARD]);
    g.passAll();
    // Kicked: three cards instead of one.
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });

  test('with one candidate the engine chooses it and says so', () => {
    const g = game('Grizzly Bears');
    g.act(0).cast(CARD, { kicked: true, pay: true });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'permanentsChosen', automatic: true, purpose: 'sacrifice' }], {
      since: 0,
    });
  });

  test('declining the kicker sacrifices nothing and does the unkicked effect', () => {
    const g = game('Grizzly Bears');
    g.act(0).cast(CARD, { kicked: false, pay: true });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('with no creature to sacrifice the kicker is not offered (CR 118.3)', () => {
    const g = game();
    g.act(0).cast(CARD);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.act(0).payAuto();
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('only the caster’s own permanents can be sacrificed, whatever the seat count (CR 701.21a)', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .hand(CARD)
      .battlefield('Swamp', { count: 2 })
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Llanowar Elves')
      .seat(2)
      .battlefield('Llanowar Elves')
      .build();
    g.act(0).cast(CARD, { kicked: true, pay: true });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    expect(g.find({ name: 'Llanowar Elves', zone: 'battlefield' })).toHaveLength(2);
  });

  test('the opponents’ creatures alone are no reason to offer it', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .hand(CARD)
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .battlefield('Llanowar Elves')
      .seat(2)
      .build();
    g.act(0).cast(CARD);
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
  });

  test('cancelling at the sacrifice question rewinds the whole cast, mana included (CR 733)', () => {
    const g = game('Grizzly Bears', 'Llanowar Elves');
    g.act(0).cast(CARD);
    g.act(0).accept();
    g.act(0).payAuto();
    expect(g.state.pending?.kind).toBe('choosePermanent');
    g.act(0).cancel();
    g.expect.zone(CARD, 'hand', { seat: 0 });
    expect(g.find({ name: 'Swamp' }).filter((o) => o.tapped)).toHaveLength(0);
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the sacrifice question is the caster’s: another seat cannot answer it', () => {
    const g = game('Grizzly Bears', 'Llanowar Elves');
    g.act(0).cast(CARD, { kicked: true, pay: true });
    const elves = g.id('Llanowar Elves');
    expect(applyAction(g.state, 1, { kind: 'choosePermanents', objects: [elves] }).ok).toBe(false);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });
});
