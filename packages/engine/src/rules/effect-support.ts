/**
 * Helpers of the effect interpreter (`effects.ts`): amounts, drawing, life changes, the move
 * instructions a moving effect queues, and the token definition of a `createToken` effect.
 */
import type { Effect, PtAmount, TokenDefinition } from '../ast/types';
import { TOKEN_PRESETS } from '../cards/tokens';
import type { ObjectId, SeatId } from '../ids';
import { shuffle } from '../rng';
import type { NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getSeat, loseLifeBy, patchSeat, zoneList } from '../state/ops';
import type { ChosenTarget, GameState, Instruction } from '../state/types';
import { amountOf } from './amounts';
import { copiableValues } from './copiable';
import { replacementSources } from './die-replacement';
import { gainLife } from './life-gain';
import { prepareCardOf } from './prepare';
import { resolveObjects, type SelectContext } from './select';
import { done, type StepOutcome } from './step-outcome';
import { moveObject } from './zones';

export { amountOf };

export const PLAYER_ONLY_KINDS: readonly string[] = [
  'you',
  'eachPlayer',
  'eachOpponent',
  'eachOtherOpponent',
  'all',
  'controllerOf',
  'ownerOf',
  'defendingPlayer',
  'triggerPlayer',
  'discardedThisWay',
  'giftRecipient',
  'attackedPlayers',
];

/**
 * The number an amount of power or toughness stands for (D-115): an `Amount` as `amountOf` reads it, or a
 * multiple of one ("-X/-X" is -1 times X). Read as the effect resolves and kept (CR 611.2c, 608.2h).
 */
export function ptAmountOf(
  state: GameState,
  amount: PtAmount,
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
  /** The power and toughness the affected object has now, for `affected` ("double its power", D-145, CR 701.10b). */
  own?: { readonly power: number | null; readonly toughness: number | null },
): number {
  if (typeof amount !== 'number' && amount.kind === 'affected') {
    return (amount.stat === 'power' ? own?.power : own?.toughness) ?? 0;
  }
  if (typeof amount !== 'number' && amount.kind === 'times') {
    return amount.factor * amountOf(state, amount.of, ctx, targets);
  }
  return amountOf(state, amount, ctx, targets);
}

/** CR 701.24 (Shuffle): `seat`'s library is put in a random order from the game's seeded generator. */
export function shuffleLibrary(
  state: GameState,
  seat: SeatId,
): { state: GameState; events: GameEvent[] } {
  const [shuffled, rng] = shuffle(zoneList(state, 'library', seat), state.rng);
  return {
    state: patchSeat({ ...state, rng }, seat, { library: shuffled }),
    events: [{ kind: 'libraryShuffled', seat }],
  };
}

export type DrawResult =
  | { readonly kind: 'done'; readonly state: GameState; readonly events: GameEvent[] }
  | { readonly kind: 'needsDecision'; readonly decision: NewDecision };

/**
 * One card draw (CR 121.1, 121.2: draws are one at a time): the top card of `seat`'s library is put
 * into their hand. Drawing from an empty library is noted for the next state-based action check
 * (CR 121.4, 704.5b).
 *
 * A commander on top of the library would be put into its owner's hand, so its owner may put it into
 * the command zone instead (CR 903.9b). The answer comes from the caller: with `commanderChoice`
 * null the result is `needsDecision` (the `commanderZone` question, `from: 'library'`); the caller
 * asks and draws again with the answer. A draw that was replaced put no card into the hand, so it
 * is not a card drawn (CR 121.1) and no `cardDrawn` event follows; the caller's remaining draws go
 * on (CR 121.6b). D-097.
 */
export function drawCard(
  state: GameState,
  seat: SeatId,
  commanderChoice: boolean | null = null,
): DrawResult {
  const library = getSeat(state, seat).library;
  const top = library[0];
  if (top === undefined) {
    return {
      kind: 'done',
      state: patchSeat(state, seat, { drewFromEmptyLibrary: true }),
      events: [{ kind: 'drewFromEmptyLibrary', seat }],
    };
  }
  const moved = moveObject(state, { object: top, to: 'hand', commanderChoice });
  if (moved.kind === 'needsDecision') return { kind: 'needsDecision', decision: moved.decision };
  const events: GameEvent[] = [...moved.events];
  // CR 903.9b: a commander that went to the command zone instead was not drawn.
  if (moved.newObject !== null && moved.state.objects[moved.newObject]?.zone === 'hand') {
    // D-111: the nth card this turn, for "whenever you draw your second card each turn".
    const nth = getSeat(moved.state, seat).cardsDrawnThisTurn + 1;
    events.push({ kind: 'cardDrawn', seat, object: moved.newObject, nth });
    return {
      kind: 'done',
      state: patchSeat(moved.state, seat, { cardsDrawnThisTurn: nth }),
      events,
    };
  }
  return { kind: 'done', state: moved.state, events };
}

