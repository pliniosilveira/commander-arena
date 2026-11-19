/**
 * Effect rules of the Multiverse Reforged deck (issue 81): the reveals of another player's library (CR 701.20, 401.4), Jhoira, Weatherlight Corsair and Proteus Staff.
 */
import { literal, satisfy, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.player-reveals-until-you-put`: "target opponent reveals cards from the top of their library until they reveal a historic permanent card. You put that card onto the battlefield under
 * your control and lose life equal to that permanent's mana value. That player puts the rest of the revealed cards on the bottom of their library in a random order" (CR 701.20, 401.4,
 * 110.2a, 119.3): three sentences that `splitSentences` keeps together. The engine's `revealUntil` of the library of that player (`from`) that leaves the card found where it is, the
 * `moveToZone` of that card onto the battlefield under the controller's control (an Aura it could be asks what it enchants, CR 303.4f), and the life lost. Not read: another player,
 * another place, another life amount, the rest in another order.
 */
export const EFFECT_PLAYER_REVEALS_UNTIL_YOU_PUT = defineRule<Clauses>({
  id: 'effect.player-reveals-until-you-put',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 401.4 (Library)',
    'CR 110.2a (Permanents)',
    'CR 119.3 (Life)',
    'CR 303.4f (Auras)',
  ],
  examples: [
    "target opponent reveals cards from the top of their library until they reveal a historic permanent card. You put that card onto the battlefield under your control and lose life equal to that permanent's mana value. That player puts the rest of the revealed cards on the bottom of their library in a random order",
    "target opponent reveals cards from the top of their library until they reveal a creature card. You put that card onto the battlefield under your control and lose life equal to that permanent's mana value. That player puts the rest of the revealed cards on the bottom of their library in a random order",
  ],
  rejects: [
    'target opponent reveals cards from the top of their library until they reveal a historic permanent card',
    "target player reveals cards from the top of their library until they reveal a historic permanent card. You put that card onto the battlefield under your control and lose life equal to that permanent's mana value. That player puts the rest of the revealed cards on the bottom of their library in a random order",
    "target opponent reveals cards from the top of their library until they reveal a historic permanent card. You put that card into your hand and lose life equal to that permanent's mana value. That player puts the rest of the revealed cards on the bottom of their library in a random order",
    'target opponent reveals cards from the top of their library until they reveal a historic permanent card. You put that card onto the battlefield under your control and lose 2 life. That player puts the rest of the revealed cards on the bottom of their library in a random order',
    "target opponent reveals cards from the top of their library until they reveal a historic permanent card. You put that card onto the battlefield under your control and lose life equal to that permanent's mana value. That player puts the rest of the revealed cards on the bottom of their library in any order",
  ],
  parse: single(
    'effect.player-reveals-until-you-put',
    sequence(
      // "Target opponent" only: the target of the ability is one opponent.
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (noun) => noun.det === 'target' && noun.filter.player === 'opponent',
      ),
      literal(' reveals cards from the top of their library until they reveal '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      literal(
        ". you put that card onto the battlefield under your control and lose life equal to that permanent's mana value. that player puts the rest of the revealed cards on the bottom of their library in a random order",
      ),
    ),
    ([player, , card]) => ({
      verb: 'revealUntilTakeAndLoseLife',
      args: { player, card: { ...card, upTo: false, plural: false } },
    }),
  ),
});

/**
 * `effect.controller-reveals-until-puts`: "that creature's controller reveals cards from the top of their library until they reveal a creature card. The player puts that card onto the
 * battlefield and the rest on the bottom of their library in any order" (CR 701.20, 401.4, 110.2a, 608.2h: the controller of the creature an earlier instruction named, as it last was). The
 * engine's `revealUntil` of that player's library, the card put under that player's control and the owner of the library choosing the order of the rest. Not read: another player,
 * another place, the rest in a random order.
 */
export const EFFECT_CONTROLLER_REVEALS_UNTIL_PUTS = defineRule<Clauses>({
  id: 'effect.controller-reveals-until-puts',
  family: 'effect',
  leading: ['that'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 401.4 (Library)',
    'CR 110.2a (Permanents)',
    'CR 608.2h (Resolving Spells and Abilities)',
  ],
  examples: [
    'that creature’s controller reveals cards from the top of their library until they reveal a creature card. The player puts that card onto the battlefield and the rest on the bottom of their library in any order',
  ],
  rejects: [
    'that creature’s controller reveals cards from the top of their library until they reveal a creature card',
    'that creature’s controller reveals cards from the top of their library until they reveal a creature card. The player puts that card into their hand and the rest on the bottom of their library in any order',
    'that creature’s controller reveals cards from the top of their library until they reveal a creature card. The player puts that card onto the battlefield and the rest on the bottom of their library in a random order',
    'that player reveals cards from the top of their library until they reveal a creature card. The player puts that card onto the battlefield and the rest on the bottom of their library in any order',
  ],
  parse: single(
    'effect.controller-reveals-until-puts',
    sequence(
      family<IrNoun>('noun', { only: ['noun.its-controller'] }),
      literal(' reveals cards from the top of their library until they reveal '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      literal(
        '. the player puts that card onto the battlefield and the rest on the bottom of their library in any order',
      ),
    ),
    ([player, , card]) => ({
      verb: 'revealUntilPutsOwn',
      args: { player, card: { ...card, upTo: false, plural: false } },
    }),
  ),
});

export const REVEAL_UNTIL_OTHER_EFFECT_RULES = [
  EFFECT_PLAYER_REVEALS_UNTIL_YOU_PUT,
  EFFECT_CONTROLLER_REVEALS_UNTIL_PUTS,
];
