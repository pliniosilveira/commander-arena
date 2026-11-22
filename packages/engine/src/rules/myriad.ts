/**
 * Myriad (CR 702.116a, 508.4, 111.2): "Whenever this creature attacks, for each opponent other than defending player, you may create a token that's a copy of this creature that's
 * tapped and attacking that player or a planeswalker they control. If one or more tokens are created this way, exile the tokens at end of combat."
 *
 * The effect the keyword stands for (`rules/derive-keywords.ts`) has two forms. Without `opponent` it asks the controller, for each opponent still in the game other than the
 * defending player (in turn order, the order the opponents are named in), whether to create the token: a `mayEffect` instruction for each, so each is answered on its own. With
 * `opponent` it is what an accepted answer runs: the copy is made through the shared token pipeline (`makeSettled`, D-221, so replacement effects apply and a question the copy asks
 * as it enters is asked), enters tapped and attacking that opponent (never declared as an attacker, CR 508.4: it triggers nothing that an attack triggers), and the controller chooses
 * whether it attacks the player or a planeswalker they control (a `reselectAttack` instruction, nothing asked when there is no planeswalker). A delayed triggered ability exiles it as
 * the combat ends (CR 603.7); the copy that has gone by then is not exiled twice.
 */
import type { Effect } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameState, ResolutionContext, TriggeredAbility } from '../state/types';
import { enterCombatAttacking } from './combat-enter';
import { copiableValues } from './copiable';
import { asking } from './damage-effects';
import type { OrderFlow } from './damage-order';
import { defendingPlayerOf } from './defending';
import { prepareCardOf } from './prepare';
import { done, type StepOutcome } from './step-outcome';
import { makeSettled } from './token-batch';

type Myriad = Extract<Effect, { kind: 'myriad' }>;

const EXILE_AT_END_OF_COMBAT: TriggeredAbility = {
  kind: 'triggered',
  trigger: { kind: 'step', step: 'combatEnd', whose: 'each' },
  effect: { kind: 'exile', objects: { kind: 'this' } },
};

/** `opponents`: the opponents of the controller still in the game, in turn order. */
export function runMyriad(
  state: GameState,
  res: ResolutionContext,
  effect: Myriad,
  opponents: readonly SeatId[],
  flow: OrderFlow,
): StepOutcome {
  if (state.combat === null) return done(state);
  if (effect.opponent === undefined) {
    const defending = defendingPlayerOf(state, res.source);
    return done(
      state,
      [],
      opponents
        .filter((seat) => seat !== defending)
        .map((opponent) => ({
          kind: 'mayEffect' as const,
          effect: { kind: 'myriad' as const, opponent },
          answer: null,
        })),
    );
  }
  const { opponent } = effect;
  if (!opponents.includes(opponent)) return done(state);
  // The creature as it is, or as it last was when it has left the battlefield already (CR 608.2h).
  const original = state.objects[res.source] ?? state.lki[res.source]?.object;
  if (original === undefined) return done(state);
  const values = copiableValues(state, original);
  const prepareOf = prepareCardOf(state, original); // CR 722.2b (D-225)
  const made = makeSettled(
    state,
    res,
    res.controller,
    [
      {
        definition: {
          ...values.characteristics,
          abilities: values.abilities,
          ...(prepareOf === null ? {} : { prepareOf }),
          ...(values.doors === undefined ? {} : { doors: values.doors }),
        },
        count: 1,
        original: true,
      },
    ],
    true,
    flow,
  );
  if (made.kind === 'asked') return asking(state, made);
  const attacking = enterCombatAttacking(made.state, made.created, opponent);
  const next: GameState = {
    ...attacking,
    delayedTriggers: [
      ...attacking.delayedTriggers,
      ...made.created
        .filter((id) => attacking.objects[id]?.zone === 'battlefield')
        .map((source) => ({
          source,
          controller: res.controller,
          ability: EXILE_AT_END_OF_COMBAT,
        })),
    ],
  };
  return {
    ...done(next, made.events, [
      ...made.front,
      ...made.created
        .filter((id) => attacking.combat?.attackers.some((a) => a.object === id) === true)
        .map((object) => ({
          kind: 'reselectAttack' as const,
          object,
          chosen: null,
          among: opponent,
        })),
    ]),
    lastMoved: made.created,
  };
}
