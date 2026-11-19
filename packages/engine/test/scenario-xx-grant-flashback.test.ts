// Flashback with the cost equal to the mana cost (`grantFlashbackToGraveyardCards`, `gainFlashbackFromManaCost`): "Each instant and sorcery card in your graveyard has flashback. The
// flashback cost is equal to that card's mana cost." and "... gains flashback until end of turn ...". Pins: CR 702.34a (Flashback: cast from the graveyard for the flashback cost, exiled
// when it leaves the stack), CR 118.9 (an alternative cost), CR 613.1f and 604.3 (a static ability of a permanent gives an ability to a card in another zone), CR 611.2a and 611.2c (an
// effect that resolves lasts until end of turn and affects the objects it found as it resolved), CR 107.3a ({X} of the mana cost), CR 101.2 and 701.6a ("can't be countered").
// Cards are SYNTHETIC but for the real Lightning Bolt, Divination, Grizzly Bears and Counterspell.
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  getLegalActions,
  syntheticCard,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const LECTURER = 'SYNTHETIC Echo Lecturer';
const RITE = 'SYNTHETIC Echo Rite';
const WILL = 'SYNTHETIC Echo Will';
const SURGE = 'SYNTHETIC Harmonize Surge'; // {X}{R}{R} sorcery: each opponent loses X
const BOLT = 'Lightning Bolt';
const DIVINATION = 'Divination';
const BEARS = 'Grizzly Bears';

const flashbackOptions = (g: ScenarioGame, seat: 0 | 1 = 0): Action[] =>
  getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'flashback',
  );

const tapped = (g: ScenarioGame, name: string) =>
  g.find({ name, zone: 'battlefield' }).filter((o) => o.tapped).length;

test('the synthetic cards are supported', () => {
  for (const name of [LECTURER, RITE, WILL]) {
    const card = syntheticCard(name);
    expect(validateCard(card), name).toEqual([]);
    expect(card.support, name).toBe('supported');
  }
});

