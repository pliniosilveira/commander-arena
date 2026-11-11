/**
 * Noun rules of the Angel of Serenity group (the Bruna deck, D-931): a target phrase whose targets are in two zones.
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, spanned } from '../registry';

/**
 * `noun.target-creatures-battlefield-or-graveyard`: "up to three other target creatures from the battlefield and/or creature cards from graveyards" (CR 115.1, 115.2,
 * 601.2c, 404.1): one target slot whose targets are creatures on the battlefield or creature cards in the graveyard of any player, at most the number said and none
 * needed ("up to"); "other" leaves out the permanent the ability is on. The engine's target of two zones (`objectOrGraveyardCard`), which only `exile` takes (a card of
 * a graveyard is not a permanent: every other verb would have to say what it does to one). Not read: a count that is not "up to" two or more, one creature, any other
 * type than creatures, "or" for "and/or", a graveyard that is "a", "your", "an opponent's" or "all", or words that go on after "graveyards".
 */
export const NOUN_TARGET_CREATURES_BATTLEFIELD_OR_GRAVEYARD = defineRule<IrNoun>({
  id: 'noun.target-creatures-battlefield-or-graveyard',
  family: 'noun',
  leading: ['up'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 115.2 (Targets)',
    'CR 404.1 (Graveyard)',
    'CR 601.2c (Casting Spells)',
  ],
  examples: [
    'up to three other target creatures from the battlefield and/or creature cards from graveyards',
    // SYNTHETIC siblings: another count, and no "other" (the source may be one of the targets).
    'up to two other target creatures from the battlefield and/or creature cards from graveyards',
    'up to two target creatures from the battlefield and/or creature cards from graveyards',
  ],
  rejects: [
    // A count that is not "up to" two or more.
    'three other target creatures from the battlefield and/or creature cards from graveyards',
    'up to one other target creature from the battlefield and/or creature card from a graveyard',
    'up to one other target creatures from the battlefield and/or creature cards from graveyards',
    'up to zero other target creatures from the battlefield and/or creature cards from graveyards',
    'other target creatures from the battlefield and/or creature cards from graveyards',
    // The second half is another graveyard, another card type or another zone.
    'up to three other target creatures from the battlefield and/or creature cards from a graveyard',
    'up to three other target creatures from the battlefield and/or creature cards from your graveyard',
    "up to three other target creatures from the battlefield and/or creature cards from an opponent's graveyard",
    'up to three other target creatures from the battlefield and/or creature cards from all graveyards',
    'up to three other target creatures from the battlefield and/or creature cards from exile',
    'up to three other target creatures from the battlefield and/or cards from graveyards',
    'up to three other target creatures from the battlefield and/or artifact cards from graveyards',
    'up to three other target artifacts from the battlefield and/or artifact cards from graveyards',
    'up to three other target permanents from the battlefield and/or permanent cards from graveyards',
    // "or" is another sentence, and a half of its own is another kind of target.
    'up to three other target creatures from the battlefield or creature cards from graveyards',
    'up to three other target creatures on the battlefield and/or creature cards from graveyards',
    'up to three other target creatures you control from the battlefield and/or creature cards from graveyards',
    'up to three other target creatures and/or creature cards from graveyards',
    'up to three other target creatures from the battlefield',
    'up to three other target creature cards from graveyards',
    // Words after the phrase are not part of it.
    'up to three other target creatures from the battlefield and/or creature cards from graveyards you control',
  ],
  parse: (ctx, pos) => {
    const head = sequence(
      literal('up to '),
      spanned(satisfy(quantity, (n) => n >= 2)),
      pattern(
        /(?: (other))? target creatures from the battlefield and\/or creature cards from graveyards(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!head.ok) return head;
    const [, count, tail] = head.value;
    const raw = ctx.text.slice(pos, head.pos);
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'target',
        filter: { zone: 'battlefield', types: ['creature'], raw },
        orCard: { zone: 'graveyard', types: ['creature'], card: true, raw },
        count: { kind: 'number', value: count.value, span: count.span },
        upTo: true,
        plural: true,
        other: (tail[1] ?? '') !== '',
        span: { start: pos, end: head.pos },
        rule: 'noun.target-creatures-battlefield-or-graveyard',
      },
      pos: head.pos,
    };
  },
});

export const CROSS_ZONE_NOUN_RULES = [NOUN_TARGET_CREATURES_BATTLEFIELD_OR_GRAVEYARD];
