/**
 * "If a creature would die, instead exile it" (stage P29, D-133, CR 614.1a, 700.4): a replacement effect of a permanent on the
 * battlefield that changes where a creature goes when it would be put into a graveyard from the battlefield, with the
 * tokens its controller creates in its place. The kind of creature is any permanent phrase of the noun family ("a nontoken
 * creature an opponent controls", "a Zombie you control", "a creature"), so the rule names no type.
 */
import { choice, fail, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrNoun, IrToken } from '../../ir/types';
import { CREATURE_TYPES } from '../noun/creature-types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { replacement } from './shared';

/**
 * `replacement.would-die`: "If a nontoken creature an opponent controls would die, instead exile that card and create a
 * 2/2 black Zombie creature token.", "If a creature would die, instead exile that card.", "If a Zombie you control would die,
 * exile it instead." (CR 614.1a: "instead" replaces the event; CR 700.4: "dies" is a battlefield-to-graveyard move; CR
 * 614.12: the permanent with the ability replaces the deaths of creatures that die at the same time as it). The creature
 * is exiled and never dies; the controller of the permanent creates the token. Only a creature "would die": a permanent
 * that is not a creature, a different zone and "would be put into a graveyard" are other events.
 */
export const REPLACEMENT_WOULD_DIE = defineRule<IrAbility>({
  id: 'replacement.would-die',
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 700.4 (General)',
    'CR 614.12 (Replacement Effects)',
    'CR 111.2 (Tokens)',
  ],
  examples: [
    'If a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie creature token.',
    'If a creature would die, instead exile that card.',
    'If a Zombie you control would die, instead exile that card and create a 1/1 white Spirit creature token with flying.',
    'If a creature would die, exile it instead.',
    'If a nontoken Time Lord would die, instead exile that card.',
    'If a nontoken creature an opponent controls would die, instead exile that card and create two 2/2 black Zombie creature tokens.',
  ],
  rejects: [
    'If a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie creature token',
    'If a creature would die, instead exile that card and create a Treasure token for each creature you control.',
    'If a creature would die, instead return it to its owner’s hand.',
    'If a land would die, instead exile that card.',
    'If a creature would be put into a graveyard from the battlefield, instead exile that card.',
    'If a creature would die, instead exile that card and draw a card.',
    'If creatures would die, instead exile them.',
    'If a creature would die, instead exile that card. Draw a card.',
    'If ~ would die, instead exile that card.',
    'If a creature would die, exile that card instead and create a 2/2 black Zombie creature token.',
    'If you would die, instead exile that card.',
  ],
  parse: (ctx, pos) => {
    const id = 'replacement.would-die';
    const head = sequence(
      literal('if '),
      pattern(/an? /i),
      spanned(map(permanentPhrase(false, 'all'), withoutZone)),
      literal(' would die, '),
    )(ctx, pos);
    if (!head.ok) return head;
    const { value: filter, span: nounSpan } = head.value[2];
    // A creature: a "creature" or a creature type of the table; a land or an Equipment does not die (CR 700.4).
    const creature =
      filter.anyOf === undefined &&
      ((filter.types?.length === 1 && filter.types[0] === 'creature') ||
        ((filter.types?.length ?? 0) === 0 &&
          (filter.subtypes ?? []).length > 0 &&
          (filter.subtypes ?? []).every((t) => CREATURE_TYPES.has(t))));
    if (!creature) return fail(ctx, pos);
    const tail = sequence(
      choice(
        map(
          sequence(
            literal('instead exile that card'),
            optional(
              map(
                sequence(
                  literal(' and create '),
                  family<IrToken>('token', { only: ['token.predefined', 'token.custom'] }),
                ),
                ([, token]) => token,
              ),
              null,
            ),
          ),
          ([, token]) => token,
        ),
        map(literal('exile it instead'), () => null),
      ),
      literal('.'),
    )(ctx, head.pos);
    if (!tail.ok) return tail;
    const [token] = tail.value;
    const span = { start: pos, end: tail.pos };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: false,
      other: false,
      span: nounSpan,
      rule: id,
    };
    const event: IrClause = {
      kind: 'clause',
      verb: 'wouldDie',
      args: token === null ? { objects } : { objects, token },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: replacement(id, span, event), pos: tail.pos };
  },
});

export const DIE_REPLACEMENT_RULES = [REPLACEMENT_WOULD_DIE];
