/**
 * choosePayOptions (CR 601.2f-h, 702.51a Convoke, 702.126a Improvise, 702.66a Delve, D-120): while a spell is
 * being cast, the player may tap creatures or artifacts, or exile cards from their graveyard, instead of paying
 * some of its mana. The engine says which candidates there are, how many can be used at most, a `suggested`
 * set and the `choices` it lists as legal answers (each leaves a cost the rest of the mana can pay). Pure
 * functions, unit tested without a DOM.
 *
 * The line "These pay {2}{G}; you still pay {1} with mana" is worked out here from the cost and the colors of
 * the picks, colors first, as the engine settles the payment; it is a reading aid, the engine decides.
 */
import type { ChoosePayOptionsDecision, ObjectId } from '@commander-arena/engine';
import { type Index, nameOf, plural } from './lookup';

type Decision = Pick<
  ChoosePayOptionsDecision,
  'mechanism' | 'cost' | 'candidates' | 'colors' | 'maxUsable' | 'suggested' | 'choices'
>;

export const MECHANISM_NAMES = {
  convoke: 'Convoke',
  improvise: 'Improvise',
  delve: 'Delve',
} as const;

/** What the picks are called: "creatures", "artifacts", "cards". */
const THINGS = { convoke: 'creature', improvise: 'artifact', delve: 'card' } as const;

/** What a pick does to it: "tap" or "exile". */
const VERBS = { convoke: 'Tap', improvise: 'Tap', delve: 'Exile' } as const;

const symbolsText = (symbols: readonly string[]): string => symbols.map((s) => `{${s}}`).join('');

/** The title of the dialog: "Convoke: tap creatures to pay for SYNTHETIC X ({3}{G}{G})". */
export function payOptionsPrompt(
  d: Pick<ChoosePayOptionsDecision, 'mechanism' | 'source' | 'cost'>,
  index: Index,
): string {
  const what =
    d.mechanism === 'delve' ? 'exile cards from your graveyard' : `tap ${THINGS[d.mechanism]}s`;
  return `${MECHANISM_NAMES[d.mechanism]}: ${what} to pay for ${nameOf(index, d.source)} (${symbolsText(d.cost)})`;
}

