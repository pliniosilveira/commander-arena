/**
 * Static abilities that apply "as long as" a condition holds (stage P29, D-133, CR 611.3a): "As long as you control your
 * commander, ~ gets +2/+2 and creatures you control have vigilance.", "~ gets +3/+3 as long as you have 30 or more
 * life.", "~ has hexproof as long as it's untapped.", "You may cast this card from your graveyard as long as you control
 * a Zombie." The condition comes first with "As long as ..., " or after the statement with " as long as ...", and applies
 * to every effect of the statement; the statements are the unconditional ones of `grants.ts` (one subject and what it
 * gets, has or can't do) and the whole lines of `play-rules.ts` that take a condition. Which conditions the engine reads in
 * a static ability is its business (`validateCard`): the grammar reads the ones the condition family has.
 */
import { choice, fail, literal, type Parser, pattern, sequence } from '../../combinators';
import type { IrCondition, IrNoun, IrStatic, IrStaticPart } from '../../ir/types';
import { defineRule, family } from '../registry';
import { SELF_BECOMES_UNIT } from './dragons';
import { endsInQuote, predicate, type StaticUnit, unit } from './grants';
import { SELF_ISNT_CREATURE_UNIT } from './hofri';
import { OPPONENTS_CANT_CAST_UNIT } from './korvold';

/** The conditions a static ability reads: counts of permanents, a commander, the life total, this permanent's tapped status. */
const STATIC_CONDITIONS = [
  'condition.control-at-least',
  'condition.control-a',
  'condition.control-at-most',
  'condition.control-none',
  'condition.control-land-type',
  'condition.control-commander',
  'condition.control-your-commander',
  'condition.life-total',
  'condition.this-tapped',
  'condition.designation',
  // Stage P34 (D-152): the permanents that entered this turn.
  'condition.entered-this-turn',
  // Stage P37 (D-180): "~ is attached to a creature".
  'condition.attached-to',
  // Stage P68 (D-229): "there are fewer than eight cards in your graveyard".
  'condition.cards-in-graveyard',
  // Issue 25 (D-331): "there are no cards in your library".
  'condition.cards-in-library',
  // D-286 (CR 702.95b): "~ is paired with another creature".
  'condition.paired',
  // D-1235 (Danitha group 3): "enchanted creature is green", "another Aura is attached to enchanted creature", "~ entered this turn".
  'condition.host-is-color',
  'condition.other-attached-to-host',
  'condition.this-entered-this-turn',
] as const;

const CONDITION: Parser<IrCondition> = family<IrCondition>('condition', {
  only: STATIC_CONDITIONS,
});

/** The subjects of a group statement. */
const GROUP = [
  'noun.plain-permanents',
  'noun.other-permanents',
  'noun.other-subtype-permanents',
  'noun.subtype-union',
  'noun.all-permanents',
];

/** `~` alone, with what it gets or has; a group; each permanent of a kind. */
const SELF_UNIT = unit(['noun.self'], 'selfGrant');
const GROUP_UNIT = unit(GROUP, 'plural');
const EACH_UNIT = unit(['noun.each-permanent'], 'each');
// D-286 (CR 702.95b): "each of those creatures has ..." of a soulbond card; the verb is singular, as the one of "each".
const PAIR_UNIT = unit(['noun.paired-creatures'], 'each');

// D-1235 (Danitha group 3, CR 303.4b, 301.5a): "enchanted creature has hexproof", what an Aura gives while a condition holds.
const ATTACHED_UNIT = unit(['noun.attached-permanent'], 'attached');

const ANY_UNIT: Parser<StaticUnit> = choice(
  SELF_BECOMES_UNIT,
  // Stage P68 (D-229): "~ isn't a creature".
  SELF_ISNT_CREATURE_UNIT,
  SELF_UNIT,
  GROUP_UNIT,
  EACH_UNIT,
  PAIR_UNIT,
  // Stage P37 (D-180): "your opponents can't cast spells during your turn".
  OPPONENTS_CANT_CAST_UNIT,
  ATTACHED_UNIT,
);

/**
 * "it" after a condition about the permanent an Aura or an Equipment is attached to ("As long as enchanted creature is green, it gets +1/+1 and has indestructible."): the
 * same permanent as the condition names, the host (D-1235). `via` is the word of the condition ("enchanted" for an Aura, "equipped" for an Equipment): it makes the noun the
 * one `noun.attached-permanent` makes, so the lowering needs the same kind of attachment on the face. A pronoun with no such condition before it is not read.
 */
