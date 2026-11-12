/** Manual mana payment (CR 601.2g-h): the order in which the player taps sources. */
import type { ManaColor, ObjectId, ObjectView, PayManaDecision } from '@commander-arena/engine';
import { turnUpPayPrompt } from '../../game/face-down-text';
import { SPECIAL_CANCEL, specialPayPrompt } from '../../game/later-text';
import { ATTACK_TAX_CANCEL, attackTaxPrompt } from './attack-tax';
import { BLOCK_TAX_CANCEL, blockTaxPrompt } from './block-tax';
import { type Index, nameOf, stackName } from './lookup';
import { lifeCostOf } from './mana-choice';
import { mayPayPrompt, SACRIFICE_IT, unlessPaysPrompt } from './optional';

export interface Tap {
  readonly object: ObjectId;
  readonly abilityIndex: number;
  /** The color chosen for an ability that offers several (a Treasure, a dual land). */
  readonly color?: ManaColor;
  /** The combination chosen for an ability that makes one of several (a filter land, D-099). */
  readonly combination?: readonly ManaColor[];
  /** The permanent a cost "Sacrifice a Spirit" gives up (D-222): chosen when there is more than one to give up. */
  readonly sacrifice?: ObjectId;
}

type Sources = PayManaDecision['manaSources'];
type Source = Sources[number];

/** True when the player must say which color the source makes: the engine offers more than one. */
export function asksColor(source: Source): boolean {
  return (source.colors?.length ?? 0) > 1;
}

/** True when the source makes one of several combinations and the engine offers more than one. */
export function asksCombination(source: Source): boolean {
  return (source.combinations?.length ?? 0) > 1;
}

/** True when the player must say which permanent the source's cost sacrifices ("Sacrifice a Spirit: Add {R}.", D-222): the engine offers more than one. */
export function asksSacrifice(source: Source): boolean {
  return (source.sacrifices?.length ?? 0) > 1;
}

/** True when the player must say something before the source is tapped: a color, a combination or what to sacrifice. */
export function asksChoice(source: Source): boolean {
  return asksColor(source) || asksCombination(source) || asksSacrifice(source);
}

/**
 * The tap of a source's ability that needs no question. A combination ability with one combination
 * on offer still names it: a manual tap of a combination source must (the engine refuses without).
 */
function plainTap(object: ObjectId, source: Source): Tap {
  const only = source.combinations?.length === 1 ? source.combinations[0] : undefined;
  return only === undefined
    ? { object, abilityIndex: source.abilityIndex }
    : { object, abilityIndex: source.abilityIndex, combination: only };
}

/** What a click on a source does while paying: change the taps, or ask a color first. */
export type SourceClick =
  | { readonly kind: 'taps'; readonly taps: readonly Tap[] }
  | { readonly kind: 'choose'; readonly abilityIndex: number };

/** True when tapping the source sacrifices it ("{T}, Sacrifice this token: Add ..."). */
export function sacrificesWhenTapped(object: ObjectView | undefined): boolean {
  return object !== undefined && /sacrifice (this|it)\b/i.test(object.oracleText);
}

/**
 * Taps the source's ability for `color` (replacing an earlier tap of it, keeping its place in the
 * order). The color must be one the engine offered for that ability; anything else changes nothing.
 */
export function setTapColor(
  taps: readonly Tap[],
  sources: Sources,
  object: ObjectId,
  abilityIndex: number,
  color: ManaColor,
  sacrifice?: ObjectId,
): readonly Tap[] {
  const offered = sources.find((s) => s.object === object && s.abilityIndex === abilityIndex);
  if (offered === undefined || !(offered.colors ?? []).includes(color)) return taps;
  return putTap(taps, {
    object,
    abilityIndex,
    color,
    ...(sacrifice === undefined ? {} : { sacrifice }),
  });
}

/**
 * Taps the source's ability giving up `sacrifice` (D-222: "Sacrifice a Spirit: Add {R}."). The permanent must be one the engine offered for that ability;
 * anything else changes nothing. An ability that also asks a color or a combination keeps the tap's other choices through the second question.
 */
