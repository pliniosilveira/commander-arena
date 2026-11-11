/**
 * Cascade (CR 702.85a, D-116, D-120): "When you cast this spell, exile cards from the top of your library until
 * you exile a nonland card whose mana value is less than this spell's mana value. You may cast that card without
 * paying its mana cost if the resulting spell's mana value is less than this spell's mana value. Then put all
 * cards exiled this way that weren't cast on the bottom of your library in a random order."
 *
 * The ability is a triggered ability of the spell (`castSpell` with `self`), found as the spell is cast and put on
 * the stack above it (CR 603.3b); this is its resolution, an instruction in three stages (`Instruction` `cascade`):
 *
 *   start   exile cards from the top of the controller's library, one at a time, until a nonland card with a lower
 *           mana value than the spell's is exiled (the mana value of the spell as it is, or last was: an {X}
 *           counts as announced while the spell is on the stack, CR 202.3e); every card exiled is public
 *           (CR 400.2) and has its own zone change. A library that runs out ends it with nothing found.
 *   ask     when the card found could be cast (a legal target for each of its targets, the additional costs
 *           payable, CR 601.2, 118.9d), the controller is asked (`confirmOptional`, purpose 'cascade', the
 *           card as `subject`). Accepting casts it as CR 608.2g says: the steps of CR 601.2a-i, the spell
 *           becomes the topmost object of the stack, no player receives priority, and this ability goes on
 *           resolving (rules/cascade-cast.ts, `rules/cast.ts`). Declining, or a card that cannot be cast, goes on.
 *   bottom  the cards exiled that were not cast (still in exile) go on the bottom of the library in a random
 *           order from the seeded generator (CR 701.24 style: nobody chooses, nobody sees). The order is not
 *           reported: a `cardsBottomed` event tells how many. A commander card is the exception (CR 903.9b: its
 *           owner may put it into the command zone instead of the library), so it moves as an ordinary move.
 *
 * The resulting spell's mana value is the card's own, less than the spell's, whatever X it had: a card cast
 * without paying its mana cost has X = 0 (CR 107.3b), and the mana value of a card with an {X} in a library
 * counts X as 0 (CR 202.3e), so the second condition of CR 702.85a is the first one again.
 */
import type { ObjectId } from '../ids';
import { shuffle } from '../rng';
import type { GameEvent } from '../state/events';
import { getSeat } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { amountOf, moveInstructions } from './effect-support';
import { canCastDuringResolution } from './legality';
import { manaValueOfCost } from './mana-value';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';
import { isCommanderCard, moveObject } from './zones';

export type CascadeInstruction = Extract<Instruction, { kind: 'cascade' }>;

/** Runs one stage of the cascade resolution. */
export function runCascade(
  state: GameState,
  res: ResolutionContext,
  ins: CascadeInstruction,
): StepOutcome {
  switch (ins.stage) {
    case 'start':
      return exileUntilFound(state, res, ins);
    case 'ask': {
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
          purpose: 'cascade',
          ...(ins.found === null ? {} : { subject: ins.found }),
        },
      };
    }
    case 'bottom':
      return bottomExiled(state, res, ins);
  }
}

/** CR 702.85a: the exile, one card at a time, from the top of the library. */
function exileUntilFound(
  state: GameState,
  res: ResolutionContext,
  ins: CascadeInstruction,
): StepOutcome {
  const seat = res.controller;
  // "This spell's mana value": read from the spell on the stack, or its last-known information (CR 113.7a). Discover has no source spell
  // to stay under (CR 701.57a, D-151): the card found is the first nonland card, with a mana value of N or less when N is given.
  const variant = ins.variant;
  const limit =
    variant === undefined
      ? amountOf(
          state,
          { kind: 'manaValueOf', of: { kind: 'this' } },
          { controller: seat, source: res.source },
          [],
        )
      : Number.POSITIVE_INFINITY;
  let next = state;
  const events: GameEvent[] = [];
  const exiled: ObjectId[] = [...ins.exiled];
  let found: ObjectId | null = null;
  for (;;) {
    const top = getSeat(next, seat).library[0];
    if (top === undefined) break;
    const moved = moveObject(next, { object: top, to: 'exile' });
    if (moved.kind !== 'done' || moved.newObject === null) break;
    next = moved.state;
    events.push(...moved.events);
    exiled.push(moved.newObject);
    const card = next.objects[moved.newObject];
    if (card === undefined) break;
    const d = derive(next, card);
    const value = manaValueOfCost(d.manaCost, card);
    const fits =
      variant === undefined
        ? value < limit
        : variant.foundAtMost === undefined || value <= variant.foundAtMost;
    if (!d.types.includes('land') && fits) {
      found = moved.newObject;
      break;
    }
  }
  // The card found may be cast only when a spell could be put on the stack for it (CR 601.2, 608.2g).
  const found0 = found === null ? undefined : next.objects[found];
  // D-151: a card above the limit for casting (Breaching Dragonstorm: mana value 8 or less) is not offered.
  const castable =
    found !== null &&
    found0 !== undefined &&
    (variant?.castAtMost === undefined ||
      manaValueOfCost(derive(next, found0).manaCost, found0) <= variant.castAtMost) &&
    canCastDuringResolution(next, seat, found0);
  const result = done(next, events, [
    {
      kind: 'cascade',
      stage: castable ? 'ask' : 'bottom',
      exiled,
      // A discovered card that is not cast goes into the hand, so it is kept; Cascade's goes to the bottom with the others.
      found: castable || variant !== undefined ? found : null,
      ...(variant === undefined ? {} : { variant }),
    },
  ]);
  // D-151: "the discovered card" is what `moved` names (nothing when none was found).
  return variant === undefined ? result : { ...result, lastMoved: found === null ? [] : [found] };
}

/** CR 702.85a: the cards that were not cast go on the bottom of the library in a random order. */
function bottomExiled(
  state: GameState,
  res: ResolutionContext,
  ins: CascadeInstruction,
): StepOutcome {
  const seat = res.controller;
  // A card that was cast is a new object on the stack: its exile object is gone, so it is not here.
  const variant = ins.variant;
  // D-151: a card found that was not cast goes into the hand (the others, per `rest`, stay in exile or go to the bottom).
  const toHand =
    variant !== undefined && ins.found !== null && state.objects[ins.found]?.zone === 'exile'
      ? moveInstructions([ins.found], 'hand')
      : [];
  if (variant?.rest === 'stayExiled') return done(state, [], toHand);
  const left = ins.exiled.filter((id) => state.objects[id]?.zone === 'exile' && id !== ins.found);
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
  const events =
    shuffled.length > 0 ? [{ kind: 'cardsBottomed' as const, seat, count: shuffled.length }] : [];
  return done(next, events, [...toHand, ...moveInstructions(commanders, 'library', 'bottom')]);
}
