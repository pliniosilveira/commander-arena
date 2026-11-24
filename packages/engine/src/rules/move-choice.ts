/**
 * "Return a land you control to its owner's hand" and "You may put an artifact card from your hand onto the battlefield" as
 * instructions of a resolving effect (CR 608.2d): the controller chooses among the permanents they control that match, or (D-139)
 * among the cards they own in their hand or graveyard, with a `choosePermanent` or a `chooseCards` decision, unless no more
 * qualify than are needed. The choice then runs as ordinary move instructions, so a commander asks its owner (CR 903.9b) like any
 * other move to the hand or library.
 */
import type { ObjectFilter } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { seatsInOrder, zoneList } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { withAuraEntries } from './aura-entry';
import { derive } from './derive';
import { moveInstructions } from './effect-support';
import { controlledCandidates } from './sacrifice';
import { matchesFilter } from './select';
import { recordTogether } from './simultaneous';
import { done, type StepOutcome } from './step-outcome';

type ChooseMoveInstruction = Extract<Instruction, { kind: 'chooseMove' }>;

/** A choice among the cards the player owns in their hand or graveyard (D-139), not among their permanents. */
export function isCardZoneChoice(filter: ObjectFilter): boolean {
  return (
    filter.zone === 'hand' ||
    filter.zone === 'graveyard' ||
    filter.zone === 'exile' ||
    // Issue 103 (Hellkite Courser): "a commander you own from the command zone".
    filter.zone === 'command'
  );
}

/** The cards `seat` owns in the zone the filter names that match it (`source` is what "another" excludes). */
function cardCandidates(
  state: GameState,
  seat: SeatId,
  source: ObjectId | null,
  filter: ObjectFilter,
  alsoGraveyard = false,
  triggerDamage?: number,
  among?: readonly ObjectId[],
  handOf?: SeatId,
  /** CR 608.2d, 205.3m: the creature type chosen as the spell resolves, for a filter of "the chosen type" ("cards of that type from your graveyard"). */
  chosenCreatureType?: string,
): ObjectId[] {
  // Issue 103: "mana value less than or equal to that damage" reads the damage of the event that caused the trigger.
  const ctx = {
    controller: seat,
    source,
    ...(triggerDamage === undefined ? {} : { triggerDamage }),
    ...(chosenCreatureType === undefined
      ? {}
      : { sourceChosen: { creatureType: chosenCreatureType } }),
  };
  // CR 607.2a (D-207): "a card exiled with this artifact": the cards the permanent exiled with its linked ability that are still in exile.
  if (filter.zone === 'exile') {
    const { controller: _you, ...described } = filter;
    // `among` ("put a permanent card from among them onto the battlefield" after an exile): the cards the effect before it exiled, not the cards linked to the source.
    const linked =
      among !== undefined
        ? among
        : source === null
          ? []
          : (state.objects[source]?.linkedExile ?? []);
    return linked.filter((id) => {
      const obj = state.objects[id];
      return (
        obj?.zone === 'exile' && matchesFilter(state, obj, { ...described, zone: 'exile' }, ctx)
      );
    });
  }
  const zone =
    filter.zone === 'graveyard' ? 'graveyard' : filter.zone === 'command' ? 'command' : 'hand';
  // The zone belongs to the player ("your hand"), so whose the card is does not need saying again.
  const { controller: _you, ...described } = filter;
  // D-544: "from your hand or graveyard": the hand first, then the graveyard (the order of the words).
  const zones: readonly ('hand' | 'graveyard' | 'command')[] =
    alsoGraveyard && zone === 'hand' ? ['hand', 'graveyard'] : [zone];
  return zones.flatMap((z) =>
    // CR 402.3 (hands): "from defending player's hand" names the zone of another player (`handOf`); the chooser is still `seat`.
    zoneList(state, z, z === 'hand' && handOf !== undefined ? handOf : seat).filter((id) => {
      const obj = state.objects[id];
      return obj !== undefined && matchesFilter(state, obj, { ...described, zone: z }, ctx);
    }),
  );
}

