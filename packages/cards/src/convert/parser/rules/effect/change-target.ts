/**
 * Changing a target (stage P38; D-182): "Change the target of target spell or ability with a single target." and "Change the target of target spell
 * with a single target." (CR 115.7a: an effect that allows a player to change the target of a spell or ability, which can be changed only to another
 * legal target; CR 115.9a: a spell or ability "with a single target" was put on the stack with exactly one target). One clause, `changeTarget`, with
 * the spell or ability as a target of the stack; the lowering builds the engine's `changeTarget`.
 *
 * Also "Change a target of target spell or ability to ~." (CR 115.7b, unchecked against the CR text; Spellskite): one target of any spell or ability becomes the source.
 *
 * Not read: "Change the targets of ..." (CR 115.7c: another effect), "change a target" to anything but ~, a spell or ability with no such condition
 * ("Change the target of target spell"), a spell with a quality ("target instant spell with a single target"), "to ~" (the new target is named),
 * "you may" and any other instruction after it.
 */
import { choice, literal, map, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, node, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/** "target spell or ability with a single target": a spell or ability on the stack that has one target. */
const TARGET_SPELL_OR_ABILITY = node<RegExpExecArray, IrNoun>(
  'effect.change-target',
  pattern(
    new RegExp(
      `target (spell or ability|spell|activated or triggered ability) with a single target${BOUNDARY}`,
      'iu',
    ),
  ),
  (m): Omit<IrNoun, 'span' | 'rule'> => {
    const kind = (m[1] ?? '').toLowerCase();
    return {
      kind: 'noun',
      det: 'target',
      filter: {
        zone: 'stack',
        singleTarget: true,
        ...(kind === 'spell' ? { stackKind: 'spell' as const } : {}),
        ...(kind === 'activated or triggered ability' ? { stackKind: 'ability' as const } : {}),
        raw: m[0],
      },
      upTo: false,
      plural: false,
      other: false,
    };
  },
);

/** "target spell or ability" with no condition, for "change a target of ... to ~" (CR 115.7b): any number of targets. */
const ANY_TARGET_SPELL_OR_ABILITY = node<RegExpExecArray, IrNoun>(
  'effect.change-target',
  pattern(/target spell or ability(?= to ~)/iu),
  (m): Omit<IrNoun, 'span' | 'rule'> => ({
    kind: 'noun',
    det: 'target',
    filter: { zone: 'stack', raw: m[0] },
    upTo: false,
    plural: false,
    other: false,
  }),
);

/** "~": the permanent the ability belongs to, the new target. */
function selfNoun(span: IrNoun['span']): IrNoun {
  return {
    kind: 'noun',
    det: 'self',
    filter: { raw: '~' },
    upTo: false,
    plural: false,
    other: false,
    span,
    rule: 'effect.change-target',
  };
}

/** What may follow on the same clause: a join says a second instruction, which is not read. */
const CLAUSE_END = pattern(/(?=\.|$)/u);

export const EFFECT_CHANGE_TARGET = defineRule<Clauses>({
  id: 'effect.change-target',
  family: 'effect',
  leading: ['change'],
  cites: [
    'CR 115.7a (Targets)',
    'CR 115.9a (Targets)',
    'CR 608.2b (Resolving Spells and Abilities)',
  ],
  examples: [
    'change the target of target spell or ability with a single target',
    'change the target of target spell with a single target',
    'change the target of target activated or triggered ability with a single target',
    'change a target of target spell or ability to ~',
  ],
  rejects: [
    'change a target of target spell or ability with a single target',
    'change a target of target spell or ability to that creature',
    'change a target of target spell or ability to ~ and draw a card',
    'change the targets of target spell or ability with a single target',
    'change the target of target spell or ability',
    'change the target of target spell',
    'change the target of target instant spell with a single target',
    'change the target of target spell or ability with a single target to ~',
    'change the target of target spell or ability with a single target and draw a card',
    'change the target of target spell or ability with two targets',
    'change the target of that spell',
    'change the target of target creature with a single target',
    'change the target of',
  ],
  parse: (ctx, pos) =>
    choice(
      map(
        spanned(sequence(literal('change the target of '), TARGET_SPELL_OR_ABILITY, CLAUSE_END)),
        ({ value, span }): Clauses => [
          makeClause('effect.change-target', 'changeTarget', { object: value[1] }, span),
        ],
      ),
      map(
        spanned(
          sequence(
            literal('change a target of '),
            ANY_TARGET_SPELL_OR_ABILITY,
            literal(' to ~'),
            CLAUSE_END,
          ),
        ),
        ({ value, span }): Clauses => [
          makeClause(
            'effect.change-target',
            'changeTarget',
            { object: value[1], to: selfNoun(span) },
            span,
          ),
        ],
      ),
    )(ctx, pos),
});
