/**
 * SYNTHETIC CARDS FOR GROUP 1b OF THE DANITHA DECK (issue 26, D-400 to D-404 provisional). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to
 * these same nodes): an instant that chooses a card of the graveyard and puts it onto the battlefield or into the hand (`conditional`, `may`, `didPrevious`, an Aura card
 * entering and asking what it enchants), a creature that lets its controller cast an Aura or Equipment spell from the graveyard once each turn, an Aura that gives protection from
 * a card type, and an enchantment that triggers on an entering creature and on a cast that targets a creature of its controller. Names start with "SYNTHETIC "; oracleId is
 * null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, SpellText } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const T1 = { kind: 'target', id: 't1' } as const;

/** The put onto the battlefield and the put into the hand of "Choose target permanent card in your graveyard. If it has mana value 3 or less, you may put it onto the battlefield. If you don't put it onto the battlefield, put it into your hand." */
const TO_HAND = { kind: 'moveToZone', objects: T1, to: 'hand' } as const;
const REBIRTH_SPELL: SpellText = {
  targets: [
    {
      id: 't1',
      what: {
        kind: 'object',
        filter: {
          zone: 'graveyard',
          controller: 'you',
          anyOf: [
            { types: ['artifact'] },
            { types: ['creature'] },
            { types: ['enchantment'] },
            { types: ['land'] },
            { types: ['planeswalker'] },
            { types: ['battle'] },
          ],
        },
      },
    },
  ],
  effect: {
    kind: 'sequence',
    effects: [
      {
        kind: 'conditional',
        condition: {
          kind: 'objectMatches',
          of: T1,
          filter: { manaValue: { cmp: 'atMost', value: 3 } },
        },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'may',
              effect: { kind: 'moveToZone', objects: T1, to: 'battlefield', controller: 'you' },
            },
            {
              kind: 'conditional',
              condition: { kind: 'not', term: { kind: 'didPrevious' } },
              effect: TO_HAND,
            },
          ],
        },
        else: TO_HAND,
      },
      { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
    ],
  },
};

const ENCHANT_CREATURE: Ability = {
  kind: 'keyword',
  keyword: { kind: 'enchant', filter: { types: ['creature'] } },
};

export const SYNTHETIC_DANITHA_G1B_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Rebirth Rite',
    manaCost: ['1', 'G', 'W'],
    types: ['instant'],
    colors: ['W', 'G'],
    colorIdentity: ['W', 'G'],
    oracleText:
      "Choose target permanent card in your graveyard. If it has mana value 3 or less, you may put it onto the battlefield. If you don't put it onto the battlefield, put it into your hand. You gain 3 life.",
    spell: REBIRTH_SPELL,
  }),
  singleFace({
    name: 'SYNTHETIC Aura Recaller',
    manaCost: ['1', 'G', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Knight'],
    colors: ['W', 'G'],
    colorIdentity: ['W', 'G'],
    power: 2,
    toughness: 2,
    oracleText:
      'Vigilance\nOnce during each of your turns, you may cast an Aura or Equipment spell from your graveyard.',
    abilities: [
      kw('vigilance'),
      {
        kind: 'static',
        static: {
          kind: 'playFromGraveyardOnceEachTurn',
          cast: { anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }] },
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Creature Ward Aura',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText:
      'Enchant creature\nEnchanted creature gets +1/+1 and has protection from creatures.',
    abilities: [
      ENCHANT_CREATURE,
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'attached', types: ['creature'] },
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached', types: ['creature'] },
          keyword: { kind: 'protection', from: 'cardType', types: ['creature'] },
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Growth Watcher',
    manaCost: ['1', 'G'],
    types: ['enchantment'],
    colors: ['G'],
    colorIdentity: ['G'],
    oracleText:
      'Whenever a creature you control enters, scry 1.\nWhenever you cast a spell that targets a creature you control, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { types: ['creature'], controller: 'you' },
        },
        effect: { kind: 'scry', count: 1 },
      },
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            stackKind: 'spell',
            targetsObject: { types: ['creature'], controller: 'you' },
          },
          by: 'you',
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  }),
];
