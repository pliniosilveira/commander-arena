// Mass effects over a filter (D-139): "return all attacking creatures to their owners' hands", "destroy all artifacts, creatures and
// enchantments", "exile each opponent's graveyard", "each player sacrifices all permanents they control that are two or more colors",
// the Kindred type and the filter of a count of colors.
// Pins: CR 506.4 (an attacking creature is one declared as an attacker still in combat), CR 108.3 (a card goes to its owner's zone), CR
// 701.8 (destroy: indestructible permanents are not destroyed, CR 702.12b), CR 701.19a (a regeneration shield replaces the destruction),
// CR 701.21a (a player sacrifices only permanents they control: each permanent is sacrificed by its own controller), CR 105.2 (monocolored
// and multicolored), CR 308 (a kindred card has another card type and creature types), CR 400.7 (a card that moved is a new object).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-mass.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const WAVE = 'SYNTHETIC Recoil Wave';
const WIPE = 'SYNTHETIC Wipe Disk';
const RUST = 'SYNTHETIC Rust Disk';
const QUIET = 'SYNTHETIC Quiet Lantern';
const HOLLOW = 'SYNTHETIC Hollow Lantern';
const PRISM = 'SYNTHETIC Prism Purge';
const MONO = 'SYNTHETIC Mono Purge';
const HUE = 'SYNTHETIC Hue Purge';
const GREY = 'SYNTHETIC Grey Idol';
const RED_IDOL = 'SYNTHETIC Red Idol';
const DUAL_IDOL = 'SYNTHETIC Dual Idol';
const DRONE = 'SYNTHETIC Colorless Drone';
const CUB = 'SYNTHETIC Red Cub';
const GRUUL = 'SYNTHETIC Gruul Cub';
const WARD = 'SYNTHETIC Dull Ward';
const INDESTRUCTIBLE = 'SYNTHETIC Indestructible 2/2';
const TROLL = 'SYNTHETIC Regenerating Troll';
const BEARS = 'Grizzly Bears';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

