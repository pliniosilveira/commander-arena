/**
 * Condition of Twilight Diviner (Meren deck): "they entered or were cast from a graveyard" (CR 603.4, 603.6a, 601.2a), the intervening "if" of a trigger about one or more permanents that
 * enter. It is read after the "if" of the segmenter's intervening "if", and the lowering of the trigger turns it into a part of the engine's `entersBatch` trigger (`fromGraveyard`): which
 * permanents are in the batch is read as they enter, from the zone each came from.
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule } from '../registry';

const ID = 'condition.entered-from-graveyard';

/**
 * `condition.entered-from-graveyard`: "they entered or were cast from a graveyard" (CR 603.4: the zone a permanent entered from, or the zone its spell was cast from, is a fact of the event).
 * Only the whole phrase, about "they". Not read: "it entered ...", a graveyard that is not any ("your graveyard"), only one of the two ("they entered from a graveyard"), another zone.
 */
export const CONDITION_ENTERED_FROM_GRAVEYARD = defineRule<IrCondition>({
  id: ID,
  family: 'condition',
  leading: ['they'],
  cites: [
    'CR 603.4 (Handling Triggered Abilities)',
    'CR 603.6a (Handling Triggered Abilities)',
    'CR 601.2a (Casting Spells)',
  ],
  examples: [
    'they entered or were cast from a graveyard',
    'They entered or were cast from a graveyard',
  ],
  rejects: [
    'it entered or was cast from a graveyard',
    'they entered from a graveyard',
    'they were cast from a graveyard',
    'they entered or were cast from your graveyard',
    'they entered or were cast from exile',
    'they entered or were cast from a hand',
    'they entered or were cast from a graveyard or',
    'they enter or are cast from a graveyard',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(`they entered or were cast from a graveyard${BOUNDARY}(?! or\\b)`, 'iu'),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'enteredFromGraveyard' },
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const ENTERED_FROM_GRAVEYARD_CONDITION_RULES = [CONDITION_ENTERED_FROM_GRAVEYARD];
