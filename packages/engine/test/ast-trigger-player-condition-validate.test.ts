// Validation of the conditions `triggerPlayerIsOpponent` and `triggerPlayerStat` (Federation Fleet deck, group B, Fevered Visions: "If the player is your opponent and has four or more
// cards in hand, this enchantment deals 2 damage to that player"): the player the event of a trigger is about, read as an instruction of a `conditional` effect comes up (CR 603.2b,
// 608.2c, 402.1, 102.2). A node the engine reads in one place only is refused elsewhere with a message, never accepted and half run. The cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type Condition, validateCard } from '../src/index';

const OPPONENT_WITH_HAND: Condition = {
  kind: 'and',
  terms: [
    { kind: 'triggerPlayerIsOpponent' },
    { kind: 'triggerPlayerStat', stat: 'cardsInHand', compare: { cmp: 'atLeast', value: 4 } },
  ],
};

/** An enchantment with the ability, and nothing else. */
function enchantment(ability: Ability) {
  return singleFace({
    name: 'SYNTHETIC Visions Probe',
    manaCost: ['1', 'U', 'R'],
    types: ['enchantment'],
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    oracleText: 'SYNTHETIC: a conditional effect about the player of the trigger.',
    abilities: [ability],
  });
}

const messages = (ability: Ability) => validateCard(enchantment(ability)).map((i) => i.message);

/** "At the beginning of each player's end step, that player draws a card. If <condition>, ~ deals 2 damage to that player." */
const withCondition = (condition: Condition, trigger: unknown) =>
  ({
    kind: 'triggered',
    trigger,
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
        {
          kind: 'conditional',
          condition,
          effect: { kind: 'dealDamage', amount: 2, to: { kind: 'triggerPlayer' } },
        },
      ],
    },
  }) as Ability;

const END_STEP = { kind: 'endStep', whose: 'each' };

describe('in a conditional effect of a trigger about a player', () => {
  test('the pair of Fevered Visions is valid', () => {
    expect(messages(withCondition(OPPONENT_WITH_HAND, END_STEP))).toEqual([]);
  });

  test('every comparison and every stat is valid', () => {
    for (const cmp of ['atLeast', 'atMost', 'equal'] as const) {
      for (const stat of ['life', 'cardsInHand', 'creatures', 'lands'] as const) {
        expect(
          messages(
            withCondition(
              { kind: 'triggerPlayerStat', stat, compare: { cmp, value: 3 } },
              END_STEP,
            ),
          ),
        ).toEqual([]);
      }
    }
  });

  test('an unknown stat, an unknown comparison or a fractional number is refused', () => {
    const stat = (s: unknown, cmp: unknown, value: unknown) =>
      messages(
        withCondition(
          { kind: 'triggerPlayerStat', stat: s, compare: { cmp, value } } as never,
          END_STEP,
        ),
      ).join();
    expect(stat('mana', 'atLeast', 4)).toContain('unknown stat');
    expect(stat('cardsInHand', 'over', 4)).toContain('unknown comparison');
    expect(stat('cardsInHand', 'atLeast', 4.5)).toContain('whole number');
  });
});

describe('where the player of the event is not named', () => {
  test('a trigger whose event is about no player (an enters trigger) refuses both conditions', () => {
    const enters = { kind: 'entersBattlefield', what: { kind: 'this' } };
    expect(messages(withCondition({ kind: 'triggerPlayerIsOpponent' }, enters)).join()).toContain(
      'needs a triggered ability whose event is about a player',
    );
    expect(
      messages(
        withCondition(
          { kind: 'triggerPlayerStat', stat: 'life', compare: { cmp: 'atMost', value: 5 } },
          enters,
        ),
      ).join(),
    ).toContain('needs a triggered ability whose event is about a player');
  });

  test('an intervening "if" of triggerPlayerIsOpponent is refused: the player is read as the instruction comes up', () => {
    const ability = {
      kind: 'triggered',
      trigger: END_STEP,
      interveningIf: { kind: 'triggerPlayerIsOpponent' },
      effect: { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
    } as unknown as Ability;
    expect(messages(ability).join()).toContain('only valid in a conditional effect');
  });
});

describe('triggerPlayerStat as the intervening "if" (Ghirapur Orrery, CR 603.4)', () => {
  const NO_CARDS = {
    kind: 'triggerPlayerStat',
    stat: 'cardsInHand',
    compare: { cmp: 'atMost', value: 0 },
  } as const;
  const ability = (trigger: unknown, interveningIf: Condition) =>
    ({
      kind: 'triggered',
      trigger,
      interveningIf,
      effect: { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 3 },
    }) as unknown as Ability;

  test('of a trigger about a player (each upkeep) it is valid, alone or inside not/and', () => {
    const upkeep = { kind: 'upkeep', whose: 'each' };
    expect(messages(ability(upkeep, NO_CARDS))).toEqual([]);
    expect(messages(ability(upkeep, { kind: 'not', term: NO_CARDS }))).toEqual([]);
    expect(messages(ability(END_STEP, { kind: 'and', terms: [NO_CARDS] }))).toEqual([]);
  });

  test('its stat and comparison are still checked', () => {
    const bad = { ...NO_CARDS, compare: { cmp: 'over', value: 0 } } as unknown as Condition;
    expect(messages(ability(END_STEP, bad)).join()).toContain('unknown comparison');
  });

  test('of a trigger about no player (an enters trigger) it is refused', () => {
    const enters = { kind: 'entersBattlefield', what: { kind: 'this' } };
    expect(messages(ability(enters, NO_CARDS)).join()).toContain(
      'triggerPlayerStat reads the player the event of a trigger is about',
    );
  });
});
