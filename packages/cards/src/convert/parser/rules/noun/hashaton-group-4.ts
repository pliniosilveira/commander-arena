/**
 * Noun rules of group 4 of the Hashaton deck (issue 31, D-369): "Zombie tokens you control" (CR 111.1, 205.3m, 110.1), the subject of "Zombie tokens you control have
 * hexproof and menace."
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { CREATURE_TYPES } from './creature-types';
import { NO_PARTS, toFilter } from './phrases';
import { SUBTYPE_WORD_NUMBERED } from './subtypes';

/**
 * `noun.subtype-token-permanents`: "Zombie tokens you control", "Soldier tokens you control": a plural group of the controller's tokens that have a creature type
 * (CR 111.1: a token is a permanent that is not represented by a card; CR 205.3m: the type is a creature type, so the tokens are creatures). The type is said in
 * the singular, as an adjective, and it names the type, not the card type: the group is the tokens that have it, whatever else they are. The group is whatever
 * matches at any moment (CR 611.3a), as for `noun.token-permanents`. Not read: the plural of the type ("Zombies tokens"), a type that is no creature type
 * ("Treasure tokens"), "other", the singular, "target", a controller other than "you", no controller, a second type.
 */
export const NOUN_SUBTYPE_TOKEN_PERMANENTS = defineRule<IrNoun>({
  id: 'noun.subtype-token-permanents',
  family: 'noun',
  leading: [],
  cites: [
    'CR 111.1 (Tokens)',
    'CR 205.3m (Subtypes)',
    'CR 110.1 (Permanents)',
    'CR 611.3a (Continuous Effects)',
  ],
  examples: ['Zombie tokens you control', 'Soldier tokens you control', 'Elf tokens you control'],
  rejects: [
    'Zombie token you control',
    'Zombies tokens you control',
    'Treasure tokens you control',
    'Other Zombie tokens you control',
    'Zombie tokens your opponents control',
    'Zombie tokens',
    'Target Zombie tokens you control',
    'Zombie Wizard tokens you control',
    'tokens you control',
    'creature tokens you control',
    'Zombie creature tokens you control',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.subtype-token-permanents',
    (ctx, pos) => {
      const r = sequence(
        SUBTYPE_WORD_NUMBERED,
        literal(' '),
        pattern(/tokens you control(?![\p{L}\p{N}'’])/iu),
      )(ctx, pos);
      if (!r.ok) return r;
      const [word] = r.value;
      // A creature type said in the singular ("Zombie"); the plural of it, and a type of another kind of permanent, are other phrases.
      if (!CREATURE_TYPES.has(word.subtype) || word.plural === true) return fail(ctx, pos);
      const raw = ctx.text.slice(pos, r.pos);
      const base = toFilter('battlefield', { ...NO_PARTS, token: true, controller: 'you' }, raw);
      return { ok: true, value: { ...base, subtypes: [word.subtype] }, pos: r.pos };
    },
    (filter) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const HASHATON_GROUP_4_NOUN_RULES = [NOUN_SUBTYPE_TOKEN_PERMANENTS];
