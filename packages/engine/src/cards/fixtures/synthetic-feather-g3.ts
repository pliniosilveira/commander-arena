/**
 * SYNTHETIC CARDS FOR GROUP 3 OF THE FEATHER DECK (issue 27, D-1320 to D-1325 provisional). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real cards of the group need from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to
 * these same nodes): creatures with a cast trigger on a spell that targets the creature itself or only the creature itself, a draw once each turn on an Equipment spell or a spell that
 * targets a creature of the controller's, the exile of a spell as it resolves with its return to the hand, and the copy of a spell for each other creature that it could target.
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, ObjectFilter } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const SPELL = { kind: 'triggerSubject' } as const;
const YOU = { kind: 'you' } as const;

/** "an instant or sorcery spell" cast: the spells the exile and the copies are about. */
const INSTANT_OR_SORCERY: ObjectFilter = {
  stackKind: 'spell',
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
};

const castBy = (
  by: 'you' | 'any',
  filter: ObjectFilter,
  effect: Extract<Ability, { kind: 'triggered' }>['effect'],
): Ability => ({
  kind: 'triggered',
  trigger: { kind: 'castSpell', filter, by },
  effect,
});

export const SYNTHETIC_FEATHER_G3_LIST: readonly CardDefinition[] = [
  // Two instances of the word "target", so that a copy for another creature must be legal for both (CR 707.10e).
  singleFace({
    name: 'SYNTHETIC Paired Boost',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Target creature you control gets +1/+0 until end of turn. Target creature with flying gets +0/+1 until end of turn.',
    spell: {
      targets: [
        { id: 't1', what: { kind: 'object', filter: { types: ['creature'], controller: 'you' } } },
        {
          id: 't2',
          what: { kind: 'object', filter: { types: ['creature'], keywords: ['flying'] } },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'modifyPt',
            objects: { kind: 'target', id: 't1' },
            power: 1,
            toughness: 0,
            duration: 'untilEndOfTurn',
          },
          {
            kind: 'modifyPt',
            objects: { kind: 'target', id: 't2' },
            power: 0,
            toughness: 1,
            duration: 'untilEndOfTurn',
          },
        ],
      },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Heroic Captain',
    manaCost: ['W', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText:
      'Whenever you cast a spell that targets this creature, put a +1/+1 counter on each creature you control.',
    abilities: [
      castBy(
        'you',
        { stackKind: 'spell', targetsObject: { isSource: true } },
        {
          kind: 'addCounters',
          objects: {
            kind: 'each',
            filter: { types: ['creature'], controller: 'you', zone: 'battlefield' },
          },
          counter: '+1/+1',
          count: 1,
        },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Heroic Scout',
    manaCost: ['R', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    colors: ['W', 'R'],
    colorIdentity: ['W', 'R'],
    power: 2,
    toughness: 2,
    oracleText:
      'Haste\nWhenever you cast a spell that targets this creature, put a +1/+1 counter on this creature, then scry 1.',
    abilities: [
      kw('haste'),
      castBy(
        'you',
        { stackKind: 'spell', targetsObject: { isSource: true } },
        {
          kind: 'sequence',
          effects: [
            { kind: 'addCounters', objects: THIS, counter: '+1/+1', count: 1 },
            { kind: 'scry', count: 1 },
          ],
        },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Cast Draw Knight',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Knight'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText:
      'First strike\nWhenever you cast an Equipment spell or a spell that targets a creature you control, draw a card. This ability triggers only once each turn.',
    abilities: [
      kw('firstStrike'),
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: {
            stackKind: 'spell',
            anyOf: [
              { subtypes: ['Equipment'] },
              { targetsObject: { types: ['creature'], controller: 'you' } },
            ],
          },
          by: 'you',
        },
        effect: { kind: 'draw', player: YOU, count: 1 },
        oncePerTurn: true,
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Spell Recycler',
    manaCost: ['R', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W', 'R'],
    colorIdentity: ['W', 'R'],
    power: 3,
    toughness: 4,
    oracleText:
      'Flying\nWhenever you cast an instant or sorcery spell that targets a creature you control, exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step.',
    abilities: [
      kw('flying'),
      castBy(
        'you',
        { ...INSTANT_OR_SORCERY, targetsObject: { types: ['creature'], controller: 'you' } },
        { kind: 'exileOnResolve', spell: SPELL },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Echo Grinder',
    manaCost: ['3', 'R'],
    types: ['creature'],
    subtypes: ['Goblin', 'Ally'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText:
      'Whenever you cast an instant or sorcery spell that targets only this creature, copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures.',
    abilities: [
      castBy(
        'you',
        { ...INSTANT_OR_SORCERY, targetsOnly: { isSource: true } },
        {
          kind: 'copySpell',
          spell: SPELL,
          newTargets: 'no',
          forEach: { types: ['creature'], controller: 'you', other: true },
        },
      ),
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Mirror Wyrm',
    manaCost: ['3', 'R', 'R'],
    types: ['creature'],
    subtypes: ['Dragon'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 4,
    toughness: 5,
    oracleText:
      'Flying\nWhenever a player casts an instant or sorcery spell that targets only this creature, that player copies that spell for each other creature they control that the spell could target. Each copy targets a different one of those creatures.',
    abilities: [
      kw('flying'),
      castBy(
        'any',
        { ...INSTANT_OR_SORCERY, targetsOnly: { isSource: true } },
        {
          kind: 'copySpell',
          spell: SPELL,
          newTargets: 'no',
          forEach: { types: ['creature'], controller: 'triggerPlayer', other: true },
          copier: 'triggerPlayer',
        },
      ),
    ],
  }),
];
