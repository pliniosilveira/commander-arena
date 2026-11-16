// Slice soak (D-1510 to D-1518): whole games with the 'hyldaG2' deck style (SYNTHETIC cards of the engine fixtures `synthetic-hylda-g2.ts`: the sorcery that taps all the creatures of a
// chosen player and keeps them tapped, the creature that taps those of an opponent as it enters, the instant for up to two creatures with spell mastery, the X instant with ferocious, the
// creature that does it when its controller casts an instant or sorcery, the Aura that taps its creature at every upkeep, the d20 table, the creature with "choose up to one", the siege that
// asks for Khans or Dragons as it enters, the creature with four card types in the graveyard, and the artifact that taps a creature for less during its controller's turn) between random
// agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log
// replays to the same final state; and, with the rules read again here from CR 502.3, CR 614.12 and the cards' texts (not from the engine's own code), at every step:
//   - when a untap step begins, a tapped permanent of its active player that an effect "doesn't untap during its controller's next untap step" kept stays tapped and is not untapped, the
//     effect is over for it as the step ends, and the effect of the permanents of other players goes on (CR 502.3, 611.2a);
//   - a creature that enters while "creatures your opponents control enter tapped" is on, under the control of an opponent of the player who made the effect, is tapped (CR 614.12);
//   - a Drowsy Aura triggers at the beginning of each upkeep exactly when the creature it enchants is untapped then (CR 603.4);
//   - a Ghost Sentinel triggers at an opponent's upkeep only with four or more card types among the cards of its controller's graveyard (CR 603.4, 205.2a);
//   - a Dawn Siege triggers only the ability of the option it has chosen (CR 607.2d), and the Dragons one only in the beginning of combat of an opponent.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  type ObjectId,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { cardNameOf, faceOf, tokenOrCopyNameOf } from './game-names';
import {
  HYLDA_G2_NAMES,
  HYLDA_G2_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const AURA = 'SYNTHETIC Drowsy Aura';
const SENTINEL = 'SYNTHETIC Ghost Sentinel';
const SIEGE = 'SYNTHETIC Dawn Siege';

interface Tally {
  keptThroughStep: number;
  letGo: number;
  enteredTapped: number;
  auraTriggers: number;
  sentinelDelirium: number;
  siegeKhans: number;
  siegeDragons: number;
  noModeChosen: number;
  modesChosen: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  keptThroughStep: 0,
  letGo: 0,
  enteredTapped: 0,
  auraTriggers: 0,
  sentinelDelirium: 0,
  siegeKhans: 0,
  siegeDragons: 0,
  noModeChosen: 0,
  modesChosen: 0,
  byCard: new Map(),
});

/** The card types of the cards in the graveyard of `seat`, read from the printed faces. */
function graveyardTypes(state: GameState, seat: SeatId): Set<string> {
  const types = new Set<string>();
  const graveyard = state.seats[seat]?.graveyard ?? [];
  for (const id of graveyard) {
    for (const type of faceOf(state, id)?.types ?? []) types.add(type);
  }
  return types;
}

