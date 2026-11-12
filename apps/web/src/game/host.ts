/**
 * The game host: owns the real `GameState`, applies the human's actions, then lets the AI answer
 * until the human is asked something or the game ends. Framework-free, so the Worker wraps it and
 * tests drive it in process (SPEC 4.1, 10, 17.6 A28).
 */
import { type Agent, DEFAULT_BUDGET_MS, firstSafeAction } from '@commander-arena/ai';
import {
  type Action,
  applyAction,
  createGame,
  createRng,
  type DeckConfig,
  determinize,
  type GameConfig,
  type GameEvent,
  type GameState,
  getView,
} from '@commander-arena/engine';
import { createAgent } from './agents';
import { definedPtNotes } from './defined-pt';
import { describeEvents } from './describe';
import { isUnlessPurpose } from './describe-ward';
import { lookedCards } from './looked-cards';
import {
  AI_SEAT,
  type AiKind,
  type AppliedStep,
  type GameClient,
  type GameStarted,
  type HonestySummary,
  HUMAN,
  type LogEntry,
  type NewGameOptions,
  type Snapshot,
  type UnsupportedCard,
} from './protocol';
import { staticNotes } from './static-notes';
import { roundOf } from './turn-label';

export interface HostOptions {
  /** Injected clock in milliseconds; the Worker passes `performance.now`. */
  readonly clock: () => number;
  /** Budget for one AI decision (A28). */
  readonly aiBudgetMs?: number;
  /** How far over budget an answer may run before the watchdog replaces it. */
  readonly aiMarginMs?: number;
  /**
   * Test seam: build the AI agent from the game seed and the kind the options name (`NewGameOptions.ai`,
   * `'casual'` when absent). The default is `createAgent`: `HeuristicAgent`, or
   * `CasualAgent`.
   */
  readonly makeAgent?: (seed: number, kind: AiKind) => Agent;
  /** Test seam: a hard cap on AI answers per human action, so a stuck agent cannot hang the Worker. */
  readonly maxAiSteps?: number;
}

/**
 * Undo (D-050). Only these actions may be taken back: they change nothing the opponent has seen
 * or the game's randomness has touched. Everything else (a pass, a mulligan, a declaration,
 * anything that lets the AI act or draws, shuffles or ends a step) clears the undo history.
 *
 * Triggered abilities (M5 S2): `orderTriggers` is undoable. It happens inside the priority window
 * of the action that made the abilities trigger, puts them on the stack and resolves nothing, so
 * taking it back just asks the question again. `choosePermanents`, `acceptOptional` and
 * `declineOptional` answer a question asked while an object resolves. The pass that started the
 * resolution already ended the undo window, and what follows (a sacrifice, a draw, tokens, more
 * triggers) is the game moving on, so these three clear the history like any other action.
 *
 * `activate` (an activated ability that is not a mana ability, D-075) is treated exactly like
 * `castSpell`: undoable, and the point taken before it is a cast start, so cancelling the
 * activation (during targets, payment or a sacrifice cost) returns to where it began and drops the
 * points taken inside it. The ability goes on the stack and resolves nothing, and a Cycling
 * discard is public, so taking it back reveals nothing. Once the autopilot passes and the ability
 * resolves, the AI has acted and the history clears like it does for a spell. The sacrifice that
 * pays an activation cost is a `choosePermanents` answer, which clears the history (above).
 *
 * The kicker question (CR 601.2b, `confirmOptional` with `purpose: 'kicker'`) is part of the cast
 * like the targets step: `acceptOptional` or `declineOptional` answering it is undoable, which
 * takes back to the question, and Cancel at it makes the engine rewind the whole cast (the cast
 * start point and everything after it are dropped). The answer emits no event and puts nothing
 * on the stack. Every other `confirmOptional` question answers something asked while an object
 * resolves and clears the history (above). A flashback cast (`castSpell` with `alternative`) is
 * a plain `castSpell` for all of this.
 *
 * Ward (CR 702.21a), "counter target spell unless its controller pays" (D-092) and the general
 * "[do something] unless [that player] pays" (`purpose: 'unlessPays'`, D-111, CR 118.12a) ask while the
 * ability or spell resolves, so every answer to them is a mid-resolution answer and clears the
 * history: `acceptOptional` or `declineOptional` at the question (`confirmOptional` with
 * `purpose: 'ward'` or `'counterUnlessPays'`; declining counters the spell, accepting pays life and
 * moves on to the mana) and `payAuto`, `payManual` or `cancel` at the payment (`payMana` with the
 * same purposes; `cancel` there means "do not pay" and counters the spell, it rewinds nothing,
 * so it must not drop history back to a cast start as a cancelled cast does). The pass that started
 * the resolution already ended the undo window. The legend rule's `choosePermanents` (CR 704.5j) is
 * the same kind of answer and is not in `UNDOABLE_ACTIONS`; a legendary land played into the rule
 * leaves its `playLand` point until that answer clears it.
 *
 * The "may search" question (`confirmOptional` with `purpose: 'search'`, asked of the searching
 * player, who may not be the caster) and `choosePermanents` for an effect (`purpose: 'effect'`)
 * answer something asked mid-resolution too, and are not in `UNDOABLE_ACTIONS`.
 *
 * `chooseOption` ("As this enters, choose a creature type / a color", D-100) is asked as a card is
 * played or a spell resolves and cannot be taken back: it is not in `UNDOABLE_ACTIONS`, so answering
 * it clears the history.
 *
 * `chooseCards` (a library search or a discard, M5) is the same: it answers a question asked while
 * a spell or ability resolves, and the search shuffles, reveals and moves cards, so it clears the
 * history too (it is not in `UNDOABLE_ACTIONS`).
 */
