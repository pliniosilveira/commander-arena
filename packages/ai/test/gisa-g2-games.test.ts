// Slice soak (D-464 to D-468): whole games with the 'gisaG2' deck style (SYNTHETIC cards of the engine fixtures `synthetic-gisa-g2.ts`: the lord with ward that costs {2} and 2 life and
// the trigger of a crime that makes two Zombie Rogue tokens once each turn, the creature card that comes back from the graveyard when its controller commits a crime and pays {B}, the
// creature that drains when its controller creates or sacrifices a token, the creature that draws when other creatures die once each turn, the two helpers that commit a crime by an
// ability and by a trigger, a token maker and a sweeper) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no
// rejected action and consistent state after every action; the action log replays to the same final state; and, with the rules read again here from CR 700.13 and the cards' texts (not
// from the engine's own code), at every step:
//   - a crime is committed exactly when a spell is cast or an ability is activated with a target that is an opponent, a permanent, spell or ability an opponent controls or a card in an
//     opponent's graveyard, once for the object (CR 700.13); and a `crimeCommitted` event is never made for any other object;
//   - a Crypt Warlock makes its crime tokens once each turn at most, and its two Zombie Rogues enter tapped (CR 603.2);
//   - a Token Leech that was on the battlefield triggers once for each token its controller creates and once for each token its controller sacrifices (CR 603.2c, 111.2, 701.21);
//   - a Grave Scholar draws once each turn at most, and only when a creature other than itself died in the same step (CR 603.2, 700.4).
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
import { cardNameOf, tokenOrCopyNameOf } from './game-names';
import {
  GISA_G2_NAMES,
  GISA_G2_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const WARLOCK = 'SYNTHETIC Crypt Warlock';
const DIGGER = 'SYNTHETIC Restless Digger';
const LEECH = 'SYNTHETIC Token Leech';
const SCHOLAR = 'SYNTHETIC Grave Scholar';

interface Tally {
  crimes: number;
  crimeTokens: number;
  warlockTriggers: number;
  leechTriggers: number;
  scholarTriggers: number;
  diggerReturns: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  crimes: 0,
  crimeTokens: 0,
  warlockTriggers: 0,
  leechTriggers: 0,
  scholarTriggers: 0,
  diggerReturns: 0,
  byCard: new Map(),
});

/** CR 700.13, read again from the targets of the object: an opponent, what an opponent controls, or a card in an opponent's graveyard. */
function isCrime(state: GameState, stackObject: ObjectId, seat: SeatId): boolean {
  const targets = state.objects[stackObject]?.stack?.chosenTargets ?? [];
  return targets.some((t) => {
    if (t.kind === 'player') return t.seat !== seat;
    const obj = state.objects[t.id] ?? state.lki[t.id]?.object;
    if (obj === undefined) return false;
    if (obj.zone === 'battlefield' || obj.zone === 'stack') return obj.controller !== seat;
    if (obj.zone === 'graveyard') return obj.owner !== seat;
    return false;
  });
}