const WHERE: Readonly<Record<ChooseMoveInstruction['to'], string>> = {
  exile: 'into exile',
  hand: 'into your hand',
  graveyard: 'into your graveyard',
  library: 'into your library',
  battlefield: 'onto the battlefield',
  command: 'into the command zone',
};

/**
 * With no candidate nothing happens; with no more candidates than needed the engine chooses (and says so); otherwise the
 * controller chooses among them (a "may" choice always asks when there is a candidate). What moved is what a later `moved`
 * reference means (CR 400.7j), so `lastMoved` starts empty.
 */
export function runChooseMove(
  state: GameState,
  res: ResolutionContext,
  instruction: ChooseMoveInstruction,
): StepOutcome {
  // D-231: "each player exiles a card from their graveyard": the player the instruction names chooses among their own cards.
  const chooser = instruction.seat ?? res.controller;
  // Issue 102 (Tasigur): "of an opponent's choice": the cards are the chooser's, an opponent is the one asked.
  const decider = instruction.decider ?? chooser;
  // D-411 (CR 608.2c): "You may put a land card from among them into your hand" is the offer itself, so what "if you do" and "if you don't" read starts again
  // at 0 as it is made, as a `may` effect does (D-135); the card moved, if one is, is what it counts.
  // CR 608.2c: an offer ("you may exile a creature card from your graveyard. If you do, ...") starts what "if you do" reads again, as a `may` does.
  const restart =
    instruction.among === undefined && instruction.optional !== true
      ? {}
      : { resetPerformed: true as const };
  // CR 101.4, 701.13 (`together`): the cards a player chose are held until the last player has chosen; then each player's cards move, in the order they chose.
  const group = instruction.together;
  const hold = (objects: readonly ObjectId[], automatic: boolean): StepOutcome => {
    if (group === undefined) throw new Error('A choice with no group cannot be held');
    const held = [...group.held, { seat: chooser, cards: objects, automatic }];
    const next = group.later[0];
    if (next !== undefined) {
      return done(
        state,
        [],
        [
          {
            ...instruction,
            seat: next,
            chosen: null,
            together: {
              ...(group.distinct === true ? { distinct: true as const } : {}),
              later: group.later.slice(1),
              held,
            },
          },
        ],
      );
    }
    const { together: _held, ...single } = instruction;
    // CR 603.6a (`distinct`): the cards every opponent chose enter the battlefield at the same moment, as one move.
    if (group.distinct === true) {
      const all = held.flatMap((h) => h.cards);
      if (all.length === 0) return { ...done(state), lastMoved: [] };
      return {
        ...done(state, [], [{ ...single, seat: held[0]?.seat ?? chooser, chosen: all }]),
        lastMoved: [],
      };
    }
    return {
      ...done(
        state,
        [],
        held
          .filter((h) => h.cards.length > 0)
          .map((h) => ({
            ...single,
            seat: h.seat,
            chosen: h.cards,
            ...(h.automatic ? { automatic: true as const } : {}),
          })),
      ),
      lastMoved: [],
    };
  };
  const run = (objects: readonly ObjectId[], automatic: boolean): StepOutcome => {
    if (group !== undefined) return hold(objects, automatic);
    const event: GameEvent = {
      kind: 'permanentsChosen',
      seat: decider,
      source: res.object,
      objects,
      purpose: 'effect',
      automatic,
    };
    // Issue 102 (Dauthi Voidwalker): the card chosen stays where it is, and the controller may play it this turn (`mayPlay` of what was chosen).
    if (instruction.permit !== undefined) {
      return {
        ...done(
          state,
          [event],
          [
            {
              kind: 'effect' as const,
              effect: {
                kind: 'mayPlay' as const,
                objects: { kind: 'moved' as const },
                lasts: 'endOfTurn' as const,
                ...(instruction.permit.free === true ? { free: true as const } : {}),
              },
            },
          ],
        ),
        lastMoved: objects,
        ...restart,
      };
    }
    // D-283 (CR 603.10a): permanents put into a graveyard (or elsewhere) together keep the last-known information recorded before the first leaves.
    // CR 303.4f (issue 103): an Aura card put onto the battlefield this way chooses what it enchants as it enters.
    const together = recordTogether(
      state,
      moveInstructions(
        objects,
        instruction.to,
        instruction.position,
        instruction.tapped ?? false,
        instruction.controller,
        instruction.withCounters,
      ).map((i) => {
        if (i.kind !== 'move') return i;
        // CR 607.2a: "exiled with this Saga": the permanent remembers the card.
        if (instruction.linkTo !== undefined) return { ...i, linkTo: instruction.linkTo };
        // CR 608.2c: a card put from a graveyard onto the battlefield by this choice is what "returned this way" counts.
        const returns = instruction.to === 'battlefield' && instruction.filter.zone === 'graveyard';
        return {
          ...i,
          ...(instruction.countsNonland === true ? { countsNonland: true as const } : {}),
          ...(returns ? { countsReturned: true as const } : {}),
        };
      }),
    );
    const entries =
      instruction.to === 'battlefield'
        ? withAuraEntries(together.state, together.instructions)
        : together.instructions;
    return { ...done(together.state, [event], entries), lastMoved: [], ...restart };
  };
  if (instruction.chosen !== null) return run(instruction.chosen, instruction.automatic === true);
  const fromCards = isCardZoneChoice(instruction.filter);
  // CR 608.2d (`distinct`): "a creature card that hasn't been chosen": the cards the players before chose are not offered again.
  const chosenBefore =
    group?.distinct === true ? group.held.flatMap((h) => h.cards) : ([] as ObjectId[]);
  const legalAll =
    fromCards && instruction.graveyardOf !== undefined
      ? // King Narfi's Betrayal (CR 404.1): the cards in one player's graveyard that match the filter, whoever chooses.
        zoneList(state, 'graveyard', instruction.graveyardOf).filter((id) => {
          const obj = state.objects[id];
          const { controller: _you, ...described } = instruction.filter;
          return (
            obj !== undefined &&
            matchesFilter(
              state,
              obj,
              { ...described, zone: 'graveyard' },
              { controller: chooser, source: res.source },
            )
          );
        })
      : fromCards && instruction.anyOwner === true
        ? // Issue 159: "a creature card put into a graveyard this way": the cards the effect before it moved that are in any graveyard and match the filter. Without `among`
          // (Extract from Darkness, CR 404.1: "a creature card from a graveyard") every card of every graveyard.
          (
            instruction.among ??
            seatsInOrder(state, chooser).flatMap((seat) => zoneList(state, 'graveyard', seat))
          ).filter((id) => {
            const obj = state.objects[id];
            const { controller: _owner, ...described } = instruction.filter;
            return (
              obj !== undefined &&
              obj.zone === 'graveyard' &&
              matchesFilter(
                state,
                obj,
                { ...described, zone: 'graveyard' },
                {
                  controller: chooser,
                  source: res.source,
                },
              )
            );
          })
        : fromCards
          ? cardCandidates(
              state,
              chooser,
              res.source,
              instruction.filter,
              instruction.alsoGraveyard === true,
              res.triggerDamage,
              instruction.among,
              instruction.handOf,
              res.chosenCreatureType,
            ).filter(
              // D-411: only the cards the effect before it moved.
              (id) => instruction.among === undefined || instruction.among.includes(id),
            )
          : controlledCandidates(state, chooser, res.source, instruction.filter);
  const legal = legalAll.filter((id) => !chosenBefore.includes(id));
  // CR 402.3 (hands): "look at defending player's hand ... you may put a creature card from it": the whole hand is looked at, so with cards in it the controller is
  // shown it even when none can be chosen; an empty hand shows nothing.
  const looked =
    instruction.handOf === undefined ? [] : zoneList(state, 'hand', instruction.handOf);
  if (legal.length === 0 && looked.length === 0) {
    // CR 101.4: a player with nothing to choose still lets the next player choose.
    if (group !== undefined) return hold([], true);
    return { ...done(state), lastMoved: [], ...restart };
  }
  const optional = instruction.optional === true;
  // CR 205.2a: "any number of cards ... with four or more card types among them": with no way to reach that many card types among the candidates nothing can be chosen,
  // so nothing is asked (and "if you do" reads that nothing was done).
  const typesOf: Record<ObjectId, readonly string[]> = {};
  if (instruction.minCardTypes !== undefined) {
    const seen = new Set<string>();
    for (const id of legal) {
      const obj = state.objects[id];
      const types = obj === undefined ? [] : derive(state, obj).types;
      typesOf[id] = types;
      for (const t of types) seen.add(t);
    }
    if (seen.size < instruction.minCardTypes) {
      return { ...done(state), lastMoved: [], ...restart };
    }
  }
  const anyNumber = instruction.anyNumber === true;
  if (!anyNumber && !optional && legal.length <= instruction.count) return run(legal, true);
  const max = anyNumber ? legal.length : Math.min(instruction.count, legal.length);
  const min = optional ? 0 : max;
  if (fromCards) {
    const zone =
      instruction.filter.zone === 'graveyard'
        ? 'graveyard'
        : instruction.filter.zone === 'exile'
          ? 'exile'
          : instruction.filter.zone === 'command'
            ? 'command'
            : 'hand';
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseCards',
        seat: decider,
        source: res.object,
        purpose: 'move',
        zone,
        ...(instruction.alsoGraveyard === true ? { alsoGraveyard: true as const } : {}),
        legal,
        // CR 402.3: every card of the hand looked at (`looked`), which only `seat` may see; `legal` are the ones that may be chosen.
        ...(looked.length === 0 ? {} : { looked }),
        min,
        max,
        reveal: zone !== 'hand',
        ...(instruction.minCardTypes === undefined
          ? {}
          : { minCardTypes: { count: instruction.minCardTypes, types: typesOf } }),
        prompt:
          instruction.permit !== undefined
            ? 'Choose an exiled card to play this turn'
            : // Issue 102 (Tasigur): an opponent chooses a card of the controller's graveyard for the controller's hand.
              decider !== chooser
              ? `Choose ${max} card${max === 1 ? '' : 's'} from your opponent's ${zone} to put ${WHERE[
                  instruction.to
                ].replace('your', 'their')}`
              : legal.length === 0
                ? // CR 402.3: nothing in the hand can be chosen; the controller looks at it and goes on.
                  `Look at their hand: no card in it can be put ${WHERE[instruction.to]}`
                : `Choose ${
                    instruction.minCardTypes !== undefined
                      ? `any number of cards with ${instruction.minCardTypes} or more card types among them`
                      : `${optional ? 'up to ' : ''}${max} card${max === 1 ? '' : 's'}`
                  } ${
                    instruction.among !== undefined && zone === 'exile'
                      ? 'from among the cards exiled this way'
                      : instruction.among !== undefined
                        ? 'from among the cards put into your graveyard'
                        : instruction.anyOwner === true
                          ? 'from a graveyard'
                          : zone === 'exile'
                            ? 'exiled with this permanent'
                            : instruction.graveyardOf !== undefined
                              ? instruction.graveyardOf === chooser
                                ? 'from your graveyard'
                                : "from an opponent's graveyard"
                              : instruction.alsoGraveyard === true
                                ? 'from your hand or graveyard'
                                : zone === 'command'
                                  ? 'from your command zone'
                                  : instruction.handOf !== undefined
                                    ? 'from their hand'
                                    : `from your ${zone}`
                  } to put ${WHERE[instruction.to]}`.replace(
                    'from among the cards put into your graveyard',
                    instruction.anyOwner === true
                      ? 'from among the cards put into a graveyard'
                      : 'from among the cards put into your graveyard',
                  ),
      },
    };
  }
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'choosePermanent',
      seat: decider,
      source: res.object,
      purpose: 'effect',
      min,
      max,
      legal,
    },
  };
}
