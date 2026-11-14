/**
 * choosePermanent: picking between `min` and `max` of the engine's legal permanents, for a
 * sacrifice (CR 608.2d), for the legend rule (CR 704.5j, keep one), as the cost of a crew ability
 * (CR 702.122a: tap creatures with total power N or greater) or for an effect that moves a
 * permanent you choose ("return a land you control to its owner's hand", D-096).
 */
import type {
  ChoosePermanentDecision,
  Effect,
  ObjectId,
  SeatId,
  StackAbility,
} from '@commander-arena/engine';
import { findEffect, tapChooseText } from '../../game/artifacts-text';
import { activationCostPart, sacrificeWhat, tappedWhat } from '../../game/cost-text';
import { thingsPhrase } from '../../game/filter-text';
import { devourDetail, devourPrompt } from '../../game/keywords-text';
import { namesSeveral } from '../../game/player-text';
import { triggerGist } from './ability-label';
import { type Index, nameOf, plural, stackName } from './lookup';

/**
 * Toggles a permanent. Clicking a chosen one takes it back. When only one may be chosen, clicking
 * another one swaps the choice (the player does not have to take the first back); with room for
 * several, a click beyond `max` is ignored.
 */
export function togglePermanent(
  chosen: readonly ObjectId[],
  decision: Pick<ChoosePermanentDecision, 'legal' | 'max'>,
  id: ObjectId,
): readonly ObjectId[] {
  if (chosen.includes(id)) return chosen.filter((c) => c !== id);
  if (!decision.legal.includes(id)) return chosen;
  if (decision.max === 1) return [id];
  return chosen.length >= decision.max ? chosen : [...chosen, id];
}

/** The fields a crew choice adds to the sacrifice ones; a plain `{ min, max }` is not a crew. */
type CrewFields = Partial<Pick<ChoosePermanentDecision, 'purpose' | 'powers' | 'minTotalPower'>>;

/** True for the cost of a crew ability (CR 702.122a): tap creatures with enough total power. */
export function isCrew(decision: CrewFields): boolean {
  return decision.purpose === 'crew';
}

/** The total power a crew choice needs: N of "Crew N" (`minTotalPower`; 0 when it is not set). */
export function crewNeeded(decision: Pick<ChoosePermanentDecision, 'minTotalPower'>): number {
  return decision.minTotalPower ?? 0;
}

/** One creature's power as the engine derived it for the decision; 0 when it lists none. */
export function crewPower(decision: Pick<ChoosePermanentDecision, 'powers'>, id: ObjectId): number {
  return decision.powers?.[id] ?? 0;
}

/** The total power of the chosen creatures (a creature with negative power lowers it). */
export function crewTotal(
  chosen: readonly ObjectId[],
  decision: Pick<ChoosePermanentDecision, 'powers'>,
): number {
  return chosen.reduce((sum, id) => sum + crewPower(decision, id), 0);
}

/** "Total power: 2 of 3": the running total against the Crew number. */
export function crewTotalText(
  chosen: readonly ObjectId[],
  decision: Pick<ChoosePermanentDecision, 'powers' | 'minTotalPower'>,
): string {
  return `Total power: ${crewTotal(chosen, decision)} of ${crewNeeded(decision)}`;
}

/**
 * True when the choice may be sent: between `min` and `max` permanents and, for a crew, a total
 * power of at least N (CR 702.122a; the engine refuses less, and more than needed is legal).
 */
export function permanentsReady(
  chosen: readonly ObjectId[],
  decision: Pick<ChoosePermanentDecision, 'min' | 'max'> & CrewFields,
): boolean {
  if (chosen.length < decision.min || chosen.length > decision.max) return false;
  return !isCrew(decision) || crewTotal(chosen, decision) >= crewNeeded(decision);
}

