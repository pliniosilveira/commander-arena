// Group 1 of the Galadriel deck (issue 43): "Whenever you scry or surveil, draw a card" (Matoya, Archon Elder), "Whenever this creature or another creature you control enters, scry 1.
// If this is the second time this ability has resolved this turn, the Ring tempts you." (Elrond, Lord of Rivendell) and "Whenever the Ring tempts you, if you chose a creature other than
// this creature as your Ring-bearer, scry 3. Whenever you scry, you may reveal the top card of your library. If a land card is revealed this way, put it onto the battlefield tapped."
// (Galadriel of Lothlorien).
// Pins: CR 701.22 (scry) and 701.25 (surveil), 603.2c (one ability for each event), 603.4 (the intervening "if" is read as the ability triggers and again as it resolves), 608.2c (the
// instruction is read as it comes up), 701.54a and 701.54d (the Ring tempts you: the creature chosen is the Ring-bearer), 701.20a (revealing shows the card), 603.5 ("you may").
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-galadriel-g1.ts); the real cards are played in packages/cards/test/convert-grammar-engine-galadriel-g1.test.ts.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WARDEN = 'SYNTHETIC Rivendell Warden'; // enters / another creature enters: scry 1; the second time it resolves in a turn the Ring tempts you
const LADY = 'SYNTHETIC Lorien Lady'; // the Ring tempts you (another creature chosen): scry 3; whenever you scry: may reveal the top card, a land goes onto the battlefield tapped
const SEER = 'SYNTHETIC Archon Seer'; // whenever you scry or surveil: draw a card
const QUIET = 'SYNTHETIC Quiet Look'; // surveil 2
const SIGHT = 'SYNTHETIC Clear Sight'; // scry 2
const RITE = 'SYNTHETIC Ring Rite'; // the Ring tempts you
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 10 }, () => 'Island');

const defs = () =>
  scenario()
    .define(syntheticCard(WARDEN))
    .define(syntheticCard(LADY))
    .define(syntheticCard(SEER))
    .define(syntheticCard(QUIET))
    .define(syntheticCard(SIGHT))
    .define(syntheticCard(RITE));