function hostPronounUnit(via: 'enchanted' | 'equipped'): Parser<StaticUnit> {
  const body = predicate('attached');
  return (ctx, pos) => {
    const it = pattern(/it(?= )/iu)(ctx, pos);
    if (!it.ok) return it;
    const r = body(ctx, it.pos);
    if (!r.ok) return r;
    const keys = r.value.map((e) => JSON.stringify(e));
    if (keys.some((k, i) => keys.indexOf(k) !== i)) return fail(ctx, r.pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: via,
      filter: { raw: 'it' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: it.pos },
      rule: 'static.conditional-prefix',
    };
    return { ok: true, value: { noun, effects: r.value }, pos: r.pos };
  };
}

/** The word a condition about the permanent an attachment is on says ("enchanted", "equipped"), or undefined for any other condition. */
function hostWordOf(condition: IrCondition | undefined): 'enchanted' | 'equipped' | undefined {
  const test = condition?.test;
  return test?.kind === 'attachedTo' || test?.kind === 'otherAttachedToHost' ? test.via : undefined;
}

/** "You may cast this card from your graveyard": the permission of the card itself (CR 113.6b), a unit with no period. */
const CAST_FROM_GRAVEYARD_UNIT: Parser<StaticUnit> = (ctx, pos) => {
  const r = pattern(/you may cast this card from your graveyard(?![\p{L}\p{N}])/iu)(ctx, pos);
  if (!r.ok) return r;
  const span = { start: pos, end: pos + 'you may cast this card'.length };
  return {
    ok: true,
    value: {
      noun: {
        kind: 'noun',
        det: 'self',
        filter: { raw: 'this card' },
        upTo: false,
        plural: false,
        other: false,
        span,
        rule: 'static.cast-from-graveyard',
      },
      effects: [{ kind: 'castFromGraveyard' }],
    },
    pos: r.pos,
  };
};

const PERIOD = pattern(/\./);

/**
 * The units of "As long as C, A and B.": the first, then each " and " unit that reads. A statement that ends in a quoted
 * ability is not followed by another (the quote ends it).
 */
function units(
  ctx: Parameters<typeof ANY_UNIT>[0],
  pos: number,
  any: Parser<StaticUnit> = ANY_UNIT,
) {
  const first = any(ctx, pos);
  if (!first.ok) return first;
  const parts: StaticUnit[] = [first.value];
  let at = first.pos;
  for (;;) {
    const joined = sequence(literal(' and '), any)(ctx, at);
    if (!joined.ok) break;
    parts.push(joined.value[1]);
    at = joined.pos;
  }
  return { ok: true as const, value: parts, pos: at };
}

function build(
  rule: string,
  start: number,
  end: number,
  condition: IrCondition | undefined,
  parts: readonly StaticUnit[],
): IrStatic | null {
  const [first, ...rest] = parts;
  if (first === undefined) return null;
  const also: IrStaticPart[] = rest.map((p) => ({ subject: p.noun, effects: p.effects }));
  return {
    kind: 'static',
    subject: first.noun,
    effects: first.effects,
    ...(condition === undefined ? {} : { condition }),
    ...(also.length > 0 ? { also } : {}),
    span: { start, end },
    rule,
  };
}

/**
 * `static.conditional-prefix`: "As long as you control your commander, ~ gets +2/+2 and creatures you control have
 * vigilance.", "As long as you have at least 7 life more than your starting life total, creatures you control get +1/+1.",
 * "As long as you control three or more artifacts, ~ has hexproof.", "As long as ~ is untapped, creatures can't attack you
 * or planeswalkers you control unless their controller pays {2} for each of those creatures." (CR 611.3a: the effect
 * applies only while the condition holds, which is looked at all the time). Each statement is one of the unconditional kinds
 * (a subject and what it gets or has: `~`, a group, each permanent of a kind; or the attack tax).
 */