const UNDOABLE_ACTIONS: ReadonlySet<Action['kind']> = new Set([
  'playLand',
  'castSpell',
  'activate',
  'activateAbility',
  'chooseTargets',
  'payAuto',
  'payManual',
  'orderTriggers',
]);

/** True for the answer to the kicker question: undoable like the targets step of the same cast. */
function answersKicker(action: Action, pending: GameState['pending']): boolean {
  return (
    (action.kind === 'acceptOptional' || action.kind === 'declineOptional') &&
    pending?.kind === 'confirmOptional' &&
    pending.purpose === 'kicker'
  );
}

/**
 * True for an answer to the question or the payment of a "counter it unless its controller pays"
 * ability, Ward's or a counterspell's (see above): never undoable, and a `cancel` at the payment is
 * not the rewind of a cast.
 */
function answersUnlessPays(action: Action, pending: GameState['pending']): boolean {
  if (pending?.kind === 'confirmOptional' && isUnlessPurpose(pending.purpose)) {
    return action.kind === 'acceptOptional' || action.kind === 'declineOptional';
  }
  return pending?.kind === 'payMana' && isUnlessPurpose(pending.purpose);
}

const NO_UNDO_EVENTS: ReadonlySet<GameEvent['kind']> = new Set([
  'cardDrawn',
  'drewFromEmptyLibrary',
  'libraryShuffled',
  // D-271: a die roll is random like a shuffle: an undo past it would let the player roll again.
  'dieRolled',
  'mulliganTaken',
  'handKept',
  'turnBegan',
  'stepBegan',
  'gameEnded',
  'conceded',
]);
const MAX_UNDO = 40;

interface UndoPoint {
  /** The state, the action count and the log length before the action was applied. */
  readonly state: GameState;
  readonly actions: number;
  readonly log: number;
  /** True for the point taken before a cast began; cancelling the cast returns to it. */
  readonly castStart: boolean;
}

/**
 * The deck of a hidden test deck id. The decks are test fixtures (SPEC 17.6 A27) and live in a
 * chunk of their own (`game/precons.ts`) that loads only when a game starts from one, so the
 * production bundle does not carry them; `?autostart=<id>` still reaches them in every build.
 */
let hiddenDecks: Promise<typeof import('./precons')> | undefined;

async function hiddenDeck(id: string): Promise<DeckConfig> {
  hiddenDecks ??= import('./precons');
  const { deckFor, preconById } = await hiddenDecks;
  return deckFor(preconById(id));
}

/**
 * How far past the budget an AI answer may arrive before the watchdog replaces it (A28, D-172): half
 * the budget, as before the budget went from 1000 ms to 5000 ms (500 ms over 1000 ms). An answer is
 * kept up to `DEFAULT_BUDGET_MS + DEFAULT_MARGIN_MS` = 7500 ms.
 */
export const DEFAULT_MARGIN_MS = 2500;
const DEFAULT_MAX_AI_STEPS = 5000;

function honestySummary(config: GameConfig): HonestySummary {
  const unsupported: UnsupportedCard[] = [];
  config.decks.forEach((deck, seat) => {
    const counts = new Map<string, number>();
    for (const card of deck.cards) {
      if (card.support === 'unsupported') counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
    }
    for (const [name, count] of counts) unsupported.push({ seat, name, count });
  });
  return { unsupported };
}

