/**
 * "Choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their
 * owners' control" (`returnGraveyardPair`, D-951; Dawnbreak Reclaimer). Three steps, one instruction (`graveyardPair`) that stays at the head of the resolution until it is done:
 *
 * 1. `theirs`: the controller chooses a card of the type among the cards in the graveyards of their opponents (CR 608.2c: the instructions are followed in the order written).
 * 2. `mine`: the owner of that card, "that player", chooses a card of the type in the controller's graveyard.
 * 3. `ask`: the controller may return the cards chosen; accepting returns both to the battlefield under their owners' control (CR 110.2a: the effect states otherwise, and CR
 *    400.3 puts a card in its owner's graveyard anyway, so the owner of the card is the player whose graveyard it is in), declining returns neither.
 *
 * A choice that cannot be made is not made (CR 608.2d: a player can't choose an option that is impossible). With no such card in an opponent's graveyard no card is chosen and
 * nobody is "that player", so the second choice is not made either and nothing is asked; with no such card in the controller's graveyard the first card alone is offered. A
 * question with a single candidate is not asked (the engine chooses and says so with `permanentsChosen { automatic: true }`, as `rules/move-choice.ts` does). Graveyards are public
 * (CR 404.2 keeps each in a face-up pile), so every choice and the question are shown to both players.
 */
import type { CardType } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { opponentsOf, zoneList } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { moveInstructions } from './effect-support';
import { matchesFilter } from './select';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type GraveyardPair = Extract<Instruction, { kind: 'graveyardPair' }>;

/** The effect `returnGraveyardPair` as it resolves: the first choice comes next. */
export function startGraveyardPair(cardType: CardType): Instruction {
  return {
    kind: 'graveyardPair',
    cardType,
    stage: 'theirs',
    theirs: null,
    mine: null,
    chosen: null,
    answer: null,
  };
}

/** The cards of `cardType` in the graveyards of `seats`, each seat's in graveyard order. */
function graveyardCards(
  state: GameState,
  res: ResolutionContext,
  cardType: CardType,
  seats: readonly SeatId[],
): ObjectId[] {
  return seats.flatMap((seat) =>
    zoneList(state, 'graveyard', seat).filter((id) => {
      const card = state.objects[id];
      return (
        card !== undefined &&
        matchesFilter(
          state,
          card,
          { types: [cardType], zone: 'graveyard' },
          { controller: res.controller, source: res.source },
        )
      );
    }),
  );
}

/** The question "choose a card" of one step: public, exactly one of `legal`. */
function chooseOneOf(
  res: ResolutionContext,
  chooser: SeatId,
  legal: readonly ObjectId[],
  prompt: string,
): StepOutcome['needs'] {
  return {
    kind: 'chooseCards',
    seat: chooser,
    source: res.object,
    purpose: 'pair',
    zone: 'graveyard',
    legal,
    min: 1,
    max: 1,
    reveal: true,
    prompt,
  };
}

export function runGraveyardPair(
  state: GameState,
  res: ResolutionContext,
  ins: GraveyardPair,
): StepOutcome {
  if (ins.stage === 'ask') return runAsk(state, res, ins);
  const first = ins.stage === 'theirs';
  // Step 1: the opponents' graveyards; step 2: the controller's own, chosen by the owner of the first card.
  const chooser: SeatId | undefined = first
    ? res.controller
    : ins.theirs === null
      ? undefined
      : state.objects[ins.theirs]?.owner;
  const legal =
    chooser === undefined
      ? []
      : first
        ? graveyardCards(state, res, ins.cardType, opponentsOf(state, res.controller))
        : graveyardCards(state, res, ins.cardType, [res.controller]);
  if (chooser === undefined || legal.length === 0) {
    // CR 608.2d: nothing to choose, so nothing is chosen. The first step finding nothing ends it: there is no "that player".
    return first
      ? done(state)
      : done(state, [], [{ ...ins, stage: 'ask', chosen: null, answer: null }]);
  }
  const [only] = legal;
  if (ins.chosen === null && !(legal.length === 1 && only !== undefined)) {
    const noun = `${ins.cardType} card`;
    return {
      state,
      events: [],
      front: [],
      needs: chooseOneOf(
        res,
        chooser,
        legal,
        first
          ? `Choose a ${noun} in an opponent's graveyard.`
          : `Choose a ${noun} in the graveyard of the player who controls the ability.`,
      ),
    };
  }
  const picked = ins.chosen?.[0] ?? only;
  if (picked === undefined || !legal.includes(picked)) return done(state);
  const event: GameEvent = {
    kind: 'permanentsChosen',
    seat: chooser,
    source: res.object,
    objects: [picked],
    purpose: 'effect',
    automatic: ins.chosen === null,
  };
  const next: GraveyardPair = first
    ? { ...ins, stage: 'mine', theirs: picked, chosen: null, answer: null }
    : { ...ins, stage: 'ask', mine: picked, chosen: null, answer: null };
  return done(state, [event], [next]);
}

/** Step 3: the controller may return the cards chosen; the cards still in a graveyard go to the battlefield under their owners' control. */
function runAsk(state: GameState, res: ResolutionContext, ins: GraveyardPair): StepOutcome {
  const cards = [ins.theirs, ins.mine].filter(
    (id): id is ObjectId => id !== null && state.objects[id]?.zone === 'graveyard',
  );
  if (cards.length === 0) return done(state);
  if (ins.answer === null) {
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'confirmOptional',
        seat: res.controller,
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'pairReturn',
        pair: {
          ...(ins.theirs === null ? {} : { theirs: ins.theirs }),
          ...(ins.mine === null ? {} : { mine: ins.mine }),
        },
      },
    };
  }
  // A declined question drops the instruction (`answerResolutionOptional`), so this one was accepted.
  return {
    ...done(state, [], moveInstructions(cards, 'battlefield', 'top', false, 'owner')),
    performed: 1,
  };
}