export const STATIC_CONDITIONAL_PREFIX = defineRule<IrStatic>({
  id: 'static.conditional-prefix',
  family: 'static',
  leading: ['as'],
  cites: ['CR 611.3a (Continuous Effects)', 'CR 613.8 (Interaction of Continuous Effects)'],
  examples: [
    'As long as you control your commander, ~ gets +2/+2 and creatures you control have vigilance.',
    'As long as you have at least 7 life more than your starting life total, creatures you control get +1/+1.',
    'As long as you control three or more artifacts, ~ has hexproof.',
    'As long as you control a Zombie, other Zombies you control get +1/+1.',
    "As long as ~ is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {2} for each of those creatures.",
    'As long as you have 30 or more life, ~ gets +3/+3 and has flying.',
    // Stage P34 (D-152): the ability of a card in its owner's graveyard, and what ~ is while permanents entered this turn.
    'As long as this card is in your graveyard and you control a Mountain, creatures you control have haste.',
    'As long as this card is in your graveyard, creatures you control get +1/+0.',
    'As long as two or more nonland permanents entered the battlefield under your control this turn, ~ is a Dragon with base power and toughness 4/4, flying, and "{R}: Dragons you control get +1/+0 until end of turn."',
    'As long as a creature entered the battlefield under your control this turn, ~ is an Elf with base power and toughness 2/2.',
    // D-1235 (Danitha group 3): what an Aura gives while the creature is of a color, while another Aura is on it, or the turn it entered.
    'As long as enchanted creature is green, it gets +1/+1 and has indestructible.',
    'As long as enchanted creature is white, it gets +1/+1 and has flying.',
    'As long as another Aura is attached to enchanted creature, it has first strike and lifelink.',
    'As long as ~ entered this turn, enchanted creature has hexproof.',
  ],
  rejects: [
    'As long as this card is in your graveyard and you control a Mountain, ~ gets +2/+2',
    'As long as this card is in your graveyard, you control a Mountain, creatures you control have haste.',
    'As long as this card is in your hand, creatures you control have haste.',
    'As long as this card is in your graveyard or you control a Mountain, creatures you control have haste.',
    'As long as two or more nonland permanents entered the battlefield under your control this turn, ~ is a Dragon.',
    'As long as you control your commander, ~ gets +2/+2',
    'As long as you control your commander ~ gets +2/+2.',
    'As long as you control your commander, ~ gets +2/+2. Draw a card.',
    'As long as you control a banana, ~ gets +2/+2.',
    'As long as you control your commander, target creature gets +2/+2.',
    'As long as you control your commander, creatures you control get +1/+1 until end of turn.',
    'As long as you control your commander, you draw a card.',
    'As long as you control your commander and you have 30 or more life, ~ gets +2/+2.',
    'As long as ~ is untapped, ~ gets +2/+2 as long as you have 30 or more life.',
    // D-1235: "it" names the creature only after a condition about the creature an attachment is on.
    'As long as you control your commander, it gets +2/+2.',
    'As long as enchanted creature is green, it gets +1/+1',
    'As long as enchanted creature is green or white, it gets +1/+1.',
    'As long as ~ entered this turn, it has hexproof.',
  ],
  parse: (ctx, pos) => {
    const lead = literal('as long as ')(ctx, pos);
    if (!lead.ok) return lead;
    // "As long as this card is in your graveyard and you control a Mountain, ..." (stage P34, D-152, CR 113.6b): the ability works from the
    // graveyard, which the engine says as `functionsIn`; what follows "and" is the condition of the engine.
    const grave = literal('this card is in your graveyard')(ctx, lead.pos);
    let condition: IrCondition | undefined;
    let at: number;
    if (grave.ok) {
      const alone = literal(', ')(ctx, grave.pos);
      if (alone.ok) {
        at = alone.pos;
      } else {
        const more = sequence(literal(' and '), CONDITION, literal(', '))(ctx, grave.pos);
        if (!more.ok) return more;
        condition = more.value[1];
        at = more.pos;
      }
    } else {
      const head = sequence(CONDITION, literal(', '))(ctx, lead.pos);
      if (!head.ok) return head;
      condition = head.value[0];
      at = head.pos;
    }
    const tax = family<IrStatic>('static', { only: ['static.attack-tax'] })(ctx, at);
    if (tax.ok) {
      if (condition === undefined) return fail(ctx, at);
      return {
        ok: true,
        value: {
          ...tax.value,
          condition,
          span: { start: pos, end: tax.pos },
          rule: 'static.conditional-prefix',
        },
        pos: tax.pos,
      };
    }
    // D-1235: after a condition about the host of an attachment, "it" is that permanent.
    const via = hostWordOf(condition);
    const read = units(
      ctx,
      at,
      via === undefined ? ANY_UNIT : choice(hostPronounUnit(via), ANY_UNIT),
    );
    if (!read.ok) return read;
    const last = read.value[read.value.length - 1];
    const end =
      last !== undefined && endsInQuote(last.effects)
        ? { ok: true as const, pos: read.pos }
        : PERIOD(ctx, read.pos);
    if (!end.ok) return end;
    const value = build('static.conditional-prefix', pos, end.pos, condition, read.value);
    if (value === null) return fail(ctx, pos);
    return {
      ok: true,
      value: grave.ok ? { ...value, functionsIn: 'graveyard' as const } : value,
      pos: end.pos,
    };
  },
});

