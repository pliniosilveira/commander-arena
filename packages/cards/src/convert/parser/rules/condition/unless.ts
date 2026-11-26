/**
 * The "unless" of an instruction whose player pays a cost to stop it (stage P18, D-111, CR 118.12):
 * "draw a card unless that player pays {1}", "sacrifice ~ unless you pay {U}". The sentence rules attach
 * it to the one clause it follows (`IrClause.condition`, kind `unlessPays`); the instruction runs unless
 * the player pays, with a player who cannot pay never asked (CR 118.12a, 118.3). Only a mana cost is
 * read: a cost with {X} (CR 107.3j: no X in a triggered ability), "pays 2 life", "discards a card",
 * "any opponent may pay" and a payer who chooses among costs are not.
 */
import { choice, literal, map, optional, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrCondition, IrCost, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';

/** The player who pays: a pronoun the binding pass resolves ("that player", "they") or "you". */
const PAYER = choice(
  // CR 109.4, 118.12 (Kazuul): "unless that creature's controller pays {3}", the controller of an object the text named, bound by the binding pass.
  map(
    sequence(family<IrNoun>('noun', { only: ['noun.its-controller'] }), literal(' pays ')),
    ([who]): IrNoun => who,
  ),
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
    // Kazuul (CR 109.4, 118.12): the controller of the creature the trigger is about pays.
    "unless that creature's controller pays {3}",
    'unless its controller pays {1}',
    // Stage P51 (D-209, CR 107.14): energy counters.
    'unless you pay {E}{E}',
    'unless you pay {E}',
    // Nazgûl Battle-Mace (CR 119.4, 118.3): a payment of life.
    'unless that player pays 3 life',
    'unless you pay 2 life',
    "unless that creature's controller pays {3}",
    // Gitrog Monster (CR 701.21a, 118.12a): a permanent sacrificed to stop the instruction.
    'unless you sacrifice a land',
    'unless you sacrifice a creature',
    // Mogis, God of Slaughter (CR 701.21a, 118.12a): the player the trigger is about sacrifices a permanent of their choice.
    'unless they sacrifice a creature of their choice',
    'unless they sacrifice a creature',
    'unless that player sacrifices a creature',
    'unless that player sacrifices a land of their choice',
  ],
  rejects: [
    'unless they sacrifice another creature',
    'unless they sacrifice two creatures',
    'unless they sacrifice ~',
    'unless they sacrifice',
    'unless that player sacrifice a creature',
    'unless that player sacrifices',
    'unless they sacrifices a creature',
    'unless they sacrifice a creature of your choice',
    'unless you sacrifice ~',
    'unless you sacrifice another creature',
    'unless you sacrifice two lands',
    'unless you sacrifice a land and a creature',
    'unless you sacrifice',
    'unless that player pays {X}',
    'unless that player pays 0 life',
    'unless that player pays X life',
    'unless that player pays life',
    'unless that player pays',
    'unless that player discards a card',
    'unless any opponent pays {1}',
    'unless an opponent pays {1}',
    'unless its owner pays {1}',
    'unless its controller pay {1}',
    'unless its controller pays {X}',
    'unless that player pays {R/W}',
    'unless that player pays {1} or discards a card',
    'if that player pays {1}',
    'unless you pays {1}',
    'unless that player pay {1}',
  ],
  parse: (ctx, pos) => {
    // Gitrog Monster (CR 701.21a, 118.12a): "unless you sacrifice a land": the payer sacrifices a permanent they control that matches, which the engine's `unlessPays` asks as it
    // asks Ward—Sacrifice. One permanent of a kind, never the permanent itself, another permanent or several.
    // Mogis, God of Slaughter (CR 701.21a, 118.12a, 608.2d): "unless they sacrifice a creature of their choice", "unless that player sacrifices a creature": the same payment by the player the
    // text names, who chooses the permanent (the engine asks them as it asks Ward—Sacrifice). One permanent of a kind, never the permanent itself, another permanent or several.
    const theirs = sequence(
      choice(
        map(spanned(literal('unless they sacrifice ')), ({ span }) => anaphor(span, 'they')),
        map(spanned(literal('unless that player sacrifices ')), ({ span }) =>
          anaphor(span, 'that player'),
        ),
      ),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.a-permanent'] }),
        (what) =>
          what.det === 'a' && what.count === undefined && !what.other && what.anyNumber !== true,
      ),
      optional(literal(' of their choice'), null),
    )(ctx, pos);
    if (theirs.ok) {
      const [who, what] = theirs.value;
      const cost: IrCost = {
        kind: 'sacrifice',
        what,
        span: what.span,
        rule: 'condition.unless-pays',
      };
      return {
        ok: true,
        value: {
          kind: 'condition',
          test: { kind: 'unlessPays', who: { ...who, span: who.span }, cost: [cost] },
          span: { start: pos, end: theirs.pos },
          rule: 'condition.unless-pays',
        },
        pos: theirs.pos,
      };
    }
    const sacrificed = sequence(
      literal('unless you '),
      satisfy(
        spanned(family<IrCost>('cost', { only: ['cost.sacrifice'] })),
        ({ value }) =>
          value.kind === 'sacrifice' &&
          value.what.det === 'a' &&
          value.what.count === undefined &&
          !value.what.other &&
          value.also === undefined &&
          value.what.anyNumber !== true,
      ),
    )(ctx, pos);
    if (sacrificed.ok) {
      const [, cost] = sacrificed.value;
      const span = { start: pos + 'unless '.length, end: pos + 'unless you'.length };
      return {
        ok: true,
        value: {
          kind: 'condition',
          test: {
            kind: 'unlessPays',
            who: {
              kind: 'noun',
              det: 'you',
              filter: { raw: 'you' },
              upTo: false,
              plural: false,
              other: false,
              span,
              rule: 'condition.unless-pays',
            },
            cost: [cost.value],
          },
          span: { start: pos, end: sacrificed.pos },
          rule: 'condition.unless-pays',
        },
        pos: sacrificed.pos,
      };
    }
    const r = sequence(
      literal('unless '),
      PAYER,
      spanned(
        choice(
          family<IrCost>('cost', { only: ['cost.mana', 'cost.energy'] }),
          // "unless that player pays 3 life" (Nazgûl Battle-Mace, CR 119.4): the engine's `payLife`, which `unlessPays` runs for the player.
          map(
            sequence(
              satisfy(
                family<IrAmount>('amount', { only: ['amount.number'] }),
                (amount) => amount.kind === 'number' && amount.value >= 1,
              ),
              literal(' life'),
            ),
            ([amount]): IrCost => ({
              kind: 'payLife',
              amount,
              span: amount.span,
              rule: 'condition.unless-pays',
            }),
          ),
        ),
      ),
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
