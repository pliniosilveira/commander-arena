/**
 * Replacement rules for "this permanent enters ..." statements (CR 614.1c, 614.1d, 614.12): a
 * replacement effect that changes how a permanent enters the battlefield, and not a triggered
 * ability (CR 603.6d). The segmenter hands the whole statement over, period included.
 */
import { choice, fail, literal, pattern, sequence } from '../../combinators';
import type { IrAbility, IrChoiceArg, IrClause } from '../../ir/types';
import { defineRule } from '../registry';
import { ADAMANTOISE_REPLACEMENT_RULES } from './adamantoise';
import { ANGEL_REPLACEMENT_RULES } from './angels';
import { DIE_REPLACEMENT_RULES } from './die';
import { DRAGON_REPLACEMENT_RULES } from './dragons';
import { EDHREC_REPLACEMENT_RULES } from './edhrec';
import { KICKED_REPLACEMENT_RULES } from './kicked';
import { REVEAL_REPLACEMENT_RULES } from './reveal';
import { countersTail, ENTERS, replacement } from './shared';
import { SKIP_DRAW_REPLACEMENT_RULES } from './skip-draw';
import { UNLESS_RULES } from './unless';

/**
 * `replacement.enters-tapped`: "~ enters tapped." and "~ enters the battlefield tapped." A
 * condition ("... tapped unless you control two or more other lands") is not covered, so the line
 * stays unparsed and the diagnostic points at the condition.
 */
export const REPLACEMENT_ENTERS_TAPPED = defineRule<IrAbility>({
  id: 'replacement.enters-tapped',
  family: 'replacement',
  leading: ['~'],
  cites: ['CR 614.1d (Replacement Effects)', 'CR 614.12 (Replacement Effects)', 'CR 603.6d'],
  examples: ['~ enters tapped.', '~ enters the battlefield tapped.', '~ Enters Tapped.'],
  rejects: [
    '~ enters tapped unless you control two or more other lands.',
    '~ enters tapped and with a +1/+1 counter on it.',
    '~ enters tapped',
    '~ enters untapped.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(ENTERS, literal(' tapped'), literal('.'))(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersTapped',
      args: {},
      optional: false,
      span,
      rule: 'replacement.enters-tapped',
    };
    return { ok: true, value: replacement('replacement.enters-tapped', span, event), pos: r.pos };
  },
});

/**
 * The names of "choose Khans or Dragons" (CR 614.12, 607.2d): "A or B", "A, B, or C", each name capitalized words, none twice (anything else is not
 * how a card says it). Null when the words are not such a list.
 */
function optionNames(text: string): readonly string[] | null {
  const parts = text.split(/, or | or |, /);
  const separators = [...text.matchAll(/, or | or |, /g)].map((m) => m[0]);
  const shaped =
    separators.length === parts.length - 1 &&
    separators.slice(0, -1).every((sep) => sep === ', ') &&
    separators[separators.length - 1] === (parts.length === 2 ? ' or ' : ', or ');
  const name = /^\p{Lu}[\p{L}'’-]*(?: \p{Lu}[\p{L}'’-]*)*$/u;
  if (!shaped || parts.length < 2 || !parts.every((part) => name.test(part))) return null;
  return new Set(parts).size === parts.length ? parts : null;
}

/**
 * `replacement.as-enters-choose`: "As ~ enters, choose a creature type." and "As ~ enters, choose a
 * color." (CR 614.1c, 614.12, 614.12a: "as this enters" is a replacement effect, and the choice is made
 * before the permanent is on the battlefield; D-100). The words that read the choice are other
 * abilities of the card ("Creatures you control of the chosen type get +1/+1."). A choice with more
 * words ("choose a color other than white", "choose two colors"), another kind of choice (a card
 * name, a number, a basic land type, an opponent) and "you may choose" are not read: the engine asks the two questions it has and no other.
 */
