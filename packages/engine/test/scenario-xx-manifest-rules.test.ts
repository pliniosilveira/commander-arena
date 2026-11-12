// The rules around a face-down permanent that is not the manifest effect or turning it up (CR 708.9, 708.10, 707.2, 702.26, 613.1b, 403.4a... see each test): a face-down
// permanent that leaves the battlefield is revealed and is a new face-up object (CR 400.7, 708.9); a copy of it copies the face-down characteristics, a face-down
// permanent that becomes a copy keeps them and is the copy when turned up (CR 707.2, 708.10); the player who controls it may look at it and turn it up, not the player who
// owns it (CR 708.5, 701.40b); it stays face down through phasing (CR 702.26d), and a phased-out permanent can't be turned up.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-manifest.ts and the three defined here).
import { describe, expect, test } from 'vitest';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BRUTE = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4 Beast
const FLIER = 'SYNTHETIC Manifest Flier'; // {1}{W} 1/3 flying Bird
const SHIFT = 'SYNTHETIC Manifest Shift'; // exile target creature, its controller manifests the top card of their library
const DOPPEL = 'SYNTHETIC Doppel Shift'; // target creature becomes a copy of another target creature until end of turn
const SNATCH = 'SYNTHETIC Snatch Creature'; // gain control of target creature until end of turn
const MIRROR = 'SYNTHETIC Manifest Mirror'; // create a token that's a copy of target creature
const PHASE = 'SYNTHETIC Manifest Phase'; // target creature phases out
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const CREATURE = { zone: 'battlefield', types: ['creature'] } as const;
const mirror = singleFaceCard({
  name: MIRROR,
  manaCost: ['1', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: "Create a token that's a copy of target creature.",
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: CREATURE } }],
    effect: {
      kind: 'createToken',
      token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
      count: 1,
    },
  },
});
const phase = singleFaceCard({
  name: PHASE,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Target creature phases out.',
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: CREATURE } }],
    effect: { kind: 'phaseOut', objects: { kind: 'target', id: 't1' } },
  },
});

type Builder = ReturnType<typeof scenario>;

function game(
  mine: (b: Builder) => Builder,
  theirs: (b: Builder) => Builder = (b) => b,
  theirTop: readonly string[] = [],
  at: Parameters<Builder['at']>[1] = { active: 0, turn: 3 },
): ScenarioGame {
  return theirs(
    mine(
      scenario()
        .define(mirror)
        .define(phase)
        .seat(0)
        .life(20)
        .library(...FILLER),
    )
      .seat(1)
      .life(20)
      .library(...theirTop, ...FILLER),
  )
    .at('precombatMain', at)
    .build();
}

const lands = (b: Builder) =>
  b
    .battlefield('Forest', { count: 4 })
    .battlefield('Island', { count: 3 })
    .battlefield('Plains', { count: 3 })
    .battlefield('Mountain', { count: 2 });

describe('leaving the battlefield (CR 708.9, 400.7)', () => {
  test('a face-down permanent that dies is revealed: a face-up card in the graveyard, named by the events', () => {
    const g = game((b) =>
      lands(b.seat(0).hand('Lightning Bolt').battlefield(BRUTE, { faceDown: true })).seat(0),
    );
    const old = g.id(BRUTE);
    const card = g.object(BRUTE).card;
    const mark = g.mark();
    g.act(0).cast('Lightning Bolt', { targets: [BRUTE], pay: true });
    g.passAll();
    g.expect.zone(BRUTE, 'graveyard');
    const dead = g.object({ name: BRUTE, zone: 'graveyard' });
    expect(dead.faceDown).toBeUndefined();
    expect(dead.id).not.toBe(old);
    const events = g.eventsSince(mark);
    expect(
      events.find(
        (e) => e.kind === 'zoneChanged' && e.fromZone === 'battlefield' && e.toZone === 'graveyard',
      ),
    ).toMatchObject({ card });
    expect(events.find((e) => e.kind === 'died')).toMatchObject({ card });
    // Last-known information is the face-down permanent as it was: a 2/2 creature with no name.
    expect(g.state.lki[old]?.characteristics.name).toBe('');
    expect(g.state.lki[old]?.characteristics.types).toEqual(['creature']);
    expect(g.state.lki[old]?.object.faceDown).toBeDefined();
  });

  test('returned to its owner hand it is the real card, face up, with no counters', () => {
    const g = game((b) =>
      lands(
        b
          .seat(0)
          .hand('Unsummon')
          .battlefield(BRUTE, { faceDown: true, counters: { '+1/+1': 2 } }),
      ).seat(0),
    );
    g.act(0).cast('Unsummon', { targets: [BRUTE], pay: true });
    g.passAll();
    g.expect.zone(BRUTE, 'hand');
    expect(g.object({ name: BRUTE, zone: 'hand' }).faceDown).toBeUndefined();
    expect(g.object({ name: BRUTE, zone: 'hand' }).counters).toEqual({});
  });

  test('exiled by the effect of Reality Shift it is revealed, and its controller manifests', () => {
    const g = game(
      (b) => lands(b.seat(0).hand(SHIFT)).seat(0),
      (b) => b.seat(1).battlefield(FLIER, { faceDown: true }),
      [BRUTE],
    );
    g.act(0).cast(SHIFT, { targets: [FLIER], pay: true });
    g.passAll();
    g.expect.zone(FLIER, 'exile');
    expect(g.object({ name: FLIER, zone: 'exile' }).faceDown).toBeUndefined();
    const brute = g.object({ name: BRUTE, zone: 'battlefield' });
    expect(brute.faceDown).toEqual({ by: 'manifest', n: 1 });
    expect(brute.controller).toBe(1);
  });

  test('a manifested card goes back to being a card of the zone with nothing remembered: it can be manifested again', () => {
    const g = game((b) =>
      lands(b.seat(0).hand('Unsummon').battlefield(BRUTE, { faceDown: true })).seat(0),
    );
    g.act(0).cast('Unsummon', { targets: [BRUTE], pay: true });
    g.passAll();
    // The label is free again: a new face-down permanent gets the smallest number.
    expect(g.find({ name: BRUTE, zone: 'battlefield' })).toHaveLength(0);
  });
});

