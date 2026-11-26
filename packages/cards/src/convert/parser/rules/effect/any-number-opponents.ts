/**
 * `effect.destroy-any-number-opponents`: "For any number of opponents, destroy target nonland permanent that player controls." (Windgrace's Judgment; CR 115.1, 601.2c, 701.8a). The
 * caster chooses any number of opponents and, for each one chosen, one target the opponent controls, so the spell has at most one target for each opponent and never two controlled
 * by the same player: the engine's slot of "for each opponent, destroy up to one target ... that player controls" (`TargetSpec.onePerOpponent`, with no minimum), which with three
 * or four seats offers every opponent still in the game. A player who controls nothing of the kind is simply not chosen.
 */
import { literal } from '../../combinators';
import { defineRule } from '../registry';
import { perOpponentNoun } from './angels';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.destroy-any-number-opponents';

export const EFFECT_DESTROY_ANY_NUMBER_OPPONENTS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 701.8a (Destroy)',
    'CR 102.2 (Players)',
  ],
  examples: [
    'for any number of opponents, destroy target nonland permanent that player controls',
    'for any number of opponents, destroy target creature that player controls',
    'For any number of opponents, destroy target artifact or enchantment that player controls',
  ],
  rejects: [
    'for any number of opponents, destroy target nonland permanent',
    'for any number of opponents, destroy target nonland permanent you control',
    'for any number of opponents, destroy target nonland permanent an opponent controls',
    'for any number of opponents, destroy up to one target nonland permanent that player controls',
    'for any number of opponents, destroy two target creatures that player controls',
    'for any number of opponents, exile target nonland permanent that player controls',
    'for any number of players, destroy target nonland permanent that player controls',
    'for any number of opponents, destroy target nonland permanent that player owns',
    'for any number of opponents, destroy target nonland permanent that player controls and draw a card',
    'for any number of opponents, destroy target nonland permanent that player controls unless they pay {2}',
    'for any number of opponents, you may destroy target nonland permanent that player controls',
    'for each opponent, destroy target nonland permanent that player controls',
    'destroy target nonland permanent that player controls',
  ],
  parse: (ctx, pos) => {
    const head = literal('for any number of opponents, destroy target ')(ctx, pos);
    if (!head.ok) return head;
    // The words say no count ("up to one" is what the slot's `onePerOpponent` means), so the span of the noun's count is empty; `from` is moved so that the noun starts after the head.
    const from = head.pos - 'for each opponent, destroy '.length;
    const noun = perOpponentNoun(ctx, from, 'destroy', head.pos, ID);
    if (!noun.ok) return noun;
    const count = noun.value.count;
    const bare =
      count === undefined
        ? noun.value
        : { ...noun.value, count: { ...count, span: { start: head.pos, end: head.pos } } };
    const span = { start: pos, end: noun.pos };
    return {
      ok: true,
      value: [makeClause(ID, 'destroy', { objects: bare }, span)],
      pos: noun.pos,
    };
  },
});

export const ANY_NUMBER_OPPONENTS_RULES = [EFFECT_DESTROY_ANY_NUMBER_OPPONENTS];
