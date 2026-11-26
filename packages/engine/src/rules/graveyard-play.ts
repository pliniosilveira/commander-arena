/**
 * "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard" (Muldrotha, the Gravetide; `playFromGraveyardEachType`):
 * a slot for each permanent type, kept in `TurnLog.graveyardSlots`; a card is played as one of its types (the player names it as `permanentType` of the action, or the engine takes
 * the one that costs the fewest other plays) and uses that slot only.
 *
 * "Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. If you do, it gains ..."
 * (Serra Paragon) and "Once during each of your turns, you may cast an artifact spell from your graveyard. If you cast a spell this way, that artifact enters tapped."
 * (Edgar, Master Machinist): CR 601.2a, 305.1, 113.6, D-232. The static ability `playFromGraveyardOnceEachTurn` of a permanent gives its controller the permission in their
 * own turn; the permission of each permanent is used once a turn (`TurnLog.graveyardPlays`), whether for a land or for a spell. The card keeps its own permission to be cast
 * from the graveyard when it has one (a spell cast that way uses nothing of this one). What the permanent the card becomes does because it was played this way
 * (enters tapped, gains an ability) is applied as it enters the battlefield (`applyGraveyardRider`).
 */
import type { CardType } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import { allocateTimestamp, patchObject } from '../state/ops';
import type { GameObject, GameState, StackData } from '../state/types';
import { controllerOf } from './control';
import { derive } from './derive';
import { type GraveyardPlaySource, graveyardPlaySources } from './derive-statics';
import { matchesFilter } from './select';
import { largestSet } from './slot-matching';

/** What a use of the permission gives the permanent: kept on the spell on the stack (`StackData.graveyardPlay`). */
export type GraveyardRider = NonNullable<StackData['graveyardPlay']>;

/** The permission found for a card: with `playFromGraveyardEachType`, `slots` are the permanent types of the card still free to use it as (never empty). */
export type GraveyardUse = GraveyardPlaySource & { readonly slots?: readonly CardType[] };

/** The permanent types a spell can be cast as ("each permanent type": CR 205.2a), the land play having its own slot. */
const SPELL_SLOTS: readonly CardType[] = [
  'artifact',
  'battle',
  'creature',
  'enchantment',
  'planeswalker',
];

/** The slots of `source` free for the card with these `types`, as a land play (`asLand`) or a spell. */
function freeSlots(
  state: GameState,
  source: GraveyardPlaySource,
  types: readonly string[],
  asLand: boolean,
): CardType[] {
  const taken = (state.turnLog.graveyardSlots ?? [])
    .filter((u) => u.source === source.object.id)
    .map((u) => u.type);
  const own: readonly CardType[] = asLand ? ['land'] : SPELL_SLOTS;
  return own.filter((t) => types.includes(t) && !taken.includes(t));
}

/**
 * The permission, not yet used this turn, that lets `seat` play `obj` (a card in their graveyard) as a land (`asLand`) or cast it as a spell; null when none does. It
 * is read on the turn of `seat` only ("during each of your turns"). With `type`, only a permission that can use the card as that permanent type
 * (`playFromGraveyardEachType`) counts.
 */
export function graveyardPlayPermission(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  asLand: boolean,
  type?: CardType,
  /**
   * Eye of Duskmantle (CR 118.9): a spell cast for the alternative cost `lifeForMana`, which only a permission with `lifeForMana` gives; without it, only the permissions that let the spell
   * be cast for its mana cost count.
   */
  lifeForMana = false,
): GraveyardUse | null {
  if (obj.zone !== 'graveyard' || obj.owner !== seat || obj.card === null) return null;
  const ownTurn = state.turn.activeSeat === seat;
  const used = state.turnLog.graveyardPlays ?? [];
  // Read only once a permanent offers a permission at all: most states have none, and deriving every card of a graveyard is the cost.
  let derived: readonly string[] | undefined;
  const typesOf = (): readonly string[] => (derived ??= derive(state, obj).types);
  // A permission that is not used up (CR 305.1, "You may play Forests from your graveyard") is preferred to one that is, so the use of a land play keeps the once-each-turn one.
  let limited: GraveyardUse | null = null;
  for (const source of graveyardPlaySources(state)) {
    if (controllerOf(state, source.object) !== seat) continue;
    // "During each of your turns" and "once during each of your turns" permissions work in the controller's own turn only.
    if (!ownTurn && source.surveiled !== true) continue;
    // CR 701.25a, 400.7 (Eye of Duskmantle): the card as it is in the graveyard now, put there by a surveil of this player this turn.
    if (
      source.surveiled === true &&
      !(state.turnLog.surveiledCards ?? []).some((s) => s.card === obj.id && s.by === seat)
    ) {
      continue;
    }
    // CR 118.9: a spell is cast for life by the permissions that say so and for its mana cost by the others; a land is neither.
    if (!asLand && (source.lifeForMana === true) !== lifeForMana) continue;
    if (source.eachType === true) {
      // "a land and a permanent spell of each permanent type": a card is played as one of its types, whose slot is then used (a land is never cast).
      const slots = freeSlots(state, source, typesOf(), asLand).filter(
        (t) => type === undefined || t === type,
      );
      if (slots.length === 0 || (!asLand && typesOf().includes('land'))) continue;
      if (asLand) limited ??= { ...source, slots };
      else return { ...source, slots };
      continue;
    }
    if (type !== undefined) continue;
    if (source.unlimited !== true && used.includes(source.object.id)) continue;
    if (asLand) {
      if (!source.land || !typesOf().includes('land')) continue;
      if (
        source.lands !== undefined &&
        !matchesFilter(
          state,
          obj,
          { ...source.lands, zone: 'graveyard' },
          { controller: seat, source: source.object.id },
        )
      ) {
        continue;
      }
      if (source.unlimited === true) return source;
      limited ??= source;
      continue;
    }
    if (source.cast === undefined || typesOf().includes('land')) continue;
    // CR 404.1, 400.7 (Banon): "put there from anywhere other than the battlefield this turn".
    if (
      source.putElsewhereThisTurn === true &&
      !(state.turnLog.graveyardedElsewhere ?? []).includes(obj.id)
    ) {
      continue;
    }
    if (
      matchesFilter(
        state,
        obj,
        { ...source.cast, zone: 'graveyard' },
        { controller: seat, source: source.object.id },
      )
    ) {
      return source;
    }
  }
  return limited;
}

