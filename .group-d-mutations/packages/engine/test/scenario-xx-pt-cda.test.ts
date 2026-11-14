// Characteristic-defining power and toughness (D-109, D-115): "This creature's power and toughness are each
// equal to the number of cards in your hand", "... to the number of lands you control", "This creature's
// power is equal to the number of creatures you control", "... to the number of creature cards in your
// graveyard".
// Pins: CR 604.3 and 604.3a (a characteristic-defining ability is a static ability that defines power or
// toughness and functions in all zones), CR 208.2a (a printed "*" is defined by it), CR 613.4a (layer 7a:
// applied before the effects that set, 7b, and modify, 7c), CR 611.3a (it is not locked in: it follows the
// board), CR 109.5 and 108.4a ("you" is the controller, or the owner outside the battlefield and the
// stack), CR 613.1f (a creature that loses all abilities loses it; a star with nothing to define it is 0),
// CR 707.2 (a copy has the copiable values, the ability included), CR 113.7a and 608.2h (a dies trigger
// reads last-known information), CR 704.5f (toughness 0 dies), CR 614.12 and 400.7 (a new object after a
// zone change), CR 208.3 (a noncreature permanent has no power or toughness). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-pt.ts) or defined in this file.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, getLegalActions, getView, stateHash } from '../src/index';
import { scenario } from '../src/testing/index';

const HYDRA = 'SYNTHETIC Hand Hydra';
const LURKER = 'SYNTHETIC Land Lurker';
const HOUND = 'SYNTHETIC Horde Hound';
const GHOUL = 'SYNTHETIC Grave Ghoul';
const LIFELINE = 'SYNTHETIC Lifeline Hydra';
const BASE_FOUR = 'SYNTHETIC Base Four';
const LAND_SHAPE = 'SYNTHETIC Land Shape';
const DRESS_DOWN = 'SYNTHETIC Dress Down';
const AURA = 'SYNTHETIC Artisan Aura';
const FROG_HEX = 'SYNTHETIC Frog Hex';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';
const SOL = 'Sol Ring';
const BOLT = 'Lightning Bolt';
const MIRROR_NAME = 'SYNTHETIC Test Mirror';
/** The first of several identical cards in the hand. */
const first = (name: string) => ({ name, zone: 'hand', nth: 0 }) as const;

/** Create a token that's a copy of target creature. */
const MIRROR = singleFace({
  name: 'SYNTHETIC Test Mirror',
  manaCost: ['1', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: "Create a token that's a copy of target creature.",
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: {
      kind: 'createToken',
      token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
      count: 1,
    },
  },
});

describe('CR 604.3, 611.3a: the number follows the board', () => {
  test('cards in your hand: 3 cards make it 3/3, and casting one makes it 2/2', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', 'Forest', BOLT)
      .battlefield(HYDRA, 'Mountain')
      .seat(1)
      .build();
    g.expect.pt(HYDRA, 3, 3);
    g.act(0).cast(first(BOLT), { targets: [{ player: 1 }], pay: true });
    g.expect.pt(HYDRA, 2, 2);
    g.passAll();
    g.expect.pt(HYDRA, 2, 2);
    g.act(0).playLand(first('Forest'));
    g.expect.pt(HYDRA, 1, 1);
    // Nothing was stored: the number is worked out each time.
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('with an empty hand it is 0/0 and dies as state-based actions are checked (CR 704.5f)', () => {
    const g = scenario().seat(0).hand('Forest').battlefield(HYDRA, 'Mountain').seat(1).build();
    g.expect.pt(HYDRA, 1, 1);
    g.act(0).playLand(first('Forest'));
    g.expect.zone(HYDRA, 'graveyard', { seat: 0 });
  });

  test('only your own hand counts', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest')
      .battlefield(HYDRA)
      .seat(1)
      .hand('Forest', 'Forest', 'Forest', 'Forest')
      .build();
    g.expect.pt(HYDRA, 1, 1);
  });

  test('lands you control: a land played adds one, a land of the opponent does not count', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest')
      .battlefield(LURKER, 'Forest', 'Forest')
      .seat(1)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();
    g.expect.pt(LURKER, 2, 2);
    g.act(0).playLand(first('Forest'));
    g.expect.pt(LURKER, 3, 3);
  });

  test('power only: "~\'s power is equal to the number of creatures you control" and the printed toughness stays', () => {
    const g = scenario()
      .seat(0)
      .battlefield(HOUND, BEARS, ELVES)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    // Three creatures (the Hound counts itself): power 3, toughness 3 as printed.
    g.expect.pt(HOUND, 3, 3);
  });

  test('combat damage uses the derived power', () => {
    const g = scenario().seat(0).battlefield(LURKER, 'Forest', 'Forest', 'Forest').seat(1).build();
    g.playCombat({ attack: [LURKER], until: 'endOfCombat' });
    g.expect.life(1, 37);
  });
});