/** Why Confirm is disabled (the button's tooltip), or null when the choice may be sent. */
export function permanentsHint(
  chosen: readonly ObjectId[],
  decision: Pick<ChoosePermanentDecision, 'min' | 'max'> & CrewFields,
): string | null {
  if (permanentsReady(chosen, decision)) return null;
  if (isCrew(decision)) {
    return `Choose creatures with total power ${crewNeeded(decision)} or greater`;
  }
  const missing = decision.min - chosen.length;
  return missing > 0
    ? `Choose ${plural(missing, 'more permanent')}`
    : `Choose at most ${permanentRange(decision.min, decision.max)}`;
}

/**
 * True for "sacrifice any number of ..." (D-135, CR 701.21): a sacrifice with no minimum. Confirm is enabled with
 * nothing chosen, and the prompt says "any number".
 */
export function isAnyNumber(decision: Pick<ChoosePermanentDecision, 'purpose' | 'min'>): boolean {
  return decision.purpose === 'sacrifice' && decision.min === 0;
}

/** True for devour's question (CR 702.82a, D-185): sacrifice any number of creatures as the permanent enters. */
export function isDevour(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'devour';
}

/** The bar's second line: the running total for a crew, else what to click. */
export function permanentsDetail(
  chosen: readonly ObjectId[],
  decision: CrewFields & Partial<Pick<ChoosePermanentDecision, 'min'>>,
): string {
  if (isCrew(decision)) return crewTotalText(chosen, decision);
  if (decision.purpose === 'devour') return devourDetail(chosen.length);
  // D-139: "you may tap any number of untapped Myr you control".
  if (decision.purpose === 'effect' && decision.min === 0) {
    return chosen.length === 0
      ? 'Click permanents to choose them, or Confirm to choose none.'
      : `${plural(chosen.length, 'permanent')} chosen. Click one again to take it back.`;
  }
  if (decision.purpose === 'sacrifice' && decision.min === 0) {
    // "Any number": none is a legal answer, so the line says what Confirm will do.
    return chosen.length === 0
      ? 'Click permanents to sacrifice, or Confirm to sacrifice none.'
      : `Sacrificing ${plural(chosen.length, 'permanent')}. Click one again to take it back.`;
  }
  return 'Click a highlighted permanent, or pick one from the list.';
}

/** "a permanent", "2 permanents", "up to 3 permanents", "1 to 2 permanents". */
export function permanentRange(min: number, max: number): string {
  if (max === 1) return 'a permanent';
  if (min === max) return plural(max, 'permanent');
  return min === 0 ? `up to ${plural(max, 'permanent')}` : `${min} to ${plural(max, 'permanent')}`;
}

/** True for the choice of the creature another one fights (CR 701.14, D-145). */
export function isFight(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'fight';
}

/**
 * "Choose the creature Beast fights for Ezuri's Predation." (D-145, CR 701.14): the creature `subject` fights the one chosen,
 * a different one each time. The fighter is named, as several creatures of the same name may be asking in turn.
 */
export function fightPrompt(
  decision: Pick<ChoosePermanentDecision, 'source' | 'subject'>,
  index: Index,
): string {
  const fighter = decision.subject === undefined ? 'it' : nameOf(index, decision.subject);
  return `Choose the creature ${fighter} fights for ${stackName(index, decision.source)}.`;
}

/** The title of the dock panel of a fight choice: "Phyrexian Beast fights". */
export function fightTitle(
  decision: Pick<ChoosePermanentDecision, 'subject'>,
  index: Index,
): string {
  return `${decision.subject === undefined ? 'A creature' : nameOf(index, decision.subject)} fights`;
}

/** True for the legend rule (CR 704.5j): no spell or ability asks, the player keeps one. */
export function isLegendRule(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'legendRule';
}

/** True for the choice of the permanent each player keeps, of Tragic Arrogance (D-231): the others are sacrificed. */
export function isSpare(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'spare';
}

