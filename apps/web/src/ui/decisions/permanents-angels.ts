/**
 * The questions of the Angels slice (D-149) that the engine asks as a `choosePermanent`: proliferate (any number of permanents
 * with a counter and of players with poison counters, CR 701.34a), the permanent an Aura that enters by an effect will enchant
 * (CR 303.4f), and the permanents tapped as the alternative cost of a spell (CR 118.9, 601.2h). The words read the decision and
 * the objects it names and nothing else; the engine stays the judge of every answer. Pure.
 */
import type {
  Action,
  ChoosePermanentDecision,
  ObjectId,
  ObjectView,
  SeatId,
} from '@commander-arena/engine';
import { PROLIFERATE_REMINDER } from '../../game/angels-text';
import { type Index, nameOf, plural, seatLabel, stackName } from './lookup';
import { legalNoun } from './permanents';
import { AMASS_BADGE, amassPrompt, isAmass } from './permanents-amass';
import { BLIGHT_BADGE, blightPrompt, isBlight } from './permanents-blight';
import { conniveOrderPrompt, isConniveOrder } from './permanents-connive';
import { entersCopyPrompt, isEntersCopy } from './permanents-dragons';
import { isRingBearer, RING_BEARER_BADGE, ringBearerPrompt } from './permanents-ring';
import { isSoulbond, SOULBOND_BADGE, soulbondPrompt } from './permanents-soulbond';
import { isUntapChoice, UNTAP_CHOICE_BADGE, untapChoicePrompt } from './permanents-untap';

type Purposed = Pick<ChoosePermanentDecision, 'purpose'>;

/** True for the choice of what proliferate gives a counter to (CR 701.34a). */
export function isProliferate(decision: Purposed): boolean {
  return decision.purpose === 'proliferate';
}

/** True for the choice of the permanent an Aura entering by an effect is attached to (CR 303.4f). */
export function isAuraHost(decision: Purposed): boolean {
  return decision.purpose === 'auraHost';
}

/** True for the permanents tapped to cast a spell by its alternative cost (a `tap` cost of a spell, not of an ability). */
export function isSpellTap(
  decision: Pick<ChoosePermanentDecision, 'purpose' | 'forCost' | 'source'>,
  index: Index,
): boolean {
  if (decision.purpose !== 'tap' || decision.forCost !== true) return false;
  const source = index.get(decision.source);
  return source !== undefined && source.abilitySource === undefined;
}

/** The players the proliferate decision lists (those with poison counters); none for any other decision. */
export function proliferatePlayers(
  decision: Pick<ChoosePermanentDecision, 'players'>,
): readonly SeatId[] {
  return decision.players ?? [];
}

/** Toggles a player of the proliferate choice: chosen again, they are taken back. A seat that is not listed is ignored. */
export function togglePlayer(
  chosen: readonly SeatId[],
  decision: Pick<ChoosePermanentDecision, 'players'>,
  seat: SeatId,
): readonly SeatId[] {
  if (chosen.includes(seat)) return chosen.filter((s) => s !== seat);
  return proliferatePlayers(decision).includes(seat) ? [...chosen, seat] : chosen;
}

/** Everything the decision lists, for "Choose all": every permanent and every player. */
export function proliferateAll(decision: ChoosePermanentDecision): {
  readonly objects: readonly ObjectId[];
  readonly players: readonly SeatId[];
} {
  return { objects: decision.legal, players: proliferatePlayers(decision) };
}

/** The answer of the proliferate choice: the permanents and the players chosen (`players` only when some are). */
export function proliferateAnswer(
  objects: readonly ObjectId[],
  players: readonly SeatId[],
): Extract<Action, { kind: 'choosePermanents' }> {
  return players.length === 0
    ? { kind: 'choosePermanents', objects }
    : { kind: 'choosePermanents', objects, players };
}

/** "3 +1/+1 counters, 1 page counter": what a permanent proliferate would add to has now, in the engine's order. */
export function counterSummary(counters: ObjectView['counters']): string {
  return Object.entries(counters)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => plural(n, `${kind} counter`))
    .join(', ');
}

/**
 * "Grizzly Bears (3 +1/+1 counters), yours": the chip of a permanent with counters and whose it is (the counters are public, so
 * they are always said; proliferate may help an opponent's permanent too).
 */
export function proliferateChipLabel(
  name: string,
  counters: ObjectView['counters'],
  whose: 'yours' | "opponent's",
): string {
  const summary = counterSummary(counters);
  return `${name}${summary === '' ? '' : ` (${summary})`}, ${whose}`;
}

/** "You (3 poison counters)", "Opponent (1 poison counter)". */
export function poisonChipLabel(seat: SeatId, viewer: SeatId, poison: number): string {
  return `${seatLabel(seat, viewer)} (${plural(poison, 'poison counter')})`;
}

/** The title of the dock panel of a proliferate: "Proliferate". The card is named in the prompt. */
export const PROLIFERATE_TITLE = 'Proliferate';

/** What the panel explains under its title (CR 701.34a). */
export const PROLIFERATE_HELP = PROLIFERATE_REMINDER;

/** The prompt of the bar: "Proliferate for Name: choose any number of permanents and players with counters." */
export function proliferatePrompt(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  return `Proliferate for ${stackName(index, decision.source)}: choose any number of permanents and players with counters.`;
}