export function loseLifeOf(state: GameState, seat: SeatId, amount: number): StepOutcomeLike {
  const s = getSeat(state, seat);
  if (amount <= 0) return { state, events: [] };
  return {
    state: loseLifeBy(state, seat, amount),
    events: [{ kind: 'lifeChanged', seat, from: s.life, to: s.life - amount }],
  };
}

export function gainLifeOf(state: GameState, seat: SeatId, amount: number): StepOutcomeLike {
  // D-149: replaced and counted by `rules/life-gain.ts`.
  return gainLife(state, seat, amount);
}

export interface StepOutcomeLike {
  state: GameState;
  events: GameEvent[];
}

export function moveInstructions(
  ids: readonly ObjectId[],
  to: 'hand' | 'graveyard' | 'library' | 'battlefield' | 'exile',
  position: 'top' | 'bottom' | number = 'top',
  tapped = false,
  controller?: 'owner' | 'you',
  withCounters?: { readonly counter: string; readonly count: number },
): Instruction[] {
  return ids.map((object) => ({
    kind: 'move' as const,
    object,
    to,
    position,
    tapped,
    commanderChoice: null,
    ...(controller === undefined ? {} : { controller }),
    ...(withCounters === undefined ? {} : { withCounters }),
  }));
}

/**
 * Moves that put creatures into graveyards together (a "destroy" effect): each remembers the permanents that replace a death as
 * the event began, so creatures that die with them are still replaced (D-133, CR 614.12). Nothing is added when no permanent
 * has such a replacement.
 */
export function withReplacers(
  instructions: readonly Instruction[],
  state: GameState,
): Instruction[] {
  const replacers = replacementSources(state);
  if (replacers.length === 0) return [...instructions];
  return instructions.map((i) => (i.kind === 'move' ? { ...i, replacers } : i));
}

/**
 * An effect that moves objects: the move instructions run next, and `lastMoved` starts empty so
 * that the `moved` reference of a later instruction means what this effect produced (CR 400.7j).
 */
export function moving(state: GameState, instructions: readonly Instruction[]): StepOutcome {
  return { ...done(state, [], instructions), lastMoved: [] };
}

/**
 * The characteristics and abilities of the token an effect creates (CR 111.3): a predefined one, one
 * the effect defines, or a copy (CR 707.2, 111.4: "a token that's a copy of target creature" has
 * that creature's copiable values, so its name, and legendary status, are the original's). A copy
 * of a permanent that already left the battlefield is made from its last-known information
 * (CR 608.2h); null when there is nothing to copy.
 */
export function tokenDefinitionOf(
  state: GameState,
  token: Extract<Effect, { kind: 'createToken' }>['token'],
  ctx: SelectContext,
  targets: readonly ChosenTarget[],
): TokenDefinition | null {
  if (token.kind === 'preset') return TOKEN_PRESETS[token.preset];
  if (token.kind === 'custom') return token.definition;
  const id = resolveObjects(state, token.object, ctx, targets)[0];
  const original = id === undefined ? undefined : (state.objects[id] ?? state.lki[id]?.object);
  if (original === undefined) return null;
  const values = copiableValues(state, original);
  // CR 722.2b (D-225): the prepare spell of a preparation card is part of its copiable values.
  const prepareOf = prepareCardOf(state, original);
  return {
    ...values.characteristics,
    // D-230 (CR 707.9b): "except it's a Spirit in addition to its other types and it has ...": part of the copiable values of the token.
    ...(token.addSubtypes === undefined
      ? {}
      : { subtypes: [...new Set([...values.characteristics.subtypes, ...token.addSubtypes])] }),
    abilities: [...values.abilities, ...(token.abilities ?? [])],
    ...(prepareOf === null ? {} : { prepareOf }),
  };
}
