/**
 * The page's state (SPEC 10): the latest snapshot from the Worker, the accumulated log, the stop
 * settings and the autopilot that sends `pass` and `payAuto` on the player's behalf (A18). A plain
 * zustand vanilla store, so tests drive it without React.
 */
import type { Action, GameView, ObjectId, StepId } from '@commander-arena/engine';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  GameClient,
  GameStarted,
  HonestySummary,
  LogEntry,
  NewGameOptions,
  Snapshot,
} from './game/protocol';
import type { AnimationGate } from './policy/animation-gate';
import {
  canPassTurn,
  DEFAULT_STOPS,
  passTurnVerdict,
  type StopSettings,
  shouldStop,
} from './policy/should-stop';

export type Screen = 'menu' | 'import' | 'loading' | 'playing';

/** The sections of the import screen (M4): the importer and saved decks. */
export type ImportTab = 'import' | 'decks';

export interface PreviewState {
  /** The object under the pointer (after the hover delay), shown in the fixed preview panel. */
  readonly hovered: ObjectId | null;
  /** A pinned object stays until Esc (A19). */
  readonly pinned: ObjectId | null;
}

/** A mana ability the player used and the undo depth after it (see `AppState.manaTaps`). */
export interface ManaTap {
  readonly source: ObjectId;
  readonly depth: number;
}

/**
 * The permanents whose mana can be taken back by clicking them again: the taps of `manaTaps` while the
 * history still ends at the last of them (any other action or a pass has cleared or moved it) and
 * the game is waiting for the player's priority.
 */
export function untappableSources(
  taps: readonly ManaTap[],
  undoDepth: number,
  view: GameView | null,
): ReadonlySet<ObjectId> {
  const last = taps[taps.length - 1];
  if (last === undefined || last.depth !== undoDepth) return new Set();
  if (view?.pending?.kind !== 'priority') return new Set();
  return new Set(taps.map((t) => t.source));
}

export interface AppState {
  readonly screen: Screen;
  /** Which section the import screen opens on. */
  readonly importTab: ImportTab;
  readonly options: NewGameOptions | null;
  readonly snapshot: Snapshot | null;
  readonly summary: HonestySummary | null;
  readonly log: readonly LogEntry[];
  readonly settings: StopSettings;
  /** Manual mana tapping is a mode the player enters; auto-pay is the default (A18). */
  readonly manualPay: boolean;
  /** True while the autopilot is about to send a pass; the player may click to seize priority. */
  readonly passing: boolean;
  /**
   * The turn number of a running "Pass turn" (issue 46): the autopilot passes the player's priority
   * through the rest of that turn, and the policy (`passTurnVerdict`) says when it is over. Null when
   * no yield runs. Transient: never saved, cleared by the turn changing, an interrupt, a click, an
   * undo, Esc (`cancelPassTurn`) and every way the autopilot stops.
   */
  readonly yieldTurn: number | null;
  /**
   * True while a request to the Worker or the autopilot is in flight, so the view on screen is not
   * yet the one the game is waiting on. The page shows it as `data-settled` on the app root, which
   * the Playwright tests wait for before every click: a click made while the autopilot is passing
   * seizes it, and where that happens depends on timing.
   */
  readonly busy: boolean;
  /**
   * The number of the Worker call in flight that can run the AI (`client.act`: the player's action or
   * an automatic pass, and the AI's answers after it), or null when none is. The page shows "Opponent
   * is thinking" when one has lasted long (`ui/decisions/thinking.ts`, D-174); each call gets a new
   * number, so two calls in a row are two calls even when the page renders only once between them.
   * Not the same as `busy`, which also covers the pause before an automatic pass and the undo.
   */
  readonly hostCall: number | null;
  readonly preview: PreviewState;
  /**
   * The mana abilities the player used one after another with nothing else in between (issue 19):
   * the permanent and the size of the undo history right after each. Clicking one of these lands
   * again takes the taps back down to it, as many undos as it takes (D-050).
   */
  readonly manaTaps: readonly ManaTap[];
  /** The last error from the Worker or the engine, shown briefly. */
  readonly error: string | null;
  /** Counters for the A18 end-to-end test and for the settings panel. */
  readonly stats: { readonly humanActions: number; readonly autoPasses: number };
}

