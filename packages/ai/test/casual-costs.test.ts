// CasualAgent and the costs of D-095, on real engine states built with the scenario DSL: it pays the
// additional costs it is asked for sensibly (sacrifices its least valuable permanent, discards the
// card it wants least), skips a spell whose additional cost is not worth it, counts cost reductions
// when choosing what to cast, casts a card without paying its mana cost when it may, and answers
// "Ward—Discard a card." by the worth of its spell.
import type { Action, CardDefinition, CardType, Color } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { CTX } from './helpers';

async function answer(g: ScenarioGame, seed = 1): Promise<Action> {
  const decision = g.state.pending;
  if (decision === null) throw new Error('nothing is pending');
  const view = g.view(decision.seat);
  if (view.pending === null) throw new Error('the seat does not see its decision');
  return new CasualAgent({ seed }).decide(view, view.pending, CTX);
}

/** Lets the agent answer until the decision it is waiting on is priority of `seat`, like a turn. */
async function play(g: ScenarioGame, steps = 12): Promise<void> {
  for (let i = 0; i < steps; i += 1) {
    const d = g.state.pending;
    if (d === null || (d.kind === 'priority' && g.state.stack.length > 0 && i > 0)) return;
    const action = await answer(g);
    g.choose(action);
  }
}

// SYNTHETIC test cards, defined here (the fixtures module is not part of the engine API).
interface CardInput {
  readonly name: string;
  readonly manaCost: string[];
  readonly types: CardType[];
  readonly colors?: Color[];
  readonly power?: number;
  readonly toughness?: number;
}
const singleFaceFixture = (input: CardInput): CardDefinition => ({
  oracleId: null,
  name: input.name,
  layout: 'normal',
  faces: [
    {
      name: input.name,
      manaCost: input.manaCost,
      supertypes: [],
      types: input.types,
      subtypes: [],
      colors: input.colors ?? [],
      power: input.power ?? null,
      toughness: input.toughness ?? null,
      loyalty: null,
      defense: null,
      oracleText: '',
      abilities: [],
      spell: input.types.includes('sorcery')
        ? { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } }
        : null,
    },
  ],
  colorIdentity: input.colors ?? [],
  support: 'supported',
});
const sorcery = (name: string, cost: string[]): CardDefinition =>
  singleFaceFixture({ name, manaCost: cost, types: ['sorcery'] });

describe('additional costs it pays', () => {
  test('a sacrifice: its least valuable creature goes, a good one stays', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Sacrifice Draw')
      .battlefield('Swamp', 'Giant Spider', 'SYNTHETIC Doomed Scout', 'Grizzly Bears')
      .landsPlayed(1)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    // The Scout (a 1/1 for {1}) is worth less than the sorcery's {2} + 2: cast it.
    g.act(0).cast('SYNTHETIC Sacrifice Draw', { pay: true });
    g.expect.pending('choosePermanent', 0);
    const chosen = await answer(g);
    expect(chosen).toEqual({ kind: 'choosePermanents', objects: [g.id('SYNTHETIC Doomed Scout')] });
  });

  test('a discard: the surplus land goes before a spell it can cast', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Discard Burn', 'Forest', 'Forest', 'Forest', 'Forest', 'Grizzly Bears')
      .battlefield('Mountain', 'Forest')
      .landsPlayed(1)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Discard Burn', { targets: [{ player: 1 }], pay: true });
    g.expect.pending('chooseCards', 0);
    const chosen = await answer(g);
    if (chosen.kind !== 'chooseCards') throw new Error('expected chooseCards');
    const names = chosen.objects.map((id) => g.object(id).card);
    expect(names).toHaveLength(1);
    expect(g.find({ name: 'Forest', zone: 'hand' }).map((o) => o.id)).toContain(chosen.objects[0]);
  });
});

describe('a spell whose additional cost is not worth it is not cast', () => {
  test('a sacrifice of a better permanent for a cheap spell: pass instead', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Sacrifice Draw')
      .battlefield('Swamp', 'Giant Spider')
      .landsPlayed(1)
      .seat(1)
      .build();
    // Giant Spider is worth more than a one-mana sorcery that draws two.
    g.expect.legal(0, { cast: 'SYNTHETIC Sacrifice Draw' });
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('a token or a surplus land is a good enough price', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Offering')
      .battlefield('Forest', { count: 6 })
      .landsPlayed(1)
      .seat(1)
      .build();
    // Six lands against a hand that needs four: one is surplus and worth less than the spell.
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id('SYNTHETIC Land Offering'),
    });
  });

  test('with only needed lands the land sacrifice is declined', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Offering', 'Giant Spider')
      .battlefield('Forest', { count: 3 })
      .landsPlayed(1)
      .seat(1)
      .build();
    const a = await answer(g);
    expect(a).not.toEqual({ kind: 'castSpell', object: g.id('SYNTHETIC Land Offering') });
  });

  test('a discard that costs a castable card for a one-mana spell is declined; a land to spare is not', async () => {
    const pricey = scenario()
      .seat(0)
      .hand('SYNTHETIC Discard Burn', 'Island')
      .battlefield('Mountain')
      .landsPlayed(1)
      .seat(1)
      .build();
    expect(await answer(pricey)).toEqual({ kind: 'pass' });
    const spare = scenario()
      .seat(0)
      .hand('SYNTHETIC Discard Burn', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .battlefield('Mountain')
      .landsPlayed(1)
      .seat(1)
      .build();
    expect(await answer(spare)).toEqual({
      kind: 'castSpell',
      object: spare.id('SYNTHETIC Discard Burn'),
    });
  });

  test('life is paid only while it stays above the safe line', async () => {
    const at = (life: number) =>
      scenario()
        .seat(0)
        .life(life)
        .hand('SYNTHETIC Blood Price')
        .battlefield('Swamp')
        .landsPlayed(1)
        .library('Plains', 'Plains')
        .seat(1)
        .build();
    expect(await answer(at(40))).toEqual({
      kind: 'castSpell',
      object: at(40).id('SYNTHETIC Blood Price'),
    });
    expect(await answer(at(12))).toEqual({ kind: 'pass' });
  });
});

