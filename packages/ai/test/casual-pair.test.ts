// CasualAgent answers the three questions of "Choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those
// cards to the battlefield under their owners' control" (D-951), on real engine states built with the scenario DSL. Whoever chooses gives the other player the card they like
// least (the lowest mana value, then power and toughness); the controller returns the cards only when the card it gets is worth more than the card the opponent gets. Every
// answer is one the engine lists and accepts, for both seats.
import {
  type Action,
  applyAction,
  getLegalActions,
  type ObjectId,
  type SeatId,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

const RECLAIMER = 'SYNTHETIC Reclaimer Angel';
const ANGEL = 'Serra Angel'; // mana value 5, 4/4
const SPIDER = 'Giant Spider'; // mana value 4, 2/4
const BEARS = 'Grizzly Bears'; // mana value 2, 2/2
const KNIGHT = 'Youthful Knight'; // mana value 2, 2/1
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

/** Seat 0 controls the Angel; it is the end of seat 0's turn with the trigger resolving, the first question open. */
function atFirstQuestion(mine: readonly string[], theirs: readonly string[]): ScenarioGame {
  const g = scenario()
    .seat(0)
    .battlefield(RECLAIMER)
    .graveyard(...mine)
    .library(...LIBRARY)
    .seat(1)
    .graveyard(...theirs)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
  g.advanceTo('end');
  g.passAll();
  return g;
}

async function answer(g: ScenarioGame, seat: SeatId, agent = new CasualAgent({ seed: 1 })) {
  const view = g.view(seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return agent.decide(view, view.pending, CTX);
}

function expectLegal(g: ScenarioGame, seat: SeatId, action: Action) {
  expect(
    getLegalActions(g.state, seat).some((a) => JSON.stringify(a) === JSON.stringify(action)),
  ).toBe(true);
  expect(applyAction(g.state, seat, action).ok).toBe(true);
}

const card = (g: ScenarioGame, name: string, seat: SeatId): ObjectId =>
  g.object({ name, seat, zone: 'graveyard' }).id;

describe('CasualAgent in Dawnbreak Reclaimer', () => {
  test('the controller picks the card the opponent gets back: the least valuable', async () => {
    const g = atFirstQuestion([BEARS, KNIGHT], [ANGEL, SPIDER, BEARS]);
    const action = await answer(g, 0);
    expect(action).toEqual({ kind: 'chooseCards', objects: [card(g, BEARS, 1)] });
    expectLegal(g, 0, action);
  });

  test('the opponent picks the card the controller gets back: the least valuable of the controller graveyard', async () => {
    const g = atFirstQuestion([SPIDER, BEARS, ANGEL], [KNIGHT, BEARS]);
    g.act(0).chooseCards({ name: KNIGHT, seat: 1, zone: 'graveyard' });
    g.expect.pending('chooseCards', 1);
    const action = await answer(g, 1);
    expect(action).toEqual({ kind: 'chooseCards', objects: [card(g, BEARS, 0)] });
    expectLegal(g, 1, action);
  });

  test('it returns the cards when its own is worth more than the opponent card', async () => {
    const g = atFirstQuestion([SPIDER], [BEARS]);
    g.expect.pending('confirmOptional', 0);
    const action = await answer(g, 0);
    expect(action).toEqual({ kind: 'acceptOptional' });
    expectLegal(g, 0, action);
  });

  test('it declines when the opponent card is worth more, and on a tie', async () => {
    const worse = atFirstQuestion([BEARS], [ANGEL]);
    expect(await answer(worse, 0)).toEqual({ kind: 'declineOptional' });
    const tie = atFirstQuestion([BEARS], [BEARS]);
    expect(await answer(tie, 0)).toEqual({ kind: 'declineOptional' });
  });

  test('with no creature card in an opponent graveyard it is asked nothing', async () => {
    // The opponent graveyard has no creature card: nothing is chosen, nothing is asked (CR 608.2d).
    const g = atFirstQuestion([SPIDER], ['Lightning Bolt']);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('RandomLegalAgent answers every question with a legal action', async () => {
    const g = atFirstQuestion([BEARS, KNIGHT, SPIDER], [ANGEL, SPIDER, BEARS]);
    const agent = new RandomLegalAgent({ seed: 3 });
    for (const seat of [0, 1, 0] as const) {
      const action = await answer(g, seat, agent as never);
      expectLegal(g, seat, action);
      g.choose(seat, action);
    }
    g.expect.invariants();
  });
});
