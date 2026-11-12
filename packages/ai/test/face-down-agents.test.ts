// The agents and face-down permanents (D-966, CR 701.40b, 708.5): the Casual and the Heuristic agent turn a face-down creature of their own face up when it is worth more as the
// card than as a 2/2, with the mana left after their spells, before combat or after blockers; never one that would not be better, never when the mana is not there; and they
// never see an opponent's card: an opponent's face-down permanent is a 2/2 with a label in their view and nothing else. The cards are SYNTHETIC (the engine's
// synthetic-manifest.ts); the face-down permanents are placed with `faceDown: true`.
import type { Action } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, GreedyAgent, HeuristicAgent, RandomLegalAgent } from '../src/index';
import { turnUpGain } from '../src/casual-face-down';
import { answer, expectLegal } from './casual-helpers';
import { askHeuristic, lastReason } from './heuristic-helpers';

const BRUTE = 'SYNTHETIC Manifest Brute'; // {3}{G} 4/4: a better creature than a 2/2
const FLIER = 'SYNTHETIC Manifest Flier'; // {1}{W} 1/3 flying
const VARIABLE = 'SYNTHETIC Manifest Variable'; // {X}{G} 2/2: the same body as a 2/2, turned up for {G}
const COSTLESS = 'SYNTHETIC Manifest Costless'; // a creature card with no mana cost: can't be turned up
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
type Builder = ReturnType<typeof scenario>;

