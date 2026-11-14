/**
 * Replacement rule of the lands that enter untapped when a card is revealed or beheld (stage P51, D-208): "As ~ enters, you may reveal a Mountain or Plains
 * card from your hand. If you don't, ~ enters tapped." and "As ~ enters, you may behold a Jace. If you don't, ~ enters tapped." (CR 614.1c, 614.12, 701.20,
 * 701.4). The permanent's own replacement effect (CR 603.6d), as the shock land's.
 */
import { choice, fail, map, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause } from '../../ir/types';
import { PLANESWALKER_TYPES } from '../noun/subtypes';
import { defineRule, spanned } from '../registry';
import { replacement } from './shared';

const LAND_TYPE = '(?:Plains|Island|Swamp|Mountain|Forest)';

/**
 * `replacement.enters-tapped-unless-reveals`: "As ~ enters, you may reveal a Mountain or Plains card from your hand. If you don't, ~ enters tapped." and
 * "As ~ enters, you may behold a Jace. If you don't, ~ enters tapped." (CR 701.20a: reveal a card from the hand; CR 701.4a: behold a quality is revealing a
 * card of it from the hand or choosing a permanent of it you control). The cards are one or two basic land types, or a planeswalker type for behold. The
 * engine's `entersTappedUnlessReveals`. Not read: another quality ("a Dragon card", "a land card"), three types, another consequence, a cost besides.
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
  ],
  rejects: [
    "As ~ enters, you may reveal a Mountain or Plains card from your hand. If you don't, ~ enters tapped",
    "As ~ enters, you may reveal a Mountain, Plains, or Island card from your hand. If you don't, ~ enters tapped.",
    "As ~ enters, you may reveal a land card from your hand. If you don't, ~ enters tapped.",
    "As ~ enters, you may reveal a Dragon card from your hand. If you don't, ~ enters tapped.",
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
        sequence(
          pattern(
            new RegExp(
              `reveal (an? )(${LAND_TYPE}(?: or ${LAND_TYPE})?) card from your hand`,
              'iu',
            ),
          ),
        ),
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

export const REVEAL_REPLACEMENT_RULES = [
  REPLACEMENT_ENTERS_TAPPED_UNLESS_REVEALS,
  REPLACEMENT_ENTERS_PREPARED,
];
