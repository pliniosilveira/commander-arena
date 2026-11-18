// Group 3 of the Lorehold Spirit deck (issue 86): a preparation card (CR 722) whose creature "becomes prepared" at the beginning of its controller's upkeep when a player has one or fewer cards
// in hand (an intervening "if", CR 603.4), and whose prepare spell makes each player discard their hand, then draw seven cards (the `discard` effect's `hand`, the condition `aPlayerCardsInHand`).
// Pins: CR 603.4 (Handling Triggered Abilities: the "if" is checked as the ability would trigger and again as it resolves), CR 722.3a (a permanent with a prepare spell becomes prepared, once), CR 722.3b
// (it stops being prepared), CR 722.3c (the copy of the prepare spell in exile), CR 601.2i (the spell is cast, so the creature is no longer prepared), CR 707.10a / 111.7 (a copy of a spell
// ceases to exist), CR 701.9a (discard a hand: every card, nobody chooses), CR 121.1 / 121.4 and 704.5b (drawing from an empty library: the player loses at the next state-based check),
// CR 307.1 (a sorcery is cast at sorcery speed), CR 400.7 (a permanent that left is a new object).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-lorehold-g3.ts); the real card is played in packages/cards/test/convert-grammar-engine-lorehold-g3.test.ts.
import { describe, expect, test } from 'vitest';
import { getLegalActions, getView, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const CARD = 'SYNTHETIC Lore Jackal // Spin of Fate';
const FRONT = 'Lore Jackal';
const SPIN = 'Spin of Fate';
const EMPTY_HANDS = 'SYNTHETIC Empty Hands'; // {R} sorcery: each player discards their hand
const RUSH = 'SYNTHETIC Rush of Cards'; // {R} instant: draw three cards
const BOLT = 'Lightning Bolt';
const FILLER = (n: number) => Array.from({ length: n }, () => 'Plains');
const HAND = (n: number) => Array.from({ length: n }, () => 'Forest');

const defs = () =>
  scenario()
    .define(syntheticCard(CARD))
    .define(syntheticCard(EMPTY_HANDS))
    .define(syntheticCard(RUSH));

const copyOf = (g: ScenarioGame) =>
  Object.values(g.state.objects).find((o) => o.prepareOf !== undefined);
const jackal = (g: ScenarioGame) => getView(g.state, 0).battlefield.find((o) => o.name === FRONT);
const handOf = (g: ScenarioGame, seat: number) => g.state.seats[seat]?.hand.length ?? -1;

/**
 * Seat 0 controls the Jackal and three Mountains; `mine` and `theirs` are the sizes of the hands. The game starts in seat 1's main phase and is advanced to seat 0's upkeep, where the trigger
 * (if any) is on the stack.
 */
function toUpkeep(mine: number | string[], theirs: number | string[], libraries = 12) {
  const names = (v: number | string[]) => (typeof v === 'number' ? HAND(v) : v);
  const g = defs()
    .seat(0)
    .hand(...names(mine))
    .library(...FILLER(libraries))
    .battlefield(CARD, 'Mountain', 'Mountain', 'Mountain')
    .seat(1)
    .hand(...names(theirs))
    .library(...FILLER(libraries))
    .at('precombatMain', { active: 1, turn: 2 })
    .build();
  g.advanceTo('upkeep', { turn: 'next' });
  return g;
}

describe('the cards are valid', () => {
  test.each([CARD, EMPTY_HANDS, RUSH])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('the upkeep trigger and its intervening "if" (CR 603.4)', () => {
  test('no player has one or fewer cards in hand: it does not trigger at all', () => {
    const g = toUpkeep(3, 4);
    expect(g.state.stack).toHaveLength(0);
    g.passAll();
    expect(jackal(g)?.prepared).toBeUndefined();
    expect(copyOf(g)).toBeUndefined();
  });

  test('two cards in the smallest hand is still not "one or fewer"', () => {
    const g = toUpkeep(2, 2);
    expect(g.state.stack).toHaveLength(0);
  });

  test('the controller has one card: the trigger goes on the stack and the creature becomes prepared (CR 722.3a)', () => {
    const g = toUpkeep(1, 5);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    expect(jackal(g)?.prepared).toBe(true);
    const copy = copyOf(g);
    expect(copy?.zone).toBe('exile');
    expect(getView(g.state, 0).exile.find((o) => o.id === copy?.id)).toMatchObject({
      name: SPIN,
      preparedSpell: true,
    });
    g.expect.invariants();
  });

  test('the controller has no cards: the same', () => {
    const g = toUpkeep(0, 5);
    g.passAll();
    expect(jackal(g)?.prepared).toBe(true);
  });

  test('only an opponent has one or fewer cards: it triggers (a player is any player)', () => {
    const g = toUpkeep(5, 1);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    expect(jackal(g)?.prepared).toBe(true);
  });

  test('an opponent with no cards counts too', () => {
    const g = toUpkeep(5, 0);
    g.passAll();
    expect(jackal(g)?.prepared).toBe(true);
  });

  test('read again as the ability resolves: the hand is refilled in response, so nothing happens', () => {
    const g = toUpkeep([RUSH], 5);
    expect(g.state.stack).toHaveLength(1);
    g.act(0).cast(RUSH, { pay: true });
    g.passAll();
    expect(handOf(g, 0)).toBe(3);
    expect(jackal(g)?.prepared).toBeUndefined();
    expect(copyOf(g)).toBeUndefined();
    g.expect.invariants();
  });

  test('read again as the ability resolves: still true when the hand is not changed', () => {
    const g = toUpkeep([RUSH], 5);
    // The trigger resolves with the one card still in hand.
    g.passAll();
    expect(jackal(g)?.prepared).toBe(true);
  });

  test('the creature left the battlefield with the trigger on the stack: no designation and no copy', () => {
    const g = toUpkeep([BOLT], 5);
    g.act(0).cast(BOLT, { targets: [FRONT], pay: true });
    g.passAll();
    expect(g.state.stack).toHaveLength(0);
    expect(jackal(g)).toBeUndefined();
    expect(copyOf(g)).toBeUndefined();
    expect(Object.values(g.state.objects).some((o) => o.prepared === true)).toBe(false);
    g.expect.invariants();
  });

  test('already prepared: the trigger again leaves the one designation and the one copy (CR 722.3a)', () => {
    const g = toUpkeep(1, 0);
    g.passAll();
    const first = copyOf(g)?.id;
    expect(first).toBeDefined();
    // Seat 1 draws one card in its own turn and has one in hand at seat 0's next upkeep: the trigger is there again.
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    const copies = Object.values(g.state.objects).filter((o) => o.prepareOf !== undefined);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.id).toBe(first);
    expect(jackal(g)?.prepared).toBe(true);
    g.expect.invariants();
  });

  test('it is the controller’s upkeep only: an opponent’s upkeep does not trigger it', () => {
    const g = defs()
      .seat(0)
      .hand(...HAND(0))
      .library(...FILLER(8))
      .battlefield(CARD)
      .seat(1)
      .hand(...HAND(0))
      .library(...FILLER(8))
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('casting the prepare spell (Spin of Fate)', () => {
  /**
   * A game in which the trigger has made the Jackal prepared, at seat 0's precombat main phase. Seat 0 has `mine` (0 or 1: the trigger needs a hand of one or fewer, and the draw step adds one) and
   * seat 1 has `theirs` cards in hand at the upkeep.
   */
  function ready(mine: number, theirs: number, library0 = 12, library1 = 12) {
    const g = defs()
      .seat(0)
      .hand(...HAND(mine))
      .library(...FILLER(library0))
      .battlefield(CARD, 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .hand(...HAND(theirs))
      .library(...FILLER(library1))
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(jackal(g)?.prepared).toBe(true);
    g.advanceTo('precombatMain');
    return g;
  }

  test('each player discards their hand and draws seven cards; the copy ceases to exist and the creature is unprepared (CR 601.2i, 707.10a)', () => {
    const g = ready(1, 4);
    const draw0 = handOf(g, 0); // the draw step has been taken
    const hand1 = handOf(g, 1);
    expect(draw0).toBe(2);
    expect(hand1).toBe(4);
    const id = copyOf(g)?.id as string;
    g.act(0).cast(id, { pay: true });
    expect(jackal(g)?.prepared).toBeUndefined();
    expect(getView(g.state, 0).stack[0]?.name).toBe(SPIN);
    g.passAll();
    expect(handOf(g, 0)).toBe(7);
    expect(handOf(g, 1)).toBe(7);
    expect(g.state.seats[0]?.graveyard).toHaveLength(2);
    expect(g.state.seats[1]?.graveyard).toHaveLength(4);
    expect(g.state.seats[0]?.library).toHaveLength(12 - 1 - 7);
    expect(g.state.seats[1]?.library).toHaveLength(12 - 7);
    expect(copyOf(g)).toBeUndefined();
    expect(getView(g.state, 0).exile).toHaveLength(0);
    expect(g.state.stack).toHaveLength(0);
    g.expect.invariants();
  });

  test('every card of a hand goes, nobody chooses: no decision is asked', () => {
    const g = ready(1, 5);
    g.act(0).cast(copyOf(g)?.id as string, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(handOf(g, 0)).toBe(7);
    expect(handOf(g, 1)).toBe(7);
  });

  test('a player with an empty hand discards nothing and still draws seven', () => {
    const g = ready(0, 0);
    g.act(0).cast(copyOf(g)?.id as string, { pay: true });
    g.passAll();
    expect(handOf(g, 0)).toBe(7);
    expect(handOf(g, 1)).toBe(7);
    expect(g.state.seats[0]?.graveyard).toHaveLength(1);
    expect(g.state.seats[1]?.graveyard).toHaveLength(0);
  });

  test('a player who has to draw from a library with fewer cards loses at the next state-based check (CR 704.5b)', () => {
    const g = ready(1, 2, 12, 3);
    g.act(0).cast(copyOf(g)?.id as string, { pay: true });
    g.passAll();
    expect(g.state.seats[1]?.hasLost).toBe(true);
    expect(g.state.seats[0]?.hasLost).toBe(false);
    expect(g.state.result).not.toBeNull();
  });

  test('the discards are over before any card is drawn: a draw never goes back into a hand that is discarded', () => {
    const g = ready(1, 1);
    g.act(0).cast(copyOf(g)?.id as string, { pay: true });
    g.passAll();
    // Seven in each hand, none of the discarded: all the hand cards are Forests and the library is Plains.
    for (const seat of [0, 1]) {
      const names = (g.state.seats[seat]?.hand ?? []).map(
        (id) => getView(g.state, seat).seats[seat]?.hand?.find((o) => o.id === id)?.name,
      );
      expect(names.every((n) => n === 'Plains')).toBe(true);
    }
  });

  test('it is cast at sorcery speed: not in the opponent’s turn, not with a spell on the stack (CR 307.1)', () => {
    const g = ready(1, 2);
    const castsOf = () =>
      getLegalActions(g.state, 0).filter(
        (a) => a.kind === 'castSpell' && a.object === copyOf(g)?.id,
      );
    expect(castsOf()).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(castsOf()).toHaveLength(0);
  });

  test('it cannot be cast in the upkeep, with the trigger on the stack', () => {
    const g = toUpkeep(1, 5);
    g.passAll();
    const id = copyOf(g)?.id;
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell' && a.object === id)).toBe(
      false,
    );
  });

  test('the spell is on the stack and the creature is no longer prepared: it still resolves', () => {
    const g = ready(1, 2);
    g.act(0).cast(copyOf(g)?.id as string, { pay: true });
    // The creature stops being prepared as the spell is cast: it is not what the spell depends on.
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    expect(handOf(g, 0)).toBe(7);
  });

  test('a creature that is no longer prepared cannot cast the spell again: the copy was used up', () => {
    const g = ready(1, 2);
    g.act(0).cast(copyOf(g)?.id as string, { pay: true });
    g.passAll();
    expect(
      getLegalActions(g.state, 0).some(
        (a) => a.kind === 'castSpell' && getView(g.state, 0).exile.length > 0,
      ),
    ).toBe(false);
    expect(jackal(g)?.prepared).toBeUndefined();
  });
});

describe('Each player discards their hand (the effect alone)', () => {
  test('a hand of any size, every player, the controller included', () => {
    const g = defs()
      .seat(0)
      .hand(EMPTY_HANDS, ...HAND(4))
      .battlefield('Mountain')
      .library(...FILLER(5))
      .seat(1)
      .hand(...HAND(6))
      .library(...FILLER(5))
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(EMPTY_HANDS, { pay: true });
    g.passAll();
    expect(handOf(g, 0)).toBe(0);
    expect(handOf(g, 1)).toBe(0);
    // The sorcery itself and the four cards in seat 0's graveyard, the six of seat 1.
    expect(g.state.seats[0]?.graveyard).toHaveLength(5);
    expect(g.state.seats[1]?.graveyard).toHaveLength(6);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.invariants();
  });
});

describe('the ability is part of the card', () => {
  test('the trigger is the card’s only ability and the prepare spell is face 1', () => {
    const def = syntheticCard(CARD);
    expect(def.layout).toBe('prepare');
    expect(def.faces).toHaveLength(2);
    expect(def.faces[0]?.abilities).toHaveLength(1);
    expect(def.faces[1]?.spell).toBeDefined();
  });
});
