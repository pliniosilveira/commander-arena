/**
 * Trigger rules of the Vraska deck (stage P49, D-206): "whenever one or more other creatures and/or artifacts you control die" (a batch of deaths,
 * CR 603.10a, 603.2c) and "whenever you discard a card" (CR 701.9a). Each says what the text says; what the engine can run is the lowering's business
 * (`lower/triggers.ts`).
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  sequence,
} from '../../combinators';
import type { IrFilter, IrNoun, IrTrigger } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { makeNoun, youNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.dies-batch`: "one or more other creatures and/or artifacts you control die", "one or more creatures you control die" (CR 603.10a,
 * 603.2c, 700.4: the permanents that die together are one event, and the ability triggers once for them). The permanents are a plural group of the
 * controller's (the engine's `diesBatch`, with the filter of the group as they were on the battlefield). "Dies" for one permanent is `trigger.dies`.
 */
export const TRIGGER_DIES_BATCH = defineRule<IrTrigger>({
  id: 'trigger.dies-batch',
  family: 'trigger',
  leading: ['one'],
  cites: [
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 700.4 (General)',
  ],
  examples: [
    'one or more other creatures and/or artifacts you control die',
    'one or more creatures you control die',
    'one or more other creatures you control die',
    'one or more artifacts you control die',
  ],
  rejects: [
    'one or more creatures die',
    'one or more creatures you control dies',
    'one or more creature you control die',
    'one or more creatures an opponent controls die',
    'one or more creatures you control die or',
    'one or more creatures you control deal combat damage to a player',
    'one or more creatures you control leave the battlefield',
    'two or more creatures you control die',
    'a creature you control dies',
  ],
  parse: (ctx, pos) => {
    // Quiet: "one or more creatures you control deal combat damage to a player" is another rule's, and stops where it always did.
    const r = quiet(
      sequence(
        literal('one or more '),
        optional(literal('other '), null),
        spanned(map(permanentPhrase(true, 'all'), withoutZone)),
        pattern(new RegExp(` die${NOT_IN_WORD}`, 'iu')),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, other, group] = r.value;
    if (group.value.controller !== 'you') return fail(ctx, pos);
    const subject: IrNoun = {
      ...makeNoun('trigger.dies-batch', group.span, 'a', group.value),
      plural: true,
      other: other !== null,
    };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'diesBatch',
        subject,
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.dies-batch',
      },
      pos: r.pos,
    };
  },
});

const CARD_KINDS = 'artifact|battle|creature|enchantment|land|planeswalker|instant|sorcery';

/**
 * "a card", "a creature card", "an artifact card", "a nonland card": the card a discard names (CR 701.9a, 205.2: a card has the types of its card kind). One kind, or one kind
 * left out ("non" and the kind); the article agrees with the next word as English has it, so "an creature card" and "a artifact card" are not read. The filter has no zone: the
 * card is read where it went.
 */
const DISCARDED_CARD: Parser<{ filter: IrFilter }> = (ctx, pos) => {
  const r = pattern(new RegExp(`(an?) (?:(non)?(${CARD_KINDS}) )?card${NOT_IN_WORD}`, 'iu'))(
    ctx,
    pos,
  );
  if (!r.ok) return r;
  const [whole, article, non, kind] = r.value;
  const word = (non ?? '') + (kind ?? '');
  const vowel = /^[aeiou]/iu.test(word === '' ? 'card' : word);
  if ((article ?? '').toLowerCase() === 'an' ? !vowel : vowel) return fail(ctx, pos);
  const raw = whole.slice(whole.indexOf(' ') + 1);
  const filter: IrFilter =
    kind === undefined
      ? { raw }
      : non === undefined
        ? { types: [kind.toLowerCase()], raw }
        : { notTypes: [kind.toLowerCase()], raw };
  return { ok: true, value: { filter }, pos: r.pos };
};

/**
 * `trigger.discarded`: "you discard a card", "you discard a creature card", "an opponent discards a card", "a player discards a card" (CR 701.9a, 603.2: once for each card,
 * however it is discarded). The card is "that card" of the ability (in the graveyard it went to, or in exile for madness); a kind of card (a creature card, a nonland card) is a
 * filter on it (Hashaton, Scarab's Fist; D-383, provisional number). Not read: "one or more cards", "your first card each turn", a card of two kinds, the past tense.
 */
export const TRIGGER_DISCARDED = defineRule<IrTrigger>({
  id: 'trigger.discarded',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 701.9a (Discard)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: [
    'you discard a card',
    'an opponent discards a card',
    'a player discards a card',
    'you discard a creature card',
    'you discard a land card',
    'you discard an artifact card',
    'you discard a nonland card',
    'a player discards an instant card',
  ],
  rejects: [
    'you discard cards',
    'you discard one or more cards',
    'you discard creature cards',
    'you discard a creature or land card',
    'you discard a Zombie card',
    'you discard an creature card',
    'you discard a artifact card',
    'you discard a nonlandcard',
    'you discard your first card each turn',
    'you discarded a card',
    'an opponent discard a card',
    'each opponent discards a card',
    'you discard two cards',
    'you discard a card or draw a card',
  ],
  parse: (ctx, pos) => {
    const who = choice(
      map(sequence(youNoun('trigger.discarded'), literal(' discard ')), ([actor]) => actor),
      map(spanned(literal('an opponent discards ')), ({ span }) =>
        makeNoun(
          'trigger.discarded',
          { start: span.start, end: span.start + 'an opponent'.length },
          'eachOpponent',
          { raw: 'an opponent' },
        ),
      ),
      map(spanned(literal('a player discards ')), ({ span }) =>
        makeNoun(
          'trigger.discarded',
          { start: span.start, end: span.start + 'a player'.length },
          'eachPlayer',
          { raw: 'a player' },
        ),
      ),
    );
    const r = sequence(who, spanned(DISCARDED_CARD))(ctx, pos);
    if (!r.ok) return r;
    const [actor, card] = r.value;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'discarded',
        actor,
        // The card discarded is what "that card" of the ability means (CR 701.9a): the engine's `triggerSubject`.
        subject: makeNoun('trigger.discarded', card.span, 'a', card.value.filter),
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.discarded',
      },
      pos: r.pos,
    };
  },
});

export const VRASKA_TRIGGER_RULES = [TRIGGER_DIES_BATCH, TRIGGER_DISCARDED];
