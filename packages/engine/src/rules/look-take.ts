/**
 * "Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on
 * the bottom of your library in a random order." (D-139): the `lookAtTop` effect, run as one instruction in two stages.
 *
 * `take`: the player looks at the top `count` cards (fewer when the library holds fewer) and chooses, among those the filter matches, none
 * up to `max` of them to reveal (CR 701.20) and put into their hand (a `chooseCards` decision of purpose `lookTake`, asked only when some
 * card matches); the chosen cards go to the hand. `rest`: what is left of the cards looked at goes where the effect says: on the bottom of the
 * library in a random order from the game's seeded generator (CR 401.4, 701.24: only the number is told, which card went where is hidden)
 * or into the graveyard. A commander among the cards that go to the library or the hand asks its owner (CR 903.9b) like any card.
 */
import type { ObjectId } from '../ids';
import { shuffle } from '../rng';
import type { ChooseCardsDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { withAuraEntries } from './aura-entry';
import { derive } from './derive';
import { moveInstructions } from './effect-support';
import { manaValueOfCost } from './mana-value';
import { matchesFilter } from './select';
import { done, type StepOutcome } from './step-outcome';
import { isCommanderCard, moveObject } from './zones';

type LookTake = Extract<Instruction, { kind: 'lookTake' }>;

/** The cards looked at: the top `count` of the library of `seat` (all of it when it is shorter). */
function topCards(state: GameState, seat: LookTake['seat'], count: number): readonly ObjectId[] {
  return getSeat(state, seat).library.slice(0, Math.max(count, 0));
}

export function runLookTake(state: GameState, res: ResolutionContext, ins: LookTake): StepOutcome {
  if (ins.stage === 'rest') return putRest(state, ins);
  const { seat } = ins;
  const looked = topCards(state, seat, ins.count);
  if (looked.length === 0) return done(state);
  const legal = looked.filter((id) => {
    const card = state.objects[id];
    return (
      card !== undefined &&
      matchesFilter(
        state,
        card,
        { ...ins.filter, zone: 'library' },
        { controller: seat, source: res.source },
      ) &&
      // D-145: "with mana value less than or equal to the number of lands you control".
      (ins.manaValueAtMost === undefined ||
        manaValueOfCost(derive(state, card).manaCost, card) <= ins.manaValueAtMost)
    );
  });
  const to = ins.to ?? 'hand';
  // D-324: "Put two of them into your hand" with only two cards that can be taken: the whole answer is forced, so nobody is asked.
  const forced = ins.hidden === true && (ins.min ?? 0) >= legal.length && legal.length > 0;
  const chosenNow = ins.chosen ?? (forced ? legal : null);
  if (chosenNow === null && legal.length > 0) {
    const decision: Omit<ChooseCardsDecision, 'id'> = {
      kind: 'chooseCards',
      seat,
      source: res.object,
      purpose: 'lookTake',
      zone: 'library',
      legal,
      looked,
      // CR 702.75a (D-145): Hideaway exiles one of the cards looked at; every other take is a "you may".
      min: Math.min(ins.min ?? 0, legal.length),
      max: Math.min(ins.max, legal.length),
      // CR 202.3 (D-230): "with total mana value 4 or less": the answer is checked against the mana value of each card.
      ...(ins.totalManaValue === undefined
        ? {}
        : {
            totalManaValue: {
              limit: ins.totalManaValue,
              values: Object.fromEntries(
                legal.map((id) => {
                  const card = state.objects[id];
                  return [
                    id,
                    card === undefined ? 0 : manaValueOfCost(derive(state, card).manaCost, card),
                  ];
                }),
              ),
            },
          }),
      reveal: to !== 'exileFaceDown' && ins.hidden !== true,
      prompt: `Look at the top ${looked.length} card${looked.length === 1 ? '' : 's'} of your library. ${
        to === 'exileFaceDown'
          ? 'Exile one of them face down'
          : ins.totalManaValue !== undefined
            ? `Put any number of cards that match with total mana value ${ins.totalManaValue} or less onto the battlefield`
            : ins.hidden === true
              ? `Put ${ins.max === 1 ? 'one of them' : `${ins.max} of them`} into your hand`
              : `You may reveal ${
                  ins.max === 1 ? 'a card that matches' : `up to ${ins.max} cards that match`
                } and put ${ins.max === 1 ? 'it' : 'them'} ${
                  to === 'hand' ? 'into your hand' : 'onto the battlefield'
                }`
      }; the rest ${
        ins.rest === 'graveyard'
          ? 'go into your graveyard'
          : ins.rest === 'top'
            ? 'stay on top of your library'
            : ins.rest === 'bottomChosen'
              ? 'go on the bottom of your library in an order you choose'
              : 'go on the bottom of your library in a random order'
      }`,
    };
    return { state, events: [], front: [], needs: decision };
  }
  const chosen = chosenNow ?? [];
  const events: GameEvent[] = [{ kind: 'topCardsLooked', seat, count: looked.length }];
  // CR 701.20: a card put into the hand or onto the battlefield is revealed; one exiled face down by Hideaway is not (CR 702.75a), and nor
  // is one put into the hand by an effect that does not say reveal (D-324).
  if (chosen.length > 0 && to !== 'exileFaceDown' && ins.hidden !== true) {
    const cards = chosen.flatMap((id) => {
      const obj = state.objects[id];
      return obj?.card == null ? [] : [{ card: obj.card, name: derive(state, obj).name }];
    });
    events.push({
      kind: 'cardsRevealed',
      seat,
      cards: cards.map((c) => c.card),
      names: cards.map((c) => c.name),
      from: 'library',
    });
  }
  const left = looked.filter((id) => !chosen.includes(id));
  return done(state, events, [
    ...(to === 'hand'
      ? moveInstructions(chosen, 'hand')
      : to === 'battlefield'
        ? // CR 303.4f (D-230): an Aura among the cards chooses what it enchants as it enters (`rules/aura-entry.ts`).
          withAuraEntries(
            state,
            moveInstructions(chosen, 'battlefield', 'top', ins.tapped === true, 'you'),
          )
        : // CR 702.75a: exiled face down, remembered by the permanent whose ability it is and visible to its controller.
          moveInstructions(chosen, 'exile').map((i) =>
            i.kind === 'move' ? { ...i, linkTo: res.source, faceDown: true as const } : i,
          )),
    { ...ins, stage: 'rest', chosen, left },
  ]);
}

/** The cards looked at and not taken go to the bottom of the library in a random order, or to the graveyard. */
function putRest(state: GameState, ins: LookTake): StepOutcome {
  const left = (ins.left ?? []).filter((id) => state.objects[id]?.zone === 'library');
  if (left.length === 0) return done(state);
  // D-151: "look at the top card": what was not taken stays where it is.
  if (ins.rest === 'top') return done(state);
  if (ins.rest === 'graveyard') return done(state, [], moveInstructions(left, 'graveyard'));
  // CR 401.4 (D-324): the owner of the cards chooses the order they go on the bottom in (rules/arrange.ts).
  if (ins.rest === 'bottomChosen') {
    return done(
      state,
      [],
      [
        {
          kind: 'arrange',
          purpose: 'bottom',
          seat: ins.seat,
          count: left.length,
          cards: left,
          arranged: null,
        },
      ],
    );
  }
  return bottomInRandomOrder(state, ins.seat, left);
}

/**
 * Puts the cards on the bottom of their owner's library in a random order from the game's seeded generator (CR 401.4, 701.24 style:
 * nobody chooses, nobody sees; a `cardsBottomed` event tells how many). A commander card is the exception (CR 903.9b: its owner may put
 * it into the command zone instead of the library), so it moves as an ordinary move after the others.
 */
export function bottomInRandomOrder(
  state: GameState,
  seat: LookTake['seat'],
  left: readonly ObjectId[],
): StepOutcome {
  const commanders = left.filter((id) => {
    const card = state.objects[id];
    return card !== undefined && isCommanderCard(state, card);
  });
  const plain = left.filter((id) => !commanders.includes(id));
  const [shuffled, rng] = shuffle(plain, state.rng);
  let next: GameState = { ...state, rng };
  for (const id of shuffled) {
    const moved = moveObject(next, { object: id, to: 'library', position: 'bottom' });
    // Moving to a library asks nothing of a card that is not a commander.
    if (moved.kind === 'done') next = moved.state;
  }
  const events: GameEvent[] =
    shuffled.length > 0 ? [{ kind: 'cardsBottomed', seat, count: shuffled.length }] : [];
  return done(next, events, moveInstructions(commanders, 'library', 'bottom'));
}
