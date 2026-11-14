// A discard cost on Ward and on an activated ability (D-095): "Ward—Discard a card.", "Discard a
// card: This creature gets +1/+1 until end of turn."
// Pins: CR 702.21a (Ward: counter the spell or ability unless that player pays the cost), CR 118.3
// (a cost that can't be paid isn't paid: with too few cards the spell is countered, nobody asked),
// CR 701.9 (Discard: the player chooses the cards unless the whole hand goes), CR 602.2b (the
// activation is paid like a spell's cost; cancel rewinds it, CR 733), CR 118.12 (a player who
// accepts pays the whole cost). Cards are SYNTHETIC (src/cards/fixtures/synthetic-costs.ts).
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';

const GUARD = 'SYNTHETIC Tithe Warded Guard';
const BEAR = 'SYNTHETIC Scavenger Bear';
const BOLT = 'Lightning Bolt';
const WARD_ABILITY = `${GUARD} (ability)`;

/** Seat 0 holds a Bolt and `rest` more cards; seat 1 has the ward guard. */
function warded(...rest: string[]) {
  return scenario()
    .seat(0)
    .hand(BOLT, ...rest)
    .battlefield('Mountain')
    .seat(1)
    .battlefield(GUARD)
    .build();
}

describe('Ward—Discard a card (CR 702.21a)', () => {
  test('the question names the cost; accepting asks which card, and the spell resolves', () => {
    const g = warded('Forest', 'Island', 'Plains');
    g.act(0).cast(BOLT, { targets: [GUARD], pay: true });
    g.expect.stack([WARD_ABILITY, BOLT]);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    const q = g.state.pending;
    if (q?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(q).toMatchObject({ purpose: 'ward', cost: [{ kind: 'discard', count: 1 }] });
    g.act(0).accept();
    const d = chooseCardsDecision(g);
    expect(d).toMatchObject({ purpose: 'discard', zone: 'hand', min: 1, max: 1, seat: 0 });
    expect(d.forCost).toBeUndefined();
    expect(d.legal).toHaveLength(3);
    // The payer already accepted: there is no way back from the discard.
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(false);
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.stack([BOLT]);
    g.expect.noEvent({ kind: 'countered' });
    g.passAll();
    g.expect.zone(GUARD, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('declining counters the spell and keeps the cards', () => {
    const g = warded('Forest', 'Island');
    g.act(0).cast(BOLT, { targets: [GUARD], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.eventLog([{ kind: 'countered' }]);
    g.expect.handSize(0, 2);
    g.expect.zone(GUARD, 'battlefield', { seat: 1 });
  });

  test('exactly one card in hand: it is discarded without a question', () => {
    const g = warded('Forest');
    g.act(0).cast(BOLT, { targets: [GUARD], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'discarded', seat: 0 }]);
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.zone(GUARD, 'graveyard', { seat: 1 });
  });

  test('an empty hand cannot pay: the spell is countered at once and nobody is asked', () => {
    const g = warded();
    g.act(0).cast(BOLT, { targets: [GUARD], pay: true });
    g.passAll();
    g.expect.eventLog([{ kind: 'countered' }]);
    g.expect.pending('priority');
    g.expect.zone(GUARD, 'battlefield', { seat: 1 });
  });

  test('the choice must be one card from the payer’s hand', () => {
    const g = warded('Forest', 'Island');
    g.act(0).cast(BOLT, { targets: [GUARD], pay: true });
    g.passAll();
    g.act(0).accept();
    const forest = g.id('Forest');
    const island = g.id('Island');
    expect(applyAction(g.state, 0, { kind: 'chooseCards', objects: [forest, island] }).ok).toBe(
      false,
    );
    expect(applyAction(g.state, 1, { kind: 'chooseCards', objects: [forest] }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'chooseCards', objects: [forest] }).ok).toBe(true);
  });

  test('an ability that targets the guard asks the same question of its controller', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', 'Island')
      .battlefield('SYNTHETIC Pinger')
      .seat(1)
      .battlefield(GUARD)
      .build();
    g.act(0).activate('SYNTHETIC Pinger', { targets: [GUARD] });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).chooseCards('Forest');
    g.passAll();
    g.expect.damage(GUARD, 1);
  });
});

describe('Discard a card: an ability’s cost (CR 602.2b, 701.9)', () => {
  const bear = (...hand: string[]) =>
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield(BEAR)
      .seat(1)
      .build();

  test('several cards in hand: the controller chooses; the ability goes on the stack paid', () => {
    const g = bear('Forest', 'Island');
    g.act(0).activate(BEAR);
    expect(g.state.casting?.stage).toBe('discard');
    const d = chooseCardsDecision(g);
    expect(d).toMatchObject({ purpose: 'discard', forCost: true, min: 1, max: 1, seat: 0 });
    expect(d.source).toBe(g.state.casting?.object);
    g.act(0).chooseCards('Forest');
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.stack([`${BEAR} (ability)`]);
    g.expect.eventLog([{ kind: 'discarded', seat: 0 }, { kind: 'abilityActivated' }]);
    g.passAll();
    g.expect.pt(BEAR, 3, 3);
    g.expect.invariants();
  });

  test('one card in hand: discarded without a question', () => {
    const g = bear('Forest');
    g.act(0).activate(BEAR);
    g.expect.pending('priority', 0);
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.stack([`${BEAR} (ability)`]);
  });

  test('an empty hand: the ability is not offered and not accepted', () => {
    const g = bear();
    const offered = getLegalActions(g.state, 0).some((a) => a.kind === 'activate');
    expect(offered).toBe(false);
    expect(g.act(0).try.activate(BEAR).ok).toBe(false);
  });

  test('cancelling rewinds the activation: the card stays in the hand', () => {
    const g = bear('Forest', 'Island');
    const before = g.positionHash();
    g.act(0).activate(BEAR);
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(true);
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.handSize(0, 2);
  });

  test('it can be activated again and again while there are cards to discard', () => {
    const g = bear('Forest', 'Island', 'Plains');
    g.act(0).activate(BEAR);
    g.act(0).chooseCards('Forest');
    g.act(0).activate(BEAR);
    g.act(0).chooseCards('Island');
    g.act(0).activate(BEAR);
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.pt(BEAR, 5, 5);
    expect(g.act(0).try.activate(BEAR).ok).toBe(false);
  });
});
