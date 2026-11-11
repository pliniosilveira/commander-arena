/**
 * SYNTHETIC CARDS FOR "WHENEVER YOUR COMMANDER ENTERS OR ATTACKS" AND "WHENEVER A COMMANDER YOU CONTROL ENTERS OR ATTACKS". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-149 (the Angels slice): an artifact that enters with a page counter, gets one when its controller's commander
 * enters or attacks and spends one to draw a card (the commander is one the player owns: `commander: 'yours'`), and a creature that makes
 * the same counter for any commander its controller controls (`commander: true` with `controller: 'you'`), and an enters or attacks
 * trigger of each kind, written as two triggered abilities as the text "enters or attacks" is. Names start with "SYNTHETIC "; oracleId is
 * null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Trigger } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const YOU = { kind: 'you' } as const;

/** One ability for the entering of the commanders the filter names and one for their attacking. */
const entersOrAttacks = (
  filter: { readonly commander: true | 'yours'; readonly controller?: 'you' },
  effect: Extract<Ability, { kind: 'triggered' }>['effect'],
): Ability[] => {
  const what = filter;
  const enters: Trigger = { kind: 'entersBattlefield', what };
  const attacks: Trigger = { kind: 'attacks', what };
  return [
    { kind: 'triggered', trigger: enters, effect },
    { kind: 'triggered', trigger: attacks, effect },
  ];
};

export const SYNTHETIC_COMMANDER_TRIGGER_LIST: readonly CardDefinition[] = [
  // "This artifact enters with a page counter on it. Whenever your commander enters or attacks, put a page counter on this artifact.
  //  {1}, {T}, Remove a page counter from this artifact: Draw a card."
  singleFace({
    name: 'SYNTHETIC Chronicle Book',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Book'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'This artifact enters with a page counter on it. Whenever your commander enters or attacks, put a page counter on this artifact. {1}, {T}, Remove a page counter from this artifact: Draw a card.',
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'entersWithCounters', counter: 'page', count: 1 },
      },
      ...entersOrAttacks(
        { commander: 'yours' },
        { kind: 'addCounters', objects: THIS, counter: 'page', count: 1 },
      ),
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1'] },
          { kind: 'tap' },
          { kind: 'removeCounters', counter: 'page', count: 1 },
        ],
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "Whenever a commander you control enters or attacks, you gain 1 life." (the commander is any commander its controller controls)
  singleFace({
    name: 'SYNTHETIC Command Admirer',
    manaCost: ['3', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText: 'Whenever a commander you control enters or attacks, you gain 1 life.',
    abilities: entersOrAttacks(
      { commander: true, controller: 'you' },
      { kind: 'gainLife', player: YOU, amount: 1 },
    ),
  }),
  // "Flying, first strike. Whenever a commander you control enters or attacks, proliferate."
  singleFace({
    name: 'SYNTHETIC Choirmaster',
    manaCost: ['3', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Phyrexian', 'Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 5,
    toughness: 4,
    oracleText:
      'Flying, first strike. Whenever a commander you control enters or attacks, proliferate.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'flying' } },
      { kind: 'keyword', keyword: { kind: 'firstStrike' } },
      ...entersOrAttacks({ commander: true, controller: 'you' }, { kind: 'proliferate' }),
    ],
  }),
  // "Proliferate." (the keyword action as a spell)
  singleFace({
    name: 'SYNTHETIC Spreading Growth',
    manaCost: ['G'],
    types: ['sorcery'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText: 'Proliferate.',
    spell: { effect: { kind: 'proliferate' } },
  }),
];
