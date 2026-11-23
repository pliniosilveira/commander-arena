// "Return a nonland card of an opponent's choice from your graveyard to your hand" with several opponents (issue 509, CR 801.5a example, 608.2d): the controller of the ability chooses
// which opponent makes the choice, as for every effect that has "an opponent" decide (issue 416); with one opponent nothing is asked. The card is the real Tasigur of the golden corpus.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const TASIGUR = real('Tasigur, the Golden Fang');
const FILLER = Array.from({ length: 10 }, () => 'Island');

/** `seats` seats; seat 0 controls Tasigur with two nonland cards in its graveyard (`a` and `b`) and has activated the mill ability, which has resolved up to the choice. */
function activated(seats: 2 | 3 | 4): ScenarioGame {
  const b = scenario({ seats }).define(TASIGUR).seat(0).battlefield(TASIGUR.name).pool('GGGG');
  b.graveyard('Grizzly Bears', { label: 'a' }).graveyard('Giant Spider', { label: 'b' });
  b.library(...FILLER);
  for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
  const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
  g.act(0).activate(TASIGUR.name, { pay: true });
  g.passAll();
  return g;
}

const inHand = (g: ScenarioGame, label: string) => g.state.objects[g.id(label)]?.zone === 'hand';

describe('Tasigur: "a nonland card of an opponent’s choice"', () => {
  test('with one opponent nothing is asked of the controller: that opponent chooses', () => {
    const g = activated(2);
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards('a');
    expect(inHand(g, 'a')).toBe(true);
    expect(inHand(g, 'b')).toBe(false);
  });

  test('with two opponents the controller chooses which one decides, and that one chooses the card', () => {
    const g = activated(3);
    g.expect.pending('chooseOption', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the choice of the opponent');
    expect(d.purpose).toBe('chooseOpponent');
    expect(d.options).toEqual(['seat:1', 'seat:2']);
    g.act(0).chooseOption('seat:2');
    g.expect.pending('chooseCards', 2);
    g.act(2).chooseCards('b');
    expect(inHand(g, 'b')).toBe(true);
    expect(inHand(g, 'a')).toBe(false);
  });

  test('the other opponent is never asked', () => {
    const g = activated(4);
    g.act(0).chooseOption('seat:1');
    g.expect.pending('chooseCards', 1);
  });
});
