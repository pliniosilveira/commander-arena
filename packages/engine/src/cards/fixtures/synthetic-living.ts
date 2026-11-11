/**
 * SYNTHETIC CARDS FOR LIVING WEAPON (CR 702.92). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-139 (the Artifacts slice): Equipment with Living weapon whose equipped creature gets a fixed bonus, a
 * bonus that counts (artifacts and/or enchantments you control), or none at all (the Germ dies as a 0/0), and one with Equip so that
 * it can be moved afterwards. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle
 * text, and none of these is the definition of a real card.
 */
import type { Ability, StaticPtAmount } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const LIVING: Ability = { kind: 'keyword', keyword: { kind: 'livingWeapon' } };
const EQUIP_TWO: Ability = {
  kind: 'keyword',
  keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['2'] }] },
};

const bonus = (power: StaticPtAmount, toughness: StaticPtAmount): Ability => ({
  kind: 'static',
  static: {
    kind: 'modifyPt',
    subject: { kind: 'attached', types: ['creature'] },
    power,
    toughness,
  },
});

const equipment = (
  name: string,
  oracle: string,
  abilities: readonly Ability[],
  cost: readonly string[] = ['3'],
): CardDefinition =>
  singleFace({
    name,
    manaCost: cost,
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText: oracle,
    abilities,
  });

const ARTIFACT_OR_ENCHANTMENT = {
  kind: 'countOf',
  filter: { anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }], controller: 'you' },
} as const;

export const SYNTHETIC_LIVING_LIST: readonly CardDefinition[] = [
  equipment('SYNTHETIC Germ Blade', 'Living weapon. Equipped creature gets +2/+2. Equip {2}', [
    LIVING,
    bonus(2, 2),
    EQUIP_TWO,
  ]),
  equipment(
    'SYNTHETIC Count Blade',
    'Living weapon. Equipped creature gets +1/+1 for each artifact and/or enchantment you control. Equip {2}',
    [LIVING, bonus(ARTIFACT_OR_ENCHANTMENT, ARTIFACT_OR_ENCHANTMENT), EQUIP_TWO],
  ),
  equipment('SYNTHETIC Husk Blade', 'Living weapon. Equip {2}', [LIVING, EQUIP_TWO]),
];
