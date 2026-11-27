/**
 * Keywords with a cost made from the card's own mana cost, which a permanent gives to the cards of its controller's hand or graveyard (the static ability
 * `grantKeywordFromManaCost`, CR 604.3, 613.1f):
 *
 *   miracle  "Each enchantment card in your hand has miracle. Its miracle cost is equal to its mana cost reduced by {4}." (CR 702.94a). The grant is read as the card is drawn (the
 *            reveal is offered for a card that has miracle then), and noted on the card as it is revealed (`GameObject.miracleGrant`): the triggered ability linked to the reveal
 *            (CR 603.11) exists independently of what gave it (CR 113.7a) and says the cost, so the card is cast for it even when the permanent has left the battlefield before the
 *            ability resolves. The cost is the mana cost with its generic mana reduced (CR 118.7a: never the coloured mana, never below nothing), after the X of it is announced (CR
 *            107.3a).
 *   escape   "Each enchantment card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard." (CR 702.138a).
 *            The grant is read while the card is in the graveyard, and kept on the spell as it is cast (`StackData.escapeGrant`, as for an escape an effect gave). Either half of a
 *            split card is cast for its own mana cost (CR 709.3).
 *
 * A card with no mana cost gets a cost that cannot be paid (CR 118.6): it is not offered. A card that prints the keyword is cast for its printed cost (`rules/miracle.ts`,
 * `rules/escape-grant.ts`).
 */
import type { AlternativeCost, Cost } from '../ast/types';
import type { CardFace } from '../cards/definition';
import type { SeatId } from '../ids';
import { definitionOf } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { controllerOf } from './control';
import { type ManaCostKeywordGrantSource, manaCostKeywordGrantSources } from './derive-statics';
import { matchesFilter } from './select';
import { staticConditionHolds } from './static-conditions';

type Escape = Extract<AlternativeCost, { kind: 'escape' }>;
type Grant = ManaCostKeywordGrantSource['grant'];

/** The grants of `kind` that the permanents `seat` controls give `card`, a card in the zone `zone` of `seat`, in battlefield order. */
function grantsFor<K extends Grant['kind']>(
  state: GameState,
  seat: SeatId,
  card: GameObject,
  kind: K,
  zone: 'hand' | 'graveyard',
): Extract<Grant, { kind: K }>[] {
  const out: Extract<Grant, { kind: K }>[] = [];
  if (card.card === null || card.zone !== zone || card.owner !== seat) return out;
  for (const source of manaCostKeywordGrantSources(state)) {
    const grant = source.grant;
    if (grant.kind !== kind) continue;
    if (controllerOf(state, source.object) !== seat) continue;
    if (
      source.condition !== undefined &&
      !staticConditionHolds(state, source.condition, source.object)
    ) {
      continue;
    }
    if (
      matchesFilter(
        state,
        card,
        { ...source.what, zone },
        { controller: seat, source: source.object.id },
      )
    ) {
      out.push(grant as Extract<Grant, { kind: K }>);
    }
  }
  return out;
}

/** The mana cost of the face, or null when it has none (CR 118.6, 202.1b: a cost based on the mana cost of an object with none cannot be paid). */
function manaCostOf(face: CardFace | null): readonly string[] | null {
  const symbols = face?.manaCost;
  return symbols === undefined || symbols === null || symbols.length === 0 ? null : symbols;
}

/**
 * The miracle a permanent gives `card`, a card in its owner's hand (CR 702.94a): the generic mana its miracle cost is reduced by (the largest, when several permanents give one: each
 * is a miracle ability of the card and its owner reveals it for the one they choose), or null. The card has the ability whether or not the cost can be paid.
 */
export function grantedMiracleOf(state: GameState, card: GameObject): { reduce: number } | null {
  const grants = grantsFor(state, card.owner, card, 'miracle', 'hand');
  if (grants.length === 0) return null;
  return { reduce: Math.max(...grants.map((g) => g.reduce)) };
}

/**
 * The miracle cost a permanent gave, as mana symbols (CR 702.94a, 118.7a): the mana cost of `face` with the generic mana reduced by `reduce`. `symbols` is that mana cost as it is
 * read (with its {X} as announced, CR 107.3a, when the cost is paid; as printed when it is only shown: the reduction then takes from the generic mana that is not {X}, and from the X
 * announced once it is). Null for a face with no mana cost (CR 118.6).
 */
export function grantedMiracleCost(
  face: CardFace | null,
  reduce: number,
  reduceGeneric: (symbols: readonly string[], by: number) => string[],
  read: (symbols: readonly string[]) => readonly string[] = (symbols) => symbols,
): readonly Cost[] | null {
  const symbols = manaCostOf(face);
  return symbols === null
    ? null
    : [{ kind: 'mana', symbols: reduceGeneric(read(symbols), reduce) }];
}

/**
 * The escape a permanent gives `obj` (CR 702.138a): `obj` is a card in its owner's graveyard, or that card as the spell it would be (`castAs`: the same id, the face chosen). The
 * cost is the mana cost of the face cast; the first permanent in battlefield order that gives one decides how many other cards are exiled. Null for a card none names, for a face
 * with no mana cost (CR 118.6), and for a face other than the front one of a card that is not a split card (CR 709.3: either half of a split card is cast).
 */
export function staticEscapeOf(state: GameState, obj: GameObject): Escape | null {
  const card = state.objects[obj.id];
  if (card === undefined || card.card === null || card.zone !== 'graveyard') return null;
  const def = definitionOf(state, card.card);
  const faceIndex = obj.zone === 'stack' ? obj.face : 0;
  if (faceIndex !== 0 && def.layout !== 'split') return null;
  const symbols = manaCostOf(def.faces[faceIndex] ?? null);
  if (symbols === null) return null;
  const [grant] = grantsFor(state, card.owner, card, 'escape', 'graveyard');
  if (grant === undefined) return null;
  return { kind: 'escape', cost: [{ kind: 'mana', symbols }], exile: grant.exile };
}
