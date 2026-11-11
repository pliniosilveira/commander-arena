/**
 * Mana planning for the HeuristicAgent (M7c, PRIOR_ART 7.2 heuristic 8, D-163): what the agent can
 * spend this turn and whether a set of spells can be paid for, read from the view. The engine lists a
 * spell as castable one at a time (it checks the mana left), so choosing the SET that uses the most
 * mana needs an estimate of the mana as a whole.
 *
 * A mana source is an untapped permanent of the agent with a "{T}: Add ..." ability in its text (a
 * creature must not be summoning sick, CR 302.6); its colours come from the text (a basic land type
 * is read as its mana ability, CR 305.6) and "any color" is read as all five. A source that makes
 * several mana ("{C}{C}") counts as that many units of its colours. The estimate does not know
 * abilities with other costs, filter lands, or mana already in the pool; a spell the estimate wrongly
 * allows is simply not offered by the engine at the next priority decision, and the plan is made again.
 *
 * A spell's cost is a list of mana symbols: a number is generic mana, a colour letter needs that colour,
 * "W/U" and "2/W" are read as needing one of the colours named, "X" as 0, and Phyrexian and snow symbols
 * as 0 and 1. A set is payable when the coloured symbols can be matched to distinct units that make the
 * colour and the generic symbols fit in the rest.
 */
import type { GameView, ObjectView } from '@commander-arena/engine';
import { isLand } from './casual-view';

type Colour = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
const ALL: readonly Colour[] = ['W', 'U', 'B', 'R', 'G'];
const BASIC: Readonly<Record<string, Colour>> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G',
};

/** One unit of mana: the colours it can be. */
export type Unit = readonly Colour[];

const ADD = /\{T\}(?:, [^:]*)?: Add ([^.]*)\./i;
const SYMBOL = /\{([WUBRGC])\}/g;

/** The units of mana an untapped permanent makes with a "{T}: Add" ability; none when it makes none. */
export function unitsOf(o: ObjectView): Unit[] {
  if (o.tapped || (o.summoningSick && o.types.includes('creature'))) return [];
  const match = ADD.exec(o.oracleText);
  if (match !== null) {
    const text = match[1] ?? '';
    if (/any color|any type/i.test(text)) return [ALL];
    const symbols = [...text.matchAll(SYMBOL)].map((m) => m[1] as Colour);
    if (symbols.length === 0) return [];
    // "Add {R} or {G}": one unit that is either; "Add {R}{R}": two units.
    if (/\bor\b/i.test(text)) return [[...new Set(symbols)]];
    return symbols.map((s) => [s]);
  }
  const land = o.subtypes.map((t) => BASIC[t]).filter((c): c is Colour => c !== undefined);
  if (isLand(o) && land.length > 0) return [[...new Set(land)]];
  return [];
}

/** The units the agent can make now, from its untapped permanents. */
export function ownUnits(view: GameView): Unit[] {
  return view.battlefield.filter((o) => o.controller === view.viewer).flatMap(unitsOf);
}

interface Need {
  readonly colours: readonly Colour[];
}

/** The symbols of a cost: the coloured needs and the generic total. */
export function splitCost(cost: readonly string[]): { coloured: Need[]; generic: number } {
  const coloured: Need[] = [];
  let generic = 0;
  for (const raw of cost) {
    const s = raw.replace(/[{}]/g, '');
    if (/^\d+$/.test(s)) generic += Number(s);
    else if (s === 'X') generic += 0;
    else if (/^[WUBRG]$/.test(s)) coloured.push({ colours: [s as Colour] });
    else if (s === 'C') coloured.push({ colours: ['C'] });
    else if (s.includes('/')) {
      const parts = s.split('/').filter((p) => /^[WUBRG]$/.test(p)) as Colour[];
      if (parts.length > 0 && !s.includes('P')) coloured.push({ colours: parts });
      else if (!s.includes('P')) generic += 1;
    } else if (s === 'S') generic += 1;
  }
  return { coloured, generic };
}

/** Whether the costs together can be paid with the units (see the module comment). */
export function canPayAll(costs: readonly (readonly string[])[], units: readonly Unit[]): boolean {
  const needs: Need[] = [];
  let generic = 0;
  for (const c of costs) {
    const split = splitCost(c);
    needs.push(...split.coloured);
    generic += split.generic;
  }
  if (needs.length + generic > units.length) return false;
  const used = new Array<boolean>(units.length).fill(false);
  const assign = (i: number): boolean => {
    const need = needs[i];
    if (need === undefined) return true;
    for (const [u, unit] of units.entries()) {
      if (used[u] === true || !unit.some((c) => need.colours.includes(c))) continue;
      used[u] = true;
      if (assign(i + 1)) return true;
      used[u] = false;
    }
    return false;
  };
  // Needs of one colour first (fewest choices), so the search stays short.
  needs.sort((a, b) => a.colours.length - b.colours.length);
  return assign(0);
}

/** The costs as symbol lists for a play: the view's cost now, or a number for an alternative cost. */
export function costSymbols(o: ObjectView, spend: number): readonly string[] {
  return o.castCost ?? [String(spend)];
}

/** The colours the hand's spells need that no unit of mana can make. */
export function missingColours(
  view: GameView,
  hand: readonly ObjectView[],
  extra: Unit[],
): Colour[] {
  const have = new Set<Colour>([...ownUnits(view), ...extra].flatMap((u) => [...u]));
  const lands = view.battlefield.filter((o) => o.controller === view.viewer && isLand(o));
  for (const l of lands) for (const u of unitsOfAny(l)) for (const c of u) have.add(c);
  const need = new Set<Colour>();
  for (const spell of hand) {
    for (const n of splitCost(spell.castCost ?? spell.manaCost ?? []).coloured) {
      for (const c of n.colours) need.add(c);
    }
  }
  return [...need].filter((c) => !have.has(c));
}

/** Like `unitsOf`, but for a permanent that is tapped too (its colours still count as a source of that colour). */
function unitsOfAny(o: ObjectView): Unit[] {
  return unitsOf({ ...o, tapped: false, summoningSick: false });
}
