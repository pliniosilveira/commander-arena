// Slice soak (D-316, D-308 to D-313): whole games of the 'manifest' deck style, with the SYNTHETIC manifest cards (a sorcery, one for each player, the top card of an opponent's
// library, a creature whose enters trigger manifests, the removal of Reality Shift's shape), the creature cards a manifested card can be turned up as, an instant that can only
// ever be a 2/2, a lord and a watcher, between every kind of agent. The games are played with a decision context that hands out a determinized sample like the runner does
// (`runGame`, A31). Every game finishes with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state
// (the paired-seeds replay); and the rules of the slice are restated from the events and the views, apart from the engine:
//
// - HIDDEN INFORMATION, after every action, for both seats: nothing a seat is shown (its whole `GameView`) and nothing the events of the action say names a card that is face down
//   under another player's control (its card id, its oracle id, its rules text, and its name unless the same name is public somewhere else); an opponent's face-down permanent
//   carries no `hiddenFace`, `turnFaceUpCost` or `ifFaceUp`; the same seat's own face-down permanents show them. A card is revealed only by leaving the battlefield or being turned up.
// - Every `turnedFaceUp` event is the same object, face down before and face up after, taken by the player who controlled it, that paid the mana cost of a creature card with one;
//   a `turnFaceUp` option is offered only for such a card, and the view of its controller says so (`turnFaceUpCost`).
// - Every manifest puts the top card of a library onto the battlefield face down, a 2/2, under the control of the player who did it, and the `zoneChanged` event of it names no card.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  type Action,
  applyAction,
  checkInvariants,
  createGame,
  createRng,
  determinize,
  type GameEvent,
  type GameState,
  type GameView,
  getView,
  type ObjectId,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  type DecideContext,
  GreedyAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { MANIFEST_NAMES, MANIFEST_STYLE_PAIRS, smallGameConfig } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const MAX_TURNS = 150;
const MAX_ACTIONS = 5000;

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
  manifested: number;
  manifestedNonCreature: number;
  turnedUp: number;
  turnedUpCasual: number;
  turnedUpHeuristic: number;
  offered: number;
  faceDownViews: number;
  opponentViews: number;
  secretsChecked: number;
  eventsChecked: number;
  revealedByLeaving: number;
  attacked: number;
}

const newTally = (): Tally => ({
  manifested: 0,
  manifestedNonCreature: 0,
  turnedUp: 0,
  turnedUpCasual: 0,
  turnedUpHeuristic: 0,
  offered: 0,
  faceDownViews: 0,
  opponentViews: 0,
  secretsChecked: 0,
  eventsChecked: 0,
  revealedByLeaving: 0,
  attacked: 0,
});

const add = (total: Tally, t: Tally): void => {
  for (const key of Object.keys(t) as (keyof Tally)[]) total[key] += t[key];
};

interface Step {
  readonly before: GameState;
  readonly after: GameState;
  readonly seat: SeatId;
  readonly action: Action;
  readonly events: readonly GameEvent[];
}

interface Secret {
  readonly id: ObjectId;
  readonly controller: SeatId;
  readonly card: string;
  readonly name: string;
  readonly oracleId: string | null;
  readonly text: string;
}

/** The face-down permanents of `state` and the cards behind them. */
function secretsOf(state: GameState): Secret[] {
  const out: Secret[] = [];
  for (const id of [...state.battlefield, ...(state.phased ?? [])]) {
    const o = state.objects[id];
    if (o?.faceDown === undefined || o.card === null) continue;
    const card = state.cards[o.card];
    const def = card === undefined ? undefined : state.definitions[card.definition];
    if (card === undefined || def === undefined) continue;
    const view = getView(state, o.controller).battlefield.find((v) => v.id === id);
    out.push({
      id,
      controller: view?.controller ?? o.controller,
      card: o.card,
      name: def.name,
      oracleId: def.oracleId,
      text: def.faces[0]?.oracleText ?? '',
    });
  }
  return out;
}

/** The names a seat's view shows on purpose: every object that is not a face-down permanent. */
function publicNames(view: GameView): Set<string> {
  const names = new Set<string>();
  const pool = [
    ...view.battlefield,
    ...(view.phasedOut ?? []),
    ...view.exile,
    ...view.stack,
    ...view.seats.flatMap((s) => [...s.graveyard, ...s.command, ...(s.hand ?? [])]),
  ];
  for (const o of pool) if (o.faceDown !== true) names.add(o.name);
  return names;
}

