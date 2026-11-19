/**
 * Trigger rules of group E of the Quandrix Unlimited deck: the cast triggers that look at an {X} in the mana cost of the spell (CR 107.3, 202.1, 601.2i, 603.2): "you cast a spell with {X}
 * in its mana cost", "you cast a permanent spell with a mana cost that contains {X}" and "you cast your first spell with {X} in its mana cost each turn".
 */
import { choice, fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrFilter, IrTrigger } from '../../ir/types';
import { spellPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/** " with {X} in its mana cost", " with a mana cost that contains {X}": the same condition, two ways of saying it. */
const WITH_X = pattern(
  new RegExp(
    ` with (?:\\{X\\} in its mana cost|a mana cost that contains \\{X\\})${NOT_IN_WORD}`,
    'iu',
  ),
);

const PERMANENT_TYPES = ['artifact', 'creature', 'enchantment', 'planeswalker', 'battle'];

/**
 * `trigger.cast-x`: "you cast a spell with {X} in its mana cost", "you cast a creature spell with {X} in its mana cost", "you cast a permanent spell with a mana cost that contains {X}",
 * "you cast your first spell with {X} in its mana cost each turn" (CR 601.2i: the ability triggers as the spell becomes cast; CR 107.3, 202.1: the cost has an {X}). The engine's `castSpell`
 * of the caster named, with the spell's `xInManaCost` and, for "your first ... each turn", `firstXSpellThisTurn`. A "permanent spell" is a spell of a type of permanent. Not read: another
 * caster, a count the text spells out, a spell that is not described by its cost and kinds, "each turn" without "first", "first" without "each turn".
 */
export const TRIGGER_CAST_X = defineRule<IrTrigger>({
  id: 'trigger.cast-x',
  family: 'trigger',
  leading: ['you'],
  cites: [
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 107.3 (Mana Cost)',
    'CR 202.1 (Mana Cost and Color)',
  ],
  examples: [
    'you cast a spell with {X} in its mana cost',
    'you cast a creature spell with {X} in its mana cost',
    'you cast a permanent spell with a mana cost that contains {X}',
    'you cast a spell with a mana cost that contains {X}',
    'you cast your first spell with {X} in its mana cost each turn',
  ],
  rejects: [
    'you cast a spell with {X}',
    'you cast a spell with {Y} in its mana cost',
    'you cast your first spell with {X} in its mana cost',
    'you cast your second spell with {X} in its mana cost each turn',
    'you cast their first spell with {X} in its mana cost each turn',
    'you cast a spell with {X} in its mana cost each turn',
    'you cast spells with {X} in their mana costs',
    'you cast an instant spell or a permanent spell with {X} in its mana cost',
    'you cast a spell with {X} in its mana cost or',
    'an opponent casts a spell with {X} in its mana cost',
    'you cast it with {X} in its mana cost',
    'you cast your first spell each turn',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.cast-x';
    // Only a text that names an {X} before its first comma is this trigger; any other stops where `trigger.cast` and `trigger.cast-nth` always stopped.
    const named = pattern(/(?=you cast [^,.]*\{X\})/u)(ctx, pos);
    if (!named.ok) return named;
    const youCast = map(spanned(literal('you cast ')), ({ span }) =>
      makeNoun(id, { start: span.start, end: span.start + 3 }, 'you', { raw: 'you' }),
    );
    // "a spell", "a creature spell" ... then the condition; or "a permanent spell" with the condition.
    const plain = sequence(
      pattern(/an? /iu),
      spanned(map(spellPhrase(), withoutZone)),
      WITH_X,
      pattern(/(?! each turn)/iu),
    );
    const permanent = sequence(
      pattern(/a /iu),
      spanned(pattern(new RegExp(`permanent spell${NOT_IN_WORD}`, 'iu'))),
      WITH_X,
      pattern(/(?! each turn)/iu),
    );
    const first = sequence(
      literal('your first '),
      spanned(pattern(new RegExp(`spell${NOT_IN_WORD}`, 'iu'))),
      WITH_X,
      pattern(new RegExp(` each turn${NOT_IN_WORD}`, 'iu')),
    );
    const r = sequence(
      youCast,
      choice(
        map(plain, ([, spell]) => ({
          span: spell.span,
          filter: { ...spell.value, xInManaCost: true as const } as IrFilter,
        })),
        map(permanent, ([, spell]) => ({
          span: spell.span,
          filter: {
            stackKind: 'spell',
            anyOf: PERMANENT_TYPES.map((t): IrFilter => ({ types: [t], raw: t })),
            xInManaCost: true,
            raw: 'permanent spell',
          } as IrFilter,
        })),
        map(first, ([, spell]) => ({
          span: spell.span,
          filter: {
            stackKind: 'spell',
            xInManaCost: true,
            firstXSpellThisTurn: true,
            raw: 'spell',
          } as IrFilter,
        })),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, spell] = r.value;
    if (actor.det !== 'you') return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'cast',
        subject: makeNoun(id, spell.span, 'a', spell.filter),
        actor,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const QUANDRIX_E_TRIGGER_RULES = [TRIGGER_CAST_X];
