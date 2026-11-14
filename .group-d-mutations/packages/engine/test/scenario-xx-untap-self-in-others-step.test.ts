// "Untap this artifact during each other player's untap step." (D-320): the static ability `untapInOthersUntapStep` with `self: true`: the permanent itself
// untaps, at the same time as the active player's permanents, in the untap step of every player but its controller.
// Pins: CR 502.3 (the active player's permanents untap simultaneously; effects can add to or keep permanents from untapping), CR 604.1 (a static
// ability does something all the time), CR 110.2 / 108.4 (the controller of a permanent is a player; control can differ from ownership), CR 305.8
// (an artifact untaps like any permanent). Per D-229 "doesn't untap during your untap step" is about the controller's own step and does not stop the extra untap.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-niv-primitives.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const FLASK = 'SYNTHETIC Dew Flask'; // untaps in each other player's untap step; {T}: {C}
const SLEEPY = 'SYNTHETIC Sleepy Flask'; // the same, and doesn't untap in its controller's untap step
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

/** Seat 0's turn 1 ends next: the following untap step is seat 1's, then seat 0's (turn 3). */
const atEndOfSeat0 = (setup: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  setup(
    scenario()
      .seat(0)
      .library(...LIBRARY),
  )
    .seat(1)
    .library(...LIBRARY)
    .at('end', { active: 0, turn: 1 })
    .build();

describe('the cards are valid', () => {
  test.each([FLASK, SLEEPY])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe("Untap this artifact during each other player's untap step (CR 502.3)", () => {
  test("it untaps in the opponent's untap step", () => {
    const g = atEndOfSeat0((b) => b.battlefield(FLASK, { tapped: true }));
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(1);
    g.expect.tapped(FLASK, false);
    g.expect.invariants();
  });

  test('the control: an ordinary artifact stays tapped in the opponent untap step', () => {
    const g = atEndOfSeat0((b) => b.battlefield('Sol Ring', { tapped: true }));
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('Sol Ring', true);
  });

  test('it is not extra in its controller untap step: with "doesn\'t untap" it stays tapped there, and untaps in the opponent\'s', () => {
    const g = atEndOfSeat0((b) => b.battlefield(SLEEPY, { tapped: true }));
    g.advanceTo('upkeep', { turn: 'next' }); // seat 1's untap step
    g.expect.tapped(SLEEPY, false);
    g.pass(1); // the active player passes: seat 0 may tap it for mana on the opponent's turn
    g.act(0).tapForMana(SLEEPY);
    g.expect.tapped(SLEEPY, true);
    g.advanceTo('upkeep', { turn: 'next' }); // seat 0's own untap step: "doesn't untap"
    expect(g.state.turn.activeSeat).toBe(0);
    g.expect.tapped(SLEEPY, true);
    g.advanceTo('upkeep', { turn: 'next' }); // seat 1's next untap step: untaps again
    expect(g.state.turn.activeSeat).toBe(1);
    g.expect.tapped(SLEEPY, false);
  });

  test("an untapped one stays untapped (it only untaps what is tapped); nothing is tapped for the controller's own turn", () => {
    const g = atEndOfSeat0((b) => b.battlefield(FLASK));
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(FLASK, false);
    g.expect.noEvent({ kind: 'untapped', object: g.id(FLASK) });
  });

  test('a normal one untaps in its controller own untap step as always', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(FLASK, { tapped: true })
      .seat(1)
      .library(...LIBRARY)
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep');
    expect(g.state.turn.activeSeat).toBe(0);
    g.expect.tapped(FLASK, false);
  });

  test('a stolen one untaps in the untap steps of the other players, relative to its new controller', () => {
    // Owned by seat 1, controlled by seat 0: seat 1 is "another player" now.
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SLEEPY, { tapped: true, controller: 0 })
      .at('end', { active: 0, turn: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' }); // seat 1's untap step: it is the owner, not the controller
    g.expect.tapped({ name: SLEEPY, seat: 0 }, false);
    g.pass(1);
    g.act(0).tapForMana({ name: SLEEPY, seat: 0 });
    g.advanceTo('upkeep', { turn: 'next' }); // seat 0, the controller: "doesn't untap"
    g.expect.tapped({ name: SLEEPY, seat: 0 }, true);
  });

  test('under its owner it untaps in the untap step of the other player (the opponent), not its own', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(SLEEPY, { tapped: true })
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep'); // seat 0's untap step: seat 1 owns and controls it, so seat 0 is the other player
    expect(g.state.turn.activeSeat).toBe(0);
    g.expect.tapped(SLEEPY, false);
  });

  test('two of them each untap once', () => {
    const g = atEndOfSeat0((b) =>
      b.battlefield(FLASK, { tapped: true }).battlefield(SLEEPY, { tapped: true }),
    );
    const mark = g.mark();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped(FLASK, false);
    g.expect.tapped(SLEEPY, false);
    const untapped = g.eventsSince(mark).filter((e) => e.kind === 'untapped');
    expect(untapped).toHaveLength(2);
  });

  test('two copies of the same card both untap', () => {
    const g = atEndOfSeat0((b) => b.battlefield(FLASK, { tapped: true, count: 2 }));
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.find({ name: FLASK, zone: 'battlefield' }).every((o) => !o.tapped)).toBe(true);
  });

  test('it is tapped for mana on every opponent turn and untaps again at the next one', () => {
    const g = atEndOfSeat0((b) => b.battlefield(SLEEPY, { tapped: true }));
    for (let cycle = 0; cycle < 3; cycle++) {
      g.advanceTo('upkeep', { turn: 'next' }); // the opponent's untap step
      expect(g.state.turn.activeSeat).toBe(1);
      g.expect.tapped(SLEEPY, false);
      g.pass(1);
      g.act(0).tapForMana(SLEEPY);
      g.expect.tapped(SLEEPY, true);
      g.advanceTo('upkeep', { turn: 'next' }); // its controller's own untap step: it stays tapped
      expect(g.state.turn.activeSeat).toBe(0);
      g.expect.tapped(SLEEPY, true);
    }
  });
});

describe('validation', () => {
  const withStatic = (staticEffect: unknown) => ({
    ...syntheticCard(FLASK),
    faces: [
      {
        ...syntheticCard(FLASK).faces[0],
        abilities: [{ kind: 'static', static: staticEffect }],
      },
    ],
  });

  test('exactly one of `what` and `self`', () => {
    expect(
      validateCard(withStatic({ kind: 'untapInOthersUntapStep' }) as never).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withStatic({
          kind: 'untapInOthersUntapStep',
          self: true,
          what: { types: ['creature'], controller: 'you' },
        }) as never,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withStatic({ kind: 'untapInOthersUntapStep', self: false }) as never).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withStatic({ kind: 'untapInOthersUntapStep', self: true }) as never),
    ).toEqual([]);
    expect(
      validateCard(
        withStatic({
          kind: 'untapInOthersUntapStep',
          what: { types: ['creature'], controller: 'you' },
        }) as never,
      ),
    ).toEqual([]);
  });
});
