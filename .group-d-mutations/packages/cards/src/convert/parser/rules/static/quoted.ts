/**
 * A granted ability in quotes, read as an ability of its own (stage P34, D-152, CR 613.1f, 604.1): `has "Whenever ~ attacks, it deals 7 damage
 * to target creature defending player controls."`, `"{R}: Dragons you control get +1/+0 until end of turn."`. The text inside the quotes is a
 * whole ability, so it is segmented and read by the same phrase rules as the ability of a card (the nested IR is bound and lowered with the
 * static ability that grants it). Only an activated or a triggered ability is read here; a mana ability is `QUOTED_MANA`, and any other quoted text
 * stays text that is not read (`grantQuoted`).
 */
import { fail, type ParseContext, type ParseResult, type Parser, pattern } from '../../combinators';
import type { IrQuotedAbility, IrStaticEffect } from '../../ir/types';
import { parseAbility } from '../../parse-ability';
import { segment } from '../../segment';

/**
 * A quote inside the quote ("... create a 2/2 red Dragon creature token with flying and '{R}: ~ gets +1/+0 until end of turn.'"), stage P35 (D-176): the
 * single quotes that open and close an ability are read as double quotes, one for one, so the text keeps its length and its offsets. The opening one
 * follows a space and starts an ability ("and '{R}: ...'"), the closing one follows the period of its ability and ends the text; an apostrophe
 * anywhere else is left as it is.
 */
function nestedQuotes(inner: string): string {
  if (!/\.['’]$/u.test(inner)) return inner;
  const open = /(^|\s)(['‘])(?=\S)/u.exec(inner);
  if (open === null) return inner;
  const at = open.index + (open[1] ?? '').length;
  return `${inner.slice(0, at)}"${inner.slice(at + 1, -1)}"`;
}

export interface QuotedOptions {
  /** A mana ability is read too (the ability of a token: "Sacrifice ~: Add {C}."); a granted one is `QUOTED_MANA`'s. */
  readonly mana: boolean;
  /**
   * The name of the token the ability belongs to when it has one of its own ("Smaug ... \"When Smaug dies, ...\"", stage P45, D-197): the name inside
   * the quotes is the token itself, as `~` is for the card, so it is read as `~`.
   */
  readonly self?: string;
  /**
   * A static ability is read too (stage P47, D-201): the ability of an emblem, `"Creatures you control get +2/+2 and have flying."`; a granted ability
   * and a token's are activated or triggered.
   */
  readonly statics?: boolean;
}

/**
 * An ability in quotes at `pos`, read with the phrase rules as an ability of its own: `"When ~ dies, you gain 1 life."`. The text inside ends with
 * its period, or with the quote of an ability inside it. Only an activated or a triggered ability is read, a mana ability when `mana`. The IR is
 * left for the binding pass and the lowering, as for a granted ability.
 */
export function readQuotedAbility(
  ctx: ParseContext,
  pos: number,
  options: QuotedOptions,
): ParseResult<IrQuotedAbility> {
  const open = pattern(/["“]/u)(ctx, pos);
  if (!open.ok) return open;
  const rest = ctx.text.slice(open.pos);
  const close = /["”]/u.exec(rest);
  if (close === null) return fail(ctx, pos);
  const named = rest.slice(0, close.index);
  const written = nestedQuotes(
    options.self === undefined ? named : named.split(options.self).join('~'),
  );
  // American punctuation (stage P49, D-206): a quoted ability that is not the end of the sentence ends with the comma that follows it, inside the
  // quotes: `has "Whenever ~ attacks, you gain 1 life," and is a Cleric` (White Mage's Staff). The ability is the text with its period.
  const inner = /[^,],$/u.test(written) ? `${written.slice(0, -1)}.` : written;
  // An ability ends with its period, inside the quotes (or inside the quote of the ability it ends with).
  if (!/\.["”]?$/u.test(inner) || inner.includes('\n')) return fail(ctx, pos);
  const outcome = parseAbility(segment(inner, 'permanent'), ctx.rules);
  if (!outcome.ok) return fail(ctx, pos);
  const [ability, ...more] = outcome.abilities;
  if (ability === undefined || more.length > 0) return fail(ctx, pos);
  if (
    ability.kind !== 'activated' &&
    ability.kind !== 'triggered' &&
    !(options.statics === true && ability.kind === 'static')
  ) {
    return fail(ctx, pos);
  }
  // A granted mana ability is `QUOTED_MANA`'s, and the ones it does not read (a rider, a restriction) stay text the engine is not asked to give.
  const makesMana =
    ability.kind === 'activated' &&
    ability.body.sentences.some((sentence) => sentence.clauses.some((c) => c.verb === 'addMana'));
  if (makesMana && !options.mana) return fail(ctx, pos);
  const end = open.pos + close.index;
  const quoted: IrQuotedAbility = {
    kind: 'quoted',
    ability,
    span: { start: open.pos, end },
    rule: 'static.quoted-ability',
    text: named,
  };
  return { ok: true, value: quoted, pos: end + 1 };
}

export const QUOTED_ABILITY: Parser<readonly IrStaticEffect[]> = (ctx, pos) => {
  const read = readQuotedAbility(ctx, pos, { mana: false });
  if (!read.ok) return read;
  return { ok: true, value: [{ kind: 'grantAbility', ability: read.value }], pos: read.pos };
};

/**
 * An ability in quotes that a token has (stage P35, D-176, CR 111.4): an activated, a mana or a triggered ability, the quote inside a quote
 * included. Read for the description of a token ("with \"...\"") and for the sentence after it ("It has \"...\"").
 */
export const TOKEN_QUOTED_ABILITY: Parser<IrQuotedAbility> = (ctx, pos) =>
  readQuotedAbility(ctx, pos, { mana: true });

/** The same for a token with a name of its own: the name inside the quotes is the token (stage P45, D-197). */
export const namedTokenQuotedAbility =
  (self: string): Parser<IrQuotedAbility> =>
  (ctx, pos) =>
    readQuotedAbility(ctx, pos, { mana: true, self });
