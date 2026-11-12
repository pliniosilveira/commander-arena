// Manifest and the face-down permanent it makes (CR 701.40a, 708.2, 708.2a, 708.3, 613.2b, 708.6, D-961, D-962).
// Pins: CR 701.40a (the top card of a library is put onto the battlefield face down as a 2/2 creature with no name, no subtypes, no
// mana cost, no text), 708.2a and 613.2b (the characteristics are the copiable values, layer 1b: later layers still apply), 708.3 (turned
// face down before it enters: none of the card's enters replacement effects or triggers), 603.6a (other permanents see a creature
// enter), 701.40e (one at a time), 701.40f (an empty library manifests nothing), 110.2a (it enters under the control of the player who
// manifests), 708.6 (labels tell face-down permanents apart). Cards are SYNTHETIC (src/cards/fixtures/synthetic-manifest.ts).
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const BRUTE = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4 Beast
const FLIER = 'SYNTHETIC Manifest Flier'; // {1}{W} 1/3 flying Bird
const LAGGARD = 'SYNTHETIC Manifest Laggard'; // enters tapped, with a +1/+1 counter, "when this enters, you gain 3 life"
const LORD = 'SYNTHETIC Manifest Lord'; // other creatures you control get +1/+1
const WATCHER = 'SYNTHETIC Manifest Watcher'; // whenever another creature enters under your control, you gain 1 life
const BOLT = 'SYNTHETIC Manifest Bolt'; // an instant: not a creature card
const SELF = 'SYNTHETIC Manifest Self'; // sorcery: manifest the top card of your library
const SHIFT = 'SYNTHETIC Manifest Shift'; // instant: exile target creature, its controller manifests the top card of their library
const THEFT = 'SYNTHETIC Manifest Theft'; // sorcery: manifest the top card of target opponent's library
const EVERYONE = 'SYNTHETIC Manifest Everyone'; // sorcery: each player manifests the top card of their library
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 0 with `mine` and a library that starts with `top`, seat 1 with `theirs`; seat 0 in its precombat main phase. */
function game(
  top: readonly string[],
  mine: (b: Builder) => Builder = (b) => b,
  theirs: (b: Builder) => Builder = (b) => b,
  theirTop: readonly string[] = [],
): ScenarioGame {
  const a = mine(scenario().seat(0).life(20).library(...top, ...FILLER));
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...theirTop, ...FILLER),
  )
    .at('precombatMain')
    .build();
}

const lands = (b: Builder) =>
  b.battlefield('Forest', { count: 4 }).battlefield('Island', { count: 3 }).battlefield('Swamp', { count: 2 });

const resolveAll = (g: ScenarioGame): void => {
  g.passAll();
};

describe('the cards and the effect are known to the engine', () => {
  test('the SYNTHETIC cards are valid and the effect is a supported feature', () => {
    for (const name of [SELF, SHIFT, THEFT, EVERYONE, 'SYNTHETIC Manifest Maker']) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
    expect(isFeatureSupported('effect:manifest')).toBe(true);
  });
});

describe('manifest (CR 701.40a)', () => {
  test('the top card of the library is put onto the battlefield face down as a 2/2 creature', () => {
    const g = game([BRUTE], (b) => lands(b.seat(0).hand(SELF)).seat(0));
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    g.expect.librarySize(0, FILLER.length);
    const brute = g.object({ name: BRUTE, zone: 'battlefield' });
    expect(brute.faceDown).toEqual({ by: 'manifest', n: 1 });
    expect(brute.zoneOwner).toBeNull();
    g.expect.derived(BRUTE, { types: ['creature'], subtypes: [], colors: [], keywords: [] });
    g.expect.pt(BRUTE, 2, 2);
    g.expect.invariants();
  });

  test('a creature with abilities and colors has none of them face down (no name, no text, no mana cost, no subtypes)', () => {
    const g = game([FLIER], (b) => lands(b.seat(0).hand(SELF)).seat(0));
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    g.expect.derived(FLIER, { types: ['creature'], subtypes: [], colors: [], keywords: [] });
    g.expect.pt(FLIER, 2, 2);
    const view = g.view(0).battlefield.find((o) => o.id === g.id(FLIER));
    expect(view?.manaCost).toBeNull();
    expect(view?.oracleText).toBe('');
    expect(view?.supertypes).toEqual([]);
  });

  test('a card that is not a creature card is a 2/2 creature too (it can only never be turned face up)', () => {
    const g = game([BOLT], (b) => lands(b.seat(0).hand(SELF)).seat(0));
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    g.expect.derived(BOLT, { types: ['creature'] });
    g.expect.pt(BOLT, 2, 2);
  });

  test('a land is a face-down creature as well', () => {
    const g = game(['Mountain'], (b) => lands(b.seat(0).hand(SELF)).seat(0));
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    g.expect.derived('Mountain', { types: ['creature'], subtypes: [] });
  });

  test('it enters untapped, under the control of the player who manifests, with no counters and no damage', () => {
    const g = game([BRUTE], (b) => lands(b.seat(0).hand(SELF)).seat(0));
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    const brute = g.object({ name: BRUTE, zone: 'battlefield' });
    expect(brute.tapped).toBe(false);
    expect(brute.counters).toEqual({});
    expect(brute.controller).toBe(0);
    expect(brute.owner).toBe(0);
  });
});

