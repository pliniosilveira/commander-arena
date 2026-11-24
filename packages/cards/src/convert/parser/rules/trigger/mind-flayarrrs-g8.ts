/**
 * Trigger rule of the Mind Flayarrrs deck, group 8 (Nihilith): "Whenever a card is put into an opponent's graveyard from anywhere" (CR 603.2, 404.1, 400.7). Says what the text says;
 * what the engine can run is the lowering's business (`lower/triggers.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule } from '../registry';
import { CARD_KINDS, cardFilter } from './death-toll-b';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';
const ID = 'trigger.put-into-opponent-graveyard';

/**
 * `trigger.put-into-opponent-graveyard`: "a card is put into an opponent's graveyard from anywhere", "a creature card is put into an opponent's graveyard from anywhere" (CR 603.2: a card
 * put into a graveyard from another zone; CR 404.1: the graveyard of its owner, who is an opponent of the controller of the ability; CR 400.7). The engine's `putIntoGraveyard` of `who`
 * `opponent`. A kind of card is a filter on the card in the graveyard. Not read: your own graveyard, any graveyard, a zone other than "anywhere", "one or more", the past tense, more
 * words after it.
 */
export const TRIGGER_PUT_INTO_OPPONENT_GRAVEYARD = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['a', 'an'],
  cites: ['CR 603.2 (Handling Triggered Abilities)', 'CR 404.1 (Graveyard)', 'CR 400.7 (Zones)'],
  examples: [
    "a card is put into an opponent's graveyard from anywhere",
    "a creature card is put into an opponent's graveyard from anywhere",
    "a nonland card is put into an opponent's graveyard from anywhere",
    'a card is put into an opponent’s graveyard from anywhere',
  ],
  rejects: [
    'a card is put into your graveyard from anywhere',
    'a card is put into a graveyard from anywhere',
    "a card is put into an opponent's graveyard",
    "a card is put into an opponent's graveyard from your library",
    "a card is put into an opponent's graveyard from the battlefield",
    "an card is put into an opponent's graveyard from anywhere",
    "a creature card is put into an opponent's graveyard from anywhere and",
    "a card is put into an opponent's graveyard from anywhere or",
    "one or more cards are put into an opponent's graveyard from anywhere",
    "a card was put into an opponent's graveyard from anywhere",
    "a card is put into opponents' graveyards from anywhere",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `(an?) (?:(non)?(${CARD_KINDS}) )?card is put into an opponent['’]s graveyard from anywhere${NOT_IN_WORD}(?!\\s+(?:and|or)\\b)`,
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
        opponentGraveyard: true,
        args: {},
        span,
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const MIND_FLAYARRRS_G8_TRIGGER_RULES = [TRIGGER_PUT_INTO_OPPONENT_GRAVEYARD];
