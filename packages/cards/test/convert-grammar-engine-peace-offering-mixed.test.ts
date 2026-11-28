// The Peace Offering deck (Bloomburrow Commander), group E: REAL cards of the golden corpus read through the grammar only and played in an engine scenario.
// Bloodroot Apothecary: "Whenever an opponent sacrifices a noncreature token, that player gets two poison counters." (CR 701.21a, 122.1, 704.5c).
// Mr. Foxglove: "Whenever ~ attacks, draw cards equal to the number of cards in defending player's hand minus the number of cards in your hand. If you didn't draw cards this
// way, you may put a creature card from your hand onto the battlefield." (CR 508.5, 107.1b, 608.2c).
// Communal Brewing: "When ~ enters, any number of target opponents each draw a card. Put an ingredient counter on ~, then put an ingredient counter on it for each card drawn this
// way." and "Whenever you cast a creature spell, that creature enters with X additional +1/+1 counters on it, where X is the number of ingredient counters on ~." (CR 121.1, 608.2c,
// 614.1c, 113.7a).
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

const APOTHECARY = real('Bloodroot Apothecary');
const FOXGLOVE = real('Mr. Foxglove');
const BREWING = real('Communal Brewing');
const RIFT = real('Cyclonic Rift');

const LIBRARY = Array.from({ length: 10 }, () => 'Island');

const triggered = (card: CardDefinition, index: number) =>
  card.faces[0]?.abilities.filter((a) => a.kind === 'triggered')[index];

describe('Bloodroot Apothecary: an opponent who sacrifices a noncreature token gets two poison counters', () => {
  test('it reads as a sacrifice trigger of opponents, noncreature tokens, giving poison to that player', () => {
    expect(triggered(APOTHECARY, 1)).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'permanentSacrificed',
        by: 'opponent',
        filter: { notTypes: ['creature'], token: true },
      },
      effect: { kind: 'givePoison', player: { kind: 'triggerPlayer' }, amount: 2 },
    });
  });

  /** Seat 0 casts the Apothecary; its enters trigger gives seat 0 and the target opponent a Treasure each. */
  const board = (seats: 2 | 3, opponent: SeatId) => {
    const b = scenario({ seats }).define(APOTHECARY);
    for (let s = 0; s < seats; s += 1) b.seat(s as SeatId).library(...LIBRARY);
    b.seat(0).hand(APOTHECARY.name).battlefield('Forest', 'Forest', 'Forest');
    const g = b.build();
    g.act(0).cast(APOTHECARY.name, { pay: true });
    g.passAll();
    // With one opponent the only legal target is chosen by itself.
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets({ player: opponent });
    g.passAll();
    return g;
  };

  test('the opponent sacrifices their Treasure for mana: they get two poison counters (CR 701.21a, 122.1)', () => {
    const g = board(2, 1);
    g.pass(0);
    g.act(1).tapForMana({ name: 'Treasure', seat: 1 }, { color: 'G' });
    g.passAll();
    expect(g.state.seats[1]?.poison).toBe(2);
    expect(g.state.seats[0]?.poison).toBe(0);
    g.expect.invariants();
  });

  test('the controller sacrificing their own Treasure gives nobody poison', () => {
    const g = board(2, 1);
    g.act(0).tapForMana({ name: 'Treasure', seat: 0 }, { color: 'G' });
    expect(g.state.stack).toEqual([]);
    expect(g.state.seats[0]?.poison).toBe(0);
    expect(g.state.seats[1]?.poison).toBe(0);
  });

  test('3 seats: only the opponent who sacrificed gets the counters', () => {
    const g = board(3, 2);
    g.pass(0);
    g.pass(1);
    g.act(2).tapForMana({ name: 'Treasure', seat: 2 }, { color: 'G' });
    g.passAll();
    expect(g.state.seats[2]?.poison).toBe(2);
    expect(g.state.seats[1]?.poison).toBe(0);
    g.expect.invariants();
  });
});