describe('a permanent gives the instants and sorceries of its controller graveyard flashback (CR 702.34a, 613.1f)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .graveyard(DIVINATION, BOLT, BEARS)
      .battlefield(LECTURER)
      .battlefield('Island', 'Island', 'Island', 'Mountain')
      .library('Forest', 'Plains', 'Island')
      .seat(1)
      .graveyard(DIVINATION)
      .build();

  test('the instant and the sorcery are offered, the creature card and the opponent card are not', () => {
    const g = build();
    const offered = flashbackOptions(g);
    expect(offered).toEqual(
      expect.arrayContaining([
        {
          kind: 'castSpell',
          object: g.id({ name: DIVINATION, zone: 'graveyard', seat: 0 }),
          alternative: 'flashback',
        },
        {
          kind: 'castSpell',
          object: g.id({ name: BOLT, zone: 'graveyard', seat: 0 }),
          alternative: 'flashback',
        },
      ]),
    );
    expect(offered).toHaveLength(2);
    const bears = g.id({ name: BEARS, zone: 'graveyard', seat: 0 });
    expect(
      applyAction(g.state, 0, { kind: 'castSpell', object: bears, alternative: 'flashback' }).ok,
    ).toBe(false);
    const theirs = g.id({ name: DIVINATION, zone: 'graveyard', seat: 1 });
    expect(
      applyAction(g.state, 0, { kind: 'castSpell', object: theirs, alternative: 'flashback' }).ok,
    ).toBe(false);
  });

  test('without the permanent there is no flashback', () => {
    const g = scenario()
      .seat(0)
      .graveyard(DIVINATION, BOLT)
      .battlefield('Island', 'Island', 'Island', 'Mountain')
      .seat(1)
      .build();
    expect(flashbackOptions(g)).toEqual([]);
  });

  test('the opponent permanent gives it to the opponent graveyard, not to yours', () => {
    const g = scenario()
      .seat(0)
      .graveyard(DIVINATION)
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .battlefield(LECTURER)
      .build();
    expect(flashbackOptions(g, 0)).toEqual([]);
  });

  test('the cost is the mana cost, the spell resolves and is exiled (CR 118.9, 702.34a)', () => {
    const g = build();
    g.act(0).cast(DIVINATION, { alternative: 'flashback', pay: true });
    // {2}{U}: three of the four lands.
    expect(g.find({ name: 'Island', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(3);
    expect(g.find({ name: 'Island', zone: 'battlefield' }).length).toBe(3);
    g.expect.zone(DIVINATION, 'stack', { seat: 0 });
    g.passAll();
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.expect.zone(DIVINATION, 'exile', { seat: 0 });
    g.expect.noObject(DIVINATION, { zone: 'graveyard', seat: 0 });
    g.expect.invariants();
  });

  test('not when the mana cost cannot be paid', () => {
    const g = scenario()
      .seat(0)
      .graveyard(DIVINATION)
      .battlefield(LECTURER)
      .battlefield('Island', 'Island')
      .seat(1)
      .build();
    expect(flashbackOptions(g)).toEqual([]);
  });

  test('the {X} of the mana cost is announced and paid (CR 107.3a)', () => {
    const g = scenario()
      .seat(0)
      .graveyard(SURGE)
      .battlefield(LECTURER)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .build();
    expect(flashbackOptions(g)).toHaveLength(1);
    g.act(0).cast(SURGE, { alternative: 'flashback', x: 3, pay: true });
    expect(tapped(g, 'Mountain')).toBe(5);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(SURGE, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('the permanent leaving the battlefield takes the flashback away', () => {
    const g = scenario()
      .seat(0)
      .graveyard(BOLT)
      .battlefield(LECTURER)
      .battlefield('Mountain')
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island')
      .build();
    expect(flashbackOptions(g)).toHaveLength(1);
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: [LECTURER], pay: true });
    g.passAll();
    g.expect.zone(LECTURER, 'hand', { seat: 0 });
    expect(flashbackOptions(g)).toEqual([]);
  });
});

describe('spells cannot be countered while the permanent is there (CR 101.2, 701.6a)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield(LECTURER)
      .battlefield('Mountain')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .build();

  test("a counterspell resolves and does nothing, even to the opponent's own spell", () => {
    const g = build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone('Counterspell', 'graveyard', { seat: 1 });
  });

  test('without the permanent the same counterspell works', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.life(1, 40);
  });
});

describe('a spell gives them flashback until end of turn (CR 611.2a, 611.2c)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(RITE)
      .graveyard(DIVINATION, BOLT, BEARS)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Island', 'Island')
      .library('Forest', 'Plains', 'Island')
      .seat(1)
      .graveyard(DIVINATION)
      .library('Forest', 'Plains', 'Island')
      .build();

  test('before it resolves nothing has flashback; after, the instants and sorceries of my graveyard do', () => {
    const g = build();
    expect(flashbackOptions(g)).toEqual([]);
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.expect.zone(RITE, 'graveyard', { seat: 0 });
    // The spell is in the graveyard now, but it was not there as the effect resolved.
    const offered = flashbackOptions(g);
    expect(offered).toHaveLength(2);
    const rite = g.id({ name: RITE, zone: 'graveyard', seat: 0 });
    expect(offered).not.toContainEqual({
      kind: 'castSpell',
      object: rite,
      alternative: 'flashback',
    });
  });

  test('a card cast for it is exiled, and one that enters the graveyard later has none (CR 611.2c)', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE, BOLT)
      .graveyard(DIVINATION)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain', 'Island', 'Island', 'Island')
      .library('Forest', 'Plains', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    // Only the card that was there as the spell resolved.
    const options = flashbackOptions(g);
    expect(options).toEqual([
      {
        kind: 'castSpell',
        object: g.id({ name: DIVINATION, zone: 'graveyard', seat: 0 }),
        alternative: 'flashback',
      },
    ]);
    g.act(0).cast(DIVINATION, { alternative: 'flashback', pay: true });
    g.passAll();
    g.expect.zone(DIVINATION, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('it ends with the turn', () => {
    const g = build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    expect(flashbackOptions(g)).toHaveLength(2);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(flashbackOptions(g, 0)).toEqual([]);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(flashbackOptions(g, 0)).toEqual([]);
  });
});

describe('a modal spell: each player may discard their hand and draw five, and the cards gain flashback (CR 700.2, 608.2d)', () => {
  const build = (commander: boolean) => {
    const b = scenario()
      .seat(0)
      .hand(WILL, BOLT)
      .battlefield('Island', 'Island', 'Mountain', 'Mountain', 'Mountain')
      .library('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Plains')
      .seat(1)
      .hand(DIVINATION)
      .library('Island', 'Island', 'Island', 'Island', 'Island', 'Swamp');
    return (commander ? b.seat(0).battlefield(BEARS, { commander: true }) : b).build();
  };

  test('without a commander only one mode is chosen', () => {
    const g = build(false);
    g.act(0).cast(WILL);
    expect(g.state.pending).toMatchObject({ kind: 'chooseModes', min: 1, max: 1 });
  });

  test('with a commander both modes: the discarded instant and sorcery cards get the flashback', () => {
    const g = build(true);
    g.act(0).cast(WILL, { modes: [0, 1], pay: true });
    g.passAll();
    // Each player is asked in turn order; the caster discards the Lightning Bolt, the opponent declines.
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone(DIVINATION, 'hand', { seat: 1 });
    // The second mode runs after the first: the cards in the graveyard now have flashback, the Lightning Bolt included, but not the spell still on its way there.
    const offered = flashbackOptions(g);
    expect(offered).toContainEqual({
      kind: 'castSpell',
      object: g.id({ name: BOLT, zone: 'graveyard', seat: 0 }),
      alternative: 'flashback',
    });
    g.act(0).cast(BOLT, { alternative: 'flashback', targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.invariants();
  });
});
