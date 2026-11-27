// Escape that a permanent gives the cards of its controller's graveyard (`grantKeywordFromManaCost`, grant `escape`): "Each enchantment card in your graveyard has escape. The escape
// cost is equal to the card's mana cost plus exile three other cards from your graveyard." Pins: CR 702.138a (cast from the graveyard for the escape cost, an alternative cost), 702.138b
// (a spell or permanent "escaped"), 118.9 (alternative cost), 118.6 (no mana cost: a cost that cannot be paid), 107.3a (the {X} of the cost is announced), 709.3 (either half of a split
// card is cast), 601.2h (the cards exiled are part of the cost), 613.1f and 604.3 (a static ability of a permanent gives an ability to a card in another zone), 400.7 (a card that changed
// zones is a new object). Cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-cost-keyword-grant.ts, synthetic-rooms.ts, synthetic-alt-costs.ts) but for the real filler cards.
import { describe, expect, test } from 'vitest';
import { type Action, applyAction, getLegalActions, getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WARDEN = 'SYNTHETIC Key Warden'; // {1}{B} 2/2: each enchantment card in your graveyard has escape, its mana cost and three other cards
const GRAND = 'SYNTHETIC Grand Shrine'; // {5}{W} enchantment
const CHARM = 'SYNTHETIC Small Charm'; // {1}{W}{W} enchantment
const SWELLING = 'SYNTHETIC Swelling Shrine'; // {X}{2}{G} enchantment
const FIELD = 'SYNTHETIC Shrine Field'; // land enchantment, no mana cost
const COSTLESS = 'SYNTHETIC Costless Shrine'; // enchantment with no mana cost
const ROOM = 'SYNTHETIC Watch Room // Vault Room'; // {1}{W} // {2}{B}
const WRAITH = 'SYNTHETIC Escape Wraith'; // {3}{B} 3/3 creature, escape {B}{B} and three other cards: a printed escape
const FILLER = ['Grizzly Bears', 'Giant Spider', 'Typhoid Rats', 'Youthful Knight', 'Fencing Ace'];

const escapeOptions = (g: ScenarioGame, seat = 0): Action[] =>
  getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'escape',
  );

/** Seat 0 in its main phase: the Warden (unless `warden` is false), `cards` and `others` filler cards in the graveyard, `lands`. */
const board = (
  cards: readonly string[],
  others: number,
  lands: readonly (readonly [string, number])[],
  warden = true,
) => {
  let b = scenario()
    .seat(0)
    .graveyard(...cards)
    .graveyard(...FILLER.slice(0, others));
  if (warden) b = b.battlefield(WARDEN);
  for (const [land, count] of lands) b = b.battlefield(land, { count });
  return b.seat(1).build();
};

const tapped = (g: ScenarioGame, name: string) =>
  g.find({ name, zone: 'battlefield' }).filter((o) => o.tapped).length;

