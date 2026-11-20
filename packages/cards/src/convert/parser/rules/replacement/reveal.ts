/**
 * Replacement rule of the lands that enter untapped when a card is revealed or beheld (stage P51, D-208): "As ~ enters, you may reveal a Mountain or Plains
 * card from your hand. If you don't, ~ enters tapped." and "As ~ enters, you may behold a Jace. If you don't, ~ enters tapped." (CR 614.1c, 614.12, 701.20,
 * 701.4). The permanent's own replacement effect (CR 603.6d), as the shock land's.
 */
import { choice, fail, map, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrCondition } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { PLANESWALKER_TYPES } from '../noun/subtypes';
import { defineRule, family, spanned } from '../registry';
import { replacement } from './shared';

const LAND_TYPE = '(?:Plains|Island|Swamp|Mountain|Forest)';

/**
 * `replacement.enters-tapped-unless-reveals`: "As ~ enters, you may reveal a Mountain or Plains card from your hand. If you don't, ~ enters tapped." and
 * "As ~ enters, you may behold a Jace. If you don't, ~ enters tapped." (CR 701.20a: reveal a card from the hand; CR 701.4a: behold a quality is revealing a
 * card of it from the hand or choosing a permanent of it you control). The cards are one or two basic land types, or a planeswalker type for behold. The
 * engine's `entersTappedUnlessReveals`. Also one creature type ("a Treefolk card"). Not read: another quality ("a land card"), two creature types, three types, another consequence, a cost besides.
 */
