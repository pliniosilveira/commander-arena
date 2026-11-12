/**
 * Effect rule of stage P69 (D-982): an object gains a static ability for good, "It gains \"You can't lose the game and your opponents can't win the
 * game.\"" (The Book of Exalted Deeds). The words say no duration, so the effect lasts until the end of the game (CR 611.2a), and the ability is a
 * layer 6 grant (CR 613.1f). The text in the quotes is read as an ability of its own (`rules/static/quoted.ts`); only a static one is read here, and
 * the lowering gives only the two the engine reads from the abilities an object has after the layers (`cantLoseGame`, `opponentsCantWin`).
 */
import { literal, type Parser, satisfy, sequence } from '../../combinators';
import type { IrNoun, IrQuotedAbility } from '../../ir/types';
import { defineRule, family, quietly } from '../registry';
import { readQuotedAbility } from '../static/quoted';
import { type Clauses, single } from './operands';

/** What a single object is named by in "gains": a target, or "it" or "that creature" for the one an earlier sentence named. */
const SUBJECTS: readonly string[] = ['noun.target-permanent', 'noun.it', 'noun.that-object'];

/** A static ability in quotes, ending the sentence with its period inside the quotes. */
const QUOTED_STATIC: Parser<IrQuotedAbility> = satisfy(
  (ctx, pos) => readQuotedAbility(ctx, pos, { mana: false, statics: true }),
  (quoted) => quoted.ability.kind === 'static',
);

/**
 * `effect.gain-static-ability`: "It gains \"You can't lose the game and your opponents can't win the game.\"", "Target Angel gains \"You can't lose
 * the game.\"" (CR 611.2a, 613.1f, 104.3): one object, the quoted static ability and no duration. The object is fixed as the effect begins (CR 611.2c);
 * a spell or ability that names it by "it" reads the target an instruction before it chose. A duration ("until end of turn"), a group ("creatures you
 * control gain"), "has" (a state, not a change) and a quoted ability that is not static are not read.
 */
export const EFFECT_GAIN_STATIC_ABILITY = defineRule<Clauses>({
  id: 'effect.gain-static-ability',
  family: 'effect',
  leading: ['it', 'target', 'that', 'her', 'him'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.1f (Interaction of Continuous Effects)',
    'CR 104.3 (Ending the Game)',
  ],
  examples: [
    'it gains "You can\'t lose the game and your opponents can\'t win the game."',
    'It gains "You can\'t lose the game and your opponents can\'t win the game."',
    'target Angel gains "You can\'t lose the game and your opponents can\'t win the game."',
    'target creature you control gains "You can\'t lose the game."',
    'that creature gains "Your opponents can\'t win the game."',
  ],
  rejects: [
    'it gains "You can\'t lose the game and your opponents can\'t win the game." until end of turn',
    'it gains "You can\'t lose the game and your opponents can\'t win the game"',
    "it gains You can't lose the game and your opponents can't win the game.",
    'it has "You can\'t lose the game and your opponents can\'t win the game."',
    'it gain "You can\'t lose the game and your opponents can\'t win the game."',
    'it also gains "You can\'t lose the game."',
    'creatures you control gain "You can\'t lose the game."',
    'target creatures gain "You can\'t lose the game."',
    'it gains "{T}: You gain 1 life."',
    'it gains "Whenever ~ attacks, you gain 1 life."',
    'it gains "Draw a card."',
    'it gains flying',
    'it gains "You can\'t lose the game." and flying',
    'it gains "You can\'t lose the game and your opponents can\'t win the game." and "You have hexproof."',
    'it gains ""',
  ],
  parse: single(
    'effect.gain-static-ability',
    sequence(family<IrNoun>('noun', { only: SUBJECTS }), literal(' gains '), QUOTED_STATIC),
    ([objects, , ability]) => ({ verb: 'gainStaticAbility', args: { objects, ability } }),
  ),
});

export const GRANTED_STATIC_EFFECT_RULES = [EFFECT_GAIN_STATIC_ABILITY].map(quietly);
