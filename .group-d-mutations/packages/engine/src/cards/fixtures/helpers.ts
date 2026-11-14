/**
 * Small builders shared by the fixture files. Everything a fixture states (colors, color
 * identity, abilities) is written out by hand on purpose: the tests check those literals
 * against the real cards and against independent derivations, so nothing here computes them.
 */
import type { Ability, AlternativeCost, Cost, Keyword, SpellText } from '../../ast/types';
import type { CardType, Color, PtValue, Subtype, Supertype } from '../../characteristics';
import type { CardDefinition } from '../definition';

export interface SingleFaceInput {
  readonly name: string;
  readonly manaCost: readonly string[] | null;
  readonly supertypes?: readonly Supertype[];
  readonly types: readonly CardType[];
  readonly subtypes?: readonly Subtype[];
  readonly colors: readonly Color[];
  readonly colorIdentity: readonly Color[];
  readonly power?: PtValue;
  readonly toughness?: PtValue;
  /** Printed loyalty of a planeswalker (CR 306.5a). */
  readonly loyalty?: number;
  /** Printed defense of a battle (CR 310.4a). */
  readonly defense?: number;
  readonly oracleText: string;
  readonly abilities?: readonly Ability[];
  readonly spell?: SpellText;
  /** Additional costs to cast (CR 118.8, D-095). */
  readonly additionalCosts?: readonly Cost[];
  /** "Sacrifice an artifact or creature or pay {4}" (CR 118.8, D-181). */
  readonly additionalCostChoice?: readonly [readonly Cost[], readonly Cost[]];
  /** Alternative costs (CR 118.9, D-095). */
  readonly alternativeCosts?: readonly AlternativeCost[];
}

/** A normal-layout, single-face card. `oracleId` is always null (fixtures are unmatched). */
export function singleFace(input: SingleFaceInput): CardDefinition {
  return {
    oracleId: null,
    name: input.name,
    layout: 'normal',
    faces: [
      {
        name: input.name,
        manaCost: input.manaCost,
        supertypes: input.supertypes ?? [],
        types: input.types,
        subtypes: input.subtypes ?? [],
        colors: input.colors,
        power: input.power ?? null,
        toughness: input.toughness ?? null,
        loyalty: input.loyalty ?? null,
        defense: input.defense ?? null,
        oracleText: input.oracleText,
        abilities: input.abilities ?? [],
        spell: input.spell ?? null,
        ...(input.additionalCosts === undefined ? {} : { additionalCosts: input.additionalCosts }),
        ...(input.additionalCostChoice === undefined
          ? {}
          : { additionalCostChoice: input.additionalCostChoice }),
        ...(input.alternativeCosts === undefined
          ? {}
          : { alternativeCosts: input.alternativeCosts }),
      },
    ],
    colorIdentity: input.colorIdentity,
    support: 'supported',
  };
}

/** A keyword ability with no parameters, as an AST ability (CR 702). */
export function kw(
  kind: Exclude<
    Keyword['kind'],
    | 'ward'
    | 'protection'
    | 'cycling'
    | 'enchant'
    | 'equip'
    | 'kicker'
    | 'flashback'
    | 'crew'
    | 'landwalk'
    | 'annihilator'
    | 'afflict'
    | 'toxic'
    | 'typecycling'
    | 'multikicker'
    | 'bushido'
    | 'affinity'
  >,
): Ability {
  // The parameterless kinds are more than TypeScript distributes a union of object types over.
  return { kind: 'keyword', keyword: { kind } as Keyword };
}
