/**
 * Static abilities whose power and toughness come from a count (stage P20, D-109, D-115): "Equipped
 * creature gets +1/+1 for each land you control." (a bonus that follows the board, CR 611.3a, 613.4c)
 * and "~'s power and toughness are each equal to the number of cards in your hand." (a
 * characteristic-defining ability, CR 604.3, 613.4a). The counted words are the amounts of stage P13
 * (`amount.for-each`, `amount.number-of`): permanents on the battlefield and cards in your hand or
 * graveyard. The lowering refuses what the engine's static count does not read (a power or toughness in
 * the counted filter, CR 613.8; another player's objects).
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  sequence,
} from '../../combinators';
import type { IrAmount, IrNoun, IrStatic, IrStaticEffect } from '../../ir/types';
import { KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family } from '../registry';

/** "+1/+1", "-1/-1", "+1/+0": the change for each object counted. Never X, and never "+0/+0". */
const STEP: Parser<{ power: number; toughness: number }> = (ctx, pos) => {
  const m = pattern(/([+-])(\d+)\/([+-])(\d+)(?![\p{L}\p{N}/])/u)(ctx, pos);
  if (!m.ok) return m;
  const signed = (sign: string | undefined, digits: string | undefined) =>
    (sign === '-' ? -Number(digits) : Number(digits)) + 0;
  const power = signed(m.value[1], m.value[2]);
  const toughness = signed(m.value[3], m.value[4]);
  if (power === 0 && toughness === 0) return fail(ctx, pos);
  return { ok: true, value: { power, toughness }, pos: m.pos };
};

const PERIOD = literal('.');
// Stage P37 (D-180): "for each color among permanents you control" counts colors, not objects.
const FOR_EACH = family<IrAmount>('amount', {
  only: ['amount.for-each', 'amount.for-each-color', 'amount.for-each-commander-cast'],
});

const SINGULAR_SUBJECTS = ['noun.self', 'noun.attached-permanent'];
const PLURAL_SUBJECTS = [
  'noun.plain-permanents',
  'noun.other-permanents',
  'noun.other-subtype-permanents',
  'noun.all-permanents',
];

function countStatement(id: string): Parser<IrStatic> {
  const verb = (only: readonly string[], gets: string): Parser<[IrNoun, unknown]> =>
    sequence(quiet(family<IrNoun>('noun', { only })), pattern(new RegExp(` ${gets} `, 'i')));
  const singular = verb(SINGULAR_SUBJECTS, 'gets');
  const plural = verb(PLURAL_SUBJECTS, 'get');
  const subject = choice(singular, plural);
  // The space is read with a look-ahead for "for each", so a statement that goes on in another way stops
  // where the older static rules stop and keeps their `closestRule`.
  const head = sequence(STEP, pattern(/ (?=for each )/), FOR_EACH);
  // D-426 (Danitha group 3, Ethereal Armor): "... for each enchantment you control and has first strike": the keywords the subject has besides, in the verb of its number.
  const andHas = (plural: boolean): Parser<readonly IrStaticEffect[]> =>
    optional(
      map(
        sequence(literal(plural ? ' and have ' : ' and has '), KEYWORD_WORDS),
        ([, words]): readonly IrStaticEffect[] =>
          words.map((keyword): IrStaticEffect => ({ kind: 'grantKeyword', keyword })),
      ),
      [] as readonly IrStaticEffect[],
    );
  return (ctx, pos) => {
    const s = subject(ctx, pos);
    if (!s.ok) return s;
    const r = head(ctx, s.pos);
    if (!r.ok) return r;
    const [step, , count] = r.value;
    const has = andHas(s.value[0].plural)(ctx, r.pos);
    if (!has.ok) return has;
    const end = PERIOD(ctx, has.pos);
    if (!end.ok) return end;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: s.value[0],
        effects: [
          { kind: 'ptCount', power: step.power, toughness: step.toughness, count },
          ...has.value,
        ],
        span: { start: pos, end: end.pos },
        rule: id,
      },
      pos: end.pos,
    };
  };
}

/**
 * `static.pt-count`: what a permanent or a group gets for each object counted: "Equipped creature
 * gets +1/+1 for each land you control.", "~ gets +1/+0 for each artifact you control.", "Enchanted
 * creature gets -1/-1 for each creature card in your graveyard.", "Other creatures you control get +1/+1
 * for each Elf you control." The bonus is worked out every time the permanent's characteristics are, so
 * it follows the board and is not locked in (CR 611.3a). It is one effect: "and has flying" after it, a
 * duration, a step of "+X" and a condition are not read.
 */
