/**
 * Effect rules of group 3-a of the Niv-Mizzet deck (issue 25, D-971): "copy it for each time you've cast your commander from the command zone this game",
 * the copy of a spell whose number comes from the game. ("When you next cast an instant or sorcery spell this turn, " is the lead of a sentence, read in
 * `sentence.ts`, D-970.)
 */
import { literal, optional, pattern, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

/** ". You may choose new targets for the copies": the next sentence, taken with the clause (CR 707.10c). */
const NEW_TARGETS_COPIES = pattern(
  /\. you may choose new targets for the copies(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
);

/**
 * `effect.copy-spell-for-each`: "copy it for each time you've cast your commander from the command zone this game", with or without "You may choose new targets
 * for the copies." (CR 707.10, 707.10c, 903.8: a copy of the spell for each of the times the commander was cast from the command zone, none for none; each copy may
 * have new targets). The engine's `copySpell` with a `count`. "It" and "that spell" are the spell of the cast trigger or of the delayed trigger that waits for one.
 * Not read: another thing counted, one copy, another player's commander, a join with a second instruction.
 */
export const EFFECT_COPY_SPELL_FOR_EACH = defineRule<Clauses>({
  id: 'effect.copy-spell-for-each',
  family: 'effect',
  leading: ['copy'],
  cites: [
    'CR 707.10 (Copying Objects)',
    'CR 707.10c (Copying Objects)',
    'CR 903.8 (Commander)',
    'CR 113.7a (Abilities)',
  ],
  examples: [
    "copy it for each time you've cast your commander from the command zone this game",
    "copy that spell for each time you've cast your commander from the command zone this game",
    "copy it for each time you've cast your commander from the command zone this game. you may choose new targets for the copies",
    "copy that spell for each time you've cast your commander from the command zone this game. you may choose new targets for the copies",
  ],
  rejects: [
    "copy it for each time you've cast your commander from the command zone this game. you may choose new targets for the copy",
    "copy it for each time you've cast your commander from the command zone this game and draw a card",
    "copy it for each time you've cast your commander from the command zone",
    "copy it for each time you've cast a commander from the command zone this game",
    'copy it for each time an opponent has cast their commander from the command zone this game',
    'copy it for each creature you control',
    'copy it for each time',
    'copy it twice',
    'copy it',
    "copy target instant or sorcery spell for each time you've cast your commander from the command zone this game",
    "copy this spell for each time you've cast your commander from the command zone this game",
    "copy them for each time you've cast your commander from the command zone this game",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.copy-spell-for-each';
    const head = sequence(
      literal('copy '),
      spanned(pattern(new RegExp(`(?:it|that spell)${BOUNDARY}`, 'iu'))),
      literal(' '),
      spanned(family<IrAmount>('amount', { only: ['amount.for-each-commander-cast'] })),
    )(ctx, pos);
    if (!head.ok) return head;
    const [, spellWord, , count] = head.value;
    const newTargets = optional(NEW_TARGETS_COPIES, null)(ctx, head.pos);
    if (!newTargets.ok) return newTargets;
    const end = newTargets.pos;
    // Nothing joined to the clause: a join says a second instruction, which is not read.
    const stop = pattern(/(?=\.|$)/u)(ctx, end);
    if (!stop.ok) return stop;
    const span = { start: pos, end };
    const spell: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: ctx.text.slice(spellWord.span.start, spellWord.span.end) },
      upTo: false,
      plural: false,
      other: false,
      span: spellWord.span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'copySpell',
          { spell, newTargets: flag(id, newTargets.value !== null, span), count: count.value },
          span,
        ),
      ],
      pos: end,
    };
  },
});

export const NIV_GROUP_3_A_EFFECT_RULES = [EFFECT_COPY_SPELL_FOR_EACH].map(quietly);
