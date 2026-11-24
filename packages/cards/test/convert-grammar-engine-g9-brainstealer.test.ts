// Brainstealer Dragon, read from its real Oracle text and run by the engine: "At the beginning of your end step, exile the top card of each opponent's library. You may play those cards for as
// long as they remain exiled. If you cast a spell this way, you may spend mana as though it were mana of any color to cast it." and "Whenever a nonland permanent an opponent owns enters the
// battlefield under your control, they lose life equal to its mana value."
// Pins (the CR text was not available here: the numbers are those the repository's own comments cite): CR 701.13 (exile), CR 101.4 (each opponent, in turn order), CR 406.3 and 601.2 (casting a card
// from exile), CR 305.1 (playing a land), CR 609.4b (mana as though of any color), CR 611.2a (how long a permission lasts), CR 400.7 (a card that changes zone is a new object), CR 603.6a (enters
// trigger), CR 108.3 and 110.2 (owner and controller), CR 202.3 (mana value).
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const DRAGON = real('Brainstealer Dragon');
const BEARS = 'Grizzly Bears'; // {1}{G}
const BOLT = 'Lightning Bolt'; // {R}
const GRAVE_ROBBER = parsed(
  'SYNTHETIC Parsed Grave Robber',
  'Sorcery',
  "Return target creature card from an opponent's graveyard to the battlefield under your control.",
  { manaCost: '{B}', colors: ['B'] },
);
const FILLER = Array.from({ length: 6 }, () => 'Plains');
const exiledOf = (name: string, seat: 0 | 1 | 2 | 3) => ({ name, zone: 'exile' as const, seat });

describe('the card is valid', () => {
  test('validateCard', () => {
    expect(validateCard(DRAGON as CardDefinition)).toEqual([]);
  });

  test('the parsed abilities', () => {
    const abilities = DRAGON.faces[0]?.abilities ?? [];
    expect(abilities[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'endStep' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileTop', from: { kind: 'eachOpponent' } },
          { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'whileExiled', anyManaColor: true },
        ],
      },
    });
    expect(abilities[2]).toMatchObject({
      kind: 'triggered',
      trigger: {
        kind: 'entersBattlefield',
        what: { controller: 'you', notOwnedByYou: true, notTypes: ['land'] },
      },
    });
  });
});

describe('the end step trigger', () => {
  const endStep = (seats: 2 | 3 | 4) => {
    let b = scenario({ seats })
      .define(DRAGON)
      .seat(0)
      .battlefield(DRAGON.name)
      .battlefield('Swamp', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .library(BOLT, ...FILLER);
    if (seats > 2) b = b.seat(2).library(BEARS, ...FILLER);
    if (seats > 3) b = b.seat(3).library('Island', ...FILLER);
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('end');
    // Everyone passes until the trigger has resolved: no further, so the step stays the end step.
    for (let i = 0; i < 8 && g.state.stack.length > 0; i++) g.pass();
    return g;
  };

  test.each([2, 3, 4] as const)(
    'at %i seats it exiles the top card of the library of each opponent (CR 701.13, 101.4)',
    (seats) => {
      const g = endStep(seats);
      g.expect.zone(BOLT, 'exile', { seat: 1 });
      expect(g.state.seats[1]?.library.length).toBe(6);
      if (seats > 2) g.expect.zone(BEARS, 'exile', { seat: 2 });
      if (seats > 3) g.expect.zone('Island', 'exile', { seat: 3 });
      expect(g.state.seats[0]?.library.length).toBe(6);
      g.expect.invariants();
    },
  );

  test('a spell exiled this way is cast with mana of any color, and the permission outlasts the turn (CR 609.4b, 611.2a)', () => {
    const g = endStep(2);
    // {R} paid with a Swamp: only possible when any color pays for the colored symbol.
    g.act(0).cast(exiledOf(BOLT, 1), { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.invariants();
  });

  test('the cards stay castable on a later turn while they remain exiled', () => {
    const g = endStep(3);
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    expect(g.state.turn.activeSeat).toBe(0);
    g.expect.zone(BEARS, 'exile', { seat: 2 });
    g.act(0).cast(exiledOf(BEARS, 2), { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('the opponents cannot play the cards', () => {
    const g = endStep(3);
    g.expect.illegal(1, { cast: exiledOf(BOLT, 1) });
  });
});

describe('the control trigger', () => {
  test.each([2, 3, 4] as const)(
    'at %i seats a nonland permanent an opponent owns that enters under your control costs that opponent life equal to its mana value',
    (seats) => {
      let b = scenario({ seats })
        .define(DRAGON)
        .define(GRAVE_ROBBER)
        .seat(0)
        .battlefield(DRAGON.name)
        .battlefield('Swamp')
        .hand(GRAVE_ROBBER.name)
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .graveyard('Giant Spider'); // {3}{G}
      if (seats > 2) b = b.seat(2).library(...FILLER);
      if (seats > 3) b = b.seat(3).library(...FILLER);
      const g = b.at('precombatMain', { active: 0 }).build();
      g.act(0).cast(GRAVE_ROBBER.name, {
        targets: [{ name: 'Giant Spider', zone: 'graveyard', seat: 1 }],
        pay: true,
      });
      g.passAll();
      g.expect.zone('Giant Spider', 'battlefield', { seat: 0 });
      g.passAll();
      // Its owner (seat 1) loses 4 life; nobody else does.
      g.expect.life(1, 36);
      g.expect.life(0, 40);
      if (seats > 2) g.expect.life(2, 40);
      g.expect.invariants();
    },
  );

  test('a permanent that enters under your control and that you own does nothing', () => {
    const g = scenario({ seats: 2 })
      .define(DRAGON)
      .define(GRAVE_ROBBER)
      .seat(0)
      .battlefield(DRAGON.name)
      .battlefield('Swamp')
      .hand(GRAVE_ROBBER.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .graveyard('Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(GRAVE_ROBBER.name, {
      targets: [{ name: 'Giant Spider', zone: 'graveyard', seat: 1 }],
      pay: true,
    });
    g.passAll();
    g.expect.life(0, 40);
  });
});
