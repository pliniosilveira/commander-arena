/**
 * Replacement rule of issue 104 (Vizier of Many Faces): "You may have ~ enter as a copy of any creature on the battlefield, except if ~ was embalmed, the token has no mana cost,
 * it's white, and it's a Zombie in addition to its other types." (CR 614.12, 707.2, 707.9b, 702.128b: the permanent enters as a copy, and when it is an embalmed token the copy is
 * white, has no mana cost and is a Zombie in addition to its other types.)
 */
import { fail, literal, map, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrNoun } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { replacement } from './shared';

const EXCEPTIONS =
  ", except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types.";

/**
 * `replacement.enters-as-copy-embalmed`: "You may have ~ enter as a copy of any creature on the battlefield, except if ~ was embalmed, the token has no mana cost, it's white, and it's
 * a Zombie in addition to its other types." The copy lasts for good (no duration is said). The exceptions are one fixed text (the three of Embalm itself, CR 702.128a), read as a
 * whole: the lowering gives them to the engine's `entersAsCopy.ifEmbalmed`, which applies them to a token an embalm ability made and to nothing else (CR 702.128b).
 */
export const REPLACEMENT_ENTERS_AS_COPY_EMBALMED = defineRule<IrAbility>({
  id: 'replacement.enters-as-copy-embalmed',
  family: 'replacement',
  leading: ['you'],
  cites: [
    'CR 614.12 (Replacement Effects)',
    'CR 707.2 (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 702.128b (Embalm)',
  ],
  examples: [
    "You may have ~ enter as a copy of any creature on the battlefield, except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types.",
    "You may have ~ enter as a copy of any artifact on the battlefield, except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types.",
  ],
  rejects: [
    "You may have ~ enter as a copy of any creature on the battlefield, except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types",
    'You may have ~ enter as a copy of any creature on the battlefield.',
    "You may have ~ enter as a copy of any creature you control on the battlefield, except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types.",
    "You may have ~ enter as a copy of any creature on the battlefield, except if ~ was embalmed, the token has no mana cost, it's black, and it's a Zombie in addition to its other types.",
    "You may have ~ enter as a copy of any creature on the battlefield, except if ~ was embalmed, the token has no mana cost and it's white.",
    "You may have ~ enter as a copy of any creature on the battlefield, except if ~ was eternalized, the token has no mana cost, it's white, and it's a Zombie in addition to its other types.",
    "You may have ~ enter as a copy of any creature on the battlefield until end of turn, except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types.",
    "You may have ~ enter as a copy of any creature on the battlefield, except if ~ was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types. Draw a card.",
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.enters-as-copy-embalmed';
    const head = literal('you may have ~ enter as a copy of any ')(ctx, pos);
    if (!head.ok) return head;
    const kind = spanned(map(permanentPhrase(false, 'all'), withoutZone))(ctx, head.pos);
    if (!kind.ok) return kind;
    // The permanents it may copy are any on the battlefield: a controller or a quality of its own is another statement.
    if (kind.value.value.controller !== undefined) return fail(ctx, pos);
    const where = sequence(literal(' on the battlefield'), literal(EXCEPTIONS))(ctx, kind.pos);
    if (!where.ok) return where;
    const span = { start: pos, end: where.pos };
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: kind.value.value,
      upTo: false,
      plural: false,
      other: false,
      span: kind.value.span,
      rule: id,
    };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersAsCopy',
      args: {
        what,
        duration: { kind: 'flag', value: false, span, rule: id },
        embalmed: { kind: 'flag', value: true, span, rule: id },
      },
      optional: true,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: where.pos };
  },
});

export const EMBALM_REPLACEMENT_RULES = [REPLACEMENT_ENTERS_AS_COPY_EMBALMED].map(quietly);
