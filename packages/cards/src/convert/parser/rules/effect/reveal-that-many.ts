/**
 * Effect rule of the Multiverse Reforged deck (issue 81): "reveal cards from the top of your library until you reveal that many creature cards" after an instruction that exiled
 * creatures (Mass Polymorph), CR 701.20 Reveal, 701.24 Shuffle, 608.2c.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { NO_PARTS, toFilter } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.reveal-until-that-many';

/**
 * `effect.reveal-until-that-many`: "reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed this way onto the battlefield,
 * then shuffle the rest of the revealed cards into your library" (CR 701.20, 701.24, 608.2c: the cards are revealed one at a time until as many creature cards as an earlier instruction
 * exiled have been revealed, all of them if the library runs out first; the rest stay in the library, which is then shuffled). The engine's `revealUntil` with a `count` and `rest: 'stay'`,
 * then a `shuffle`; the lowering refuses the clause after any instruction but an exile.
 */
export const EFFECT_REVEAL_UNTIL_THAT_MANY = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 701.24 (Shuffle)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library',
  ],
  rejects: [
    'reveal cards from the top of your library until you reveal that many creature cards',
    'reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed this way onto the battlefield',
    'reveal cards from the top of your library until you reveal that many land cards. Put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library',
    'reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed this way onto the battlefield tapped, then shuffle the rest of the revealed cards into your library',
    'reveal cards from the top of your library until you reveal that many creature cards. Put all creature cards revealed this way onto the battlefield and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal many creature cards. Put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library',
    'reveal cards from the top of your library until you reveal X creature cards. Put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library',
  ],
  parse: single(
    ID,
    sequence(
      literal('reveal cards from the top of your library until you reveal that many '),
      spanned(literal('creature')),
      literal(' '),
      pattern(
        /cards\. put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, kind]) => ({
      verb: 'revealUntilThatMany',
      args: {
        card: {
          kind: 'noun',
          det: 'a',
          filter: {
            ...toFilter('library', { ...NO_PARTS, types: ['creature'] }, 'creature cards'),
            card: true,
          },
          upTo: false,
          plural: true,
          other: false,
          span: kind.span,
          rule: ID,
        } satisfies IrNoun,
      },
    }),
  ),
});

export const REVEAL_THAT_MANY_EFFECT_RULES = [EFFECT_REVEAL_UNTIL_THAT_MANY];
