/**
 * The words of a token an effect creates (D-131), composed from the `TokenSpec`: "2/2 black Zombie creature
 * token", "Treasure token", "1/2 green Spider creature token with reach", "token that's a copy of target
 * creature". Read from the definition, never from a card name. Pure.
 */
import type { Ability, ObjectRef, TokenSpec } from '@commander-arena/engine';
import { copyExceptionsText } from './hashaton-g5-text';
import { COLOR_NAMES } from './words';

/** What a token is called with one and with several: "tapped 2/2 black Zombie creature token(s)". */
export interface TokenWords {
  readonly one: string;
  readonly many: string;
}

/** "firstStrike" is "first strike": a keyword in words. */
const keywordWords = (kind: string): string => kind.replace(/([A-Z])/g, ' $1').toLowerCase();

/** " with flying and reach", or '' when the token has no keyword. */
function withKeywords(abilities: readonly Ability[]): string {
  const words = abilities.flatMap((a) => {
    if (a.kind !== 'keyword') return [];
    // D-185 (CR 702.82a): "devour 2" says its number.
    return a.keyword.kind === 'devour'
      ? [`devour ${a.keyword.count}`]
      : [keywordWords(a.keyword.kind)];
  });
  return words.length === 0 ? '' : ` with ${words.join(' and ')}`;
}

/**
 * The noun phrase of the tokens an effect creates, without a count or an article. `tapped` is the
 * "tapped Treasure tokens" of CR 110.5b; `named` words the object a copy copies.
 */
export function tokenWords(
  token: TokenSpec,
  tapped: boolean,
  named: (ref: ObjectRef) => string,
): TokenWords {
  const lead = tapped ? 'tapped ' : '';
  switch (token.kind) {
    case 'preset':
      return { one: `${lead}${token.preset} token`, many: `${lead}${token.preset} tokens` };
    case 'copyOf': {
      const of = named(token.object);
      // D-382 (CR 707.9b): "..., except it's a 4/4 black Zombie".
      const except = copyExceptionsText(token);
      return {
        one: `${lead}token that's a copy of ${of}${except}`,
        many: `${lead}tokens that are copies of ${of}${except}`,
      };
    }
    case 'custom': {
      const d = token.definition;
      const stats = d.power === null || d.toughness === null ? '' : `${d.power}/${d.toughness} `;
      const colors =
        d.colors.length === 0
          ? 'colorless'
          : d.colors.map((c) => COLOR_NAMES[c] ?? c).join(' and ');
      const kind = d.subtypes.length === 0 ? d.name : d.subtypes.join(' ');
      const core = `${stats}${colors} ${kind} ${d.types.join(' ')}`.replace(/\s+/g, ' ').trim();
      // CR 111.4 (D-183): a token the effect names ("named Kobolds of Kher Keep") says its name; by default it is named by its creature types.
      const named = d.subtypes.length > 0 && d.name !== kind ? ` named ${d.name}` : '';
      const tail = `${named}${withKeywords(d.abilities)}`;
      return { one: `${lead}${core} token${tail}`, many: `${lead}${core} tokens${tail}` };
    }
  }
}