export class GameHost implements GameClient {
  private readonly clock: () => number;
  private readonly budgetMs: number;
  private readonly marginMs: number;
  private readonly makeAgent: (seed: number, kind: AiKind) => Agent;
  private readonly maxAiSteps: number;

  private state: GameState | null = null;
  private agent: Agent | null = null;
  private actions: { seat: number; action: Action }[] = [];
  private revision = 0;
  private logId = 0;
  private aiFallbacks = 0;
  private logAll: LogEntry[] = [];
  private undoStack: UndoPoint[] = [];

  constructor(options: HostOptions) {
    this.clock = options.clock;
    this.budgetMs = options.aiBudgetMs ?? DEFAULT_BUDGET_MS;
    this.marginMs = options.aiMarginMs ?? DEFAULT_MARGIN_MS;
    this.makeAgent = options.makeAgent ?? createAgent;
    this.maxAiSteps = options.maxAiSteps ?? DEFAULT_MAX_AI_STEPS;
  }

  async newGame(options: NewGameOptions): Promise<GameStarted> {
    const config: GameConfig = {
      seed: options.seed,
      decks: [
        options.humanCards ?? (await hiddenDeck(options.humanDeck)),
        options.aiCards ?? (await hiddenDeck(options.aiDeck)),
      ],
      settings: { freeFirstMulligan: options.freeMulligan ?? true },
    };
    this.actions = [];
    this.aiFallbacks = 0;
    this.logAll = [];
    this.undoStack = [];
    this.agent = this.makeAgent(options.seed ^ 0x5eed, options.ai ?? 'casual');
    const created = createGame(config);
    this.state = created.state;
    const log = this.logFor(created.state, created.state, created.events);
    // The opening decision may belong to the AI; settle it before the first snapshot.
    const ai = await this.runAi();
    const opening: AppliedStep = { seat: HUMAN, action: { kind: 'pass' }, events: created.events };
    return {
      snapshot: this.snapshot([opening, ...ai.steps], [...log, ...ai.log], null),
      summary: honestySummary(config),
    };
  }

  async act(action: Action): Promise<Snapshot> {
    const state = this.requireState();
    if (state.result !== null) return this.snapshot([], [], 'The game is over.');
    if (state.pending?.seat !== HUMAN) return this.snapshot([], [], 'It is not your decision.');
    const applied = applyAction(state, HUMAN, action);
    if (!applied.ok) return this.snapshot([], [], applied.error);
    const point: UndoPoint = {
      state,
      actions: this.actions.length,
      log: this.logAll.length,
      castStart: action.kind === 'castSpell' || action.kind === 'activate',
    };
    this.state = applied.state;
    this.actions.push({ seat: HUMAN, action });
    const humanLog = this.logFor(state, applied.state, applied.events, action);
    const humanStep: AppliedStep = { seat: HUMAN, action, events: applied.events };
    const ai = await this.runAi();
    this.recordUndo(action, applied.events, ai.steps.length, point, state.pending);
    return this.snapshot([humanStep, ...ai.steps], [...humanLog, ...ai.log], null);
  }

  async undo(): Promise<Snapshot> {
    this.requireState();
    const point = this.undoStack.pop();
    if (point === undefined) return this.snapshot([], [], 'Nothing to undo.');
    this.state = point.state;
    this.actions.length = point.actions;
    this.logAll.length = point.log;
    return this.snapshot([], [], null, [...this.logAll]);
  }

