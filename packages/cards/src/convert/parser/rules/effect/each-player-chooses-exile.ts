/**
 * Effect rule of the Revenant Recon deck (Foreboding Steamboat): "Each player chooses two nontoken, non-Vehicle creatures they control. Exile them until ~ leaves the battlefield." (CR 608.2d,
 * 101.4, 610.3). Each player chooses among their own creatures, in APNAP order, and the creatures chosen are exiled together; the engine's `moveToZone` of a `choose` with `players`, `until`
 * and `linked` (`lower/each-player-chooses-exile.ts`). The segmenter joins the two sentences.
 */
import { fail, pattern } from '../../combinators';
import type { IrArg, IrFilter, IrNoun, Span } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import type { Clauses } from './operands';
import { makeClause } from './operands';

const ID = 'effect.each-player-chooses-exile-until';

const COUNTS: Readonly<Record<string, number>> = { two: 2, three: 3 };

/**
 * `effect.each-player-chooses-exile-until`: "each player chooses two nontoken, non-Vehicle creatures they control. exile them until ~ leaves the battlefield". The number is two or three, the
 * creatures are limited by "nontoken" and "non-<subtype>" only, and the exile lasts until the permanent of the ability leaves the battlefield (CR 610.3). Not read: "each opponent", "a
 * creature", another number, another quality, another zone, another duration, "target", the first sentence alone (nothing would be exiled).
 */
export const EFFECT_EACH_PLAYER_CHOOSES_EXILE_UNTIL = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 101.4 (Players)',
    'CR 610.3 (Duration-Modifying Effects)',
    'CR 406.1 (Exile)',
  ],
  examples: [
    'each player chooses two nontoken, non-Vehicle creatures they control. exile them until ~ leaves the battlefield',
    'each player chooses two creatures they control. exile them until ~ leaves the battlefield',
    'each player chooses three nontoken creatures they control. exile them until ~ leaves the battlefield',
  ],
  rejects: [
    'each player chooses two nontoken, non-Vehicle creatures they control',
    'each opponent chooses two nontoken, non-Vehicle creatures they control. exile them until ~ leaves the battlefield',
    'each player chooses a nontoken creature they control. exile it until ~ leaves the battlefield',
    'each player chooses two nontoken creatures they control. exile them',
    'each player chooses two nontoken creatures they control. exile them until end of turn',
    'each player chooses two red creatures they control. exile them until ~ leaves the battlefield',
    'each player chooses two nontoken creatures. exile them until ~ leaves the battlefield',
    'each player chooses two nontoken creatures they control. return them to the battlefield until ~ leaves the battlefield',
    'each player chooses two nontoken creatures they control. exile them until ~ leaves the battlefield, then draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /each player chooses (two|three) (?:(nontoken)(?:, | ))?(?:non-([a-z]+) )?creatures they control\. exile them until ~ leaves the battlefield(?![\p{L}\p{N}]|,| and\b| then\b)/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span, value: m } = r.value;
    const count = COUNTS[(m[1] ?? '').toLowerCase()];
    const nonSubtype = m[3];
    if (count === undefined) return fail(ctx, pos);
    const filter: IrFilter = {
      types: ['creature'],
      ...(m[2] === undefined ? {} : { token: false }),
      ...(nonSubtype === undefined
        ? {}
        : {
            notSubtypes: [nonSubtype.charAt(0).toUpperCase() + nonSubtype.slice(1).toLowerCase()],
          }),
      raw: 'creatures they control',
    };
    // The binding pass keys its nouns by span: each noun has a span of its own (the words "each player", then the rest of the first sentence).
    const whoSpan: Span = { start: span.start, end: span.start + 'each player'.length };
    const whatSpan: Span = { start: whoSpan.end, end: span.end };
    const creatures: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter,
      count: { kind: 'number', value: count, span: whatSpan },
      upTo: false,
      plural: true,
      other: false,
      span: whatSpan,
      rule: ID,
    };
    const players: IrNoun = {
      kind: 'noun',
      det: 'eachPlayer',
      filter: { raw: 'each player' },
      upTo: false,
      plural: false,
      other: false,
      span: whoSpan,
      rule: ID,
    };
    const args: Record<string, IrArg> = { players, creatures };
    return {
      ok: true,
      value: [makeClause(ID, 'eachPlayerChoosesExileUntil', args, span)],
      pos: r.pos,
    };
  },
});

export const EACH_PLAYER_CHOOSES_EXILE_RULES = [EFFECT_EACH_PLAYER_CHOOSES_EXILE_UNTIL].map(
  quietly,
);