describe('CR 604.3: a characteristic-defining ability functions in all zones', () => {
  test('in the hand it counts the cards in the hand, itself included', () => {
    const g = scenario().seat(0).hand(HYDRA, 'Forest', 'Forest').seat(1).build();
    g.expect.pt({ name: HYDRA, zone: 'hand' }, 3, 3);
  });

  test('in the library the same number is worked out from the owner’s hand', () => {
    const g = scenario().seat(0).hand('Forest').library(HYDRA, 'Forest').seat(1).build();
    g.expect.pt({ name: HYDRA, zone: 'library' }, 1, 1);
  });

  test('on the stack it counts the hand without itself: a spell is not in the hand (CR 601.2a)', () => {
    const g = scenario()
      .seat(0)
      .hand(HYDRA, 'Forest', 'Forest')
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .build();
    g.expect.pt({ name: HYDRA, zone: 'hand' }, 3, 3);
    g.act(0).cast(HYDRA, { pay: true });
    g.expect.pt({ name: HYDRA, zone: 'stack' }, 2, 2);
    g.passAll();
    g.expect.pt({ name: HYDRA, zone: 'battlefield' }, 2, 2);
  });

  test('in the graveyard: creature cards in your graveyard, itself included', () => {
    const g = scenario().seat(0).graveyard(GHOUL, BEARS, ELVES, 'Forest').seat(1).build();
    g.expect.pt({ name: GHOUL, zone: 'graveyard' }, 3, 3);
  });

  test('on the battlefield the graveyard count does not include itself; after it dies it does', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield(GHOUL, 'Mountain')
      .graveyard(BEARS, ELVES, SPIDER, 'Forest')
      .seat(1)
      .build();
    g.expect.pt(GHOUL, 3, 3);
    // It dies to a Bolt? Three toughness: a Bolt (3 damage) kills the 3/3.
    g.act(0).cast(BOLT, { targets: [GHOUL], pay: true });
    g.passAll();
    g.expect.zone(GHOUL, 'graveyard', { seat: 0 });
    g.expect.pt({ name: GHOUL, zone: 'graveyard' }, 4, 4);
  });

  test('"you" outside the battlefield is the owner: another player’s hand does not count', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest')
      .seat(1)
      .hand(HYDRA, 'Forest', 'Forest', 'Forest')
      .build();
    g.expect.pt({ name: HYDRA, zone: 'hand', seat: 1 }, 4, 4);
  });
});

describe('a dies trigger reads last-known information (CR 113.7a, 608.2h)', () => {
  test('"you gain life equal to its power" is the power it had as it died, whatever the hand does after', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT, BOLT, 'Forest')
      .battlefield(LIFELINE, 'Mountain', 'Mountain')
      .seat(1)
      .build();
    g.expect.pt(LIFELINE, 3, 3);
    // Bolt the creature: the Bolt leaves the hand, so it is 2/2 and dies to 3 damage.
    g.act(0).cast(first(BOLT), { targets: [LIFELINE], pay: true });
    g.passAll();
    g.expect.zone(LIFELINE, 'graveyard', { seat: 0 });
    // The trigger is on the stack. Seat 0 empties the hand further before it resolves.
    g.act(0).cast(first(BOLT), { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.passAll();
    // Two cards were in the hand as the creature died (the Bolt that killed it was on the stack).
    g.expect.life(0, 42);
  });
});

