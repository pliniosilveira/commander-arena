// Miracle that a permanent gives the cards of its controller's hand (`grantKeywordFromManaCost`, grant `miracle`): "Each enchantment card in your hand has miracle. Its miracle cost is
// equal to its mana cost reduced by {4}." Pins: CR 702.94a (the reveal as the card is drawn if it is the first card drawn this turn, the linked trigger, the cast as it resolves),
// 603.11 (a static ability linked to a triggered one), 113.7a (the trigger exists independently of what gave the ability), 118.9 (an alternative cost), 118.7a (a reduction of generic
// mana takes only generic mana), 118.6 (no mana cost: a cost that cannot be paid), 107.3a (the {X} of the cost is announced), 121.1 and 121.2 (a card drawn; several draws are one at a
// time), 608.2g (cast during a resolution: no timing), 613.1f and 604.3 (a static ability of a permanent gives an ability to a card in another zone).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-mana-cost-keyword-grant.ts, synthetic-miracle.ts, synthetic-rooms.ts) but for the real Murder, Grizzly Bears and basic lands.
import { describe, expect, test } from 'vitest';
import { getLegalActions, getView, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const SEER = 'SYNTHETIC Veil Seer'; // {1}{U} 1/3: each enchantment card in your hand has miracle, its mana cost reduced by {4}
const GRAND = 'SYNTHETIC Grand Shrine'; // {5}{W} enchantment
const CHARM = 'SYNTHETIC Small Charm'; // {1}{W}{W} enchantment
const SWELLING = 'SYNTHETIC Swelling Shrine'; // {X}{2}{G} enchantment
const FIELD = 'SYNTHETIC Shrine Field'; // land enchantment, no mana cost
const COSTLESS = 'SYNTHETIC Costless Shrine'; // enchantment with no mana cost
const RECALL = 'SYNTHETIC Shrine Recall'; // {W} instant: return target card from a graveyard to its owner's hand
const TWIN = 'SYNTHETIC Twin Draw'; // {1}{U} sorcery, draw two cards
const GIFT = 'SYNTHETIC Generous Gift'; // {U} instant, target opponent draws a card
const BEAST = 'SYNTHETIC Miracle Beast'; // {4}{G} 4/4, miracle {G}: a printed miracle
const ROOM = 'SYNTHETIC Watch Room // Vault Room'; // {1}{W} // {2}{B}, an enchantment in every zone but the stack
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** The draw step of seat 0's turn 3 with `top` on top of the library; `mine` sets what seat 0 has. */
function drawStep(top: string, mine: (b: Builder) => Builder): ScenarioGame {
  const g = mine(scenario().seat(0).life(20))
    .library(top)
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('upkeep', { active: 0, turn: 3 })
    .build();
  g.passAll();
  return g;
}

const withSeer =
  (lands: number, land = 'Plains') =>
  (b: Builder) =>
    b.battlefield(SEER).battlefield(land, { count: lands });

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const purpose = (g: ScenarioGame) =>
  g.state.pending?.kind === 'confirmOptional' ? g.state.pending.purpose : g.state.pending?.kind;

const tappedLands = (g: ScenarioGame, name = 'Plains') =>
  g.find({ name, zone: 'battlefield' }).filter((o) => o.tapped).length;

test('the synthetic cards are valid and supported', () => {
  for (const name of [SEER, GRAND, CHARM, SWELLING, FIELD, COSTLESS, RECALL]) {
    const card = syntheticCard(name);
    expect(validateCard(card), name).toEqual([]);
    expect(card.support, name).toBe('supported');
  }
});

describe('the reveal: an enchantment card drawn as the first card of the turn (CR 702.94a, 613.1f)', () => {
  test('the first card drawn in the draw step is an enchantment: its owner is asked, with the mana cost reduced by {4}', () => {
    const g = drawStep(GRAND, withSeer(2));
    g.expect.pending('confirmOptional', 0);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('no question');
    expect(d.purpose).toBe('miracleReveal');
    expect(d.subject).toBe(g.id({ name: GRAND, zone: 'hand' }));
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1', 'W'] }]);
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('without the permanent the enchantment has no miracle', () => {
    const g = drawStep(GRAND, (b) => b.battlefield('Plains', { count: 2 }));
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('a card that is no enchantment has none', () => {
    const g = drawStep('Grizzly Bears', withSeer(2));
    g.expect.pending('priority', 0);
  });

  test("the permanent of an opponent gives nothing: 'your hand' is its controller's (CR 109.5)", () => {
    const g = scenario()
      .seat(0)
      .battlefield('Plains', { count: 2 })
      .library(GRAND)
      .library(...FILLER)
      .seat(1)
      .battlefield(SEER)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone(GRAND, 'hand', { seat: 0 });
  });

  test('declining reveals nothing and the card stays hidden', () => {
    const g = drawStep(GRAND, withSeer(2));
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'miracleRevealed' });
    g.expect.pending('priority', 0);
    expect(JSON.stringify(getView(g.state, 1).seats[0]?.hand ?? null)).not.toContain(GRAND);
  });

  test('only the first card drawn this turn: the second card of the same spell is drawn with no question (CR 121.2)', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield(SEER)
      .battlefield('Island', { count: 4 })
      .library('Grizzly Bears')
      .library(GRAND)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(TWIN, { pay: true });
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.zone(GRAND, 'hand', { seat: 0 });
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('the first of two cards drawn by one spell is asked about before the second is drawn', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield(SEER)
      .battlefield('Island', { count: 4 })
      .library(GRAND)
      .library(CHARM)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(TWIN, { pay: true });
    resolveTop(g);
    expect(purpose(g)).toBe('miracleReveal');
    g.expect.zone(CHARM, 'library', { seat: 0 });
    g.act(0).accept();
    // The second card is drawn with no question, and the trigger of the first waits for the spell to finish.
    g.expect.zone(CHARM, 'hand', { seat: 0 });
    g.expect.stack([`${GRAND} (ability)`]);
  });

  test("on an opponent's turn too: the first card its owner draws that turn (ruling 2024-09-20)", () => {
    const g = scenario()
      .seat(0)
      .battlefield(SEER)
      .battlefield('Plains', { count: 2 })
      .library(GRAND)
      .library(...FILLER)
      .seat(1)
      .hand(GIFT)
      .battlefield('Island')
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).cast(GIFT, { pay: true, targets: [{ player: 0 }] });
    g.pass();
    g.pass();
    expect(purpose(g)).toBe('miracleReveal');
    expect(g.state.pending?.seat).toBe(0);
    g.act(0).accept();
    g.expect.stack([`${GRAND} (ability)`]);
    g.pass();
    g.pass();
    expect(purpose(g)).toBe('miracle');
    g.act(0).accept();
    g.act(0).payAuto();
    // CR 608.2g: an enchantment cast in the main phase of an opponent, as the ability resolves.
    g.expect.stack([GRAND]);
    g.expect.invariants();
    g.pass();
    g.pass();
    g.expect.zone(GRAND, 'battlefield', { seat: 0 });
  });

  test('a card put into the hand without being drawn is not asked about (ruling 2024-09-20)', () => {
    const g = scenario()
      .seat(0)
      .hand(RECALL)
      .graveyard(GRAND)
      .battlefield(SEER)
      .battlefield('Plains', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(RECALL, { pay: true, targets: [GRAND] });
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.zone(GRAND, 'hand', { seat: 0 });
    g.expect.noEvent({ kind: 'cardsRevealed' });
    g.expect.stack([]);
  });

  test('a card with a printed miracle keeps its own cost', () => {
    const g = drawStep(BEAST, withSeer(1, 'Forest'));
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('no question');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['G'] }]);
  });
});

