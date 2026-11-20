/**
 * SYNTHETIC CARDS FOR THE THREE WORLD-RULE STATICS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of "Players can't gain life." (`cantGainLife` for `players`, CR 119.7), "Damage can't be prevented." (`damageCantBePrevented`,
 * CR 615.12) and "All damage is dealt as though its source had wither." (`damageAsThoughWither`, CR 702.80a, 120.3d), each on its own. Names start with
 * "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text.
 */
import type { Ability } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const idol = (name: string, words: string, ability: Ability): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: words,
    abilities: [ability],
  });

export const SYNTHETIC_BLIGHT_CURSE_LIST: readonly CardDefinition[] = [
  idol('SYNTHETIC Sour Idol', "Players can't gain life.", {
    kind: 'static',
    static: { kind: 'cantGainLife', who: 'players' },
  }),
  idol('SYNTHETIC Stubborn Idol', "Damage can't be prevented.", {
    kind: 'static',
    static: { kind: 'damageCantBePrevented' },
  }),
  idol('SYNTHETIC Blight Idol', 'All damage is dealt as though its source had wither.', {
    kind: 'static',
    static: { kind: 'damageAsThoughWither' },
  }),
];
