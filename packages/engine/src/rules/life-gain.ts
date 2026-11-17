/**
 * Gaining life (CR 119.3, 119.9, 119.10; D-149): every gain of life goes through `gainLife`, the effect `gainLife` and the lifelink
 * damage alike, so that
 * - a replacement effect of a permanent on the battlefield, "If you would gain life, you gain that much life plus 1 instead"
 *   (`lifeGainBonus`), changes the amount first: each such effect of a permanent its player controls applies once, and as they all
 *   add, the order they are applied in (CR 616.1) does not matter. A gain of 0 life is no event and nothing replaces it
 *   (CR 119.10);
 * - a player an effect says can't gain life ("Your opponents can't gain life", `cantGainLife`, CR 119.7, D-363) gains none: no change to the life
 *   total, no event, no entry in the turn log, and no replacement effect does anything;
 * - the gain is one `lifeGained` event after the `lifeChanged`, with its number among the player's gains of the turn, which the
 *   "gain life" trigger reads (CR 119.9: a gain of 0 life is no event, so nothing triggers).
 */
import type { Replacement } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { ReplacementQuestion } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getSeat, patchSeat } from '../state/ops';
import type { GameState } from '../state/types';
import { controllerOf } from './control';
import type { OrderFlow } from './damage-order';
import { derive } from './derive';
import { lifeTotalIsLocked } from './player-lock';
import { cannotGainLife } from './player-protection';
import { sourceInfo } from './source-info';

type LifeGainReplacement = Extract<Replacement, { kind: 'lifeGainBonus' | 'lifeGainDouble' }>;

interface Candidate {
  readonly key: string;
  readonly object: ObjectId;
  readonly effect: LifeGainReplacement;
}

export type LifeGainResult =
  | { readonly kind: 'gained'; readonly state: GameState; readonly events: GameEvent[] }
  | {
      readonly kind: 'asked';
      readonly decision: Omit<
        import('../state/decisions').ChooseOptionDecision,
        'id' | 'replacement'
      > & {
        readonly replacement: ReplacementQuestion;
      };
    };

function replacementsFor(state: GameState, seat: SeatId): Candidate[] {
  const candidates: Candidate[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    if (obj === undefined || controllerOf(state, obj) !== seat) continue;
    derive(state, obj).abilities.forEach((ability, index) => {
      if (
        ability.kind === 'replacement' &&
        (ability.replacement.kind === 'lifeGainBonus' ||
          ability.replacement.kind === 'lifeGainDouble')
      ) {
        candidates.push({
          key: `lifeGain:${id}:${index}`,
          object: id,
          effect: ability.replacement,
        });
      }
    });
  }
  return candidates;
}

function applyReplacement(amount: number, effect: LifeGainReplacement): number {
  return effect.kind === 'lifeGainBonus' ? amount + effect.amount : amount * 2;
}

function effectText(effect: LifeGainReplacement): string {
  return effect.kind === 'lifeGainBonus'
    ? `Gain ${effect.amount} more life`
    : 'Gain twice that much life';
}

/** The extra life that the replacement effects of the battlefield add to a gain by `seat` (CR 614.1a). */
/** `seat` gains `amount` life as the rules count it: replaced, recorded for the turn and told by events. */
export function gainLife(
  state: GameState,
  seat: SeatId,
  amount: number,
  flow: OrderFlow,
  source: ObjectId,
): LifeGainResult {
  if (amount <= 0) return { kind: 'gained', state, events: [] };
  if (lifeTotalIsLocked(state, seat)) return { kind: 'gained', state, events: [] };
  // CR 119.7: a replacement effect that would replace a life gain event of that player won't do anything either, so nothing below runs.
  if (cannotGainLife(state, seat)) return { kind: 'gained', state, events: [] };
  const replacements = replacementsFor(state, seat);
  let gained = amount;
  let remaining = replacements;
  let free = false;
  while (remaining.length > 0) {
    const kinds = new Set(remaining.map(({ effect }) => effect.kind));
    const orderMatters = !free && kinds.size > 1;
    let selected = remaining[0] as Candidate;
    if (orderMatters && flow.ask) {
      const choices = remaining.map((candidate) => {
        let outcome = applyReplacement(gained, candidate.effect);
        for (const next of remaining) {
          if (next.key !== candidate.key) outcome = applyReplacement(outcome, next.effect);
        }
        return {
          option: candidate.key,
          kind: 'lifeGain' as const,
          text: effectText(candidate.effect),
          object: candidate.object,
          objectName: sourceInfo(state, candidate.object)?.name ?? '',
          outcome: { amount: outcome },
        };
      });
      const answer = flow.answers[flow.used];
      if (answer === undefined) {
        const info = sourceInfo(state, source);
        return {
          kind: 'asked',
          decision: {
            kind: 'chooseOption',
            seat,
            purpose: 'replacement',
            options: remaining.map(({ key }) => key),
            source,
            sourceName: info?.name ?? '',
            sourceOracleText: info?.oracleText ?? '',
            replacement: { lifeGain: { seat, amount: gained }, choices },
          },
        };
      }
      flow.used += 1;
      selected = remaining.find(({ key }) => key === answer) ?? selected;
    } else if (orderMatters && !flow.ask) {
      free = true;
    }
    gained = applyReplacement(gained, selected.effect);
    remaining = remaining.filter(({ key }) => key !== selected.key);
  }
  const s = getSeat(state, seat);
  const next = patchSeat(state, seat, { life: s.life + gained });
  const nth = state.turnLog.lifeGained.filter((who) => who === seat).length + 1;
  // D-252: the total gained this turn, by seat ("if you gained 3 or more life this turn", CR 119.3).
  const totals = [...next.turnLog.lifeGainedTotal];
  for (let i = totals.length; i < state.seats.length; i += 1) totals[i] = 0;
  totals[seat] = (totals[seat] ?? 0) + gained;
  return {
    kind: 'gained',
    state: {
      ...next,
      turnLog: {
        ...next.turnLog,
        lifeGained: [...next.turnLog.lifeGained, seat],
        lifeGainedTotal: totals,
      },
    },
    events: [
      { kind: 'lifeChanged', seat, from: s.life, to: s.life + gained },
      { kind: 'lifeGained', seat, amount: gained, nth },
    ],
  };
}