describe('CR 613.4a-c: layer 7a, then 7b, then 7c', () => {
  test('a setPt effect (7b) replaces the defined number; counters and a counted bonus (7c) add on top', () => {
    const g = scenario()
      .seat(0)
      .hand(BASE_FOUR, 'Forest', 'Forest')
      .battlefield('Island')
      .battlefield(HYDRA, { counters: { '+1/+1': 1 } })
      .battlefield(AURA, { attachedTo: HYDRA })
      .battlefield(SOL)
      .seat(1)
      .build();
    // 7a: cards in hand 3; 7c: +1 counter and +1 for the one artifact.
    g.expect.pt(HYDRA, 5, 5);
    g.act(0).cast(BASE_FOUR, { targets: [HYDRA], pay: true });
    g.expect.pt(HYDRA, 4, 4);
    g.passAll();
    // 7b: base 4/4, whatever the hand holds; 7c: +1 and +1 on top.
    g.expect.pt(HYDRA, 6, 6);
    g.act(0).playLand(first('Forest'));
    g.expect.pt(HYDRA, 6, 6);
  });

  test('the order does not depend on timestamps: an older effect still comes after the definition (7a first)', () => {
    // The base-P/T effect is created long after the creature entered and still wins over the definition.
    const g = scenario()
      .seat(0)
      .hand(BASE_FOUR, 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield('Island')
      .battlefield(HYDRA)
      .seat(1)
      .build();
    g.expect.pt(HYDRA, 6, 6);
    g.act(0).cast(BASE_FOUR, { targets: [HYDRA], pay: true });
    g.passAll();
    g.expect.pt(HYDRA, 4, 4);
  });

  test('base power and toughness equal to a count: counted as the effect resolves, then kept (CR 611.2c)', () => {
    const g = scenario()
      .seat(0)
      .hand(LAND_SHAPE, 'Forest')
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(HYDRA)
      .seat(1)
      .build();
    g.act(0).cast(LAND_SHAPE, { targets: [HYDRA], pay: true });
    g.passAll();
    // Four lands, two of them tapped to pay: 4/4, whatever the hand holds.
    g.expect.pt(HYDRA, 3, 3);
    g.act(0).playLand(first('Forest'));
    g.expect.pt(HYDRA, 3, 3);
    expect(g.state.continuousEffects).toHaveLength(1);
  });

  test('a noncreature permanent has no power or toughness whatever defines it (CR 208.3)', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest')
      .battlefield(HYDRA, 'Island', 'Island', 'Island')
      .hand('SYNTHETIC Rust Touch')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Rust Touch', { targets: [HYDRA], pay: true });
    g.passAll();
    const hydra = g.view(0).battlefield.find((o) => o.name === HYDRA);
    expect(hydra).toMatchObject({ power: null, toughness: null });
  });
});