/** "Choose an artifact you control to keep. Every other nonland permanent is sacrificed." (D-231, CR 701.21a). */
function sparePrompt(decision: Partial<Pick<ChoosePermanentDecision, 'seat' | 'spare'>>): string {
  const type = decision.spare?.type ?? 'permanent';
  const whose = decision.spare?.player === decision.seat ? 'you control' : 'an opponent controls';
  // D-484 (CR 608.2d, 701.21a): "Each opponent chooses a permanent they control of each permanent type and sacrifices the rest": the player keeps one of their own, and sacrifices every other.
  if (decision.spare?.own === true) {
    return `Choose ${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type} you control to keep. You sacrifice every other permanent you control.`;
  }
  return `Choose ${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type} ${whose} to keep. Each player then sacrifices all other nonland permanents they control.`;
}

/** True for an effect that moves a permanent the player chooses (a bounce land's return, D-096). */
export function isEffectChoice(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'effect';
}

/** True for the cost of an ability that returns permanents to their owners' hands (D-139). */
export function isBounceCost(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'bounce';
}

/**
 * "Return an artifact you control to its owner's hand to pay for X's ability." (D-139, CR 602.2b): the words of the
 * return cost of the ability on the stack; the plain count when the view does not show it.
 */
export function bouncePrompt(
  decision: Pick<ChoosePermanentDecision, 'min' | 'max' | 'source'>,
  index: Index,
): string {
  const source = index.get(decision.source);
  const ability = source?.ability;
  const cost =
    ability?.kind === 'activated' ? ability.cost.find((c) => c.kind === 'returnToHand') : undefined;
  const pay = `to pay for ${stackName(index, decision.source)}`;
  if (cost !== undefined) return `${activationCostPart(cost)} ${pay}.`;
  return `Return ${permanentRange(decision.min, decision.max)} you control to ${decision.max > 1 ? "their owner's" : "its owner's"} hand ${pay}.`;
}

/**
 * The `tap` of permanents the controller chooses in the ability on the stack ("you may tap X untapped Myr you control",
 * D-139), or null: an effect's choice of permanents is then something else (a bounce land's return, D-096).
 */
export function tapEffectOf(
  decision: Pick<ChoosePermanentDecision, 'purpose' | 'source'>,
  index: Index,
): Extract<Effect, { kind: 'tap' }> | null {
  if (decision.purpose !== 'effect') return null;
  const effect = index.get(decision.source)?.ability?.effect;
  const found = effect === undefined ? null : findEffect(effect, 'tap');
  return found?.objects.kind === 'choose' ? found : null;
}

/** "Tap any number of untapped Myr you control for X." (D-139): the prompt of a tap the controller chooses. */
function tapEffectPrompt(
  decision: Pick<ChoosePermanentDecision, 'min' | 'max' | 'source'>,
  tap: Extract<Effect, { kind: 'tap' }>,
  index: Index,
): string {
  const words = tap.objects.kind === 'choose' ? tapChooseText(tap.objects) : null;
  const what =
    words === null
      ? `Tap ${decision.min === 0 ? `up to ${plural(decision.max, 'permanent')}` : permanentRange(decision.min, decision.max)}`
      : words.replace(/^You may tap/, 'Tap');
  return `${what} for ${nameOf(index, decision.source)}.`;
}

/** True for the cost of an ability that taps untapped permanents ("Tap two untapped artifacts you control", D-133). */
export function isTapCost(decision: Pick<ChoosePermanentDecision, 'purpose'>): boolean {
  return decision.purpose === 'tap';
}

/**
 * The prompt of a tap cost: "Choose 2 untapped Zombies you control to tap as a cost." The words come from the
 * tap cost of the ability on the stack, so any creature type or permanent type reads right; an ability the view
 * does not show gives the plain "Choose 2 permanents to tap as a cost for Name." (nothing is guessed).
 */
