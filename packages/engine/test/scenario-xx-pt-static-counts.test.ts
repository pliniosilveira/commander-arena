// Counted amounts in static power and toughness bonuses (D-109, D-115): "Equipped creature gets +1/+1
// for each artifact you control", "This creature gets +1/+1 for each other creature you control",
// "Other creatures you control get +1/+1 for each Elf you control", "-1/-1 for each creature card in your
// graveyard".
// Pins: CR 611.3a (a continuous effect from a static ability isn't "locked in": the count is taken at
// every moment, so adding or removing an artifact changes the bonus at once), CR 611.3b (only while the
// permanent is on the battlefield), CR 613.4c (layer 7c: counters and +N/+N effects add), CR 613.1d
// (counting reads types as layer 4 leaves them: a creature that became an artifact is counted), CR 613.1f
// (a permanent that loses all abilities loses its static abilities), CR 704.5f (toughness 0 or less dies),
// CR 613.8 (nothing a count reads depends on layer 7), CR 109.5 ("you" is the controller of the
// permanent a static ability is on). Cards are SYNTHETIC (src/cards/fixtures/synthetic-pt.ts) or defined
// in this file.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getView, stateHash } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BLADE = 'SYNTHETIC Artisan Blade';
const AURA = 'SYNTHETIC Artisan Aura';
const CHILL = 'SYNTHETIC Grave Chill Aura';
const WOLF = 'SYNTHETIC Pack Wolf';
const CHANTER = 'SYNTHETIC Elf Chanter';
const SCOUT = 'SYNTHETIC Elf Scout';
const GOLEM = 'SYNTHETIC Stone Golem';
const DRESS_DOWN = 'SYNTHETIC Dress Down';
const RUST = 'SYNTHETIC Rust Touch';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider'; // 2/4 in the fixtures
const SOL = 'Sol Ring';
const BOLT = 'Lightning Bolt';

/** Destroy target artifact. */
const SHATTER = singleFace({
  name: 'SYNTHETIC Test Shatter',
  manaCost: ['R'],
  types: ['instant'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'Destroy target artifact.',
  spell: {
    targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['artifact'] } } }],
    effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
  },
});

describe('CR 611.3a: an Equipment or Aura bonus counted from the board follows the board', () => {
  test('Equipped creature gets +1/+1 for each artifact you control (the Equipment itself counts)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 3, 3);
  });

  test('it grows when an artifact enters and shrinks when one is destroyed, with no new effect stored', () => {
    const g = scenario()
      .seat(0)
      .hand(SOL, 'SYNTHETIC Test Shatter')
      .define(SHATTER)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS, 'Forest', 'Mountain', 'Mountain')
      .seat(1)
      .build();
    g.expect.pt(BEARS, 3, 3);
    g.act(0).cast(SOL, { pay: true });
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    g.act(0).cast('SYNTHETIC Test Shatter', { targets: [SOL], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 3, 3);
    // The bonus is the Equipment's static ability: nothing was added to the continuous effects.
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('destroying the Equipment itself takes the whole bonus away', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Test Shatter')
      .define(SHATTER)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS, 'Mountain', SOL)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 4, 4);
    g.act(0).cast('SYNTHETIC Test Shatter', { targets: [BLADE], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
  });

  test('an artifact the opponent controls is not counted ("you control", CR 109.5)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(SOL, { count: 3 })
      .build();
    g.expect.pt(BEARS, 3, 3);
  });

  test('"you" is the controller of the Equipment, not of the creature it is attached to', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: SPIDER })
      .battlefield(SOL)
      .seat(1)
      .battlefield(SPIDER, SOL, SOL, SOL)
      .build();
    // Seat 0 controls the Equipment and the Sol Ring: two artifacts; seat 1's three do not count.
    g.expect.pt(SPIDER, 4, 6);
  });

  test('an artifact creature is counted: types are read after layer 4 (CR 613.1d)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS, GOLEM)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 4, 4);
    g.expect.pt(GOLEM, 2, 2);
  });

  test('a creature that becomes an artifact until end of turn is counted while it is one', () => {
    const g = scenario()
      .seat(0)
      .hand(RUST)
      .battlefield('Island')
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS, SPIDER)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 3, 3);
    g.act(0).cast(RUST, { targets: [SPIDER], pay: true });
    g.passAll();
    // The Spider is now an artifact and no longer a creature: it is counted (an artifact), and has no P/T.
    g.expect.pt(BEARS, 4, 4);
  });

  test('an Aura counts the same way', () => {
    const g = scenario()
      .seat(0)
      .battlefield(AURA, { attachedTo: BEARS })
      .battlefield(BEARS, SOL, SOL)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 4, 4);
  });

  test('a negative multiple: -1/-1 for each creature card in your graveyard; at 0 toughness it dies', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CHILL, { attachedTo: BEARS })
      .battlefield(BEARS)
      .graveyard('Llanowar Elves')
      .seat(1)
      .graveyard('Giant Spider')
      .build();
    // One creature card in seat 0's graveyard (the opponent's does not count): 2/2 - 1/1.
    g.expect.pt(BEARS, 1, 1);
  });

  test('a creature that dies adds to the count: the shrinking creature reaches 0 toughness and dies (CR 704.5f)', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield(CHILL, { attachedTo: BEARS })
      .battlefield(BEARS, 'Llanowar Elves', 'Mountain')
      .graveyard(SPIDER)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 1, 1);
    g.act(0).cast(BOLT, { targets: ['Llanowar Elves'], pay: true });
    g.passAll();
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(CHILL, 'graveyard', { seat: 0 });
  });
});

