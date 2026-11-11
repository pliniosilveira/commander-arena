/**
 * Which permanents an Equipment or an Aura may be dropped on, worked out from the view alone.
 * The engine is the authority (it lists the legal targets once the cast or the ability has
 * started), so this is a pre-check that must never refuse a legal host: it reads only what the
 * view carries, and anything it cannot read leaves a permanent in.
 *
 * - Equip (CR 702.6a): the ability's own target filter is in `ObjectView.activated`, so it is
 *   matched exactly (type, controller, ...).
 * - An Aura's enchant ability (CR 303.4a) is not in the view, only in its Oracle text, so the
 *   "Enchant creature you control" line is read. A phrase it does not understand ("Enchant Forest",
 *   "Enchant nonbasic land") leaves every permanent in, and the engine's answer settles it.
 * - Shroud and hexproof (CR 702.18a, 702.11b) keep a permanent out, as they do in the engine.
 */
import {
  CARD_TYPES,
  type CardType,
  type ObjectFilter,
  type ObjectId,
  type ObjectView,
  type SeatId,
} from '@commander-arena/engine';
import { isEquip } from '../decisions/ability-label';

/** The filter of an Equipment's equip ability `abilityIndex`, or null when it is not one. */
export function equipFilter(
  card: ObjectView | undefined,
  abilityIndex: number,
): ObjectFilter | null {
  const entry = card?.activated?.find((a) => a.abilityIndex === abilityIndex);
  if (entry === undefined || !isEquip(entry.ability)) return null;
  const what = entry.ability.targets?.[0]?.what;
  return what?.kind === 'object' ? what.filter : { types: ['creature'], controller: 'you' };
}

/** "artifact, creature, or land": the separators between the words of a type list. */
const LIST_SEPARATOR = /\s*,\s*(?:or\s+)?|\s+or\s+/;
const ENCHANT_LINE =
  /^enchant\s+([a-z]+(?:(?:\s*,\s*(?:or\s+)?|\s+or\s+)[a-z]+)*)(\s+you control|\s+an opponent controls)?\s*(?:\.|$)/i;

const TYPE_WORDS: ReadonlySet<string> = new Set([...CARD_TYPES, 'permanent']);

/**
 * The restriction in the first "Enchant ..." sentence of an Aura's Oracle text, as a filter. A line
 * that is missing or not understood gives no restriction (every permanent).
 */
export function enchantFilter(card: ObjectView | undefined): ObjectFilter {
  const line = card?.oracleText.split('\n').find((l) => /^enchant\b/i.test(l.trim()));
  const found = line?.trim().match(ENCHANT_LINE);
  if (found === null || found === undefined) return {};
  const words = (found[1] ?? '').toLowerCase().split(LIST_SEPARATOR);
  if (!words.every((w) => TYPE_WORDS.has(w))) return {};
  const who = found[2] ?? '';
  const controller = /opponent/i.test(who)
    ? 'opponent'
    : /you control/i.test(who)
      ? 'you'
      : undefined;
  const types = words.includes('permanent') ? [] : words.filter(isCardType);
  const base: ObjectFilter = controller === undefined ? {} : { controller };
  if (types.length === 0) return base;
  const [only, ...more] = types;
  if (only !== undefined && more.length === 0) return { ...base, types: [only] };
  return { ...base, anyOf: types.map((t) => ({ types: [t] })) };
}

function isCardType(word: string): word is CardType {
  return (CARD_TYPES as readonly string[]).includes(word);
}

function matches(filter: ObjectFilter, o: ObjectView, viewer: SeatId): boolean {
  if (filter.controller === 'you' && o.controller !== viewer) return false;
  if (filter.controller === 'opponent' && o.controller === viewer) return false;
  if (filter.tapped !== undefined && o.tapped !== filter.tapped) return false;
  if (filter.types?.some((t) => !o.types.includes(t)) === true) return false;
  if (filter.notTypes?.some((t) => o.types.includes(t)) === true) return false;
  if (filter.supertypes?.some((t) => !o.supertypes.includes(t)) === true) return false;
  if (filter.subtypes?.some((t) => !o.subtypes.includes(t)) === true) return false;
  if (filter.colors?.some((c) => !o.colors.includes(c)) === true) return false;
  if (filter.anyOf !== undefined) return filter.anyOf.some((f) => matches(f, o, viewer));
  return true;
}

/** Shroud, and hexproof against the opponent, make a permanent an illegal target. */
function targetable(o: ObjectView, viewer: SeatId): boolean {
  if (o.keywords.includes('shroud')) return false;
  return !(o.keywords.includes('hexproof') && o.controller !== viewer);
}

/**
 * The permanents on the battlefield that `filter` allows and `viewer` may target, in battlefield
 * order. `skip` leaves out the attachment itself and the permanent it already hangs on; a
 * permanent that is itself attached is drawn as a strip, which is no drop zone, so it is left out.
 */
export function hostCandidates(
  battlefield: readonly ObjectView[],
  filter: ObjectFilter,
  viewer: SeatId,
  skip: readonly ObjectId[],
): ObjectView[] {
  return battlefield.filter(
    (o) =>
      !skip.includes(o.id) &&
      o.attachedTo === undefined &&
      targetable(o, viewer) &&
      matches(filter, o, viewer),
  );
}
