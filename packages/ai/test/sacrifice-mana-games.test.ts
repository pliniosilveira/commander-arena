// Slice soak (issue 258, D-581 to D-585): whole games with the 'sacrificeMana' deck style (SYNTHETIC cards of the engine fixtures `synthetic-sacrifice-mana.ts`: an artifact that taps and
// sacrifices one or more artifacts to have its controller choose a color and a target player add three mana of it for each artifact sacrificed, a second one that draws a card for
// each, a sorcery that makes three Treasure tokens, an instant that counters an activated ability and an artifact creature) between random agents, with CasualAgent and HeuristicAgent
// in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and, with the
// rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - the Lotus's ability taps it (unless it sacrificed itself) and sacrifices one or more artifacts of the player who activated it, never none (CR 602.2b, 701.21a, 118.3);
//   - the ability uses the stack: no mana is added when it is activated, and the activation is not a mana ability (CR 605.1a);
//   - when it resolves, the target player (not the controller, unless they are the same) gets exactly three mana of the color for each artifact sacrificed, the color chosen by the
//     controller of the ability as it resolves; a countered ability adds nothing (CR 106.4, 608.2d, 701.6);
//   - the Reader's draw is one card for each artifact sacrificed.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
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
import { tokenOrCopyNameOf } from './game-names';
import {
  SACRIFICE_MANA_NAMES,
  SACRIFICE_MANA_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const LOTUS = 'SYNTHETIC Lotus Engine';
const READER = 'SYNTHETIC Lotus Reader';
const HUSH = 'SYNTHETIC Lotus Hush';
const MINT = 'SYNTHETIC Lotus Mint';

interface Tally {
  casts: number;
  lotus: number;
  lotusSacrificed: number;
  lotusSelf: number;
  lotusMana: number;
  lotusToOpponent: number;
  countered: number;
  reader: number;
  readerCards: number;
  mints: number;
  hushes: number;
  byCard: Map<string, number>;
}

const COUNTS = [
  'casts',
  'lotus',
  'lotusSacrificed',
  'lotusSelf',
  'lotusMana',
  'lotusToOpponent',
  'countered',
  'reader',
  'readerCards',
  'mints',
  'hushes',
] as const;

const newTally = (): Tally => ({
  casts: 0,
  lotus: 0,
  lotusSacrificed: 0,
  lotusSelf: 0,
  lotusMana: 0,
  lotusToOpponent: 0,
  countered: 0,
  reader: 0,
  readerCards: 0,
  mints: 0,
  hushes: 0,
  byCard: new Map(),
});

/** An activation on the stack: how many artifacts paid for it, who targets whom, who controls it. */
interface Pending {
  readonly artifacts: number;
  readonly controller: SeatId;
  readonly target: SeatId | null;
  readonly kind: 'lotus' | 'reader';
}

const nameIn = (step: StepInfo, id: string): string => {
  const known = tokenOrCopyNameOf(step.before, id as never);
  return known === '?' ? tokenOrCopyNameOf(step.after, id as never) : known;
};

const typesOf = (state: GameState, id: string): readonly string[] => {
  const obj = state.objects[id as keyof typeof state.objects] ?? state.lki[id as never]?.object;
  if (obj === undefined) return [];
  if (obj.token !== null) return obj.token.characteristics.types;
  const card = obj.card == null ? undefined : state.cards[obj.card];
  return (
    (card === undefined ? undefined : state.definitions[card.definition]?.faces[0])?.types ?? []
  );
};

const manaAdded = (events: readonly GameEvent[]): readonly { seat: SeatId; count: number }[] =>
  events.flatMap((e) => (e.kind === 'manaAdded' ? [{ seat: e.seat, count: e.count }] : []));

function checkAbilities(t: Tally, pending: Map<string, Pending>, step: StepInfo): void {
  const { after, events } = step;
  const sacrificed = events.filter((e) => e.kind === 'sacrificed');
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      if ((SACRIFICE_MANA_NAMES as readonly string[]).includes(name)) t.casts += 1;
      if (name === MINT) t.mints += 1;
      if (name === HUSH) t.hushes += 1;
    }
    if (e.kind === 'abilityActivated') {
      const name = nameIn(step, e.source);
      if (name !== LOTUS && name !== READER) continue;
      const kind = name === LOTUS ? 'lotus' : 'reader';
      if (kind === 'lotus') t.lotus += 1;
      else t.reader += 1;
      // One or more artifacts of the activating player, never none and never anyone else's (CR 602.2b, 701.21a).
      expect(sacrificed.length, `${name} sacrifices one or more artifacts`).toBeGreaterThanOrEqual(
        1,
      );
      for (const s of sacrificed) {
        if (s.kind !== 'sacrificed') continue;
        expect(s.controller, 'the artifacts are the activating player’s').toBe(e.seat);
        expect(typesOf(step.before, s.permanent)).toContain('artifact');
      }
      if (kind === 'lotus') {
        t.lotusSacrificed += sacrificed.length;
        const itself = sacrificed.some((s) => s.kind === 'sacrificed' && s.permanent === e.source);
        if (itself) t.lotusSelf += 1;
        else {
          const lotus = after.objects[e.source];
          if (lotus !== undefined && lotus.zone === 'battlefield') {
            expect(lotus.tapped, 'the Lotus is tapped as part of the cost').toBe(true);
          }
        }
      }
      // A targeted ability is not a mana ability (CR 605.1a): it is on the stack, and nothing was added by activating it.
      expect(e.stackObject, `${name} uses the stack`).not.toBeNull();
      expect(manaAdded(events), 'no mana when it is activated').toEqual([]);
      if (e.stackObject !== null) {
        const obj = after.objects[e.stackObject];
        const chosen = obj?.stack?.chosenTargets ?? [];
        const first = chosen[0];
        const target = first?.kind === 'player' ? first.seat : null;
        expect(target, `${name} targets a player`).not.toBeNull();
        pending.set(e.stackObject, {
          artifacts: sacrificed.length,
          controller: e.seat,
          target,
          kind,
        });
      }
    }
  }
  // The resolution of an activation: the mana (or the cards) is what the count says, for the target; a countered or fizzled ability does nothing.
  for (const e of events) {
    if (e.kind === 'countered' || e.kind === 'fizzled') {
      const p = pending.get(e.object);
      if (p === undefined) continue;
      pending.delete(e.object);
      if (e.kind === 'countered') t.countered += 1;
      expect(manaAdded(events), 'a countered ability adds no mana').toEqual([]);
      continue;
    }
    if (e.kind !== 'resolved') continue;
    const p = pending.get(e.object);
    if (p === undefined) continue;
    pending.delete(e.object);
    if (p.kind === 'lotus') {
      const added = manaAdded(events);
      expect(added, 'one addition of mana').toHaveLength(1);
      const [only] = added;
      expect(only?.seat, 'the mana goes to the target player').toBe(p.target);
      expect(only?.count, 'three mana for each artifact sacrificed').toBe(3 * p.artifacts);
      t.lotusMana += only?.count ?? 0;
      if (p.target !== p.controller) t.lotusToOpponent += 1;
      const chosen = events.find((x) => x.kind === 'optionChosen');
      if (chosen?.kind === 'optionChosen') {
        expect(chosen.seat, 'the controller of the ability chooses the color').toBe(p.controller);
        expect(['white', 'blue', 'black', 'red', 'green']).toContain(chosen.option);
      }
    } else {
      const drawn = events.filter((x) => x.kind === 'cardDrawn' && x.seat === p.target).length;
      // A library may be too short; never more than one card for each artifact (CR 121.1).
      expect(drawn).toBeLessThanOrEqual(p.artifacts);
      t.readerCards += drawn;
    }
  }
}

test(
  `${GAMES} sacrificeMana games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = SACRIFICE_MANA_STYLE_PAIRS[g % SACRIFICE_MANA_STYLE_PAIRS.length] ?? [
        'sacrificeMana',
        'sacrificeMana',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 581000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 581000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 581000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const pending = new Map<string, Pending>();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkAbilities(t, pending, step);
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
      for (const key of COUNTS) total[key] += t[key];
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} sacrificeMana games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    for (const key of COUNTS) {
      // The counterspell and the other player as a target are the rarer paths, and a Lotus that sacrificed itself needs an empty board of artifacts.
      if (key !== 'countered' && key !== 'lotusToOpponent' && key !== 'lotusSelf') {
        expectPath(total[key], key);
      }
    }
    for (const name of [LOTUS, READER, MINT, 'SYNTHETIC Lotus Golem']) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(300_000),
);
