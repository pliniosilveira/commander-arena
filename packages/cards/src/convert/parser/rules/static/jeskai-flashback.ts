/**
 * Static rule of the cards that give the instants and sorceries of a graveyard flashback: "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to
 * that card's mana cost." (CR 702.34a, 118.9, 613.1f, 604.3).
 */
import { literal, pattern, quiet, sequence } from '../../combinators';
import type { IrStatic } from '../../ir/types';
import { FLASHBACK_CARDS } from '../effect/jeskai-flashback';
import { defineRule } from '../registry';

const RULE = 'static.graveyard-cards-have-flashback';

/**
 * `static.graveyard-cards-have-flashback`: "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost." The instant and sorcery
 * cards in the graveyard of the controller of the permanent have flashback (CR 702.34a), with the cost equal to the card's mana cost (CR 118.9: an alternative cost), for as long as the
 * permanent is on the battlefield (CR 604.3, 613.1f). The two sentences are one statement: the second says what the first gives, in the words the card prints. The engine's
 * `grantFlashbackToGraveyardCards`. Not read: another graveyard, another cost ("equal to its mana cost" of the cards of an opponent's graveyard is the same words with another
 * graveyard), a quality of the cards ("with mana value 3 or less"), another kind of card, the first sentence alone.
 */
export const STATIC_GRAVEYARD_CARDS_HAVE_FLASHBACK = defineRule<IrStatic>({
  id: RULE,
  family: 'static',
  leading: ['each'],
  cites: [
    'CR 702.34a (Flashback)',
    'CR 118.9 (Alternative Costs)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 604.3 (Handling Static Abilities)',
  ],
  examples: [
    "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost.",
    'Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card’s mana cost.',
    "Each sorcery and instant card in your graveyard has flashback. The flashback cost is equal to that card's mana cost.",
  ],
  rejects: [
    "Each instant card in your graveyard has flashback. The flashback cost is equal to that card's mana cost.",
    'Each instant and sorcery card in your graveyard has flashback.',
    "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost",
    "Each instant and sorcery card in a graveyard has flashback. The flashback cost is equal to that card's mana cost.",
    "Each instant and sorcery card in your opponents' graveyards has flashback. The flashback cost is equal to that card's mana cost.",
    "Each creature card in your graveyard has flashback. The flashback cost is equal to that card's mana cost.",
    "Each instant or sorcery card in your graveyard has flashback. The flashback cost is equal to that card's mana cost.",
    'Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to {2}.',
    "Each instant and sorcery card in your graveyard has flashback. The flashback cost is equal to that card's converted mana cost.",
    "Each instant and sorcery card in your graveyard has flashback until end of turn. The flashback cost is equal to that card's mana cost.",
    "Each instant and sorcery card in your hand has flashback. The flashback cost is equal to that card's mana cost.",
    "Each instant and sorcery card in your graveyard has flashback and flying. The flashback cost is equal to that card's mana cost.",
  ],
  parse: (ctx, pos) => {
    // The words up to the keyword decide whether this is the statement at all ("Each opponent can't draw ..." never was): their failure is no trace in the diagnostics.
    const lead = sequence(
      quiet(sequence(literal('each '), FLASHBACK_CARDS)),
      pattern(/ has flashback\. the flashback cost is equal to that card['’]s mana cost\./iu),
    )(ctx, pos);
    if (!lead.ok) return lead;
    const [[, cards]] = lead.value;
    const rule = RULE;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: {
          kind: 'noun',
          det: 'you',
          filter: { raw: 'You' },
          upTo: false,
          plural: false,
          other: false,
          span: { start: pos, end: pos + 4 },
          rule,
        },
        effects: [{ kind: 'graveyardFlashback', cards }],
        span: { start: pos, end: lead.pos },
        rule,
      },
      pos: lead.pos,
    };
  },
});

export const JESKAI_FLASHBACK_STATIC_RULES = [STATIC_GRAVEYARD_CARDS_HAVE_FLASHBACK];
