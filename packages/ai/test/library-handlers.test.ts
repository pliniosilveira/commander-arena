// The AI's answers to the arrangeCards decision (scry, surveil, reorder) and to "put cards from
// your hand on top of your library", on real views from engine scenarios (D-091). The engine's own
// validation is the judge of legality: every answer is applied. All cards are SYNTHETIC or basic
// lands or Grizzly Bears (see the engine's synthetic-library.ts).
import {
  type Action,
  type ArrangeCardsDecision,
  applyAction,
  type ChooseCardsDecision,
} from '@commander-arena/engine';
import { type ScenarioBuilder, type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent, RandomLegalAgent } from '../src/index';
import { CTX } from './helpers';

function resolveTop(g: ScenarioGame): ScenarioGame {
  g.pass();
  return g.pass();
}

const nameOfId = (g: ScenarioGame, id: string): string => {
  const card = g.state.objects[id as keyof typeof g.state.objects]?.card;
  const def = card === undefined || card === null ? undefined : g.state.cards[card];
  return def === undefined ? id : (g.state.definitions[def.definition]?.name ?? id);
};

/** Seat 0 casts `spell` with `library` (top first) and these permanents and hand cards. */
function game(
  spell: string,
  library: readonly string[],
  options: { battlefield?: readonly string[]; hand?: readonly string[]; pool?: string } = {},
): ScenarioGame {
  let b: ScenarioBuilder = scenario()
    .seat(0)
    .hand(spell)
    .pool(options.pool ?? 'UC');
  for (const name of options.hand ?? []) b = b.hand(name);
  for (const name of library) b = b.library(name);
  for (const name of options.battlefield ?? []) b = b.battlefield(name);
  const g = b.seat(1).library('Llanowar Elves').build();
  g.act(0).cast(spell, { pay: true });
  return resolveTop(g);
}

function arrangeOf(g: ScenarioGame): ArrangeCardsDecision {
  const d = g.state.pending;
  if (d?.kind !== 'arrangeCards') throw new Error(`expected arrangeCards, got ${d?.kind}`);
  return d;
}

function putOnTopOf(g: ScenarioGame): ChooseCardsDecision {
  const d = g.state.pending;
  if (d?.kind !== 'chooseCards' || d.purpose !== 'putOnTop') {
    throw new Error(`expected a put on top, got ${d?.kind}`);
  }
  return d;
}

const casual = async (g: ScenarioGame): Promise<Action> => {
  const agent = new CasualAgent({ seed: 1 });
  const d = g.state.pending;
  if (d === null) throw new Error('nothing pending');
  const action = await agent.decide(g.view(0), d, CTX);
  expect(agent.fallbacks).toHaveLength(0);
  expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
  return action;
};

const named = (g: ScenarioGame, ids: readonly string[]) => ids.map((id) => nameOfId(g, id));