/** True when both lists hold the same objects, in any order. */
export function sameSet(a: readonly ObjectId[], b: readonly ObjectId[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * A click on a candidate: it is picked or taken back. At most `maxUsable` can be used, since each pays for a
 * different mana: with room for one a click on another swaps, with room for several a click beyond it is ignored.
 * What is not a candidate is never picked.
 */
export function togglePick(
  picked: readonly ObjectId[],
  d: Pick<Decision, 'candidates' | 'maxUsable'>,
  id: ObjectId,
): readonly ObjectId[] {
  if (!d.candidates.includes(id)) return picked;
  if (picked.includes(id)) return picked.filter((p) => p !== id);
  if (d.maxUsable <= 1) return d.maxUsable === 1 ? [id] : picked;
  return picked.length >= d.maxUsable ? picked : [...picked, id];
}

/** The picks in the order the candidates are listed in, which is how the engine lists `choices`. */
export function candidatesInOrder(
  d: Pick<Decision, 'candidates'>,
  picked: readonly ObjectId[],
): ObjectId[] {
  return d.candidates.filter((id) => picked.includes(id));
}

/**
 * True when the engine accepts the picks for sure: one of the `choices` it listed, each of which leaves a cost
 * the mana of the other sources can pay. Cards of a graveyard pay generic mana alike, so any set of the size
 * of a listed one is as good as it (the listing keeps to the sets near the suggested one). Anything else
 * is not offered: the engine would refuse an answer that leaves a cost nothing can pay.
 */
export function isLegalPick(d: Decision, picked: readonly ObjectId[]): boolean {
  if (picked.some((id) => !d.candidates.includes(id))) return false;
  if (d.choices.some((c) => sameSet(c, picked))) return true;
  return (
    d.mechanism === 'delve' &&
    picked.length <= d.maxUsable &&
    d.choices.some((c) => c.length === picked.length)
  );
}

/** What the picks pay and the mana left of the cost. */
interface Settled {
  readonly paid: readonly string[];
  readonly left: readonly string[];
}

const LETTERS = ['W', 'U', 'B', 'R', 'G'];

/** The colors a mana symbol can be paid with by a colored creature; empty for generic and other symbols. */
function colorsOfSymbol(symbol: string): readonly string[] {
  const hybrid = /^([WUBRG])\/([WUBRG])$/.exec(symbol);
  if (hybrid !== null) return [hybrid[1] ?? '', hybrid[2] ?? ''];
  const half = /^(?:2|C)\/([WUBRG])$/.exec(symbol);
  if (half !== null) return [half[1] ?? ''];
  const phyrexian = /^([WUBRG])\/P$/.exec(symbol);
  if (phyrexian !== null) return [phyrexian[1] ?? ''];
  return LETTERS.includes(symbol) ? [symbol] : [];
}

/**
 * What the picks pay and what is left: each pick pays one generic mana or, for a creature, one colored mana
 * of one of its colors, and the way that covers the most colored mana is read (the engine's own choice).
 * `items` are the colors of each pick (none for artifacts and cards, which pay generic mana only).
 */
export function settle(
  cost: readonly string[],
  items: readonly (readonly string[])[],
): Settled | null {
  let generic = 0;
  const colored: string[] = [];
  const fixed: string[] = [];
  for (const symbol of cost) {
    if (/^[0-9]+$/.test(symbol)) generic += Number(symbol);
    else if (colorsOfSymbol(symbol).length > 0) colored.push(symbol);
    else fixed.push(symbol);
  }
  const found: { best: Settled | null } = { best: null };
  const better = (left: readonly string[], than: readonly string[]): boolean => {
    const count = (l: readonly string[]) => l.filter((s) => !/^[0-9]+$/.test(s)).length;
    const a = count(left);
    const b = count(than);
    return a !== b ? a < b : left.join(' ') < than.join(' ');
  };
  const walk = (i: number, gen: number, used: readonly number[], paidColored: string[]): void => {
    const colors = items[i];
    if (colors === undefined) {
      const left = [
        ...(gen > 0 ? [String(gen)] : []),
        ...colored.filter((_, k) => !used.includes(k)),
        ...fixed,
      ];
      if (found.best === null || better(left, found.best.left)) {
        found.best = {
          left,
          paid: [...(generic - gen > 0 ? [String(generic - gen)] : []), ...paidColored],
        };
      }
      return;
    }
    if (gen > 0) walk(i + 1, gen - 1, used, paidColored);
    colored.forEach((symbol, k) => {
      if (used.includes(k)) return;
      if (colorsOfSymbol(symbol).some((c) => colors.includes(c))) {
        walk(i + 1, gen, [...used, k], [...paidColored, symbol]);
      }
    });
  };
  walk(0, generic, [], []);
  return found.best;
}

/** The colors of the picks, in order, for the matching above. */
function colorsOfPicks(d: Pick<Decision, 'colors'>, picked: readonly ObjectId[]): string[][] {
  return picked.map((id) => [...(d.colors?.[id] ?? [])]);
}

/**
 * The live line under the cards: "These pay {2}{G}; you still pay {1} with mana." Says so when nothing is
 * picked, when everything is paid by the picks, and when they cannot each pay for a different mana.
 */
export function payLine(d: Decision, picked: readonly ObjectId[]): string {
  if (picked.length === 0) return `Nothing chosen: you pay ${symbolsText(d.cost)} with mana.`;
  const settled = settle(d.cost, colorsOfPicks(d, picked));
  if (settled === null) return 'These cannot each pay for a different mana of the cost.';
  const paid = symbolsText(settled.paid);
  return settled.left.length === 0
    ? `These pay ${paid}; nothing is left to pay with mana.`
    : `These pay ${paid}; you still pay ${symbolsText(settled.left)} with mana.`;
}

/** "Tap 2 creatures", "Exile 3 cards", "Pay all in mana" for the button that confirms the picks. */
export function confirmText(d: Pick<Decision, 'mechanism'>, picked: readonly ObjectId[]): string {
  if (picked.length === 0) return 'Pay all in mana';
  const thing = THINGS[d.mechanism];
  return `${VERBS[d.mechanism]} ${plural(picked.length, thing)}`;
}

/** The second line of the bar: how many are picked of how many can be used. */
export function payDetail(d: Decision, picked: readonly ObjectId[]): string {
  const thing = THINGS[d.mechanism];
  return `${picked.length} of up to ${d.maxUsable} ${thing}${d.maxUsable === 1 ? '' : 's'} chosen.`;
}

/** Why Confirm is disabled, or null when it is not. */
export function payHint(d: Decision, picked: readonly ObjectId[]): string | null {
  if (isLegalPick(d, picked)) return null;
  if (picked.length > d.maxUsable) return `Use at most ${d.maxUsable}`;
  return 'That leaves a cost you could not pay: pick the suggested ones or fewer';
}

/** The colors a convoke candidate pays: "G", "W, B" or "colorless". Empty for artifacts and cards. */
export function candidateColors(d: Pick<Decision, 'mechanism' | 'colors'>, id: ObjectId): string {
  if (d.mechanism !== 'convoke') return '';
  const colors = d.colors?.[id] ?? [];
  return colors.length === 0 ? 'colorless' : colors.join(', ');
}
