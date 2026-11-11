// CasualAgent and the casting and targets slice (D-181), on real engine states built with the scenario DSL: the choice between two additional costs
// (mana is the cheapest way, a permanent the dearest), whether a spell with such a choice is worth casting, and the new target of a spell or ability
// whose target a resolving effect changes (a harmful one goes to the opponent's side, a helpful one to the agent's own). Cards are SYNTHETIC.
import { type CardDefinition, type Cost, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { CasualAgent } from '../src/index';
import { answer, answerFor, expectLegal } from './casual-helpers';

const STIR = 'SYNTHETIC Stir Trouble'; // {B}: sacrifice an artifact or creature or pay {4}, destroy target creature
const BENT = 'SYNTHETIC Bent Bolt'; // {3}{R}, {3} less with a creature with power 4: change the target of a spell or ability with a single target
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';

// SYNTHETIC test card, defined here (the fixtures module is not part of the engine API).
const DISCARD: readonly Cost[] = [{ kind: 'discard', count: 1 }];
const SACRIFICE: readonly Cost[] = [{ kind: 'sacrifice', what: { types: ['creature'] } }];
const weighingCard = (first: 'discard' | 'sacrifice'): CardDefinition => ({
  oracleId: null,
  name: 'SYNTHETIC Weighing Draw',
  layout: 'normal',
  faces: [
    {
      name: 'SYNTHETIC Weighing Draw',
      manaCost: ['B'],
      supertypes: [],
      types: ['sorcery'],
      subtypes: [],
      colors: ['B'],
      power: null,
      toughness: null,
      loyalty: null,
      defense: null,
      oracleText:
        'As an additional cost to cast this spell, discard a card or sacrifice a creature.',
      abilities: [],
      spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
      additionalCostChoice: first === 'discard' ? [DISCARD, SACRIFICE] : [SACRIFICE, DISCARD],
    },
  ],
  colorIdentity: ['B'],
  support: 'supported',
});

describe('the choice of an additional cost: "sacrifice an artifact or creature or pay {4}"', () => {
  const asked = (lands: number) =>
    scenario()
      .seat(0)
      .hand(STIR)
      .battlefield('Swamp', { count: lands })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(SPIDER)
      .build();

  test('with the mana for both, the agent pays the mana and keeps its creature', async () => {
    const g = asked(5);
    g.act(0).cast(STIR);
    expect(g.state.pending?.kind).toBe('confirmOptional');
    const a = await answer(g);
    expect(a).toEqual({ kind: 'declineOptional' });
    expectLegal(g, a);
  });

  test("the whole cast with the agent's answers ends with the creature still there", async () => {
    const g = asked(5);
    g.act(0).cast(STIR);
    g.act(0).decline();
    g.act(0).chooseTargets(SPIDER);
    g.act(0).payAuto();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('the agent casts the spell only when one way is worth paying', async () => {
    // One land and a creature: the sacrifice is the only way, and a Grizzly Bears is worth more than a {B} spell: not cast.
    const cheap = scenario()
      .seat(0)
      .hand(STIR)
      .battlefield('Swamp')
      .battlefield(ANGEL)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    const offered = getLegalActions(cheap.state, 0).some((a) => a.kind === 'castSpell');
    expect(offered).toBe(true);
    const chosen = await answerFor(cheap, new CasualAgent({ seed: 1 }));
    expect(chosen.kind).not.toBe('castSpell');
    // With the mana for the other way the spell is worth casting.
    const rich = asked(5);
    const again = await answerFor(rich, new CasualAgent({ seed: 1 }));
    expect(again).toMatchObject({ kind: 'castSpell', object: rich.id(STIR) });
  });

  test('a card from the hand is cheaper than a permanent, whichever way the card lists them', async () => {
    const weighing = (first: 'discard' | 'sacrifice') => weighingCard(first);
    for (const [first, expected] of [
      ['discard', { kind: 'acceptOptional' }],
      ['sacrifice', { kind: 'declineOptional' }],
    ] as const) {
      const card = weighing(first);
      const g = scenario()
        .seat(0)
        .define(card)
        .hand(card.name, 'Forest')
        .battlefield('Swamp')
        .battlefield(BEARS)
        .seat(1)
        .build();
      g.act(0).cast(card.name);
      expect(await answer(g), first).toEqual(expected);
    }
  });
});

describe('the new target when a change of target resolves (CR 115.7a)', () => {
  test("a harmful spell goes to a thing of the opponent's", async () => {
    const g = scenario()
      .seat(0)
      .hand(BENT, BOLT)
      .battlefield('Mountain', { count: 6 })
      .battlefield(BEARS)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.pass();
    g.pass();
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected the question');
    expect(d.forChange).toBe(true);
    const a = await answer(g);
    expectLegal(g, a);
    // The only thing of the opponent's that is left is the Giant Spider: the opponent's player is the current target.
    expect(a).toEqual({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id(SPIDER), specId: 't1' }],
    });
  });

  const answerOf = (g: ScenarioGame) => answer(g);
  test('every answer the agent gives is legal', async () => {
    const g = scenario()
      .seat(0)
      .hand(BENT, BOLT)
      .battlefield('Mountain', { count: 6 })
      .battlefield(BEARS, ANGEL)
      .seat(1)
      .battlefield(SPIDER)
      .build();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.pass();
    g.pass();
    expectLegal(g, await answerOf(g));
  });
});
