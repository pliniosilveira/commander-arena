// The other SYNTHETIC cards of group 2 of the Hylda deck (D-1510 to D-1518, `synthetic-hylda-g2.ts`): Gale Binder (tap everything a chosen opponent controls), Frost Gust (X targets),
// Chill Spirit (a trigger of casting an instant or sorcery), Drowsy Aura (an intervening "if" about the permanent the Aura enchants), Slumber Geist ("choose up to one"),
// Dawn Siege (a choice of a named option as it enters and a trigger of the opponent's combat), Ghost Sentinel (four card types in the graveyard), Winter Crown (a cost reduction
// that depends on the turn).
// Pins: CR 701.26 (tap and untap), CR 603.4 (an intervening "if" is read when the event happens and again as the ability resolves), CR 700.2b (a modal triggered ability that
// chooses no mode is removed from the stack), CR 614.12, 607.2d (a choice made as a permanent enters), CR 205.2a (card types), CR 601.2f, 602.2b (the total cost, reduced
// generic mana), CR 107.3a (X is announced before the targets).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BINDER = 'SYNTHETIC Gale Binder';
const GUST = 'SYNTHETIC Frost Gust';
const SPIRIT = 'SYNTHETIC Chill Spirit';
const AURA = 'SYNTHETIC Drowsy Aura';
const GEIST = 'SYNTHETIC Slumber Geist';
const SIEGE = 'SYNTHETIC Dawn Siege';
const SENTINEL = 'SYNTHETIC Ghost Sentinel';
const CROWN = 'SYNTHETIC Winter Crown';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';
const LIB = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

const keptTapped = (g: ScenarioGame) =>
  g.state.continuousEffects.filter((e) => e.until === 'nextUntapStep');

describe('the cards are valid', () => {
  test.each([BINDER, GUST, SPIRIT, AURA, GEIST, SIEGE, SENTINEL, CROWN])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('Gale Binder: when it enters, tap all creatures target opponent controls', () => {
  test('every creature of the chosen opponent is tapped, none of mine, and they untap as usual', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(BINDER)
      .battlefield('Island', { count: 4 })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BINDER, { pay: true });
    g.passAll();
    // The trigger has the one opponent as its only legal target.
    g.passAll();
    g.expect.tapped('a', true);
    g.expect.tapped('b', true);
    g.expect.tapped('mine', false);
    expect(keptTapped(g)).toHaveLength(0);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('a', false);
    g.expect.tapped('b', false);
  });
});

