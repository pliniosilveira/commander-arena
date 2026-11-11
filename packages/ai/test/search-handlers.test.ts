// The AI's answers to the chooseCards decision (library search and discard), on real views from
// engine scenarios. The engine's own validation is the judge of legality: every answer is applied.
// All cards are SYNTHETIC or basic lands (see the engine's synthetic-search.ts).
import {
  type Action,
  applyAction,
  type ChooseCardsDecision,
  type GameState,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

function resolveTop(g: ScenarioGame): ScenarioGame {
  g.pass();
  return g.pass();
}

function decisionOf(g: ScenarioGame): ChooseCardsDecision {
  const d = g.state.pending;
  if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
  return d;
}

const names = (g: ScenarioGame, action: Action): string[] =>
  action.kind === 'chooseCards'
    ? action.objects.map((id) => {
        const card = g.state.objects[id]?.card;
        const def = card === undefined || card === null ? undefined : g.state.cards[card];
        return def === undefined ? id : (g.state.definitions[def.definition]?.name ?? id);
      })
    : [];

/** Seat 0 resolves Twin Land Fetch with this library (top first) and battlefield. */
function twinFetch(library: readonly string[], battlefield: readonly string[] = []) {
  const b = scenario().seat(0).hand('SYNTHETIC Twin Land Fetch').pool('GGC');
  for (const name of library) b.library(name);
  for (const name of battlefield) b.battlefield(name);
  const g = b.seat(1).build();
  g.act(0).cast('SYNTHETIC Twin Land Fetch', { pay: true });
  resolveTop(g);
  return g;
}

function accepted(state: GameState, seat: number, action: Action): boolean {
  return applyAction(state, seat, action).ok;
}

describe('RandomLegalAgent: chooseCards', () => {
  test('60 seeds on a search: every answer is legal; none, one and two cards all occur', async () => {
    const g = twinFetch([
      'Island',
      'Forest',
      'Plains',
      'Swamp',
      'Mountain',
      'Forest',
      'Grizzly Bears',
    ]);
    const d = decisionOf(g);
    const view = g.view(0);
    const sizes = new Set<number>();
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const agent = new RandomLegalAgent({ seed });
      const action = await agent.decide(view, d, CTX);
      expect(action.kind, `seed ${seed}`).toBe('chooseCards');
      expect(accepted(g.state, 0, action), `seed ${seed}`).toBe(true);
      expect(agent.fallbacks, `seed ${seed}`).toHaveLength(0);
      if (action.kind === 'chooseCards') {
        sizes.add(action.objects.length);
        if (action.objects[0] !== undefined) firsts.add(action.objects[0]);
      }
    }
    expect([...sizes].sort()).toEqual([0, 1, 2]);
    // The first card found (the one going onto the battlefield) varies with the seed.
    expect(firsts.size).toBeGreaterThan(2);
  });

  test('60 seeds on a discard: exactly the count, distinct cards of the hand', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Discard Three')
      .hand('Plains', 'Forest', 'Island', 'Swamp', 'Mountain')
      .pool('B')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Discard Three', { pay: true });
    resolveTop(g);
    const d = decisionOf(g);
    const view = g.view(0);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const agent = new RandomLegalAgent({ seed });
      const action = await agent.decide(view, d, CTX);
      expect(accepted(g.state, 0, action), `seed ${seed}`).toBe(true);
      expect(agent.fallbacks).toHaveLength(0);
      if (action.kind === 'chooseCards') {
        expect(action.objects).toHaveLength(3);
        seen.add(JSON.stringify([...action.objects].sort()));
      }
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  test("answers the other player's discard from its own view", async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Opponent Discards Two')
      .pool('CB')
      .seat(1)
      .hand('Plains', 'Forest', 'Grizzly Bears')
      .build();
    g.act(0).cast('SYNTHETIC Opponent Discards Two', { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    const d = decisionOf(g);
    expect(d.seat).toBe(1);
    for (let seed = 1; seed <= 20; seed += 1) {
      const action = await new RandomLegalAgent({ seed }).decide(g.view(1), d, CTX);
      expect(accepted(g.state, 1, action), `seed ${seed}`).toBe(true);
    }
  });
});

describe('CasualAgent: a search', () => {
  const decide = async (g: ScenarioGame) => {
    const agent = new CasualAgent({ seed: 1 });
    const action = await agent.decide(g.view(0), decisionOf(g), CTX);
    expect(agent.fallbacks).toHaveLength(0);
    expect(accepted(g.state, 0, action)).toBe(true);
    return action;
  };

  test('prefers a basic land of a colour it lacks over the first card listed', async () => {
    // Offered by name: Forest, Forest, Island, Mountain, Plains. It has Forest and Mountain.
    const g = twinFetch(
      ['Forest', 'Forest', 'Mountain', 'Plains', 'Island', 'Grizzly Bears'],
      ['Forest', 'Mountain'],
    );
    const action = await decide(g);
    expect(names(g, action)).toEqual(['Island', 'Plains']);
  });

  test('takes one card of each lacking colour, not two of the same', async () => {
    const g = twinFetch(['Island', 'Island', 'Island', 'Forest'], ['Forest']);
    const action = await decide(g);
    // Only Islands lack; after the first, a second Island is no better than the first card listed.
    expect(names(g, action)).toEqual(['Island', 'Forest']);
  });

  test('falls back to the first card listed when it has every colour', async () => {
    const g = twinFetch(
      ['Plains', 'Forest', 'Island'],
      ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'],
    );
    const action = await decide(g);
    expect(names(g, action)).toEqual(['Forest', 'Island']);
  });

  test('finds as many cards as the search allows, and fewer only when fewer are there', async () => {
    const g = twinFetch(['Plains']);
    expect(names(g, await decide(g))).toEqual(['Plains']);
  });

  test('a search for a creature takes the first card listed', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Creature Tutor')
      .pool('GC')
      .library('Forest', 'Llanowar Elves', 'Grizzly Bears')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Creature Tutor', { pay: true });
    resolveTop(g);
    expect(names(g, await decide(g))).toEqual(['Grizzly Bears']);
  });
});

describe('CasualAgent: a discard', () => {
  function discardGame(
    hand: readonly string[],
    battlefield: readonly string[],
    spell = 'SYNTHETIC Loot',
  ) {
    const b = scenario()
      .seat(0)
      .hand(spell)
      .pool(spell === 'SYNTHETIC Loot' ? 'U' : 'B');
    for (const name of hand) b.hand(name);
    for (const name of battlefield) b.battlefield(name);
    const g = b.library('Plains').seat(1).build();
    g.act(0).cast(spell, { pay: true });
    resolveTop(g);
    return g;
  }
  const decide = async (g: ScenarioGame) => {
    const agent = new CasualAgent({ seed: 1 });
    const action = await agent.decide(g.view(0), decisionOf(g), CTX);
    expect(agent.fallbacks).toHaveLength(0);
    expect(accepted(g.state, 0, action)).toBe(true);
    return action;
  };

  test('discards the most expensive card it cannot cast', async () => {
    // Two lands: Wrath (4) and Twin Land Fetch (3) are out of reach; Bolt (1) is not.
    const g = discardGame(
      ['Lightning Bolt', 'SYNTHETIC Twin Land Fetch', 'SYNTHETIC Wrath'],
      ['Plains', 'Plains'],
    );
    expect(names(g, await decide(g))).toEqual(['SYNTHETIC Wrath']);
  });

  test('with several to discard it takes the uncastable cards from the most expensive down', async () => {
    const g = discardGame(
      ['Lightning Bolt', 'SYNTHETIC Twin Land Fetch', 'SYNTHETIC Wrath', 'Plains'],
      ['Plains', 'Plains'],
      'SYNTHETIC Discard Three',
    );
    const action = await decide(g);
    const chosen = names(g, action);
    expect(chosen).toHaveLength(3);
    expect(chosen).toContain('SYNTHETIC Wrath');
    expect(chosen).toContain('SYNTHETIC Twin Land Fetch');
  });

  test('with nothing out of reach it uses the usual choice: the most expensive spell', async () => {
    const g = discardGame(
      ['Lightning Bolt', 'Grizzly Bears'],
      ['Plains', 'Plains', 'Plains', 'Plains'],
    );
    // Three cards in hand after the draw (Plains drawn): no surplus land, so the highest value goes.
    expect(names(g, await decide(g))).toEqual(['Grizzly Bears']);
  });
});
