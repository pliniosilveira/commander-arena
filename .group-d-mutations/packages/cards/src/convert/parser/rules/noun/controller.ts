/**
 * `noun.its-controller`: "its controller", "that creature's controller": the player who controls an
 * object an earlier sentence named (CR 109.4: objects on the stack or the battlefield have a
 * controller; CR 608.2h: an object that has left is read from its last known information). The
 * object is a pronoun like any other, left to the binding pass; this rule only says that the
 * player is "whoever controls it".
 */
import { fail, type Parser, pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule } from '../registry';

const OBJECT_WORDS = 'creature|permanent|land|artifact|enchantment|planeswalker';

const ITS_CONTROLLER = new RegExp(
  `(its|that (?:${OBJECT_WORDS})['’]s) controller(?![\\p{L}\\p{N}])`,
  'iu',
);

/** The pronoun the possessive stands for: "it" for "its", "that creature" for "that creature's". */
export function possessedNoun(rule: string, head: string, start: number): IrNoun {
  const word = head.toLowerCase() === 'its' ? head.slice(0, 2) : head.slice(0, head.length - 2);
  return {
    kind: 'noun',
    det: 'anaphor',
    filter: { raw: word.toLowerCase() },
    upTo: false,
    plural: false,
    other: false,
    span: { start, end: start + word.length },
    rule,
  };
}

export const NOUN_ITS_CONTROLLER = defineRule<IrNoun>({
  id: 'noun.its-controller',
  family: 'noun',
  leading: ['its', 'that'],
  cites: ['CR 109.4 (Objects)', 'CR 608.2h (Resolving Spells and Abilities)'],
  examples: [
    'its controller',
    "that creature's controller",
    'that permanent’s controller',
    'Its controller',
  ],
  rejects: [
    'its owner',
    'its controllers',
    'it controller',
    'that player',
    "that player's controller",
    'target creature’s controller',
    'its',
  ],
  parse: ((ctx, pos) => {
    const m = pattern(ITS_CONTROLLER)(ctx, pos);
    if (!m.ok) return fail(ctx, pos);
    const head = m.value[1] ?? '';
    const of = possessedNoun('noun.its-controller', head, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'controllerOf',
      filter: { raw: ctx.text.slice(pos, m.pos) },
      upTo: false,
      plural: false,
      other: false,
      of,
      span: { start: pos, end: m.pos },
      rule: 'noun.its-controller',
    };
    return { ok: true, value: noun, pos: m.pos };
  }) satisfies Parser<IrNoun>,
});
