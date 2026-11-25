/**
 * Trigger rule of the Mind Flayarrrs deck, group 4: "whenever a player mills one or more creature cards" (Zellix, Sanity Flayer; CR 701.17a, 603.2c). Says what the text says; what
 * the engine can run is the lowering's business (`lower/triggers.ts`).
 */
import { fail, pattern } from '../../combinators';
import type { IrFilter, IrTrigger } from '../../ir/types';
import { defineRule } from '../registry';
import { makeNoun } from './subjects';

const CARD_KINDS = 'artifact|battle|creature|enchantment|land|planeswalker|instant|sorcery';

/**
 * `trigger.milled`: "you mill one or more cards", "a player mills one or more creature cards", "an opponent mills one or more nonland cards" (CR 701.17a, 603.2c: the cards one
 * player mills in one instruction are one event, and the ability triggers once however many). A kind of card is a filter on the cards milled: at least one of them must match. Not
 * read: "a card" (each card would trigger on its own, which the engine does not count), a card of two kinds, the past tense, a number of cards, "one or more" with no cards.
 */
export const TRIGGER_MILLED = defineRule<IrTrigger>({
  id: 'trigger.milled',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: ['CR 701.17a (Mill)', 'CR 603.2c (Handling Triggered Abilities)'],
  examples: [
    'you mill one or more cards',
    'a player mills one or more creature cards',
    'an opponent mills one or more nonland cards',
    'a player mills one or more cards',
  ],
  rejects: [
    'a player mills a card',
    'a player mills a creature card',
    'a player mills two cards',
    'a player mills one or more',
    'a player mills one or more creature or land cards',
    'a player mills one or more Zombie cards',
    'a player milled one or more cards',
    'a player mill one or more cards',
    'you mills one or more cards',
    'each opponent mills one or more cards',
    'a player mills one or more card',
    'a player mills one or more cards or',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.milled';
    const r = pattern(
      new RegExp(
        `(you mill|an opponent mills|a player mills) one or more (?:(non)?(${CARD_KINDS}) )?cards(?![\\p{L}\\p{N}])`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (/^ (?:or|and)\b|^,/iu.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const [whole, who, non, kind] = r.value;
    const subject = (who ?? '').toLowerCase();
    const det =
      subject === 'you mill' ? 'you' : subject === 'a player mills' ? 'eachPlayer' : 'eachOpponent';
    const raw = (whole ?? '').slice((whole ?? '').indexOf('one or more ') + 'one or more '.length);
    const filter: IrFilter =
      kind === undefined
        ? { raw }
        : non === undefined
          ? { types: [kind.toLowerCase()], raw }
          : { notTypes: [kind.toLowerCase()], raw };
    const actorWords = subject.slice(0, subject.lastIndexOf(' '));
    const actor = makeNoun(id, { start: pos, end: pos + actorWords.length }, det, {
      raw: actorWords,
    });
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'milled',
        actor,
        subject: makeNoun(id, { start: pos, end: r.pos }, 'a', filter),
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const MILL_TRIGGER_RULES = [TRIGGER_MILLED];
