/**
 * An Aura put onto the battlefield other than by resolving as an Aura spell (CR 303.4f, 303.4g, D-149): "Return target permanent card from
 * your graveyard to the battlefield" and the return of a card exiled "until this leaves the battlefield" name no object for the Aura to
 * enchant, so the player it enters under chooses one as it enters, among the permanents its enchant ability allows (CR 702.5a). With no legal
 * object it stays where it is (CR 303.4g); with one the engine chooses (and says so); otherwise a `choosePermanent` decision of purpose
 * `auraHost` asks. The Aura then enters attached to it (`MoveRequest` through the `move` instruction's `attachTo`). The enchant ability
 * is read from the card (`auraTargetSpec`): an Aura enchants permanents, and hexproof or shroud do not matter, since nothing targets (CR 303.4c).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { definitionOf, printedCard } from '../state/ops';
import type { GameObject, GameState, Instruction, ResolutionContext } from '../state/types';
import { auraTargetSpec } from './attach';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';

type AuraEntryInstruction = Extract<Instruction, { kind: 'auraEntry' }>;

/** The enchant filter of the Aura card `obj` (in any zone but the battlefield), or null when it is not an Aura. */
function enchantFilterOfCard(
  state: GameState,
  obj: GameObject,
): { readonly filter: NonNullable<ReturnType<typeof auraTargetSpec>>['what'] } | null {
  const card = printedCard(obj);
  if (card === null || obj.token !== null) return null;
  const spec = auraTargetSpec(definitionOf(state, card).faces[0] ?? null);
  return spec === null ? null : { filter: spec.what };
}

/** Whether the card is an Aura that would have to choose what it enchants as it enters the battlefield (CR 303.4f). */
export function isAuraEntering(state: GameState, id: ObjectId): boolean {
  const obj = state.objects[id];
  return (
    obj !== undefined &&
    obj.zone !== 'battlefield' &&
    obj.zone !== 'stack' &&
    enchantFilterOfCard(state, obj) !== null
  );
}

/** The instructions `moves` (to the battlefield), with the move of each Aura card replaced by an `auraEntry` that chooses what it enchants (CR 303.4f). */
export function withAuraEntries(state: GameState, moves: readonly Instruction[]): Instruction[] {
  return moves.map((m) =>
    m.kind === 'move' && isAuraEntering(state, m.object)
      ? {
          kind: 'auraEntry' as const,
          object: m.object,
          tapped: m.tapped,
          ...(m.controller === undefined ? {} : { controller: m.controller }),
          ...(m.withCounters === undefined ? {} : { withCounters: m.withCounters }),
          chosen: null,
        }
      : m,
  );
}

/** The permanents the Aura card could be attached to as it enters under `seat`'s control, oldest first. */
function hostsFor(state: GameState, obj: GameObject, seat: SeatId): ObjectId[] {
  const found = enchantFilterOfCard(state, obj);
  if (found === null || found.filter.kind !== 'object') return [];
  const filter = { ...found.filter.filter, zone: 'battlefield' as const };
  return state.battlefield.filter((id) => {
    const host = state.objects[id];
    return (
      host !== undefined && matchesFilter(state, host, filter, { controller: seat, source: obj.id })
    );
  });
}

export function runAuraEntry(
  state: GameState,
  res: ResolutionContext,
  instruction: AuraEntryInstruction,
): StepOutcome {
  const obj = state.objects[instruction.object];
  // An object that already left (an earlier instruction moved it) is skipped (CR 608.2c).
  if (obj === undefined) return done(state);
  const seat = instruction.controller === 'owner' ? obj.owner : res.controller;
  const hosts = hostsFor(state, obj, seat);
  // CR 303.4g: no legal object to enchant: the Aura remains in its current zone.
  if (hosts.length === 0) return done(state);
  const chosen = instruction.chosen?.[0] ?? (hosts.length === 1 ? hosts[0] : undefined);
  if (chosen === undefined) {
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'choosePermanent',
        seat,
        source: res.object,
        purpose: 'auraHost',
        subject: obj.id,
        min: 1,
        max: 1,
        legal: hosts,
      },
    };
  }
  const events: GameEvent[] =
    instruction.chosen === null
      ? [
          {
            kind: 'permanentsChosen',
            seat,
            source: res.object,
            objects: [chosen],
            purpose: 'effect',
            automatic: true,
            subject: obj.id,
          },
        ]
      : [];
  return done(state, events, [
    {
      kind: 'move',
      object: obj.id,
      to: 'battlefield',
      position: 'top',
      tapped: instruction.tapped,
      commanderChoice: null,
      attachTo: chosen,
      ...(instruction.controller === undefined ? {} : { controller: instruction.controller }),
      ...(instruction.withCounters === undefined ? {} : { withCounters: instruction.withCounters }),
    },
  ]);
}