export interface AppActions {
  startGame(options: NewGameOptions): Promise<void>;
  /** An explicit player action (a click). */
  act(action: Action): Promise<void>;
  /** Takes back the last small action when the Worker allows it (D-050). */
  undo(): Promise<void>;
  /**
   * Clicking a permanent tapped for mana whose mana is unspent: takes back the mana abilities used since
   * then, down to this one (a shortcut for Undo, issue 19). Does nothing unless the engine allows it.
   */
  untapMana(source: ObjectId): Promise<void>;
  /** Stops the autopilot before its next pass (the "Passing…" indicator was clicked). */
  seize(): void;
  /**
   * "Pass turn" (issue 46): passes now and keeps passing the player's priority until their turn ends,
   * stopping for what `passTurnVerdict` says. Does nothing unless the player holds priority in one of
   * their own main phases with an empty stack.
   */
  passTurn(): Promise<void>;
  /** Cancels a running "Pass turn" (Esc, the Cancel button); the autopilot stops before its next pass. */
  cancelPassTurn(): void;
  backToMenu(): void;
  /** Opens the deck import screen (M4) on the given section. */
  openImport(tab?: ImportTab): void;
  setSettings(patch: Partial<StopSettings>): void;
  toggleStop(side: 'mine' | 'opponent', step: StepId): void;
  toggleThisTurn(step: StepId): void;
  setManualPay(on: boolean): void;
  hover(id: ObjectId | null): void;
  pin(id: ObjectId | null): void;
  clearError(): void;
  /** Shows a message from the page itself (not from the engine), like a refused action's error. */
  fail(message: string): void;
}

export type AppStore = StoreApi<AppState & AppActions>;