describe('CR 613.1f, 604.3: losing all abilities loses the definition', () => {
  test('a star with nothing that defines it is 0: the creature dies', () => {
    const g = scenario()
      .seat(0)
      .hand(DRESS_DOWN, 'Forest', 'Forest')
      .battlefield('Island', 'Island', HYDRA)
      .seat(1)
      .build();
    g.expect.pt(HYDRA, 3, 3);
    g.act(0).cast(DRESS_DOWN, { targets: [HYDRA], pay: true });
    g.passAll();
    g.expect.zone(HYDRA, 'graveyard', { seat: 0 });
  });

  test('power only: the power is 0 and the printed toughness stays', () => {
    const g = scenario()
      .seat(0)
      .hand(DRESS_DOWN)
      .battlefield('Island', 'Island', HOUND, BEARS)
      .seat(1)
      .build();
    g.expect.pt(HOUND, 2, 3);
    g.act(0).cast(DRESS_DOWN, { targets: [HOUND], pay: true });
    g.passAll();
    g.expect.pt(HOUND, 0, 3);
  });

  test('"loses all abilities and becomes 1/1" gives the 7b base, not 0', () => {
    const g = scenario()
      .seat(0)
      .hand(FROG_HEX, 'Forest')
      .battlefield('Island', 'Island', HYDRA)
      .seat(1)
      .build();
    g.act(0).cast(FROG_HEX, { targets: [HYDRA], pay: true });
    g.passAll();
    g.expect.pt(HYDRA, 1, 1);
  });

  test('when the effect ends at cleanup the definition is back', () => {
    const g = scenario()
      .seat(0)
      .hand(DRESS_DOWN, 'Forest', 'Forest', 'Forest')
      .battlefield('Island', 'Island', HOUND, BEARS)
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .library('Forest', 'Forest', 'Forest')
      .build();
    g.act(0).cast(DRESS_DOWN, { targets: [HOUND], pay: true });
    g.passAll();
    g.expect.pt(HOUND, 0, 3);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt(HOUND, 2, 3);
  });
});

describe('CR 707.2: a copy has the ability', () => {
  test('a token copy of the creature counts the same way, from its own controller’s hand', () => {
    const g = scenario()
      .seat(0)
      .define(MIRROR)
      .hand(MIRROR_NAME, 'Forest', 'Forest')
      .battlefield('Island', 'Island')
      .battlefield(HYDRA, { label: 'original' })
      .seat(1)
      .build();
    g.act(0).cast(MIRROR_NAME, { targets: [HYDRA], pay: true });
    g.passAll();
    const bodies = g.state.battlefield
      .map((id) => g.object(id))
      .filter((o) => o.token !== null || o.id === g.id('original'));
    expect(bodies).toHaveLength(2);
    expect(bodies.filter((o) => o.token !== null)).toHaveLength(1);
    // The hand holds two Forests now: both creatures are 2/2.
    for (const o of bodies) g.expect.pt(o.id, 2, 2);
    g.act(0).playLand(first('Forest'));
    for (const o of bodies) g.expect.pt(o.id, 1, 1);
  });
});

describe('the view, legal actions and determinism', () => {
  test('the view shows the derived numbers to both seats, and hides the opponent’s hand', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest', 'Forest')
      .battlefield(HYDRA, LURKER, 'Forest', 'Forest')
      .seat(1)
      .hand(HYDRA, 'Forest')
      .build();
    for (const seat of [0, 1] as const) {
      const view = getView(g.state, seat);
      expect(view.battlefield.find((o) => o.name === HYDRA)).toMatchObject({
        power: 2,
        toughness: 2,
      });
      expect(view.battlefield.find((o) => o.name === LURKER)).toMatchObject({
        power: 2,
        toughness: 2,
      });
    }
    const mine = g.view(0);
    expect(mine.seats[1]?.hand).toBeNull();
    // The viewer's own hand shows the same numbers a card in it has.
    const own = g.view(1).seats[1]?.hand?.find((o) => o.name === HYDRA);
    expect(own).toMatchObject({ power: 2, toughness: 2 });
  });

  test('every legal action is accepted by applyAction on a board with counted bodies', () => {
    const g = scenario()
      .seat(0)
      .hand(HYDRA, LIFELINE, BOLT, 'Forest')
      .battlefield(LURKER, HOUND, GHOUL, 'Mountain', 'Island', 'Island', 'Island')
      .graveyard(BEARS)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    for (const action of getLegalActions(g.state, 0)) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
  });

  test('the same scenario twice gives the same state hash', () => {
    const build = () =>
      scenario()
        .seat(0)
        .hand('Forest', 'Forest')
        .battlefield(HYDRA, HOUND, 'Mountain')
        .seat(1)
        .battlefield(SPIDER)
        .build();
    expect(stateHash(build().state)).toBe(stateHash(build().state));
  });
});