/** The second line of the bar: what is chosen, and what Confirm does with an empty choice. */
export function proliferateDetail(objects: number, players: number): string {
  if (objects === 0 && players === 0) {
    return 'Click permanents or players to proliferate them, or Confirm to proliferate nothing.';
  }
  const parts = [
    objects === 0 ? null : plural(objects, 'permanent'),
    players === 0 ? null : plural(players, 'player'),
  ].filter((p) => p !== null);
  return `${parts.join(' and ')} chosen: each gets another counter of each kind it has. Click again to take one back.`;
}

/** The label of Confirm: "Proliferate (3)" with a choice, "Proliferate nothing" without. */
export function proliferateConfirmLabel(objects: number, players: number): string {
  const total = objects + players;
  return total === 0 ? 'Proliferate nothing' : `Proliferate (${total})`;
}

/** The prompt of the bar for an Aura that enters by an effect: "Choose what Angelic Mantle enters attached to." */
export function auraHostPrompt(
  decision: Pick<ChoosePermanentDecision, 'subject'>,
  index: Index,
): string {
  const aura = decision.subject === undefined ? 'the Aura' : nameOf(index, decision.subject);
  return `Choose what ${aura} enters attached to.`;
}

/** The title of its dock panel: "Attach Angelic Mantle". */
export function auraHostTitle(
  decision: Pick<ChoosePermanentDecision, 'subject'>,
  index: Index,
): string {
  return `Attach ${decision.subject === undefined ? 'the Aura' : nameOf(index, decision.subject)}`;
}

/**
 * "Choose 4 untapped creatures to tap for Sky Blade Angel's alternative cost." (CR 118.9, 601.2h): the permanents a spell cast by
 * tapping them asks for. The stack object carries no cost list, so the noun is read from the permanents the engine lists.
 */
export function spellTapPrompt(
  decision: Pick<ChoosePermanentDecision, 'min' | 'max' | 'source' | 'legal'>,
  index: Index,
): string {
  const noun = legalNoun(decision.legal, index);
  const what =
    decision.min === decision.max
      ? plural(decision.max, `untapped ${noun}`, `untapped ${noun}s`)
      : `${decision.min} to ${plural(decision.max, `untapped ${noun}`, `untapped ${noun}s`)}`;
  return `Choose ${what} to tap as the alternative cost of ${nameOf(index, decision.source)}.`;
}

/** The title of the panel of a spell's tap cost: "Tap to cast Sky Blade Angel". */
export function spellTapTitle(
  decision: Pick<ChoosePermanentDecision, 'source'>,
  index: Index,
): string {
  return `Tap to cast ${nameOf(index, decision.source)}`;
}

/**
 * The prompt of the three questions above, or null for any other `choosePermanent` (`choosePermanentPrompt` of `permanents.ts` then
 * has the words). Kept here so that file does not import this one.
 */
export function angelsPermanentPrompt(
  decision: ChoosePermanentDecision,
  index: Index,
): string | null {
  if (isProliferate(decision)) return proliferatePrompt(decision, index);
  if (isAuraHost(decision)) return auraHostPrompt(decision, index);
  if (isSpellTap(decision, index)) return spellTapPrompt(decision, index);
  // D-151 (CR 707.9): "As this artifact enters, you may have it become a copy of any creature".
  if (isEntersCopy(decision))
    return entersCopyPrompt(decision, index, legalNoun(decision.legal, index));
  // D-196 (CR 701.54a): "Each time the Ring tempts you, choose a creature you control".
  if (isRingBearer(decision)) return ringBearerPrompt(decision, index);
  // D-370 (CR 701.47a): "Choose an Army creature you control".
  if (isAmass(decision)) return amassPrompt(decision, index);
  // D-1252 (CR 701.68a): "Blight 1", a cost that puts -1/-1 counters on a creature you control.
  if (isBlight(decision)) return blightPrompt(decision, index);
  // D-286 (CR 702.95a): "you may pair this creature with another unpaired creature you control".
  if (isSoulbond(decision)) return soulbondPrompt(decision, index);
  // D-216 (CR 701.26a): "Untap up to three lands."
  if (isUntapChoice(decision)) return untapChoicePrompt(decision, index);
  // D-223 (CR 701.50c): several permanents connive at once.
  if (isConniveOrder(decision)) return conniveOrderPrompt(decision, index);
  return null;
}

/** The badge on a chosen permanent of the three questions, or null for any other. */
export function angelsBadge(
  decision: Pick<ChoosePermanentDecision, 'purpose' | 'forCost' | 'source'>,
  index: Index,
): string | null {
  if (isProliferate(decision)) return 'Proliferate';
  if (isAuraHost(decision)) return 'Enchant';
  if (isEntersCopy(decision)) return 'Copy';
  if (isRingBearer(decision)) return RING_BEARER_BADGE;
  if (isAmass(decision)) return AMASS_BADGE;
  if (isBlight(decision)) return BLIGHT_BADGE;
  if (isSoulbond(decision)) return SOULBOND_BADGE;
  if (isUntapChoice(decision)) return UNTAP_CHOICE_BADGE;
  if (isConniveOrder(decision)) return 'Connives';
  return isSpellTap(decision, index) ? 'Tap' : null;
}