describe('the cards are valid', () => {
  test.each([WARDEN, LADY, SEER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('Matoya: "Whenever you scry or surveil, draw a card"', () => {
  const board = (library: readonly string[] = LIBRARY) =>
    defs()
      .seat(0)
      .library(...library)
      .hand(SIGHT, QUIET)
      .battlefield('Island', 'Island')
      .battlefield(SEER)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('a scry draws a card, after the scry is done', () => {
    const g = board();
    g.act(0).cast(SIGHT, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.expect.stack([`${SEER} (ability)`]);
    g.expect.handSize(0, 1); // the other card of the hand, the surveil, is left; the scry spell is gone
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('a surveil draws a card too (its own event, CR 701.25)', () => {
    const g = board();
    g.act(0).cast(QUIET, { pay: true });
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.expect.stack([`${SEER} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('a surveil of an empty library is still a surveil (CR 701.25d), and "surveil 0" is none', () => {
    const g = board([]);
    g.act(0).cast(QUIET, { pay: true });
    g.passAll();
    // The surveil looked at no card and the ability still triggered: it drew from the empty library, which loses the game (CR 704.5b).
    g.expect.hasLost(0);
  });

  test("an opponent's scry draws nothing for you", () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SEER)
      .seat(1)
      .library(...LIBRARY)
      .hand(SIGHT)
      .battlefield('Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(SIGHT, { pay: true });
    g.passAll();
    g.act(1).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.expect.stack([]);
    g.expect.handSize(0, 0);
  });
});

describe('Elrond: "If this is the second time this ability has resolved this turn, the Ring tempts you"', () => {
  const board = () =>
    defs()
      .seat(0)
      .library(...LIBRARY)
      .hand(BEARS, BEARS, BEARS, WARDEN)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Island', 'Island')
      .battlefield(WARDEN, { label: 'warden' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  /** Casts the next Grizzly Bears of the hand and resolves the creature spell and its trigger; the scry is answered by keeping the card. */
  const castBears = (g: ScenarioGame) => {
    g.act(0).cast({ name: BEARS, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll(); // the creature spell resolves; the ability goes on the stack
    g.passAll(); // the ability resolves: scry 1
    g.act(0).arrange({ top: ['Island[0]'] });
  };

  test('the first creature scries only; the second scries and the Ring tempts you', () => {
    const g = board();
    castBears(g);
    g.expect.ringLevel(0, 0);
    castBears(g);
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('warden');
    g.expect.ringLevel(0, 1);
    g.expect.ringBearer(0, 'warden');
    g.expect.invariants();
  });

  test('the third time is not "the second time": the Ring tempts you once only', () => {
    const g = board();
    castBears(g);
    castBears(g);
    g.act(0).choosePermanents('warden');
    castBears(g);
    g.expect.pending('priority', 0);
    g.expect.ringLevel(0, 1);
  });

  test('the Warden entering and one more creature are the two times: the ability of the Warden and the one of the others count together (one printed ability)', () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .hand(WARDEN, BEARS)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Island', 'Island')
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast({ name: WARDEN, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]'] });
    g.expect.ringLevel(0, 0);
    g.act(0).cast({ name: BEARS, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll();
    g.passAll();
    g.act(0).arrange({ top: ['Island[0]'] });
    g.expect.pending('choosePermanent', 0);
  });

  test('the count starts again in the next turn', () => {
    const g = board();
    castBears(g);
    g.advanceTo('precombatMain', { turn: 3 });
    castBears(g);
    g.expect.ringLevel(0, 0);
  });

  test("an opponent's creatures entering are not this ability's events", () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WARDEN)
      .seat(1)
      .library(...LIBRARY)
      .hand(BEARS, BEARS)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast({ name: BEARS, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll();
    g.expect.stack([]);
  });
});

describe('Galadriel: the Ring tempts you and you scry', () => {
  const board = (library: readonly string[] = LIBRARY, ...extra: string[]) =>
    defs()
      .seat(0)
      .library(...library)
      .hand(RITE)
      .battlefield('Swamp', 'Swamp')
      .battlefield(LADY, { label: 'lady' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(...extra)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  /** The Ring tempts seat 0 and the Ring-bearer chosen is `bearer`; leaves the scry 3 of the Lady on the stack. */
  const temptWith = (g: ScenarioGame, bearer: string) => {
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(bearer);
  };

  test('another creature as the Ring-bearer: scry 3 (the look is of three cards)', () => {
    const g = board();
    temptWith(g, 'bears');
    g.expect.stack([`${LADY} (ability)`]);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'arrangeCards') throw new Error(`expected arrangeCards, got ${d?.kind}`);
    expect(d.cards).toHaveLength(3);
  });

  test('the Lady herself as the Ring-bearer: no scry (the intervening "if" is false)', () => {
    const g = board();
    temptWith(g, 'lady');
    g.expect.ringBearer(0, 'lady');
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('with no other creature the Lady is the only one to choose, and nothing scries', () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .hand(RITE)
      .battlefield('Swamp', 'Swamp')
      .battlefield(LADY, { label: 'lady' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.ringBearer(0, 'lady');
    g.expect.stack([]);
  });

  test('the Ring tempts you with no creature but the Lady gone: she is not there, nothing triggers', () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .hand(RITE)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.ringLevel(0, 1);
    g.expect.stack([]);
  });

  test('whenever you scry: a land on top is revealed and put onto the battlefield tapped', () => {
    const g = board(['Forest', 'Island', 'Island', 'Island']);
    temptWith(g, 'bears');
    g.passAll(); // scry 3 resolves: look at Forest, Island, Island
    g.act(0).arrange({ top: ['Forest[0]', 'Island[0]', 'Island[1]'] });
    // The scry made the Lady's second ability trigger; "you may reveal" is asked as it resolves.
    g.expect.stack([`${LADY} (ability)`]);
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.eventLog([{ kind: 'cardsRevealed', seat: 0, from: 'library' }], { since: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
    g.expect.tapped('Forest');
    g.expect.librarySize(0, 3);
  });

  test('a card that is not a land stays on top and nothing happens, but it was revealed', () => {
    const g = board(['Grizzly Bears', 'Island', 'Island', 'Island']);
    temptWith(g, 'bears');
    g.passAll();
    g.act(0).arrange({ top: ['Grizzly Bears[0]', 'Island[0]', 'Island[1]'] });
    g.passAll();
    g.act(0).accept();
    g.expect.eventLog(
      [{ kind: 'cardsRevealed', seat: 0, names: ['Grizzly Bears'], from: 'library' }],
      {
        since: 0,
      },
    );
    g.expect.librarySize(0, 4);
    g.expect.zone('Grizzly Bears', 'library', { seat: 0 });
  });

  test('declining "you may reveal" reveals nothing and leaves the top card where it is', () => {
    const g = board(['Forest', 'Island', 'Island', 'Island']);
    temptWith(g, 'bears');
    g.passAll();
    g.act(0).arrange({ top: ['Forest[0]', 'Island[0]', 'Island[1]'] });
    g.passAll();
    g.act(0).decline();
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.librarySize(0, 4);
    g.expect.noObject('Forest', { zone: 'battlefield' });
  });

  test('an empty library has no card to reveal', () => {
    const g = board([]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).choosePermanents('bears');
    g.passAll(); // scry 3 of an empty library: a scry of no cards (CR 701.22d), which still triggers her second ability
    g.expect.stack([`${LADY} (ability)`]);
    g.passAll();
    g.act(0).accept();
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.invariants();
  });

  test("the opponent's scry does not trigger her", () => {
    const g = defs()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(LADY)
      .seat(1)
      .library(...LIBRARY)
      .hand(SIGHT)
      .battlefield('Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(SIGHT, { pay: true });
    g.passAll();
    g.act(1).arrange({ top: ['Island[0]', 'Island[1]'] });
    g.expect.stack([]);
  });
});
