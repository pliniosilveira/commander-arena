// Slice soak (D-192): whole games with the SYNTHETIC Ancient Adamantoise, which redirects all damage to its controller and their other permanents to itself
// and keeps its damage through cleanup steps (CR 614.9, 514.2), played two ways. (1) Games begun at the question that a redirection and a prevention shield
// make (CR 616.1: the player chooses the order), built with the scenario DSL, between every kind of agent: a shield for the player and 3 damage to them, combat damage
// at a player with a shield, two Adamantoises and a bolt, a shield on the player and one on the Adamantoise. (2) Games of the 'adamantoise' deck style between
// random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action
// log replays to the same final state; and the rules of the slice are restated from the events and the state, apart from the engine: a redirection ends on a
// creature that is on the battlefield and has the same controller as what it redirected from, the damage on an Adamantoise never goes down while it stays on the
// battlefield (apart from regeneration, which the pool has none of), a question that has a redirection among its choices goes to the controller of the recipient and
// is answered with one of its options (the first, prevention, for a casual or greedy agent), and what each choice leads to never exceeds what is left of the damage.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  type Action,
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import {
  ADAMANTOISE_NAMES,
  ADAMANTOISE_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };
const TOISE = 'SYNTHETIC Ancient Adamantoise';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

/** Seat 1 holds the Adamantoise and casts `casts` in seat 0's main phase; seat 0 has `board0` and `hand0`. */
function opening(
  board1: readonly string[],
  casts: readonly (readonly [string, 'you' | 'toise' | 'none'])[],
  hand0: readonly string[],
  board0: readonly string[],
) {
  const g = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield('Mountain', 'Mountain', 'Mountain', ...board0)
    .hand(...hand0)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...board1, ...casts.flatMap(() => ['Plains', 'Plains']))
    .hand(...casts.map(([card]) => card))
    .at('precombatMain', { active: 0, priority: 1 })
    .build();
  for (const [card, at] of casts) {
    if (g.state.pending?.kind === 'priority' && g.deciding !== 1 && g.state.stack.length === 0) {
      g.pass();
    }
    const targets =
      at === 'you'
        ? [{ player: 1 } as const]
        : at === 'toise'
          ? [{ name: TOISE, seat: 1 as const, nth: 0 }]
          : undefined;
    g.act(1).cast(`${card}[0]`, {
      pay: true,
      ...(targets === undefined ? {} : { targets }),
    });
    g.passAll();
  }
  return g;
}

/**
 * The state a game starts from, by variant: the question is asked at once. Seat 1 has a shield for 3 on itself and casts 3 damage on itself; combat damage
 * at seat 1 with a shield of 3 on it; two Adamantoises and a bolt at seat 1; a shield on seat 1 and one on the Adamantoise, and a bolt.
 */
