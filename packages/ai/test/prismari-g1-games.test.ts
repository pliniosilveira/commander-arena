// Slice soak (issue 87, D-625 to D-632): whole games with the 'prismariG1' deck style (SYNTHETIC cards of the engine fixtures `synthetic-prismari-g1.ts`: the creature that makes a Myr
// token and has the other tokens become copies of one it chooses, the creature that populates and sacrifices the token at the end step, the creature that makes tapped and attacking copies
// of its tokens, the creature that makes X copies of a creature and exiles them at the end step, the kicker spell, the strive spell with any number of targets, the creature that becomes a
// copy with myriad, the two prepared creatures and the spells and token makers that feed them) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game
// finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and, with the rules read again here
// from CR 701.36a (Populate), 111.10 and 707.2 (copies of tokens), 508.4 (tapped and attacking), 603.7 (delayed triggered abilities), 702.33 (Kicker) and the cards' texts (not from the
// engine's own code), at every step:
//   - the tokens made when an ability or spell of the Iteration Engine, Storm Singer, Flame Dancer or Twin Blaze resolves are gone from the battlefield once that turn is over
//     (the delayed sacrifice or exile of "the next end step", CR 603.7);
//   - the copies a Storm Singer makes enter tapped and attacking (CR 508.4);
//   - a Replication Rite makes one token, or five when it was kicked (CR 702.33a), unless it was countered or had no legal target;
//   - a Flame Dancer makes X tokens, X being one plus the instant and sorcery spells its controller cast that turn;
//   - a populate makes at most one token, and a token that is a copy of a creature token the controller controls (CR 701.36a).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  getView,
  type ObjectId,
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
import { tokenOrCopyNameOf } from './game-names';
import { PRISMARI_G1_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const ENGINE = 'SYNTHETIC Iteration Engine';
const SINGER = 'SYNTHETIC Storm Singer';
const DANCER = 'SYNTHETIC Flame Dancer';
const RITE = 'SYNTHETIC Replication Rite';
const BLAZE = 'SYNTHETIC Twin Blaze';
const TEMPORARY = new Set([ENGINE, SINGER, DANCER, BLAZE]);

interface Tally {
  temporaryTokens: number;
  attackingCopies: number;
  populates: number;
  populateChoices: number;
  riteKicked: number;
  riteTokens: number;
  dancerTokens: number;
  blazeTokens: number;
  blazeMultiTarget: number;
  prepared: number;
}

const newTally = (): Tally => ({
  temporaryTokens: 0,
  attackingCopies: 0,
  populates: 0,
  populateChoices: 0,
  riteKicked: 0,
  riteTokens: 0,
  dancerTokens: 0,
  blazeTokens: 0,
  blazeMultiTarget: 0,
  prepared: 0,
});

interface Memory {
  /** The name of the card behind each triggered ability on the stack. */
  triggers: Map<ObjectId, string>;
  /** The spells on the stack: the card, whether it was kicked and how many targets it was cast with. */
  spells: Map<ObjectId, { name: string; kicked: boolean; targets: number }>;
  /** The tokens made by a temporary maker, and the turn they were made. */
  temporary: Map<ObjectId, number>;
  /** The instants and sorceries each seat cast in a turn. */
  castThisTurn: Map<string, number>;
}

/** Whether the spell just cast is an instant or a sorcery, read from the spell on the stack as the player sees it (the half of a prepared card included, CR 722.3c). */
const isInstantOrSorcery = (state: GameState, seat: number, id: ObjectId): boolean => {
  const spell = getView(state, seat).stack.find((o) => o.id === id);
  const types = spell?.types ?? [];
  return types.includes('instant') || types.includes('sorcery');
};

const nameIn = (step: StepInfo, id: ObjectId): string => {
  const known = tokenOrCopyNameOf(step.before, id);
  return known === '?' ? tokenOrCopyNameOf(step.after, id) : known;
};

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, events } = step;
  const turn = before.turn.number;
  // A turn that is over: the tokens of a temporary maker are gone (CR 603.7, the delayed sacrifice or exile of the next end step).
  for (const [id, madeIn] of memory.temporary) {
    if (after.turn.number > madeIn) {
      expect(
        after.objects[id]?.zone === 'battlefield',
        `token ${id} is gone after turn ${madeIn}`,
      ).toBe(false);
      memory.temporary.delete(id);
    }
  }
  for (const e of events) {
    if (e.kind === 'abilityTriggered') memory.triggers.set(e.stackObject, nameIn(step, e.source));
    if (e.kind === 'spellCast') {
      memory.spells.set(e.object, {
        name: nameIn(step, e.object),
        kicked: e.kicked === true,
        targets: e.targetCount,
      });
      if (isInstantOrSorcery(after, e.seat, e.object)) {
        const key = `${turn}:${e.seat}`;
        memory.castThisTurn.set(key, (memory.castThisTurn.get(key) ?? 0) + 1);
      }
      if (nameIn(step, e.object) === RITE && e.kicked === true) t.riteKicked += 1;
      if (nameIn(step, e.object) === BLAZE && e.targetCount > 1) t.blazeMultiTarget += 1;
    }
    if (e.kind === 'prepared') t.prepared += 1;
  }
  // What resolved in this step: the ability or spell, and the tokens it made.
  const resolved = events.flatMap((e) => (e.kind === 'resolved' ? [e.object] : []));
  const fizzled = events.some((e) => e.kind === 'fizzled' || e.kind === 'countered');
  const created = events.flatMap((e) =>
    e.kind === 'tokenCreated' ? [{ id: e.object, seat: e.seat }] : [],
  );
  for (const id of resolved) {
    const trigger = memory.triggers.get(id);
    const spell = memory.spells.get(id);
    const name = trigger ?? spell?.name;
    if (name === undefined) continue;
    if (TEMPORARY.has(name)) {
      for (const made of created) memory.temporary.set(made.id, turn);
      t.temporaryTokens += created.length;
    }
    if (name === SINGER) {
      for (const made of created) {
        // CR 508.4: tapped and attacking (a token that left the battlefield already is skipped).
        const obj = after.objects[made.id];
        if (obj === undefined || obj.zone !== 'battlefield') continue;
        expect(obj.tapped, 'a copy of a Storm Singer enters tapped').toBe(true);
        expect(
          after.combat?.attackers.some((a) => a.object === made.id),
          'and attacking',
        ).toBe(true);
        t.attackingCopies += 1;
      }
    }
    if (name === RITE && spell !== undefined) {
      t.riteTokens += created.length;
      // CR 702.33a: the kicker makes five copies instead of one; with no legal target nothing is made.
      if (!fizzled)
        expect(created.length, 'one token, or five when kicked').toBe(spell.kicked ? 5 : 1);
      else expect(created.length).toBe(0);
    }
    if (name === DANCER && trigger !== undefined) {
      t.dancerTokens += created.length;
      const seat = created[0]?.seat;
      if (seat !== undefined) {
        const cast = memory.castThisTurn.get(`${turn}:${seat}`) ?? 0;
        expect(created.length, 'X tokens: one plus the instants and sorceries cast this turn').toBe(
          1 + cast,
        );
      }
    }
    if (name === BLAZE && spell !== undefined) {
      t.blazeTokens += created.length;
      if (!fizzled)
        expect(created.length, 'a copy for each target that is still legal').toBeLessThanOrEqual(
          spell.targets,
        );
    }
    if (name === ENGINE) {
      // CR 701.36a: one token at most, whatever the number of creature tokens the controller has.
      expect(created.length).toBeLessThanOrEqual(1);
      if (created.length === 1) t.populates += 1;
    }
  }
}

test(
  `${GAMES} prismariG1 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = PRISMARI_G1_STYLE_PAIRS[g % PRISMARI_G1_STYLE_PAIRS.length] ?? [
        'prismariG1',
        'prismariG1',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 262000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 262000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 262000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory: Memory = {
        triggers: new Map(),
        spells: new Map(),
        temporary: new Map(),
        castThisTurn: new Map(),
      };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        const pending = step.before.pending;
        if (pending?.kind === 'choosePermanent' && pending.purpose === 'populate') {
          t.populateChoices += 1;
          const picked = step.action.kind === 'choosePermanents' ? step.action.objects : [];
          for (const id of picked)
            expect(pending.legal.includes(id), 'the token copied is one of the legal ones').toBe(
              true,
            );
        }
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
      for (const key of Object.keys(total) as (keyof Tally)[]) total[key] += t[key];
    }
    console.log(`${GAMES} prismariG1 games: ${JSON.stringify(total)}`);
    expectPath(total.temporaryTokens, 'tokens made to be sacrificed or exiled at the end step');
    expectPath(total.populates, 'a populate that made a token');
    expectPath(total.prepared, 'a creature that became prepared');
  },
  soakTimeout(600_000),
);