export function setTapSacrifice(
  taps: readonly Tap[],
  sources: Sources,
  object: ObjectId,
  abilityIndex: number,
  sacrifice: ObjectId,
): readonly Tap[] {
  const offered = sources.find((s) => s.object === object && s.abilityIndex === abilityIndex);
  if (offered === undefined || !(offered.sacrifices ?? []).includes(sacrifice)) return taps;
  return putTap(taps, { ...plainTap(object, offered), sacrifice });
}

/** Puts the tap in the payment: it replaces an earlier tap of the source and keeps its place. */
function putTap(taps: readonly Tap[], tap: Tap): readonly Tap[] {
  return taps.some((t) => t.object === tap.object)
    ? taps.map((t) => (t.object === tap.object ? tap : t))
    : [...taps, tap];
}

/** True when two combinations hold the same mana (the order of the list does not matter). */
export function sameCombination(a: readonly ManaColor[], b: readonly ManaColor[]): boolean {
  return a.length === b.length && [...a].sort().join('') === [...b].sort().join('');
}

/**
 * Taps the source's ability for `combination` ("Add {R}{R}, {R}{W} or {W}{W}", D-099). The
 * combination must be one the engine offered for that ability; anything else changes nothing.
 */
export function setTapCombination(
  taps: readonly Tap[],
  sources: Sources,
  object: ObjectId,
  abilityIndex: number,
  combination: readonly ManaColor[],
  sacrifice?: ObjectId,
): readonly Tap[] {
  const offered = sources.find((s) => s.object === object && s.abilityIndex === abilityIndex);
  const found = (offered?.combinations ?? []).find((c) => sameCombination(c, combination));
  if (found === undefined) return taps;
  return putTap(taps, {
    object,
    abilityIndex,
    combination: found,
    ...(sacrifice === undefined ? {} : { sacrifice }),
  });
}

/** Takes a source out of the payment. */
export function untap(taps: readonly Tap[], object: ObjectId): readonly Tap[] {
  return taps.filter((t) => t.object !== object);
}

/**
 * Click on a mana source. A source with one mana ability toggles. A source with several cycles
 * through its abilities and then back to untapped, so every ability can be chosen. An ability
 * that offers a choice of colors asks first (`choose`): the tap is made when a color is picked.
 */
export function clickSource(taps: readonly Tap[], sources: Sources, object: ObjectId): SourceClick {
  const entries = sources.filter((s) => s.object === object);
  const first = entries[0];
  if (first === undefined) return { kind: 'taps', taps };
  const current = taps.find((t) => t.object === object);
  const index =
    current === undefined ? -1 : entries.findIndex((e) => e.abilityIndex === current.abilityIndex);
  const next = entries[index + 1];
  if (next === undefined) return { kind: 'taps', taps: untap(taps, object) };
  if (asksChoice(next)) return { kind: 'choose', abilityIndex: next.abilityIndex };
  // Keep the source's place in the tap order.
  return { kind: 'taps', taps: putTap(taps, plainTap(object, next)) };
}

/** "1", "2", ... in tap order; "1 (B)" for a chosen color and "1 (RW)" for a chosen combination. */
export function tapBadges(taps: readonly Tap[]): ReadonlyMap<ObjectId, string> {
  const chosen = (t: Tap): string | null =>
    t.color !== undefined ? t.color : t.combination !== undefined ? t.combination.join('') : null;
  return new Map(
    taps.map((t, i) => {
      const what = chosen(t);
      return [t.object, what === null ? String(i + 1) : `${i + 1} (${what})`];
    }),
  );
}

/**
 * A line for the bar when the sources tapped so far cost life ("{T}, Pay 1 life: Add ..."): the
 * total, so a manual payment is never a surprise. Null when nothing tapped costs life.
 */
export function payLifeDetail(taps: readonly Tap[], index: Index): string | null {
  const total = taps.reduce(
    (sum, t) => sum + lifeCostOf(index.get(t.object), t.color ?? null, t.combination),
    0,
  );
  return total > 0 ? `These taps cost ${total} life.` : null;
}

export function payLabel(taps: number): string {
  return taps === 0 ? 'Pay' : `Pay (${taps} ${taps === 1 ? 'tap' : 'taps'})`;
}

