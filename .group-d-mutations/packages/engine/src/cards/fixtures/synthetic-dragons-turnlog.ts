/**
 * SYNTHETIC CARDS FOR CONDITIONS THAT READ WHAT HAPPENED THIS TURN. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151 (the Dragons slice): "Celebration - As long as two or more nonland permanents entered the battlefield under your
 * control this turn, ~ is a Dragon with base power and toughness 4/4, flying, and '{R}: Dragons you control get +1/+0 until end of turn.'" (the
 * four conditional statics, one of them granting an activated ability), the same for tokens only, and a land that lets its controller play its
 * exiled card for {R} and {T} if an opponent was dealt 3 or more damage this turn. Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Condition } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const THIS = { kind: 'this' } as const;

/** The four statics of a Celebration creature, all with `condition`. */
const celebration = (condition: Condition): Ability[] => [
  {
    kind: 'static',
    static: { kind: 'setTypes', subject: THIS, types: ['creature'], subtypes: ['Dragon'] },
    condition,
  },
  { kind: 'static', static: { kind: 'setPt', subject: THIS, power: 4, toughness: 4 }, condition },
  {
    kind: 'static',
    static: { kind: 'grantKeyword', subject: THIS, keyword: { kind: 'flying' } },
    condition,
  },
  {
    kind: 'static',
    static: {
      kind: 'grantAbility',
      subject: THIS,
      ability: {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['R'] }],
        effect: {
          kind: 'modifyPt',
          objects: { kind: 'each', filter: { subtypes: ['Dragon'], controller: 'you' } },
          power: 1,
          toughness: 0,
          duration: 'untilEndOfTurn',
        },
      },
    },
    condition,
  },
];

export const SYNTHETIC_DRAGONS_TURNLOG_LIST: readonly CardDefinition[] = [
  // "Haste. Celebration - As long as two or more nonland permanents entered the battlefield under your control this turn, this creature is a
  //  Dragon with base power and toughness 4/4, flying, and "{R}: Dragons you control get +1/+0 until end of turn." (It loses all other creature types.)"
  singleFace({
    name: 'SYNTHETIC Festive Chief',
    manaCost: ['1', 'R', 'R'],
    supertypes: ['legendary'],
    types: ['creature'],
    subtypes: ['Human', 'Noble'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText:
      'Haste. Celebration - As long as two or more nonland permanents entered the battlefield under your control this turn, this creature is a Dragon with base power and toughness 4/4, flying, and "{R}: Dragons you control get +1/+0 until end of turn."',
    abilities: [
      kw('haste'),
      ...celebration({ kind: 'enteredThisTurn', count: 2, notTypes: ['land'] }),
    ],
  }),
  // "As long as three or more tokens entered the battlefield under your control this turn, this creature gets base power and toughness 5/5."
  singleFace({
    name: 'SYNTHETIC Token Cheerer',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 1,
    toughness: 1,
    oracleText:
      'As long as two or more tokens entered the battlefield under your control this turn, this creature has base power and toughness 5/5.',
    abilities: [
      {
        kind: 'static',
        static: { kind: 'setPt', subject: THIS, power: 5, toughness: 5 },
        condition: { kind: 'enteredThisTurn', count: 2, token: true },
      },
    ],
  }),
  // "Hideaway 4. This land enters tapped. {T}: Add {R}. {R}, {T}: You may play the exiled card without paying its mana cost if an opponent was
  //  dealt 3 or more damage this turn."
  singleFace({
    name: 'SYNTHETIC Scorched Hideaway',
    manaCost: null,
    types: ['land'],
    colors: [],
    colorIdentity: ['R'],
    oracleText:
      'Hideaway 4. This land enters tapped. {T}: Add {R}. {R}, {T}: You may play the exiled card without paying its mana cost if an opponent was dealt 3 or more damage this turn.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'hideaway', count: 4 } },
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['R'] } },
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['R'] }, { kind: 'tap' }],
        effect: {
          kind: 'conditional',
          condition: { kind: 'playerDealtDamage', player: 'opponent', atLeast: 3 },
          effect: { kind: 'castFree', objects: { kind: 'linkedExile' }, play: true },
        },
      },
    ],
  }),
];