describe('Frost Gust: tap X target creatures, and keep them tapped with a creature of power 4 or more', () => {
  const gustGame = (withAngel: boolean): ScenarioGame => {
    const b = scenario()
      .seat(0)
      .library(...LIB)
      .hand(GUST)
      .battlefield('Island', { count: 4 })
      .battlefield(BEARS, { label: 'mine' });
    if (withAngel) b.battlefield(ANGEL);
    return b
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('with a creature of power 4 or more: X creatures are tapped and miss the untap step of their controller', () => {
    const g = gustGame(true);
    g.act(0).cast(GUST, { x: 2, targets: ['a', 'b'], pay: true });
    g.passAll();
    g.expect.tapped('a', true);
    g.expect.tapped('b', true);
    expect(keptTapped(g)).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('a', true);
    g.expect.tapped('b', true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('a', false);
  });

  test('without one the creatures are only tapped', () => {
    const g = gustGame(false);
    g.act(0).cast(GUST, { x: 2, targets: ['a', 'b'], pay: true });
    g.passAll();
    g.expect.tapped('a', true);
    expect(keptTapped(g)).toHaveLength(0);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('a', false);
  });

  test('X is the number of targets: X = 1 taps one creature, X = 0 none', () => {
    const one = gustGame(false);
    one.act(0).cast(GUST, { x: 1, targets: ['a'], pay: true });
    one.passAll();
    one.expect.tapped('a', true);
    one.expect.tapped('b', false);
    const none = gustGame(false);
    none.act(0).cast(GUST, { x: 0, pay: true });
    none.passAll();
    none.expect.tapped('a', false);
    none.expect.tapped('b', false);
  });
});

describe('Chill Spirit: whenever you cast an instant or sorcery spell, tap a creature of an opponent and keep it tapped', () => {
  test('casting an instant taps the creature chosen and it misses its next untap step', () => {
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(SPIRIT)
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'a' })
      .battlefield(SPIDER, { label: 'b' })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    // Prowess and the tap trigger of the Spirit: the order of two triggers of the controller.
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('a');
    g.passAll();
    g.expect.tapped('a', true);
    g.expect.tapped('b', false);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('a', true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.tapped('a', false);
  });
});

describe('Drowsy Aura: at the beginning of each upkeep, if enchanted creature is untapped, tap it', () => {
  const auraGame = (tapped: boolean): ScenarioGame =>
    scenario()
      .seat(0)
      .library(...LIB)
      .battlefield(BEARS, { label: 'host', tapped })
      .battlefield(AURA, { attachedTo: 'host' })
      .seat(1)
      .library(...LIB)
      .at('end', { active: 1, turn: 2 })
      .build();

  test('an untapped creature is tapped as the upkeep begins, after its untap step', () => {
    const g = auraGame(true);
    // Turn 3: the creature untaps in the untap step, and the Aura taps it again in the upkeep.
    g.advanceTo('upkeep');
    g.expect.tapped('host', false);
    g.passAll();
    g.expect.tapped('host', true);
  });

  test('the ability is read again as it resolves: a creature that is tapped in response is not tapped again (no effect either way)', () => {
    const g = auraGame(false);
    g.advanceTo('upkeep');
    g.expect.stack([`${AURA} (ability)`]);
    g.passAll();
    g.expect.tapped('host', true);
  });

  test('a tapped creature does not trigger it at all', () => {
    const g = auraGame(true);
    // Turn 3's upkeep untaps it first, so use the opponent's: it is seat 0's creature, tapped by the Aura at the previous upkeep and still tapped.
    g.advanceTo('upkeep');
    g.passAll();
    g.expect.tapped('host', true);
    g.advanceTo('upkeep', { turn: 'next' });
    // Seat 1's upkeep (turn 4): the creature is tapped, nothing triggers.
    g.expect.stack([]);
  });
});

describe('Slumber Geist: "choose up to one" (CR 700.2b)', () => {
  const geistGame = (): ScenarioGame =>
    scenario()
      .seat(0)
      .library(...LIB)
      .battlefield(GEIST)
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'bears' })
      .at('upkeep', { active: 0 })
      .build();

  test('the question lists no mode, the first mode or the second', () => {
    const g = geistGame();
    g.advanceTo('beginningOfCombat');
    g.expect.pending('chooseModes', 0);
    const sets = g
      .legalActions(0)
      .flatMap((a) => (a.kind === 'chooseModes' ? [[...a.modes]] : []))
      .sort();
    expect(sets).toEqual([[], [0], [1]]);
  });

  test('the first mode taps a creature', () => {
    const g = geistGame();
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseModes(0);
    g.act(0).chooseTargets('bears');
    g.passAll();
    g.expect.tapped('bears', true);
    expect(keptTapped(g)).toHaveLength(0);
  });

  test('the second mode keeps a creature from untapping', () => {
    const g = geistGame();
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseModes(1);
    g.act(0).chooseTargets('bears');
    g.passAll();
    expect(keptTapped(g)).toHaveLength(1);
  });

  test('no mode: the ability is removed from the stack and does nothing', () => {
    const g = geistGame();
    g.advanceTo('beginningOfCombat');
    g.act(0).chooseModes();
    expect(g.events.some((e) => e.kind === 'abilityRemoved' && e.reason === 'noModeChosen')).toBe(
      true,
    );
    g.expect.stack([]);
    g.expect.tapped('bears', false);
    expect(keptTapped(g)).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('Dawn Siege: choose Khans or Dragons as it enters', () => {
  const siegeGame = (): ScenarioGame =>
    scenario()
      .seat(0)
      .library(...LIB)
      .hand(SIEGE)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('Dragons: at the beginning of combat on an opponent turn the creature of that player is tapped; on my turn nothing happens', () => {
    const g = siegeGame();
    g.act(0).cast(SIEGE, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('Dragons');
    g.advanceTo('beginningOfCombat');
    // My own beginning of combat: the Khans ability is not on.
    g.expect.stack([]);
    g.advanceTo('beginningOfCombat', { turn: 'next' });
    g.expect.step('beginningOfCombat', { active: 1 });
    g.expect.stack([`${SIEGE} (ability)`]);
    g.passAll();
    g.expect.tapped('theirs', true);
    g.expect.tapped('mine', false);
  });

  test('Khans: the counters on my turn, and nothing on the turn of an opponent', () => {
    const g = siegeGame();
    g.act(0).cast(SIEGE, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Khans');
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 2 });
    g.advanceTo('beginningOfCombat', { turn: 'next' });
    g.expect.stack([]);
    g.expect.tapped('theirs', false);
  });
});

describe('Ghost Sentinel: four card types among cards in your graveyard', () => {
  const sentinelGame = (graveyard: readonly string[]): ScenarioGame =>
    scenario()
      .seat(0)
      .library(...LIB)
      .battlefield(SENTINEL)
      .graveyard(...graveyard)
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'theirs' })
      .at('end', { active: 0, turn: 1 })
      .build();

  test('four types: at the opponent upkeep the creature of that player is tapped', () => {
    const g = sentinelGame([BOLT, 'Island', 'Sol Ring', BEARS]);
    g.advanceTo('upkeep');
    g.expect.stack([`${SENTINEL} (ability)`]);
    g.passAll();
    g.expect.tapped('theirs', true);
  });

  test('three types, however many cards, do not trigger it', () => {
    const g = sentinelGame([BOLT, 'Island', 'Island', BEARS, BEARS]);
    g.advanceTo('upkeep');
    g.expect.stack([]);
  });

  test('a card with two card types counts both: an artifact creature and a land are three, with an instant four', () => {
    const three = sentinelGame(['Island', 'SYNTHETIC Doomed Scout']);
    three.advanceTo('upkeep');
    three.expect.stack([]);
    const four = sentinelGame([BOLT, 'Island', 'SYNTHETIC Doomed Scout']);
    four.advanceTo('upkeep');
    four.expect.stack([`${SENTINEL} (ability)`]);
  });
});

describe('Winter Crown: costs {1} less to activate during your turn', () => {
  const crownGame = (active: 0 | 1): ScenarioGame =>
    scenario()
      .seat(0)
      .library(...LIB)
      .battlefield(CROWN)
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active })
      .build();

  test('on my turn it costs nothing but the tap', () => {
    const g = crownGame(0);
    g.act(0).activate(CROWN).targets(['bears']);
    g.passAll();
    g.expect.tapped('bears', true);
    g.expect.tapped(CROWN, true);
  });

  test('on the turn of an opponent it costs {1}: with no mana it cannot be activated, with one land it can', () => {
    const none = crownGame(1);
    none.act(1).pass();
    expect(none.act(0).try.activate(CROWN).ok).toBe(false);
    const g = scenario()
      .seat(0)
      .library(...LIB)
      .battlefield(CROWN)
      .battlefield('Island')
      .seat(1)
      .library(...LIB)
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).pass();
    g.act(0).activate(CROWN).targets(['bears']).pay();
    g.passAll();
    g.expect.tapped('bears', true);
  });
});
