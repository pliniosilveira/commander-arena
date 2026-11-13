/**
 * SYNTHETIC CARDS FOR GROUP 8 OF THE HASHATON DECK (issue 31, provisional D-1140 to D-1143). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of two primitives: "Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped" (a `conditional` on `thisWayAtLeast`
 * `sacrificed`, after a sacrifice that is not optional; Victimize) and the loot with a conditional drain plus the cast permission with a rider (`thisWay`
 * `discardedInstantOrSorcery`, `mayCast` `exileInstead`; Vohar, Vodalian Desecrator). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const EACH_OPPONENT = { kind: 'eachOpponent' } as const;

/** "Choose two target creature cards in your graveyard": two targets of one slot, in your graveyard. */
const TWO_CREATURE_CARDS: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'], controller: 'you' } },
  min: 2,
  max: 2,
};

/** "target instant or sorcery card from your graveyard". */
const YOUR_SPELL_CARD: TargetSpec = {
  id: 't1',
  what: {
    kind: 'object',
    filter: {
      zone: 'graveyard',
      controller: 'you',
      anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
    },
  },
};

/** "Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped." with `then` as the first instruction (a sorcery). */
const exchange = (name: string, text: string, effect: Effect): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: text,
    spell: { targets: [TWO_CREATURE_CARDS], effect },
  });

const SACRIFICE_A_CREATURE: Effect = {
  kind: 'sacrifice',
  objects: { kind: 'choose', filter: { zone: 'battlefield', types: ['creature'] } },
};

const RETURN_CHOSEN_TAPPED: Effect = {
  kind: 'moveToZone',
  objects: { kind: 'target', id: 't1' },
  to: 'battlefield',
  tapped: true,
};

/** "{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card this way, each opponent loses 1 life and you gain 1 life." */
const looter = (): Ability => ({
  kind: 'activated',
  cost: [{ kind: 'tap' }],
  effect: {
    kind: 'sequence',
    effects: [
      { kind: 'draw', player: YOU, count: 1 },
      { kind: 'discard', player: YOU, count: 1 },
      {
        kind: 'conditional',
        condition: { kind: 'thisWayAtLeast', what: 'discardedInstantOrSorcery', count: 1 },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: EACH_OPPONENT, amount: 1 },
            { kind: 'gainLife', player: YOU, amount: 1 },
          ],
        },
      },
    ],
  },
});

/** "{2}, Sacrifice this creature: You may cast target instant or sorcery card from your graveyard this turn[. If that spell would be put into your graveyard, exile it instead]. Activate only as a sorcery." */
const caster = (exileInstead: boolean): Ability => ({
  kind: 'activated',
  cost: [
    { kind: 'mana', symbols: ['2'] },
    { kind: 'sacrifice', what: { kind: 'this' } },
  ],
  targets: [YOUR_SPELL_CARD],
  timing: 'sorcery',
  effect: {
    kind: 'mayCast',
    objects: { kind: 'target', id: 't1' },
    duration: 'untilEndOfTurn',
    ...(exileInstead ? { exileInstead: true as const } : {}),
  },
});

const wizard = (name: string, text: string, abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['U', 'B'],
    supertypes: [],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U', 'B'],
    colorIdentity: ['U', 'B'],
    power: 1,
    toughness: 2,
    oracleText: text,
    abilities,
  });

const LOOT_TEXT =
  '{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card this way, each opponent loses 1 life and you gain 1 life.';

export const SYNTHETIC_HASHATON_G8_LIST: readonly CardDefinition[] = [
  // The shape of Victimize: the sacrifice is not optional, "if you do" is whether a creature was sacrificed.
  exchange(
    'SYNTHETIC Grim Exchange',
    'Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.',
    {
      kind: 'sequence',
      effects: [
        SACRIFICE_A_CREATURE,
        {
          kind: 'conditional',
          condition: { kind: 'thisWayAtLeast', what: 'sacrificed', count: 1 },
          effect: RETURN_CHOSEN_TAPPED,
        },
      ],
    },
  ),
  // The loot with the conditional drain.
  wizard('SYNTHETIC Spell Looter', LOOT_TEXT, [looter()]),
  // The two halves of Vohar, apart, so each is pinned alone.
  wizard(
    'SYNTHETIC Spell Reaver',
    '{2}, Sacrifice this creature: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead. Activate only as a sorcery.',
    [caster(true)],
  ),
  wizard(
    'SYNTHETIC Spell Borrower',
    '{2}, Sacrifice this creature: You may cast target instant or sorcery card from your graveyard this turn. Activate only as a sorcery.',
    [caster(false)],
  ),
  // Both abilities on one creature, the shape of the real card.
  wizard(
    'SYNTHETIC Spell Desecrator',
    `${LOOT_TEXT}\n{2}, Sacrifice this creature: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead. Activate only as a sorcery.`,
    [looter(), caster(true)],
  ),
];