export function tapPrompt(
  decision: Pick<ChoosePermanentDecision, 'min' | 'max' | 'source'>,
  index: Index,
): string {
  const ability = index.get(decision.source)?.ability;
  const cost =
    ability?.kind === 'activated'
      ? ability.cost.find((c) => c.kind === 'tapPermanents')
      : undefined;
  if (cost?.kind === 'tapPermanents' && cost.count === decision.max) {
    return `Choose ${tappedWhat(cost.filter, cost.count, true)} to tap as a cost.`;
  }
  return `Choose ${permanentRange(decision.min, decision.max)} to tap as a cost for ${nameOf(index, decision.source)}.`;
}

/**
 * The badge on a chosen permanent: "Keep" for the legend rule, "Crew" for a crew, "Tap" for a tap cost, "Chosen"
 * for an effect's choice (the decision does not say where the permanent goes), else "Sacrifice".
 */
export function chosenBadge(
  decision: Pick<ChoosePermanentDecision, 'purpose'> &
    Partial<Pick<ChoosePermanentDecision, 'source'>>,
  index?: Index,
): string {
  if (isLegendRule(decision) || isSpare(decision)) return 'Keep';
  if (isFight(decision)) return 'Fights it';
  if (isTapCost(decision)) return 'Tap';
  if (isBounceCost(decision)) return 'Return';
  const { source } = decision;
  if (index !== undefined && source !== undefined) {
    if (tapEffectOf({ purpose: decision.purpose, source }, index) !== null) return 'Tap';
  }
  if (isEffectChoice(decision)) return 'Chosen';
  return isCrew(decision) ? 'Crew' : 'Sacrifice';
}

/**
 * The noun of an effect's choice: "land" when every legal permanent is a land, "creature" when they
 * are all creatures, and so on through the card types; "permanent" when they have none in common.
 */
export function legalNoun(legal: readonly ObjectId[], index: Index): string {
  const TYPES = ['land', 'creature', 'artifact', 'enchantment', 'planeswalker', 'battle'] as const;
  const objects = legal.flatMap((id) => {
    const o = index.get(id);
    return o === undefined ? [] : [o];
  });
  if (objects.length === 0 || objects.length !== legal.length) return 'permanent';
  return TYPES.find((t) => objects.every((o) => o.types.includes(t))) ?? 'permanent';
}

/**
 * The clause of an effect's choice that the source's rules text states about where the permanent
 * goes: "return a land you control to its owner's hand" gives "to return to its owner's hand". The
 * decision names neither the destination nor the filter, so nothing is guessed: when the text of the
 * source has no such clause (or several, for different permanents), the prompt just says "for Name".
 */