export interface StoreOptions {
  readonly client: GameClient;
  /** Pause before an automatic pass, so the "Passing…" indicator can be clicked. */
  readonly autoPassDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * The animation gate (D-228): before each automatic pass the autopilot waits until the combat
   * effects of the last snapshot have played (never more than `MAX_WAIT_MS`). Absent: no wait.
   */
  readonly animationGate?: AnimationGate;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createAppStore(options: StoreOptions): AppStore {
  const { client } = options;
  const delay = options.autoPassDelayMs ?? 0;
  const sleep = options.sleep ?? wait;
  const gate = options.animationGate;
  let busy = false;
  let seized = false;
  /** A click made while the autopilot was busy: it runs as soon as the autopilot stops. */
  let queued: { readonly action: Action; readonly done: () => void } | null = null;
  let generation = 0;
  let callSeq = 0;

  const store: AppStore = createStore<AppState & AppActions>((set, get) => {
    /** Sets the in-flight flag the closure and the state both keep (the page shows the state's). */
    function setBusy(on: boolean): void {
      busy = on;
      set({ busy: on });
    }

    /** `client.act`, with `hostCall` set for as long as the Worker takes to answer. */
    async function callAct(action: Action): Promise<Snapshot> {
      callSeq += 1;
      const call = callSeq;
      set({ hostCall: call });
      try {
        return await client.act(action);
      } finally {
        if (get().hostCall === call) set({ hostCall: null });
      }
    }

    function apply(snapshot: Snapshot): void {
      // A refused action leaves the game as it was; keep the old snapshot and show the error.
      if (snapshot.error !== null) {
        set({ error: snapshot.error });
        return;
      }
      set((s) => {
        // Issue 82: an object that newly lands on top of the stack takes the preview panel, so it is
        // read without moving the pointer. The hover is dropped (a pinned card stays, A19); the pointer
        // staying on another card does not bring that card back until it enters another one.
        const topBefore = s.snapshot?.view.stack.at(-1)?.id;
        const topNow = snapshot.view.stack.at(-1)?.id;
        const grab = topNow !== undefined && topNow !== topBefore && s.preview.hovered !== null;
        return {
          snapshot,
          // After an undo the Worker sends the whole log, because lines were taken back.
          log: snapshot.logReset ?? [...s.log, ...snapshot.log],
          error: null,
          ...(grab ? { preview: { ...s.preview, hovered: null } } : {}),
        };
      });
    }

    /** Keeps the run of mana taps going when the action was one and the history grew by it, else ends it. */
    function noteManaTap(action: Action, reply: Snapshot, depthBefore: number): void {
      if (reply.error !== null) return;
      if (action.kind !== 'activateAbility' || reply.undoDepth !== depthBefore + 1) {
        set({ manaTaps: [] });
        return;
      }
      // A run continues only from the tap the history ended at; after a pass it starts over.
      set((s) => {
        const last = s.manaTaps[s.manaTaps.length - 1];
        const run = last !== undefined && last.depth === depthBefore ? s.manaTaps : [];
        return { manaTaps: [...run, { source: action.source, depth: reply.undoDepth }] };
      });
    }

    /** Runs the click that arrived while the autopilot was busy, now that it has stopped. */
    function flushQueued(): void {
      const next = queued;
      queued = null;
      if (next !== null) void get().act(next.action).then(next.done);
    }

    /** Sends passes and automatic payments until the player has a real decision. */
    async function drive(gen: number): Promise<void> {
      for (;;) {
        const { snapshot, settings, manualPay } = get();
        if (gen !== generation || snapshot === null) return;
        // The player clicked while the autopilot was busy: stop here so that click runs next.
        if (queued !== null) {
          set({ passing: false });
          return;
        }
        const view: GameView = snapshot.view;
        const pending = view.pending;
        if (view.result !== null || pending === null) return;
        let action: Action | null = null;
        // A running "Pass turn" decides first; once it says `end`, the normal policy takes over.
        const yielding = get().yieldTurn;
        const verdict = yielding === null ? 'end' : passTurnVerdict(view, settings, yielding);
        if (yielding !== null && verdict === 'end' && pending.kind !== 'payMana') {
          set({ yieldTurn: null });
        }
        if (pending.kind === 'payMana' && !manualPay) {
          action = { kind: 'payAuto' };
        } else if (
          verdict !== 'end' ||
          (pending.kind === 'priority' && !shouldStop(view, settings))
        ) {
          // "Skip combat" declares no attackers; every other automatic move is a pass.
          action =
            verdict === 'declareNoAttack'
              ? { kind: 'declareAttackers', attacks: [] }
              : { kind: 'pass' };
          set({ passing: true });
          // The effects of the last snapshot play before the next step starts. Only here: a
          // decision of the player, a payment and the Worker's own loop never wait for a picture.
          if (gate !== undefined) await gate.wait();
          if (gen === generation && !seized && delay > 0) await sleep(delay);
          if (gen !== generation || seized) {
            set({ passing: false });
            return;
          }
        }
        if (action === null) {
          set({ passing: false });
          return;
        }
        const reply = await callAct(action);
        if (gen !== generation) return;
        apply(reply);
        if (reply.error !== null) {
          set({ passing: false });
          return;
        }
        if (action.kind === 'pass')
          set((s) => ({ stats: { ...s.stats, autoPasses: s.stats.autoPasses + 1 } }));
      }
    }

    /** Runs the autopilot, and whatever way it stops, no yield outlives it. */
    async function driveAndEnd(gen: number): Promise<void> {
      try {
        await drive(gen);
      } finally {
        if (gen === generation) set({ yieldTurn: null });
      }
    }

    /**
     * An explicit action of the player and the autopilot after it. `startYield` is the one action
     * that starts a "Pass turn"; any other click ends a running one.
     */
    async function runAct(action: Action, startYield: boolean): Promise<void> {
      if (busy) {
        // The autopilot is still passing: do not drop the click. Hold the autopilot at its next
        // step and run this action right after (a later click replaces an earlier queued one).
        seized = true;
        gate?.release();
        set({ passing: false, yieldTurn: null });
        await new Promise<void>((resolve) => {
          queued?.done();
          queued = { action, done: resolve };
        });
        return;
      }
      setBusy(true);
      seized = false;
      const gen = generation;
      if (!startYield) set({ yieldTurn: null });
      try {
        set((s) => ({
          stats: { ...s.stats, humanActions: s.stats.humanActions + 1 },
          error: null,
        }));
        const depthBefore = get().snapshot?.undoDepth ?? 0;
        const reply = await callAct(action);
        if (gen !== generation) return;
        apply(reply);
        noteManaTap(action, reply, depthBefore);
        if (reply.error === null) await driveAndEnd(gen);
        else set({ yieldTurn: null });
      } finally {
        setBusy(false);
        flushQueued();
      }
    }

    return {
      screen: 'menu',
      importTab: 'import',
      options: null,
      snapshot: null,
      summary: null,
      log: [],
      settings: DEFAULT_STOPS,
      manualPay: false,
      passing: false,
      yieldTurn: null,
      busy: false,
      hostCall: null,
      preview: { hovered: null, pinned: null },
      manaTaps: [],
      error: null,
      stats: { humanActions: 0, autoPasses: 0 },

      async startGame(opts) {
        generation += 1;
        gate?.release();
        const gen = generation;
        seized = false;
        set({
          screen: 'loading',
          options: opts,
          snapshot: null,
          log: [],
          error: null,
          stats: { humanActions: 0, autoPasses: 0 },
          passing: false,
          yieldTurn: null,
          manaTaps: [],
        });
        const started: GameStarted = await client.newGame(opts);
        if (gen !== generation) return;
        set({ screen: 'playing', summary: started.summary });
        apply(started.snapshot);
        setBusy(true);
        try {
          await driveAndEnd(gen);
        } finally {
          setBusy(false);
          flushQueued();
        }
      },

      async act(action) {
        return runAct(action, false);
      },

      async passTurn() {
        const view = get().snapshot?.view;
        if (busy || view === undefined || view.pending?.kind !== 'priority') return;
        if (!canPassTurn(view)) return;
        set({ yieldTurn: view.turn });
        return runAct({ kind: 'pass' }, true);
      },

      cancelPassTurn() {
        if (get().yieldTurn === null) return;
        seized = true;
        gate?.release();
        set({ yieldTurn: null, passing: false });
      },

      async undo() {
        if (busy) return;
        setBusy(true);
        // After taking something back the player is where they were; the autopilot waits for them.
        seized = true;
        gate?.release();
        const gen = generation;
        try {
          const reply = await client.undo();
          if (gen !== generation) return;
          set((s) => ({ passing: false, manaTaps: s.manaTaps.slice(0, -1) }));
          apply(reply);
        } finally {
          setBusy(false);
          flushQueued();
        }
      },

      async untapMana(source) {
        if (busy) return;
        const { manaTaps, snapshot } = get();
        if (
          !untappableSources(manaTaps, snapshot?.undoDepth ?? 0, snapshot?.view ?? null).has(source)
        ) {
          return;
        }
        // The taps from this permanent's first one on are taken back, newest first.
        const first = manaTaps.findIndex((t) => t.source === source);
        const count = manaTaps.length - first;
        setBusy(true);
        seized = true;
        gate?.release();
        const gen = generation;
        try {
          for (let i = 0; i < count; i += 1) {
            const reply = await client.undo();
            if (gen !== generation) return;
            set((s) => ({ passing: false, manaTaps: s.manaTaps.slice(0, -1) }));
            apply(reply);
            if (reply.error !== null) break;
          }
        } finally {
          setBusy(false);
          flushQueued();
        }
      },

      seize() {
        seized = true;
        gate?.release();
        set({ passing: false });
      },

      backToMenu() {
        generation += 1;
        gate?.release();
        set({ screen: 'menu', snapshot: null, log: [], passing: false, error: null });
      },

      openImport(tab = 'import') {
        generation += 1;
        gate?.release();
        set({
          screen: 'import',
          importTab: tab,
          snapshot: null,
          log: [],
          passing: false,
          error: null,
        });
      },

      setSettings(patch) {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
      },

      toggleStop(side, step) {
        set((s) => {
          const key = side === 'mine' ? 'myTurnStops' : 'opponentTurnStops';
          const current = s.settings[key];
          const next = current.includes(step)
            ? current.filter((x) => x !== step)
            : [...current, step];
          return { settings: { ...s.settings, [key]: next } };
        });
      },

      toggleThisTurn(step) {
        set((s) => {
          const turn = s.snapshot?.view.turn ?? 0;
          const once = s.settings.thisTurn;
          const steps = once !== null && once.turn === turn ? once.steps : [];
          const next = steps.includes(step) ? steps.filter((x) => x !== step) : [...steps, step];
          return { settings: { ...s.settings, thisTurn: { turn, steps: next } } };
        });
      },

      setManualPay(on) {
        set({ manualPay: on });
      },

      hover(id) {
        set((s) => ({ preview: { ...s.preview, hovered: id } }));
      },

      pin(id) {
        set((s) => ({ preview: { ...s.preview, pinned: id } }));
      },

      clearError() {
        set({ error: null });
      },

      fail(message) {
        set({ error: message });
      },
    };
  });
  return store;
}
