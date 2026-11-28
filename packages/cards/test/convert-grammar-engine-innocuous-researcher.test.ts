// Innocuous Researcher (Deep Clue Sea deck, issue 128): "Parley — Whenever this creature attacks, each player reveals the top card of their library. For each nonland card revealed this
// way, you investigate. Then each player draws a card." and "At the beginning of your end step, you may untap all lands you control. If you do, you can't cast spells until your next turn."
// Imported through the grammar (never a fixture), defined in an engine scenario and played through applyAction. Names start with "SYNTHETIC"; the wording is that of the real card,
// taken from the golden corpus.
// Rules pinned: CR 701.20a (reveal: the card stays on top and the draw takes it), 701.16a (investigate), 121.1 (each player draws), 608.2c (counted as it resolves), 101.4 (three seats),
// 608.2d and 701.26a ("you may untap", "if you do"), 101.2 and 611.2a ("can't cast" until your next turn).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const RESEARCHER = parsed(
  'SYNTHETIC Parsed Innocuous Researcher',
  'Creature — Centaur Detective',
  "Parley — Whenever this creature attacks, each player reveals the top card of their library. For each nonland card revealed this way, you investigate. Then each player draws a card.\nAt the beginning of your end step, you may untap all lands you control. If you do, you can't cast spells until your next turn.",
  { manaCost: '{3}{G}', colors: ['G'], power: '3', toughness: '3' },
);
const SIP = parsed('SYNTHETIC Parsed Sip', 'Instant', 'Draw a card.', {
  manaCost: '{G}',
  colors: ['G'],
});
const SPELL_CARD = 'Llanowar Elves';
const FILLER = Array.from({ length: 10 }, () => 'Forest');

describe('Innocuous Researcher: the grammar reads both abilities', () => {
  test('two abilities, no unread text', () => {
    expect(RESEARCHER.faces[0]?.abilities).toHaveLength(2);
  });
});

describe('Innocuous Researcher: played in a three-seat game', () => {
  const board = (top0: string, top1: string, top2: string) =>
    scenario({ seats: 3 })
      .define(RESEARCHER)
      .define(SIP)
      .seat(0)
      .library(top0, ...FILLER)
      .hand(SIP.name)
      .battlefield('Forest', 'Forest', RESEARCHER.name)
      .seat(1)
      .library(top1, ...FILLER)
      .seat(2)
      .library(top2, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('when it attacks, I investigate for each nonland card revealed, then every player draws the card they revealed', () => {
    const g = board(SPELL_CARD, 'Forest', SPELL_CARD);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: RESEARCHER.name, target: { player: 1 } }]);
    g.passAll();
    // Seat 0 and seat 2 revealed a nonland card (Llanowar Elves); seat 1 a land: two Clues for me.
    g.expect.zone('Clue', 'battlefield', { seat: 0, count: 2 });
    g.expect.handSize(0, 2);
    g.expect.handSize(1, 1);
    g.expect.handSize(2, 1);
    g.expect.invariants();
  });

  test('with only lands revealed no Clue is made, and every player still draws', () => {
    const g = board('Forest', 'Forest', 'Forest');
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: RESEARCHER.name, target: { player: 1 } }]);
    g.passAll();
    g.expect.noObject('Clue');
    g.expect.handSize(0, 2);
  });

  /** Passes priority, in the step where it is, until seat 0 holds it (the opponents act first in their own turns). */
  const toSeat0 = (g: ReturnType<typeof board>) => {
    for (let i = 0; i < 4; i += 1) {
      const holder = g.state.turn.prioritySeat;
      if (holder === null || holder === 0) return;
      g.act(holder).pass();
    }
  };

  test('at my end step I may untap my lands; if I do I can’t cast spells until my next turn', () => {
    const g = board('Forest', 'Forest', 'Forest');
    g.advanceTo('end');
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    // Seat 1's turn, then seat 2's: I can't cast my instant though my lands are untapped.
    toSeat0(g);
    g.expect.illegal(0, { cast: SIP.name });
    g.advanceTo('upkeep', { turn: 'next' });
    toSeat0(g);
    g.expect.illegal(0, { cast: SIP.name });
    // My next turn begins: the lock is gone.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.legal(0, { cast: SIP.name });
    g.expect.invariants();
  });

  test('declining leaves me free to cast on the opponents’ turns', () => {
    const g = board('Forest', 'Forest', 'Forest');
    g.advanceTo('end');
    g.passAll();
    g.act(0).decline();
    g.passAll();
    toSeat0(g);
    g.expect.legal(0, { cast: SIP.name });
  });
});
