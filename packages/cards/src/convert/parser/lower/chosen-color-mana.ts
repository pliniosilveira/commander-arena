/**
 * "Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way." (issue 258, D-585, D-586): the two sentences are one instruction of
 * the engine, a `chooseOne` of the five colors whose options each add that color's mana to the pool of the target player. The first sentence makes no instruction of its own
 * (`lowerChooseColorMana` reads it with the one after it), and the second alone has no color to name (`ADD_MANA_CHOSEN_COLOR` reports it, never guesses).
 */
import type { Amount, Effect, ManaColor } from '@commander-arena/engine';
import type { IrClause, IrSentence } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { type FeatureRef, missingFeatures } from './features';
import { playerSelectorOf } from './nouns';
import type { LowerContext, Lowering, LowerResult } from './types';

/** The five colors of CR 105.1 with the words the player is shown. */
const COLORS: readonly (readonly [ManaColor, string])[] = [
  ['W', 'white'],
  ['U', 'blue'],
  ['B', 'black'],
  ['R', 'red'],
  ['G', 'green'],
];

/** A sentence with nothing but its clauses: no test, no "instead", no definition of X, no delay, no "you may". */
function plainSentence(sentence: IrSentence): boolean {
  return (
    sentence.condition === undefined &&
    sentence.instead !== true &&
    sentence.otherwise !== true &&
    sentence.where === undefined &&
    sentence.delayed === undefined &&
    sentence.reflexive !== true &&
    sentence.mayBy === undefined &&
    sentence.clauses.every(
      (c) => !c.optional && c.condition === undefined && c.duration === undefined,
    )
  );
}

/**
 * The second sentence alone: the color is the one the sentence before it chose (`lowerChooseColorMana`), and nothing chose one, so there is none to add. Reported with what is
 * missing (a color chosen while an instruction resolves), as "Choose a color." alone is.
 */
export const ADD_MANA_CHOSEN_COLOR: Lowering<IrClause, Effects> = {
  head: 'addManaChosenColor',
  id: 'lower.add-mana-chosen-color',
  needs: [],
  lower: (clause) => ({
    ok: false,
    needs: ['selector:colorChoice'],
    at: clause.span,
    rule: clause.rule,
  }),
};

/**
 * "Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way." (CR 608.2d, 106.4, 605.1a): the sentence "Choose a color." and the one
 * after it, which adds `quantity` mana of that color, once for each of an amount when the words say "for each". The color is chosen by the controller of the ability as it resolves
 * (the engine's `chooseOne`), so nobody can respond knowing it, and the mana goes to the pool of a target player: an ability with a target is not a mana ability (CR 605.1a), so
 * it is an ordinary activation or spell. Null when the sentence is not "Choose a color."; the pair that does not fit is refused, never guessed (a player who is not a target would
 * make the ability a mana ability, which this reading does not build).
 */
export function lowerChooseColorMana(
  sentence: IrSentence,
  sentences: readonly IrSentence[],
  i: number,
  ctx: LowerContext,
): LowerResult<Effects> | null {
  const [choose, ...chooseMore] = sentence.clauses;
  if (choose?.verb !== 'chooseColor') return null;
  const next = sentences[i + 1];
  const [add, ...addMore] = next?.clauses ?? [];
  if (next === undefined || add?.verb !== 'addManaChosenColor') return null;
  const refused = failure(add);
  if (
    chooseMore.length > 0 ||
    addMore.length > 0 ||
    !plainSentence(sentence) ||
    !plainSentence(next)
  ) {
    return refused;
  }
  const who = arg(add, 'player');
  const quantity = arg(add, 'quantity');
  if (who?.kind !== 'noun' || who.det !== 'target' || quantity?.kind !== 'number') return refused;
  const needs: FeatureRef[] = ['effect:chooseOne', 'effect:addMana', 'selector:target'];
  const blocked = missingFeatures(needs);
  if (blocked.length > 0) return { ...refused, needs: blocked };
  const player = playerSelectorOf(who, ctx);
  if (!player.ok) return player;
  // "for each artifact sacrificed this way": the amount the engine reads as the mana is added.
  let times: Amount | undefined;
  if (arg(add, 'times') !== undefined) {
    const each = amountArg(add, 'times', ctx);
    if (!each.ok) return each;
    times = each.value;
  }
  const options = COLORS.map(([color, label]) => ({
    label,
    effect: {
      kind: 'addMana',
      mana: {
        kind: 'fixed',
        mana: Array.from({ length: quantity.value }, () => color),
        ...(times === undefined ? {} : { times }),
      },
      player: player.value,
    } as Effect,
  }));
  return {
    ok: true,
    value: [{ kind: 'chooseOne', options }],
    rule: add.rule,
  };
}

export const CHOSEN_COLOR_MANA_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  ADD_MANA_CHOSEN_COLOR,
];