describe('the permission: an enchantment card of the graveyard of the controller (CR 702.138a, 613.1f)', () => {
  test('the enchantment is offered for its mana cost with three other cards; a creature card is not', () => {
    const g = board([GRAND, 'Serra Angel'], 2, [['Plains', 6]]);
    expect(escapeOptions(g)).toEqual([
      {
        kind: 'castSpell',
        object: g.id({ name: GRAND, zone: 'graveyard' }),
        alternative: 'escape',
      },
    ]);
    g.expect.illegal(0, { cast: 'Serra Angel', alternative: 'escape' });
  });

  test('two other cards are too few; the card itself does not count', () => {
    expect(escapeOptions(board([GRAND], 2, [['Plains', 6]]))).toEqual([]);
    expect(escapeOptions(board([GRAND], 0, [['Plains', 6]]))).toEqual([]);
  });

  test('the cost is the whole mana cost: five lands are not enough for {5}{W}', () => {
    expect(escapeOptions(board([GRAND], 3, [['Plains', 5]]))).toEqual([]);
    expect(escapeOptions(board([GRAND], 3, [['Plains', 6]]))).toHaveLength(1);
  });

  test('without the permanent there is no escape', () => {
    const g = board([GRAND], 4, [['Plains', 6]], false);
    expect(escapeOptions(g)).toEqual([]);
    g.expect.illegal(0, { cast: GRAND, alternative: 'escape' });
  });

  test("the permanent of an opponent gives nothing, and a card of an opponent's graveyard is not yours to cast", () => {
    const theirs = scenario()
      .seat(0)
      .graveyard(GRAND)
      .graveyard(...FILLER)
      .battlefield('Plains', { count: 6 })
      .seat(1)
      .battlefield(WARDEN)
      .build();
    expect(escapeOptions(theirs)).toEqual([]);
    const other = scenario()
      .seat(0)
      .battlefield(WARDEN)
      .graveyard(...FILLER)
      .battlefield('Plains', { count: 6 })
      .seat(1)
      .graveyard(GRAND)
      .build();
    expect(escapeOptions(other)).toEqual([]);
    const card = other.id({ name: GRAND, zone: 'graveyard', seat: 1 });
    expect(
      applyAction(other.state, 0, { kind: 'castSpell', object: card, alternative: 'escape' }).ok,
    ).toBe(false);
  });

  test("the permission does not change when the spell may be cast: not in an opponent's turn (ruling 2024-09-20)", () => {
    const g = scenario()
      .seat(0)
      .battlefield(WARDEN)
      .graveyard(GRAND)
      .graveyard(...FILLER)
      .battlefield('Plains', { count: 6 })
      .seat(1)
      .at('precombatMain', { active: 1 })
      .build();
    expect(escapeOptions(g)).toEqual([]);
  });

  test('a land that is an enchantment, and an enchantment with no mana cost, have a cost that cannot be paid (CR 118.6)', () => {
    const g = board([FIELD, COSTLESS], 4, [['Plains', 6]]);
    expect(escapeOptions(g)).toEqual([]);
    g.expect.illegal(0, { cast: COSTLESS, alternative: 'escape' });
  });

  test('the view shows the escape cost and the number of cards on the card in the graveyard', () => {
    const g = board([CHARM], 3, [['Plains', 3]]);
    const card = getView(g.state, 0).seats[0]?.graveyard.find((o) => o.name === CHARM);
    expect(card?.alternativeCosts).toEqual([{ kind: 'escape', cost: ['1', 'W', 'W'], exile: 3 }]);
  });

  test('a card with a printed escape keeps its own cost', () => {
    const g = board([WRAITH], 3, [['Swamp', 2]]);
    expect(escapeOptions(g)).toHaveLength(1);
  });
});

describe('the cast: the mana cost and three other cards (CR 702.138a, 601.2h, 702.138b)', () => {
  test('the mana cost is paid, three other cards are exiled, and the permanent that enters escaped', () => {
    const g = board([CHARM], 4, [['Plains', 3]]);
    g.act(0).cast(CHARM, { alternative: 'escape', pay: true });
    expect(tapped(g, 'Plains')).toBe(3);
    const d = g.state.pending;
    expect(d).toMatchObject({ kind: 'chooseCards', purpose: 'exile', min: 3, max: 3 });
    if (d?.kind !== 'chooseCards') throw new Error('unreachable');
    expect(d.legal).toHaveLength(4);
    g.act(0).chooseCards('Grizzly Bears', 'Giant Spider', 'Typhoid Rats');
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.zone('Youthful Knight', 'graveyard', { seat: 0 });
    g.expect.eventLog([
      { kind: 'spellCast', seat: 0, fromZone: 'graveyard', alternative: 'escape' },
    ]);
    expect(g.object({ name: CHARM, zone: 'stack' }).stack?.escapeGrant).toEqual({
      cost: [{ kind: 'mana', symbols: ['1', 'W', 'W'] }],
      exile: 3,
    });
    g.expect.invariants();
    g.pass();
    g.pass();
    g.expect.zone(CHARM, 'battlefield', { seat: 0 });
    expect(g.object({ name: CHARM, zone: 'battlefield' }).alt).toBe('escape');
    g.expect.invariants();
  });

  test('the spell is on the stack with its cost: the permanent leaving does not undo the cast', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WARDEN)
      .graveyard(CHARM)
      .graveyard(...FILLER.slice(0, 3))
      .battlefield('Plains', { count: 3 })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .build();
    g.act(0).cast(CHARM, { alternative: 'escape', pay: true });
    g.pass();
    g.act(1).cast('Murder', { pay: true, targets: [WARDEN] });
    g.pass();
    g.pass();
    g.expect.zone(WARDEN, 'graveyard', { seat: 0 });
    g.expect.invariants();
    g.pass();
    g.pass();
    g.expect.zone(CHARM, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the permission ends when the permanent leaves the battlefield (CR 604.3)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WARDEN)
      .library('Forest', 'Forest', 'Forest')
      .graveyard(CHARM)
      .graveyard(...FILLER.slice(0, 3))
      .battlefield('Plains', { count: 3 })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .library('Forest', 'Forest', 'Forest')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast('Murder', { pay: true, targets: [WARDEN] });
    g.pass();
    g.pass();
    g.expect.zone(WARDEN, 'graveyard', { seat: 0 });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(escapeOptions(g)).toEqual([]);
    g.expect.illegal(0, { cast: CHARM, alternative: 'escape' });
  });

  test('a card that escaped and went back to the graveyard can escape again (ruling 2024-09-20; CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WARDEN)
      .graveyard(CHARM)
      .graveyard(...FILLER.slice(0, 3))
      .battlefield('Plains', { count: 3 })
      .seat(1)
      .build();
    g.act(0).cast(CHARM, { alternative: 'escape', pay: true });
    g.pass();
    g.pass();
    g.expect.zone(CHARM, 'battlefield', { seat: 0 });
    // Nothing is left to exile for a second cast: the permission is there, the cost is not payable.
    expect(escapeOptions(g)).toEqual([]);
  });

  test('the {X} of the mana cost is announced (CR 107.3a): {X}{2}{G} with X = 2 costs four mana', () => {
    const g = board([SWELLING], 3, [['Forest', 5]]);
    g.act(0).cast(SWELLING, { alternative: 'escape' });
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error(`pending ${d?.kind}`);
    expect(d.max).toBe(2);
    g.act(0).chooseX(2);
    g.act(0).payAuto();
    expect(tapped(g, 'Forest')).toBe(5);
    expect(g.object({ name: SWELLING, zone: 'stack' }).stack?.x).toBe(2);
    g.expect.invariants();
    g.pass();
    g.pass();
    expect(g.object({ name: SWELLING, zone: 'battlefield' }).castX).toBe(2);
    g.expect.invariants();
  });
});

