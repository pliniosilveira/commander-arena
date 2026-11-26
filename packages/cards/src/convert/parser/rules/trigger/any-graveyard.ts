/**
 * Trigger rule of Centaur Vinecrasher: "Whenever a land card is put into a graveyard from anywhere" (CR 603.2, 404.1, 400.7). Says what the text says; what the engine can run is the
 * lowering's business (`lower/triggers.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule } from '../registry';
import { CARD_KINDS, cardFilter } from './death-toll-b';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';
const ID = 'trigger.put-into-any-graveyard';

/**
 * `trigger.put-into-any-graveyard`: "a land card is put into a graveyard from anywhere", "a card is put into a graveyard from anywhere" (CR 603.2: a card put into a graveyard from
 * another zone, the battlefield included; CR 404.1: the graveyard of its owner, whoever that is; CR 400.7). The engine's `putIntoGraveyard` of `who` `any`. A kind of card is a filter on the
 * card in the graveyard. Not read: "other than the battlefield" (the rule of `trigger.graveyard-events`), your graveyard, an opponent's graveyard, a zone other than "anywhere", "one or
 * more", the past tense, more words after it.
 */
export const TRIGGER_PUT_INTO_ANY_GRAVEYARD = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['a', 'an'],
  cites: ['CR 603.2 (Handling Triggered Abilities)', 'CR 404.1 (Graveyard)', 'CR 400.7 (Zones)'],
  examples: [
    'a land card is put into a graveyard from anywhere',
    'a creature card is put into a graveyard from anywhere',
    'a nonland card is put into a graveyard from anywhere',
    'a card is put into a graveyard from anywhere',
  ],
  rejects: [
    'a land card is put into your graveyard from anywhere',
    "a land card is put into an opponent's graveyard from anywhere",
    'a land card is put into a graveyard',
    'a land card is put into a graveyard from your library',
    'a land card is put into a graveyard from anywhere other than the battlefield',
    'an land card is put into a graveyard from anywhere',
    'a land card is put into a graveyard from anywhere and',
    'a land card is put into a graveyard from anywhere or',
    'one or more land cards are put into a graveyard from anywhere',
    'a land card was put into a graveyard from anywhere',
    'a land cards is put into a graveyard from anywhere',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `(an?) (?:(non)?(${CARD_KINDS}) )?card is put into a graveyard from anywhere${NOT_IN_WORD}(?!\\s+(?:and|or|other)\\b)`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, article, non, kind] = r.value;
    const filter = cardFilter(article, non, kind);
    if (filter === null) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'putIntoGraveyard',
        subject: makeNoun(ID, span, 'a', filter),
        anyGraveyard: true,
        args: {},
        span,
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const ANY_GRAVEYARD_TRIGGER_RULES = [TRIGGER_PUT_INTO_ANY_GRAVEYARD];