describe('the cost: the mana cost with its generic mana reduced by {4} (CR 118.9, 118.7a)', () => {
  test('{5}{W} is cast for {1}{W}: two lands pay it, and the spell was cast for its miracle cost', () => {
    const g = drawStep(GRAND, withSeer(2));
    g.act(0).accept();
    g.expect.stack([`${GRAND} (ability)`]);
    resolveTop(g);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('no question');
    expect(d.purpose).toBe('miracle');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1', 'W'] }]);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.stack([GRAND]);
    expect(tappedLands(g)).toBe(2);
    g.expect.eventLog([{ kind: 'spellCast', seat: 0, fromZone: 'hand', alternative: 'miracle' }]);
    g.expect.invariants();
    resolveTop(g);
    g.expect.zone(GRAND, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('one land is not enough for {1}{W}: the trigger resolves with no question and the card stays in the hand', () => {
    const g = drawStep(GRAND, withSeer(1));
    g.act(0).accept();
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.zone(GRAND, 'hand', { seat: 0 });
  });

  test('{1}{W}{W} has less than {4} of generic mana: it costs {W}{W}, never less (CR 118.7a)', () => {
    const one = drawStep(CHARM, withSeer(1));
    const asked = one.state.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('no question');
    expect(asked.cost).toEqual([{ kind: 'mana', symbols: ['W', 'W'] }]);
    one.act(0).accept();
    resolveTop(one);
    one.expect.pending('priority', 0);
    one.expect.zone(CHARM, 'hand', { seat: 0 });

    const two = drawStep(CHARM, withSeer(2));
    two.act(0).accept();
    resolveTop(two);
    two.act(0).accept();
    two.act(0).payAuto();
    two.expect.stack([CHARM]);
    expect(tappedLands(two)).toBe(2);
  });

  test('the coloured mana is still needed: {1}{W} cannot be paid with two Islands', () => {
    const g = drawStep(GRAND, withSeer(2, 'Island'));
    g.act(0).accept();
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.zone(GRAND, 'hand', { seat: 0 });
  });

  test('the {X} of the mana cost is announced and the reduction takes from it (CR 107.3a): {X}{2}{G} with X = 5 costs {3}{G}', () => {
    const g = drawStep(SWELLING, withSeer(4, 'Forest'));
    const asked = g.state.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('no question');
    // Shown before X is announced: the generic mana that is not {X} is what the reduction can be seen to take.
    expect(asked.cost).toEqual([{ kind: 'mana', symbols: ['X', 'G'] }]);
    g.act(0).accept();
    resolveTop(g);
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error(`pending ${d?.kind}`);
    // Four Forests: {G} and three generic, so X + 2 - 4 <= 3.
    expect(d.max).toBe(5);
    g.act(0).chooseX(5);
    g.act(0).payAuto();
    g.expect.stack([SWELLING]);
    expect(tappedLands(g, 'Forest')).toBe(4);
    expect(g.object({ name: SWELLING, zone: 'stack' }).stack?.x).toBe(5);
    g.expect.invariants();
    resolveTop(g);
    expect(g.object({ name: SWELLING, zone: 'battlefield' }).castX).toBe(5);
  });

  test('X = 0: {X}{2}{G} costs {G}', () => {
    const g = drawStep(SWELLING, withSeer(1, 'Forest'));
    g.act(0).accept();
    resolveTop(g);
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseX') throw new Error(`pending ${d?.kind}`);
    expect(d.max).toBe(2);
    g.act(0).chooseX(0);
    g.act(0).payAuto();
    g.expect.stack([SWELLING]);
    expect(tappedLands(g, 'Forest')).toBe(1);
  });

  test('a land that is an enchantment has no mana cost: nothing is asked (CR 118.6)', () => {
    const g = drawStep(FIELD, withSeer(2));
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('an enchantment with no mana cost has a miracle cost that cannot be paid: nothing is asked (CR 118.6)', () => {
    const g = drawStep(COSTLESS, withSeer(2));
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('the miracle cast is never an ordinary option of the hand, and the card is cast for its full cost otherwise', () => {
    const g = drawStep(GRAND, withSeer(2));
    g.act(0).decline();
    g.advanceTo('precombatMain');
    const id = g.id({ name: GRAND, zone: 'hand' });
    expect(
      getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell' && a.object === id),
    ).toEqual([]);
  });

  describe('a Room is an enchantment card in the hand, and either half is cast for its own mana cost reduced (CR 709.3, 709.4c)', () => {
    // Watch Room {1}{W} costs {W}; Vault Room {2}{B} costs {B}.
    const drawn = (lands: (b: Builder) => Builder) => {
      const g = drawStep(ROOM, (b) => lands(b.battlefield(SEER)));
      const asked = g.state.pending;
      if (asked?.kind !== 'confirmOptional') throw new Error('no question');
      expect(asked.purpose).toBe('miracleReveal');
      g.act(0).accept();
      resolveTop(g);
      return g;
    };
    const question = (g: ScenarioGame) => {
      const d = g.state.pending;
      if (d?.kind !== 'confirmOptional') throw new Error(`pending ${d?.kind}`);
      return d;
    };

    test('the first half is asked about first, with its cost; accepting casts that half', () => {
      const g = drawn((b) => b.battlefield('Plains').battlefield('Swamp'));
      expect(question(g)).toMatchObject({
        purpose: 'miracle',
        face: 0,
        cost: [{ kind: 'mana', symbols: ['W'] }],
      });
      g.act(0).accept();
      g.act(0).payAuto();
      expect(tappedLands(g)).toBe(1);
      expect(tappedLands(g, 'Swamp')).toBe(0);
      g.expect.invariants();
      resolveTop(g);
      g.expect.zone(ROOM, 'battlefield', { seat: 0 });
      expect(g.state.objects[g.id(ROOM)]?.unlockedDoors).toEqual([0]);
    });

    test('declining the first half asks about the second; accepting casts it for {B}', () => {
      const g = drawn((b) => b.battlefield('Plains').battlefield('Swamp'));
      g.act(0).decline();
      expect(question(g)).toMatchObject({
        purpose: 'miracle',
        face: 1,
        cost: [{ kind: 'mana', symbols: ['B'] }],
      });
      g.act(0).accept();
      g.act(0).payAuto();
      expect(tappedLands(g, 'Swamp')).toBe(1);
      expect(tappedLands(g)).toBe(0);
      g.expect.invariants();
      resolveTop(g);
      g.expect.zone(ROOM, 'battlefield', { seat: 0 });
      expect(g.state.objects[g.id(ROOM)]?.unlockedDoors).toEqual([1]);
    });

    test('declining both halves leaves the card in the hand', () => {
      const g = drawn((b) => b.battlefield('Plains').battlefield('Swamp'));
      g.act(0).decline();
      g.act(0).decline();
      g.expect.pending('priority', 0);
      g.expect.zone(ROOM, 'hand', { seat: 0 });
      g.expect.stack([]);
    });

    test('only the half that can be paid for is asked about', () => {
      const g = drawn((b) => b.battlefield('Swamp'));
      expect(question(g)).toMatchObject({ purpose: 'miracle', face: 1 });
      g.act(0).decline();
      g.expect.pending('priority', 0);
      g.expect.zone(ROOM, 'hand', { seat: 0 });
    });

    test('taking the cast back returns to the question of that half', () => {
      const g = drawn((b) => b.battlefield('Plains').battlefield('Swamp'));
      g.act(0).decline();
      g.act(0).accept();
      g.act(0).cancel();
      expect(question(g)).toMatchObject({ purpose: 'miracle', face: 1 });
    });
  });
});

describe('the trigger exists independently of the permanent that gave the miracle (CR 113.7a, 603.11)', () => {
  const build = () =>
    scenario()
      .seat(0)
      .battlefield(SEER)
      .battlefield('Plains', { count: 2 })
      .library(GRAND)
      .library(...FILLER)
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();

  test('the permanent leaves in response to the trigger: the card is still cast for the cost it was revealed for', () => {
    const g = build();
    g.passAll();
    g.act(0).accept();
    g.expect.stack([`${GRAND} (ability)`]);
    g.pass(); // seat 0 keeps priority no longer
    g.act(1).cast('Murder', { pay: true, targets: [SEER] });
    resolveTop(g);
    g.expect.zone(SEER, 'graveyard', { seat: 0 });
    g.expect.stack([`${GRAND} (ability)`]);
    resolveTop(g);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error(`pending ${g.state.pending?.kind}`);
    expect(d.purpose).toBe('miracle');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1', 'W'] }]);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.stack([GRAND]);
    expect(tappedLands(g)).toBe(2);
    g.expect.invariants();
  });

  test('the permanent that is gone gives nothing to the next card drawn', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .battlefield('Island', { count: 4 })
      .library(GRAND)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(TWIN, { pay: true });
    resolveTop(g);
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });

  test('the revealed card notes the cost of its trigger, and only a card revealed for a given miracle does', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SEER)
      .battlefield('Plains', { count: 2 })
      .library(GRAND)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.act(0).accept();
    // The revealed card notes the cost of its trigger; a new object after a zone change would have none (CR 400.7).
    expect(g.object({ name: GRAND, zone: 'hand' }).miracleGrant).toEqual({ reduce: 4 });
    g.expect.invariants();
    const printed = drawStep(BEAST, withSeer(1, 'Forest'));
    printed.act(0).accept();
    expect(printed.object({ name: BEAST, zone: 'hand' }).miracleGrant).toBeUndefined();
  });
});

describe('three players (CR 109.5: "your hand")', () => {
  test('only the controller of the permanent gets the miracle, on the turn of any player', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .battlefield(SEER)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .battlefield('Plains', { count: 2 })
      .library(GRAND)
      .library(...FILLER)
      .seat(2)
      .library(...FILLER)
      .at('upkeep', { active: 1, turn: 3 })
      .build();
    g.passAll();
    g.expect.pending('priority', 1);
    g.expect.zone(GRAND, 'hand', { seat: 1 });
    g.expect.noEvent({ kind: 'cardsRevealed' });
  });
});
