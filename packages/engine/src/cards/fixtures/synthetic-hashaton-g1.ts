/**
 * SYNTHETIC CARDS FOR COMBAT DAMAGE TO "A PLAYER OR PLANESWALKER", "CYCLE OR DISCARD ANOTHER CARD" AND VERB LISTS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-1100 to D-1102 (group 1 of the Hashaton deck): a `dealsCombatDamage` trigger with `to: 'playerOrPlaneswalker'` (CR 120.2a,
 * 510.2: a player or a planeswalker, never a creature or a battle), a `discarded` trigger with `another` (CR 701.9a, 702.29a, 702.29d: cycling is
 * discarding, once for a cycled card; not the card with the ability), and the sequences of one subject's verbs that the grammar reads from a list with
 * bare commas (CR 608.2c: in the order written). Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not
 * Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

/** "Target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life. You draw a card and gain 3 life." */
const CRUEL_EFFECT: Effect = {
  kind: 'sequence',
  effects: [
    {
      kind: 'sacrifice',
      objects: {
        kind: 'choose',
        filter: { anyOf: [{ types: ['creature'] }, { types: ['planeswalker'] }] },
      },
      player: { kind: 'target', id: 't1' },
    },
    { kind: 'discard', player: { kind: 'target', id: 't1' }, count: 1 },
    { kind: 'loseLife', player: { kind: 'target', id: 't1' }, amount: 3 },
    { kind: 'draw', player: YOU, count: 1 },
    { kind: 'gainLife', player: YOU, amount: 3 },
  ],
};

const OPPONENT_TARGET = [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }] as const;

const cruelTrigger = (trigger: Extract<Ability, { kind: 'triggered' }>['trigger']): Ability => ({
  kind: 'triggered',
  trigger,
  targets: OPPONENT_TARGET,
  effect: CRUEL_EFFECT,
});

export const SYNTHETIC_HASHATON_G1_LIST: readonly CardDefinition[] = [
  // "Whenever this creature deals combat damage to a player or planeswalker, draw a card. Discard a card: Put a +1/+1 counter on this creature."
  singleFace({
    name: 'SYNTHETIC Bog Frog',
    manaCost: ['U', 'B'],
    types: ['creature'],
    subtypes: ['Frog'],
    colors: ['U', 'B'],
    colorIdentity: ['U', 'B'],
    power: 1,
    toughness: 2,
    oracleText:
      'Whenever this creature deals combat damage to a player or planeswalker, draw a card. Discard a card: Put a +1/+1 counter on this creature.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'dealsCombatDamage',
          what: { kind: 'this' },
          to: 'playerOrPlaneswalker',
        },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
      {
        kind: 'activated',
        cost: [{ kind: 'discard', count: 1 }],
        effect: { kind: 'addCounters', objects: { kind: 'this' }, counter: '+1/+1', count: 1 },
      },
    ],
  }),
  // "Whenever a creature you control deals combat damage to a player or planeswalker, you gain 1 life." (any creature of the controller's)
  singleFace({
    name: 'SYNTHETIC Walker Hit Watcher',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Whenever a creature you control deals combat damage to a player or planeswalker, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'dealsCombatDamage',
          what: { types: ['creature'], controller: 'you' },
          to: 'playerOrPlaneswalker',
        },
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ],
  }),
  // "Flying. Whenever you cycle or discard another card, put a -1/-1 counter on each creature your opponents control. Cycling {2}"
  singleFace({
    name: 'SYNTHETIC Cycle Fiend',
    manaCost: ['3', 'B', 'B'],
    types: ['creature'],
    subtypes: ['Demon'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 5,
    toughness: 4,
    oracleText:
      'Flying. Whenever you cycle or discard another card, put a -1/-1 counter on each creature your opponents control. Cycling {2}',
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you', another: true },
        effect: {
          kind: 'addCounters',
          objects: {
            kind: 'each',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
          },
          counter: '-1/-1',
          count: 1,
        },
      },
      { kind: 'keyword', keyword: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ],
  }),
  // "Whenever you discard a card, you gain 1 life." with no "another": the same trigger as a watcher on the battlefield, to show `another` is what leaves a card out.
  singleFace({
    name: 'SYNTHETIC Discard Tithe',
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'Whenever you discard a card, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you' },
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ],
  }),
  // "Whenever you discard a card, if this card is in your graveyard, you gain 1 life." (works from the graveyard, so it sees the discard of itself)
  singleFace({
    name: 'SYNTHETIC Grave Tither',
    manaCost: ['B'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: 'Whenever you discard a card, if this card is in your graveyard, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you' },
        interveningIf: { kind: 'thisInYourGraveyard' },
        functionsIn: 'graveyard',
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ],
  }),
  // "Whenever you discard another card, if this card is in your graveyard, you gain 1 life." (the same, but not for the discard of itself)
  singleFace({
    name: 'SYNTHETIC Grave Other Tither',
    manaCost: ['B'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText:
      'Whenever you discard another card, if this card is in your graveyard, you gain 1 life.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you', another: true },
        interveningIf: { kind: 'thisInYourGraveyard' },
        functionsIn: 'graveyard',
        effect: { kind: 'gainLife', player: YOU, amount: 1 },
      },
    ],
  }),
  // "Flying. Whenever this creature enters or attacks, target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3
  // life. You draw a card and gain 3 life."
  singleFace({
    name: 'SYNTHETIC Cruel Archon',
    manaCost: ['6', 'B', 'B'],
    types: ['creature'],
    subtypes: ['Archon'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 6,
    toughness: 6,
    oracleText:
      'Flying. Whenever this creature enters or attacks, target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life. You draw a card and gain 3 life.',
    abilities: [
      kw('flying'),
      cruelTrigger({ kind: 'entersBattlefield', what: { kind: 'this' } }),
      cruelTrigger({ kind: 'attacks', what: { kind: 'this' } }),
    ],
  }),
  // "You gain 2 life, draw two cards, then discard two cards. Flashback {1}{W}{U}"
  singleFace({
    name: 'SYNTHETIC Mending Rite',
    manaCost: ['W', 'U'],
    types: ['instant'],
    colors: ['W', 'U'],
    colorIdentity: ['W', 'U'],
    oracleText: 'You gain 2 life, draw two cards, then discard two cards. Flashback {1}{W}{U}',
    abilities: [
      {
        kind: 'keyword',
        keyword: { kind: 'flashback', cost: [{ kind: 'mana', symbols: ['1', 'W', 'U'] }] },
      },
    ],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'gainLife', player: YOU, amount: 2 },
          { kind: 'draw', player: YOU, count: 2 },
          { kind: 'discard', player: YOU, count: 2 },
        ],
      },
    },
  }),
];