export const STATIC_PT_COUNT = defineRule<IrStatic>({
  id: 'static.pt-count',
  family: 'static',
  leading: [],
  cites: [
    'CR 611.3a (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    '~ gets +1/+0 for each artifact you control.',
    'Equipped creature gets +1/+1 for each land you control.',
    '~ gets +1/+1 for each creature card in your graveyard.',
    'Enchanted creature gets -1/-1 for each creature card in your graveyard.',
    'Equipped creature gets +2/+0 for each Elf you control.',
    '~ gets +1/+1 for each other creature you control.',
    'Other creatures you control get +1/+1 for each Elf you control.',
    'Creatures you control get +1/+0 for each artifact you control.',
    // Stage P37 (D-180): the colors the permanents have between them.
    'Equipped creature gets +1/+1 for each color among permanents you control.',
    // D-426 (Danitha group 3, CR 303.4, 702.7): Auras attached to the permanent, Auras of yours on creatures, and keywords besides.
    '~ gets +2/+2 for each Aura attached to it.',
    'Enchanted creature gets +2/+2 for each Aura and Equipment attached to it.',
    "Enchanted creature gets +1/+1 for each Aura you control that's attached to a creature.",
    'Enchanted creature gets +1/+1 for each enchantment you control and has first strike.',
    'Creatures you control get +1/+1 for each artifact you control and have flying.',
  ],
  rejects: [
    '~ gets +1/+1 for each artifact you control',
    '~ gets +1/+1 for each artifact',
    '~ get +1/+1 for each artifact you control.',
    'Creatures you control gets +1/+1 for each artifact you control.',
    '~ gets +X/+X for each artifact you control.',
    '~ gets +0/+0 for each artifact you control.',
    '~ gets +1/+1 for each artifact you control until end of turn.',
    '~ gets +1/+1 until end of turn for each artifact you control.',
    '~ gets +1/+1 for each artifact you control and has flying and.',
    '~ gets +1/+1 for each artifact you control and have flying.',
    'Creatures you control get +1/+1 for each artifact you control and has flying.',
    '~ gets +1/+1 for each artifact you control and has flying until end of turn.',
    '~ gets +1/+1 for each artifact you control and gains flying.',
    '~ gets +1/+1 for each artifact you control and can fly.',
    '~ gets +1/+1 for each burden counter on ~.',
    'Creatures you control get +1/+1.',
    'Target creature gets +1/+1 for each artifact you control.',
  ],
  parse: countStatement('static.pt-count'),
});

/** `~'s`: the permanent that defines its own power and toughness. */
function selfNoun(id: string, start: number): IrNoun {
  return {
    kind: 'noun',
    det: 'self',
    filter: { raw: '~' },
    upTo: false,
    plural: false,
    other: false,
    span: { start, end: start + 1 },
    rule: id,
  };
}

const DEFINES = pattern(
  /~['’]s (power and toughness are each|power is|toughness is) (?=equal to the number of )/i,
);

/**
 * `static.defines-pt`: a characteristic-defining ability that counts (CR 604.3, 208.2a, 613.4a): "~'s
 * power and toughness are each equal to the number of lands you control.", "~'s power is equal to the
 * number of creatures you control.", "~'s toughness is equal to the number of cards in your hand." The
 * card prints `*` for what the line defines (the face conversion keeps a bare `*`; the engine's
 * `validateCard` refuses a line for a stat the card prints as a number and a `*` with no line). It
 * works in every zone (CR 604.3), which the engine runs. Since stage P28 (D-131) the count may be a sum of counts
 * ("each equal to the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards"). Not
 * read: a number added ("1+*"), "twice the number of", another player's objects, "the greatest power among", "the
 * number of card types among" and a power line and a toughness line joined in one sentence.
 */
export const STATIC_DEFINES_PT = defineRule<IrStatic>({
  id: 'static.defines-pt',
  family: 'static',
  leading: [],
  cites: [
    'CR 604.3 (Handling Static Abilities)',
    'CR 208.2a (Power/Toughness)',
    'CR 613.4a (Interaction of Continuous Effects)',
  ],
  examples: [
    "~'s power and toughness are each equal to the number of lands you control.",
    '~’s power and toughness are each equal to the number of cards in your hand.',
    "~'s power and toughness are each equal to the number of creatures you control.",
    "~'s power is equal to the number of creatures you control.",
    "~'s power is equal to the number of artifacts you control.",
    "~'s toughness is equal to the number of cards in your hand.",
    "~'s power and toughness are each equal to the number of creature cards in your graveyard.",
    "~'s power and toughness are each equal to the number of Swamps you control.",
    "~'s power and toughness are each equal to the number of Zombies on the battlefield plus the number of Zombie cards in all graveyards.",
    "~'s power is equal to the number of creatures you control plus the number of lands you control.",
  ],
  rejects: [
    "~'s power and toughness are each equal to the number of creatures you control plus half the number of lands you control.",
    "~'s power and toughness are each equal to the number of lands you control",
    "~'s power and toughness are each equal to the number of lands",
    "~'s power and toughness are equal to the number of lands you control.",
    "~'s power and toughness are each equal to twice the number of lands you control.",
    "~'s power and toughness are each equal to the number of lands you control plus 1.",
    "~'s power and toughness are each equal to its mana value.",
    "~'s power and toughness are each equal to the number of cards in target opponent’s hand.",
    "~'s power is equal to the number of creatures you control and its toughness is equal to the number of lands you control.",
    "~'s power and toughness are each equal to the greatest power among creatures you control.",
    "~'s power equals the number of lands you control.",
    "Enchanted creature's power is equal to the number of lands you control.",
    '~ has power equal to the number of lands you control.',
  ],
  parse: (ctx, pos) => {
    const head = DEFINES(ctx, pos);
    if (!head.ok) return head;
    const count = family<IrAmount>('amount', { only: ['amount.equal-to', 'amount.number-of'] })(
      ctx,
      head.pos,
    );
    if (!count.ok) return count;
    // The engine reads a count, or the sum of counts (stage P28: "... plus the number of Zombie cards in all
    // graveyards"); "twice", "half", a greatest power and the rest are other statements.
    if (count.value.kind !== 'countOf' && count.value.kind !== 'sum') return fail(ctx, pos);
    const end = PERIOD(ctx, count.pos);
    if (!end.ok) return end;
    const which = (head.value[1] ?? '').toLowerCase();
    const stats = which.startsWith('power and')
      ? 'both'
      : which.startsWith('power')
        ? 'power'
        : 'toughness';
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: selfNoun('static.defines-pt', pos),
        effects: [{ kind: 'definesPt', stats, count: count.value }],
        span: { start: pos, end: end.pos },
        rule: 'static.defines-pt',
      },
      pos: end.pos,
    };
  },
});

export const PT_COUNT_STATIC_RULES = [STATIC_PT_COUNT, STATIC_DEFINES_PT];