export const REPLACEMENT_ENTERS_TAPPED_UNLESS_REVEALS = defineRule<IrAbility>({
  id: 'replacement.enters-tapped-unless-reveals',
  family: 'replacement',
  leading: ['as'],
  cites: [
    'CR 614.1c (Replacement Effects)',
    'CR 614.12 (Replacement Effects)',
    'CR 701.20a (Reveal)',
    'CR 701.4a (Behold)',
  ],
  examples: [
    "As ~ enters, you may reveal a Mountain or Plains card from your hand. If you don't, ~ enters tapped.",
    "As ~ enters, you may reveal a Forest card from your hand. If you don't, ~ enters tapped.",
    'As ~ enters, you may reveal an Island or Swamp card from your hand. If you don’t, ~ enters tapped.',
    "As ~ enters, you may behold a Jace. If you don't, ~ enters tapped.",
    "As ~ enters, you may reveal a Treefolk card from your hand. If you don't, ~ enters tapped.",
  ],
  rejects: [
    "As ~ enters, you may reveal a Mountain or Plains card from your hand. If you don't, ~ enters tapped",
    "As ~ enters, you may reveal a Mountain, Plains, or Island card from your hand. If you don't, ~ enters tapped.",
    "As ~ enters, you may reveal a land card from your hand. If you don't, ~ enters tapped.",
    "As ~ enters, you may reveal a Dragon or Elf card from your hand. If you don't, ~ enters tapped.",
    "As ~ enters, you may reveal a Plains or Elf card from your hand. If you don't, ~ enters tapped.",
    "As ~ enters, you may reveal a Mountain or Plains card from your hand. If you don't, ~ enters tapped and you lose 1 life.",
    "As ~ enters, you may behold a Dragon. If you don't, ~ enters tapped.",
    "As ~ enters, you may behold a Jace or Gideon. If you don't, ~ enters tapped.",
    "As ~ enters, you may reveal a Mountain or Plains card. If you don't, ~ enters tapped.",
    "~ enters, you may reveal a Mountain or Plains card from your hand. If you don't, ~ enters tapped.",
  ],
  parse: (ctx, pos) => {
    const head = pattern(/as ~ enters(?: the battlefield)?, you may /iu)(ctx, pos);
    if (!head.ok) return head;
    const reveal = spanned(
      map(
        sequence(pattern(/reveal (an? )([A-Z][a-z]+(?: or [A-Z][a-z]+)?) card from your hand/u)),
        ([m]) => ({
          words: `${m[1] ?? 'a '}${m[2] ?? ''} card`,
          types: (m[2] ?? '').split(' or '),
        }),
      ),
    );
    const behold = spanned(
      map(pattern(/behold an? ([A-Z][a-z]+)(?![\p{L}\p{N}])/u), (m) => ({
        words: `a ${m[1] ?? ''}`,
        types: [m[1] ?? ''],
      })),
    );
    const what = choice(
      map(reveal, ({ value }) => ({ ...value, behold: false })),
      map(behold, ({ value }) => ({ ...value, behold: true })),
    )(ctx, head.pos);
    if (!what.ok) return what;
    if (what.value.behold && !what.value.types.every((t) => PLANESWALKER_TYPES.has(t))) {
      return fail(ctx, pos);
    }
    // A reveal names basic land types (one or two) or one creature type ("a Treefolk card", CR 205.3m).
    const [firstType] = what.value.types;
    const basicLands = what.value.types.every((t) => new RegExp(`^${LAND_TYPE}$`, 'u').test(t));
    const oneCreatureType =
      what.value.types.length === 1 && firstType !== undefined && CREATURE_TYPES.has(firstType);
    if (!what.value.behold && !basicLands && !oneCreatureType) return fail(ctx, pos);
    const tail = pattern(/\. if you don['’]t, ~ enters tapped\./iu)(ctx, what.pos);
    if (!tail.ok) return tail;
    const id = 'replacement.enters-tapped-unless-reveals';
    const span = { start: pos, end: tail.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersTappedUnlessReveals',
      args: {
        reveal: {
          kind: 'revealSpec',
          words: what.value.words,
          types: what.value.types,
          behold: what.value.behold,
          span,
          rule: id,
        },
      },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: tail.pos };
  },
});

/**
 * `replacement.enters-prepared`: "This creature enters prepared." (CR 722.3a, 722.3c, stage P56, D-214): the permanent gets the designation "prepared" as it enters and
 * its controller creates the copy of its prepare spell in exile. The engine's `entersPrepared`, valid on the first face of a card of the layout `prepare`. Not read: a
 * condition, "becomes prepared", "unprepared", another subject than this permanent.
 */
export const REPLACEMENT_ENTERS_PREPARED = defineRule<IrAbility>({
  id: 'replacement.enters-prepared',
  family: 'replacement',
  leading: ['~'],
  cites: [
    'CR 722.3a (Preparation Cards)',
    'CR 722.3c (Preparation Cards)',
    'CR 614.12 (Replacement Effects)',
  ],
  examples: ['~ enters prepared.', '~ enters the battlefield prepared.'],
  rejects: [
    '~ enters prepared',
    '~ enters unprepared.',
    '~ enters tapped and prepared.',
    '~ becomes prepared.',
    '~ enters prepared if you control a Goblin.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/~ enters(?: the battlefield)? prepared\./iu)(ctx, pos);
    if (!r.ok) return r;
    const id = 'replacement.enters-prepared';
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersPrepared',
      args: {},
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

/**
 * `replacement.enters-tapped-unless-reveals-or`: "As ~ enters, you may reveal a Dragon card from your hand. ~ enters tapped unless you revealed a Dragon card this
 * way or you control a Dragon." (CR 614.1c, 614.12, 701.20a). One creature type for the card, and a second way to enter untapped that the condition family reads. The
 * engine's `entersTappedUnlessReveals` with `orIf`: nothing is asked when the condition holds. Not read: another quality than a creature type, a different card in the
 * second sentence, a condition the family does not read.
 */
export const REPLACEMENT_ENTERS_TAPPED_UNLESS_REVEALS_OR = defineRule<IrAbility>({
  id: 'replacement.enters-tapped-unless-reveals-or',
  family: 'replacement',
  leading: ['as'],
  cites: [
    'CR 614.1c (Replacement Effects)',
    'CR 614.12 (Replacement Effects)',
    'CR 701.20a (Reveal)',
  ],
  examples: [
    'As ~ enters, you may reveal a Dragon card from your hand. ~ enters tapped unless you revealed a Dragon card this way or you control a Dragon.',
    'As ~ enters, you may reveal an Elf card from your hand. ~ enters tapped unless you revealed an Elf card this way or you control an Elf.',
  ],
  rejects: [
    'As ~ enters, you may reveal a Dragon card from your hand. ~ enters tapped unless you revealed a Dragon card this way or you control a Dragon',
    'As ~ enters, you may reveal a Dragon card from your hand. ~ enters tapped unless you revealed an Elf card this way or you control a Dragon.',
    'As ~ enters, you may reveal a Dragon card from your hand. ~ enters tapped unless you revealed a Dragon card this way.',
    'As ~ enters, you may reveal a Dragon card. ~ enters tapped unless you revealed a Dragon card this way or you control a Dragon.',
    'As ~ enters, you may reveal a land card from your hand. ~ enters tapped unless you revealed a land card this way or you control a Dragon.',
  ],
  parse: (ctx, pos) => {
    const head = pattern(
      /as ~ enters(?: the battlefield)?, you may reveal (an? )([A-Z][a-z]+) card from your hand\. /iu,
    )(ctx, pos);
    if (!head.ok) return head;
    const type = head.value[2] ?? '';
    if (!CREATURE_TYPES.has(type)) return fail(ctx, pos);
    const mid = pattern(
      /~ enters(?: the battlefield)? tapped unless you revealed an? ([A-Z][a-z]+) card this way or /iu,
    )(ctx, head.pos);
    if (!mid.ok) return mid;
    if (mid.value[1] !== type) return fail(ctx, pos);
    const cond = spanned(family<IrCondition>('condition'))(ctx, mid.pos);
    if (!cond.ok) return cond;
    const tail = pattern(/\./u)(ctx, cond.pos);
    if (!tail.ok) return tail;
    const id = 'replacement.enters-tapped-unless-reveals-or';
    const span = { start: pos, end: tail.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersTappedUnlessReveals',
      args: {
        reveal: {
          kind: 'revealSpec',
          words: `${head.value[1] ?? 'a '}${type} card`,
          types: [type],
          behold: false,
          span,
          rule: id,
        },
      },
      optional: false,
      condition: {
        kind: 'condition',
        test: { kind: 'not', term: cond.value.value },
        span: cond.value.span,
        rule: id,
      },
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: tail.pos };
  },
});

export const REVEAL_REPLACEMENT_RULES = [
  REPLACEMENT_ENTERS_TAPPED_UNLESS_REVEALS_OR,
  REPLACEMENT_ENTERS_TAPPED_UNLESS_REVEALS,
  REPLACEMENT_ENTERS_PREPARED,
];