describe('RandomLegalAgent: arrangeCards', () => {
  test('60 seeds: every answer is accepted by the engine, and several different ones occur', async () => {
    for (const [spell, pool] of [
      ['SYNTHETIC Scry Three', 'UC'],
      ['SYNTHETIC Surveil Three', 'BC'],
      ['SYNTHETIC Reorder Three', 'U'],
    ] as const) {
      const g = game(spell, ['Island', 'Forest', 'Plains', 'Swamp', 'Mountain'], { pool });
      const d = arrangeOf(g);
      const seen = new Set<string>();
      for (let seed = 1; seed <= 60; seed += 1) {
        const action = await new RandomLegalAgent({ seed }).decide(g.view(0), d, CTX);
        expect(applyAction(g.state, 0, action).ok, `${spell} seed ${seed}`).toBe(true);
        seen.add(JSON.stringify(action));
      }
      expect(seen.size, spell).toBeGreaterThan(3);
    }
  });

  test('a put on top: every answer is accepted, in several orders', async () => {
    const g = game('SYNTHETIC Put Back Two', ['Forest'], { hand: ['Plains', 'Island', 'Swamp'] });
    const d = putOnTopOf(g);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const action = await new RandomLegalAgent({ seed }).decide(g.view(0), d, CTX);
      expect(applyAction(g.state, 0, action).ok, `seed ${seed}`).toBe(true);
      seen.add(JSON.stringify(action));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('CasualAgent: scry and surveil', () => {
  test('short of lands (none in hand, two in play) it keeps a land on top and bottoms a spell it cannot cast', async () => {
    // Top: Serra Angel (five mana), Forest. Two lands in play and none in hand.
    const g = game('SYNTHETIC Scry Two', ['Serra Angel', 'Forest', 'Plains'], {
      battlefield: ['Island', 'Island'],
    });
    const d = arrangeOf(g);
    const action = await casual(g);
    if (action.kind !== 'arrangeCards') throw new Error('expected arrangeCards');
    expect(named(g, action.top)).toEqual(['Forest']);
    expect(named(g, action.other)).toEqual(['Serra Angel']);
    expect(d.cards).toHaveLength(2);
  });

  test('with plenty of lands it bottoms a land and keeps a spell it can cast soon', async () => {
    const g = game('SYNTHETIC Scry Two', ['Forest', 'Grizzly Bears', 'Plains'], {
      battlefield: ['Island', 'Island', 'Island', 'Island', 'Island'],
    });
    const action = await casual(g);
    if (action.kind !== 'arrangeCards') throw new Error('expected arrangeCards');
    expect(named(g, action.top)).toEqual(['Grizzly Bears']);
    expect(named(g, action.other)).toEqual(['Forest']);
  });

  test('with a land in hand it does not want another land on top', async () => {
    const g = game('SYNTHETIC Scry Two', ['Forest', 'Grizzly Bears', 'Plains'], {
      battlefield: ['Island', 'Island'],
      hand: ['Mountain'],
    });
    const action = await casual(g);
    if (action.kind !== 'arrangeCards') throw new Error('expected arrangeCards');
    expect(named(g, action.top)).toEqual(['Grizzly Bears']);
    expect(named(g, action.other)).toEqual(['Forest']);
  });

  test('a surveil puts the cards it does not want into the graveyard', async () => {
    const g = game(
      'SYNTHETIC Surveil Three',
      ['Forest', 'Serra Angel', 'Grizzly Bears', 'Plains'],
      {
        battlefield: ['Swamp', 'Swamp', 'Swamp', 'Swamp'],
        pool: 'BC',
      },
    );
    const action = await casual(g);
    if (action.kind !== 'arrangeCards') throw new Error('expected arrangeCards');
    // Four lands in play: the Forest is not wanted; the Angel (four mana) and the Bears are castable.
    expect(named(g, action.other)).toEqual(['Forest']);
    expect(named(g, action.top).sort()).toEqual(['Grizzly Bears', 'Serra Angel']);
    // Cheaper spell first.
    expect(named(g, action.top)[0]).toBe('Grizzly Bears');
    g.choose(0, action);
    expect(g.state.seats[0]?.graveyard.map((id) => nameOfId(g, id))).toContain('Forest');
  });

  test('"put them back in any order" keeps every card and puts the wanted one first', async () => {
    const g = game('SYNTHETIC Reorder Three', ['Serra Angel', 'Grizzly Bears', 'Forest'], {
      battlefield: ['Island', 'Island'],
      pool: 'U',
    });
    const action = await casual(g);
    if (action.kind !== 'arrangeCards') throw new Error('expected arrangeCards');
    expect(action.other).toEqual([]);
    // Two lands in play and none in hand: the land first, then the cheaper spell, then the Angel.
    expect(named(g, action.top)).toEqual(['Forest', 'Grizzly Bears', 'Serra Angel']);
  });
});

describe('CasualAgent: put cards from the hand on top', () => {
  test('puts back the spare land and the spell it cannot cast, keeping what it can use', async () => {
    // Six lands in play: a spare land goes back; Serra Angel is castable and stays.
    const g = game('SYNTHETIC Put Back Two', ['Forest'], {
      battlefield: ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'],
      hand: ['Plains', 'Serra Angel', 'Grizzly Bears'],
    });
    const action = await casual(g);
    if (action.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect(action.objects).toHaveLength(2);
    expect(named(g, action.objects)).toContain('Plains');
    expect(named(g, action.objects)).not.toContain('Serra Angel');
  });

  test('with two lands in play it keeps its lands and puts back the expensive spells', async () => {
    const g = game('SYNTHETIC Put Back Two', ['Forest'], {
      battlefield: ['Island', 'Island'],
      hand: ['Plains', 'Serra Angel', 'Grizzly Bears', 'Mountain'],
    });
    const action = await casual(g);
    if (action.kind !== 'chooseCards') throw new Error('expected chooseCards');
    const put = named(g, action.objects);
    expect(put).toContain('Serra Angel');
    expect(put).not.toContain('Plains');
    expect(put).not.toContain('Mountain');
  });
});

describe('"put two of them into your hand and the rest on the bottom in any order" (D-324, CR 401.4)', () => {
  const STOCK = 'SYNTHETIC Stock Up Like';
  const TOP = ['Island', 'Serra Angel', 'Forest', 'Grizzly Bears', 'Plains'];

  test('RandomLegalAgent: 60 seeds, each answer to the take and to the order is accepted, in several orders', async () => {
    const g = game(STOCK, TOP, { pool: 'UCC' });
    const takes = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const d = g.state.pending;
      if (d === null) throw new Error('nothing pending');
      const action = await new RandomLegalAgent({ seed }).decide(g.view(0), d, CTX);
      expect(applyAction(g.state, 0, action).ok, `take, seed ${seed}`).toBe(true);
      takes.add(JSON.stringify(action));
    }
    expect(takes.size).toBeGreaterThan(3);
    // Take two, then arrange the three left.
    g.act(0).chooseCards(...(g.state.seats[0]?.library.slice(0, 2) ?? []));
    const d = arrangeOf(g);
    expect(d.purpose).toBe('bottom');
    const orders = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const action = await new RandomLegalAgent({ seed }).decide(g.view(0), d, CTX);
      expect(applyAction(g.state, 0, action).ok, `order, seed ${seed}`).toBe(true);
      if (action.kind === 'arrangeCards') expect(action.top).toEqual([]);
      orders.add(JSON.stringify(action));
    }
    expect(orders.size).toBeGreaterThan(2);
  });

  test('CasualAgent takes the two most expensive cards, then puts all the rest on the bottom, the spell it can cast soon first', async () => {
    const g = game(STOCK, TOP, { pool: 'UCC', battlefield: ['Island', 'Island'] });
    const take = await casual(g);
    if (take.kind !== 'chooseCards') throw new Error('expected chooseCards');
    expect(named(g, take.objects).sort()).toEqual(['Grizzly Bears', 'Serra Angel']);
    g.act(0).chooseCards(...take.objects);
    const action = await casual(g);
    if (action.kind !== 'arrangeCards') throw new Error('expected arrangeCards');
    expect(action.top).toEqual([]);
    expect(action.other).toHaveLength(3);
    expect(new Set(named(g, action.other))).toEqual(new Set(['Island', 'Forest', 'Plains']));
  });
});