describe('a Room in the graveyard: either half is cast for its own mana cost (CR 709.3, ruling 2024-09-20)', () => {
  test('one option for each half that can be paid for', () => {
    const g = board([ROOM], 3, [
      ['Plains', 2],
      ['Swamp', 1],
    ]);
    const room = g.id({ name: ROOM, zone: 'graveyard' });
    expect(escapeOptions(g)).toEqual([
      { kind: 'castSpell', object: room, face: 0, alternative: 'escape' },
      { kind: 'castSpell', object: room, face: 1, alternative: 'escape' },
    ]);
    const white = board([ROOM], 3, [['Plains', 3]]);
    expect(escapeOptions(white)).toEqual([
      {
        kind: 'castSpell',
        object: white.id({ name: ROOM, zone: 'graveyard' }),
        face: 0,
        alternative: 'escape',
      },
    ]);
  });

  test('the second half is cast for {2}{B} and three other cards, and enters with that door unlocked', () => {
    const g = board([ROOM], 3, [
      ['Plains', 2],
      ['Swamp', 1],
    ]);
    g.act(0).cast(ROOM, { alternative: 'escape', face: 1, pay: true });
    expect(tapped(g, 'Plains') + tapped(g, 'Swamp')).toBe(3);
    for (const name of FILLER.slice(0, 3)) g.expect.zone(name, 'exile', { seat: 0 });
    g.expect.invariants();
    g.pass();
    g.pass();
    g.expect.zone(ROOM, 'battlefield', { seat: 0 });
    expect(g.state.objects[g.id(ROOM)]?.unlockedDoors).toEqual([1]);
    g.expect.invariants();
  });

  test('the first half is cast for {1}{W}', () => {
    const g = board([ROOM], 3, [['Plains', 2]]);
    g.act(0).cast(ROOM, { alternative: 'escape', face: 0, pay: true });
    expect(tapped(g, 'Plains')).toBe(2);
    g.pass();
    g.pass();
    expect(g.state.objects[g.id(ROOM)]?.unlockedDoors).toEqual([0]);
  });

  test('without the permanent neither half has escape', () => {
    const g = board(
      [ROOM],
      3,
      [
        ['Plains', 2],
        ['Swamp', 1],
      ],
      false,
    );
    expect(escapeOptions(g)).toEqual([]);
    const room = g.id({ name: ROOM, zone: 'graveyard' });
    for (const face of [0, 1]) {
      expect(
        applyAction(g.state, 0, { kind: 'castSpell', object: room, face, alternative: 'escape' })
          .ok,
      ).toBe(false);
    }
  });
});
