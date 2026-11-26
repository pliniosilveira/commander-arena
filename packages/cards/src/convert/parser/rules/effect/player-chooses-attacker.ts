/**
 * Effect rule of Mirkwood Trapper: "that player chooses an attacking creature." (CR 608.2d, 508.1k): the player the trigger is about, not the controller of the ability, chooses as the
 * ability resolves. The creature is what "it" means in the sentences after.
 */
import { fail, pattern } from '../../combinators';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const RULE = 'effect.that-player-chooses-attacking-creature';

/**
 * `effect.that-player-chooses-attacking-creature`: "that player chooses an attacking creature" (CR 608.2d: a choice made as the effect resolves is not a target; CR 508.1k: an attacking
 * creature is one declared as an attacker that is still in combat). The engine's `chooseObjects` of one attacking creature of any player, with the player the trigger is about as the
 * `chooser`. The lowering reads it only where "that player" names one (a trigger about a player). Not read: another player word, a number, a kind of creature other than an
 * attacking creature, "you", "an opponent", a controller, more words.
 */
export const EFFECT_THAT_PLAYER_CHOOSES_ATTACKING_CREATURE = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['that'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 508.1k (Declare Attackers Step)',
    'CR 506.4 (Combat Phase)',
  ],
  examples: [
    'that player chooses an attacking creature',
    'That player chooses an attacking creature',
  ],
  rejects: [
    'that player chooses a creature',
    'that player chooses an attacking creature you control',
    'that player chooses two attacking creatures',
    'that player chooses target attacking creature',
    'that player chooses an attacking Elf',
    'that player chooses up to one attacking creature',
    'that player chooses an attacking creature and',
    'that player choose an attacking creature',
    'that opponent chooses an attacking creature',
    'you choose an attacking creature',
    'that player chooses an attacking creature, then',
  ],
  parse: (ctx, pos) => {
    const lead = pattern(/that player chooses an /iu)(ctx, pos);
    if (!lead.ok) return lead;
    const phrase = spanned(permanentPhrase(false, false, false))(ctx, lead.pos);
    if (!phrase.ok) return fail(ctx, pos);
    const filter = withoutZone(phrase.value.value);
    const { raw: _raw, ...rest } = filter;
    // Only "attacking creature": any other word (a controller, a subtype, "other") is another statement.
    if (
      Object.keys(rest).length !== 2 ||
      rest.attacking !== true ||
      rest.types?.length !== 1 ||
      rest.types[0] !== 'creature'
    ) {
      return fail(ctx, pos);
    }
    if (!/^(?:\.|$)/u.test(ctx.text.slice(phrase.pos))) return fail(ctx, pos);
    const noun = {
      kind: 'noun' as const,
      det: 'a' as const,
      filter,
      upTo: false,
      plural: false,
      other: false,
      span: phrase.value.span,
      rule: RULE,
    };
    return {
      ok: true,
      value: [
        makeClause(
          RULE,
          'thatPlayerChoosesAttacker',
          { objects: noun },
          {
            start: pos,
            end: phrase.pos,
          },
        ),
      ],
      pos: phrase.pos,
    };
  },
});

/** Quiet: a line this rule does not read stops where it always did. */
export const PLAYER_CHOOSES_ATTACKER_EFFECT_RULES = [
  quietly(EFFECT_THAT_PLAYER_CHOOSES_ATTACKING_CREATURE),
];
