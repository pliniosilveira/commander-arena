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

const ANY_ID = 'trigger.put-into-any-graveyard';

/**
 * `trigger.put-into-any-graveyard`: "a land card is put into a graveyard from anywhere", "a card is put into a graveyard from anywhere" (Centaur Vinecrasher; CR 603.2: a card put into a
 * graveyard from another zone; CR 404.1: the graveyard of its owner, whoever that is; CR 400.7). The engine's `putIntoGraveyard` of `who` `any`, from anywhere (the battlefield too). A kind
 * of card is a filter on the card in the graveyard. Not read: your own or an opponent's graveyard, a zone other than "anywhere", "one or more", the past tense, more words after it.
 */
export const TRIGGER_PUT_INTO_ANY_GRAVEYARD = defineRule<IrTrigger>({
  id: ANY_ID,
  family: 'trigger',
  leading: ['a', 'an'],
  cites: ['CR 603.2 (Handling Triggered Abilities)', 'CR 404.1 (Graveyard)', 'CR 400.7 (Zones)'],
  examples: [
    'a land card is put into a graveyard from anywhere',
    'a card is put into a graveyard from anywhere',
    'a creature card is put into a graveyard from anywhere',
    'an artifact card is put into a graveyard from anywhere',
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
    'a land card is put into all graveyards from anywhere',
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
        subject: makeNoun(ANY_ID, span, 'a', filter),
        anyGraveyard: true,
        args: {},
        span,
        rule: ANY_ID,
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.this-exploits`: "~ exploits a creature" (CR 702.110b: a creature with exploit exploits a creature when its controller sacrifices a creature as its exploit ability resolves;
 * the rules text was not available to check the number). The engine's `exploits`, an ability of the creature itself. Not read: another creature ("another creature exploits a creature"),
 * a kind of creature ("exploits a Zombie"), no object ("exploits"), the past tense, a second event.
 */
export const TRIGGER_THIS_EXPLOITS = defineRule<IrTrigger>({
  id: 'trigger.this-exploits',
  family: 'trigger',
  leading: ['~'],
  cites: ['CR 702.110b (Exploit)'],
  examples: ['~ exploits a creature'],
  rejects: [
    '~ exploits',
    '~ exploits a Zombie',
    '~ exploits a creature or',
    '~ exploits a creature and',
    '~ exploited a creature',
    'another creature exploits a creature',
    'this creature exploits a creature',
    '~ exploits creatures',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/~ exploits a creature(?![\p{L}\p{N}])(?!\s+(?:or|and)(?![\p{L}\p{N}]))/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: { kind: 'trigger', event: 'exploits', args: {}, span, rule: 'trigger.this-exploits' },
      pos: r.pos,
    };
  },
});

export const MIND_FLAYARRRS_G8_TRIGGER_RULES = [
  TRIGGER_PUT_INTO_OPPONENT_GRAVEYARD,
  TRIGGER_PUT_INTO_ANY_GRAVEYARD,
  TRIGGER_THIS_EXPLOITS,
];
