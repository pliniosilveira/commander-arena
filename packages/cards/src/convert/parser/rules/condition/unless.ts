/**
 * The "unless" of an instruction whose player pays a cost to stop it (stage P18, D-111, CR 118.12):
 * "draw a card unless that player pays {1}", "sacrifice ~ unless you pay {U}". The sentence rules attach
 * it to the one clause it follows (`IrClause.condition`, kind `unlessPays`); the instruction runs unless
 * the player pays, with a player who cannot pay never asked (CR 118.12a, 118.3). Only a mana cost is
 * read: a cost with {X} (CR 107.3j: no X in a triggered ability), "pays 2 life", "discards a card",
 * "any opponent may pay" and a payer who chooses among costs are not.
 */
import { choice, literal, map, sequence } from '../../combinators';
import type { IrCondition, IrCost, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';

/** The player who pays: a pronoun the binding pass resolves ("that player", "they") or "you". */
const PAYER = choice(
  map(spanned(literal('that player pays ')), ({ span }): IrNoun => anaphor(span, 'that player')),
  map(spanned(literal('they pay ')), ({ span }): IrNoun => anaphor(span, 'they')),
  map(
    spanned(literal('you pay ')),
    ({ span }): IrNoun => ({
      kind: 'noun',
      det: 'you',
      filter: { raw: 'you' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: span.start, end: span.start + 'you'.length },
      rule: 'condition.unless-pays',
    }),
  ),
);

function anaphor(span: { start: number; end: number }, raw: string): IrNoun {
  return {
    kind: 'noun',
    det: 'anaphor',
    filter: { raw },
    upTo: false,
    plural: false,
    other: false,
    span: { start: span.start, end: span.start + raw.length },
    rule: 'condition.unless-pays',
  };
}

/** `condition.unless-pays`: "unless that player pays {1}", "unless they pay {2}", "unless you pay {U}". */
export const CONDITION_UNLESS_PAYS = defineRule<IrCondition>({
  id: 'condition.unless-pays',
  family: 'condition',
  leading: ['unless'],
  cites: [
    'CR 118.12 (Costs)',
    'CR 118.12a (Costs)',
    'CR 118.3 (Costs)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'unless that player pays {1}',
    'unless that player pays {4}',
    'unless they pay {2}',
    'unless you pay {U}',
    'unless you pay {1}{G}',
    // Stage P51 (D-209, CR 107.14): energy counters.
    'unless you pay {E}{E}',
    'unless you pay {E}',
  ],
  rejects: [
    'unless that player pays {X}',
    'unless that player pays 2 life',
    'unless that player pays',
    'unless that player discards a card',
    'unless any opponent pays {1}',
    'unless an opponent pays {1}',
    'unless its controller pays {1}',
    'unless that player pays {R/W}',
    'unless that player pays {1} or discards a card',
    'if that player pays {1}',
    'unless you pays {1}',
    'unless that player pay {1}',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('unless '),
      PAYER,
      spanned(family<IrCost>('cost', { only: ['cost.mana', 'cost.energy'] })),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, who, cost] = r.value;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'unlessPays', who, cost: [cost.value] },
        span: { start: pos, end: r.pos },
        rule: 'condition.unless-pays',
      },
      pos: r.pos,
    };
  },
});
