/**
 * Trigger rules of the Death Toll deck, group B: "Whenever a land card is put into your graveyard from anywhere" and "Whenever one or more land cards are put into your graveyard
 * from anywhere for the first time each turn" (CR 603.2, 603.2c, 404.1, 400.7). Each says what the text says; what the engine can run is the lowering's business
 * (`lower/triggers.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrFilter, IrTrigger } from '../../ir/types';
import { defineRule } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';
const CARD_KINDS = 'artifact|battle|creature|enchantment|land|planeswalker|instant|sorcery';

/** The filter of "a land card", "a nonland card", "a card" (no kind) from the words that matched, or null when the article does not agree with the next word. */
function cardFilter(
  article: string | undefined,
  non: string | undefined,
  kind: string | undefined,
): IrFilter | null {
  const word = (non ?? '') + (kind ?? '');
  if (article !== undefined) {
    const vowel = /^[aeiou]/iu.test(word === '' ? 'card' : word);
    if (article.toLowerCase() === 'an' ? !vowel : vowel) return null;
  }
  const raw = `${word === '' ? '' : `${non === undefined ? '' : 'non'}${kind ?? ''} `}card`;
  return kind === undefined
    ? { raw }
    : non === undefined
      ? { types: [kind.toLowerCase()], raw }
      : { notTypes: [kind.toLowerCase()], raw };
}

function trigger(
  pos: number,
  end: number,
  filter: IrFilter,
  from: string,
  batch: boolean,
  firstEachTurn: boolean,
): IrTrigger {
  const span = { start: pos, end };
  return {
    kind: 'trigger',
    event: 'putIntoGraveyard',
    subject: makeNoun('trigger.put-into-graveyard', span, 'a', filter),
    ...(batch ? { batch: true as const } : {}),
    ...(firstEachTurn ? { firstEachTurn: true as const } : {}),
    ...(from.toLowerCase() === 'your library' ? { fromLibrary: true as const } : {}),
    args: {},
    span,
    rule: 'trigger.put-into-graveyard',
  };
}

/**
 * `trigger.put-into-graveyard`: "a land card is put into your graveyard from anywhere", "one or more land cards are put into your graveyard from anywhere for the first time each turn",
 * "one or more cards are put into your graveyard from your library" (CR 603.2: a card put into a graveyard from another zone; CR 603.2c: "one or more" is one trigger for the cards put
 * there together; CR 404.1: the graveyard of its owner; CR 400.7). The engine's `putIntoGraveyard`. A kind of card (a land card, a nonland card) is a filter on the card in the graveyard.
 * Not read: another player's graveyard, a zone other than "anywhere" or "your library", a card of two kinds, a number of cards, the past tense, "for the first time each turn" with one card.
 */
export const TRIGGER_PUT_INTO_GRAVEYARD = defineRule<IrTrigger>({
  id: 'trigger.put-into-graveyard',
  family: 'trigger',
  leading: ['a', 'an', 'one'],
  cites: [
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 404.1 (Graveyard)',
    'CR 400.7 (Zones)',
  ],
  examples: [
    'a land card is put into your graveyard from anywhere',
    'a creature card is put into your graveyard from anywhere',
    'an artifact card is put into your graveyard from anywhere',
    'a nonland card is put into your graveyard from anywhere',
    'a card is put into your graveyard from your library',
    'one or more land cards are put into your graveyard from anywhere for the first time each turn',
    'one or more cards are put into your graveyard from your library',
    'one or more creature cards are put into your graveyard from anywhere',
  ],
  rejects: [
    'a land card is put into your graveyard',
    'a land card is put into a graveyard from anywhere',
    "a land card is put into an opponent's graveyard from anywhere",
    'a land card is put into your graveyard from your hand',
    'a land card is put into your graveyard from anywhere for the first time each turn',
    'a land cards is put into your graveyard from anywhere',
    'a artifact card is put into your graveyard from anywhere',
    'an land card is put into your graveyard from anywhere',
    'one or more land cards is put into your graveyard from anywhere',
    'one or more land card are put into your graveyard from anywhere',
    'one or more land cards are put into your graveyard',
    'one or more land or creature cards are put into your graveyard from anywhere',
    'two or more land cards are put into your graveyard from anywhere',
    'one or more land cards were put into your graveyard from anywhere',
    'a land card is put into your graveyard from anywhere and',
    'a land card is put into your graveyard from anywhere or',
  ],
  parse: (ctx, pos) => {
    const one = pattern(
      new RegExp(
        `(an?) (?:(non)?(${CARD_KINDS}) )?card is put into your graveyard from (anywhere|your library)${NOT_IN_WORD}(?!\\s+(?:and|or|for)\\b)`,
        'iu',
      ),
    )(ctx, pos);
    if (one.ok) {
      const [, article, non, kind, from] = one.value;
      const filter = cardFilter(article, non, kind);
      if (filter === null) return fail(ctx, pos);
      return {
        ok: true,
        value: trigger(pos, one.pos, filter, from ?? '', false, false),
        pos: one.pos,
      };
    }
    const many = pattern(
      new RegExp(
        `one or more (?:(non)?(${CARD_KINDS}) )?cards are put into your graveyard from (anywhere|your library)( for the first time each turn)?${NOT_IN_WORD}(?!\\s+(?:and|or)\\b)`,
        'iu',
      ),
    )(ctx, pos);
    if (!many.ok) return many;
    const [, non, kind, from, first] = many.value;
    const filter = cardFilter(undefined, non, kind);
    if (filter === null) return fail(ctx, pos);
    return {
      ok: true,
      value: trigger(pos, many.pos, filter, from ?? '', true, first !== undefined),
      pos: many.pos,
    };
  },
});

export const DEATH_TOLL_B_TRIGGER_RULES = [TRIGGER_PUT_INTO_GRAVEYARD];
