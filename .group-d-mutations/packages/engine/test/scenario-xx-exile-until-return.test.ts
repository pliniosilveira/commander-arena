// "Exile ... until this leaves the battlefield": the return is a second one-shot effect created immediately after the event, not a triggered
// ability (cleanup C, D-154).
// Pins: CR 610.3 (the second one-shot effect returns the object right after the event: nothing goes on the stack and nobody gets
// priority in between), CR 610.3c (under its owner's control), CR 610.3d (several such effects created after simultaneous events are
// simultaneous), CR 603.7 (a delayed triggered ability is a different thing: it triggers and uses the stack).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-until-leaves.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const GRASP = 'SYNTHETIC Grasp of Law';
const DISPEL = 'SYNTHETIC Dispel Enchantment';
const PURGE = 'SYNTHETIC Purge Enchantments';
const WARDEN = 'SYNTHETIC Banishing Warden';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

test(`${PURGE} is valid`, () => {
  expect(validateCard(syntheticCard(PURGE))).toEqual([]);
});

describe('the return is not a triggered ability (CR 610.3)', () => {
  const exiled = () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(GRASP, DISPEL)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(GRASP, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    return g;
  };

  test('when the source is destroyed the card is back as the spell resolves: no trigger, nothing on the stack', () => {
    const g = exiled();
    g.act(0).cast(DISPEL, { targets: [GRASP], pay: true });
    g.pass();
    g.pass();
    // The spell has resolved. With a stack trigger the return would still be waiting here.
    g.expect.zone(GRASP, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    expect(g.state.stack).toEqual([]);
    expect(g.state.pendingTriggers).toEqual([]);
    expect(g.events.filter((e) => e.kind === 'abilityTriggered')).toHaveLength(1); // the Grasp's own enters trigger only; none for the return
  });

  test('the returned card is back before anyone has priority: the player holding priority already sees it', () => {
    const g = exiled();
    g.act(0).cast(DISPEL, { targets: [GRASP], pay: true });
    g.pass();
    g.pass();
    const d = g.state.pending;
    if (d?.kind !== 'priority') throw new Error(`expected priority, got ${d?.kind}`);
    expect(g.state.stack).toEqual([]);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('an activated "until this creature leaves" returns the creature at once too', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WARDEN, 'Plains', 'Plains', 'Plains', 'Plains')
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL)
      .build();
    g.act(0).activate(WARDEN, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.act(0).cast('Lightning Bolt', { targets: [WARDEN], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(WARDEN, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    expect(g.state.stack).toEqual([]);
  });
});

describe('simultaneous leaving: the returns are simultaneous (CR 610.3d)', () => {
  test('two Grasps destroyed by one spell return both cards together, with no stack object', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(GRASP, GRASP, PURGE)
      .battlefield(
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
        'Plains',
      )
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, ANGEL)
      .build();
    g.act(0).cast(`${GRASP}[0]`, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.act(0).cast(`${GRASP}[0]`, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(ANGEL);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.act(0).cast(PURGE, { pay: true });
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    expect(g.state.stack).toEqual([]);
    expect(g.state.pendingTriggers).toEqual([]);
  });
});

describe('what stays as it was', () => {
  test('a card that left exile in between is a new object and is not returned (CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(GRASP, DISPEL)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .build();
    g.act(0).cast(GRASP, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.act(0).cast(DISPEL, { targets: [GRASP], pay: true });
    g.passAll();
    // The one-shot effect is used up: a second Grasp leaving later does not return the card a second time.
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    expect(g.find({ name: BEARS, zone: 'battlefield' })).toHaveLength(1);
    expect(g.state.delayedTriggers).toEqual([]);
  });
});
