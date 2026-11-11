/**
 * CasualAgent and the recursion slice (D-135): cards that come back from the graveyard, a permission to cast one this turn,
 * Gift, and sacrificing any number of permanents. Heuristics, deliberately simple; every answer is one the engine offered.
 *
 * - "{cost}: Return this card from your graveyard to the battlefield ..." (an activated ability that works from the
 *   graveyard and brings its own card back): used in the second main phase or an end step, on spare mana, for a creature
 *   card of ours. The engine lists the option only when the cost, reduced or not, can be paid.
 * - "{T}: You may cast target [creature] card from your graveyard this turn": used in a main phase when a card the ability
 *   could name is in our graveyard and the lands we control that are untapped could pay for it. The ordinary spell step
 *   casts it once the permission exists (the engine lists it as a cast from the graveyard).
 * - Gift (CR 702.174): promised only when the card's text says what the gift buys ("If the gift was promised, ..."); a
 *   plain gift is a card for the opponent and nothing for us.
 * - "Sacrifice any number of other permanents" (a choice with no minimum): the permanents we would sacrifice first anyway,
 *   tokens and Treasures and lands beyond what the hand can use (`permanentValue` of 2 or less), each is a card drawn.
 */
import type {
  Action,
  ActivatedAbility,
  ChoosePermanentDecision,
  ConfirmOptionalDecision,
  GameView,
  ObjectFilter,
  ObjectView,
} from '@commander-arena/engine';
import { permanentValue } from './casual-permanents';
import { effectiveCost, findObject, isCreature, isLand } from './casual-view';

/** Permanents worth this much or less are given up for a card (`permanentValue`: a token, a Treasure, a surplus land). */
const SACRIFICE_FOR_CARD_AT_MOST = 2;

/** Spare mana: the second main phase, or an end step of either player's turn. */
const isSpareManaWindow = (view: GameView): boolean =>
  view.step === 'postcombatMain' || view.step === 'end';

/** "Return this card from your graveyard to the battlefield": an ability that works from the graveyard and moves its own card. */
export function returnsItself(ability: ActivatedAbility): boolean {
  const e = ability.effect;
  return (
    ability.functionsIn === 'graveyard' &&
    e.kind === 'moveToZone' &&
    e.objects.kind === 'this' &&
    e.to === 'battlefield'
  );
}

/** Whether the agent uses `ability` of its card `card` in the graveyard now (see the file comment). */
export function wantsGraveyardReturn(view: GameView, card: ObjectView): boolean {
  return card.zone === 'graveyard' && isCreature(card) && isSpareManaWindow(view);
}

/** "{T}: You may cast target ... card from your graveyard this turn." */
export function grantsCast(ability: ActivatedAbility): boolean {
  return ability.effect.kind === 'mayCast';
}

/** The simple part of a target filter a view can answer: card types and subtypes. */
function fits(card: ObjectView, filter: ObjectFilter): boolean {
  return (
    (filter.types ?? []).every((t) => card.types.includes(t)) &&
    (filter.subtypes ?? []).every((s) => card.subtypes.includes(s))
  );
}

/** The untapped lands the agent controls: what it could spend on a card it was just allowed to cast. */
function untappedLands(view: GameView): number {
  return view.battlefield.filter((o) => o.controller === view.viewer && isLand(o) && !o.tapped)
    .length;
}

/**
 * Whether the agent gives itself a permission to cast a card from its graveyard: a main phase of its own turn, and a card the
 * ability could name that the untapped lands pay for. The caller has checked that the engine offers the activation.
 */
export function wantsCastPermission(view: GameView, ability: ActivatedAbility): boolean {
  if (!grantsCast(ability) || view.activeSeat !== view.viewer) return false;
  if (view.step !== 'precombatMain' && view.step !== 'postcombatMain') return false;
  const filter = ability.targets?.[0]?.what;
  if (filter === undefined || filter.kind !== 'object') return false;
  const mine = view.seats.find((s) => s.id === view.viewer)?.graveyard ?? [];
  const lands = untappedLands(view);
  return mine.some((o) => isCreature(o) && fits(o, filter.filter) && effectiveCost(o) <= lands);
}

/**
 * "Promise a gift to this opponent?" (CR 702.174a): yes when the spell's text names what the promise buys, else no. The
 * spell is on the stack, so its text is on the view.
 */
export function giftAnswer(view: GameView, d: ConfirmOptionalDecision): Action | null {
  if (d.purpose !== 'gift') return null;
  const spell = findObject(view, d.source);
  return spell !== undefined && /if the gift was promised/i.test(spell.oracleText)
    ? { kind: 'acceptOptional' }
    : { kind: 'declineOptional' };
}

/**
 * "Sacrifice any number of other permanents" (a `choosePermanent` that may be answered with none): the ones the agent would
 * give up for a card. A decision with a minimum is answered by the ordinary sacrifice choice.
 */
export function chooseAnyNumberToSacrifice(view: GameView, d: ChoosePermanentDecision): Action {
  const chosen = d.legal.filter((id) => {
    const o = findObject(view, id);
    return o !== undefined && permanentValue(view, o) <= SACRIFICE_FOR_CARD_AT_MOST;
  });
  return { kind: 'choosePermanents', objects: chosen.slice(0, d.max) };
}