function checkHidden(t: Tally, step: Step): void {
  const { after, events } = step;
  const secrets = secretsOf(after);
  for (const viewer of after.seats.map((s) => s.id)) {
    const view = getView(after, viewer);
    const text = JSON.stringify(view);
    const visible = publicNames(view);
    for (const s of secrets) {
      const own = s.controller === viewer;
      const shown = view.battlefield.concat(view.phasedOut ?? []).find((o) => o.id === s.id);
      expect(shown, `${s.id} is in the view of ${viewer}`).toBeDefined();
      t.faceDownViews += 1;
      expect(shown?.faceDown).toBe(true);
      expect(shown?.name).toMatch(/^Face-down creature \d+$/);
      expect(shown?.types).toContain('creature');
      if (own) {
        expect(shown?.hiddenFace?.name, `the controller sees ${s.id}`).toBe(s.name);
        continue;
      }
      t.opponentViews += 1;
      for (const field of ['hiddenFace', 'turnFaceUpCost', 'ifFaceUp', 'faces', 'layout', 'meld']) {
        expect(shown, `${field} of ${s.id} for ${viewer}`).not.toHaveProperty(field);
      }
      expect(shown?.isCommander, `${s.id} is a commander for ${viewer}`).toBe(false);
      t.secretsChecked += 1;
      expect(text.includes(JSON.stringify(s.card)), `view ${viewer}: card id of ${s.id}`).toBe(
        false,
      );
      if (s.oracleId !== null) expect(text.includes(s.oracleId)).toBe(false);
      if (s.text !== '' && !visible.has(s.name))
        expect(text.includes(JSON.stringify(s.text))).toBe(false);
      if (!visible.has(s.name)) {
        expect(text.includes(JSON.stringify(s.name)), `view ${viewer}: name ${s.name}`).toBe(false);
      }
    }
  }
  // The events of the action: nothing that is still face down is named. (A permanent that left the battlefield or was turned up is revealed: it is not a secret now.)
  const json = JSON.stringify(events);
  t.eventsChecked += events.length;
  for (const s of secrets) {
    // The player who controls it knows it: the events are the log of the game, read by both seats, so they name it to nobody.
    expect(json.includes(JSON.stringify(s.card)), `events name the card of ${s.id}`).toBe(false);
    if (s.oracleId !== null) expect(json.includes(s.oracleId)).toBe(false);
  }
}

function checkRules(t: Tally, kinds: readonly [Kind, Kind], step: Step): void {
  const { before, after, events, seat, action } = step;
  // The options of the priority decision: only for a face-down permanent of the seat that can be turned up, and its view says so.
  const asked = before.pending;
  if (asked?.kind === 'priority') {
    const view = getView(before, asked.seat);
    for (const o of asked.options) {
      if (o.kind !== 'turnFaceUp') continue;
      t.offered += 1;
      const shown = view.battlefield.find((v) => v.id === o.object);
      expect(shown?.controller).toBe(asked.seat);
      expect(shown?.faceDown).toBe(true);
      expect(shown?.turnFaceUpCost, `${o.object} is offered but has no cost`).toBeDefined();
      expect(shown?.hiddenFace?.types).toContain('creature');
      expect(shown?.hiddenFace?.manaCost).not.toBeNull();
    }
  }
  for (const e of events) {
    if (e.kind === 'manifested') {
      t.manifested += 1;
      const made = after.objects[e.object];
      expect(made?.faceDown?.by).toBe('manifest');
      expect(made?.zone === 'battlefield' || made?.zone === 'phased').toBe(true);
      expect(derivedCreature(after, e.object)).toBe(true);
      const entry = events.find(
        (x) => x.kind === 'zoneChanged' && x.to === e.object && x.toZone === 'battlefield',
      );
      expect(entry, 'the zone change of a manifest').toBeDefined();
      expect(entry?.kind === 'zoneChanged' ? entry.card : 'x', 'it names no card').toBeNull();
      const def =
        made?.card === null || made === undefined ? undefined : definitionOf(after, made.card);
      if (def !== undefined && !def.types.includes('creature')) t.manifestedNonCreature += 1;
    }
    if (e.kind === 'turnedFaceUp') {
      t.turnedUp += 1;
      // The payment of the special action completes it (a cost of {0} is taken by the action itself).
      const paying = before.pending;
      if (paying?.kind === 'payMana') {
        expect(paying.purpose).toBe('turnFaceUp');
        expect(paying.source).toBe(e.object);
        expect(['payAuto', 'payManual']).toContain(action.kind);
      } else {
        expect(action).toEqual({ kind: 'turnFaceUp', object: e.object });
      }
      expect(seat).toBe(e.seat);
      const was = before.objects[e.object];
      const is = after.objects[e.object];
      expect(was?.faceDown, 'it was face down').toBeDefined();
      expect(is, 'it is the same object').toBeDefined();
      expect(is?.faceDown, 'it is face up now').toBeUndefined();
      expect(is?.card).toBe(e.card);
      expect(is?.zone).toBe(was?.zone);
      const def = definitionOf(after, e.card);
      expect(def.types).toContain('creature');
      expect(e.cost).toEqual((def.manaCost ?? []).filter((s) => s !== 'X' && s !== '0'));
      // Nothing entered: no zone change of the object, and the same counters and damage.
      expect(events.some((x) => x.kind === 'zoneChanged' && x.to === e.object)).toBe(false);
      expect(is?.counters).toEqual(was?.counters);
      expect(is?.tapped).toBe(was?.tapped);
      const kind = kinds[e.seat];
      if (kind === 'casual' || kind === 'greedy') t.turnedUpCasual += 1;
      if (kind === 'heuristic') t.turnedUpHeuristic += 1;
    }
    if (e.kind === 'zoneChanged' && e.fromZone === 'battlefield') {
      const was = before.objects[e.from];
      if (was?.faceDown !== undefined) {
        t.revealedByLeaving += 1;
        // Revealed: the event names the card, and the object that it became is face up.
        expect(e.card).toBe(was.card);
        expect(after.objects[e.to]?.faceDown).toBeUndefined();
      }
    }
    if (e.kind === 'attackersDeclared') {
      for (const a of e.attackers) {
        if (before.objects[a.object]?.faceDown !== undefined) t.attacked += 1;
      }
    }
  }
}