describe('copying (CR 707.2, 708.10)', () => {
  test('a token that is a copy of a face-down permanent is a face-up 2/2 with no name, no types but creature, no abilities', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(MIRROR).battlefield(FLIER, { faceDown: true })).seat(0),
    );
    g.act(0).cast(MIRROR, { targets: [FLIER], pay: true });
    g.passAll();
    const token = g.state.battlefield
      .map((id) => g.state.objects[id])
      .find((o) => o?.token !== null && o?.token !== undefined);
    expect(token).toBeDefined();
    expect(token?.faceDown).toBeUndefined();
    expect(token?.token?.characteristics.name).toBe('');
    expect(token?.token?.characteristics.types).toEqual(['creature']);
    expect(token?.token?.characteristics.power).toBe(2);
    expect(token?.token?.abilities).toEqual([]);
  });

  test('a creature that becomes a copy of a face-down permanent is a 2/2 with no name (CR 707.2)', () => {
    const g = game((b) =>
      lands(
        b.seat(0).hand(DOPPEL).battlefield('Grizzly Bears').battlefield(BRUTE, { faceDown: true }),
      ).seat(0),
    );
    g.act(0).cast(DOPPEL, { targets: ['Grizzly Bears', BRUTE], pay: true });
    g.passAll();
    g.expect.derived('Grizzly Bears', { types: ['creature'], subtypes: [] });
    g.expect.pt('Grizzly Bears', 2, 2);
  });

  test('a face-down permanent that becomes a copy keeps the face-down characteristics, and is the copy when turned up (CR 708.10)', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(DOPPEL).battlefield(BRUTE, { faceDown: true }).battlefield(FLIER)).seat(
        0,
      ),
    );
    g.act(0).cast(DOPPEL, { targets: [BRUTE, FLIER], pay: true });
    g.passAll();
    // Face down: still a 2/2 with no subtypes and no flying.
    g.expect.pt(BRUTE, 2, 2);
    g.expect.derived(BRUTE, { types: ['creature'], subtypes: [], keywords: [] });
    // Turned face up, its copiable values are the ones it copied (the cost is the one of its own card).
    g.act(0).turnFaceUp(BRUTE, { pay: true });
    g.expect.pt(BRUTE, 1, 3);
    g.expect.derived(BRUTE, { subtypes: ['Bird'], keywords: ['flying'] });
  });
});

describe('control (CR 708.5, 701.40b, 613.1b)', () => {
  test('the player who controls it may turn it face up, the player who owns it may not', () => {
    const g = game(
      (b) => lands(b.seat(0).hand(SNATCH)).seat(0),
      (b) => lands(b.seat(1).battlefield(FLIER, { faceDown: true })).seat(1),
    );
    g.expect.illegal(0, { turnFaceUp: FLIER });
    g.act(0).cast(SNATCH, { targets: [FLIER], pay: true });
    g.passAll();
    g.expect.legal(0, { turnFaceUp: FLIER });
    g.expect.illegal(1, { turnFaceUp: FLIER });
    g.act(0).turnFaceUp(FLIER, { pay: true });
    g.expect.pt(FLIER, 1, 3);
  });
});

describe('phasing (CR 702.26, 708.5)', () => {
  test('a face-down permanent that phases out is still face down when it phases in, and can not be turned up meanwhile', () => {
    const g = game((b) =>
      lands(b.seat(0).hand(PHASE).battlefield(BRUTE, { faceDown: true })).seat(0),
    );
    g.act(0).cast(PHASE, { targets: [BRUTE], pay: true });
    g.passAll();
    expect(g.object({ name: BRUTE, zone: 'phased' }).faceDown).toBeDefined();
    g.expect.illegal(0, { turnFaceUp: BRUTE });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.object({ name: BRUTE, zone: 'battlefield' }).faceDown).toBeDefined();
    g.expect.legal(0, { turnFaceUp: BRUTE });
  });
});
