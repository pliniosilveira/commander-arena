// "At the beginning of each opponent's end step, if that player controls more creatures than you, create a 1/1 white Soldier creature token" and the
// same with lands and a search (the Bruna deck, Keeper of the Accord): the intervening "if" `triggerPlayerHasMore` compares the player the event is
// about (the active player of the step, `triggerPlayer`) with the controller of the ability, as the step begins and again as the ability resolves.
// Pins: CR 603.2b (a step trigger: whose turn it is), CR 603.4 (intervening if: true as the event happens and as the ability resolves),
// CR 109.4 and 110.2 (what a player controls), CR 701.23 (Search). Cards are SYNTHETIC (src/cards/fixtures/synthetic-player-more.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WARDEN = 'SYNTHETIC Accord Warden';
const TAX = 'SYNTHETIC Land Tax';
const BEARS = 'Grizzly Bears';

describe('the cards are valid', () => {
  test.each([WARDEN, TAX])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** Seat 0 has the Warden; it is seat 1's second main phase, seat 1 holds the given board. */
const board = (theirs: string[]) =>
  scenario()
    .seat(0)
    .battlefield(WARDEN)
    .library('Plains', { label: 'plains' })
    .library('Island')
    .seat(1)
    .library('Plains', 'Plains')
    .battlefield(...theirs)
    .seat(0)
    .at('postcombatMain', { active: 1 })
    .build();

describe('"if that player controls more creatures than you"', () => {
  test('an opponent with more creatures at the beginning of their end step: the token', () => {
    // seat 0 controls the Warden (1 creature); seat 1 controls two Bears
    const g = board([BEARS, BEARS]);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Soldier', 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('as many creatures is not more: nothing', () => {
    const g = board([BEARS]);
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Soldier');
  });

  test("the controller's own end step does not trigger it (each opponent's, not each player's)", () => {
    const g = scenario()
      .seat(0)
      .battlefield(WARDEN)
      .library('Plains', 'Island')
      .seat(1)
      .library('Plains')
      .battlefield(BEARS, BEARS)
      .seat(0)
      .at('postcombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Soldier');
  });

  test('the condition is read again as the ability resolves: with the count equal by then, nothing is made', () => {
    // seat 1 has two creatures as the step begins; the trigger is on the stack, then seat 1 loses one to a response
    const g = scenario()
      .seat(0)
      .battlefield(WARDEN, 'Island')
      .library('Plains', 'Island')
      .seat(1)
      .library('Plains')
      .battlefield(BEARS, BEARS)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(0)
      .at('postcombatMain', { active: 1 })
      .build();
    g.advanceTo('end');
    g.act(1)
      .cast('Lightning Bolt')
      .targets([{ name: BEARS, seat: 1, nth: 0 }])
      .pay();
    g.passAll();
    g.expect.noObject('Soldier');
  });
});

describe('"if that player controls more lands than you, you may search your library for a basic Plains card"', () => {
  test('more lands: accepted, the Plains comes onto the battlefield tapped', () => {
    const g = board(['Forest', 'Forest']);
    g.advanceTo('end');
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards('plains');
    g.expect.zone('Plains', 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped('plains', true);
    g.expect.invariants();
  });

  test('declined: nothing comes', () => {
    const g = board(['Forest', 'Forest']);
    g.advanceTo('end');
    g.passAll();
    g.act(0).decline();
    g.expect.noObject('Plains', { zone: 'battlefield' });
  });

  test('as many lands: nothing is asked', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WARDEN, 'Island')
      .library('Plains', 'Island')
      .seat(1)
      .library('Plains')
      .battlefield('Forest')
      .seat(0)
      .at('postcombatMain', { active: 1 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Plains', { zone: 'battlefield' });
  });
});

describe('a trigger of each player\'s upkeep: "that player" is the player whose turn it is', () => {
  test('the active player with more lands loses 1 life; the one with fewer does not', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TAX)
      .life(20)
      .library('Plains', 'Island')
      .seat(1)
      .life(20)
      .library('Plains', 'Island')
      .battlefield('Forest', 'Forest')
      .seat(0)
      .at('end', { active: 0 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.life(1, 19);
    g.expect.life(0, 20);
  });
});
