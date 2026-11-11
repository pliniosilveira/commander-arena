// CasualAgent and the sacrifice-for-value abilities of Food and Clue tokens (CR 111.10b, 111.10f):
// the heuristics of src/casual-tokens.ts, run against real engine states built with the scenario
// DSL (SYNTHETIC cards). Pins: life below EAT_BELOW_LIFE eats Food, a hand under CRACK_BELOW_CARDS
// cracks a Clue, only with spare mana (after spells, in the second main phase or an end step),
// by the shape of the ability and not the card name.
import type { Action, ActivatedAbility, CardDefinition } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  CRACK_BELOW_CARDS,
  drawsForSacrifice,
  EAT_BELOW_LIFE,
  gainsLifeForSacrifice,
} from '../src/casual-tokens';
import { CasualAgent } from '../src/index';
import { answerFor } from './casual-helpers';

const FOOD_MAKER = 'SYNTHETIC Food Maker';
const CLUE_MAKER = 'SYNTHETIC Clue Maker';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const activatesToken = (a: Action, g: ScenarioGame, name: string): boolean =>
  a.kind === 'activate' && a.object === g.id(name);

/**
 * Seat 0 in its second main phase with two untapped lands and a freshly made token (the sorcery
 * is paid from the pool, so the lands are spare), at the given life and with `hand` other cards.
 */
function withToken(token: 'Food' | 'Clue', life: number, hand: readonly string[] = []) {
  const maker = token === 'Food' ? FOOD_MAKER : CLUE_MAKER;
  const g = scenario()
    .seat(0)
    .life(life)
    .hand(maker, ...hand)
    .battlefield('Forest', 'Forest')
    .landsPlayed(1)
    .pool(token === 'Food' ? 'CG' : 'CU')
    .library(...FILLER)
    .seat(1)
    .at('postcombatMain')
    .build();
  g.act(0).cast(maker, { pay: true });
  g.passAll();
  return g;
}

describe('Food is eaten when life is low (CR 111.10b)', () => {
  test(`below ${EAT_BELOW_LIFE} life the Food is eaten`, async () => {
    const g = withToken('Food', EAT_BELOW_LIFE - 1);
    expect(activatesToken(await answerFor(g), g, 'Food')).toBe(true);
  });

  test(`at ${EAT_BELOW_LIFE} life or more it is kept`, async () => {
    expect(await answerFor(withToken('Food', EAT_BELOW_LIFE))).toEqual({ kind: 'pass' });
    expect(await answerFor(withToken('Food', 40))).toEqual({ kind: 'pass' });
  });

  test('it is not eaten before combat: the mana may still be needed', async () => {
    const g = scenario()
      .seat(0)
      .life(5)
      .hand(FOOD_MAKER)
      .battlefield('Forest', 'Forest')
      .pool('CG')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast(FOOD_MAKER, { pay: true });
    g.passAll();
    expect(g.state.turn.step).toBe('precombatMain');
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
  });

  test('it is eaten in an end step too, the opponent turn included', async () => {
    const g = withToken('Food', 6);
    g.advanceTo('end');
    expect(g.state.turn.step).toBe('end');
    expect(activatesToken(await answerFor(g), g, 'Food')).toBe(true);
  });

  test('without two spare mana the engine does not offer it and the agent passes', async () => {
    const g = scenario()
      .seat(0)
      .life(5)
      .hand(FOOD_MAKER)
      .battlefield('Forest')
      .pool('CG')
      .seat(1)
      .at('postcombatMain')
      .build();
    g.act(0).cast(FOOD_MAKER, { pay: true });
    g.passAll();
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
  });
});

describe('a Clue is cracked with spare mana and an empty-ish hand (CR 111.10f)', () => {
  test(`with fewer than ${CRACK_BELOW_CARDS} cards in hand`, async () => {
    const g = withToken('Clue', 40);
    expect(activatesToken(await answerFor(g), g, 'Clue')).toBe(true);
    const two = withToken('Clue', 40, ['Plains', 'Plains']);
    expect(activatesToken(await answerFor(two), two, 'Clue')).toBe(true);
  });

  test(`with ${CRACK_BELOW_CARDS} or more it is kept`, async () => {
    const g = withToken('Clue', 40, ['Plains', 'Plains', 'Plains']);
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
  });

  test('a spell in hand is cast first, so the mana is not spare', async () => {
    const g = scenario()
      .seat(0)
      .hand(CLUE_MAKER, 'Grizzly Bears')
      .battlefield('Forest', 'Forest')
      .pool('CU')
      .library(...FILLER)
      .seat(1)
      .at('postcombatMain')
      .build();
    g.act(0).cast(CLUE_MAKER, { pay: true });
    g.passAll();
    expect(await answerFor(g)).toEqual({ kind: 'castSpell', object: g.id('Grizzly Bears') });
  });

  test('the loop guard: once cracked in a window the agent does not ask again for the same object', async () => {
    const agent = new CasualAgent({ seed: 1 });
    const g = withToken('Clue', 40);
    const first = await answerFor(g, agent);
    expect(activatesToken(first, g, 'Clue')).toBe(true);
    // The same window, the same object: the guard remembers (a rejected activation cannot loop).
    expect(await answerFor(g, agent)).toEqual({ kind: 'pass' });
  });
});

