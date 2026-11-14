/**
 * CasualAgent choices among the named alternative costs of a card (D-121, D-124): Overload (CR 702.96), Evoke
 * (CR 702.74), Dash (CR 702.109) and Spectacle (CR 702.137). The engine lists one `castSpell` option for each alternative the
 * caster can pay, beside the ordinary cast, so the agent only decides which of the options of one card to
 * take. It reads the card's text from the view, like the rest of the heuristics:
 * - Overload ("each" for "target") is chosen when the text only names the opponent's objects ("you don't
 *   control", "an opponent controls") and at least three of them are on the table, or when the ordinary
 *   cast has no target to use and at least one is. A text that also reaches the agent's own objects is
 *   never overloaded.
 * - Evoke is chosen only when the ordinary cast cannot be paid (the creature would be sacrificed at once)
 *   and the card has an enters ability worth the mana: its text says it enters, and a "target creature" in
 *   it has an opposing creature to aim at.
 * - Spectacle is chosen whenever the engine offers it: it is offered only while an opponent has lost life this
 *   turn, it only replaces the mana cost and has no drawback.
 * - Tapping permanents (D-149) is chosen when the ordinary cast cannot be paid.
 * - Dash is chosen when the ordinary cast cannot be paid, or in the first main phase when the opponent has
 *   no untapped creature to block and the creature has power to spend: it attacks at once and is back in
 *   the hand at the end of the turn, out of the way of sorcery-speed removal.
 *
 * Two things are not a choice among the options of one card and live here too (D-124): Escape (CR 702.138), a
 * card in the graveyard that `casual-priority.ts` casts once no hand spell is worth casting, whose other cards to
 * exile are `chooseEscapeExile`; and Unearth (CR 702.84), an activation from the graveyard that
 * `casual-activations.ts` makes when `wantsUnearth` says the creature attacks safely or for the win.
 */
import {
  type Action,
  type ActivatedAbility,
  type ChooseCardsDecision,
  type GameView,
  manaValue,
  type NamedAlternativeKind,
  type ObjectView,
} from '@commander-arena/engine';
import {
  findObject,
  isCreature,
  isLand,
  manaValueOf,
  opponentLife,
  opposingCreatures,
  powerOf,
  toughnessOf,
} from './casual-view';

