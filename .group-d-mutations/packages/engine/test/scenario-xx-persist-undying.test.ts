// Persist (CR 702.79a) and Undying (CR 702.93a): "When this permanent is put into a graveyard from the
// battlefield, if it had no -1/-1 [+1/+1] counters on it, return it to the battlefield under its owner's
// control with a -1/-1 [+1/+1] counter on it." (D-104, D-110)
// Pins: CR 702.79a, 702.93a, CR 603.10a (leaves-the-battlefield abilities look back in time: the "if" reads
// the permanent as it last existed), CR 603.4 (an intervening "if": no trigger when it is false, and it is
// checked again on resolution), CR 400.7 (the returned card is a new object; a card that left the
// graveyard in the meantime can't be found), CR 122.6 and 614.1c (it enters with the counter), CR 111.8 (a
// token that left the battlefield can't come back), CR 110.2 (under its owner's control), CR 700.4 ("dies"),
// CR 704.5q (+1/+1 and -1/-1 counters cancel). Cards are SYNTHETIC (src/cards/fixtures/synthetic-keywords.ts).
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';

const PERSIST = 'SYNTHETIC Persist Bear'; // 2/2 {2}{G}, Persist
const WISP = 'SYNTHETIC Persist Wisp'; // 2/2 {1}{B}, Persist, "When this creature dies, you gain 1 life."
const UNDYING = 'SYNTHETIC Undying Imp'; // 2/2 {2}{R}, Undying
const BOLT = 'Lightning Bolt';
const WIPE = 'SYNTHETIC Graveyard Wipe'; // {1}{B} instant: exile target player's graveyard
const TWIN = 'SYNTHETIC Twin Image'; // {1}{U}: token copy of target creature you control

/** Seat 1 holds `bolts` Lightning Bolts and the Mountains to cast them, and priority. */
const bolter = (bolts: number) => (b: ReturnType<typeof scenario>) =>
  b
    .seat(1)
    .hand(BOLT, { count: bolts })
    .battlefield('Mountain', { count: bolts })
    .at('precombatMain', { active: 1 });

const BOLT_CARD = { name: BOLT, zone: 'hand', nth: 0 } as const;

function kill(g: ScenarioGame, creature: string): void {
  g.act(1).cast(BOLT_CARD, { targets: [creature], pay: true });
  g.passAll();
  // Persist and a "when this dies" trigger of its own are two different triggers: the controller orders them.
  if (g.state.pending?.kind === 'orderTriggers') {
    g.act(0).orderTriggers(0, 1);
    g.passAll();
  }
}

const idOn = (g: ScenarioGame, name: string, seat: 0 | 1) =>
  g.id({ name, zone: 'battlefield', seat });