describe('a creature that sacrifices itself is not a Food', () => {
  test('the agent leaves it alone at low life, even though the shape matches', async () => {
    const card: CardDefinition = {
      oracleId: null,
      name: 'SYNTHETIC Self Feeder',
      layout: 'normal',
      colorIdentity: [],
      support: 'supported',
      faces: [
        {
          name: 'SYNTHETIC Self Feeder',
          manaCost: ['1'],
          supertypes: [],
          types: ['creature'],
          subtypes: ['Construct'],
          colors: [],
          power: 1,
          toughness: 1,
          loyalty: null,
          defense: null,
          oracleText: '{2}, Sacrifice this creature: You gain 3 life.',
          abilities: [
            {
              kind: 'activated',
              cost: [
                { kind: 'mana', symbols: ['2'] },
                { kind: 'sacrifice', what: { kind: 'this' } },
              ],
              effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
            },
          ],
          spell: null,
        },
      ],
    };
    const g = scenario()
      .define(card)
      .seat(0)
      .life(5)
      .battlefield(card.name, 'Forest', 'Forest')
      .landsPlayed(1)
      .library(...FILLER)
      .seat(1)
      .at('postcombatMain')
      .build();
    expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(true);
    expect(await answerFor(g)).toEqual({ kind: 'pass' });
  });
});

describe('the heuristics read the ability, not the card name', () => {
  const sacrifice = { kind: 'sacrifice', what: { kind: 'this' } } as const;
  const mana2 = { kind: 'mana', symbols: ['2'] } as const;
  const ability = (over: object): ActivatedAbility =>
    ({
      kind: 'activated',
      cost: [mana2, sacrifice],
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
      ...over,
    }) as ActivatedAbility;

  test('life: "gain N life" for mana, {T} and a sacrifice of itself', () => {
    expect(gainsLifeForSacrifice(ability({}))).toBe(true);
    expect(gainsLifeForSacrifice(ability({ cost: [mana2, { kind: 'tap' }, sacrifice] }))).toBe(
      true,
    );
  });

  test('life: not without the sacrifice of itself, with another cost, a target or another effect', () => {
    expect(gainsLifeForSacrifice(ability({ cost: [mana2] }))).toBe(false);
    expect(
      gainsLifeForSacrifice(ability({ cost: [mana2, { kind: 'payLife', amount: 1 }, sacrifice] })),
    ).toBe(false);
    expect(
      gainsLifeForSacrifice(
        ability({ cost: [mana2, { kind: 'sacrifice', what: { types: ['creature'] } }] }),
      ),
    ).toBe(false);
    expect(
      gainsLifeForSacrifice(ability({ targets: [{ id: 't1', what: { kind: 'anyTarget' } }] })),
    ).toBe(false);
    expect(
      gainsLifeForSacrifice(
        ability({ effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } }),
      ),
    ).toBe(false);
    expect(
      gainsLifeForSacrifice(
        ability({ effect: { kind: 'loseLife', player: { kind: 'you' }, amount: 3 } }),
      ),
    ).toBe(false);
    expect(
      gainsLifeForSacrifice(
        ability({ effect: { kind: 'gainLife', player: { kind: 'eachOpponent' }, amount: 3 } }),
      ),
    ).toBe(false);
  });

  test('cards: "draw N cards" for the same costs', () => {
    const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;
    expect(drawsForSacrifice(ability({ effect: draw }))).toBe(true);
    expect(
      drawsForSacrifice(
        ability({ effect: draw, cost: [mana2, { kind: 'discard', count: 1 }, sacrifice] }),
      ),
    ).toBe(false);
    expect(drawsForSacrifice(ability({ effect: draw, cost: [sacrifice] }))).toBe(true);
    expect(drawsForSacrifice(ability({}))).toBe(false);
  });
});