/** Text that names only objects the opponent controls: the shape of the overload spells. */
const HOSTILE_ONLY = /you (don['’]t|do not) control|an opponent controls|your opponents control/i;

/** The opponent's permanents an overload on this text would affect (creatures when the text says so). */
function overloadVictims(view: GameView, spell: ObjectView): number {
  const theirs = view.battlefield.filter((o) => o.controller !== view.viewer);
  if (/creature/i.test(spell.oracleText)) return theirs.filter(isCreature).length;
  return theirs.filter((o) => !o.types.includes('land')).length;
}

function wantsOverload(view: GameView, spell: ObjectView, ordinary: boolean): boolean {
  if (!HOSTILE_ONLY.test(spell.oracleText)) return false;
  const victims = overloadVictims(view, spell);
  return ordinary ? victims >= 3 : victims >= 1;
}

function wantsEvoke(view: GameView, card: ObjectView, ordinary: boolean): boolean {
  if (ordinary || !/enters/i.test(card.oracleText)) return false;
  if (/target creature/i.test(card.oracleText)) return opposingCreatures(view).length > 0;
  return true;
}

function wantsDash(view: GameView, card: ObjectView, ordinary: boolean): boolean {
  if (!ordinary) return true;
  if (view.step !== 'precombatMain' || view.activeSeat !== view.viewer) return false;
  const blockers = opposingCreatures(view).filter((o) => !o.tapped);
  return blockers.length === 0 && powerOf(card) >= 1;
}

/**
 * Which named alternative cost to cast the card for, among `offered` (the alternatives the engine lists
 * for it), or undefined for the ordinary cast. `ordinary` says whether the ordinary cast is on offer (and
 * worth making); with none of the alternatives wanted and no ordinary cast the card is not cast.
 */
export function chooseNamedAlternative(
  view: GameView,
  card: ObjectView,
  offered: ReadonlySet<NamedAlternativeKind>,
  ordinary: boolean,
): NamedAlternativeKind | undefined {
  // A foretold card (CR 702.143a, D-128) can only be cast for its foretell cost: it is the cast, so it is chosen.
  if (offered.has('foretell')) return 'foretell';
  if (offered.has('spectacle')) return 'spectacle';
  if (offered.has('overload') && wantsOverload(view, card, ordinary)) return 'overload';
  if (offered.has('dash') && wantsDash(view, card, ordinary)) return 'dash';
  if (offered.has('evoke') && wantsEvoke(view, card, ordinary)) return 'evoke';
  // D-149: "pay {W} and tap four untapped creatures with flying": chosen when the ordinary cast cannot be paid; the creatures it
  // taps are chosen like any permanents tapped for a cost (`choosePermanentToTap`).
  if (offered.has('tapPermanents') && !ordinary) return 'tapPermanents';
  return undefined;
}

/** What the alternative costs of the card, in mana, so a play can be ranked by what it spends. */
export function alternativeSpend(card: ObjectView, kind: NamedAlternativeKind): number {
  const cost = card.alternativeCosts?.find((a) => a.kind === kind)?.cost;
  return cost === undefined ? 0 : manaValue(cost);
}

/**
 * What it costs the agent to lose a card from its graveyard to an escape cost (CR 702.138a): the higher, the more
 * it wants to keep it. Lands and instants and sorceries first, then permanents by mana value; a card that can
 * come back from the graveyard (flashback, escape, unearth, eternalize) is kept longest, since exiling it ends that.
 */
function graveyardKeepValue(o: ObjectView): number {
  if (/\b(flashback|escape|unearth|eternalize)\b/i.test(o.oracleText)) return 20 + manaValueOf(o);
  if (isLand(o)) return 0;
  if (o.types.includes('instant') || o.types.includes('sorcery')) return 1;
  return 2 + manaValueOf(o) / 10;
}

/**
 * The other cards an escape cost exiles (`chooseCards`, purpose 'exile', D-124): the `min` cards the agent wants
 * least, in the order the engine lists them when equal.
 */
export function chooseEscapeExile(view: GameView, d: ChooseCardsDecision): Action {
  const ranked = d.legal
    .map((id, index) => {
      const o = findObject(view, id);
      return {
        id,
        index,
        keep: o === undefined ? Number.POSITIVE_INFINITY : graveyardKeepValue(o),
      };
    })
    .sort((a, b) => a.keep - b.keep || a.index - b.index)
    .slice(0, d.min)
    .map((c) => c.id);
  return { kind: 'chooseCards', objects: d.legal.filter((id) => ranked.includes(id)) };
}

/**
 * "... become a copy of an artifact or creature card from among those cards" (Spirit of Resilience, D-232, a `chooseCards` of purpose `copy`): the creature card with the most
 * power, then the highest mana value; the first in the engine's order when they are equal or the view does not show the card.
 */
export function chooseCopyCard(view: GameView, d: ChooseCardsDecision): Action {
  const shown = new Map((view.pendingCards ?? []).map((o) => [o.id, o]));
  const ranked = d.legal
    .map((id, index) => {
      const o = shown.get(id) ?? findObject(view, id);
      return {
        id,
        index,
        value: o === undefined ? 0 : (isCreature(o) ? powerOf(o) * 10 : 0) + manaValueOf(o),
      };
    })
    .sort((a, b) => b.value - a.value || a.index - b.index);
  const first = ranked[0];
  return { kind: 'chooseCards', objects: first === undefined ? [] : [first.id] };
}

/**
 * "An opponent chooses one of the exiled cards. [The controller] puts that card on the bottom of their library and returns the other to the battlefield tapped" (Coin of
 * Fate, D-232, a `chooseCards` of purpose `split` asked of the agent that is the opponent): the card the agent picks is the one the controller does not get, so it picks the
 * card it fears most (the highest `graveyardKeepValue`; on a tie the first in the engine's order) and the controller gets the other.
 */
export function chooseSplitExiled(view: GameView, d: ChooseCardsDecision): Action {
  const ranked = d.legal
    .map((id, index) => {
      const o = findObject(view, id);
      return { id, index, keep: o === undefined ? 0 : graveyardKeepValue(o) };
    })
    .sort((a, b) => b.keep - a.keep || a.index - b.index);
  const first = ranked[0];
  return { kind: 'chooseCards', objects: first === undefined ? [] : [first.id] };
}

/**
 * Whether the agent unearths this creature card from its graveyard now (CR 702.84a, D-124): in the first main
 * phase of its own turn (the engine lists it only at sorcery speed), when the creature has power and would attack
 * safely or for the win. It has haste, and is exiled at the end step, so it is worth the mana only as an attacker:
 * the opponent must have nothing untapped that could block and kill it, or it must be lethal.
 */
export function wantsUnearth(view: GameView, card: ObjectView): boolean {
  if (view.step !== 'precombatMain' || view.activeSeat !== view.viewer) return false;
  if (!isCreature(card) || powerOf(card) < 1) return false;
  if (powerOf(card) >= opponentLife(view)) return true;
  const blockers = opposingCreatures(view).filter((o) => !o.tapped);
  return blockers.every((b) => powerOf(b) < toughnessOf(card));
}

/**
 * Whether an ability is a one-turn reanimation (D-459, Whip of Erebos): it returns a creature card from a graveyard to the battlefield, which is exiled at the end step and if it
 * would leave the battlefield (a sequence with the move, `exileIfLeaves` and the delayed exile), as Unearth does for the card itself.
 */
export function isOneTurnReanimation(ability: ActivatedAbility): boolean {
  const effect = ability.effect;
  if (effect.kind !== 'sequence') return false;
  const moves = effect.effects.some(
    (e) => e.kind === 'moveToZone' && e.to === 'battlefield' && e.objects.kind === 'target',
  );
  return moves && effect.effects.some((e) => e.kind === 'exileIfLeaves');
}

/**
 * Whether the agent reanimates for one turn now (D-459): a creature card of its own graveyard would attack safely (`wantsUnearth`: the same test, the same first main phase),
 * since the creature goes away at the end step, so it is worth the mana only as an attacker.
 */
export function wantsOneTurnReanimation(view: GameView): boolean {
  const seat = view.seats.find((s) => s.id === view.viewer);
  return (seat?.graveyard ?? []).some((card) => wantsUnearth(view, card));
}

/**
 * Whether the agent eternalizes this creature card from its graveyard now (CR 702.129a, D-384): in a main phase of its own turn (the engine lists it only at sorcery
 * speed). The token is a 4/4 black Zombie that stays, with the abilities of the card, so it is worth the mana whenever the card is a creature card that could not be cast
 * for less: the option is listed only when the cost can be paid, and the exile ends nothing the card could still do from the graveyard.
 */
export function wantsEternalize(view: GameView, card: ObjectView): boolean {
  if (view.activeSeat !== view.viewer) return false;
  if (view.step !== 'precombatMain' && view.step !== 'postcombatMain') return false;
  return isCreature(card) && card.owner === view.viewer;
}
