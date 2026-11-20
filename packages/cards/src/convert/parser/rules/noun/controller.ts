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

const ITS_OWNER = new RegExp(`(its|that (?:${OBJECT_WORDS})['’]s) owner(?![\\p{L}\\p{N}'’])`, 'iu');

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

/**
 * `noun.its-owner`: "its owner", "that creature's owner" (Oft-Nabbed Goat, "its owner draws that many cards"; CR 108.3, 608.2h: the player who owns an object an earlier part of the
 * text named, read from its last-known information when it has left). The object is a pronoun like any other, left to the binding pass. The engine's `ownerOf`. Not read: "its
 * owners", "that player's owner", "target creature's owner", "its owner's" and a bare "its".
 */
export const NOUN_ITS_OWNER = defineRule<IrNoun>({
  id: 'noun.its-owner',
  family: 'noun',
  leading: ['its', 'that'],
  cites: ['CR 108.3 (Cards)', 'CR 608.2h (Resolving Spells and Abilities)'],
  examples: ['its owner', "that creature's owner", 'that permanent’s owner', 'Its owner'],
  rejects: [
    'its controller',
    'its owners',
    'it owner',
    'that player',
    "that player's owner",
    'target creature’s owner',
    'its',
    'its owner’s',
  ],
  parse: ((ctx, pos) => {
    const m = pattern(ITS_OWNER)(ctx, pos);
    if (!m.ok) return fail(ctx, pos);
    const head = m.value[1] ?? '';
    const of = possessedNoun('noun.its-owner', head, pos);
    const noun: IrNoun = {
      kind: 'noun',
      det: 'ownerOf',
      filter: { raw: ctx.text.slice(pos, m.pos) },
      upTo: false,
      plural: false,
      other: false,
      of,
      span: { start: pos, end: m.pos },
      rule: 'noun.its-owner',
    };
    return { ok: true, value: noun, pos: m.pos };
  }) satisfies Parser<IrNoun>,
});

/**
 * `noun.each-exiled-controller`: "for each creature exiled this way, its controller" (issue 279, Curse of the Swine; CR 109.4, 608.2c, 608.2h): the player who controls each creature the
 * instruction before it exiled, once for each creature (a player who controlled two is named twice). It stands for "those creatures' controllers", so the binding pass makes the group the
 * most recent plural object of the text (the targets of the exile) and the lowering reads one controller for each of them from last-known information. Not read: another verb ("destroyed",
 * "sacrificed"), "for each permanent", "its owner", "that creature's controller", the singular "that creature exiled", a missing "this way".
 */
export const NOUN_EACH_EXILED_CONTROLLER = defineRule<IrNoun>({
  id: 'noun.each-exiled-controller',
  family: 'noun',
  leading: ['for'],
  cites: [
    'CR 109.4 (Objects)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2h (Resolving Spells and Abilities)',
  ],
  examples: [
    'for each creature exiled this way, its controller',
    'For each creature exiled this way, its controller',
  ],
  rejects: [
    'for each creature destroyed this way, its controller',
    'for each permanent exiled this way, its controller',
    'for each creature exiled this way, its owner',
    "for each creature exiled this way, that creature's controller",
    'for each creature exiled this way its controller',
    'for each creature exiled, its controller',
    'each creature exiled this way, its controller',
    'for each creature exiled this way, its controllers',
  ],
  parse: ((ctx, pos) => {
    const m = pattern(/for each creature exiled this way, its controller(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!m.ok) return fail(ctx, pos);
    const end = m.pos;
    const of: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'those creatures' },
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end },
      rule: 'noun.each-exiled-controller',
    };
    const noun: IrNoun = {
      kind: 'noun',
      det: 'controllerOf',
      filter: { raw: ctx.text.slice(pos, end) },
      upTo: false,
      plural: false,
      other: false,
      of,
      span: { start: pos, end },
      rule: 'noun.each-exiled-controller',
    };
    return { ok: true, value: noun, pos: end };
  }) satisfies Parser<IrNoun>,
});
