// CasualAgent and the keywords slice (D-185): the creatures it gives up for devour (tokens of little power, never a card), the counter or haste of
// riot (haste only when the creature can attack at once and nothing can block it), and Encore (an activation from the graveyard, used as Unearth is:
// a creature that would attack safely). Every answer is one the engine lists. Cards are SYNTHETIC (the fixtures of the engine).
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { answer, answerFor, expectLegal } from './casual-helpers';

const BRUTE = 'SYNTHETIC Devouring Brute'; // {2}{R} 2/2, devour 2
const GOBLIN = 'SYNTHETIC Riot Goblin'; // {1}{R} 2/1, riot
const BROOD = 'SYNTHETIC Dragon Broodmother'; // flying; each upkeep: a 1/1 Dragon with flying and devour 2
const PILFERER = 'SYNTHETIC Encore Pilferer'; // {R} 2/1, Encore {3}{R}
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Devour: which creatures to sacrifice', () => {
  const brood = (): ScenarioGame => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BROOD, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    return g;
  };

  test('a card it owns is never given up: with only the Broodmother and the Bears it sacrifices nothing', async () => {
    const g = brood();
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const a = await answer(g);
    expect(a).toEqual({ kind: 'choosePermanents', objects: [] });
    expectLegal(g, a);
  });

  test('a token of power 1 is given up for the counters; a token with more power is not', async () => {
    // The first Dragon (a 1/1 token, nothing sacrificed) is there when the next upkeep makes another.
    const g = brood();
    g.passAll();
    g.act(0).choosePermanents();
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const dragon = g.find({ name: 'Dragon', zone: 'battlefield', seat: 0 })[0];
    const a = await answer(g);
    expect(a).toEqual({ kind: 'choosePermanents', objects: [dragon?.id] });
    expectLegal(g, a);
  });

  test('the whole game goes on with the agent’s answer', async () => {
    const g = scenario()
      .seat(0)
      .hand(BRUTE)
      .battlefield('Mountain', { count: 3 })
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.act(0).cast(BRUTE, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.choose(0, await answer(g));
    g.expect.zone(BRUTE, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});

describe('Riot: the counter or haste', () => {
  const asked = (opponent: (b: ReturnType<typeof scenario>) => void): ScenarioGame => {
    const b = scenario().seat(0).hand(GOBLIN).battlefield('Mountain', { count: 2 }).seat(1);
    opponent(b);
    const g = b.build();
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    return g;
  };

  test('before combat with nothing to block it: haste', async () => {
    const g = asked(() => undefined);
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseOption', option: 'haste' });
    expectLegal(g, a);
  });

  test('with an untapped creature that could block it: the counter', async () => {
    const g = asked((b) => b.battlefield(SPIDER));
    const a = await answer(g);
    expect(a).toEqual({ kind: 'chooseOption', option: 'counter' });
    expectLegal(g, a);
  });

  test('after combat: the counter, haste would do nothing', async () => {
    const b = scenario().seat(0).hand(GOBLIN).battlefield('Mountain', { count: 2 }).seat(1);
    const g = b.build();
    g.advanceTo('postcombatMain');
    g.act(0).cast(GOBLIN, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    expect(await answer(g)).toEqual({ kind: 'chooseOption', option: 'counter' });
  });
});

describe('Encore: an activation from the graveyard', () => {
  test('before combat with nothing to block the token: it is activated', async () => {
    const g = scenario()
      .seat(0)
      .graveyard(PILFERER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    const a = await answerFor(g);
    expect(a.kind).toBe('activate');
    expectLegal(g, a);
  });

  test('with a blocker that kills it: it is not', async () => {
    const g = scenario()
      .seat(0)
      .graveyard(PILFERER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .battlefield(SPIDER)
      .build();
    const a = await answerFor(g);
    expect(a.kind).not.toBe('activate');
  });
});
