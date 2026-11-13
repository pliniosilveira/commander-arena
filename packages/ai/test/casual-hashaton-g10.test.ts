// CasualAgent and "As an additional cost to cast this spell, discard X cards. Return X target creature cards from your graveyard to your hand." (D-386), on real
// engine states built with the scenario DSL. The policy: it casts the spell only when it has a card it is glad to lose (a surplus land, a card it cannot cast) and a creature
// card in its graveyard to return; it announces no more X than the cards it is glad to lose; the engine offers no X above the cards in hand and the creature cards in
// the graveyard, and every answer is one the engine lists.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { answer, answerFor, expectLegal, sameAction } from './casual-helpers';

const RECALL = 'SYNTHETIC Dream Recall';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';

/** Seat 0 at its first main phase: the spell and `hand` in hand, four Swamps (lands enough that spare lands are surplus), `graveyard` cards. */
function game(hand: readonly string[], graveyard: readonly string[]) {
  return scenario()
    .seat(0)
    .hand(RECALL, ...hand)
    .battlefield('Swamp', { count: 4 })
    .graveyard(...graveyard)
    .landsPlayed(1)
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

describe('what it announces for "discard X cards"', () => {
  test('X is the number of cards it is glad to lose: the surplus lands', async () => {
    const g = game(['Forest', 'Island', 'Lightning Bolt'], [BEARS, SPIDER, ELVES]);
    g.act(0).cast(RECALL);
    g.expect.pending('chooseX', 0);
    expect(g.state.pending).toMatchObject({ min: 0, max: 3 });
    // Two lands beyond what it needs are expendable; the Bolt is a card it wants to cast.
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseX', value: 2 });
    expectLegal(g, action);
    g.choose(action);
    // The targets: exactly two of the three creature cards.
    const targets = await answer(g);
    expect(targets).toMatchObject({ kind: 'chooseTargets' });
    if (targets.kind !== 'chooseTargets') throw new Error('targets expected');
    expect(targets.targets).toHaveLength(2);
    expectLegal(g, targets);
    g.choose(targets);
    g.act(0).payAuto();
    // The cards it discards are the lands, not the Bolt.
    g.expect.pending('chooseCards', 0);
    const discard = await answer(g);
    expectLegal(g, discard);
    g.choose(discard);
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'hand', { seat: 0 });
    g.passAll();
    g.expect.invariants();
  });

  test('never more than the engine offers: the creature cards in the graveyard limit X', async () => {
    const g = game(['Forest', 'Island', 'Plains'], [BEARS]);
    g.act(0).cast(RECALL);
    expect(g.state.pending).toMatchObject({ kind: 'chooseX', max: 1 });
    const action = await answer(g);
    expect(action).toEqual({ kind: 'chooseX', value: 1 });
    expectLegal(g, action);
  });
});

describe('whether it casts the spell at all', () => {
  const casts = async (hand: readonly string[], graveyard: readonly string[]) => {
    const g = game(hand, graveyard);
    const action = await answerFor(g, new CasualAgent({ seed: 1 }));
    const recall = g.id(RECALL);
    return action.kind === 'castSpell' && action.object === recall;
  };

  test('with a surplus land and a creature card to return: yes', async () => {
    expect(await casts(['Forest', 'Island'], [BEARS])).toBe(true);
  });

  test('with only cards it wants to keep in hand: no', async () => {
    expect(await casts(['Lightning Bolt', 'Giant Spider'], [BEARS])).toBe(false);
  });

  test('with no creature card in the graveyard: no (the spell would return nothing)', async () => {
    expect(await casts(['Forest', 'Island'], ['Lightning Bolt'])).toBe(false);
  });

  test('the answer is one the engine lists', async () => {
    const g = game(['Forest', 'Island'], [BEARS]);
    const action = await answerFor(g);
    expect(sameAction(action, action)).toBe(true);
    expectLegal(g, action);
  });
});
