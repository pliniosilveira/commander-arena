/**
 * Effect rule of the Quandrix Unlimited deck, group F: "You may cast spells this turn as though they had flash." (Alchemist's Refuge).
 */
import { pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.cast-as-though-flash`: "cast spells this turn as though they had flash" (CR 601.3b, 702.8a, 611.2, 514.2), the instruction of "You may cast spells this turn as
 * though they had flash.": the controller may cast any spell at the timing of an instant until end of turn, and the spells get no
 * flash keyword. The engine's `grantCastAsThoughFlash` of "you". Not read: a kind of spell ("creature spells"), another player, a longer duration, "it", "a spell".
 */
export const EFFECT_CAST_AS_THOUGH_FLASH = defineRule<Clauses>({
  id: 'effect.cast-as-though-flash',
  family: 'effect',
  leading: ['cast', 'you'],
  cites: [
    'CR 601.3b (Casting Spells)',
    'CR 702.8a (Flash)',
    'CR 611.2 (Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    'cast spells this turn as though they had flash',
    'you may cast spells this turn as though they had flash',
  ],
  rejects: [
    'cast spells this turn as though they had flash.',
    'you cast spells this turn as though they had flash',
    'you may cast creature spells this turn as though they had flash',
    'cast creature spells this turn as though they had flash',
    'cast spells as though they had flash',
    'cast spells until end of turn as though they had flash',
    'cast spells this turn as though they have flash',
    'cast a spell this turn as though it had flash',
    'cast spells this turn as though they had flash and draw a card',
    'cast spells this turn as though they had haste',
    'cast spells from your graveyard this turn as though they had flash',
    'cast spells this turn as though they had flash if you control a creature',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/(?:you may )?cast spells this turn as though they had flash(?=\.|$)/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.cast-as-though-flash',
          'castAsThoughFlash',
          {},
          {
            start: pos,
            end: r.pos,
          },
        ),
      ],
      pos: r.pos,
    };
  },
});

export const FLASH_PERMISSION_EFFECT_RULES = [EFFECT_CAST_AS_THOUGH_FLASH];
