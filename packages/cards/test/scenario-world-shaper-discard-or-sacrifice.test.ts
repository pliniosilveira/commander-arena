// World Shaper deck: the REAL Oracle text of Eumidian Wastewaker (the corpus's golden.jsonl) goes through the grammar with no override and is played through applyAction with three and
// four seats. Pins: CR 508.5 (defending player), CR 101.4 (the players choose in APNAP order), CR 701.9 (discard), CR 701.21a (sacrifice), CR 608.2c (this way), CR 111.1 (a token is not
// a card). Scryfall ruling (2025-07-25): you choose first, then defending player; a player who can't discard must sacrifice; only land cards in the graveyard are counted.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const FILLER = Array.from({ length: 12 }, () => 'Island');
const BEARS = 'Grizzly Bears';

describe('Eumidian Wastewaker: "you and defending player each discard a card or sacrifice a permanent. You draw a card for each land card put into a graveyard this way."', () => {
  const WW = real('Eumidian Wastewaker');

  /** Seat 0 controls the Wastewaker, a Forest and a Grizzly Bears; every other seat has a Forest and a Grizzly Bears unless it is `bare`. */
  const start = (
    seats: 2 | 3 | 4,
    hands: readonly (readonly string[])[],
    bare: readonly number[] = [],
  ) => {
    const b = scenario({ seats }).define(WW);
    b.seat(0)
      .library(...FILLER)
      .hand(...(hands[0] ?? []))
      .battlefield(WW.name, { label: 'ww' })
      .battlefield('Forest', { label: 's0forest' })
      .battlefield(BEARS, { label: 's0bear' });
    for (let seat = 1; seat < seats; seat += 1) {
      const s = b
        .seat(seat)
        .library(...FILLER)
        .hand(...(hands[seat] ?? []));
      if (!bare.includes(seat)) {
        s.battlefield('Forest', { label: `s${seat}forest` }).battlefield(BEARS, {
          label: `s${seat}bear`,
        });
      }
    }
    return b.at('precombatMain', { active: 0, turn: 5 }).build();
  };
  const attack = (g: ReturnType<typeof start>, defender: number) => {
    g.advanceTo('declareAttackers');
    g.act(0).attack('ww', { player: defender });
    g.passAll();
  };
  const handSize = (g: ReturnType<typeof start>, seat: number) =>
    g.state.seats[seat]?.hand.length ?? 0;

  test('you and the attacked player (not the third seat) each choose; a discarded land and a sacrificed land are two draws', () => {
    const g = start(3, [['Plains'], [], ['Island']]);
    attack(g, 2);
    const before = handSize(g, 0);
    // You choose first (CR 101.4: the active player first): discard a Plains.
    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional', seat: 0 });
    g.act(0).accept();
    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional', seat: 2 });
    // The defending player takes the other way: sacrifices the Forest of their choice.
    g.act(2).decline();
    g.act(2).choosePermanents('s2forest');
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.zone('Forest', 'graveyard', { seat: 2 });
    // The seat that was not attacked was never asked and keeps everything.
    expect(handSize(g, 1)).toBe(0);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    // Plains discarded (-1 card) and two land cards put into graveyards (+2 cards).
    expect(handSize(g, 0)).toBe(before - 1 + 2);
    expect(handSize(g, 2)).toBe(1);
    g.expect.invariants();
  });

  test('a nonland card discarded and a nonland permanent sacrificed draw nothing (four seats)', () => {
    const g = start(4, [['Lightning Bolt'], [], [], ['Lightning Bolt']]);
    attack(g, 3);
    const before = handSize(g, 0);
    g.act(0).accept();
    g.act(3).decline();
    g.act(3).choosePermanents('s3bear');
    g.expect.zone(BEARS, 'graveyard', { seat: 3 });
    expect(handSize(g, 0)).toBe(before - 1);
    expect(handSize(g, 3)).toBe(1);
  });

  test('a player with an empty hand is not asked: they sacrifice a permanent of their choice', () => {
    const g = start(3, [['Plains'], [], []]);
    attack(g, 1);
    const before = handSize(g, 0);
    g.act(0).accept();
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 1 });
    g.act(1).choosePermanents('s1forest');
    expect(handSize(g, 0)).toBe(before - 1 + 2);
  });

  test('a player with no permanent to sacrifice discards without being asked', () => {
    const g = start(3, [[], ['Island'], []], [1]);
    attack(g, 1);
    // The controller has a permanent and no card: they sacrifice.
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 0 });
    g.act(0).choosePermanents('s0forest');
    // The defending player has a card and no permanent: the discard is the only way (their one card goes without a choice).
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    expect(handSize(g, 0)).toBe(2);
  });

  test('the player chooses which card to discard: a land among several draws, the nonland one does not', () => {
    const g = start(3, [['Plains', 'Lightning Bolt'], ['Island', 'Lightning Bolt'], []]);
    attack(g, 1);
    const before = handSize(g, 0);
    g.act(0).accept();
    g.act(1).accept();
    g.act(0).chooseCards('Lightning Bolt');
    g.act(1).chooseCards('Island');
    // One land card (seat 1's Island) reached a graveyard, so one card is drawn.
    expect(handSize(g, 0)).toBe(before - 1 + 1);
    g.expect.zone('Lightning Bolt', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});
