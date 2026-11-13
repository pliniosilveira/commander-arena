/**
 * Trigger rules of the Hashaton deck, group 1 (D-1102): "whenever you cycle or discard another card". A card is cycled by discarding it to pay the
 * cost of its cycling ability (CR 702.29a), so cycling is discarding and the engine's `discarded` event is "cycle or discard"; the ability triggers
 * only once when a card is cycled (CR 702.29d).
 */
import { choice, literal, map, pattern, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { makeNoun, youNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.cycled-or-discarded`: "you cycle or discard a card", "you cycle or discard another card" (CR 702.29a, 702.29d, 701.9a, 603.2: once for each
 * card, however it is discarded). "Another" leaves out the card with the ability itself. The card is "that card" of the ability, in the graveyard it
 * went to. Not read: a card of a kind ("a creature card"), "one or more cards", the past tense, "cycle this card" (`trigger.cycled`), and another
 * player ("an opponent cycles or discards a card").
 */
export const TRIGGER_CYCLED_OR_DISCARDED = defineRule<IrTrigger>({
  id: 'trigger.cycled-or-discarded',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 702.29a (Cycling)',
    'CR 702.29d (Cycling)',
    'CR 701.9a (Discard)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: ['you cycle or discard a card', 'you cycle or discard another card'],
  rejects: [
    'you cycle or discard cards',
    'you cycle or discard one or more cards',
    'you cycle or discard a creature card',
    'you cycle or discard another creature card',
    'you cycled or discarded a card',
    'you cycle or discards a card',
    'you cycle or discard this card',
    'you cycle or discard another',
    'you cycle or discard a card or draw a card',
    'you discard another card',
    'you cycle another card',
    'an opponent cycles or discards a card',
    'you cycle or exile another card',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      youNoun('trigger.cycled-or-discarded'),
      literal(' cycle or discard '),
      spanned(
        choice(
          map(pattern(new RegExp(`another card${NOT_IN_WORD}`, 'iu')), () => true as const),
          map(pattern(new RegExp(`a card${NOT_IN_WORD}`, 'iu')), () => false as const),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, , card] = r.value;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'discarded',
        actor,
        // The card discarded is what "that card" of the ability means (CR 701.9a): the engine's `triggerSubject`.
        subject: makeNoun('trigger.cycled-or-discarded', card.span, 'a', { raw: 'card' }),
        ...(card.value ? { another: true as const } : {}),
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.cycled-or-discarded',
      },
      pos: r.pos,
    };
  },
});

export const HASHATON_G1_TRIGGER_RULES = [TRIGGER_CYCLED_OR_DISCARDED];
