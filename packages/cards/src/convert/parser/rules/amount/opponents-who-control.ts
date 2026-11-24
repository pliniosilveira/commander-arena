/**
 * Amounts of the opponents who control a permanent of a kind (Counter Blitz deck, group C; Summon: Yojimbo): "the number of opponents who control a creature with power 4 or greater",
 * "for each opponent who controls a creature". The engine's `playerCount` of an `eachPlayerControlling` selector with `opponentsOnly` (CR 102.2, 109.4, 608.2c).
 */
import { fail, literal, map, type Parser, pattern, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';

/** The kind of permanent after "who control(s) ": the one `noun.a-permanent` reads, with no count, no "another" and no controller of its own. */
const KIND: Parser<IrNoun> = (ctx, pos) => {
  const r = family<IrNoun>('noun', { only: ['noun.a-permanent'] })(ctx, pos);
  if (!r.ok) return r;
  const of = r.value;
  if (of.other || of.count !== undefined || of.filter.controller !== undefined) {
    return fail(ctx, pos);
  }
  return r;
};

function opponentsControlling(head: RegExp, verb: string, id: string): Parser<IrAmount> {
  return (ctx, pos) => {
    const r = spanned(
      sequence(
        pattern(head),
        literal(`${verb} `),
        map(KIND, (of) => of),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const of = r.value.value[2];
    const span = r.value.span;
    const noun: IrNoun = {
      kind: 'noun',
      det: 'eachPlayerControlling',
      filter: { raw: ctx.text.slice(span.start, span.end) },
      upTo: false,
      plural: true,
      other: false,
      whoGroup: 'eachOpponent',
      of,
      span,
      rule: id,
    };
    return { ok: true, value: { kind: 'playerCount', of: noun, span }, pos: r.pos };
  };
}

/**
 * "the number of opponents who control a creature with power 4 or greater" (CR 102.2, 109.4, 608.2c; Summon: Yojimbo, chapter IV): the opponents still in the game with a battlefield
 * permanent of the kind, counted as the instruction runs. Read as a value of `amount.where-x` and `amount.equal-to`. Not read: "the number of players who control" (the controller is
 * one), a count of two or more or "another" in the kind, a kind that names a controller.
 */
export const NUMBER_OF_OPPONENTS_WHO_CONTROL: Parser<IrAmount> = opponentsControlling(
  /the number of opponents who(?= )/iu,
  ' control',
  'amount.number-of-opponents-who-control',
);

/**
 * `amount.for-each-opponent-who-controls`: "for each opponent who controls a creature with power 4 or greater" (CR 102.2, 109.4, 608.2c): the same count, as the "for each" of an instruction.
 * Not read: "for each player who controls", "for each opponent who controls two creatures", "for each opponent who controls more creatures than you" (`amount.for-each-opponent`).
 */
export const AMOUNT_FOR_EACH_OPPONENT_WHO_CONTROLS = defineRule<IrAmount>({
  id: 'amount.for-each-opponent-who-controls',
  family: 'amount',
  leading: ['for'],
  cites: [
    'CR 102.2 (Players)',
    'CR 109.4 (Objects and Players)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each opponent who controls a creature with power 4 or greater',
    'for each opponent who controls a creature',
    'for each opponent who controls an artifact',
  ],
  rejects: [
    'for each opponent who controls',
    'for each player who controls a creature',
    'for each opponent who controls two creatures',
    'for each opponent who controls another creature',
    'for each opponent who control a creature',
    'for each opponent who controls a creature you control',
    'for each opponents who controls a creature',
  ],
  parse: opponentsControlling(
    /for each opponent who(?= )/iu,
    ' controls',
    'amount.for-each-opponent-who-controls',
  ),
});

export const OPPONENTS_WHO_CONTROL_AMOUNT_RULES = [AMOUNT_FOR_EACH_OPPONENT_WHO_CONTROLS];