/** The permanent types `playFromGraveyardEachType` can cast the card `obj` of the graveyard as now, in the order of the types. */
export function graveyardCastTypes(state: GameState, seat: SeatId, obj: GameObject): CardType[] {
  return SPELL_SLOTS.filter((t) => graveyardPlayPermission(state, seat, obj, false, t) !== null);
}

/**
 * The permanent type a use of `use` counts the card as: `requested` when it is free, else (the player named none) the free type that leaves the most of the other permanent cards of
 * the graveyard still castable, the first in the order of the types when several do (CR 601.2, as `freeCastSlotToUse`). Undefined for a permission with no slots.
 */
export function slotOf(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  use: GraveyardUse,
  asLand: boolean,
  requested?: CardType,
): CardType | undefined {
  const slots = use.slots;
  if (slots === undefined) return undefined;
  if (requested !== undefined && slots.includes(requested)) return requested;
  const [first] = slots;
  if (first === undefined || slots.length === 1) return first;
  const others = (state.seats[seat]?.graveyard ?? [])
    .filter((id) => id !== obj.id)
    .flatMap((id) => {
      const o = state.objects[id];
      return o === undefined || o.card === null ? [] : [derive(state, o).types];
    })
    .filter((types) => !types.includes('land'))
    .map((types) => types.filter((t): t is CardType => SPELL_SLOTS.includes(t as CardType)));
  const left = asLand
    ? []
    : SPELL_SLOTS.filter(
        (t) =>
          !(state.turnLog.graveyardSlots ?? []).some(
            (u) => u.source === use.object.id && u.type === t,
          ),
      );
  let best = first;
  let bestSize = -1;
  for (const candidate of slots) {
    const size = largestSet(
      others,
      left.filter((t) => t !== candidate),
    );
    if (size > bestSize) {
      best = candidate;
      bestSize = size;
    }
  }
  return best;
}

/**
 * True when the action names a permanent type (`permanentType`) for a card of the graveyard that a permission would let the seat play, and no permission can use the card as that
 * type (it is not one of its types, or its slot is used): the action is refused rather than played as another type.
 */
export function permanentTypeUnavailable(
  state: GameState,
  seat: SeatId,
  obj: GameObject,
  asLand: boolean,
  type: CardType | undefined,
): boolean {
  if (type === undefined || obj.zone !== 'graveyard') return false;
  return (
    graveyardPlayPermission(state, seat, obj, asLand, type) === null &&
    graveyardPlayPermission(state, seat, obj, asLand) !== null
  );
}

/** The rider a use of `source` gives; `slot` is the permanent type it was counted as. */
export function riderOf(
  source: GraveyardPlaySource,
  asLand: boolean,
  slot?: CardType,
): GraveyardRider {
  return {
    source: source.object.id,
    ...(slot === undefined ? {} : { slot }),
    // "If you cast a spell this way, that artifact enters tapped": a land played this way is not a spell (CR 305.1) and enters as it would.
    ...(source.entersTapped && !asLand ? { entersTapped: true as const } : {}),
    ...(source.gains === undefined ? {} : { gains: source.gains }),
    ...(source.exileOthers === undefined || asLand ? {} : { exileOthers: source.exileOthers }),
  };
}

/** The permission of `source` is used for this turn; of `playFromGraveyardEachType`, the slot of the type `slot` only (it stays used if the spell is countered). */
export function markGraveyardPlay(state: GameState, source: ObjectId, slot?: CardType): GameState {
  if (slot !== undefined) {
    return {
      ...state,
      turnLog: {
        ...state.turnLog,
        graveyardSlots: [...(state.turnLog.graveyardSlots ?? []), { source, type: slot }],
      },
    };
  }
  return {
    ...state,
    turnLog: {
      ...state.turnLog,
      graveyardPlays: [...(state.turnLog.graveyardPlays ?? []), source],
    },
  };
}

/** The permanent `id` entered the battlefield because of the permission: it enters tapped and gains the ability (a continuous effect that lasts, CR 611.2a). */
export function applyGraveyardRider(
  state: GameState,
  id: ObjectId,
  rider: GraveyardRider,
): GameState {
  let next = state;
  if (next.objects[id] === undefined) return state;
  if (rider.entersTapped === true) next = patchObject(next, id, { tapped: true });
  if (rider.gains !== undefined) {
    const [stamp, stamped] = allocateTimestamp(next);
    next = {
      ...stamped,
      continuousEffects: [
        ...stamped.continuousEffects,
        {
          id: `ce${stamp}`,
          timestamp: stamp,
          objects: [id],
          until: 'permanent',
          change: { kind: 'grantAbility', ability: rider.gains },
        },
      ],
    };
  }
  return next;
}
