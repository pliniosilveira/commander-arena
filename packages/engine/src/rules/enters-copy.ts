/**
 * "As this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has haste." (CR 614.12, 707.9,
 * 707.2, D-151, D-225): the permanent a replacement effect `entersAsCopy` lets the entering permanent become a copy of, and the copy effect itself. A card
 * asks as it is moved to the battlefield (`zones.ts`); a token that is a copy of such a permanent asks as it is created (`enter-token.ts`), the same question.
 */
import type { Replacement } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { allocateTimestamp, patchObject } from '../state/ops';
import type { GameState } from '../state/types';
import { copiableValues } from './copiable';
import { withCopyExceptions } from './copy-exceptions';
import { counterBlocked } from './counter-prevention';
import { matchesFilter } from './select';

type CopyRule = Extract<Replacement, { kind: 'entersAsCopy' }>;

/** The permanents on the battlefield (or, with `fromGraveyard`, the cards of the controller's graveyard) the entering permanent may become a copy of (`source` is the object that enters or, for a token, what creates it). */
export function copyCandidates(
  state: GameState,
  seat: SeatId,
  rule: CopyRule,
  source: ObjectId | null,
): ObjectId[] {
  // CR 614.12, 707.9, 700.4: "a copy of any creature card in your graveyard that was put there from the battlefield this turn": the cards of the graveyard of the controller.
  const pool =
    rule.fromGraveyard === true ? (state.seats[seat]?.graveyard ?? []) : state.battlefield;
  const zone = rule.fromGraveyard === true ? 'graveyard' : 'battlefield';
  return pool.filter((id) => {
    const candidate = state.objects[id];
    return (
      candidate !== undefined &&
      matchesFilter(state, candidate, { ...rule.what, zone }, { controller: seat, source })
    );
  });
}

/**
 * The permanent `entering` (already on the battlefield) becomes a copy of `copied` as it enters: a copy effect of the duration the rule says, with the
 * copiable values of `copied` as they are now (CR 707.2: not counters or damage) and the keyword abilities the exception adds (CR 707.9b); and, for a copy of a
 * planeswalker, the loyalty counters it enters with (CR 306.5b). Returns the events of the copy and of the counters (`counterEvents`, reported later).
 */
export function becomeCopyAsItEnters(
  state: GameState,
  entering: ObjectId,
  rule: CopyRule,
  copied: ObjectId,
  controller: SeatId,
  embalmed = false,
): { state: GameState; events: GameEvent[]; counterEvents: GameEvent[] } {
  const original = state.objects[copied];
  if (original?.zone !== (rule.fromGraveyard === true ? 'graveyard' : 'battlefield')) {
    return { state, events: [], counterEvents: [] };
  }
  // CR 707.9b, 702.128b: "except if this creature was embalmed, the token has no mana cost, it's white, ...": exceptions only an embalmed token has.
  const copiedValues = copiableValues(state, original);
  const withEmbalm =
    embalmed && rule.ifEmbalmed !== undefined
      ? withCopyExceptions(copiedValues, rule.ifEmbalmed)
      : copiedValues;
  // CR 707.9b (issue 103): "except it's a Dragon in addition to its other types": the creature types of the exception are part of the copiable values.
  // CR 707.9b, 205.1b (Phyrexian Metamorph): "except it's an artifact in addition to its other types": the card types of the exception are part of the copiable values too.
  const excepted =
    rule.addSubtypes === undefined && rule.addTypes === undefined
      ? withEmbalm
      : withCopyExceptions(withEmbalm, {
          ...(rule.addSubtypes === undefined ? {} : { addSubtypes: rule.addSubtypes }),
          ...(rule.addTypes === undefined ? {} : { addTypes: rule.addTypes }),
        });
  // CR 707.9a, 707.9b, 205.4a: "except her name is ~ and she's a legendary Trill in addition to her other types": the name the card has itself, and the supertypes added.
  const own = rule.keepName === true ? state.objects[entering] : undefined;
  const values =
    rule.addSupertypes === undefined && own === undefined
      ? excepted
      : {
          ...excepted,
          characteristics: {
            ...excepted.characteristics,
            ...(own === undefined ? {} : { name: copiableValues(state, own).characteristics.name }),
            supertypes: [
              ...excepted.characteristics.supertypes,
              ...(rule.addSupertypes ?? []).filter(
                (t) => !excepted.characteristics.supertypes.includes(t),
              ),
            ],
          },
        };
  const [stamp, stamped] = allocateTimestamp(state);
  let next: GameState = {
    ...stamped,
    continuousEffects: [
      ...stamped.continuousEffects,
      {
        id: `ce${stamp}`,
        timestamp: stamp,
        objects: [entering],
        until: rule.duration === 'untilEndOfTurn' ? 'endOfTurn' : 'permanent',
        change: {
          kind: 'copy',
          values: {
            characteristics: values.characteristics,
            abilities: [
              ...values.abilities,
              ...(rule.gains ?? []).map((keyword) => ({ kind: 'keyword' as const, keyword })),
              // CR 707.9b (Mocking Doppelganger): "except it has \"...\"": the abilities of the exception are copiable values too.
              ...(rule.addStatics ?? []),
            ],
            ...(values.doors === undefined ? {} : { doors: values.doors }),
          },
        },
      },
    ],
  };
  const events: GameEvent[] = [{ kind: 'enteredAsCopy', object: entering, copied }];
  const counterEvents: GameEvent[] = [];
  // CR 306.5b (D-200): it enters as a planeswalker (a copy of one) with loyalty counters equal to the loyalty it copied.
  const copiedLoyalty = values.characteristics.loyalty;
  if (values.characteristics.types.includes('planeswalker') && copiedLoyalty !== null) {
    const obj = next.objects[entering];
    // D-380 (CR 122.6, 101.2): a planeswalker that can't have loyalty counters enters without them.
    if (obj !== undefined && !counterBlocked(next, obj, 'loyalty')) {
      next = patchObject(next, entering, {
        counters: { ...obj.counters, loyalty: (obj.counters.loyalty ?? 0) + copiedLoyalty },
      });
      counterEvents.push({
        kind: 'counterAdded',
        object: entering,
        counter: 'loyalty',
        count: copiedLoyalty,
        by: controller,
      });
    }
  }
  return { state: next, events, counterEvents };
}
