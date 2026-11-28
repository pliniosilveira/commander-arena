// The Peace Offering deck (Bloomburrow Commander), the hand-size group: REAL cards of the golden corpus read through the grammar only and played in an engine scenario.
// Ghirapur Orrery: "At the beginning of each player's upkeep, if that player has no cards in hand, that player draws three cards." (CR 603.4 intervening "if", 402.1, 101.4).
// Triskaidekaphile: "At the beginning of your upkeep, if you have exactly thirteen cards in your hand, you win the game." (CR 603.4, 104.2b).
// Twenty-Toed Toad: "Your maximum hand size is twenty." (CR 402.2, 514.1, 613.11) and "Whenever this creature attacks, you win the game if there are twenty or more counters on it or
// you have twenty or more cards in hand." (CR 122.1, 608.2c: read as the ability resolves, not an intervening "if").
import { readFileSync } from 'node:fs';
import { type CardDefinition, type SeatId, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const ORRERY = real('Ghirapur Orrery');
const TRISKA = real('Triskaidekaphile');
const TOAD = real('Twenty-Toed Toad');

const LIBRARY = Array.from({ length: 10 }, () => 'Island');

describe('Ghirapur Orrery: each upkeep, a player with no cards in hand draws three', () => {
  test('it reads as an each-player upkeep trigger with the intervening "if" of that player', () => {
    const trigger = ORRERY.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toEqual({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'each' },
      interveningIf: {
        kind: 'triggerPlayerStat',
        stat: 'cardsInHand',
        compare: { cmp: 'atMost', value: 0 },
      },
      effect: { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 3 },
    });
  });

  /** The end step of the seat before `active`, so the next turn's upkeep is `active`'s. */
  const board = (seats: 2 | 3, active: SeatId, hands: Readonly<Record<number, number>>) => {
    const b = scenario({ seats }).define(ORRERY);
    for (let s = 0; s < seats; s += 1) {
      b.seat(s as SeatId).library(...LIBRARY);
      const count = hands[s] ?? 0;
      if (count > 0) b.hand('Forest', { count });
      if (s === 0) b.battlefield(ORRERY.name);
    }
    const before = ((active + seats - 1) % seats) as SeatId;
    const g = b.at('end', { active: before, turn: 3 }).build();
    g.advanceTo('upkeep', { turn: 'next' });
    return g;
  };

  test("the controller's own upkeep with an empty hand: three cards (CR 603.4)", () => {
    const g = board(2, 0, {});
    g.passAll();
    g.expect.handSize(0, 3);
    g.expect.handSize(1, 0);
    g.expect.invariants();
  });

  test("an opponent's upkeep with an empty hand: that player draws, not the controller", () => {
    const g = board(2, 1, { 0: 0 });
    g.passAll();
    g.expect.handSize(1, 3);
    g.expect.handSize(0, 0);
  });

  test('a player with a card in hand: the ability does not trigger at all', () => {
    const g = board(2, 0, { 0: 1 });
    expect(g.state.stack).toEqual([]);
    // Only the draw of the draw step follows (CR 504.1).
    g.advanceTo('draw');
    g.passAll();
    g.expect.handSize(0, 2);
  });

  test('a card drawn in response: the condition is false as it resolves and nothing is drawn (CR 603.4)', () => {
    const g = scenario()
      .define(ORRERY)
      .define(TRISKA)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ORRERY.name, TRISKA.name, 'Island', 'Island', 'Island', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .at('end', { active: 1, turn: 3 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.stack).toHaveLength(1);
    // "{3}{U}: Draw a card." on top of the trigger: the hand is no longer empty when the trigger resolves.
    g.act(0).activate(TRISKA.name, { pay: true });
    // Both resolve: the draw of one card, then the trigger, which is removed from the stack (CR 603.4).
    g.passAll();
    expect(g.state.stack).toEqual([]);
    g.expect.handSize(0, 1);
    g.expect.eventLog([{ kind: 'fizzled', reason: 'interveningIf' }]);
    g.expect.invariants();
  });

  test('3 seats: the upkeep of the third seat is read of that seat alone', () => {
    const g = board(3, 2, { 1: 0 });
    g.passAll();
    g.expect.handSize(2, 3);
    g.expect.handSize(1, 0);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });
});

describe('Triskaidekaphile: exactly thirteen cards in hand at upkeep wins the game', () => {
  const board = (cards: number) => {
    const g = scenario()
      .define(TRISKA)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TRISKA.name)
      .hand('Forest', { count: cards })
      .seat(1)
      .library(...LIBRARY)
      .at('end', { active: 1, turn: 3 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    return g;
  };

  test('thirteen cards: the controller wins (CR 104.2b)', () => {
    const g = board(13);
    g.passAll();
    g.expect.gameOver({ win: 0 });
  });

  test('twelve or fourteen cards: it does not trigger', () => {
    for (const cards of [12, 14]) {
      const g = board(cards);
      expect(g.state.stack, `${cards} cards`).toEqual([]);
      g.passAll();
      expect(g.state.result ?? null, `${cards} cards`).toBeNull();
    }
  });

  test('a fourteenth card drawn in response: no win as it resolves (CR 603.4)', () => {
    const g = scenario()
      .define(TRISKA)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TRISKA.name, 'Island', 'Island', 'Island', 'Island')
      .hand('Forest', { count: 13 })
      .seat(1)
      .library(...LIBRARY)
      .at('end', { active: 1, turn: 3 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.stack).toHaveLength(1);
    g.act(0).activate(TRISKA.name, { pay: true });
    g.passAll();
    expect(g.state.stack).toEqual([]);
    g.expect.handSize(0, 14);
    g.expect.eventLog([{ kind: 'fizzled', reason: 'interveningIf' }]);
    expect(g.state.result ?? null).toBeNull();
  });

  test("an opponent's upkeep: nothing, whatever the hand", () => {
    const g = scenario()
      .define(TRISKA)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TRISKA.name)
      .hand('Forest', { count: 13 })
      .seat(1)
      .library(...LIBRARY)
      .at('end', { active: 0, turn: 3 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(g.state.result ?? null).toBeNull();
  });
});

describe('Twenty-Toed Toad', () => {
  test('the maximum hand size is twenty: twenty cards are kept in the cleanup step (CR 402.2, 514.1)', () => {
    const g = scenario()
      .define(TOAD)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOAD.name)
      .hand('Forest', { count: 20 })
      .seat(1)
      .library(...LIBRARY)
      .at('end', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.noEvent({ kind: 'discarded' });
    g.expect.handSize(0, 20);
  });

  test('twenty-two cards: two are discarded', () => {
    const g = scenario()
      .define(TOAD)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOAD.name)
      .hand('Forest', { count: 22 })
      .seat(1)
      .library(...LIBRARY)
      .at('end', { active: 0, turn: 3 })
      .build();
    g.passAll();
    g.expect.pending('discard', 0);
    expect(g.state.pending?.kind === 'discard' ? g.state.pending.count : null).toBe(2);
  });

  /** The Toad attacks alone, with `counters` +1/+1 counters and `cards` cards in hand. */
  const attack = (counters: Readonly<Record<string, number>>, cards: number, seats: 2 | 3 = 2) => {
    const b = scenario({ seats })
      .define(TOAD)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(TOAD.name, { counters })
      .hand(...Array.from({ length: cards }, () => 'Forest'));
    for (let s = 1; s < seats; s += 1) b.seat(s as SeatId).library(...LIBRARY);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([TOAD.name], { player: (seats - 1) as SeatId });
    g.passAll();
    return g;
  };

  test('twenty cards in hand: the attack wins the game', () => {
    const g = attack({}, 20);
    g.expect.gameOver({ win: 0 });
  });

  test('twenty counters of any kinds together: the attack wins the game (CR 122.1)', () => {
    const g = attack({ '+1/+1': 15, charge: 5 }, 0);
    g.expect.gameOver({ win: 0 });
  });

  test('nineteen counters and nineteen cards: no win', () => {
    const g = attack({ '+1/+1': 19 }, 19);
    expect(g.state.result ?? null).toBeNull();
  });

  test('3 seats: attacking the last seat wins with twenty cards', () => {
    const g = attack({}, 20, 3);
    g.expect.gameOver({ win: 0 });
  });
});
