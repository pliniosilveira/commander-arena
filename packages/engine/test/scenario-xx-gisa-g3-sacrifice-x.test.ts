// Group 3 of the Gisa deck (issue 41, D-488 to D-490): "{B}, Sacrifice X creatures: Target player draws X cards and gains X life. Put X +1/+1 counters on ~." and "Partner with
// [name]" (the two lines of Krav, the Unredeemed), the SYNTHETIC Sacrifice Demon, Partner Seeker and Partner Quarry of `src/cards/fixtures/synthetic-gisa-g3.ts`. Pins: CR 107.3a and 602.2b (X is
// announced as the ability is activated, before the targets and the costs; it is the number of permanents sacrificed and every X of the effect), CR 118.3 (a cost can't be paid with fewer
// permanents than it asks for), CR 701.21a (the player chooses the permanents among those they control), CR 603.10a (a permanent sacrificed as a cost is gone when the effect
// resolves), CR 702.124j (Partner with: the enters trigger searches for the named card, target player may search, reveal it, put it into their hand, then shuffle), CR 701.23
// (search), CR 201.2 (a name).
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const DEMON = 'SYNTHETIC Sacrifice Demon';
const SEEKER = 'SYNTHETIC Partner Seeker';
const QUARRY = 'SYNTHETIC Partner Quarry';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([DEMON, SEEKER, QUARRY])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const names = (
  g: ScenarioGame,
  seat: 0 | 1,
  zone: 'battlefield' | 'graveyard' | 'hand',
): string[] =>
  Object.values(g.state.objects)
    .filter((o) => o.zone === zone && o.owner === seat)
    .map((o) => {
      const card = o.card === null ? undefined : g.state.cards[o.card];
      return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
    })
    .sort();

describe('"{B}, Sacrifice X creatures: Target player draws X cards and gains X life. Put X +1/+1 counters on ~."', () => {
  const game = () =>
    scenario()
      .seat(0)
      .battlefield(DEMON, BEARS, SPIDER, 'Swamp', 'Swamp')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('X is announced first (up to the creatures that could be sacrificed), then the target, the mana and the creatures', () => {
    const g = game();
    g.act(0).activate(DEMON, { ability: 0 });
    let d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error(`expected chooseX, got ${d?.kind}`);
    expect(d.purpose).toBe('ability');
    // Three creatures can be sacrificed (the demon may be one of them): X = 0 to 3.
    expect(d.min).toBe(0);
    expect(d.max).toBe(3);
    expect(d.perX.sacrifice).toBe(1);
    g.act(0).chooseX(2);
    d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    g.act(0).chooseTargets({ player: 1 });
    // The mana, then the two creatures.
    expect(g.state.pending?.kind).toBe('payMana');
  });

  test('X = 2: two creatures of the controller choice are sacrificed, the target draws two cards and gains 2 life, the demon gets two counters', () => {
    const g = game();
    g.act(0).activate(DEMON, { ability: 0, x: 2, targets: [{ player: 0 }], pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('sacrifice');
    expect(d.forCost).toBe(true);
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    expect(d.legal).toHaveLength(3);
    g.act(0).choosePermanents(BEARS, SPIDER);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.life(0, 42);
    g.expect.counters(DEMON, { '+1/+1': 2 });
    g.expect.pt(DEMON, 5, 5);
    g.expect.invariants();
  });

  test("the target may be an opponent: they draw and gain, the counters are still the controller's", () => {
    const g = game();
    g.act(0).activate(DEMON, { ability: 0, x: 1, targets: [{ player: 1 }], pay: true });
    g.act(0).choosePermanents(SPIDER);
    g.passAll();
    g.expect.handSize(1, 1);
    g.expect.life(1, 41);
    g.expect.handSize(0, 0);
    g.expect.counters(DEMON, { '+1/+1': 1 });
  });

  test('X = 0 is a legal announcement: nothing is sacrificed, the {B} is paid, and nothing happens', () => {
    const g = game();
    g.act(0).activate(DEMON, { ability: 0, x: 0, targets: [{ player: 0 }], pay: true });
    expect(g.state.pending?.kind).toBe('priority');
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.life(0, 40);
    g.expect.counters(DEMON, {});
    expect(names(g, 0, 'battlefield')).toEqual([BEARS, DEMON, SPIDER, 'Swamp', 'Swamp'].sort());
  });

  test('every creature may be sacrificed, the demon included: X = 3 sacrifices all three and the ability resolves without it', () => {
    const g = game();
    g.act(0).activate(DEMON, { ability: 0, x: 3, targets: [{ player: 0 }], pay: true });
    // Exactly as many creatures as X: nothing is asked.
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(DEMON, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.life(0, 43);
    g.expect.invariants();
  });

  test('X is never offered above the creatures there are, nor above what the mana allows (the {B} is not X)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DEMON, BEARS, 'Swamp')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(DEMON, { ability: 0 });
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error(`expected chooseX, got ${d?.kind}`);
    expect(d.max).toBe(2);
  });

  test('without {B} the ability is not offered, even for X = 0', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DEMON, BEARS, 'Plains')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(g.act(0).try.activate(DEMON, { ability: 0 }).ok).toBe(false);
  });

  test('cancelling the sacrifice question rewinds the whole activation, mana included (CR 733)', () => {
    const g = game();
    g.act(0).activate(DEMON, { ability: 0, x: 1, targets: [{ player: 0 }], pay: true });
    expect(g.state.pending?.kind).toBe('choosePermanent');
    g.act(0).cancel();
    expect(g.state.stack).toHaveLength(0);
    expect(names(g, 0, 'battlefield')).toEqual([BEARS, DEMON, SPIDER, 'Swamp', 'Swamp'].sort());
    g.expect.tapped('Swamp[0]', false);
  });

  test('the priority decision offers the activation (X = 0 is payable) once the mana is there', () => {
    const g = game();
    const options = getLegalActions(g.state, 0);
    expect(options.some((a) => a.kind === 'activate')).toBe(true);
  });
});

