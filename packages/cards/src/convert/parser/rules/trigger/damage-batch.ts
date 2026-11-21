/**
 * Trigger rule of the Ahoy Mateys deck, group 1 (Francisco, Fowl Marauder; Malcolm, Keen-Eyed Navigator): a group of creatures dealing damage of any kind, not only combat damage.
 */
import { choice, literal, map, pattern, quiet, satisfy, sequence } from '../../combinators';
import type { IrNoun, IrTrigger } from '../../ir/types';
import { permanentPhrase, withoutZone } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { makeNoun } from './subjects';

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

/**
 * `trigger.damage-batch`: "one or more Pirates you control deal damage to a player", "one or more Pirates you control deal damage to your opponents" (CR 120.2: damage of any
 * kind, combat or not; CR 603.2c: one trigger for the whole damage event of a group of sources; CR 120.8 and 603.2g: damage that is 0 or prevented is not dealt). "To a player" is the
 * engine's `damageBatch` for each player damaged ("that player"); "to your opponents" is one trigger for the event with the number of opponents damaged. Not read: "combat damage"
 * (`trigger.combat-damage-batch`), one creature ("deals"), creatures of no controller or of another, "to an opponent", "to you".
 */
export const TRIGGER_DAMAGE_BATCH = defineRule<IrTrigger>({
  id: 'trigger.damage-batch',
  family: 'trigger',
  leading: ['one', 'two', 'three'],
  cites: [
    'CR 120.2 (Damage)',
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 120.8 (Damage)',
    'CR 603.2g (Handling Triggered Abilities)',
  ],
  examples: [
    'one or more Pirates you control deal damage to a player',
    'one or more Pirates you control deal damage to your opponents',
    'one or more creatures you control deal damage to a player',
    'two or more Pirates you control deal damage to your opponents',
  ],
  rejects: [
    'one or more Pirates you control deal combat damage to a player',
    'one or more Pirates deal damage to a player',
    'one or more Pirates you control deals damage to a player',
    'one or more Pirates you control deal damage to an opponent',
    'one or more Pirates you control deal damage to you',
    'one or more Pirates an opponent controls deal damage to a player',
    'one or more Pirates you control deal damage to a creature',
    'one or more Pirates you control deal damage to a player and',
    'a Pirate you control deals damage to a player',
  ],
  parse: (ctx, pos) => {
    // Quiet: other "one or more ..." triggers keep stopping where they always did.
    const r = quiet(
      sequence(
        spanned(
          sequence(
            choice(
              map(literal('one or more '), () => 1),
              map(literal('two or more '), () => 2),
              map(literal('three or more '), () => 3),
            ),
            satisfy(
              map(permanentPhrase(true, 'all'), withoutZone),
              (filter) => filter.controller === 'you',
            ),
          ),
        ),
        spanned(
          pattern(new RegExp(` deal damage to (a player|your opponents)${NOT_IN_WORD}`, 'iu')),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [group, words] = r.value;
    const [atLeast, filter] = group.value;
    const opponents = (words.value[1] ?? '').toLowerCase() === 'your opponents';
    const subject: IrNoun = {
      ...makeNoun('trigger.damage-batch', group.span, 'a', filter),
      plural: true,
    };
    // "That player" has an antecedent only when the trigger is once for each player damaged.
    const recipient = opponents
      ? undefined
      : makeNoun(
          'trigger.damage-batch',
          { start: words.span.end - 'a player'.length, end: words.span.end },
          'eachPlayer',
          { raw: 'a player' },
        );
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'damageBatch',
        subject,
        damaged: opponents ? 'opponent' : 'player',
        ...(recipient === undefined ? {} : { recipient }),
        ...(atLeast > 1 ? { atLeast } : {}),
        args: {},
        span: { start: pos, end: r.pos },
        rule: 'trigger.damage-batch',
      },
      pos: r.pos,
    };
  },
});

export const DAMAGE_BATCH_TRIGGER_RULES = [TRIGGER_DAMAGE_BATCH];
