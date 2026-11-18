/**
 * SYNTHETIC CARDS FOR EMBALM (issue 104, CR 702.128). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the shapes of Angel of Sanctions and Vizier of Many Faces: the Embalm keyword (CR 702.128a: a token copy that is white, has no mana cost and is a
 * Zombie in addition to its other types, from the graveyard, at sorcery speed) and "You may have this creature enter as a copy of any creature on the battlefield, except if this
 * creature was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types" (`entersAsCopy` with `ifEmbalmed`, CR 707.9b, 702.128b).
 * Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const embalm = (...symbols: string[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'embalm', cost: [{ kind: 'mana', symbols }] },
});

export const SYNTHETIC_EMBALM_LIST: readonly CardDefinition[] = [
  // The shape of Angel of Sanctions without its enters ability: a 3/4 Angel with flying and Embalm {5}{W}.
  singleFace({
    name: 'SYNTHETIC Embalmed Seraph',
    manaCost: ['3', 'W', 'W'],
    types: ['creature'],
    subtypes: ['Angel'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 4,
    oracleText: 'Flying\nEmbalm {5}{W}',
    abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }, embalm('5', 'W')],
  }),
  // A blue 2/1 with Embalm {1}{U}: the cheap one the tests pay for.
  singleFace({
    name: 'SYNTHETIC Embalmed Scribe',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 1,
    oracleText: 'Embalm {1}{U}',
    abilities: [embalm('1', 'U')],
  }),
  // The shape of Vizier of Many Faces: a 0/0 that may enter as a copy of any creature, with the exceptions of an embalmed token, and Embalm {1}{U}.
  singleFace({
    name: 'SYNTHETIC Many Faces',
    manaCost: ['2', 'U', 'U'],
    types: ['creature'],
    subtypes: ['Shapeshifter', 'Cleric'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 0,
    toughness: 0,
    oracleText:
      "You may have this creature enter as a copy of any creature on the battlefield, except if this creature was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types.\nEmbalm {1}{U}",
    abilities: [
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersAsCopy',
          what: { types: ['creature'] },
          optional: true,
          duration: 'permanent',
          ifEmbalmed: { setColors: ['W'], noManaCost: true, addSubtypes: ['Zombie'] },
        },
      },
      embalm('1', 'U'),
    ],
  }),
];