function main(place: (b: Builder) => Builder, opponent: (b: Builder) => Builder = (b) => b) {
  return opponent(
    place(
      scenario()
        .seat(0)
        .life(20)
        .library(...FILLER),
    )
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

const forests = (b: Builder, count: number) => b.battlefield('Forest', { count });

describe('what the view tells the agent', () => {
  test('a creature that is better face up has a gain, one that is the same has none', () => {
    const g = main((b) =>
      forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4)
        .battlefield(VARIABLE, { faceDown: true })
        .seat(0),
    );
    const view = g.view(0);
    const brute = view.battlefield.find((o) => o.id === g.id(BRUTE));
    const variable = view.battlefield.find((o) => o.id === g.id(VARIABLE));
    expect(brute?.ifFaceUp).toMatchObject({ power: 4, toughness: 4 });
    expect(turnUpGain(brute as never) ?? 0).toBeGreaterThan(1);
    expect(variable?.ifFaceUp).toMatchObject({ power: 2, toughness: 2 });
    expect(Math.abs(turnUpGain(variable as never) ?? 99)).toBeLessThan(0.01);
  });

  test("an opponent's face-down permanent is a 2/2 with a label and no card in the agent's view", () => {
    const g = main(
      (b) => forests(b.seat(0), 4),
      (b) => b.seat(1).battlefield(BRUTE, { faceDown: true }),
    );
    const theirs = g.view(0).battlefield.find((o) => o.controller === 1);
    expect(theirs).toMatchObject({ faceDown: true, power: 2, toughness: 2, name: 'Face-down creature 1' });
    expect(theirs?.hiddenFace).toBeUndefined();
    expect(theirs?.ifFaceUp).toBeUndefined();
    expect(theirs?.turnFaceUpCost).toBeUndefined();
    expect(JSON.stringify(g.view(0))).not.toContain(BRUTE);
  });
});

describe('the Casual agent', () => {
  test('turns a better creature face up in its main phase when it can pay', async () => {
    const g = main((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0));
    const action = await answer(g);
    expect(action).toEqual({ kind: 'turnFaceUp', object: g.id(BRUTE) });
    expectLegal(g, action);
  });

  test('a spell it can cast goes first; the mana that is left turns the creature up', async () => {
    const g = main((b) =>
      forests(b.seat(0).hand('Grizzly Bears').battlefield(BRUTE, { faceDown: true }), 4).seat(0),
    );
    // {1}{G} for the Bears first, then only 2 Forests are left: not enough for the {3}{G} creature.
    const first = await answer(g);
    expect(first.kind).toBe('castSpell');
  });

  test('does not turn up a creature that would be no better (a 2/2 face up too)', async () => {
    const g = main((b) => forests(b.seat(0).battlefield(VARIABLE, { faceDown: true }), 2).seat(0));
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('has nothing to turn up when it cannot pay or the card has no mana cost: the engine offers no option', async () => {
    const poor = main((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 3).seat(0));
    expect(await answer(poor)).toEqual({ kind: 'pass' });
    const costless = main((b) =>
      forests(b.seat(0).battlefield(COSTLESS, { faceDown: true }), 4).seat(0),
    );
    expect(await answer(costless)).toEqual({ kind: 'pass' });
  });

  test('pays the cost when asked (payAuto) and the creature is the card afterwards', async () => {
    const g = main((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0));
    const agent = new CasualAgent({ seed: 1 });
    g.choose(await answer(g, agent));
    expect(g.state.pending?.kind).toBe('payMana');
    const paid = await answer(g, agent);
    expect(paid).toEqual({ kind: 'payAuto' });
    g.choose(paid);
    g.expect.pt(BRUTE, 4, 4);
  });

  test('never turns up in the opponent turn or with the stack busy (it waits for its own main phase)', async () => {
    const g = main(
      (b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0),
      (b) => b.seat(1).hand('Lightning Bolt').battlefield('Mountain'),
    );
    g.advanceTo('upkeep', { turn: 'next' });
    g.pass(1);
    expect(g.deciding).toBe(0);
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('the other agents answer legally with a face-down creature on the table', async () => {
    const g = main((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0));
    for (const agent of [new GreedyAgent({ seed: 3 }), new RandomLegalAgent({ seed: 4 })]) {
      const action: Action = await answer(g, agent);
      expectLegal(g, action);
    }
  });
});

describe('the Heuristic agent', () => {
  test('turns a better creature face up in its main phase (the remainder of the main phase, after its spells)', async () => {
    const g = main((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0));
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({ kind: 'turnFaceUp', object: g.id(BRUTE) });
  });

  test('turns a creature up after blockers when that wins the fight', async () => {
    // A face-down 2/2 attacks and is blocked by a 2/2 ... turned up it is a 4/4 and wins.
    const g = main(
      (b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0),
      (b) => b.seat(1).battlefield('Grizzly Bears'),
    );
    g.playCombat({
      attack: [BRUTE],
      block: [{ blocker: 'Grizzly Bears', attacker: BRUTE }],
      until: 'declareBlockers',
    });
    const agent = new HeuristicAgent({ seed: 1 });
    const action = await askHeuristic(g, agent);
    expect(action).toEqual({ kind: 'turnFaceUp', object: g.id(BRUTE) });
    expect(lastReason(agent)?.reason).toBe('face-up');
  });

  test('turns a creature up after blockers when it is not blocked and deals more damage face up', async () => {
    const g = main((b) => forests(b.seat(0).battlefield(BRUTE, { faceDown: true }), 4).seat(0));
    g.playCombat({ attack: [BRUTE], until: 'declareBlockers' });
    const agent = new HeuristicAgent({ seed: 1 });
    expect(await askHeuristic(g, agent)).toEqual({ kind: 'turnFaceUp', object: g.id(BRUTE) });
    expect(lastReason(agent)?.reason).toBe('face-up');
  });

  test('does not turn a creature up after blockers when nothing changes (the same body face up)', async () => {
    const g = main((b) => forests(b.seat(0).battlefield(VARIABLE, { faceDown: true }), 2).seat(0));
    g.playCombat({ attack: [VARIABLE], until: 'declareBlockers' });
    expect(await askHeuristic(g, new HeuristicAgent({ seed: 1 }))).toEqual({ kind: 'pass' });
  });

  test('a creature that would be worse or the same is left face down', async () => {
    const g = main((b) => forests(b.seat(0).battlefield(VARIABLE, { faceDown: true }), 2).seat(0));
    expect(await askHeuristic(g)).toEqual({ kind: 'pass' });
  });

  test('a flier with a small body is worth turning up for the keyword only when it gains enough', async () => {
    const g = main((b) =>
      b
        .seat(0)
        .battlefield('Plains', { count: 2 })
        .battlefield(FLIER, { faceDown: true })
        .seat(0),
    );
    const view = g.view(0);
    const flier = view.battlefield.find((o) => o.id === g.id(FLIER));
    const gain = turnUpGain(flier as never) ?? 0;
    const action = await answer(g);
    expect(action.kind).toBe(gain >= 0.5 ? 'turnFaceUp' : 'pass');
  });
});
