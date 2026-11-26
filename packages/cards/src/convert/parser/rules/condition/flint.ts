/**
 * Conditions of the Flint deck (issue 685): "mana from a Treasure was spent to cast it" (Smaug, Wicked Worm; CR 601.2h, 106.1, 205.3i), the intervening "if" of a trigger about a
 * spell that was cast. "It" is the spell that caused the trigger; the lowering reads the condition there only (`ctx.castTrigger`).
 */
import { pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `condition.treasure-mana-spent`: "mana from a Treasure was spent to cast it" (CR 601.2h: the mana paid for the spell; CR 205.3i: Treasure is an artifact type; a copy of a spell was not
 * cast and has no mana spent on it, CR 707.10). The engine's `objectMatches` of the `triggerSubject` with `manaSpentFromSubtype` (Rain of Riches). Not read: another source ("from a
 * Food"), "at least", "that spell", the plural verb, "this spell", a phrase with no "it".
 */
export const CONDITION_TREASURE_MANA_SPENT = defineRule<IrCondition>({
  id: 'condition.treasure-mana-spent',
  family: 'condition',
  leading: ['mana'],
  cites: [
    'CR 601.2h (Casting Spells)',
    'CR 205.3i (Subtypes)',
    'CR 707.10 (Copying Objects)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: ['mana from a Treasure was spent to cast it'],
  rejects: [
    'mana from a Food was spent to cast it',
    'mana from a Treasure was spent to cast that spell',
    'mana from a Treasure was spent to cast this spell',
    'mana from a Treasure were spent to cast it',
    'mana from a Treasure was spent',
    'mana from a Treasure was spent to cast it.',
    'mana from two Treasures was spent to cast it',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/mana from a Treasure was spent to cast it(?![\p{L}\p{N}.])/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'manaSpentFromSubtype', subtype: 'Treasure' },
        span: { start: pos, end: r.pos },
        rule: 'condition.treasure-mana-spent',
      },
      pos: r.pos,
    };
  },
});

const DISCARD_KEYWORD_ID = 'condition.discarded-card-has-madness';

/**
 * `condition.discarded-card-has-madness`: "it has madness" (Anje Falkenrath; CR 603.4, 702.35a), the intervening "if" of a trigger about a card that was discarded. The card is the one the
 * discard was about, as it is where it went; the lowering makes it a part of the filter of that one trigger (`discarded` with `keywords`). Not read: another keyword, "it had madness", "that
 * card has madness", "if ~ has madness", a second condition.
 */
export const CONDITION_DISCARDED_CARD_HAS_MADNESS = defineRule<IrCondition>({
  id: DISCARD_KEYWORD_ID,
  family: 'condition',
  leading: ['it'],
  cites: ['CR 603.4 (Handling Triggered Abilities)', 'CR 702.35a (Madness)'],
  examples: ['it has madness'],
  rejects: [
    'it has flying',
    'it had madness',
    'that card has madness',
    'it has madness.',
    'it has madness and flying',
    '~ has madness',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/it has madness(?![\p{L}\p{N}.])(?! and\b)/iu)(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'discardedCardHasKeyword', keyword: 'madness' },
        span: { start: pos, end: r.pos },
        rule: DISCARD_KEYWORD_ID,
      },
      pos: r.pos,
    };
  },
});

export const FLINT_CONDITION_RULES = [
  CONDITION_TREASURE_MANA_SPENT,
  CONDITION_DISCARDED_CARD_HAS_MADNESS,
];
