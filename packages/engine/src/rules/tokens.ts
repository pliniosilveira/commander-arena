/**
 * Creating tokens (CR 111). A token is a permanent that is not represented by a card (CR 111.1);
 * the player who creates it owns it and it enters under their control (CR 111.2). It has its own
 * object id, characteristics and abilities (`GameObject.token`). It ceases to exist when it is in a
 * zone other than the battlefield (CR 111.7), a state-based action (CR 704.5d, sba.ts) that runs
 * after the triggers of its zone change (so a token that dies still triggers "dies" abilities).
 */
import type { TokenDefinition } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { addToZone, allocateObjectId, allocateTimestamp, setObject } from '../state/ops';
import type { ChosenValues, GameObject, GameState } from '../state/types';
import { quietFlow } from './damage-order';
import { entersAsSaga, entersTapped, entersWithCounters } from './enters';
import { addCounterMaps, groupEntryCounters } from './enters-group';
import { becomePrepared } from './prepare';
import { countMatching } from './select';
import { settleTokens, type TokenBatch } from './token-replacement';

export { hypotheticalToken } from './token-object';

/**
 * Creates `count` tokens with `definition` under `seat`'s control, one after the other, with the replacement effects of their creation applied in the
 * default order (D-219, D-221: `settleTokens` with a flow that does not ask). It is for the creations that cannot wait for an answer (a token made by a
 * "would die" replacement, Empower); the effects that create tokens settle them with the player's answers first (`rules/effects.ts`) and then make them with
 * `makeTokenParts`. `chosen` is what its controller chose as it enters when the definition asks "As this enters, choose ..." (CR 614.12a, D-100).
 */
export function createTokens(
  input: GameState,
  seat: SeatId,
  definition: TokenDefinition,
  count: number,
  chosen?: ChosenValues,
  /** The tokens enter tapped ("create two tapped Treasure tokens", D-131). */
  enterTapped = false,
  entry?: { readonly counters: Readonly<Record<string, number>>; readonly haste: boolean },
): { state: GameState; events: GameEvent[] } {
  // D-219 (CR 614.1a, 616.1): "If one or more artifact tokens would be created under your control, ... are created instead".
  const settled = settleTokens(
    input,
    seat,
    null,
    [{ definition, count, original: true }],
    quietFlow(),
  );
  if (settled.kind === 'asked') throw new Error('A flow that does not ask asked');
  return makeTokenParts(input, seat, settled.parts, chosen, enterTapped, entry);
}

/**
 * Makes the tokens of a settled batch. The original tokens enter as the instruction said (tapped, with the choice and the entry of devour and riot);
 * the tokens a replacement effect made enter as their own definition says: untapped, with no choice and none of the original's entry (D-219, CR 614.1).
 */
export function makeTokenParts(
  input: GameState,
  seat: SeatId,
  parts: readonly TokenBatch[],
  chosen?: ChosenValues,
  enterTapped = false,
  entry?: { readonly counters: Readonly<Record<string, number>>; readonly haste: boolean },
): { state: GameState; events: GameEvent[] } {
  let state = input;
  const events: GameEvent[] = [];
  for (const part of parts) {
    const r = part.original
      ? makeTokens(state, seat, part.definition, part.count, chosen, enterTapped, entry)
      : makeTokens(state, seat, part.definition, part.count);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** The tokens themselves, once nothing replaces their creation. */
export function makeTokens(
  input: GameState,
  seat: SeatId,
  definition: TokenDefinition,
  count: number,
  chosen?: ChosenValues,
  enterTapped = false,
  /**
   * What devour and riot gave the token as it entered (CR 702.82a, 702.136a, D-185): counters it enters with, and whether an instance of riot
   * chose haste. Only for one token, made after the question was answered (`rules/enter-token.ts`).
   */
  entry?: { readonly counters: Readonly<Record<string, number>>; readonly haste: boolean },
): { state: GameState; events: GameEvent[] } {
  let state = input;
  const events: GameEvent[] = [];
  const { abilities, prepareOf, ...characteristics } = definition;
  for (let i = 0; i < count; i += 1) {
    const [id, s1] = allocateObjectId(state);
    const [timestamp, s2] = allocateTimestamp(s1);
    // CR 614.1c, 614.12: "enters tapped" and "enters with counters" apply as the token enters,
    // looking at the battlefield without it (the token is not on it yet).
    const tapped = enterTapped || entersTapped(state, abilities, { controller: seat, source: id });
    // CR 714.3a: a token that is a Saga (a copy of one) enters with a lore counter too.
    const own = entersAsSaga(
      characteristics.subtypes,
      entersWithCounters(abilities, {}, 0, false, (a) =>
        countMatching(state, a.filter, { controller: seat, source: id }),
      ),
      abilities,
      chosen ?? null,
    );
    // CR 306.5b, 310.4b (D-200): a planeswalker token enters with loyalty counters equal to its loyalty, a battle token with defense
    // counters (the intrinsic replacement effects of every planeswalker and battle, not only of cards).
    const intrinsic: Record<string, number> = { ...own };
    if (
      characteristics.types.includes('planeswalker') &&
      characteristics.loyalty !== null &&
      characteristics.loyalty > 0
    ) {
      intrinsic.loyalty = (intrinsic.loyalty ?? 0) + characteristics.loyalty;
    }
    if (
      characteristics.types.includes('battle') &&
      characteristics.defense !== null &&
      characteristics.defense > 0
    ) {
      intrinsic.defense = (intrinsic.defense ?? 0) + characteristics.defense;
    }
    const token: GameObject = {
      id,
      card: null,
      zone: 'battlefield',
      zoneOwner: null,
      owner: seat,
      controller: seat,
      face: 0,
      tapped,
      counters: intrinsic,
      damage: 0,
      damagedByDeathtouch: false,
      timestamp,
      token: { characteristics, abilities, ...(prepareOf === undefined ? {} : { prepareOf }) },
      attachedTo: null,
      protector: null,
      stack: null,
      ...(chosen === undefined ? {} : { chosen }),
      ...(entry?.haste === true ? { riotHaste: true as const } : {}),
    };
    // CR 614.1c, 122.6 (D-149): "each other Angel you control enters with an additional +1/+1 counter", read as the token enters.
    const counters = addCounterMaps(
      addCounterMaps(intrinsic, entry?.counters ?? {}),
      groupEntryCounters(state, token),
    );
    state = addToZone(setObject(s2, { ...token, counters }), 'battlefield', null, id);
    // D-151: a permanent that entered this turn (Celebration), as it entered.
    state = {
      ...state,
      turnLog: {
        ...state.turnLog,
        entered: [
          ...state.turnLog.entered,
          { object: id, controller: seat, types: characteristics.types, token: true },
        ],
      },
    };
    events.push({ kind: 'tokenCreated', seat, object: id, name: definition.name });
    // CR 722.3a, 722.3c (D-225): a token copy of a preparation card has the copied "This creature enters prepared." and the prepare spell: it enters prepared.
    if (
      prepareOf !== undefined &&
      abilities.some((a) => a.kind === 'replacement' && a.replacement.kind === 'entersPrepared')
    ) {
      const prepared = becomePrepared(state, id);
      state = prepared.state;
      events.push(...prepared.events);
    }
    for (const [counter, n] of Object.entries(counters)) {
      events.push({ kind: 'counterAdded', object: id, counter, count: n, by: seat });
    }
  }
  return { state, events };
}