function definitionOf(state: GameState, card: string) {
  const instance = state.cards[card as never];
  const def = instance === undefined ? undefined : state.definitions[instance.definition];
  if (def === undefined) throw new Error(`no definition for ${card}`);
  const face = def.faces[0];
  if (face === undefined) throw new Error(`no face for ${card}`);
  return face;
}

/** True when the view of the object is a 2/2 creature (a face-down permanent is, and nothing else changed it in these games). */
function derivedCreature(state: GameState, id: ObjectId): boolean {
  const owner = state.objects[id]?.controller ?? 0;
  const v = getView(state, owner).battlefield.find((o) => o.id === id);
  return v?.types.includes('creature') === true && v.power !== null;
}

/** Plays a game with a decision context that hands out a determinized sample, like the runner (`runGame`). */
async function play(
  config: ReturnType<typeof smallGameConfig>,
  agents: readonly [Agent, Agent],
  onStep: (step: Step) => void,
): Promise<{ state: GameState; capped: boolean; log: { seat: SeatId; action: Action }[] }> {
  let state = createGame(config).state;
  const log: { seat: SeatId; action: Action }[] = [];
  let decisions = 0;
  while (state.result === null) {
    if (state.turn.number > MAX_TURNS || log.length >= MAX_ACTIONS) {
      return { state, capped: true, log };
    }
    const pending = state.pending;
    if (pending === null) throw new Error('a running game has no pending decision');
    const view = getView(state, pending.seat);
    if (view.pending === null) throw new Error('the deciding seat does not see its decision');
    const agent = agents[pending.seat];
    if (agent === undefined) throw new Error(`no agent for seat ${pending.seat}`);
    decisions += 1;
    const real = state;
    const ctx: DecideContext = {
      budgetMs: 1000,
      now: () => decisions,
      sample: (seed) => {
        const sample = determinize(real, pending.seat, createRng(seed));
        // The sample agrees with what the seat sees (it is a legal world for it), and it is not the real state.
        return sample;
      },
    };
    const action = await agent.decide(view, view.pending, ctx);
    const r = applyAction(state, pending.seat, action);
    if (!r.ok) {
      throw new Error(
        `rejected ${JSON.stringify(action)}: ${r.error} (asked ${JSON.stringify(view.pending)})`,
      );
    }
    onStep({ before: state, after: r.state, seat: pending.seat, action, events: r.events });
    log.push({ seat: pending.seat, action });
    state = r.state;
  }
  return { state, capped: false, log };
}

test(
  `${GAMES} manifest deck-style games run clean, replay exactly, hide every face-down card and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = MANIFEST_STYLE_PAIRS[g % MANIFEST_STYLE_PAIRS.length] ?? [
        'manifest',
        'manifest',
      ];
      const config = smallGameConfig(g, styles);
      const kinds: readonly [Kind, Kind] = [
        KINDS[g % 4] ?? 'random',
        KINDS[(g >> 2) % 4] ?? 'random',
      ];
      const agents = [make(kinds[0], 61000 + 2 * g), make(kinds[1], 61001 + 2 * g)] as const;
      const t = newTally();
      const run = await play(config, agents, (step) => {
        checkHidden(t, step);
        checkRules(t, kinds, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g} (${kinds.join(' v ')}, ${styles.join(' v ')})`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, run.log)), tag).toBe(stateHash(run.state));
      add(total, t);
    }
    console.log(
      `${GAMES} manifest games: ${JSON.stringify(total)} (${MANIFEST_NAMES.length} cards)`,
    );
    // The audit was not vacuous at any size: face-down permanents were on the table and were checked.
    expect(total.manifested).toBeGreaterThan(0);
    expect(total.secretsChecked).toBeGreaterThan(0);
    expect(total.eventsChecked).toBeGreaterThan(0);
    expectPath(total.turnedUp, 'a face-down creature turned face up');
    expectPath(total.turnedUpCasual, 'a casual or greedy agent turning one up');
    expectPath(total.turnedUpHeuristic, 'a heuristic agent turning one up');
    expectPath(total.offered, 'the option to turn one up');
    expectPath(total.opponentViews, 'the view of a face-down permanent of the other seat');
    expectPath(
      total.revealedByLeaving,
      'a face-down permanent revealed by leaving the battlefield',
    );
    expectPath(total.manifestedNonCreature, 'a card that is not a creature card, manifested');
  },
  soakTimeout(600_000),
);