export const REPLACEMENT_AS_ENTERS_CHOOSE = defineRule<IrAbility>({
  id: 'replacement.as-enters-choose',
  family: 'replacement',
  leading: ['as'],
  cites: [
    'CR 614.1c (Replacement Effects)',
    'CR 614.12 (Replacement Effects)',
    'CR 614.12a (Replacement Effects)',
    'CR 607.2d (Linked Abilities)',
  ],
  examples: [
    'As ~ enters, choose a creature type.',
    'As ~ enters, choose a color.',
    'As ~ enters the battlefield, choose a creature type.',
    'as ~ enters, choose a color.',
    // Stage P34 (D-152): a choice among names the card gives.
    'As ~ enters, choose Khans or Dragons.',
    'As ~ enters, choose Khans, Dragons, or Wolves.',
    // Hashaton deck group 6 (D-376): a card type.
    'As ~ enters, choose a card type.',
    'As ~ enters the battlefield, choose a card type.',
  ],
  rejects: [
    'As ~ enters, choose Khans, Dragons or Wolves.',
    'As ~ enters, choose Khans or Khans.',
    'As ~ enters, choose Khans.',
    'As ~ enters, choose khans or dragons.',
    'As ~ enters, choose Khans and Dragons.',
    'As ~ enters, you may choose Khans or Dragons.',
    'As ~ enters, choose Khans or Dragons',
    'As ~ enters, choose a creature type',
    'As ~ enters, choose a color other than white.',
    'As ~ enters, choose two colors.',
    'As ~ enters, choose a basic land type.',
    'As ~ enters, choose a card name.',
    'As ~ enters, choose a number.',
    'As ~ enters, choose an opponent.',
    'As ~ enters, you may choose a color.',
    'As ~ enters, choose a creature type and a color.',
    'As ~ enters, choose a card type',
    'As ~ enters, choose a card type other than creature.',
    'As ~ enters, choose two card types.',
    'As ~ enters, you may choose a card type.',
    'As ~ enters, choose a supertype.',
    'As ~ enters, choose a creature type. ~ enters with a fellowship counter on it.',
    '~ enters, choose a color.',
    'As ~ attacks, choose a color.',
  ],
  parse: (ctx, pos) => {
    // "As it enters" is the second sentence of "~ enters tapped. As it enters, choose a color.": the
    // segmenter sends a line to this family only when it starts with `~`, so the pronoun is read only
    // there (`readReplacement` reads each sentence of such a line).
    const r = sequence(
      pattern(/as /i),
      choice(ENTERS, literal('it enters the battlefield'), literal('it enters')),
      choice(
        // Hashaton deck group 6 (D-376, CR 205.2a): "choose a card type".
        pattern(/, choose a (creature type|color|card type)\./i),
        // Stage P34 (D-152, CR 614.12, 607.2d): "As ~ enters, choose Khans or Dragons." The names are the card's own, capitalized.
        pattern(/, choose (\p{Lu}[^.,—•\n]*(?:(?:, or | or |, )\p{Lu}[^.,—•\n]*)+)\./u),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , tail] = r.value;
    const span = { start: pos, end: r.pos };
    const id = 'replacement.as-enters-choose';
    const kind = (tail[1] ?? '').toLowerCase();
    const plain = kind === 'color' || kind === 'creature type' || kind === 'card type';
    const names = plain ? null : optionNames(tail[1] ?? '');
    if (!plain && names === null) return fail(ctx, pos);
    const what: IrChoiceArg =
      names === null
        ? {
            kind: 'choiceKind',
            what: kind === 'color' ? 'color' : kind === 'card type' ? 'cardType' : 'creatureType',
            span,
            rule: id,
          }
        : { kind: 'choiceKind', what: 'option', options: names, span, rule: id };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersChoose',
      args: { what },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

/**
 * `replacement.enters-with-counters`: "~ enters with two +1/+1 counters on it." The count is a
 * number, a number word or "a"/"an", or "X" (stage P16: the X of the spell it was cast as, CR
 * 107.3m; the card needs an {X} in its mana cost). The counter is "+1/+1", "-1/-1" or a named
 * kind ("charge") (CR 122.6, 614.1c). Since stage P28 (D-131) the count may be counted by what the permanent finds as it
 * enters: "~ enters with a +1/+1 counter on it for each Zombie card in your graveyard." (CR 614.12: counted as it
 * enters, for its controller).
 */
export const REPLACEMENT_ENTERS_WITH_COUNTERS = defineRule<IrAbility>({
  id: 'replacement.enters-with-counters',
  family: 'replacement',
  leading: ['~'],
  cites: ['CR 122.6 (Counters)', 'CR 614.1c (Replacement Effects)'],
  examples: [
    '~ enters with two +1/+1 counters on it.',
    '~ enters with 3 +1/+1 counters on it.',
    '~ enters with a +1/+1 counter on it.',
    '~ enters the battlefield with four +1/+1 counters on it.',
    '~ enters with ten -1/-1 counters on it.',
    '~ enters with three charge counters on it.',
    '~ enters with X +1/+1 counters on it.',
    '~ enters with X charge counters on it.',
    '~ enters the battlefield with X +1/+1 counters on it.',
    '~ enters with a +1/+1 counter on it for each Zombie card in your graveyard.',
    '~ enters with a +1/+1 counter on it for each creature you control.',
    // Stage P69 (D-254): Everflowing Chalice.
    '~ enters with a +1/+1 counter on it for each time it was kicked.',
    '~ enters with a charge counter on it for each time it was kicked.',
  ],
  rejects: [
    '~ enters with two +1/+1 counters on it for each creature you control.',
    '~ enters with two +1/+1 counters on it for each time it was kicked.',
    '~ enters with X +1/+1 counters on it for each creature you control.',
    '~ enters with a +1/+1 counter on it for each creature.',
    '~ enters with Y +1/+1 counters on it.',
    '~ enters with X on it.',
    '~ enters with up to X +1/+1 counters on it.',
    '~ enters with zero +1/+1 counters on it.',
    '~ enters with 0 +1/+1 counters on it.',
    '~ enters with two +1/+1 counters on it and draw a card.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(ENTERS, countersTail('replacement.enters-with-counters', true, true))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const { count, counter } = r.value[1];
    const span = { start: pos, end: r.pos };
    const id = 'replacement.enters-with-counters';
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersWithCounters',
      args: { count, counter },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: r.pos };
  },
});

export const REPLACEMENT_RULES = [
  REPLACEMENT_ENTERS_TAPPED,
  REPLACEMENT_AS_ENTERS_CHOOSE,
  REPLACEMENT_ENTERS_WITH_COUNTERS,
  ...UNLESS_RULES,
  // Stage P51 (D-208): "As ~ enters, you may reveal a Mountain or Plains card from your hand. If you don't, ~ enters tapped."
  ...REVEAL_REPLACEMENT_RULES,
  ...KICKED_REPLACEMENT_RULES,
  ...DIE_REPLACEMENT_RULES,
  // Stage P33 (D-150): "If you would gain life, you gain that much life plus 1 instead."
  ...ANGEL_REPLACEMENT_RULES,
  // Stage P34 (D-152): "As ~ enters, you may have it become a copy of any creature on the battlefield ...".
  ...DRAGON_REPLACEMENT_RULES,
  // Stage P43 (D-193): "All damage that would be dealt to you and other permanents you control is dealt to ~ instead."
  ...ADAMANTOISE_REPLACEMENT_RULES,
  // Stage P66 (D-219): "If one or more artifact tokens would be created under your control, ... are created instead."
  ...EDHREC_REPLACEMENT_RULES,
  // Issue 25 (D-332): "If you would draw a card while your library has no cards in it, skip that draw instead."
  ...SKIP_DRAW_REPLACEMENT_RULES,
];
