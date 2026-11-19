/**
 * Effect rules of the Silverquill deck (Nils, Discipline Enforcer): "for each player, put a +1/+1 counter on up to one target creature that player controls".
 */
import { literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrCounterSpec, IrFilter, IrNoun } from '../../ir/types';
import { BOUNDARY, permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.add-counters-per-player`: "for each player, put a +1/+1 counter on up to one target creature that player controls" (CR 115.1, 601.2c, 603.3d: one slot with at most
 * one target controlled by each player, the controller of the ability included; CR 122.6: putting counters). The slot is the engine's "any number of targets with different
 * controllers" (`TargetSpec.differentControllers`), which is the same set of choices. "Up to one" only: a player who controls no creature could not be given a target otherwise.
 * Not read: another count of targets, another count of counters, "each opponent" (the `perOpponent` slot), a stated controller, a union of kinds.
 */
export const EFFECT_ADD_COUNTERS_PER_PLAYER = defineRule<Clauses>({
  id: 'effect.add-counters-per-player',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 603.3d (Handling Triggered Abilities)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    'for each player, put a +1/+1 counter on up to one target creature that player controls',
    'for each player, put a -1/-1 counter on up to one target creature that player controls',
    'for each player, put a +1/+1 counter on up to one target artifact that player controls',
  ],
  rejects: [
    'for each player, put a +1/+1 counter on target creature that player controls',
    'for each player, put a +1/+1 counter on up to two target creatures that player controls',
    'for each player, put two +1/+1 counters on up to one target creature that player controls',
    'for each player, put a +1/+1 counter on up to one target creature',
    'for each player, put a +1/+1 counter on up to one target creature you control',
    'for each player, put a +1/+1 counter on up to one target creature an opponent controls',
    'for each opponent, put a +1/+1 counter on up to one target creature that player controls',
    'for each player, put a +1/+1 counter on up to one target creature that player owns',
    'for each player, put a +1/+1 counter on up to one target creature that player controls and draw a card',
    'put a +1/+1 counter on up to one target creature that player controls',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.add-counters-per-player';
    const head = sequence(
      literal('for each player, put a '),
      map(
        spanned(pattern(/[+-]\d+\/[+-]\d+|[a-z]+/iu)),
        ({ value, span }): IrCounterSpec => ({
          kind: 'counterSpec',
          name: value[0].toLowerCase(),
          span,
          rule: id,
        }),
      ),
      pattern(/ counter on up to one target /iu),
    )(ctx, pos);
    if (!head.ok) return head;
    const [, counter] = head.value;
    const phrase = spanned(
      satisfy(
        map(permanentPhrase(false, 'all'), withoutZone),
        (filter: IrFilter) => filter.controller === undefined && filter.anyOf === undefined,
      ),
    )(ctx, head.pos);
    if (!phrase.ok) return phrase;
    const that = pattern(new RegExp(` that player controls${BOUNDARY}`, 'iu'))(ctx, phrase.pos);
    if (!that.ok) return that;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'target',
      filter: { ...phrase.value.value, zone: 'battlefield' },
      upTo: false,
      plural: true,
      other: false,
      anyNumber: true,
      differentControllers: true,
      span: { start: head.pos, end: that.pos },
      rule: id,
    };
    const span = { start: pos, end: that.pos };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'addCounters',
          {
            count: {
              kind: 'number',
              value: 1,
              span: {
                start: pos + 'for each player, put '.length,
                end: pos + 'for each player, put a'.length,
              },
            },
            counter,
            objects: noun,
          },
          span,
        ),
      ],
      pos: that.pos,
    };
  },
});

export const NILS_EFFECT_RULES = [EFFECT_ADD_COUNTERS_PER_PLAYER].map(quietly);
