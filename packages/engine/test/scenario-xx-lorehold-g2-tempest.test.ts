// Group 2 of the Lorehold Spirit deck (issue 86): "Council's dilemma - Starting with you, each player votes for past or present. You mill a card for each past vote, then this spell deals
// damage to each opponent equal to the total mana value of cards milled this way. Exile the top card of your library for each present vote. Until the end of your next turn, you may play
// the exiled cards." (Fateful Tempest: `vote` with the amount `votesFor` as the count of a `mill` and of an `exileTop`, the milled value of `thisWay`, and `mayPlay` until the end of
// the controller's next turn.)
// Pins: CR 701.38a (each player votes, starting with the player named and proceeding in turn order), CR 701.38b (the options are words with no rules meaning), CR 701.17a (mill: as many
// cards as there are, one after the other), CR 202.3 (mana value of a card in a graveyard), CR 120.3 (damage to a player), CR 701.13 (exile), CR 611.2a and 500.1 (a duration of "your next
// turn"), CR 601.2 and 305.1 (casting and playing from exile).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-lorehold-g2.ts); the real card is played in packages/cards/test/convert-grammar-engine-lorehold-g2.test.ts.
import { describe, expect, test } from 'vitest';
import type { GameState } from '../src/index';
import { applyAction, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TEMPEST = 'SYNTHETIC Verdict Tempest'; // {2}{R} sorcery
const BOLT = 'Lightning Bolt'; // mana value 1
const MURDER = 'Murder'; // mana value 3
const BEARS = 'Grizzly Bears'; // mana value 2
const GOBLIN = 'Raging Goblin'; // {R}, mana value 1
const FILLER = Array.from({ length: 8 }, () => 'Plains');

describe('the card is valid', () => {
  test(TEMPEST, () => {
    expect(validateCard(syntheticCard(TEMPEST))).toEqual([]);
  });
});

/** Seat 0 has the Tempest and four Mountains and `library` (top first); seat 1 has Plains. Up to the first vote. */
const vote = (...library: string[]) => {
  const g = scenario()
    .define(syntheticCard(TEMPEST))
    .seat(0)
    .life(20)
    .hand(TEMPEST)
    .library(...library)
    .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();
  g.act(0).cast(TEMPEST, { pay: true });
  g.passAll();
  return g;
};

const asked = (state: GameState) => {
  const d = state.pending;
  if (d?.kind !== 'chooseOption') throw new Error('expected a chooseOption decision');
  return d;
};

describe('the vote (CR 701.38a)', () => {
  test('the controller votes first, for past or present; the opponent then sees that vote', () => {
    const g = vote(BOLT, MURDER, ...FILLER);
    expect(asked(g.state)).toMatchObject({
      seat: 0,
      purpose: 'vote',
      options: ['past', 'present'],
      vote: { controller: 0, cast: [] },
    });
    g.act(0).chooseOption('past');
    expect(asked(g.state)).toMatchObject({
      seat: 1,
      options: ['past', 'present'],
      vote: { controller: 0, cast: [{ seat: 0, option: 'past' }] },
    });
  });

  test('with three players the votes go 0, 1, 2 and both opponents are dealt the same damage', () => {
    const g = vote(BOLT, MURDER, ...FILLER);
    const s1 = g.state.seats[1];
    if (s1 === undefined) throw new Error('seat 1');
    let state: GameState = { ...g.state, seats: [...g.state.seats, { ...s1, id: 2 }] };
    const order: number[] = [];
    for (const option of ['past', 'past', 'present']) {
      const d = asked(state);
      order.push(d.seat);
      const out = applyAction(state, d.seat, { kind: 'chooseOption', option });
      if (!out.ok) throw new Error(out.error);
      state = out.state;
    }
    expect(order).toEqual([0, 1, 2]);
    // Two past votes: the Bolt (1) and the Murder (3) are milled, 4 damage to each of the two opponents.
    expect(state.seats[1]?.life).toBe(16);
    expect(state.seats[2]?.life).toBe(16);
    expect(state.seats[0]?.life).toBe(20);
  });
});

describe('past votes: "You mill a card for each past vote, then ... damage to each opponent equal to the total mana value of cards milled this way"', () => {
  test('two past votes mill two cards and deal their total mana value to the opponent', () => {
    const g = vote(BOLT, MURDER, BEARS, ...FILLER);
    g.act(0).chooseOption('past');
    g.act(1).chooseOption('past');
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone(MURDER, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 0 });
    g.expect.life(1, 16); // 1 + 3
    g.expect.life(0, 20);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('one past vote, cast by the opponent, mills one card (the votes of every player count)', () => {
    const g = vote(MURDER, BOLT, ...FILLER);
    g.act(0).chooseOption('present');
    g.act(1).chooseOption('past');
    g.expect.zone(MURDER, 'graveyard', { seat: 0 });
    g.expect.life(1, 17);
    // The one present vote exiles the next card.
    g.expect.zone(BOLT, 'exile', { seat: 0 });
  });

  test('a land milled is worth 0: no damage when only lands are milled', () => {
    const g = vote('Plains', 'Plains', ...FILLER);
    g.act(0).chooseOption('past');
    g.act(1).chooseOption('past');
    g.expect.life(1, 20);
    expect(g.find({ name: 'Plains', zone: 'graveyard', seat: 0 })).toHaveLength(2);
  });

  test('no past vote: nothing is milled and no damage is dealt', () => {
    const g = vote(BOLT, MURDER, BEARS, ...FILLER);
    g.act(0).chooseOption('present');
    g.act(1).chooseOption('present');
    g.expect.noEvent({ kind: 'milled' }, { since: 0 });
    g.expect.life(1, 20);
    expect(g.find({ name: BOLT, zone: 'graveyard', seat: 0 })).toHaveLength(0);
  });

  test('a library that runs out mills what there is, deals its value and is not a loss (milling is not drawing)', () => {
    const g = vote(MURDER);
    g.act(0).chooseOption('past');
    g.act(1).chooseOption('past');
    g.expect.zone(MURDER, 'graveyard', { seat: 0 });
    g.expect.librarySize(0, 0);
    g.expect.life(1, 17);
    g.expect.hasLost(0, false);
    g.expect.pending('priority', 0);
  });
});

describe('present votes: "Exile the top card of your library for each present vote. Until the end of your next turn, you may play the exiled cards."', () => {
  test('two present votes exile two cards, face up, which may be played this turn', () => {
    const g = vote(GOBLIN, 'Mountain', BOLT, ...FILLER);
    g.act(0).chooseOption('present');
    g.act(1).chooseOption('present');
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    g.expect.zone('Mountain', 'exile', { seat: 0 });
    g.expect.zone(BOLT, 'library', { seat: 0 });
    g.expect.legal(0, { cast: GOBLIN });
    g.expect.legal(0, { playLand: 'Mountain' });
    g.act(0).playLand('Mountain');
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a library with one card exiles that one and the permission is for it only', () => {
    const g = vote(GOBLIN);
    g.act(0).chooseOption('present');
    g.act(1).chooseOption('present');
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: GOBLIN });
    g.expect.hasLost(0, false);
  });

  test('past and present with a one-card library: the card is milled and nothing is exiled or playable', () => {
    const g = vote(MURDER);
    g.act(0).chooseOption('past');
    g.act(1).chooseOption('present');
    g.expect.zone(MURDER, 'graveyard', { seat: 0 });
    g.expect.life(1, 17);
    expect(g.find({ zone: 'exile' })).toHaveLength(0);
    g.expect.illegal(0, { cast: MURDER });
  });

  test('with no present vote nothing is exiled, and a card milled in the same resolution gets no permission to be played', () => {
    const g = vote(GOBLIN, BOLT, ...FILLER);
    g.act(0).chooseOption('past');
    g.act(1).chooseOption('past');
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.expect.illegal(0, { cast: GOBLIN });
    expect(g.find({ zone: 'exile' })).toHaveLength(0);
  });

  test('the permission lasts until the end of the controller\'s NEXT turn: this turn, the opponent\'s turn and the next one, then it is gone', () => {
    const g = vote(GOBLIN, ...FILLER);
    g.act(0).chooseOption('present');
    g.act(1).chooseOption('present');
    g.expect.legal(0, { cast: GOBLIN });
    // Through the end of this turn (it is not "this turn" only) and the opponent's turn.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1 });
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    // The controller's next turn: a creature spell at sorcery timing, in their main phase.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0 });
    g.expect.legal(0, { cast: GOBLIN });
    g.advanceTo('postcombatMain');
    g.expect.legal(0, { cast: GOBLIN });
    // After that turn ended it is not castable any more.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0 });
    g.expect.illegal(0, { cast: GOBLIN });
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
  });

  test('a card cast from the exile in the controller\'s next turn is cast normally, paying its mana cost', () => {
    const g = vote(GOBLIN, ...FILLER);
    g.act(0).chooseOption('present');
    g.act(1).chooseOption('present');
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.legal(0, { cast: GOBLIN });
    g.expect.illegal(0, { cast: GOBLIN, alternative: 'free' });
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'battlefield', { seat: 0 });
  });
});

describe('both halves of one vote', () => {
  test('one past and one present: one card milled for its value, the next exiled and playable', () => {
    const g = vote(BEARS, GOBLIN, ...FILLER);
    g.act(0).chooseOption('past');
    g.act(1).chooseOption('present');
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.life(1, 18);
    g.expect.zone(GOBLIN, 'exile', { seat: 0 });
    g.expect.legal(0, { cast: GOBLIN });
  });
});
