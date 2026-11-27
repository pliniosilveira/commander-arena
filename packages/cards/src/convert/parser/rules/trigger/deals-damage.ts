/**
 * Trigger rules of the Tannuk deck (issue 347): "whenever enchanted creature deals damage to an opponent" (Keen Sense) and the quoted
 * "whenever this creature deals damage to an opponent" an Aura grants (Snake Umbra). The engine's `dealsDamage`: damage of any kind, combat or not.
 */
import { pattern, sequence } from '../../combinators';
import type { IrTrigger } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { makeNoun, permanentOrAttachedSubject } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.deals-damage`: "~ deals damage to an opponent", "enchanted creature deals damage to an opponent", "equipped creature deals damage to a
 * player", "a creature you control deals damage to a player" (CR 120.2 (Damage), 603.2c: it triggers once for each player the source damages, whether
 * the damage is combat damage or not, and not for damage that is entirely prevented, CR 603.2g). The player damaged is "that player" in the body.
 * Not read: a creature, a planeswalker or "any target", "deals combat damage" (`trigger.combat-damage`), "deals noncombat damage",
 * "one or more creatures" (a batch), a plural source, "a source" (`trigger.noncombat-damage`, `trigger.source-deals-damage`).
 */
export const TRIGGER_DEALS_DAMAGE = defineRule<IrTrigger>({
  id: 'trigger.deals-damage',
  family: 'trigger',
  leading: ['~', 'another', 'a', 'an', 'equipped', 'enchanted'],
  cites: [
    'CR 120.2 (Damage)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 603.2g (Handling Triggered Abilities)',
  ],
  examples: [
    '~ deals damage to an opponent',
    'enchanted creature deals damage to an opponent',
    'equipped creature deals damage to a player',
    'a creature you control deals damage to an opponent',
    'a permanent deals damage to you',
    'a creature an opponent controls deals damage to you',
  ],
  rejects: [
    '~ deals combat damage to an opponent',
    '~ deals noncombat damage to an opponent',
    '~ deals damage to you and',
    '~ deals damage to your opponents',
    '~ deals damage to a creature',
    '~ deals damage to target creature',
    '~ deals damage to an opponent or planeswalker',
    '~ deals damage to a player or planeswalker',
    '~ deals damage to each opponent',
    '~ deals damage',
    '~ deal damage to an opponent',
    '~ deals damage to an opponent and',
    'enchanted creature deals damage to an opponent.',
    'one or more creatures you control deal damage to an opponent',
    'a source deals damage to an opponent',
  ],
  parse: (ctx, pos) => {
    const rule = 'trigger.deals-damage';
    const dealt = sequence(
      permanentOrAttachedSubject(rule),
      pattern(/ deals damage to /iu),
      spanned(pattern(new RegExp(`(an opponent|a player|you)${NOT_IN_WORD}`, 'iu'))),
    )(ctx, pos);
    if (!dealt.ok) return dealt;
    const [subject, , who] = dealt.value;
    const target = (who.value[0] ?? '').toLowerCase();
    // CR 120.2, 113.7a (Dissipation Field): "deals damage to you" is damage to the controller of the ability; "you" is no antecedent for "that player".
    if (target === 'you') {
      return {
        ok: true,
        value: {
          kind: 'trigger',
          event: 'dealsDamage',
          subject,
          damaged: 'you',
          args: {},
          span: { start: pos, end: dealt.pos },
          rule,
        },
        pos: dealt.pos,
      };
    }
    const opponent = /opponent/iu.test(target);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'dealsDamage',
        subject,
        damaged: opponent ? 'opponent' : 'player',
        // The player damaged is the antecedent of "that player" in the body.
        recipient: makeNoun(rule, who.span, opponent ? 'eachOpponent' : 'eachPlayer', {
          raw: opponent ? 'an opponent' : 'a player',
        }),
        args: {},
        span: { start: pos, end: dealt.pos },
        rule,
      },
      pos: dealt.pos,
    };
  },
});

export const DEALS_DAMAGE_TRIGGER_RULES = [TRIGGER_DEALS_DAMAGE];
