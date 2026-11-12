// A melded permanent leaves the battlefield (CR 712.21; D-991): one permanent leaves and two cards are put into the appropriate zone. "Whenever a creature
// dies" triggers once (CR 712.21 example), and an effect that finds the new object finds both cards (CR 712.21c). The new objects are ordinary cards with
// their front faces (CR 712.8a), each a new object (CR 400.7) with no counters and no damage. Cards are SYNTHETIC (src/cards/fixtures/synthetic-meld.ts).
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';
import { scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';
import { settle } from './meld-helpers';

const DUSK = 'SYNTHETIC Dusk Squire';
const DAWN = 'SYNTHETIC Dawn Squire';
const WATCHER = 'SYNTHETIC Meld Watcher'; // a creature dies +1 life, leaves the battlefield +10, a creature enters +100
const EXILE = 'SYNTHETIC Meld Exile';
const TUCK = 'SYNTHETIC Meld Tuck';
const FLICKER = 'SYNTHETIC Delayed Flicker'; // exile target creature or land you control, return it at the next end step

const build = (...hand: string[]) =>
  scenario()
    .seat(0)
    .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn', counters: { '+1/+1': 2 }, damage: 3 })
    .battlefield(DAWN, { label: 'dawn' })
    .battlefield(WATCHER)
    .battlefield('Swamp', 'Swamp', 'Swamp', 'Plains', 'Island', 'Island')
    .hand(...hand)
    .library('Island', { count: 6 })
    .seat(1)
    .library('Island', { count: 6 })
    .build();

describe('it dies (CR 700.4, 712.21)', () => {
  test('one permanent dies once, and both cards are in the graveyard as front-face cards', () => {
    const g = build('Murder');
    const mark = g.mark();
    const life = g.state.seats[0]?.life ?? 0;
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    settle(g);
    const events = g.eventsSince(mark);
    // "Whenever a creature dies": once, though two cards go to the graveyard. "Leaves the battlefield": once.
    expect(g.state.seats[0]?.life).toBe(life + 1 + 10);
    expect(events.filter((e) => e.kind === 'died')).toHaveLength(1);
    const toYard = events.filter((e) => e.kind === 'zoneChanged' && e.toZone === 'graveyard');
    // Murder and the two cards; the second card's event is flagged, so a trigger about permanents does not count it twice.
    expect(toYard).toHaveLength(3);
    expect(toYard.filter((e) => e.kind === 'zoneChanged' && e.component === true)).toHaveLength(1);
    // The Titan's own "when this dies, draw a card" triggered once too: the card drawn (the library had cards, the hand had Murder, gone now).
    expect(g.state.seats[0]?.hand.length).toBe(hand - 1 + 1);
    g.expect.zone(DUSK, 'graveyard', { seat: 0 });
    g.expect.zone(DAWN, 'graveyard', { seat: 0 });
    expect(g.state.seats[0]?.graveyard.length).toBe(3); // Murder and the two cards
    expect(viewOf(g, DUSK).name).toBe(DUSK);
    expect(viewOf(g, DAWN).name).toBe(DAWN);
    expect(viewOf(g, DUSK).meld).toBeUndefined();
    expect(g.object(DUSK).id).not.toBe(g.object(DAWN).id);
    expect(g.object(DUSK).counters).toEqual({});
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('lethal damage kills the one permanent (state-based action): two cards in the graveyard', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn', damage: 8 })
      .battlefield(DAWN, { label: 'dawn' })
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build({ settle: true });
    g.expect.zone(DUSK, 'graveyard', { seat: 0 });
    g.expect.zone(DAWN, 'graveyard', { seat: 0 });
    g.expect.noObject(DUSK, { zone: 'battlefield' });
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('the owner gets both cards, whoever controlled the permanent (CR 712.21, 400.3)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand('Murder')
      .library('Island', { count: 6 })
      .seat(1)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
      .battlefield(DAWN, { label: 'dawn' })
      .library('Island', { count: 6 })
      .build();
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.zone(DUSK, 'graveyard', { seat: 1 });
    g.expect.zone(DAWN, 'graveyard', { seat: 1 });
  });
});

describe('it is exiled, bounced or put into a library (CR 712.21, 712.21a, 712.21b)', () => {
  test('exiled: two cards in exile, one leaves-the-battlefield trigger', () => {
    const g = build(EXILE);
    const life = g.state.seats[0]?.life ?? 0;
    g.act(0).cast(EXILE, { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.zone(DUSK, 'exile');
    g.expect.zone(DAWN, 'exile');
    expect(g.state.seats[0]?.life).toBe(life + 10);
    expect(g.state.exile).toHaveLength(2);
  });

  test('returned to its owner hand: two cards in the hand', () => {
    const g = build('Unsummon');
    g.act(0).cast('Unsummon', { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.zone(DUSK, 'hand', { seat: 0 });
    g.expect.zone(DAWN, 'hand', { seat: 0 });
    g.expect.handSize(0, 2);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('put on top of the library: two cards in the library', () => {
    const g = build(TUCK);
    g.act(0).cast(TUCK, { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.zone(DUSK, 'library', { seat: 0 });
    g.expect.zone(DAWN, 'library', { seat: 0 });
    g.expect.librarySize(0, 8);
  });
});

describe('an effect that finds the new object finds both cards (CR 712.21c)', () => {
  test('exile it, return it at the end step: both cards return, as two permanents', () => {
    const g = build(FLICKER);
    g.act(0).cast(FLICKER, { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.zone(DUSK, 'exile');
    g.expect.zone(DAWN, 'exile');
    g.advanceTo('end');
    settle(g);
    g.expect.zone(DUSK, 'battlefield', { seat: 0 });
    g.expect.zone(DAWN, 'battlefield', { seat: 0 });
    // Two cards came back, each its own permanent with its front face up (a melded permanent is made only by melding).
    expect(g.object(DUSK).id).not.toBe(g.object(DAWN).id);
    expect(g.object(DUSK).meldedWith).toBeUndefined();
    g.expect.pt(DUSK, 2, 2);
    g.expect.pt(DAWN, 1, 3);
    expect(checkInvariants(g.state)).toEqual([]);
  });
});

describe('"it" of a trigger about a melded permanent that died is both cards (CR 712.21c)', () => {
  const WARDEN = 'SYNTHETIC Grave Warden'; // whenever a creature dies, exile it
  const RECALLER = 'SYNTHETIC Grave Recaller'; // whenever a creature dies, return that card to the battlefield under its owner's control

  const buildDying = (watcher: string) =>
    scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
      .battlefield(DAWN, { label: 'dawn' })
      .battlefield(watcher)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand('Murder')
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();

  test('"exile it" exiles the two cards the permanent became (False Demise-style: the example of CR 712.21c)', () => {
    const g = buildDying(WARDEN);
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.zone(DUSK, 'exile');
    g.expect.zone(DAWN, 'exile');
    expect(g.state.exile).toHaveLength(2);
    expect(g.state.seats[0]?.graveyard.length).toBe(1); // only Murder
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('"return that card to the battlefield" returns the two cards as two permanents, each with its front face (Mimic Vat-style)', () => {
    const g = buildDying(RECALLER);
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.zone(DUSK, 'battlefield', { seat: 0 });
    g.expect.zone(DAWN, 'battlefield', { seat: 0 });
    expect(g.object(DUSK).id).not.toBe(g.object(DAWN).id);
    expect(g.object(DUSK).meldedWith).toBeUndefined();
    expect(g.object(DUSK).face).toBe(0);
    g.expect.pt(DUSK, 2, 2);
    g.expect.pt(DAWN, 1, 3);
    expect(checkInvariants(g.state)).toEqual([]);
  });
});