describe('a creature with its own counted bonus, and a lord scaled by a count', () => {
  test('"+1/+1 for each other creature you control" counts the others, not itself, and not the opponent’s', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WOLF, BEARS, 'Llanowar Elves')
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.expect.pt(WOLF, 3, 3);
    g.expect.pt(BEARS, 2, 2);
  });

  test('alone it is its printed 1/1', () => {
    const g = scenario().seat(0).battlefield(WOLF).seat(1).build();
    g.expect.pt(WOLF, 1, 1);
  });

  test('a creature that dies takes its bonus with it', () => {
    const g = scenario().seat(0).hand(BOLT).battlefield(WOLF, BEARS, 'Mountain').seat(1).build();
    g.expect.pt(WOLF, 2, 2);
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(WOLF, 1, 1);
  });

  test('it adds to a +1/+1 counter and to another static bonus (layer 7c adds)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WOLF, { counters: { '+1/+1': 1 } })
      .battlefield(AURA, { attachedTo: WOLF })
      .battlefield(BEARS)
      .seat(1)
      .build();
    // 1/1 + counter 1 + one other creature + one artifact? The Aura is an enchantment: 0 artifacts.
    g.expect.pt(WOLF, 3, 3);
  });

  test('Other creatures you control get +1/+1 for each Elf you control (the lord counts itself as an Elf)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CHANTER, SCOUT, BEARS)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    // Two Elves (the lord and the Scout): each other creature gets +2/+2; the lord gets nothing itself.
    g.expect.pt(CHANTER, 1, 1);
    g.expect.pt(SCOUT, 3, 3);
    g.expect.pt(BEARS, 4, 4);
    g.expect.pt(SPIDER, 2, 4);
  });

  test('two lords of the same kind each apply: the count is the same for both', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CHANTER, { label: 'a' })
      .battlefield(CHANTER, { label: 'b' })
      .battlefield(BEARS)
      .seat(1)
      .build();
    // Two Elves: each lord gives +2/+2 to the creatures other than itself.
    g.expect.pt('a', 3, 3);
    g.expect.pt('b', 3, 3);
    g.expect.pt(BEARS, 6, 6);
  });
});

describe('CR 613.1f and 611.3b: when the static ability goes away, so does the bonus', () => {
  test('a creature that loses all abilities loses its counted bonus', () => {
    const g = scenario()
      .seat(0)
      .hand(DRESS_DOWN)
      .battlefield('Island', 'Island', WOLF, BEARS, 'Llanowar Elves')
      .seat(1)
      .build();
    g.expect.pt(WOLF, 3, 3);
    g.act(0).cast(DRESS_DOWN, { targets: [WOLF], pay: true });
    g.passAll();
    g.expect.pt(WOLF, 1, 1);
  });

  test('a lord that loses all abilities gives nothing', () => {
    const g = scenario()
      .seat(0)
      .hand(DRESS_DOWN)
      .battlefield('Island', 'Island', CHANTER, BEARS)
      .seat(1)
      .build();
    g.expect.pt(BEARS, 3, 3);
    g.act(0).cast(DRESS_DOWN, { targets: [CHANTER], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 2, 2);
  });

  test('an Equipment that is not attached gives nothing, and one in the hand does not count itself', () => {
    const g = scenario().seat(0).hand(BLADE).battlefield(BEARS, SOL).seat(1).build();
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('the view and determinism', () => {
  test('every seat sees the number the engine derives', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BLADE, { attachedTo: BEARS })
      .battlefield(BEARS, SOL, SOL)
      .seat(1)
      .build();
    for (const seat of [0, 1] as const) {
      const bears = getView(g.state, seat).battlefield.find((o) => o.name === BEARS);
      expect(bears).toMatchObject({ power: 5, toughness: 5 });
    }
  });

  test('the same scenario twice gives the same state hash, and derive is repeatable', () => {
    const build = (): ScenarioGame =>
      scenario()
        .seat(0)
        .battlefield(CHANTER, SCOUT, BEARS)
        .battlefield(BLADE, { attachedTo: BEARS })
        .battlefield(SOL)
        .seat(1)
        .battlefield(SPIDER)
        .build();
    const a = build();
    const b = build();
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    // Two Elves give +2/+2 and two artifacts give +2/+2 on top of 2/2.
    a.expect.pt(BEARS, 6, 6);
  });
});