function checkRules(
  t: Tally,
  step: StepInfo,
  memory: {
    warlock: Set<string>;
    scholar: Set<string>;
    died: Map<number, Set<ObjectId>>;
    owed: Map<ObjectId, number>;
  },
): void {
  const { before, after, events } = step;
  const turn = before.turn.number;
  // The creatures that died this turn: the trigger goes on the stack the next time a player would get priority, which can be in the step after the death.
  const died = memory.died.get(turn) ?? new Set<ObjectId>();
  memory.died.set(turn, died);
  for (const e of events) if (e.kind === 'died') died.add(e.object);
  const crimeObjects = new Set<ObjectId>();
  for (const e of events) {
    if (e.kind === 'crimeCommitted') {
      t.crimes += 1;
      expect(crimeObjects.has(e.object), 'one crime for the spell or ability').toBe(false);
      crimeObjects.add(e.object);
      expect(isCrime(after, e.object, e.seat), 'a crime has an opposing target (CR 700.13)').toBe(
        true,
      );
    }
  }
  for (const e of events) {
    // A spell cast or an ability activated: the crime is made with it, never without one, never for a spell with no such target.
    if (e.kind === 'spellCast' || e.kind === 'abilityActivated') {
      const object = e.kind === 'spellCast' ? e.object : e.stackObject;
      if (object !== null) {
        expect(crimeObjects.has(object), 'a crime exactly when a target opposes (CR 700.13)').toBe(
          isCrime(after, object, e.seat),
        );
      }
    }
    if (e.kind === 'abilityTriggered') {
      const chosen = after.objects[e.stackObject]?.stack?.chosenTargets ?? [];
      if (chosen.length > 0) {
        expect(crimeObjects.has(e.stackObject), 'a trigger with a target that opposes').toBe(
          isCrime(after, e.stackObject, e.seat),
        );
      }
      const name = cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if (name === WARLOCK && e.abilityIndex === 3) {
        t.warlockTriggers += 1;
        const key = `${turn}:${e.source}`;
        expect(memory.warlock.has(key), 'a Crypt Warlock triggers once each turn (CR 603.2)').toBe(
          false,
        );
        memory.warlock.add(key);
      }
      if (name === SCHOLAR) {
        t.scholarTriggers += 1;
        const key = `${turn}:${e.source}`;
        expect(memory.scholar.has(key), 'a Grave Scholar triggers once each turn').toBe(false);
        memory.scholar.add(key);
        expect(
          [...died].some((id) => id !== e.source),
          'another creature died this turn',
        ).toBe(true);
      }
    }
    if (e.kind === 'tokenCreated' && e.name === 'Zombie Rogue') {
      t.crimeTokens += 1;
      expect(after.objects[e.object]?.tapped, 'the Zombie Rogues enter tapped').toBe(true);
    }
    if (e.kind === 'spellCast' || e.kind === 'abilityActivated') {
      const name =
        e.kind === 'spellCast' ? tokenOrCopyNameOf(after, e.object) : cardNameOf(before, e.source);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    if (
      e.kind === 'zoneChanged' &&
      e.fromZone === 'graveyard' &&
      e.toZone === 'battlefield' &&
      cardNameOf(after, e.to) === DIGGER
    ) {
      t.diggerReturns += 1;
    }
  }
  // A Token Leech that stays on the battlefield triggers for each token its controller creates or sacrifices. The trigger goes on the stack the next time a player would receive
  // priority (CR 603.3), which can be in a later step than the token, so the count owed is settled once no trigger waits.
  for (const seat of [0, 1] as const) {
    const created = events.filter((e) => e.kind === 'tokenCreated' && e.seat === seat).length;
    const sacrificed = events.filter(
      (e) =>
        e.kind === 'sacrificed' &&
        e.controller === seat &&
        (before.objects[e.permanent]?.token ?? null) !== null,
    ).length;
    for (const id of before.battlefield) {
      if (cardNameOf(before, id) !== LEECH || before.objects[id]?.controller !== seat) continue;
      if (!after.battlefield.includes(id)) {
        memory.owed.delete(id);
        continue;
      }
      const triggered = events.filter((e) => e.kind === 'abilityTriggered' && e.source === id);
      t.leechTriggers += triggered.length;
      const owed = (memory.owed.get(id) ?? 0) + created + sacrificed - triggered.length;
      expect(
        owed,
        'a Token Leech triggers only for a token created or sacrificed',
      ).toBeGreaterThanOrEqual(0);
      memory.owed.set(id, owed);
    }
  }
  if (after.pendingTriggers.length === 0 && after.triggering === null) {
    for (const [id, owed] of memory.owed) {
      if (after.battlefield.includes(id)) {
        expect(owed, 'a Token Leech triggered for every token created or sacrificed').toBe(0);
      }
    }
  }
}

test(
  `${GAMES} gisaG2 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = GISA_G2_STYLE_PAIRS[g % GISA_G2_STYLE_PAIRS.length] ?? ['gisaG2', 'gisaG2'];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 241000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 241000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 241000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory = {
        warlock: new Set<string>(),
        scholar: new Set<string>(),
        died: new Map<number, Set<ObjectId>>(),
        owed: new Map<ObjectId, number>(),
      };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step, memory);
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
        'crimes',
        'crimeTokens',
        'warlockTriggers',
        'leechTriggers',
        'scholarTriggers',
        'diggerReturns',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} gisaG2 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.crimes, 'a crime');
    expectPath(total.crimeTokens, 'the tokens of a Crypt Warlock');
    expectPath(total.leechTriggers, 'a Token Leech trigger');
    expectPath(total.scholarTriggers, 'a Grave Scholar trigger');
    for (const name of GISA_G2_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
  },
  soakTimeout(600_000),
);
