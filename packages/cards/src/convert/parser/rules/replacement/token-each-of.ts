/**
 * Replacement rule of the Most Wanted deck, group 2 (mana and Treasure): Academy Manufactor, "If you would create a Clue, Food, or Treasure token, instead create one of each."
 * (CR 614.1a, 111.2, 614.5), the engine's `tokensInstead` in `eachOf` mode.
 */
import { literal, sequence } from '../../combinators';
import type { IrAbility, IrClause, IrFilter, IrNoun } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { replacement } from './shared';

const ID = 'replacement.tokens-each-of';

/** The three tokens the rule names, in the order the card prints them. */
const NAMED = ['Clue', 'Food', 'Treasure'] as const;

/**
 * `replacement.tokens-each-of`: "If you would create a Clue, Food, or Treasure token, instead create one of each." (CR 614.1a, 111.2, 614.5, 616.1: each Clue, Food or Treasure token the
 * controller of the permanent would create is replaced by a Clue, a Food and a Treasure; the replacement applies once to an event, so two make three times as many of each). The engine's
 * `tokensInstead` in `eachOf` mode: the tokens are the ones the text names, as the filter of a group of tokens with no controller of its own (the controller is the player of the
 * permanent). Not read: other tokens or another list ("a Treasure or Food token"), another player, "one of each" for another count, a missing period or "instead".
 */
export const REPLACEMENT_TOKENS_EACH_OF = defineRule<IrAbility>({
  id: ID,
  family: 'replacement',
  leading: ['if'],
  cites: [
    'CR 614.1a (Replacement Effects)',
    'CR 111.2 (Tokens)',
    'CR 614.5 (Replacement Effects)',
    'CR 616.1 (Interaction of Replacement and/or Prevention Effects)',
  ],
  examples: ['If you would create a Clue, Food, or Treasure token, instead create one of each.'],
  rejects: [
    'If you would create a Clue, Food, or Treasure token, instead create one of each',
    'If you would create a Clue, Food, or Treasure token, create one of each.',
    'If you would create a Clue, Food, or Treasure token, instead create two of each.',
    'If you would create a Clue or Treasure token, instead create one of each.',
    'If you would create a Treasure, Food, or Clue token, instead create one of each.',
    'If an opponent would create a Clue, Food, or Treasure token, instead create one of each.',
    'If you would create a Clue, Food, or Treasure token, instead create one of each. Draw a card.',
    'If you would create a Clue, Food, or Treasure token, instead create a Blood token.',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('if you would create a Clue, Food, or Treasure token, instead create one of each'),
      literal('.'),
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    const member = (subtype: string): IrFilter => ({ subtypes: [subtype], raw: subtype });
    const what: IrNoun = {
      kind: 'noun',
      det: 'each',
      filter: { token: true, anyOf: NAMED.map(member), raw: 'a Clue, Food, or Treasure token' },
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: ID,
    };
    const event: IrClause = {
      kind: 'clause',
      verb: 'tokensInstead',
      args: { what, eachOf: { kind: 'flag', value: true, span, rule: ID } },
      optional: false,
      span,
      rule: ID,
    };
    return { ok: true, value: replacement(ID, span, event), pos: r.pos };
  },
});

export const TOKEN_EACH_OF_REPLACEMENT_RULES = [REPLACEMENT_TOKENS_EACH_OF].map(quietly);
