/**
 * Noun rules of the Ahoy Mateys deck, group 4: "each other creature you control that's a Skeleton or Pirate" (Skeleton Crew) and "each creature you control but don't own"
 * (Don Andres, the Renegade): the subjects of a static ability, whatever matches at any moment (CR 611.3a), read from the types the creatures have and from their owners.
 */
import { fail, pattern } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { CREATURE_TYPES } from './creature-types';

/**
 * `noun.each-creature-that-is-subtype-or-subtype`: "each other creature you control that's a Skeleton or Pirate": the creatures the controller has that have one creature
 * type or the other (CR 205.3m), the engine's `anyOf` of two subtypes under the card type and the controller; "other" leaves out the permanent with the ability. Not read: another
 * controller, one type or three, a word that is no creature type (or one not written with a capital), the same type twice, a card type other than creatures.
 */
export const NOUN_EACH_CREATURE_THAT_IS_SUBTYPES = defineRule<IrNoun>({
  id: 'noun.each-creature-that-is-subtype-or-subtype',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 205.3m (Subtypes)', 'CR 611.3a (Continuous Effects)'],
  examples: [
    "each other creature you control that's a Skeleton or Pirate",
    'each creature you control that’s a Zombie or Vampire',
  ],
  rejects: [
    "each creature that's a Skeleton or Pirate",
    "each creature an opponent controls that's a Skeleton or Pirate",
    "each creature you control that's a Skeleton",
    "each creature you control that's a Skeleton or Pirate or Elf",
    "each creature you control that's a Skeleton or Skeleton",
    "each creature you control that's a Skeleton or pirate",
    "each creature you control that's a Skeleton or Banana",
    "each artifact you control that's a Skeleton or Pirate",
    "each creatures you control that's a Skeleton or Pirate",
  ],
  parse: node<{ filter: IrFilter; other: boolean }, IrNoun>(
    'noun.each-creature-that-is-subtype-or-subtype',
    (ctx, pos) => {
      const r = pattern(
        /each (other )?creature you control that['’]s an? ([A-Z][\p{L}'’-]*) or ([A-Z][\p{L}'’-]*)(?![\p{L}\p{N}'’-])(?! or )/iu,
      )(ctx, pos);
      if (!r.ok) return r;
      const first = r.value[2] ?? '';
      const second = r.value[3] ?? '';
      if (!/^[A-Z]/u.test(first) || !/^[A-Z]/u.test(second)) return fail(ctx, pos);
      if (first === second || !CREATURE_TYPES.has(first) || !CREATURE_TYPES.has(second)) {
        return fail(ctx, pos);
      }
      const raw = r.value[0] ?? '';
      return {
        ok: true,
        value: {
          filter: {
            zone: 'battlefield',
            types: ['creature'],
            controller: 'you',
            anyOf: [
              { subtypes: [first], raw: first },
              { subtypes: [second], raw: second },
            ],
            raw,
          },
          other: r.value[1] !== undefined,
        },
        pos: r.pos,
      };
    },
    ({ filter, other }) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other,
    }),
  ),
});

/**
 * `noun.each-creature-you-control-but-dont-own`: "each creature you control but don't own": the creatures the controller controls whose owner is another player (CR 108.3,
 * 110.2: a creature under a player's control by an effect; a token is owned by the player who created it), the engine's `notOwnedByYou` under the card type and the controller.
 * Not read: another controller, "other", "do not own", another card type, the plain "each creature you control".
 */
export const NOUN_EACH_CREATURE_NOT_OWNED = defineRule<IrNoun>({
  id: 'noun.each-creature-you-control-but-dont-own',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 108.3 (Owner)', 'CR 611.3a (Continuous Effects)'],
  examples: ["each creature you control but don't own", 'each creature you control but don’t own'],
  rejects: [
    'each creature you control',
    "each creature but don't own",
    "each creature an opponent controls but don't own",
    "each other creature you control but don't own",
    "each creature you control but you don't own",
    "each creature you control but doesn't own",
    "each artifact you control but don't own",
    "each creatures you control but don't own",
  ],
  parse: node<{ filter: IrFilter }, IrNoun>(
    'noun.each-creature-you-control-but-dont-own',
    (ctx, pos) => {
      const r = pattern(/each creature you control but don['’]t own(?![\p{L}\p{N}'’])/iu)(ctx, pos);
      if (!r.ok) return r;
      return {
        ok: true,
        value: {
          filter: {
            zone: 'battlefield',
            types: ['creature'],
            controller: 'you',
            notOwnedByYou: true,
            raw: r.value[0] ?? '',
          },
        },
        pos: r.pos,
      };
    },
    ({ filter }) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const AHOY_G4_NOUN_RULES = [
  NOUN_EACH_CREATURE_THAT_IS_SUBTYPES,
  NOUN_EACH_CREATURE_NOT_OWNED,
];