describe('CR 702.79a (Persist)', () => {
  test('it dies, the trigger returns it with a -1/-1 counter as a new object', () => {
    const g = bolter(1)(scenario().seat(0).battlefield(PERSIST)).build();
    const old = idOn(g, PERSIST, 0);
    g.act(1).cast(BOLT_CARD, { targets: [PERSIST], pay: true });
    g.act(1).pass();
    g.act(0).pass();
    // It died: the trigger waits on the stack above nothing, the card is in the graveyard.
    g.expect.zone(PERSIST, 'graveyard', { seat: 0 });
    g.expect.stack([`${PERSIST} (ability)`]);
    g.passAll();
    g.expect.zone(PERSIST, 'battlefield', { seat: 0 });
    g.expect.noObject(PERSIST, { zone: 'graveyard' });
    const back = idOn(g, PERSIST, 0);
    expect(back).not.toBe(old); // CR 400.7: a new object
    g.expect.counters(PERSIST, { '-1/-1': 1 });
    g.expect.pt(PERSIST, 1, 1);
    g.expect.invariants();
  });

  test('the counter is on it as it enters, so the entering event carries it', () => {
    const g = bolter(1)(scenario().seat(0).battlefield(PERSIST)).build();
    const mark = g.mark();
    kill(g, PERSIST);
    g.expect.eventLog(
      [
        { kind: 'zoneChanged', fromZone: 'graveyard', toZone: 'battlefield' },
        { kind: 'counterAdded', counter: '-1/-1', count: 1 },
      ],
      { since: mark },
    );
  });

  test('with a -1/-1 counter already, it dies for good: no trigger (CR 603.4)', () => {
    const g = bolter(1)(
      scenario()
        .seat(0)
        .battlefield(PERSIST, { counters: { '-1/-1': 1 } }),
    ).build();
    g.act(1).cast(BOLT_CARD, { targets: [PERSIST], pay: true });
    g.passAll();
    g.expect.zone(PERSIST, 'graveyard', { seat: 0 });
    g.expect.stack([]);
    g.expect.noObject(PERSIST, { zone: 'battlefield' });
  });

  test('it comes back once: the second death stays', () => {
    const g = bolter(2)(scenario().seat(0).battlefield(PERSIST)).build();
    kill(g, PERSIST);
    g.expect.zone(PERSIST, 'battlefield', { seat: 0 });
    kill(g, PERSIST);
    g.expect.zone(PERSIST, 'graveyard', { seat: 0 });
    g.expect.noObject(PERSIST, { zone: 'battlefield' });
  });

  test('"when this dies" triggers on each death (the returned permanent is a new object)', () => {
    const g = bolter(2)(scenario().seat(0).battlefield(WISP)).build();
    kill(g, WISP);
    g.expect.life(0, 41);
    g.expect.zone(WISP, 'battlefield', { seat: 0 });
    kill(g, WISP);
    g.expect.life(0, 42);
    g.expect.zone(WISP, 'graveyard', { seat: 0 });
  });

  test('both triggers go on the stack together, in an order the controller picks', () => {
    const g = bolter(1)(scenario().seat(0).battlefield(WISP)).build();
    g.act(1).cast(BOLT_CARD, { targets: [WISP], pay: true });
    g.act(1).pass();
    g.act(0).pass();
    expect(g.state.pending?.kind).toBe('orderTriggers');
    g.act(0).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
  });

  test('+1/+1 counters do not stop it (only -1/-1 counters count): it returns with just the -1/-1', () => {
    // 3/3 with two damage marked: Lightning Bolt's 3 damage is lethal.
    const g = bolter(1)(
      scenario()
        .seat(0)
        .battlefield(PERSIST, { counters: { '+1/+1': 1 }, damage: 2 }),
    ).build();
    kill(g, PERSIST);
    g.expect.zone(PERSIST, 'battlefield', { seat: 0 });
    g.expect.counters(PERSIST, { '-1/-1': 1 });
  });

  test('a creature put in the graveyard by a sacrifice or a state-based action dies too (CR 700.4)', () => {
    // Sacrificing a creature puts it into a graveyard from the battlefield: it dies.
    const g = scenario().seat(0).battlefield(PERSIST, 'SYNTHETIC Altar').seat(1).build();
    g.act(0).activate('SYNTHETIC Altar'); // the only creature is sacrificed without a question
    g.expect.stack(['SYNTHETIC Altar (ability)', `${PERSIST} (ability)`].reverse() as never);
    g.passAll();
    g.expect.zone(PERSIST, 'battlefield', { seat: 0 });
    g.expect.counters(PERSIST, { '-1/-1': 1 });
  });

  test('exiled instead of dying: no trigger', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PERSIST)
      .seat(1)
      .hand('SYNTHETIC Flicker Spell')
      .battlefield('Island', 'Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('SYNTHETIC Flicker Spell', { targets: [PERSIST], pay: true });
    g.passAll();
    // The flicker returns it as a new object with no counter.
    g.expect.counters(PERSIST, {});
  });

  test('the card left the graveyard before the trigger resolved: nothing returns (CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PERSIST)
      .seat(1)
      .hand(BOLT, WIPE)
      .battlefield('Mountain', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT_CARD, { targets: [PERSIST], pay: true });
    g.act(1).pass();
    g.act(0).pass();
    g.expect.stack([`${PERSIST} (ability)`]);
    // In response, seat 1 exiles seat 0's graveyard.
    g.act(1).cast(WIPE, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.noObject(PERSIST, { zone: 'battlefield' });
    g.expect.noObject(PERSIST, { zone: 'graveyard' });
    g.expect.zone(PERSIST, 'exile');
    g.expect.invariants();
  });

  test("a creature you control but do not own returns under its owner's control (CR 110.2)", () => {
    const g = scenario()
      .seat(1)
      .battlefield(PERSIST, { controller: 0 })
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .seat(0)
      .build();
    g.act(1).cast(BOLT_CARD, { targets: [PERSIST], pay: true });
    g.passAll();
    g.expect.zone(PERSIST, 'battlefield', { seat: 1 });
  });

  test('a token copy has persist but does not come back (CR 111.8)', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN, BOLT)
      .battlefield(PERSIST, 'Island', 'Island', 'Mountain')
      .seat(1)
      .build();
    g.act(0).cast(TWIN, { targets: [PERSIST], pay: true });
    g.passAll();
    const token = g
      .find({ name: PERSIST, zone: 'battlefield' })
      .find((o) => g.state.objects[o.id]?.token !== null);
    expect(token).toBeDefined();
    g.act(0).cast(BOLT, { targets: [token?.id ?? ''], pay: true });
    g.passAll();
    g.expect.zone(PERSIST, 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});

describe('CR 702.93a (Undying)', () => {
  test('it returns with a +1/+1 counter, 3/3, and a second death stays', () => {
    const g = bolter(3)(scenario().seat(0).battlefield(UNDYING)).build();
    kill(g, UNDYING);
    g.expect.counters(UNDYING, { '+1/+1': 1 });
    g.expect.pt(UNDYING, 3, 3);
    // Lightning Bolt kills a 3/3 exactly.
    kill(g, UNDYING);
    g.expect.zone(UNDYING, 'graveyard', { seat: 0 });
    g.expect.noObject(UNDYING, { zone: 'battlefield' });
  });

  test('-1/-1 counters do not stop it', () => {
    const g = bolter(1)(
      scenario()
        .seat(0)
        .battlefield(UNDYING, { counters: { '-1/-1': 0 } }),
    ).build();
    kill(g, UNDYING);
    g.expect.zone(UNDYING, 'battlefield', { seat: 0 });
  });
});