describe("Mr. Foxglove: draw the defending player's hand less yours, else put a creature onto the battlefield", () => {
  test('it reads as a draw of the difference, then the offer when no card was drawn', () => {
    expect(triggered(FOXGLOVE, 0)).toEqual({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'draw',
            player: { kind: 'you' },
            count: {
              kind: 'subtract',
              of: [
                { kind: 'countOf', filter: { zone: 'hand', owner: { kind: 'defendingPlayer' } } },
                { kind: 'countOf', filter: { zone: 'hand', controller: 'you' } },
              ],
            },
          },
          {
            kind: 'conditional',
            condition: {
              kind: 'not',
              term: { kind: 'thisWayAtLeast', what: 'playersDrew', count: 1 },
            },
            effect: {
              kind: 'moveToZone',
              objects: {
                kind: 'choose',
                filter: { zone: 'hand', types: ['creature'], controller: 'you' },
                optional: true,
              },
              to: 'battlefield',
            },
          },
        ],
      },
    });
  });

  /** Seat 0 attacks `defender` with Mr. Foxglove; `hands` is the number of Forests in each hand, and seat 0 also holds the extra cards named. */
  const attack = (
    seats: 2 | 3,
    defender: SeatId,
    hands: Readonly<Record<number, number>>,
    extra: readonly string[] = [],
  ) => {
    const b = scenario({ seats }).define(FOXGLOVE);
    for (let s = 0; s < seats; s += 1) {
      b.seat(s as SeatId).library(...LIBRARY);
      const count = hands[s] ?? 0;
      if (count > 0) b.hand('Forest', { count });
      if (s === 0) {
        b.battlefield(FOXGLOVE.name);
        if (extra.length > 0) b.hand(...extra);
      }
    }
    const g = b.build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([FOXGLOVE.name], { player: defender });
    g.passAll();
    return g;
  };

  test('the defending player holds three more cards: you draw three (CR 508.5, 608.2c)', () => {
    const g = attack(2, 1, { 0: 2, 1: 5 });
    g.expect.handSize(0, 5);
    g.expect.handSize(1, 5);
    g.expect.invariants();
  });

  test('a negative difference draws nothing (CR 107.1b), and the creature card may be put onto the battlefield', () => {
    const g = attack(2, 1, { 0: 3, 1: 1 }, ['Grizzly Bears']);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: 'Grizzly Bears', zone: 'hand' });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield');
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });

  test('equal hands draw nothing; the offer may be declined', () => {
    const g = attack(2, 1, { 0: 1, 1: 2 }, ['Grizzly Bears']);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand');
    g.expect.handSize(0, 2);
  });

  test('cards drawn: no offer, the creature card stays in hand', () => {
    const g = attack(2, 1, { 0: 1, 1: 4 }, ['Grizzly Bears']);
    g.expect.handSize(0, 4);
    g.expect.zone('Grizzly Bears', 'hand');
    g.expect.noEvent({ kind: 'zoneChanged', to: 'battlefield' });
  });

  test('3 seats: the defending player is the player attacked, not another opponent (CR 508.5a)', () => {
    const g = attack(3, 2, { 0: 1, 1: 6, 2: 3 });
    g.expect.handSize(0, 3);
    g.expect.invariants();
  });
});

describe('Communal Brewing: ingredient counters for each card drawn, then counters on each creature you cast', () => {
  test('its abilities read as the targeted draw with the count of cards drawn, and the cast trigger with an amount', () => {
    expect(triggered(BREWING, 0)).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' }, anyNumber: true }],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'target', id: 't1' }, count: 1 },
          { kind: 'addCounters', objects: { kind: 'this' }, counter: 'ingredient', count: 1 },
          {
            kind: 'addCounters',
            objects: { kind: 'this' },
            counter: 'ingredient',
            count: { kind: 'thisWay', what: 'cardsDrawn' },
          },
        ],
      },
    });
    expect(triggered(BREWING, 1)).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: { types: ['creature'], stackKind: 'spell' },
        by: 'you',
      },
      effect: {
        kind: 'spellEntersWithCounters',
        counter: '+1/+1',
        count: { kind: 'countersOn', of: { kind: 'this' }, counter: 'ingredient' },
      },
    });
  });

  /** Seat 0 casts Communal Brewing and targets the opponents named. */
  const brew = (seats: 2 | 3, targets: readonly SeatId[], emptyLibrary?: SeatId) => {
    const b = scenario({ seats }).define(BREWING).define(RIFT);
    for (let s = 0; s < seats; s += 1) {
      b.seat(s as SeatId);
      if (s !== emptyLibrary) b.library(...LIBRARY);
    }
    b.seat(0)
      .hand(BREWING.name, 'Grizzly Bears')
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest');
    b.seat(1).hand(RIFT.name).battlefield('Island', 'Island');
    const g = b.build();
    g.act(0).cast(BREWING.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(...targets.map((player) => ({ player })));
    g.passAll();
    return g;
  };

  test('two opponents targeted: one counter, then one for each of the two cards drawn (CR 608.2c)', () => {
    const g = brew(3, [1, 2]);
    g.expect.handSize(1, 2);
    g.expect.handSize(2, 1);
    g.expect.counters(BREWING.name, { ingredient: 3 });
    g.expect.invariants();
  });

  test('no target chosen: the ability still resolves with the one counter', () => {
    const g = brew(2, []);
    g.expect.handSize(1, 1);
    g.expect.counters(BREWING.name, { ingredient: 1 });
  });

  test('a target with an empty library draws nothing, so no counter is put for it (CR 121.1)', () => {
    const g = brew(3, [1, 2], 2);
    g.expect.counters(BREWING.name, { ingredient: 2 });
  });

  test('a creature spell cast after it enters with as many additional +1/+1 counters (CR 614.1c)', () => {
    const g = brew(3, [1, 2]);
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.counters('Grizzly Bears', { '+1/+1': 3 });
    g.expect.pt('Grizzly Bears', 5, 5);
    g.expect.invariants();
  });

  test('Brewing bounced in response: its counters as it last existed are used (CR 113.7a, 608.2h)', () => {
    const g = brew(2, [1]);
    g.expect.counters(BREWING.name, { ingredient: 2 });
    g.act(0).cast('Grizzly Bears', { pay: true });
    // The cast trigger is on the stack above the Bears; the opponent returns Brewing to its owner's hand.
    g.pass(0);
    g.act(1).cast(RIFT.name, { targets: [BREWING.name], pay: true });
    g.passAll();
    g.expect.zone(BREWING.name, 'hand');
    g.expect.counters('Grizzly Bears', { '+1/+1': 2 });
    g.expect.invariants();
  });
});
