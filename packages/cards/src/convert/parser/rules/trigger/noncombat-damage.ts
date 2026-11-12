/**
 * Trigger rules of the Niv-Mizzet deck program, group 2b-a (issue 25, D-942): "whenever a source you control deals noncombat damage to an opponent"
 * (CR 120.2b: damage as an effect of a spell or ability, by any object; CR 603.2c: the ability triggers once for each occurrence). The engine's
 * `noncombatDamageDealt`: the source is not a permanent with a filter but any object, so the rule names whose source it is and which player it damaged.
 */
import { choice, map, pattern, sequence } from '../../combinators';
import type { IrNoun, IrTrigger } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.noncombat-damage`: "a source you control deals noncombat damage to an opponent", "a source you control deals noncombat damage to a player", "a
 * source deals noncombat damage to a player", "a source deals noncombat damage to an opponent" (CR 120.2b, 120.2a, 603.2c: one occurrence for each source
 * and each player it damages; combat damage is not read; damage that is entirely prevented is not dealt, CR 603.2g). The player damaged is "that player" in
 * the body; "that much" is the damage that source dealt. Not read: a permanent as the source ("~ deals noncombat damage to an opponent", "a creature you
 * control deals ..."), a source an opponent controls, damage to a creature, a planeswalker or "you", damage of any kind ("deals damage"), combat damage
 * (`trigger.combat-damage`), "one or more sources" (a batch), a plural source.
 */
export const TRIGGER_NONCOMBAT_DAMAGE = quietly(
  defineRule<IrTrigger>({
    id: 'trigger.noncombat-damage',
    family: 'trigger',
    leading: ['a'],
    cites: [
      'CR 120.2b (Damage)',
      'CR 120.2a (Damage)',
      'CR 603.2c (Handling Triggered Abilities)',
      'CR 603.2g (Handling Triggered Abilities)',
    ],
    examples: [
      'a source you control deals noncombat damage to an opponent',
      'a source you control deals noncombat damage to a player',
      'a source deals noncombat damage to a player',
      'a source deals noncombat damage to an opponent',
    ],
    rejects: [
      'a source you control deals damage to an opponent',
      'a source you control deals combat damage to an opponent',
      'a source an opponent controls deals noncombat damage to an opponent',
      'a source you control deals noncombat damage to you',
      'a source you control deals noncombat damage to a creature',
      'a source you control deals noncombat damage to a planeswalker',
      'a source you control deals noncombat damage to an opponent or a planeswalker',
      'a source you control deals noncombat damage',
      'a source you control deals noncombat damage to an opponent.',
      'a source you control deal noncombat damage to an opponent',
      'a creature you control deals noncombat damage to an opponent',
      'a source you control deals noncombat damage to each opponent',
      '~ deals noncombat damage to an opponent',
      'sources you control deal noncombat damage to an opponent',
      'one or more sources you control deal noncombat damage to an opponent',
      'a source you control deals noncombat damage to an opponent and',
    ],
    parse: (ctx, pos) => {
      const id = 'trigger.noncombat-damage';
      const head = sequence(
        pattern(/a source /iu),
        choice(
          map(pattern(/you control /iu), () => 'you' as const),
          map(pattern(/(?=deals )/iu), () => 'any' as const),
        ),
        pattern(/deals noncombat damage to /iu),
      )(ctx, pos);
      if (!head.ok) return head;
      const [, by] = head.value;
      const who = spanned(
        choice(
          map(pattern(new RegExp(`an opponent${NOT_IN_WORD}`, 'iu')), () => 'opponent' as const),
          map(pattern(new RegExp(`a player${NOT_IN_WORD}`, 'iu')), () => 'player' as const),
        ),
      )(ctx, head.pos);
      if (!who.ok) return who;
      const damaged = who.value.value;
      // The player damaged is the antecedent of "that player" in the body.
      const recipient: IrNoun = makeNoun(
        id,
        who.value.span,
        damaged === 'player' ? 'eachPlayer' : 'eachOpponent',
        { raw: damaged === 'player' ? 'a player' : 'an opponent' },
      );
      return {
        ok: true,
        value: {
          kind: 'trigger',
          event: 'noncombatDamageDealt',
          by,
          damaged,
          recipient,
          args: {},
          span: { start: pos, end: who.pos },
          rule: id,
        },
        pos: who.pos,
      };
    },
  }),
);

export const NONCOMBAT_DAMAGE_TRIGGER_RULES = [TRIGGER_NONCOMBAT_DAMAGE];
