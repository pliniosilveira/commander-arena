/**
 * Flashback (CR 702.34a) at priority: a card in the graveyard is cast through a `castSpell` option
 * that carries `alternative: 'flashback'`, and the action sent must carry it too, or the engine
 * refuses the plain cast. The view does not carry the flashback cost as data, so the label reads it
 * from the Oracle text the view does carry ("Flashback {2}{B}"); a text it cannot read leaves the
 * cost out rather than guessing.
 */
import type {
  Action,
  ObjectId,
  ObjectView,
  PriorityDecision,
  PriorityOption,
} from '@commander-arena/engine';
import { isNamedAlternative } from '../../game/alt-cost';
import { activationLabel } from './ability-label';
import { alternativeLabel, foretellCastLabel } from './alt-cost';
import { castCostSuffix } from './cast-cost';
import { exileBadge, faceLabel, libraryBadge } from './layouts';
import type { Index } from './lookup';

type CastOption = Extract<PriorityOption, { kind: 'castSpell' }>;

/**
 * The action for a `castSpell` option: the option's own alternative goes with it, and so does its
 * `face` (a split half, an Adventure, a modal face: the engine lists one option per face and needs
 * the same one back).
 */
export function castAction(option: CastOption): Extract<Action, { kind: 'castSpell' }> {
  return {
    kind: 'castSpell',
    object: option.object,
    ...(option.alternative === undefined ? {} : { alternative: option.alternative }),
    ...(option.face === undefined ? {} : { face: option.face }),
  };
}

/** "{2}{B}" from the card's "Flashback {2}{B}." line, or null when the text has no such cost. */
export function flashbackCost(card: ObjectView | undefined): string | null {
  const found = card?.oracleText.match(/\bFlashback\s+((?:\{[^}\s]+\})+)/i);
  return found?.[1] ?? null;
}

/** "Flashback {2}{B}", or "Flashback" when the cost cannot be read. */
export function flashbackLabel(card: ObjectView | undefined): string {
  const cost = flashbackCost(card);
  return cost === null ? 'Flashback' : `Flashback ${cost}`;
}

/**
 * The label of a castSpell option: "Cast Name", "Cast Name for {1}{R}" when a tax or a reduction
 * makes the cost differ from the printed one (D-095), "Cast Name without paying its mana cost" for a
 * free cast (CR 118.9), "Flashback {cost}", or "Overload {cost}", "Evoke {cost}", "Dash {cost}" for the
 * named alternative costs (D-121; the cost is the one `alternativeCosts` has now). An option that names a face of a multi-face card is
 * worded from that face (`faceLabel`); `castCost` is the front face's, so a face option never gets a
 * cost in its label.
 */
export function castLabel(option: CastOption, card: ObjectView | undefined, name: string): string {
  // D-133 (CR 113.6b): a plain cast of a graveyard card is its own permission ("You may cast this card from
  // your graveyard"), not flashback or escape, which carry an `alternative`.
  if (isGraveyardPermission(option, card))
    return `Cast ${name} from graveyard${castCostSuffix(card)}`;
  // D-151 (CR 601.3, 601.2): the top card of the library under a permission to cast it from there, and a card in exile that an
  // effect lets you play. An Adventure card and a foretold card keep their own words.
  if (option.alternative === undefined && card?.zone === 'library') {
    return `Cast ${name} from the top of your library${castCostSuffix(card)}`;
  }
  if (
    option.alternative === undefined &&
    option.face === undefined &&
    card?.zone === 'exile' &&
    card.onAdventure !== true
  ) {
    return `Cast ${name} from exile${castCostSuffix(card)}`;
  }
  if (option.alternative === 'flashback') return flashbackLabel(card);
  // A foretold card in exile (D-128): "Cast for {R}", the foretell cost it has now.
  if (option.alternative === 'foretell') return foretellCastLabel(card);
  if (isNamedAlternative(option.alternative)) return alternativeLabel(option.alternative, card);
  const faced = faceLabel(option, card)?.label;
  if (option.alternative === 'free') return `${faced ?? `Cast ${name}`}${FREE_SUFFIX}`;
  return faced ?? `Cast ${name}${option.face === undefined ? castCostSuffix(card) : ''}`;
}

/**
 * True for a `castSpell` option with no alternative cost for a card in its owner's graveyard: the card's own
 * static permission to be cast from there (D-133, CR 113.6b), as the engine lists it only while it holds.
 */
export function isGraveyardPermission(option: CastOption, card: ObjectView | undefined): boolean {
  return card?.zone === 'graveyard' && option.alternative === undefined;
}

/** What a free cast says after the card's name (CR 118.9). */
export const FREE_SUFFIX = ' without paying its mana cost';

/** The chip and badge of a graveyard card that its own text lets the player cast (D-133). */
export const GRAVEYARD_CAST = 'Cast from graveyard';

/**
 * What a card of the viewer's graveyard can be used for now, as the words of its buttons, in the
 * order of the menu: "Flashback {2}{B}", "Escape {G}{G}{U}{U}, exile 5 other cards" (D-124, from
 * `alternativeCosts`), "Cast from graveyard" (a plain cast the card allows itself, D-133) and "Unearth {R}" (an `activate` option of a card in the graveyard; the
 * label reads the ability from `ObjectView.activated`). Empty for a card in any other zone and for
 * a graveyard card with nothing on offer.
 */
export function graveyardLabels(
  decision: PriorityDecision,
  card: ObjectView | undefined,
): readonly string[] {
  if (card === undefined || card.zone !== 'graveyard') return [];
  const labels: string[] = [];
  for (const o of decision.options) {
    if (o.kind === 'castSpell' && o.object === card.id) {
      if (o.alternative === 'flashback') labels.push(flashbackLabel(card));
      else if (o.alternative === 'escape') labels.push(alternativeLabel(o.alternative, card));
      else if (isGraveyardPermission(o, card)) labels.push(GRAVEYARD_CAST);
    } else if (o.kind === 'activate' && o.object === card.id) {
      const entry = card.activated?.find((a) => a.abilityIndex === o.abilityIndex);
      labels.push(
        entry === undefined ? `Ability ${o.abilityIndex + 1}` : activationLabel(card, entry),
      );
    }
  }
  return labels;
}

/** The objects of a graveyard that the decision offers something for (flashback, escape, unearth). */
export function graveyardPlayObjects(
  decision: PriorityDecision,
  graveyard: readonly ObjectView[],
): ReadonlySet<ObjectId> {
  return new Set(graveyard.filter((o) => graveyardLabels(decision, o).length > 0).map((o) => o.id));
}

/** The badge a graveyard card shows when it can be used from there; null for anything else. */
export function graveyardBadge(
  decision: PriorityDecision,
  index: Index,
  id: ObjectId,
): string | null {
  const labels = graveyardLabels(decision, index.get(id));
  return labels.length === 0 ? null : labels.join(' / ');
}

/**
 * The badge a card castable from another zone shows where it is listed: "Flashback {cost}",
 * "Escape {cost}, exile N other cards" or "Unearth {cost}" for a graveyard card, "Cast from exile"
 * or "Play from exile" for a card in exile, "Cast from the top of your library" for the top card (D-151); null for anything else.
 */
export function castBadge(
  decision: PriorityDecision,
  playable: ReadonlySet<ObjectId>,
  index: Index,
  id: ObjectId,
): string | null {
  return (
    graveyardBadge(decision, index, id) ??
    libraryBadge(playable, index, id) ??
    exileBadge(playable, index, id, decision)
  );
}