export function effectDestination(oracleText: string): string | null {
  const found = [
    ...oracleText.matchAll(/return (?:a|an|one) [^.,;]*? you control to its owner[’']s hand/gi),
  ];
  return found.length === 1 ? "to return to its owner's hand" : null;
}

/** "Choose a land you control to return to its owner's hand." / "Choose a land you control for Name." */
function effectPrompt(
  decision: Pick<ChoosePermanentDecision, 'min' | 'max' | 'source' | 'legal'>,
  index: Index,
): string {
  const noun = legalNoun(decision.legal, index);
  const what =
    decision.max === 1
      ? `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`
      : permanentRange(decision.min, decision.max).replace('permanent', noun);
  const where = effectDestination(index.get(decision.source)?.oracleText ?? '');
  return `Choose ${what} you control ${where ?? `for ${nameOf(index, decision.source)}`}.`;
}

/**
 * The prompt of the action bar: "Sacrifice a permanent for Evil Spell." for an effect,
 * "Sacrifice a permanent to pay for Altar." when the sacrifice is a cost of an ability,
 * "Sacrifice a creature as an additional cost to cast Evil Spell." for a spell's additional cost
 * (D-095), and for
 * the legend rule "You control 2 legendary permanents named Name. Choose one to keep; the others
 * go to the graveyard." (the count is how many the engine lists, the name is the first one's), and
 * for a crew "Tap creatures with total power 3 or greater to crew Name." (CR 702.122a), and for an
 * effect's choice "Choose a land you control to return to its owner's hand." (D-096), and for a tap cost
 * "Choose 2 untapped Zombies you control to tap as a cost." (D-133).
 */
export function choosePermanentPrompt(
  decision: Pick<
    ChoosePermanentDecision,
    'purpose' | 'min' | 'max' | 'source' | 'forCost' | 'legal' | 'minTotalPower' | 'subject'
  > &
    Partial<Pick<ChoosePermanentDecision, 'seat' | 'spare'>>,
  index: Index,
): string {
  if (isFight(decision)) return fightPrompt(decision, index);
  if (isDevour(decision)) {
    // A token has no object yet: the question is about the token that the ability on the stack makes.
    const source = index.get(decision.source);
    const entering =
      source?.zone === 'stack' && source.ability !== undefined
        ? `the token ${source.name} creates`
        : nameOf(index, decision.source);
    return devourPrompt(entering);
  }
  if (isSpare(decision)) return sparePrompt(decision);
  if (isCrew(decision)) {
    return `Tap creatures with total power ${crewNeeded(decision)} or greater to crew ${nameOf(index, decision.source)}.`;
  }
  if (isLegendRule(decision)) {
    const first = decision.legal[0];
    const name = first === undefined ? 'a card' : nameOf(index, first);
    return `You control ${decision.legal.length} legendary permanents named ${name}. Choose one to keep; the others go to the graveyard.`;
  }
  if (isEffectChoice(decision)) {
    const tap = tapEffectOf(decision, index);
    return tap === null ? effectPrompt(decision, index) : tapEffectPrompt(decision, tap, index);
  }
  if (isTapCost(decision)) return tapPrompt(decision, index);
  if (isBounceCost(decision)) return bouncePrompt(decision, index);
  const source = nameOf(index, decision.source);
  if (isSpellCost(decision, index)) {
    return `Sacrifice ${spellSacrificeWhat(decision, index)} as an additional cost to cast ${source}.`;
  }
  const link = decision.forCost === true ? 'to pay for' : 'for';
  // D-485, D-488 (CR 118.3, 602.2b): the cost of an activated ability names what it sacrifices: "Sacrifice two other creatures to pay for Name.", "Sacrifice 3 creatures to pay for Name." (X).
  const cost = activationSacrifice(decision, index);
  if (cost !== null) return `Sacrifice ${cost} ${link} ${source}.`;
  // D-135: "Sacrifice any number of other permanents you control for Name." (none is allowed).
  if (isAnyNumber(decision))
    return `Sacrifice ${anyNumberWhat(decision, index)} ${link} ${source}.`;
  // D-187 (CR 701.21): "Sacrifice one or more Treasures you control for Name." (at least one).
  if (isOneOrMore(decision, index)) {
    return `Sacrifice ${anyNumberWhat(decision, index)} ${link} ${source}.`;
  }
  // Annihilator (CR 702.86a): the human is the defending player, and the ability is the opponent's.
  if (isDefendingSacrifice(decision, index)) {
    return `As the defending player, sacrifice ${permanentRange(decision.min, decision.max)} ${link} ${source}.`;
  }
  return `Sacrifice ${permanentRange(decision.min, decision.max)} ${link} ${source}.`;
}

/**
 * What the sacrifice cost of the ability on the stack names, for the count the player must choose: "two other creatures", "3 creatures" (the X announced); null when the decision
 * is not the cost of an activated ability that sacrifices a kind of permanent, or when the choice is of one permanent (the generic words say it).
 */
export function activationSacrifice(
  decision: Pick<ChoosePermanentDecision, 'purpose' | 'forCost' | 'source' | 'min' | 'max'>,
  index: Index,
): string | null {
  if (decision.purpose !== 'sacrifice' || decision.forCost !== true) return null;
  const ability = index.get(decision.source)?.ability;
  if (ability?.kind !== 'activated' || decision.min !== decision.max || decision.max < 2) {
    return null;
  }
  const cost = ability.cost.find((c) => c.kind === 'sacrifice');
  if (cost?.kind !== 'sacrifice' || 'kind' in cost.what) return null;
  return sacrificeWhat(cost.what, decision.max);
}

/**
 * "any number of other permanents you control": what an "any number" sacrifice names, read from the filter of the
 * `sacrifice` effect on the stack (so "any number of Zombies you control" reads right too); "any number of permanents"
 * when the view does not show the ability or its filter has a part the words cannot say. Nothing is guessed.
 */
export function anyNumberWhat(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  const effect = index.get(decision.source)?.ability?.effect;
  const found = effect === undefined ? null : sacrificeIn(effect);
  const selector = found?.objects;
  // D-187: "one or more" says that the choice is of at least one.
  const quantity =
    selector?.kind === 'choose' && selector.atLeastOne === true ? 'one or more' : 'any number of';
  if (selector?.kind !== 'choose') return 'any number of permanents';
  const things = thingsPhrase({ ...selector.filter, controller: 'you' }, true);
  return things === null ? `${quantity} permanents` : `${quantity} ${things}`;
}

/**
 * True for "sacrifice one or more Treasures" (D-187, CR 701.21): a sacrifice of at least one, read from the `sacrifice` effect of the ability on the
 * stack (`ChooseSelector.atLeastOne`); the dialog asks for at least `min`, and says "one or more".
 */
export function isOneOrMore(
  decision: Pick<ChoosePermanentDecision, 'purpose' | 'min' | 'source'>,
  index: Index,
): boolean {
  if (decision.purpose !== 'sacrifice' || decision.min !== 1) return false;
  const effect = index.get(decision.source)?.ability?.effect;
  const selector = (effect === undefined ? null : sacrificeIn(effect))?.objects;
  return selector?.kind === 'choose' && selector.atLeastOne === true;
}

/**
 * True when the sacrifice is the effect of an ability that makes the defending player sacrifice
 * (CR 508.5, 702.86a Annihilator): read from the ability on the stack, so the prompt can say who asks.
 */
export function isDefendingSacrifice(
  decision: Pick<ChoosePermanentDecision, 'purpose' | 'source' | 'forCost'>,
  index: Index,
): boolean {
  if (decision.purpose !== 'sacrifice' || decision.forCost === true) return false;
  const effect = index.get(decision.source)?.ability?.effect;
  return effect?.kind === 'sacrifice' && effect.player?.kind === 'defendingPlayer';
}

/**
 * True when the sacrifice is an additional cost of a spell being cast (CR 118.8, 601.2h, D-095): a
 * cost question whose `source` is a spell on the stack, not an ability (an activation's cost).
 */
export function isSpellCost(
  decision: Pick<ChoosePermanentDecision, 'forCost' | 'purpose' | 'source'>,
  index: Index,
): boolean {
  if (decision.forCost !== true || decision.purpose !== 'sacrifice') return false;
  const source = index.get(decision.source);
  return source !== undefined && source.abilitySource === undefined;
}

/**
 * What the spell's additional cost sacrifices, in its own words ("a creature", "an artifact or
 * creature"), read from the sacrifice cost in `ObjectView.additionalCosts`; the generic count when
 * the card names none, so nothing is guessed.
 */
export function spellSacrificeWhat(
  decision: Pick<ChoosePermanentDecision, 'source' | 'min' | 'max'>,
  index: Index,
): string {
  const cost = index.get(decision.source)?.additionalCosts?.find((c) => c.kind === 'sacrifice');
  // D-491 (CR 118.8): "you may sacrifice one or more creatures": any number of them, none included.
  if (cost?.kind === 'sacrifice' && cost.anyNumber === true && !('kind' in cost.what)) {
    return `any number of ${sacrificeWhat(cost.what, 2).replace(/^two /, '')} (you may choose none)`;
  }
  return cost?.kind === 'sacrifice' && decision.max === 1
    ? sacrificeWhat(cost.what)
    : permanentRange(decision.min, decision.max);
}

/** "0 of 1 chosen", "1 of 2 to 3 chosen". */
export function chosenCount(
  chosen: readonly ObjectId[],
  decision: Pick<ChoosePermanentDecision, 'min' | 'max'>,
): string {
  const { min, max } = decision;
  // D-135: "any number" has no minimum: "0 of up to 3 chosen".
  if (min === 0) return `${chosen.length} of up to ${max} chosen`;
  return `${chosen.length} of ${min === max ? max : `${min} to ${max}`} chosen`;
}

/** "Grizzly Bears (2 power)": a crew chip names the creature's power, which is what counts. */
export function crewChipLabel(name: string, power: number): string {
  return `${name} (${power} power)`;
}

/**
 * Names for the choice list. Permanents that share a name get a number ("Forest 1", "Forest 2"),
 * so the chips can be told apart and read out.
 */
export function permanentLabels(
  legal: readonly ObjectId[],
  index: Index,
): ReadonlyMap<ObjectId, string> {
  const totals = new Map<string, number>();
  for (const id of legal) {
    const name = nameOf(index, id);
    totals.set(name, (totals.get(name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return new Map(
    legal.map((id) => {
      const name = nameOf(index, id);
      if ((totals.get(name) ?? 0) < 2) return [id, name];
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      return [id, `${name} ${n}`];
    }),
  );
}

/**
 * The chips of the legend rule: the shared name told apart by number, and "(token)" for a token,
 * since the copies the rule is about often differ only in being a token.
 */
export function legendLabels(
  legal: readonly ObjectId[],
  index: Index,
): ReadonlyMap<ObjectId, string> {
  const labels = permanentLabels(legal, index);
  return new Map(
    legal.map((id) => {
      const label = labels.get(id) ?? nameOf(index, id);
      return [id, index.get(id)?.isToken === true ? `${label} (token)` : label];
    }),
  );
}

/** The first `sacrifice` effect inside an effect, looking through sequences and conditions. */
function sacrificeIn(effect: Effect): Extract<Effect, { kind: 'sacrifice' }> | null {
  return findEffect(effect, 'sacrifice');
}

/**
 * Whose sacrifice this is and what caused it, for the dock panel of an effect that makes the player
 * sacrifice (CR 701.21, D-131): "Your sacrifice, from your opponent's Name: Each player sacrifices a creature
 * of their choice. Each player chooses their own, the active player first (CR 101.4)." The effect's words
 * come from the ability on the stack when the view shows its AST (a triggered ability); a spell's effect is
 * not in the view, so for a spell the line names the card and the panel's rules text above it says the rest.
 * Null for a sacrifice that is a cost, and for every other choice of permanents.
 */
export function sacrificeCause(
  decision: Pick<ChoosePermanentDecision, 'purpose' | 'source' | 'forCost'>,
  index: Index,
  viewer: SeatId,
): string | null {
  if (decision.purpose !== 'sacrifice' || decision.forCost === true) return null;
  const source = index.get(decision.source);
  if (source === undefined) return null;
  const whose = source.controller === viewer ? 'your' : "your opponent's";
  const ability: StackAbility | undefined = source.ability;
  const host = source.abilitySource === undefined ? undefined : index.get(source.abilitySource);
  const gist = ability === undefined ? '' : triggerGist(ability, host);
  const sacrifice = ability === undefined ? null : sacrificeIn(ability.effect);
  const several = sacrifice?.player !== undefined && namesSeveral(sacrifice.player);
  const effect = gist === '' ? '' : `: ${gist}.`;
  const order = several ? ' Each player chooses their own, the active player first.' : '';
  return `Your sacrifice, from ${whose} ${source.name}${effect === '' ? '.' : effect}${order}`;
}
