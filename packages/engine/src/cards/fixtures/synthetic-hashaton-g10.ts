/**
 * SYNTHETIC CARDS FOR GROUP 10 OF THE HASHATON DECK (issue 31, D-1190 to D-1193, provisional). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "As an additional cost to cast this spell, discard X cards. Return X target creature cards from your graveyard to your hand." (the cost
 * `discardX`, X announced before the targets, and the target slot `countX`, as many targets as X) and of its neighbours: the same cost with an {X} in the mana cost, and
 * the same spell with Flashback. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card.
 */
import type { Ability, Effect, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const X = { kind: 'x' } as const;
const T1 = { kind: 'target', id: 't1' } as const;

/** "X target creature cards from your graveyard": as many targets as the X announced. */
const X_CREATURE_CARDS: TargetSpec = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'], controller: 'you' } },
  countX: true,
};

const RETURN_TO_HAND: Effect = { kind: 'moveToZone', objects: T1, to: 'hand' };

const TEXT =
  'As an additional cost to cast this spell, discard X cards. Return X target creature cards from your graveyard to your hand.';

const FLASHBACK: Ability = {
  kind: 'keyword',
  keyword: { kind: 'flashback', cost: [{ kind: 'mana', symbols: ['2', 'B'] }] },
};

export const SYNTHETIC_HASHATON_G10_LIST: readonly CardDefinition[] = [
  // The shape of Restless Dreams.
  singleFace({
    name: 'SYNTHETIC Dream Recall',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: TEXT,
    additionalCosts: [{ kind: 'discardX' }],
    spell: { x: true, targets: [X_CREATURE_CARDS], effect: RETURN_TO_HAND },
  }),
  // The same with Flashback: the additional cost is paid for the flashback cast as well (CR 702.34a), the discard from the hand.
  singleFace({
    name: 'SYNTHETIC Dream Replay',
    manaCost: ['B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: `${TEXT} Flashback {2}{B}.`,
    additionalCosts: [{ kind: 'discardX' }],
    abilities: [FLASHBACK],
    spell: { x: true, targets: [X_CREATURE_CARDS], effect: RETURN_TO_HAND },
  }),
  // An {X} in the mana cost as well: each point of X is a card and a generic mana.
  singleFace({
    name: 'SYNTHETIC Dream Burn',
    manaCost: ['X', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'As an additional cost to cast this spell, discard X cards. Deals X damage to any target.',
    additionalCosts: [{ kind: 'discardX' }],
    spell: {
      x: true,
      targets: [{ id: 't1', what: { kind: 'anyTarget' } }],
      effect: { kind: 'dealDamage', amount: X, to: T1 },
    },
  }),
  // "discard X cards" and X read by the effect, with no target: "Draw X cards" for the cards discarded (a rummage of the player's choosing).
  singleFace({
    name: 'SYNTHETIC Dream Rummage',
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'As an additional cost to cast this spell, discard X cards. Draw X cards.',
    additionalCosts: [{ kind: 'discardX' }],
    spell: { x: true, effect: { kind: 'draw', player: { kind: 'you' }, count: X } },
  }),
  // "Whenever you discard a card, you gain 1 life." (a cost's discard triggers it: CR 701.9a, 603.2)
  singleFace({
    name: 'SYNTHETIC Dream Mourner',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: 'Whenever you discard a card, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you' },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  }),
];
