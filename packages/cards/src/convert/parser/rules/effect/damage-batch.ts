/**
 * Effect rule of the Multiverse Reforged deck (issue 81, Tamiyo, Upriser Crowned): what a trigger about a batch of combat damage does to the creatures that dealt it.
 */
import { pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.tap-and-stun-those-creatures';

/**
 * `effect.tap-and-stun-those-creatures`: "tap those creatures and put a stun counter on each of them" (CR 603.2c, 701.26a, 122.1d, 400.7: the creatures that dealt the combat damage of the
 * trigger, as long as they are still the same permanents). Two clauses, the tap and the counters, which the lowering reads in the effect of a combat damage batch trigger only and
 * refuses anywhere else: "those creatures" means the creatures of the group the trigger names. Not read: another counter, another group, one of the two.
 */
export const EFFECT_TAP_AND_STUN_THOSE_CREATURES = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['tap'],
  cites: [
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 701.26a (Tap and Untap)',
    'CR 122.1d (Counters)',
  ],
  examples: ['tap those creatures and put a stun counter on each of them'],
  rejects: [
    'tap those creatures',
    'tap those creatures and put a +1/+1 counter on each of them',
    'tap those creatures and put a stun counter on each creature',
    'tap those creatures and put two stun counters on each of them',
    'tap those creatures, then put a stun counter on each of them',
    'tap those permanents and put a stun counter on each of them',
    'tap that creature and put a stun counter on it',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /tap those creatures and put a stun counter on each of them(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        makeClause(ID, 'tapTriggerSources', {}, span),
        makeClause(ID, 'stunTriggerSources', {}, span),
      ],
      pos: r.pos,
    };
  },
});

export const DAMAGE_BATCH_EFFECT_RULES = [EFFECT_TAP_AND_STUN_THOSE_CREATURES];
