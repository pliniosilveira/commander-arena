/**
 * "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors." (Hazel of the Rootbloom): a mana ability whose X and colors the player chooses as it is
 * activated (CR 107.3, 605.3b), which the engine lists as one option that taps every token (`PriorityOption.tappedMany`, with a few combinations) and accepts with any X and mix.
 * The casting flow pays with `payAuto`, which never taps it, so the agent activates it itself, once a turn: in its own main phase, with nothing on the stack, when the mana it makes
 * is what a spell it wants is missing. It taps the fewest tokens that let that spell be paid (tokens that cannot attack yet first, then the weakest), chooses the colors the spell is
 * missing, and pays the life only while its life total stays above `PAY_LIFE_ABOVE`. The mana waits in the pool; the spell is cast at the next priority decision, which lists it. The
 * estimate of what the agent can pay is the one of `heuristic-mana.ts` (read from the view): when it is wrong the spell is simply not on offer afterwards, and the ability, tapped, is
 * not offered again that turn. No randomness.
 */
import type {
  Action,
  GameView,
  ObjectId,
  ObjectView,
  PriorityDecision,
} from '@commander-arena/engine';
import { PAY_LIFE_ABOVE } from './casual-permanents';
import { effectiveCost, findObject, isLand, manaValueOf, ownHand, ownLife } from './casual-view';
import { canPayAll, costSymbols, ownUnits, type Unit } from './heuristic-mana';

const COLOURS = ['W', 'U', 'B', 'R', 'G'] as const;
const ANY: Unit = COLOURS;
const LIFE_COST = /\bpay (\d+) life\b/i;

/** The seat's cards that can be cast from a zone the agent sees: the hand and the command zone (the commander). */
function castable(view: GameView): ObjectView[] {
  const command = view.seats.find((s) => s.id === view.viewer)?.command ?? [];
  return [...ownHand(view), ...command].filter((o) => !isLand(o));
}

/** The colors of `extra` mana that make `cost` payable with `units` plus them, chosen one at a time (the first color that still leaves it payable). */
function coloursFor(
  cost: readonly string[],
  units: readonly Unit[],
  extra: number,
): ('W' | 'U' | 'B' | 'R' | 'G')[] | null {
  const chosen: ('W' | 'U' | 'B' | 'R' | 'G')[] = [];
  for (let i = 0; i < extra; i += 1) {
    const rest: Unit[] = Array.from({ length: extra - i - 1 }, () => ANY);
    const pick = COLOURS.find((c) =>
      canPayAll([cost], [...units, ...chosen.map((x): Unit => [x]), [c], ...rest]),
    );
    if (pick === undefined) return null;
    chosen.push(pick);
  }
  return chosen;
}

/**
 * The activation of a "Tap X untapped tokens" mana ability that the agent should make now, or null. `wanted` says whether a spell is worth casting (the same test as for any cast).
 */
export function chooseTapForMana(
  view: GameView,
  d: PriorityDecision,
  wanted: (spell: ObjectView) => boolean,
): Action | null {
  if (view.activeSeat !== view.viewer || view.stack.length > 0) return null;
  if (view.step !== 'precombatMain' && view.step !== 'postcombatMain') return null;
  const option = d.options.find((o) => o.kind === 'activateAbility' && o.tappedMany !== undefined);
  if (option?.kind !== 'activateAbility' || option.tappedMany === undefined) return null;
  const source = findObject(view, option.source);
  if (source === undefined) return null;
  const life = Number(LIFE_COST.exec(source.oracleText)?.[1] ?? 0);
  if (ownLife(view) - life <= PAY_LIFE_ABOVE) return null;
  const candidates = option.tappedMany;
  const units = ownUnits(view);
  // The spells it wants that the engine does not list now and that the mana of the sources alone cannot pay, the most expensive first.
  const offered = new Set(
    d.options.flatMap((o) => (o.kind === 'castSpell' ? [o.object as ObjectId] : [])),
  );
  const spells = castable(view)
    .filter((s) => !offered.has(s.id) && s.castCost?.includes('X') !== true && wanted(s))
    .sort((a, b) => manaValueOf(b) - manaValueOf(a));
  for (const spell of spells) {
    const cost = costSymbols(spell, effectiveCost(spell));
    if (canPayAll([cost], units)) continue;
    for (let k = 1; k <= candidates.length; k += 1) {
      if (!canPayAll([cost], [...units, ...Array.from({ length: k }, () => ANY)])) continue;
      const colours = coloursFor(cost, units, k);
      if (colours === null) break;
      return {
        kind: 'activateAbility',
        source: option.source,
        abilityIndex: option.abilityIndex,
        color: null,
        combination: colours,
        tappedMany: tokensToTap(view, candidates, k),
      };
    }
  }
  return null;
}

/** `count` of the tokens: those that cannot attack yet first, then the weakest, then the oldest. */
function tokensToTap(view: GameView, candidates: readonly ObjectId[], count: number): ObjectId[] {
  const rank = (id: ObjectId): [number, number] => {
    const o = findObject(view, id);
    return [o?.summoningSick === true ? 0 : 1, o?.power ?? 0];
  };
  return candidates
    .map((id, index) => ({ id, index, key: rank(id) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.index - b.index)
    .slice(0, count)
    .map((c) => c.id);
}