/**
 * The bar prompt of a payment: "Pay for Bolt: tap your mana sources." for a cast or an activation,
 * and for Ward's mana (CR 702.21a) what is at stake: "Pay {2} for ward or Bolt is countered: tap
 * your mana sources." (`totalCost` is the mana part only; a life part was paid at the question).
 * For a counterspell's cost the counterspell is named instead of "ward": "Pay {3} for Soft Counter or
 * Bolt is countered: ...".
 */
export function payBarPrompt(d: PayManaDecision, index: Index): string {
  if (d.purpose === 'attackTax') return attackTaxPrompt(d);
  if (d.purpose === 'blockTax') return blockTaxPrompt(d);
  // Suspend and Foretell (D-128): a special action, its cost paid before the card is exiled.
  // Turning a face-down permanent face up (D-310, CR 701.40b): its cost, paid before it is turned.
  if (d.purpose === 'turnFaceUp') {
    return `${turnUpPayPrompt(d.totalCost, nameOf(index, d.source))}: tap your mana sources.`;
  }
  if (d.purpose === 'suspend' || d.purpose === 'foretell') {
    const prompt = specialPayPrompt(
      d.purpose,
      d.totalCost,
      nameOf(index, d.source),
      index.get(d.source),
    );
    return `${prompt}: tap your mana sources.`;
  }
  if (d.purpose === undefined) {
    return `Pay for ${nameOf(index, d.source)}: tap your mana sources.`;
  }
  const mana = d.totalCost.map((s) => `{${s}}`).join('');
  if (d.purpose === 'unlessPays') {
    // The mana of "[do something] unless you pay": what is at stake is the effect, not a spell.
    const ask = unlessPaysPrompt(
      [{ kind: 'mana', symbols: d.totalCost }],
      {
        seat: d.seat,
        source: d.source,
        sourceName: nameOf(index, d.source),
        ...(d.upkeep === undefined ? {} : { upkeep: d.upkeep }),
      },
      index,
    );
    return `${ask.replace(/\?$/, ':')} tap your mana sources.`;
  }
  if (d.purpose === 'mayPay') {
    // Extort's "you may pay {W/B}": "Pay {W/B} for extort: tap your mana sources."
    const ask = mayPayPrompt(
      [{ kind: 'mana', symbols: d.totalCost }],
      { source: d.source, sourceName: nameOf(index, d.source) },
      index,
    );
    return `${ask.replace(/\?$/, ':')} tap your mana sources.`;
  }
  const subject = d.subject === undefined ? 'that spell' : stackName(index, d.subject);
  const reason = d.purpose === 'ward' ? 'ward' : nameOf(index, d.source);
  return `Pay ${mana} for ${reason} or ${subject} is countered: tap your mana sources.`;
}

/**
 * The label of the payment's Cancel. For a cast it takes the cast back; at the payment of Ward or of a
 * counterspell's cost `cancel` means "do not pay" and the spell or ability is countered, so the button says so.
 */
export function payCancelLabel(d: Pick<PayManaDecision, 'purpose' | 'upkeep'>): string {
  // The cost of attacking (CR 508.1h): `cancel` asks for the attackers again, nothing is countered.
  if (d.purpose === 'attackTax') return ATTACK_TAX_CANCEL;
  // The cost of blocking (CR 509.1d, D-149): `cancel` asks for the blockers again, nothing is countered.
  if (d.purpose === 'blockTax') return BLOCK_TAX_CANCEL;
  // Suspend and Foretell (D-128): nothing has happened yet; priority comes back.
  if (d.purpose === 'suspend' || d.purpose === 'foretell' || d.purpose === 'turnFaceUp') {
    return SPECIAL_CANCEL;
  }
  // Echo and Cumulative upkeep (D-127): not paying sacrifices the permanent.
  if (d.purpose === 'unlessPays' && d.upkeep !== undefined) return SACRIFICE_IT;
  if (d.purpose === 'unlessPays' || d.purpose === 'mayPay') return "Don't pay";
  return d.purpose === undefined ? 'Cancel' : "Don't pay (it is countered)";
}
