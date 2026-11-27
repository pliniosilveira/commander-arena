/**
 * Replacement rule of The Mimeoplasm (Grand Larceny deck, issue 119): "As ~ enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards
 * with a number of additional +1/+1 counters on it equal to the power of the other card." (CR 614.12, 707.2, 707.9b, 122.6: as it enters, its controller may exile two creature cards from
 * any graveyards; it then enters as a copy of one of them, chosen by the controller, with as many +1/+1 counters as the power of the other.)
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrNoun } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { replacement } from './shared';

const ID = 'replacement.enters-as-copy-exile-two';

/**
 * `replacement.enters-as-copy-exile-two`: "As ~ enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional
 * +1/+1 counters on it equal to the power of the other card." The engine's `entersAsCopy` with `exileTwoFromGraveyards`, over the creature cards of every graveyard; the copy lasts for good.
 * Not read: another number of cards, another card type, one graveyard ("your", "a"), counters of another kind, "toughness" or another quality for their number, "enters" without "as".
 */
export const REPLACEMENT_ENTERS_AS_COPY_EXILE_TWO = defineRule<IrAbility>({
  id: ID,
  family: 'replacement',
  leading: ['as'],
  cites: [
    'CR 614.12 (Replacement Effects)',
    'CR 707.2 (Copying Objects)',
    'CR 707.9b (Copying Objects)',
    'CR 122.6 (Counters)',
  ],
  examples: [
    'As ~ enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card.',
    'As ~ enters the battlefield, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card.',
  ],
  rejects: [
    'As ~ enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card',
    'As ~ enters, you may exile three creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card.',
    'As ~ enters, you may exile two artifact cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card.',
    'As ~ enters, you may exile two creature cards from your graveyard. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card.',
    'As ~ enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the toughness of the other card.',
    'As ~ enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional -1/-1 counters on it equal to the power of the other card.',
    'As ~ enters, exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card.',
    'As ~ enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card. Draw a card.',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/as ~ enters(?: the battlefield)?, you may exile two /iu)(ctx, pos);
    if (!head.ok) return head;
    const kind = spanned(literal('creature cards from graveyards'))(ctx, head.pos);
    if (!kind.ok) return kind;
    const tail = sequence(
      literal(
        '. if you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card.',
      ),
    )(ctx, kind.pos);
    if (!tail.ok) return tail;
    const span = { start: pos, end: tail.pos };
    const what: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter: { types: ['creature'], zone: 'graveyard', raw: 'creature cards from graveyards' },
      upTo: false,
      plural: true,
      other: false,
      span: kind.value.span,
      rule: ID,
    };
    const event: IrClause = {
      kind: 'clause',
      verb: 'entersAsCopy',
      args: {
        what,
        duration: { kind: 'flag', value: false, span, rule: ID },
        exileTwo: { kind: 'flag', value: true, span, rule: ID },
      },
      optional: true,
      span,
      rule: ID,
    };
    return { ok: true, value: replacement(ID, span, event), pos: tail.pos };
  },
});

export const EXILE_PAIR_COPY_REPLACEMENT_RULES = [REPLACEMENT_ENTERS_AS_COPY_EXILE_TWO].map(
  quietly,
);