describe('the cards are valid', () => {
  test.each([
    WAVE,
    WIPE,
    RUST,
    QUIET,
    HOLLOW,
    PRISM,
    MONO,
    HUE,
    GREY,
    RED_IDOL,
    DUAL_IDOL,
    DRONE,
    CUB,
    GRUUL,
    WARD,
  ])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Return all attacking creatures to their owners\' hands" (CR 506.4, 108.3)', () => {
  test("only the creatures declared as attackers go to their owners' hands; blockers and idle creatures stay", () => {
    const g = twoSeatGame(
      (b) => b.battlefield(BEARS).battlefield(CUB).battlefield(GRUUL),
      (b) => b.hand(WAVE).battlefield('Island', { count: 3 }).battlefield(DRONE),
    );
    g.playCombat({
      attack: [BEARS, CUB],
      block: [{ blocker: DRONE, attacker: CUB }],
      until: 'declareBlockers',
    });
    g.pass(0);
    g.act(1).cast(WAVE, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(CUB, 'hand', { seat: 0 });
    g.expect.zone(GRUUL, 'battlefield', { seat: 0 });
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test("a stolen attacker returns to its owner's hand, not its controller's (CR 108.3)", () => {
    const g = twoSeatGame(
      (b) => b.battlefield(BEARS),
      (b) =>
        b
          .hand(WAVE)
          .battlefield('Island', { count: 3 })
          .battlefield(CUB, { controller: 0, label: 'stolen' }),
    );
    g.playCombat({ attack: [BEARS, 'stolen'], until: 'declareBlockers' });
    g.pass(0);
    g.act(1).cast(WAVE, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.zone(CUB, 'hand', { seat: 1 });
    g.expect.invariants();
  });

  test('with no attacker it does nothing', () => {
    const g = twoSeatGame(
      (b) => b.hand(WAVE).battlefield('Island', { count: 3 }).battlefield(BEARS),
      (b) => b.battlefield(CUB),
    );
    g.act(0).cast(WAVE, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(CUB, 'battlefield', { seat: 1 });
  });
});

describe('"Destroy all artifacts, creatures and enchantments" (CR 701.8)', () => {
  test('destroys the union of the types for every player; indestructible stays; lands stay', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .battlefield(WIPE)
          .battlefield('Forest', { count: 2 })
          .battlefield(BEARS)
          .battlefield(INDESTRUCTIBLE)
          .battlefield(WARD),
      (b) => b.battlefield(DRONE).battlefield(CUB).battlefield('Island'),
    );
    g.act(0).activate(WIPE, { pay: true });
    g.passAll();
    // The disk itself is an artifact: it destroys itself too.
    g.expect.zone(WIPE, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(WARD, 'graveyard', { seat: 0 });
    g.expect.zone(DRONE, 'graveyard', { seat: 1 });
    g.expect.zone(CUB, 'graveyard', { seat: 1 });
    g.expect.zone(INDESTRUCTIBLE, 'battlefield', { seat: 0 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 2 });
    g.expect.zone('Island', 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('a regeneration shield replaces the destruction (CR 701.19a)', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield(WIPE)
        .battlefield('Forest', { count: 2 })
        .battlefield(TROLL)
        .battlefield('Swamp', { count: 2 }),
    );
    g.act(0).activate(TROLL, { pay: true });
    g.passAll();
    g.act(0).activate(WIPE, { pay: true });
    g.passAll();
    g.expect.zone(TROLL, 'battlefield', { seat: 0 });
    g.expect.tapped(TROLL, true);
    g.expect.zone(WIPE, 'graveyard', { seat: 0 });
  });

  test('another union of types (artifacts and lands) is the same primitive', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(RUST).battlefield('Forest', { count: 2 }).battlefield(BEARS),
      (b) => b.battlefield(DRONE).battlefield('Island'),
    );
    g.act(0).activate(RUST, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(DRONE, 'graveyard', { seat: 1 });
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    g.expect.noObject('Forest', { zone: 'battlefield', seat: 0 });
  });
});

describe('"Exile each opponent\'s graveyard" (CR 108.3)', () => {
  test("each opponent's graveyard is exiled, the controller's is not", () => {
    const g = twoSeatGame(
      (b) => b.battlefield(QUIET).graveyard(BEARS),
      (b) => b.graveyard(CUB).graveyard(GRUUL),
    );
    g.act(0).activate(QUIET);
    // The sacrifice is paid as it is activated.
    g.expect.zone(QUIET, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(CUB, 'exile', { seat: 1 });
    g.expect.zone(GRUUL, 'exile', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.noObject(CUB, { zone: 'graveyard' });
  });

  test('"each player\'s graveyard" is the same primitive with another selector', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(HOLLOW).graveyard(BEARS),
      (b) => b.graveyard(CUB),
    );
    g.act(0).activate(HOLLOW);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(CUB, 'exile', { seat: 1 });
    // The lantern was sacrificed as a cost, so it is in the graveyard when the ability resolves: "each player's graveyard" has it too.
    g.expect.zone(HOLLOW, 'exile', { seat: 0 });
  });
});

describe('"Each player sacrifices all permanents they control that are two or more colors" (CR 701.21a, 105.2)', () => {
  test('every player sacrifices their own multicolored permanents, of any type; the rest stay', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .hand(PRISM)
          .battlefield('Swamp', { count: 4 })
          .battlefield(GRUUL)
          .battlefield(CUB)
          .battlefield(DUAL_IDOL),
      (b) => b.battlefield(GRUUL).battlefield(DRONE).battlefield(RED_IDOL),
    );
    g.act(0).cast(PRISM, { pay: true });
    g.passAll();
    g.expect.zone(GRUUL, 'graveyard', { seat: 0 });
    g.expect.zone(DUAL_IDOL, 'graveyard', { seat: 0 });
    g.expect.zone(GRUUL, 'graveyard', { seat: 1 });
    g.expect.zone(CUB, 'battlefield', { seat: 0 });
    g.expect.zone(DRONE, 'battlefield', { seat: 1 });
    g.expect.zone(RED_IDOL, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('exactly one color, and one or more colors, read the same count', () => {
    const mono = twoSeatGame((b) =>
      b
        .hand(MONO)
        .battlefield('Swamp', { count: 4 })
        .battlefield(CUB)
        .battlefield(GRUUL)
        .battlefield(DRONE),
    );
    mono.act(0).cast(MONO, { pay: true });
    mono.passAll();
    mono.expect.zone(CUB, 'graveyard', { seat: 0 });
    mono.expect.zone(GRUUL, 'battlefield', { seat: 0 });
    mono.expect.zone(DRONE, 'battlefield', { seat: 0 });

    const hue = twoSeatGame((b) =>
      b
        .hand(HUE)
        .battlefield('Swamp', { count: 4 })
        .battlefield(CUB)
        .battlefield(GRUUL)
        .battlefield(DRONE),
    );
    hue.act(0).cast(HUE, { pay: true });
    hue.passAll();
    hue.expect.zone(CUB, 'graveyard', { seat: 0 });
    hue.expect.zone(GRUUL, 'graveyard', { seat: 0 });
    hue.expect.zone(DRONE, 'battlefield', { seat: 0 });
    // The lands have no color, so none was sacrificed.
    hue.expect.zone('Swamp', 'battlefield', { seat: 0, count: 4 });
  });
});

describe('the Kindred type (CR 308)', () => {
  test('a kindred artifact with a creature type is a permanent with that type', () => {
    const g = twoSeatGame((b) => b.battlefield(GREY).battlefield(DUAL_IDOL));
    g.expect.derived(GREY, { types: ['kindred', 'artifact'], subtypes: ['Eldrazi'], colors: [] });
    g.expect.derived(DUAL_IDOL, {
      types: ['kindred', 'artifact'],
      subtypes: ['Eldrazi'],
      colors: ['R', 'G'],
    });
  });

  test('a kindred sorcery is cast at sorcery timing and goes to the graveyard (CR 308.1: it follows its other type)', () => {
    const g = twoSeatGame((b) => b.hand(PRISM).battlefield('Swamp', { count: 4 }));
    g.act(0).cast(PRISM, { pay: true });
    g.expect.stack([PRISM]);
    g.passAll();
    g.expect.zone(PRISM, 'graveyard', { seat: 0 });
    // At the beginning of combat the sorcery is not castable (its card type says so).
    const late = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .hand(PRISM)
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('beginningOfCombat')
      .build();
    expect(late.legalActions(0).some((a) => a.kind === 'castSpell')).toBe(false);
  });

  test('a filter on the kindred type matches kindred permanents only', () => {
    const def = syntheticCard(PRISM);
    expect(def.faces[0]?.types).toContain('kindred');
    expect(def.faces[0]?.types).toContain('sorcery');
  });
});
