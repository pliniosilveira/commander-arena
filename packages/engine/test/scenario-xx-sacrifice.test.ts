// The sacrifice action (CR 701.21) and the choices an effect asks for (CR 608.2d).
// Pins: CR 701.21a (only your own permanents; moved to the graveyard, not destroyed), CR 608.2d
// (the player chooses among legal options; with none the instruction does nothing), CR 603.10a
// (sacrifice triggers look back in time), CR 111.7 (a token ceases to exist after it changes zones).
// All cards are SYNTHETIC (see src/cards/fixtures/synthetic-triggers.ts).
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

describe('sacrifice a creature (SYNTHETIC Edict)', () => {
  test('with several creatures the controller chooses, among their own only', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Edict')
      .pool('CB')
      .battlefield('Grizzly Bears', 'Llanowar Elves', 'Forest')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Edict', { pay: true });
    g.pass();
    g.pass();
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    // Two creatures of seat 0; the Forest is not a creature and seat 1's creature is not theirs.
    expect(d.legal).toHaveLength(2);
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    expect(d.purpose).toBe('sacrifice');
    for (const id of d.legal) expect(g.state.objects[id]?.controller).toBe(0);
    g.act(0).choosePermanents({ name: 'Llanowar Elves' });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1, count: 1 });
    g.expect.eventLog([
      { kind: 'permanentsChosen', seat: 0, automatic: false, purpose: 'sacrifice' },
      { kind: 'zoneChanged', fromZone: 'battlefield', toZone: 'graveyard' },
      { kind: 'sacrificed', controller: 0 },
    ]);
  });

  test('an answer outside the legal set, or of the wrong size, is rejected', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Edict')
      .pool('CB')
      .battlefield('Grizzly Bears', 'Llanowar Elves', 'Forest')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Edict', { pay: true });
    g.passAll();
    const forest = g.id('Forest');
    const theirs = g.id({ name: 'Grizzly Bears', seat: 1 });
    const mine = g.id({ name: 'Grizzly Bears', seat: 0 });
    const elves = g.id('Llanowar Elves');
    const attempts = [[forest], [theirs], [], [mine, elves], [mine, mine], ['o999']];
    for (const objects of attempts) {
      const r = g.act(0).try.action({ kind: 'choosePermanents', objects: objects as never });
      expect(r.ok).toBe(false);
    }
    g.expect.pending('choosePermanent', 0);
    expect(g.act(1).try.action({ kind: 'choosePermanents', objects: [mine] }).ok).toBe(false);
  });

  test('with exactly one candidate the engine chooses and says so (CR 608.2d)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Edict')
      .pool('CB')
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Edict', { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.eventLog([{ kind: 'permanentsChosen', seat: 0, automatic: true }]);
  });

  test('with no candidate nothing happens and no decision is asked (CR 608.2d)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Edict')
      .pool('CB')
      .battlefield('Forest')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Edict', { pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Edict', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'sacrificed' });
    g.expect.noEvent({ kind: 'permanentsChosen' });
  });

  test('sacrificing is not destroying: an indestructible creature can be sacrificed', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Edict')
      .pool('CB')
      .battlefield('SYNTHETIC Indestructible 2/2')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Edict', { pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Indestructible 2/2', 'graveyard', { seat: 0 });
  });
});

describe('sacrifice N permanents of a kind (SYNTHETIC Land Edict, two lands)', () => {
  const build = (lands: number) =>
    scenario()
      .seat(0)
      .hand('SYNTHETIC Land Edict')
      .pool('B')
      .battlefield(...Array.from({ length: lands }, () => 'Forest'), 'Grizzly Bears')
      .seat(1)
      .build();

  test('asks for exactly two of three lands', () => {
    const g = build(3);
    g.act(0).cast('SYNTHETIC Land Edict', { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    expect([d.min, d.max]).toEqual([2, 2]);
    expect(d.legal).toHaveLength(3);
    expect(
      g.act(0).try.action({ kind: 'choosePermanents', objects: [d.legal[0] as never] }).ok,
    ).toBe(false);
    g.act(0).choosePermanents({ name: 'Forest', nth: 0 }, { name: 'Forest', nth: 2 });
    g.expect.zone('Forest', 'graveyard', { seat: 0, count: 2 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 1 });
  });

  test('with exactly two lands both are sacrificed automatically', () => {
    const g = build(2);
    g.act(0).cast('SYNTHETIC Land Edict', { pay: true });
    g.passAll();
    g.expect.zone('Forest', 'graveyard', { seat: 0, count: 2 });
    g.expect.eventLog([{ kind: 'permanentsChosen', automatic: true }]);
  });

  test('with one land that one is sacrificed (as much as possible)', () => {
    const g = build(1);
    g.act(0).cast('SYNTHETIC Land Edict', { pay: true });
    g.passAll();
    g.expect.zone('Forest', 'graveyard', { seat: 0, count: 1 });
  });
});

describe('the sacrificed event (CR 701.21, 603.10a)', () => {
  test('is emitted after the zone change and starts triggers that look back in time', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Edict')
      .pool('CB')
      .battlefield('SYNTHETIC Creature Sacrifice Watcher', 'Grizzly Bears')
      .seat(1)
      .battlefield('SYNTHETIC Sacrifice Lifegainer')
      .build();
    g.act(0).cast('SYNTHETIC Edict', { pay: true });
    g.pass();
    g.pass();
    g.expect.eventLog([
      { kind: 'zoneChanged', fromZone: 'battlefield', toZone: 'graveyard' },
      { kind: 'died' },
      { kind: 'sacrificed', controller: 0 },
    ]);
    // Seat 0's watcher (creature, you) and seat 1's (any permanent): two triggers, APNAP.
    g.expect.stack([
      'SYNTHETIC Sacrifice Lifegainer (ability)',
      'SYNTHETIC Creature Sacrifice Watcher (ability)',
    ]);
    g.passAll();
    g.expect.life(0, 41);
    g.expect.life(1, 41);
  });

  test('a filtered watcher ignores permanents that do not match it', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Edict')
      .pool('B')
      .battlefield('SYNTHETIC Creature Sacrifice Watcher', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Land Edict', { pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });

  test('a permanent sacrificing itself still triggers watchers (it looks back, CR 603.10a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Fleeting Spirit', 'SYNTHETIC Creature Sacrifice Watcher')
      .seat(1)
      .at('postcombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('SYNTHETIC Fleeting Spirit', 'graveyard', { seat: 0 });
    g.expect.life(0, 41);
  });
});
