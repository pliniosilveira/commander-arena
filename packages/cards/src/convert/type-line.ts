import {
  CARD_TYPES,
  type CardType,
  SUPERTYPES,
  type Subtype,
  type Supertype,
} from '@commander-arena/engine';

export interface ParsedTypeLine {
  readonly supertypes: Supertype[];
  readonly types: CardType[];
  readonly subtypes: Subtype[];
  /** Words before the dash that are neither a known supertype nor a known card type. */
  readonly unknown: string[];
}

/** Subtypes that contain a space; splitting the subtype list on spaces would cut them in two. */
const MULTI_WORD_SUBTYPES = ['Time Lord'];

/** "Tribal" is the pre-2023 name of the Kindred type; Scryfall's Oracle data uses Kindred. */
const TYPE_ALIASES: Readonly<Record<string, CardType>> = { tribal: 'kindred' };

function splitSubtypes(text: string): string[] {
  let rest = text;
  const out: string[] = [];
  for (const multi of MULTI_WORD_SUBTYPES) {
    if (rest.includes(multi)) {
      out.push(multi);
      rest = rest.replace(multi, ' ');
    }
  }
  out.push(...rest.split(/\s+/).filter((w) => w !== ''));
  return out;
}

/**
 * Splits a Scryfall type line ("Legendary Creature — Elf Druid") at the em dash into supertypes
 * and card types (left) and subtypes (right). Words are matched case-insensitively against the
 * engine's SUPERTYPES and CARD_TYPES; anything else on the left is reported in `unknown`.
 */
export function parseTypeLine(typeLine: string): ParsedTypeLine {
  const dash = typeLine.indexOf('—');
  const left = dash === -1 ? typeLine : typeLine.slice(0, dash);
  const right = dash === -1 ? '' : typeLine.slice(dash + 1);
  const supertypes: Supertype[] = [];
  const types: CardType[] = [];
  const unknown: string[] = [];
  for (const word of left.split(/\s+/).filter((w) => w !== '')) {
    const lower = word.toLowerCase();
    const alias = Object.hasOwn(TYPE_ALIASES, lower) ? TYPE_ALIASES[lower] : undefined;
    const type = alias ?? CARD_TYPES.find((t) => t === lower);
    const supertype = SUPERTYPES.find((t) => t === lower);
    if (supertype !== undefined) supertypes.push(supertype);
    else if (type !== undefined) types.push(type);
    else unknown.push(word);
  }
  return { supertypes, types, subtypes: splitSubtypes(right), unknown };
}
