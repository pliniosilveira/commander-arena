/**
 * Trigger rules of the Party Time deck, group "library": "Whenever one or more lands enter under an opponent's control without being played" (Deep Gnome Terramancer, CR 305.1,
 * 603.2c, 603.6a).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrFlag, IrTrigger } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { makeNoun } from './subjects';

const ID = 'trigger.lands-enter-opponent-not-played';

/**
 * `trigger.lands-enter-opponent-not-played`: "one or more lands enter under an opponent's control without being played" (CR 305.1: a land is played, not cast, by a land play; a land
 * put onto the battlefield by an effect is not played; CR 603.2c: the ability triggers once for the lands that enter together). The engine's `entersBatch` of lands an opponent of the
 * controller controls, with `notPlayed`. Not read: your own lands, "a land", "played", other cards, a duration, more words after it.
 */
export const TRIGGER_LANDS_ENTER_OPPONENT_NOT_PLAYED = defineRule<IrTrigger>({
  id: ID,
  family: 'trigger',
  leading: ['one'],
  cites: [
    'CR 305.1 (Lands)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 603.6a (Handling Triggered Abilities)',
  ],
  examples: ["one or more lands enter under an opponent's control without being played"],
  rejects: [
    "one or more lands enter under an opponent's control",
    'one or more lands enter under your control without being played',
    "one or more lands enter under an opponent's control without being played or",
    "one or more creatures enter under an opponent's control without being played",
    "one or more lands enters under an opponent's control without being played",
    "a land enters under an opponent's control without being played",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('one or more '),
      spanned(literal('lands')),
      pattern(
        / enter under an opponent['’]s control without being played(?![\p{L}\p{N}])(?!\s+(?:or|and)(?![\p{L}\p{N}]))/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, lands] = r.value;
    const flag: IrFlag = { kind: 'flag', value: true, span: lands.span, rule: ID };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'entersBatch',
        subject: {
          ...makeNoun(ID, lands.span, 'a', {
            types: ['land'],
            controller: 'opponent',
            raw: 'lands',
          }),
          plural: true,
        },
        args: { notPlayed: flag },
        span: { start: pos, end: r.pos },
        rule: ID,
      },
      pos: r.pos,
    };
  },
});

export const PARTY_TIME_LIBRARY_TRIGGER_RULES = [TRIGGER_LANDS_ENTER_OPPONENT_NOT_PLAYED].map(
  quietly,
);