describe('it is turned face down before it enters (CR 708.3)', () => {
  test("the card's own enters replacements and trigger do nothing: untapped, no counter, no life", () => {
    const g = game([LAGGARD], (b) => lands(b.seat(0).hand(SELF)).seat(0));
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    g.expect.tapped(LAGGARD, false);
    g.expect.counters(LAGGARD, {});
    g.expect.pt(LAGGARD, 2, 2);
    g.expect.life(0, 20);
    g.expect.noEvent({ kind: 'lifeChanged' });
  });

  test('an enters trigger of another permanent sees a creature enter (CR 603.6a)', () => {
    const g = game([BRUTE], (b) => lands(b.seat(0).hand(SELF).battlefield(WATCHER)).seat(0));
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    g.expect.life(0, 21);
  });
});

describe('later layers apply on top of layer 1b (CR 613.2b, 708.8)', () => {
  test('an anthem makes a face-down creature 3/3', () => {
    const g = game([BRUTE], (b) => lands(b.seat(0).hand(SELF).battlefield(LORD)).seat(0));
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    g.expect.pt(BRUTE, 3, 3);
  });
});

describe('who manifests, and whose library (CR 701.40a, 110.2a)', () => {
  test('"its controller manifests the top card of their library": the controller of the exiled creature', () => {
    const g = game(
      [],
      (b) => lands(b.seat(0).hand(SHIFT)).seat(0),
      (b) => b.battlefield(FLIER),
      [BRUTE],
    );
    g.act(0).cast(SHIFT, { targets: [FLIER], pay: true });
    resolveAll(g);
    g.expect.zone(FLIER, 'exile');
    const brute = g.object({ name: BRUTE, zone: 'battlefield' });
    expect(brute.faceDown?.by).toBe('manifest');
    expect(brute.controller).toBe(1);
    expect(brute.owner).toBe(1);
    g.expect.librarySize(1, FILLER.length);
    g.expect.librarySize(0, FILLER.length);
  });

  test("it manifests from the library of the controller of the creature even if another player owns it", () => {
    // The shape of Reality Shift on a creature the caster controls: the caster manifests the top card of their own library.
    const g = game(
      [BRUTE],
      (b) => lands(b.seat(0).hand(SHIFT).battlefield(FLIER)).seat(0),
      (b) => b,
      [LAGGARD],
    );
    g.act(0).cast(SHIFT, { targets: [FLIER], pay: true });
    resolveAll(g);
    expect(g.object({ name: BRUTE, zone: 'battlefield' }).controller).toBe(0);
    g.expect.zone(LAGGARD, 'library', { seat: 1 });
  });

  test("the top card of an opponent's library, manifested under the control of the player who did it", () => {
    const g = game(
      [],
      (b) => lands(b.seat(0).hand(THEFT)).seat(0),
      (b) => b,
      [BRUTE],
    );
    g.act(0).cast(THEFT, { targets: [{ player: 1 }], pay: true });
    resolveAll(g);
    const brute = g.object({ name: BRUTE, zone: 'battlefield' });
    expect(brute.controller).toBe(0);
    expect(brute.owner).toBe(1);
    g.expect.librarySize(1, FILLER.length);
  });

  test('each player manifests, one at a time, in turn order, with their own labels', () => {
    const g = game(
      [BRUTE],
      (b) => lands(b.seat(0).hand(EVERYONE)).seat(0),
      (b) => b,
      [FLIER],
    );
    g.act(0).cast(EVERYONE, { pay: true });
    resolveAll(g);
    const mine = g.object({ name: BRUTE, zone: 'battlefield' });
    const theirs = g.object({ name: FLIER, zone: 'battlefield' });
    expect(mine.controller).toBe(0);
    expect(theirs.controller).toBe(1);
    expect(new Set([mine.faceDown?.n, theirs.faceDown?.n]).size).toBe(2);
    g.expect.eventLog([{ kind: 'manifested', seat: 0 }, { kind: 'manifested', seat: 1 }]);
  });

  test('an empty library manifests nothing and nobody loses for it (CR 701.40f, 121.4)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(SELF, SELF)
      .battlefield('Forest', { count: 6 })
      .library('Mountain')
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast('SYNTHETIC Manifest Self[0]', { pay: true });
    resolveAll(g);
    g.expect.librarySize(0, 0);
    const mark = g.mark();
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    expect(g.eventsSince(mark).some((e) => e.kind === 'manifested')).toBe(false);
    expect(g.find({ name: 'Mountain', zone: 'battlefield' })).toHaveLength(1);
    g.expect.hasLost(0, false);
  });
});

describe('the events', () => {
  test('the card is not named: the zone change has no card, then `manifested` follows', () => {
    const g = game([BRUTE], (b) => lands(b.seat(0).hand(SELF)).seat(0));
    const mark = g.mark();
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    const events = g.eventsSince(mark);
    const entered = events.find((e) => e.kind === 'zoneChanged' && e.toZone === 'battlefield');
    expect(entered).toBeDefined();
    expect(entered?.kind === 'zoneChanged' ? entered.card : 'x').toBeNull();
    const manifested = events.find((e) => e.kind === 'manifested');
    expect(manifested).toEqual({
      kind: 'manifested',
      seat: 0,
      object: g.id({ name: BRUTE, zone: 'battlefield' }),
    });
  });
});

describe('labels tell face-down permanents apart (CR 708.6)', () => {
  test('each has the smallest number no other face-down permanent has, and keeps it', () => {
    const g = game([BRUTE, FLIER], (b) => lands(b.seat(0).hand(SELF, SELF)).seat(0));
    g.act(0).cast('SYNTHETIC Manifest Self[0]', { pay: true });
    resolveAll(g);
    g.act(0).cast(SELF, { pay: true });
    resolveAll(g);
    expect(g.object({ name: BRUTE, zone: 'battlefield' }).faceDown?.n).toBe(1);
    expect(g.object({ name: FLIER, zone: 'battlefield' }).faceDown?.n).toBe(2);
  });
});