function startState(variant: number): GameState {
  const kind = variant % 4;
  if (kind === 0) {
    const g = opening(
      [TOISE],
      [
        ['SYNTHETIC Brace Three', 'none'],
        ['SYNTHETIC Backdraft', 'none'],
      ],
      [],
      [],
    );
    return g.state;
  }
  if (kind === 1) {
    const g = opening(
      [TOISE],
      [['SYNTHETIC Shield Three', 'you']],
      [],
      ['SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2'],
    );
    g.advanceTo('declareAttackers');
    g.act(0).attack(['SYNTHETIC Vanilla 3/3', 'SYNTHETIC Vanilla 2/2']);
    g.advanceTo('combatDamage');
    return g.state;
  }
  if (kind === 2) {
    const g = opening([TOISE, TOISE], [], ['Lightning Bolt'], []);
    if (g.deciding !== 0) g.pass();
    g.act(0).cast('Lightning Bolt', { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    return g.state;
  }
  const g = opening(
    [TOISE],
    [
      ['SYNTHETIC Shield Three', 'you'],
      ['SYNTHETIC Shield Five', 'toise'],
    ],
    ['Lightning Bolt'],
    [],
  );
  if (g.deciding !== 0) g.pass();
  g.act(0).cast('Lightning Bolt', { pay: true, targets: [{ player: 1 }] });
  g.passAll();
  return g.state;
}

type Kind = 'random' | 'casual' | 'greedy' | 'heuristic';
const KINDS: readonly Kind[] = ['random', 'casual', 'greedy', 'heuristic'];

function make(kind: Kind, seed: number): Agent & { fallbacks: readonly unknown[] } {
  return kind === 'casual'
    ? new CasualAgent({ seed })
    : kind === 'greedy'
      ? new GreedyAgent({ seed })
      : kind === 'heuristic'
        ? new HeuristicAgent({ seed })
        : new RandomLegalAgent({ seed });
}

interface Tally {
  redirects: number;
  asked: number;
  askedWithRedirect: number;
  answeredByOptions: number;
  damageStayed: number;
  toiseDied: number;
}

const newTally = (): Tally => ({
  redirects: 0,
  asked: 0,
  askedWithRedirect: 0,
  answeredByOptions: 0,
  damageStayed: 0,
  toiseDied: 0,
});

function nameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  if (obj === undefined) return state.lki[id]?.characteristics.name ?? '?';
  if (obj.token !== null) return obj.token.characteristics.name;
  const card = obj.card == null ? undefined : state.cards[obj.card];
  return card === undefined
    ? '?'
    : (state.definitions[card.definition]?.faces[obj.face ?? 0]?.name ?? '?');
}

/** The controller of the recipient of damage, whether a player or a permanent. */
function controllerOfRecipient(
  state: GameState,
  to: Extract<GameEvent, { kind: 'damageRedirected' }>['to'],
): number | undefined {
  return to.kind === 'player' ? to.seat : state.objects[to.id]?.controller;
}

function checkRules(t: Tally, kinds: readonly [Kind, Kind] | null, step: StepInfo): void {
  const { before, after, events } = step;

  // A redirection ends on a creature of the controller of what it redirected from, on the battlefield, with damage that did not go to the player.
  for (const e of events) {
    if (e.kind !== 'damageRedirected') continue;
    t.redirects += 1;
    expect(e.amount).toBeGreaterThan(0);
    expect(e.to.kind).toBe('object');
    expect(e.from).not.toEqual(e.to);
    if (e.to.kind !== 'object') continue;
    expect(nameOf(after, e.to.id)).toBe(TOISE);
    expect(
      after.objects[e.to.id]?.zone === 'battlefield' ||
        before.objects[e.to.id]?.zone === 'battlefield',
    ).toBe(true);
    expect(controllerOfRecipient(before, e.to)).toBe(controllerOfRecipient(before, e.from));
  }

  // The damage on an Adamantoise never goes down while it stays on the battlefield (CR 514.2: it is not removed during cleanup steps).
  for (const id of before.battlefield) {
    const was = before.objects[id];
    const now = after.objects[id];
    if (was === undefined || now === undefined || now.zone !== 'battlefield') continue;
    if (nameOf(before, id) !== TOISE || now.zone !== was.zone) continue;
    expect(now.damage, 'the damage on the Adamantoise went down').toBeGreaterThanOrEqual(
      was.damage,
    );
    if (events.some((e) => e.kind === 'turnBegan') && was.damage > 0) t.damageStayed += 1;
  }
  for (const e of events) {
    if (e.kind === 'zoneChanged' && e.fromZone === 'battlefield' && e.toZone === 'graveyard') {
      if (nameOf(before, e.from as ObjectId) === TOISE) t.toiseDied += 1;
    }
  }

  // The question of the order, when it has a redirection among its choices.
  const asked = before.pending;
  if (asked?.kind !== 'chooseOption' || asked.purpose !== 'replacement') return;
  const q = asked.replacement;
  if (q?.event === undefined) throw new Error('a replacement question without its words');
  t.asked += 1;
  const to = q.event.to;
  expect(asked.seat).toBe(to.kind === 'player' ? to.seat : before.objects[to.id]?.controller);
  expect(step.seat).toBe(asked.seat);
  expect(q.choices.map((c) => c.option)).toEqual(asked.options);
  expect(asked.options.length).toBeGreaterThanOrEqual(2);
  const redirects = q.choices.filter((c) => c.kind === 'redirect');
  for (const c of q.choices) {
    if (c.kind === 'redirect') {
      expect(c.text.startsWith('Deal it to ')).toBe(true);
      expect(c.option.startsWith('redirect:')).toBe(true);
      expect(c.object).toBeDefined();
      expect(nameOf(before, c.object as ObjectId)).toBe(TOISE);
    } else {
      expect(c.text.startsWith('Prevent ')).toBe(true);
    }
    // What a choice leads to never exceeds what is left of the damage, and with what is prevented adds up to it.
    expect(c.outcome.amount).toBeLessThanOrEqual(q.event.amount);
    expect(c.outcome.amount + c.outcome.prevented).toBe(q.event.amount);
    if (c.outcome.amount > 0 && c.outcome.to.kind === 'object')
      expect(c.outcome.toName).toBeDefined();
  }
  if (redirects.length > 0) t.askedWithRedirect += 1;
  if (step.action.kind !== 'chooseOption')
    throw new Error(`a question answered with ${step.action.kind}`);
  expect(asked.options).toContain(step.action.option);
  t.answeredByOptions += 1;
  // The default order is "prevention first": a casual or greedy agent takes the first option.
  const kind = kinds?.[step.seat];
  if (kind === 'casual' || kind === 'greedy') expect(step.action.option).toBe(asked.options[0]);
}

const add = (total: Tally, t: Tally): void => {
  for (const key of Object.keys(t) as (keyof Tally)[]) total[key] += t[key];
};

test(
  `${GAMES} Adamantoise games begun at the question run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const kinds: readonly [Kind, Kind] = [
        KINDS[g % 4] ?? 'random',
        KINDS[(g >> 2) % 4] ?? 'random',
      ];
      const start = startState(g);
      expect(start.pending?.kind, `game ${g} starts at the question`).toBe('chooseOption');
      const config = smallGameConfig(g);
      const agents = [make(kinds[0], 31000 + 2 * g), make(kinds[1], 31001 + 2 * g)] as const;
      const log: { seat: number; action: Action }[] = [];
      const t = newTally();
      const run = await stepGame(
        config,
        agents,
        LIMITS,
        (step) => {
          log.push({ seat: step.seat, action: step.action });
          checkRules(t, kinds, step);
          const problems = checkInvariants(step.after);
          if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        },
        start,
      );
      const tag = `game ${g} (${kinds.join(' v ')})`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      // The action log replays from the same start to the same state (every answer checked against the options the replay recomputes).
      let replayed = start;
      for (const { seat, action } of log) {
        const r = applyAction(replayed, seat, action);
        if (!r.ok) throw new Error(`${tag}: replay rejected ${action.kind}: ${r.error}`);
        replayed = r.state;
      }
      expect(stateHash(replayed), tag).toBe(stateHash(run.state));
      add(total, t);
    }
    console.log(`${GAMES} Adamantoise games from the question: ${JSON.stringify(total)}`);
    expectPath(total.redirects, 'a redirection');
    expectPath(total.asked, 'a question');
    expectPath(total.askedWithRedirect, 'a question with a redirection among its choices');
  },
  soakTimeout(300_000),
);

test(
  `${GAMES} Adamantoise deck-style games run clean and replay exactly`,
  async () => {
    const total = newTally();
    const cast = new Map<string, number>();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = ADAMANTOISE_STYLE_PAIRS[g % ADAMANTOISE_STYLE_PAIRS.length] ?? [
        'adamantoise',
        'adamantoise',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const kinds: readonly [Kind, Kind] = [
        casual.has(0) ? 'casual' : 'random',
        casual.has(1) ? 'casual' : 'random',
      ];
      const agents = [make(kinds[0], 32000 + 2 * g), make(kinds[1], 32001 + 2 * g + 1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, kinds, step);
        for (const e of step.events) {
          if (e.kind === 'spellCast') {
            const name = nameOf(step.after, e.object);
            cast.set(name, (cast.get(name) ?? 0) + 1);
          }
        }
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      add(total, t);
    }
    console.log(
      `${GAMES} Adamantoise deck-style games: ${JSON.stringify({ ...total, cast: Object.fromEntries([...cast].filter(([n]) => (ADAMANTOISE_NAMES as readonly string[]).includes(n))) })}`,
    );
  },
  soakTimeout(300_000),
);