describe('Partner with (CR 702.124j): when it enters, target player may search their library for the named card', () => {
  const game = (library: readonly string[], opponentLibrary: readonly string[] = LIBRARY) =>
    scenario()
      .seat(0)
      .hand(SEEKER)
      .battlefield('Swamp', { count: 3 })
      .library(...library)
      .seat(1)
      .library(...opponentLibrary)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  /** The creature is cast and resolves; its trigger asks for the target player. */
  const entered = (g: ScenarioGame) => {
    g.act(0).cast(SEEKER, { pay: true });
    g.pass();
    g.pass();
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    return d;
  };

  test('the trigger targets any player; the player may search, finds the named card, reveals it and puts it into their hand', () => {
    const g = game([...LIBRARY, QUARRY]);
    const d = entered(g);
    expect(d.specs[0]?.legal).toHaveLength(2);
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    // "may search": the player is asked first.
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards(QUARRY);
    expect(names(g, 0, 'hand')).toEqual([QUARRY]);
    g.expect.librarySize(0, 12);
    g.expect.invariants();
  });

  test('declining the search does nothing: the card stays in the library', () => {
    const g = game([...LIBRARY, QUARRY]);
    entered(g);
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    g.act(0).decline();
    expect(names(g, 0, 'hand')).toEqual([]);
    g.expect.librarySize(0, 13);
  });

  test('the other player may be the one who searches (their own library, for the same name)', () => {
    const g = game([...LIBRARY, QUARRY], [...LIBRARY, QUARRY]);
    entered(g);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`expected confirmOptional, got ${d?.kind}`);
    expect(d.seat).toBe(1);
    g.act(1).accept();
    g.act(1).chooseCards(QUARRY);
    expect(names(g, 1, 'hand')).toEqual([QUARRY]);
    g.expect.librarySize(0, 13);
  });

  test('only a card with exactly the name is found: a library without it offers nothing to choose', () => {
    const g = game([...LIBRARY, 'Grizzly Bears']);
    entered(g);
    g.act(0).chooseTargets({ player: 0 });
    g.passAll();
    // "May search" is asked all the same; nothing in the library has the name, so the search finds nothing (CR 701.23b) and nothing is asked after it.
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    expect(g.state.pending?.kind).toBe('priority');
    expect(names(g, 0, 'hand')).toEqual([]);
    g.expect.librarySize(0, 13);
    g.expect.invariants();
  });
});
