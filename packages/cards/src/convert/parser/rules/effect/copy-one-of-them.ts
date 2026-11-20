/**
 * Effect rule of Twilight Diviner (Meren deck): "create a token that's a copy of one of them" (CR 603.2c, 608.2d, 707.2, 111.4) of the permanents a trigger about one or more permanents is
 * about. The engine runs `copyOneOfTriggerCards` (`rules/populate.ts`); what can be lowered is the lowering's business (`lower/copy-one-of-them.ts`).
 */
import { pattern } from '../../combinators';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.copy-one-of-them';

/**
 * `effect.copy-one-of-them`: "create a token that's a copy of one of them" (CR 707.2: the token has the copiable values of the permanent chosen; "them" are the permanents of the batch that
 * triggered the ability). Only these words. Not read: another number ("two of them"), "of it", "of target creature", "each of them", an exception ("except it ..."), more words after.
 */
export const EFFECT_COPY_ONE_OF_THEM = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['create'],
  cites: [
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 707.2 (Copying Objects)',
    'CR 111.4 (Tokens)',
  ],
  examples: [
    "create a token that's a copy of one of them",
    'create a token that’s a copy of one of them',
    "Create a token that's a copy of one of them",
  ],
  rejects: [
    "create a token that's a copy of one of those creatures",
    "create a token that's a copy of two of them",
    "create a token that's a copy of it",
    "create a token that's a copy of each of them",
    "create a token that's a copy of target creature",
    "create a token that's a copy of one of them, except it's a Zombie",
    "create a token that's a copy of one of them and draw a card",
    'create two tokens that are copies of one of them',
    "create a token that's a copy of one of them tapped",
  ],
  parse: single(
    ID,
    pattern(
      new RegExp(
        `create a token that['’]s a copy of one of them${BOUNDARY}(?!\\s*,)(?!\\s+(?:and|then|tapped|except)${BOUNDARY})`,
        'iu',
      ),
    ),
    () => ({ verb: 'copyOneOfThem', args: {} }),
  ),
});

export const COPY_ONE_OF_THEM_EFFECT_RULES = [EFFECT_COPY_ONE_OF_THEM].map(quietly);
