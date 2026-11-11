/**
 * The abilities a token has in quotes (stage P35, D-176, CR 111.4, 113.1): `create a 1/1 black and green Pest creature token with "When ~ dies,
 * you gain 1 life."`. The text in the quotes was read as an ability of its own (`rules/static/quoted.ts`) and is lowered like the abilities
 * of a card, as the ability of the token: `~` is the token, a mana ability, an activated one and a triggered one are the kinds read, and a
 * quote inside the quote is another token's ability, lowered the same way when that token is lowered.
 */
import type { Ability } from '@commander-arena/engine';
import { bind } from '../ir/bind';
import type { IrQuotedAbility } from '../ir/types';
import type { FeatureRef } from './features';
import { lateLowerers } from './late';
import { type LowerContext, type LowerFailure, type LowerResult, newContext } from './types';

const failure = (quoted: IrQuotedAbility, needs: readonly FeatureRef[] = []): LowerFailure => ({
  ok: false,
  needs,
  at: quoted.span,
  rule: quoted.rule,
});

/**
 * The rules text of a token that has abilities in quotes (CR 111.4): its keywords as one line ("Flying, haste"), then each quoted ability as
 * the card writes it, one to a line. The card face prints `oracleText`, and a keyword shows as a chip anyway, but an ability in quotes
 * (the death trigger of Smaug) showed nowhere. A token with no quoted ability keeps `''`: its keywords are the chips.
 *
 * The quote was read with `~` for the token ("When ~ dies"); the words say what the card prints: the name the card gives the token
 * (`named`), or else "this creature". A `~` inside a quote of the quote is another token's and stays.
 */
export function tokenRulesText(
  keywords: readonly string[],
  quoted: readonly IrQuotedAbility[],
  named: string | undefined,
): string {
  const self = named ?? 'this creature';
  const own = quoted.flatMap((q) =>
    q.text === undefined || q.text === ''
      ? []
      : [
          q.text
            .split('"')
            .map((part, i) => (i % 2 === 0 ? part.split('~').join(self) : part))
            .join('"')
            // As printed: "{R}: This creature gets +1/+0", "Sacrifice this creature: Add {C}."
            .replace(/(^|[:.] )this creature/gu, '$1This creature'),
        ],
  );
  if (own.length === 0) return '';
  const lines: string[] = [];
  if (keywords.length > 0) {
    const joined = keywords.join(', ');
    lines.push(`${joined.charAt(0).toUpperCase()}${joined.slice(1)}`);
  }
  return [...lines, ...own].join('\n');
}

/** The ability of a token, in the engine's AST; the token's types and creature types are the face the ability is read on. */
export function lowerTokenAbility(
  quoted: IrQuotedAbility,
  types: readonly string[],
  subtypes: readonly string[],
  ctx: LowerContext,
): LowerResult<Ability> {
  const inner = quoted.ability;
  if (inner.kind !== 'activated' && inner.kind !== 'triggered') return failure(quoted);
  const bound = bind(inner, {});
  if (!bound.ok) return failure(quoted);
  const late = lateLowerers();
  if (late === null) return failure(quoted);
  const own = newContext('ability', types, subtypes, ctx.cardName);
  const lowered =
    bound.ability.kind === 'triggered'
      ? late.triggered(bound.ability, own)
      : bound.ability.kind === 'activated'
        ? late.activated(bound.ability, own)
        : null;
  if (lowered === null) return failure(quoted);
  if (!lowered.ok) return failure(quoted, lowered.needs);
  const [only, ...more] = lowered.value;
  if (only === undefined || more.length > 0) return failure(quoted);
  if (only.kind !== 'activated' && only.kind !== 'triggered' && only.kind !== 'mana') {
    return failure(quoted);
  }
  return { ok: true, value: only, rule: quoted.rule };
}
