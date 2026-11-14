/**
 * Emblems (CR 114, D-201). "You get an emblem with ..." puts an object in the command zone of the player who gets it (CR 114.1, 114.2). The emblem has no
 * characteristics but the abilities it was given (CR 114.3: no types, no mana cost, no colors), its controller and its owner are that player, and its
 * abilities work from the command zone (CR 114.4); it cannot be removed from the game (CR 114.5), so no effect names it and nothing here moves it.
 *
 * The object is `card: null` with a `token` record (the characteristics and abilities `derive` reads) and `emblem: true`; it is not on the battlefield, so
 * it is not a permanent and the state-based action for tokens leaves it alone. Its static abilities are read with those of the permanents
 * (`derive-statics.ts`), its triggered abilities with the others (`triggers.ts`, `emblemsOf`).
 */
import type { Ability } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { addToZone, allocateObjectId, allocateTimestamp, setObject } from '../state/ops';
import type { GameObject, GameState } from '../state/types';

/** Every emblem in the game, by age: the objects of the command zones that have the mark. */
export function emblemsOf(state: GameState): ObjectId[] {
  const out: ObjectId[] = [];
  for (const seat of state.seats) {
    for (const id of seat.command) {
      if (state.objects[id]?.emblem === true) out.push(id);
    }
  }
  return out.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/** `seat` gets an emblem with `abilities` (CR 114.1, 114.2): a new object in their command zone. `text` is what it shows as its rules text. */
export function createEmblem(
  input: GameState,
  seat: SeatId,
  abilities: readonly Ability[],
  text: string,
): { state: GameState; events: GameEvent[] } {
  const [id, s1] = allocateObjectId(input);
  const [timestamp, s2] = allocateTimestamp(s1);
  const emblem: GameObject = {
    id,
    card: null,
    zone: 'command',
    zoneOwner: seat,
    owner: seat,
    controller: seat,
    face: 0,
    tapped: false,
    counters: {},
    damage: 0,
    damagedByDeathtouch: false,
    timestamp,
    token: {
      characteristics: {
        name: 'Emblem',
        manaCost: null,
        supertypes: [],
        types: [],
        subtypes: [],
        colors: [],
        power: null,
        toughness: null,
        loyalty: null,
        defense: null,
        oracleText: text,
      },
      abilities,
    },
    attachedTo: null,
    protector: null,
    stack: null,
    emblem: true,
  };
  const state = addToZone(setObject(s2, emblem), 'command', seat, id);
  return { state, events: [{ kind: 'emblemCreated', seat, object: id }] };
}