const isCreature = (state: GameState, id: ObjectId): boolean => {
  const obj = state.objects[id];
  if (obj === undefined) return false;
  if (obj.token !== null) return obj.token.characteristics.types.includes('creature');
  return faceOf(state, id)?.types.includes('creature') ?? false;
};

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  // CR 502.3, 611.2a: the untap step of the active player.
  const untap = events.find((e) => e.kind === 'stepBegan' && e.step === 'untap');
  if (untap?.kind === 'stepBegan') {
    const active = untap.seat;
    const untapped = new Set(
      events.flatMap((e) => (e.kind === 'untapped' ? [e.object as ObjectId] : [])),
    );
    for (const effect of before.continuousEffects) {
      if (effect.until !== 'nextUntapStep') continue;
      for (const id of effect.objects) {
        const obj = before.objects[id];
        if (obj === undefined || obj.zone !== 'battlefield') continue;
        const controller = (after.objects[id] ?? obj).controller;
        const stillThere = after.continuousEffects.some(
          (e) => e.until === 'nextUntapStep' && e.objects.includes(id),
        );
        if (controller === active && obj.controller === active) {
          if (obj.tapped) {
            t.keptThroughStep += 1;
            expect(untapped.has(id), 'a permanent kept from untapping is not untapped').toBe(false);
            expect(after.objects[id]?.tapped, 'and it stays tapped').toBe(true);
          }
          expect(stillThere, 'the effect is over for it as its untap step ends').toBe(false);
          t.letGo += 1;
        } else if (obj.controller !== active) {
          expect(stillThere, 'the effect of the permanents of the others goes on').toBe(true);
        }
      }
    }
  }
  // CR 614.12: a permanent that enters under an effect "creatures your opponents control enter tapped".
  const effects = before.continuousEffects.filter((e) => e.change.kind === 'entersTapped');
  if (effects.length > 0) {
    for (const e of events) {
      const entered =
        e.kind === 'zoneChanged' && e.toZone === 'battlefield'
          ? e.to
          : e.kind === 'tokenCreated'
            ? e.object
            : null;
      if (entered === null || !isCreature(after, entered)) continue;
      const obj = after.objects[entered];
      if (obj === undefined || obj.zone !== 'battlefield') continue;
      for (const effect of effects) {
        if (effect.change.kind !== 'entersTapped') continue;
        if (obj.controller !== effect.change.controller) {
          t.enteredTapped += 1;
          expect(obj.tapped, 'a creature of an opponent enters tapped (CR 614.12)').toBe(true);
        }
      }
    }
  }
  // CR 603.4: the Aura and the Sentinel at the beginning of an upkeep.
  // With two triggers of one player the order is asked first, and the triggers go on the stack with the answer (CR 603.3b): that step is checked then.
  const asksOrder = after.pending?.kind === 'orderTriggers' || after.pending?.kind === 'targets';
  const upkeep = events.find((e) => e.kind === 'stepBegan' && e.step === 'upkeep');
  if (upkeep?.kind === 'stepBegan' && !asksOrder) {
    const active = upkeep.seat;
    for (const id of after.battlefield) {
      const name = cardNameOf(after, id);
      const obj = after.objects[id];
      if (obj === undefined) continue;
      if (name === AURA) {
        const host = obj.attachedTo === null ? undefined : after.objects[obj.attachedTo];
        const triggered = events.some((e) => e.kind === 'abilityTriggered' && e.source === id);
        expect(triggered, 'an Aura triggers at each upkeep if its creature is untapped').toBe(
          host !== undefined && !host.tapped,
        );
      }
      if (name === SENTINEL && obj.controller !== active) {
        const delirium = graveyardTypes(after, obj.controller).size >= 4;
        const targets = after.battlefield.some(
          (other) =>
            other !== id && after.objects[other]?.controller === active && isCreature(after, other),
        );
        const triggered = events.some(
          (e) => e.kind === 'abilityTriggered' && e.source === id && e.abilityIndex === 2,
        );
        expect(triggered, 'a Sentinel triggers with four card types and a creature to tap').toBe(
          delirium && targets,
        );
      }
    }
  }
  for (const e of events) {
    if (e.kind === 'abilityTriggered') {
      const name = cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      const obj = after.objects[e.source] ?? before.objects[e.source];
      if (name === AURA) t.auraTriggers += 1;
      if (name === SENTINEL && e.abilityIndex === 2) {
        t.sentinelDelirium += 1;
        expect(graveyardTypes(after, obj?.controller ?? 0).size).toBeGreaterThanOrEqual(4);
      }
      if (name === SIEGE && obj !== undefined) {
        const option = obj.chosen?.option;
        if (e.abilityIndex === 1) {
          t.siegeKhans += 1;
          expect(option, 'Khans').toBe('Khans');
          expect(before.turn.activeSeat, 'on the turn of its controller').toBe(obj.controller);
        }
        if (e.abilityIndex === 2) {
          t.siegeDragons += 1;
          expect(option, 'Dragons').toBe('Dragons');
          expect(before.turn.activeSeat, 'on the turn of an opponent').not.toBe(obj.controller);
        }
      }
    }
    if (e.kind === 'abilityRemoved' && e.reason === 'noModeChosen') t.noModeChosen += 1;
    if (e.kind === 'modesChosen') t.modesChosen += 1;
    if (e.kind === 'spellCast' || e.kind === 'abilityActivated') {
      const name =
        e.kind === 'spellCast' ? tokenOrCopyNameOf(after, e.object) : cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
  }
}

test(
  `${GAMES} hyldaG2 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = HYLDA_G2_STYLE_PAIRS[g % HYLDA_G2_STYLE_PAIRS.length] ?? [
        'hyldaG2',
        'hyldaG2',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 251000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 251000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 251000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        if (step.index % 97 === 0) {
          const listed = getLegalActions(step.before, step.seat);
          expect(
            listed.some((a) => JSON.stringify(a) === JSON.stringify(step.action)) ||
              applyAction(step.before, step.seat, step.action).ok,
          ).toBe(true);
        }
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      for (const key of [
        'keptThroughStep',
        'letGo',
        'enteredTapped',
        'auraTriggers',
        'sentinelDelirium',
        'siegeKhans',
        'siegeDragons',
        'noModeChosen',
        'modesChosen',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} hyldaG2 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.keptThroughStep, 'a permanent kept tapped through its untap step');
    expectPath(total.letGo, 'an effect that ends at its untap step');
    expectPath(total.auraTriggers, 'a Drowsy Aura trigger');
    for (const name of HYLDA_G2_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(600_000),
);
