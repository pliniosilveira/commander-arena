// Blunder suite (issue 653, step 2b), the opponent profile: the same race, decided by what the opponent's
// deck can do. The HeuristicAgent (seat 0) is at 7 life with three 2/2s, the opponent at 20 with five
// Forests and a 7/7 it may cast next turn. A player fears that 7/7 only when it can attack at once: it has
// haste, a permanent of the opponent gives haste, or it has flash and the open mana pays for it. Against a
// deck with none of these the attack is free (SPEC A31: the decklists are known; the cards already seen are
// out of the opponent's hand). `lookahead.test.ts` has the case with a haste 7/7 in the deck.
//
// Convention of the blunder suite: a case the agent gets right today is a plain `test`; a case it gets
// wrong today is `test.fails` with a one-line comment saying what it does instead. A case is never weakened
// to make it pass. Each case is a blunder in its own position, never a general rule: a move a strong player
// could defend there does not belong here. Its comment says in one line why.
import type { CardDefinition, Keyword } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { askHeuristic, creature, lastReason } from '../heuristic-helpers';
import { blunderAgent, nameOf } from './drive';

const V2 = 'SYNTHETIC Vanilla 2/2';
const LIBRARY = { count: 10 } as const;

/** A 7/7 for {5} with the given keywords: a SYNTHETIC test card. */
const big = (name: string, keywords: readonly Keyword['kind'][] = []): CardDefinition =>
  creature(`SYNTHETIC ${name} 7/7`, 7, 7, keywords, { cost: ['5'] });

/** "Creatures you control have haste." for {2}{R}: a SYNTHETIC enchantment. */
const BANNER: CardDefinition = {
  oracleId: null,
  name: 'SYNTHETIC Haste Banner',
  layout: 'normal',
  faces: [
    {
      name: 'SYNTHETIC Haste Banner',
      manaCost: ['2', 'R'],
      supertypes: [],
      types: ['enchantment'],
      subtypes: [],
      colors: ['R'],
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText: 'Creatures you control have haste.',
      abilities: [
        {
          kind: 'static',
          static: {
            kind: 'grantKeyword',
            subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
            keyword: { kind: 'haste' },
          },
        },
      ],
      spell: null,
    },
  ],
  colorIdentity: ['R'],
  support: 'supported',
};

interface Deck {
  /** The 7/7 of the opponent's deck. */
  readonly seven: CardDefinition;
  /** How many of them are in its hand and library (one in hand, the rest in the library). */
  readonly unseen: number;
  /** How many are in its graveyard. */
  readonly seen?: number;
  /** Whether the Haste Banner is on its battlefield. */
  readonly banner?: boolean;
}

/** Seat 0 at its declare-attackers decision (see the module comment). */
function race(deck: Deck) {
  let b = scenario().define(deck.seven).define(BANNER).seat(0).life(7);
  b = b.battlefield(V2, V2, V2).library('Island', LIBRARY).seat(1);
  b = deck.unseen > 0 ? b.hand(deck.seven.name, 'Forest', 'Forest') : b.hand('Forest', 'Forest');
  b = b.battlefield('Forest', { count: 5 });
  if (deck.banner === true) b = b.battlefield(BANNER.name);
  if (deck.unseen > 1) b = b.library(deck.seven.name, { count: deck.unseen - 1 });
  if ((deck.seen ?? 0) > 0) b = b.graveyard(deck.seven.name, { count: deck.seen ?? 0 });
  const g = b.library('Forest', LIBRARY).at('precombatMain', { active: 0 }).build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

/** The attackers the agent declares, and its reason. */
async function attack(deck: Deck) {
  const g = race(deck);
  const agent = blunderAgent();
  const action = await askHeuristic(g, agent);
  if (action.kind !== 'declareAttackers')
    throw new Error(`declareAttackers expected: ${action.kind}`);
  return {
    names: action.attacks.map((a) => nameOf(g, a.attacker)),
    reason: lastReason(agent)?.reason,
  };
}

describe('no haste fear against a deck without haste', () => {
  test('three 2/2s all attack when the 7/7s of the deck have no haste and nothing gives it', async () => {
    // Wrong to hold back here: no card of the opponent can attack before the agent's next turn, and 6 damage is free.
    const { names } = await attack({ seven: big('Plain'), unseen: 4 });
    expect(names).toEqual([V2, V2, V2]);
  });

  test('three 2/2s all attack when every haste 7/7 of the deck is already in its graveyard', async () => {
    // Wrong to hold back here: the four haste 7/7s were seen going to the graveyard, so none is left to cast.
    const { names } = await attack({ seven: big('Haste', ['haste']), unseen: 0, seen: 4 });
    expect(names).toEqual([V2, V2, V2]);
  });
});

describe('haste fear against a deck that has it', () => {
  test('at 7 life, a 2/2 stays home when a permanent of the opponent gives its 7/7s haste', async () => {
    // Wrong to send all three here: the Haste Banner on its battlefield lets a 7/7 from its hand kill a player at 7 with no blocker home.
    const { names, reason } = await attack({ seven: big('Plain'), unseen: 4, banner: true });
    expect(names.length).toBeLessThan(3);
    expect(reason).toBe('crack-back');
  });

  test('at 7 life, a 2/2 stays home when the open Forests can flash in a 7/7', async () => {
    // Wrong to send all three here: five untapped Forests cast a flash 7/7 at the end of the agent's turn, and it kills a player at 7 with no blocker home.
    const { names, reason } = await attack({ seven: big('Flash', ['flash']), unseen: 4 });
    expect(names.length).toBeLessThan(3);
    expect(reason).toBe('crack-back');
  });
});
