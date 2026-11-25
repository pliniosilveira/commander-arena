/**
 * The static line of a bestow card that boosts the creature and the one it enchants (CR 702.103, 611.3a, 613.4c): "~ and enchanted creature each get +1/+1 for each creature you
 * control and +1/+1 for each Aura you control." The subject is the permanent itself and whatever it is attached to (the engine's `attached` subject with `andThis`); each
 * "+N/+N for each ..." is one `ptCount` effect, so the lowering makes one static ability of each, like the other count statements (`static.pt-count`).
 */
import { literal, type Parser, pattern, sequence } from '../../combinators';
import type { IrAmount, IrNoun, IrStatic } from '../../ir/types';
import { defineRule, family } from '../registry';
import { FOR_EACH, PERIOD, STEP } from './pt-count';

const SUBJECT = pattern(/~ and enchanted creature each get /i);

/** "+1/+1 for each creature you control": one step and the objects it is counted over. */
const COUNTED: Parser<{ power: number; toughness: number; count: IrAmount }> = (ctx, pos) => {
  const r = sequence(STEP, pattern(/ (?=for each )/), FOR_EACH)(ctx, pos);
  if (!r.ok) return r;
  const [step, , count] = r.value;
  return { ok: true, value: { ...step, count }, pos: r.pos };
};

function subjectNoun(id: string, start: number, end: number): IrNoun {
  return {
    kind: 'noun',
    det: 'selfAndEnchanted',
    filter: { raw: '~ and enchanted creature', types: ['creature'] },
    upTo: false,
    plural: true,
    other: false,
    span: { start, end },
    rule: id,
  };
}

/**
 * `static.self-and-enchanted-pt-count`: "~ and enchanted creature each get +1/+1 for each creature you control." and the same with a second count, "... and +1/+1 for each Aura
 * you control." Not read: three counts, a count with no step, a duration, "gets" (the subject is two permanents), "and has" after the counts, and a line on a card with no bestow
 * (the lowering needs the face to be able to be an Aura).
 */
export const STATIC_SELF_AND_ENCHANTED_PT_COUNT = defineRule<IrStatic>({
  id: 'static.self-and-enchanted-pt-count',
  family: 'static',
  leading: [],
  cites: [
    'CR 702.103 (Bestow)',
    'CR 611.3a (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
  ],
  examples: [
    '~ and enchanted creature each get +1/+1 for each creature you control and +1/+1 for each Aura you control.',
    '~ and enchanted creature each get +1/+1 for each creature you control.',
    '~ and enchanted creature each get +2/+0 for each Aura you control and +0/+1 for each creature you control.',
  ],
  rejects: [
    '~ and enchanted creature each get +1/+1 for each creature you control',
    '~ and enchanted creature each gets +1/+1 for each creature you control.',
    '~ and enchanted creature get +1/+1 for each creature you control.',
    '~ and enchanted creature each get +1/+1.',
    '~ and enchanted creature each get +X/+X for each creature you control.',
    '~ and enchanted creature each get +1/+1 for each creature you control until end of turn.',
    '~ and enchanted creature each get +1/+1 for each creature you control and has flying.',
    '~ and enchanted creature each get +1/+1 for each creature you control, +1/+1 for each Aura you control and +1/+1 for each land you control.',
    '~ and enchanted creature each get +1/+1 for each creature you control and +1/+1.',
    '~ and equipped creature each get +1/+1 for each creature you control.',
    'Enchanted creature gets +1/+1 for each creature you control.',
  ],
  parse: (ctx, pos) => {
    const head = SUBJECT(ctx, pos);
    if (!head.ok) return head;
    const first = COUNTED(ctx, head.pos);
    if (!first.ok) return first;
    const counts = [first.value];
    let at = first.pos;
    const more = sequence(literal(' and '), COUNTED)(ctx, at);
    if (more.ok) {
      counts.push(more.value[1]);
      at = more.pos;
    }
    const end = PERIOD(ctx, at);
    if (!end.ok) return end;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('static.self-and-enchanted-pt-count', pos, head.pos),
        effects: counts.map((c) => ({
          kind: 'ptCount',
          power: c.power,
          toughness: c.toughness,
          count: c.count,
        })),
        span: { start: pos, end: end.pos },
        rule: 'static.self-and-enchanted-pt-count',
      },
      pos: end.pos,
    };
  },
});

/**
 * `static.self-and-enchanted-pt-amount`: "~ and enchanted creature each get +X/+X, where X is the number of creature cards in all graveyards." (CR 702.103 (Bestow), 613.4c,
 * 107.3c): the same two permanents as the count rule, with an X the text defines (`amount.where-x`). Not read: a step that is not +X/+X (one stat is read by the engine, but a
 * lone "+X/+0" on a bestow card is another statement), "gets", a missing period and a duration.
 */
export const STATIC_SELF_AND_ENCHANTED_PT_AMOUNT = defineRule<IrStatic>({
  id: 'static.self-and-enchanted-pt-amount',
  family: 'static',
  leading: [],
  cites: [
    'CR 702.103 (Bestow)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 107.3c (Numbers and Symbols)',
  ],
  examples: [
    '~ and enchanted creature each get +X/+X, where X is the number of creature cards in all graveyards.',
    '~ and enchanted creature each get +X/+X, where X is the number of creatures you control.',
  ],
  rejects: [
    '~ and enchanted creature each get +X/+X, where X is the number of creature cards in all graveyards',
    '~ and enchanted creature each get +X/+X where X is the number of creature cards in all graveyards.',
    '~ and enchanted creature each gets +X/+X, where X is the number of creature cards in all graveyards.',
    '~ and enchanted creature get +X/+X, where X is the number of creature cards in all graveyards.',
    '~ and enchanted creature each get +X/+X.',
    '~ and enchanted creature each get +1/+1, where X is the number of creature cards in all graveyards.',
    '~ and enchanted creature each get +X/-X, where X is the number of creature cards in all graveyards.',
    '~ and equipped creature each get +X/+X, where X is the number of creature cards in all graveyards.',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/~ and enchanted creature each get \+X\/\+X, (?=where X is )/i)(ctx, pos);
    if (!head.ok) return head;
    const amount = family<IrAmount>('amount', { only: ['amount.where-x'] })(ctx, head.pos);
    if (!amount.ok) return amount;
    const end = PERIOD(ctx, amount.pos);
    if (!end.ok) return end;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: subjectNoun('static.self-and-enchanted-pt-amount', pos, head.pos),
        effects: [{ kind: 'ptAmount', power: true, toughness: true, amount: amount.value }],
        span: { start: pos, end: end.pos },
        rule: 'static.self-and-enchanted-pt-amount',
      },
      pos: end.pos,
    };
  },
});

export const BESTOW_PT_STATIC_RULES = [
  STATIC_SELF_AND_ENCHANTED_PT_COUNT,
  STATIC_SELF_AND_ENCHANTED_PT_AMOUNT,
];
