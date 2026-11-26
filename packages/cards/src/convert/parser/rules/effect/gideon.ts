/**
 * Effect rule of the First Flight starter commander decks (Gideon Jura): "During target opponent's next turn, creatures that player controls attack ~ if able." (CR 508.1d).
 */
import { pattern, satisfy, sequence } from '../../combinators';
import type { IrFlag, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.require-attack-source`: "during target opponent's next turn, creatures that player controls attack ~ if able" (CR 508.1d, 611.2a, 611.2c: a requirement on the creatures a
 * chosen player controls, which changes the rules and no characteristic, so it reaches creatures that arrive later; it covers the next turn of that player, CR 500.1). The
 * creatures are "creatures that player controls", the player a target ("target opponent", "target player"), and what they attack is the permanent with the ability, which `~` is.
 * Not read: another group of creatures, another object they attack, "each combat", a player who is not a target, another duration.
 */
export const EFFECT_REQUIRE_ATTACK_SOURCE = defineRule<Clauses>({
  id: 'effect.require-attack-source',
  family: 'effect',
  leading: ['during'],
  cites: [
    'CR 508.1d (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
  ],
  examples: [
    "during target opponent's next turn, creatures that player controls attack ~ if able",
    "During target opponent's next turn, creatures that player controls attack ~ if able",
    "during target player's next turn, creatures that player controls attack ~ if able",
  ],
  rejects: [
    "during target opponent's next turn, creatures that player controls attack ~",
    "during target opponent's next turn, creatures that player controls attack target creature if able",
    "during target opponent's next turn, creatures you control attack ~ if able",
    "during target opponent's next turn, creatures that player controls attack ~ each combat if able",
    "during target opponent's next turn, creature that player controls attacks ~ if able",
    "during target opponent's next turn, creatures that player controls attack ~ if able and draw a card",
    "during each opponent's next turn, creatures that player controls attack ~ if able",
    "during target opponent's turn, creatures that player controls attack ~ if able",
    'during your next turn, creatures that player controls attack ~ if able',
    "until target opponent's next turn, creatures that player controls attack ~ if able",
  ],
  parse: single(
    'effect.require-attack-source',
    sequence(
      pattern(/during /iu),
      satisfy(family<IrNoun>('noun', { only: ['noun.player'] }), (noun) => noun.det === 'target'),
      pattern(
        /['’]s next turn, creatures that player controls attack ~ if able(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
      ),
    ),
    ([, player]) => ({ verb: 'requireAttackSource', args: { player } }),
  ),
});

/**
 * `effect.require-attack-player`: "during target player's next turn, each creature that player controls attacks if able" (CR 508.1d, 611.2a, 611.2c, 500.1; Rowan Kenrith): the same
 * requirement as `effect.require-attack-source` on the creatures a chosen player controls, but to attack at all, not to attack the permanent with the ability (the engine's
 * `requireAttackSource` with `anything`). Not read: "creatures" for "each creature", "attack" for "attacks", another group, "each combat", a player who is not a target, another duration.
 */
export const EFFECT_REQUIRE_ATTACK_PLAYER = defineRule<Clauses>({
  id: 'effect.require-attack-player',
  family: 'effect',
  leading: ['during'],
  cites: [
    'CR 508.1d (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
  ],
  examples: [
    "during target player's next turn, each creature that player controls attacks if able",
    "During target player's next turn, each creature that player controls attacks if able",
    "during target opponent's next turn, each creature that player controls attacks if able",
  ],
  rejects: [
    "during target player's next turn, each creature that player controls attacks",
    "during target player's next turn, each creature that player controls attack if able",
    "during target player's next turn, creatures that player controls attack if able",
    "during target player's next turn, each creature you control attacks if able",
    "during target player's next turn, each creature that player controls attacks each combat if able",
    "during target player's next turn, each creature that player controls attacks if able and draw a card",
    "during each opponent's next turn, each creature that player controls attacks if able",
    "during target player's turn, each creature that player controls attacks if able",
    'during your next turn, each creature that player controls attacks if able',
    "until target player's next turn, each creature that player controls attacks if able",
  ],
  parse: single(
    'effect.require-attack-player',
    sequence(
      pattern(/during /iu),
      satisfy(family<IrNoun>('noun', { only: ['noun.player'] }), (noun) => noun.det === 'target'),
      spanned(
        pattern(
          /['’]s next turn, each creature that player controls attacks if able(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
        ),
      ),
    ),
    ([, player, words]) => {
      const anything: IrFlag = {
        kind: 'flag',
        value: true,
        span: words.span,
        rule: 'effect.require-attack-player',
      };
      return { verb: 'requireAttackSource', args: { player, anything } };
    },
  ),
});

export const GIDEON_EFFECT_RULES = [EFFECT_REQUIRE_ATTACK_SOURCE, EFFECT_REQUIRE_ATTACK_PLAYER];