  /** Keeps `point` for undo when the action just applied is small and left no trace (D-050). */
  private recordUndo(
    action: Action,
    events: readonly GameEvent[],
    aiSteps: number,
    point: UndoPoint,
    asked: GameState['pending'],
  ): void {
    if (answersUnlessPays(action, asked)) {
      this.undoStack = [];
      return;
    }
    // The cost of attacking (CR 508.1h, D-125) is asked after the attackers were declared, which cleared
    // the history. Paying it declares them, and cancelling it only asks for the attackers again: neither
    // is a cast to take back, so neither may leave a point or drop one.
    // The cost of blocking (CR 509.1d, D-149) is the same: asked after the blockers were declared, paid to declare them.
    if (
      asked?.kind === 'payMana' &&
      (asked.purpose === 'attackTax' || asked.purpose === 'blockTax')
    ) {
      if (action.kind !== 'cancel') this.undoStack = [];
      return;
    }
    // Suspend and Foretell (D-128) are special actions, not casts: opening the payment changes nothing,
    // cancelling it changes nothing, and paying it is not a step to take back (the card was exiled).
    if (
      asked?.kind === 'payMana' &&
      (asked.purpose === 'suspend' || asked.purpose === 'foretell')
    ) {
      if (action.kind !== 'cancel') this.undoStack = [];
      return;
    }
    if ((action.kind === 'suspend' || action.kind === 'foretell') && events.length === 0) return;
    if (action.kind === 'cancel') {
      // The engine restored the state from before the cast: drop the cast's own point and every
      // point taken inside it, because the game is back exactly where the cast began.
      const start = this.undoStack.findLastIndex((p) => p.castStart);
      this.undoStack = start === -1 ? [] : this.undoStack.slice(0, start);
      return;
    }
    const keeps =
      (UNDOABLE_ACTIONS.has(action.kind) || answersKicker(action, asked)) &&
      aiSteps === 0 &&
      !events.some((e) => NO_UNDO_EVENTS.has(e.kind));
    if (!keeps) {
      this.undoStack = [];
      return;
    }
    this.undoStack.push(point);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
  }

  private requireState(): GameState {
    if (this.state === null) throw new Error('No game has been started');
    return this.state;
  }

  /** Lets the AI answer while it is the one being asked. */
  private async runAi(): Promise<{ steps: AppliedStep[]; log: LogEntry[] }> {
    const steps: AppliedStep[] = [];
    const log: LogEntry[] = [];
    const agent = this.agent;
    let guard = 0;
    while (
      agent !== null &&
      this.state !== null &&
      this.state.result === null &&
      this.state.pending?.seat === AI_SEAT &&
      guard < this.maxAiSteps
    ) {
      guard += 1;
      const before = this.state;
      const view = getView(before, AI_SEAT);
      const decision = view.pending;
      if (decision === null) break;
      const started = this.clock();
      let action: Action;
      try {
        action = await agent.decide(view, decision, {
          budgetMs: this.budgetMs,
          now: this.clock,
          // Built only when the agent asks (A31, D-161): the host holds the real state, the agent gets a sample.
          sample: (seed) => determinize(before, AI_SEAT, createRng(seed)),
        });
      } catch {
        this.aiFallbacks += 1;
        action = firstSafeAction(decision);
      }
      // The watchdog (A28): an answer that arrives far past its budget is replaced and counted.
      if (this.clock() - started > this.budgetMs + this.marginMs) {
        this.aiFallbacks += 1;
        action = firstSafeAction(decision);
      }
      let applied = applyAction(before, AI_SEAT, action);
      if (!applied.ok) {
        this.aiFallbacks += 1;
        action = firstSafeAction(decision);
        applied = applyAction(before, AI_SEAT, action);
        if (!applied.ok) break;
      }
      this.state = applied.state;
      this.actions.push({ seat: AI_SEAT, action });
      steps.push({ seat: AI_SEAT, action, events: applied.events });
      log.push(...this.logFor(before, applied.state, applied.events, action));
    }
    return { steps, log };
  }

  private logFor(
    before: GameState,
    after: GameState,
    events: readonly GameEvent[],
    action?: Action,
  ): LogEntry[] {
    const out: LogEntry[] = [];
    for (const described of describeEvents(events, before, after, HUMAN, action)) {
      out.push({
        id: this.logId++,
        turn: after.turn.number,
        activeSeat: after.turn.activeSeat,
        round: roundOf(after.turn.number, after.seats.length),
        ...described,
      });
    }
    this.logAll.push(...out);
    return out;
  }

  private snapshot(
    steps: readonly AppliedStep[],
    log: readonly LogEntry[],
    error: string | null,
    logReset: readonly LogEntry[] | null = null,
  ): Snapshot {
    const state = this.requireState();
    this.revision += 1;
    const view = getView(state, HUMAN);
    const definedPt = definedPtNotes(state, view);
    const statics = staticNotes(state, view);
    const looked = lookedCards(state, HUMAN);
    return {
      revision: this.revision,
      view,
      ...(Object.keys(definedPt).length === 0 ? {} : { definedPt }),
      ...(Object.keys(statics).length === 0 ? {} : { staticNotes: statics }),
      ...(looked.length === 0 ? {} : { lookedCards: looked }),
      steps,
      log,
      actionCount: this.actions.length,
      aiFallbacks: this.aiFallbacks,
      error,
      undoDepth: this.undoStack.length,
      logReset,
    };
  }
}
