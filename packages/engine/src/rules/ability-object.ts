/**
 * An ability on the stack (CR 113.7a, 602.2a, 603.3): an object that is not a card. It has the text
 * of the ability that created it and no other characteristics, so it exists independently of its
 * source. Triggered abilities (trigger-stack.ts) and activated abilities (activate.ts) both create
 * it here.
 */
import type { ObjectId, SeatId } from '../ids';
import type { ChosenTarget } from '../state/chosen';
import { addToZone, allocateObjectId, allocateTimestamp, setObject } from '../state/ops';
import type {
  GameObject,
  GameState,
  InherentAbility,
  StackAbility,
  ThisWayCounts,
} from '../state/types';

export interface AbilityObjectRequest {
  /** The player who controls the ability: who activated it, or who controlled the source. */
  readonly controller: SeatId;
  /**
   * The object the ability belongs to; it may leave while the ability is on the stack. Null for an inherent ability
   * with no source (the monarch's, CR 725.2, D-127), which `inherent` names.
   */
  readonly source: ObjectId | null;
  readonly inherent?: InherentAbility;
  /** Index of the ability among the source's derived abilities. */
  readonly abilityIndex: number;
  readonly ability: StackAbility;
  /**
   * For a triggered ability that reads `triggerSubject`: the object whose event caused it. Left out
   * for every other ability.
   */
  readonly subject?: ObjectId;
  /** For a triggered ability that reads `triggerPlayer` or `triggerDamage` (D-133): the player and the damage of its event. */
  readonly player?: SeatId;
  readonly damage?: number;
  /** For a triggered ability that reads `attackersAttackedYou` (D-149): the players its attack event was declared at. */
  readonly attacked?: readonly SeatId[];
  /** For a reflexive ability (D-177): the permanents the resolution that created it had sacrificed. */
  readonly sacrificedBefore?: readonly ObjectId[];
  /** For a reflexive ability (D-231): what the resolution that created it had counted. */
  readonly thisWayBefore?: ThisWayCounts;
  /** For a `leftGraveyard` ability (D-232): the cards that left the graveyard. */
  readonly cards?: readonly ObjectId[];
  /** For a Saga's chapter ability: the chapter number reached (CR 714.2). */
  readonly chapter?: number;
  /** The targets already chosen for it (a triggered ability whose choice was forced, CR 603.3d). */
  readonly targets?: readonly ChosenTarget[];
  /** The modes already chosen for a modal triggered ability whose choice was forced (D-114). */
  readonly modes?: readonly number[];
}

/** Puts a new ability object on top of the stack (CR 405.2) and returns its id. */
export function pushAbilityObject(
  state: GameState,
  request: AbilityObjectRequest,
): { readonly state: GameState; readonly id: ObjectId } {
  const [id, s1] = allocateObjectId(state);
  const [timestamp, s2] = allocateTimestamp(s1);
  const object: GameObject = {
    id,
    card: null,
    zone: 'stack',
    zoneOwner: null,
    owner: request.controller,
    controller: request.controller,
    face: 0,
    tapped: false,
    counters: {},
    damage: 0,
    damagedByDeathtouch: false,
    timestamp,
    token: null,
    attachedTo: null,
    protector: null,
    stack: {
      kind: 'ability',
      source: request.source,
      abilityIndex: request.abilityIndex,
      ability: request.ability,
      ...(request.inherent === undefined ? {} : { inherent: request.inherent }),
      chosenTargets: request.targets ?? [],
      x: null,
      chosenModes: request.modes ?? [],
      castFromCommandZone: false,
      kicked: false,
      flashback: false,
      ...(request.subject === undefined ? {} : { triggerSubject: request.subject }),
      ...(request.player === undefined ? {} : { triggerPlayer: request.player }),
      ...(request.damage === undefined ? {} : { triggerDamage: request.damage }),
      ...(request.attacked === undefined ? {} : { triggerAttacked: request.attacked }),
      ...(request.sacrificedBefore === undefined
        ? {}
        : { sacrificedBefore: request.sacrificedBefore }),
      ...(request.thisWayBefore === undefined ? {} : { thisWayBefore: request.thisWayBefore }),
      ...(request.cards === undefined ? {} : { triggerCards: request.cards }),
      ...(request.chapter === undefined ? {} : { chapter: request.chapter }),
    },
  };
  return { state: addToZone(setObject(s2, object), 'stack', null, id), id };
}
