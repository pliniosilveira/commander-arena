/**
 * Day and night (CR 731) and Daybound and Nightbound (CR 702.145). The game starts as neither (CR 731.1): `GameState.dayNight` is absent. Once it is day or night it is
 * always one of them. It changes in three ways, all run here:
 *
 *   - As the second part of the untap step (after phasing, before untapping), the previous turn's active player's spells decide: day and none cast, it becomes night; night
 *     and two or more cast, it becomes day (CR 502.2, 731.2). Neither: nothing happens (CR 731.2c). `GameState.lastTurnSpellsCast` and `lastTurnActiveSeat` hold the count.
 *   - A permanent with daybound makes it day when it is neither (CR 702.145d); one with nightbound makes it night when it is neither and no permanent has daybound (CR 702.145g).
 *     The engine reads "any time" as a check made with the state-based actions (CR 704.3), as Ascend (`rules/city-blessing.ts`): `settleDayNight`. It is not a state-based action in
 *     the CR (CR 702.145c, 702.145f), and it does not use the stack.
 *   - Other effects can make it day or night (CR 731.1): none is built.
 *
 * Daybound and nightbound permanents transform when it changes (CR 702.145b, 702.145c, 702.145e, 702.145f), a daybound permanent enters transformed at night (CR 702.145b,
 * 712.14a; `entersTransformed`, read by `rules/zones.ts`), and neither can transform for any other reason (CR 702.145b, 702.145e; `rules/transform.ts`). KNOWN LIMIT (docs/ROADMAP.md):
 * inside one resolution, between two steps of the same effect, the check has not run yet.
 */

import type { CardDefinition } from '../cards/definition';
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, definitionOf, patchObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';
import { derive } from './derive';
import { abilitiesHaveKeyword } from './keywords';
import { transformedFace } from './layouts';

type DayNight = 'day' | 'night';
type Outcome = { readonly state: GameState; readonly events: GameEvent[] };

/** Whether the front face of the card printed `daybound` (CR 702.145b): what a card entering the battlefield reads, before it is a permanent. */
function frontHasDaybound(def: CardDefinition): boolean {
  return (
    def.faces[0]?.abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === 'daybound') ===
    true
  );
}

/**
 * CR 702.145b ("If it is night and this permanent is represented by a double-faced card, it enters transformed"; CR 712.14a): whether a card that enters the battlefield with its front
 * face up enters with its back face up instead. Never for a token, a card that is not double-faced, or a permanent that enters face down.
 */
export function entersTransformed(state: GameState, def: CardDefinition): boolean {
  return state.dayNight === 'night' && frontHasDaybound(def) && transformedFace(def, 0) === 1;
}

/** Whether the permanent is represented by a double-faced card that can transform (CR 712.9): a token, a copy and a single-faced card are not. */
function isTransformingCard(state: GameState, obj: GameObject): boolean {
  return obj.card !== null && transformedFace(definitionOf(state, obj.card), obj.face) !== null;
}

/** Whether the permanent has daybound or nightbound now (read through `derive`, so a lost ability counts), which is what keeps it from transforming otherwise (CR 702.145b, 702.145e). */
export function hasDayNightKeyword(state: GameState, obj: GameObject): boolean {
  if (obj.zone !== 'battlefield') return false;
  const abilities = derive(state, obj).abilities;
  return (
    abilitiesHaveKeyword(abilities, 'daybound') || abilitiesHaveKeyword(abilities, 'nightbound')
  );
}

/** The game becomes `to` (CR 731.1): the state and the event, or null when it already is. */
export function becomeDayNight(state: GameState, to: DayNight): Outcome | null {
  if (state.dayNight === to) return null;
  return {
    state: { ...state, dayNight: to },
    events: [{ kind: 'dayNightChanged', from: state.dayNight ?? null, to }],
  };
}

/** CR 502.2, 731.2: the check of the untap step, made on the spells the previous turn's active player cast. Null when the designation stays. */
export function untapStepDayNight(state: GameState): Outcome | null {
  if (state.dayNight === undefined) return null; // CR 731.2c
  const previous: SeatId | undefined = state.lastTurnActiveSeat;
  const cast = previous === undefined ? undefined : state.lastTurnSpellsCast?.[previous];
  if (cast === undefined) return null;
  if (state.dayNight === 'day' && cast === 0) return becomeDayNight(state, 'night');
  if (state.dayNight === 'night' && cast >= 2) return becomeDayNight(state, 'day');
  return null;
}

/**
 * CR 702.145c, 702.145d, 702.145f, 702.145g: makes it day or night when a permanent asks for it, then transforms every front-face-up daybound permanent at night and every
 * back-face-up nightbound permanent at day, all at once. Returns null when nothing changes, so the state-based action loop that calls it settles.
 */
export function settleDayNight(input: GameState): Outcome | null {
  let state = input;
  const events: GameEvent[] = [];
  const permanents = state.battlefield
    .map((id) => state.objects[id])
    .filter((o) => o !== undefined);
  if (state.dayNight === undefined) {
    const abilities = permanents.map((o) => derive(state, o).abilities);
    const toDay = abilities.some((a) => abilitiesHaveKeyword(a, 'daybound'));
    const toNight = !toDay && abilities.some((a) => abilitiesHaveKeyword(a, 'nightbound'));
    const became = toDay
      ? becomeDayNight(state, 'day')
      : toNight
        ? becomeDayNight(state, 'night')
        : null;
    if (became !== null) {
      state = became.state;
      events.push(...became.events);
    }
  }
  const designation = state.dayNight;
  if (designation !== undefined) {
    for (const obj of permanents) {
      const wanted = designation === 'night' ? 'daybound' : 'nightbound';
      const faceUp = designation === 'night' ? 0 : 1;
      if (obj.face !== faceUp || !isTransformingCard(state, obj)) continue;
      if (!abilitiesHaveKeyword(derive(state, obj).abilities, wanted)) continue;
      const card = obj.card;
      if (card === null) continue;
      const face = transformedFace(definitionOf(state, card), obj.face);
      if (face === null) continue;
      const [stamp, stamped] = allocateTimestamp(state);
      state = patchObject(stamped, obj.id, { face, transformedAt: stamp });
    }
  }
  return state === input ? null : { state, events };
}
