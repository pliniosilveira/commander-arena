/**
 * Trigger rules of the Flint deck (issue 685): "you play a card from exile" (Prosper, Tome-Bound; CR 305.1, 601.2a, 603.2). What the engine can run is the lowering's business
 * (`lower/triggers.ts`).
 */
import { pattern } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.play-card-from-exile';

/**
 * `trigger.play-card-from-exile`: "you play a card from exile" (CR 305.1, 601.2a, 603.2: to play a card is to play it as a land or to cast it as a spell, so a land played from exile or a
 * spell cast from exile, by the controller). The engine's `playsCard` with `fromExile`, which is the trigger of `trigger.play-land-or-cast-spell-from-exile` too. Not read: another player,
 * the past tense, "a land" or "a spell" alone, another zone, cards of one kind, "a card from exile or".
 */
export const TRIGGER_PLAY_CARD_FROM_EXILE = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 305.1 (Lands)',
    'CR 601.2a (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
  ],
  examples: ['you play a card from exile'],
  rejects: [
    'you play a land from exile',
    'you cast a spell from exile',
    'an opponent plays a card from exile',
    'you played a card from exile',
    'you play a card from your graveyard',
    'you play a card from exile or',
    'you play a creature card from exile',
    'you play a card',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/you play a card from exile(?![\p{L}\p{N}])(?! or\b)/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'playsCard',
        actor: makeNoun(ID, { start: pos, end: pos + 3 }, 'you', { raw: 'you' }),
        fromExile: true,
        args: {},
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const FLINT_TRIGGER_RULES = [TRIGGER_PLAY_CARD_FROM_EXILE].map(quietly);