/**
 * `static.conditional-suffix`: "~ gets +3/+3 as long as you have 30 or more life.", "~ has hexproof as long as it's
 * untapped.", "Dragons you control have flying as long as you control a Dragon.", "You may cast this card from your
 * graveyard as long as you control a Zombie." (CR 611.3a, 113.6b): one statement and its condition after it.
 */
export const STATIC_CONDITIONAL_SUFFIX = defineRule<IrStatic>({
  id: 'static.conditional-suffix',
  family: 'static',
  leading: [],
  cites: [
    'CR 611.3a (Continuous Effects)',
    'CR 613.8 (Interaction of Continuous Effects)',
    'CR 113.6b (Abilities That Function in Zones Other Than the Battlefield)',
  ],
  examples: [
    '~ gets +3/+3 as long as you have 30 or more life.',
    "~ has hexproof as long as it's untapped.",
    'Zombies you control get +1/+1 as long as you control three or more Zombies.',
    'You may cast this card from your graveyard as long as you control a Zombie.',
    '~ gets +1/+1 and has hexproof as long as you control your commander.',
    'Other Time Lords you control have flying as long as you control a Time Lord.',
  ],
  rejects: [
    '~ gets +3/+3 as long as you have 30 or more life',
    '~ gets +3/+3 as long as',
    '~ gets +3/+3 as long as you have 30 or more life. Draw a card.',
    '~ gets +3/+3 as long as you control a banana.',
    '~ gets +3/+3 as long as you have 30 or more life and you control a Zombie.',
    'You may cast this card from your graveyard as long as you control a Zombie',
    'You may cast this card from your hand as long as you control a Zombie.',
    'You may cast this card as long as you control a Zombie.',
    'Draw a card as long as you control a Zombie.',
    '~ gets +3/+3 until end of turn as long as you have 30 or more life.',
  ],
  parse: (ctx, pos) => {
    const read = sequence(
      choice(ANY_UNIT, CAST_FROM_GRAVEYARD_UNIT),
      literal(' as long as '),
      CONDITION,
    )(ctx, pos);
    if (!read.ok) return read;
    const [part, , condition] = read.value;
    const end = PERIOD(ctx, read.pos);
    if (!end.ok) return end;
    const value = build('static.conditional-suffix', pos, end.pos, condition, [part]);
    return value === null ? fail(ctx, pos) : { ok: true, value, pos: end.pos };
  },
});

/**
 * `static.cast-from-graveyard`: "You may cast this card from your graveyard." (stage P29, D-133, CR 113.6b, 601.2a): the
 * permission of the card itself while it is in its owner's graveyard, at the timing its type allows and for its ordinary
 * cost. With "as long as ..." it is `static.conditional-suffix`.
 */
export const STATIC_CAST_FROM_GRAVEYARD = defineRule<IrStatic>({
  id: 'static.cast-from-graveyard',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 113.6b (Abilities That Function in Zones Other Than the Battlefield)',
    'CR 601.2a (Casting Spells)',
  ],
  examples: ['You may cast this card from your graveyard.'],
  rejects: [
    'You may cast this card from your graveyard',
    'You may cast this card from your hand.',
    'You may cast this card from your graveyard once each turn.',
    'You may cast ~ from your graveyard.',
    'You may cast target creature card from your graveyard.',
    'You may cast this card from your graveyard, then exile it.',
    'You may cast this card from a graveyard.',
  ],
  parse: (ctx, pos) => {
    const read = sequence(CAST_FROM_GRAVEYARD_UNIT, PERIOD)(ctx, pos);
    if (!read.ok) return read;
    const [{ noun, effects }] = read.value;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: noun,
        effects,
        span: { start: pos, end: read.pos },
        rule: 'static.cast-from-graveyard',
      },
      pos: read.pos,
    };
  },
});

export const CONDITIONAL_STATIC_RULES = [
  STATIC_CONDITIONAL_PREFIX,
  STATIC_CONDITIONAL_SUFFIX,
  STATIC_CAST_FROM_GRAVEYARD,
];