describe('cost reductions it counts', () => {
  const cat = singleFaceFixture({
    name: 'SYNTHETIC Test Cat',
    manaCost: ['2', 'G'],
    types: ['creature'],
    colors: ['G'],
    power: 2,
    toughness: 2,
  });
  const sweep = sorcery('SYNTHETIC Test Sweep', ['2', 'U']);

  test('of two equally valuable spells the one that costs less now is cast first', async () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = scenario()
        .define(cat)
        .define(sweep)
        .seat(0)
        .hand(cat.name, sweep.name)
        .battlefield('SYNTHETIC Spell Chant')
        .battlefield('Island', 'Forest', 'Forest')
        .landsPlayed(1)
        .seat(1)
        .build();
      // With the Chant the sorcery costs {1}{U}: cheaper than the cat at the same mana value.
      expect(await answer(g, seed), `seed ${seed}`).toEqual({
        kind: 'castSpell',
        object: g.id(sweep.name),
      });
    }
  });

  test('a permanent that discounts what is in hand is cast before that spell', async () => {
    const colossus = singleFaceFixture({
      name: 'SYNTHETIC Test Colossus',
      manaCost: ['4'],
      types: ['artifact'],
    });
    for (const seed of [1, 2, 3]) {
      const g = scenario()
        .define(colossus)
        .seat(0)
        .hand(colossus.name, 'SYNTHETIC Tinker Bench')
        .battlefield('Forest', { count: 6 })
        .landsPlayed(1)
        .seat(1)
        .build();
      expect(await answer(g, seed), `seed ${seed}`).toEqual({
        kind: 'castSpell',
        object: g.id('SYNTHETIC Tinker Bench'),
      });
    }
  });

  test('the view shows the reduced cost the agent reads', () => {
    const g = scenario()
      .define(sweep)
      .seat(0)
      .hand(sweep.name)
      .battlefield('SYNTHETIC Spell Chant')
      .seat(1)
      .build();
    const card = g.view(0).seats[0]?.hand?.find((o) => o.name === sweep.name);
    expect(card?.castCost).toEqual(['1', 'U']);
  });
});

describe('the free cast', () => {
  test('a card it may cast without paying is cast that way, even with the mana to pay', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Free Exile')
      .battlefield('Grizzly Bears', { commander: true })
      .battlefield('Swamp', { count: 4 })
      .landsPlayed(1)
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id('SYNTHETIC Free Exile'),
      alternative: 'free',
    });
  });

  test('with no mana at all it is still cast, free', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Free Colossus')
      .battlefield('Grizzly Bears', { commander: true })
      .landsPlayed(1)
      .seat(1)
      .build();
    expect(await answer(g)).toEqual({
      kind: 'castSpell',
      object: g.id('SYNTHETIC Free Colossus'),
      alternative: 'free',
    });
  });

  test('without a commander there is no free option and nothing is cast for free', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Free Colossus')
      .battlefield('Grizzly Bears')
      .landsPlayed(1)
      .seat(1)
      .build();
    expect(await answer(g)).toEqual({ kind: 'pass' });
  });

  test('a free cast still pays the additional cost: the game goes on to the sacrifice', async () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Free Offering')
      .battlefield('Giant Spider', { commander: true })
      .battlefield('SYNTHETIC Doomed Scout')
      .landsPlayed(1)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    // The Scout is worth less than the spell: cast it free and give up the Scout.
    const cast = await answer(g);
    expect(cast).toMatchObject({ kind: 'castSpell', alternative: 'free' });
    g.choose(cast);
    await play(g);
    g.expect.zone('SYNTHETIC Doomed Scout', 'graveyard', { seat: 0 });
  });
});

describe('Ward—Discard a card. asked of the agent', () => {
  const guarded = (hand: string[]) =>
    scenario()
      .seat(0)
      .hand('Lightning Bolt', ...hand)
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .battlefield('SYNTHETIC Tithe Warded Guard')
      .build();

  async function asked(hand: string[], spell = 'Lightning Bolt'): Promise<Action> {
    const g = guarded(hand);
    g.act(0).cast(spell, { targets: ['SYNTHETIC Tithe Warded Guard'], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    return answer(g);
  }

  test('a hand of lands to spare: it pays', async () => {
    expect(await asked(['Forest', 'Forest', 'Forest', 'Forest', 'Forest'])).toEqual({
      kind: 'acceptOptional',
    });
  });

  test('a hand of spells it wants and a cheap spell to save: it declines', async () => {
    expect(await asked(['Grizzly Bears', 'Llanowar Elves'])).toEqual({ kind: 'declineOptional' });
  });
});
