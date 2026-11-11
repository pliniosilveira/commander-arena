/**
 * What crosses the Worker boundary (SPEC 10, D-016): plain, structured-cloneable data only.
 * The Worker owns the real `GameState`; the page only ever sees a `GameView` for the human seat.
 */
import type {
  Action,
  DeckConfig,
  GameEvent,
  GameView,
  ObjectId,
  SeatId,
} from '@commander-arena/engine';
import type { LookedCard } from './looked-cards';

/** The human is always seat 0 and the AI seat 1 in v1. */
export const HUMAN: SeatId = 0;
export const AI_SEAT: SeatId = 1;

/**
 * Which agent plays the opponent: `'normal'` is the `HeuristicAgent`, the only level there is (the
 * difficulty setting was removed, D-168); `'casual'` is the `CasualAgent` of M3, the opponent the tests
 * were written against (reachable from the player only through `?ai=casual`).
 */
export type AiKind = 'casual' | 'normal';

export function isAiKind(value: unknown): value is AiKind {
  return value === 'casual' || value === 'normal';
}

export interface NewGameOptions {
  readonly seed: number;
  /**
   * A hidden test deck id (`game/precons.ts`), or the id or name of a real precon or imported deck
   * when `humanCards` (or `aiCards`) is set: then it only labels that deck.
   */
  readonly humanDeck: string;
  readonly aiDeck: string;
  /**
   * An imported deck for the human seat: the engine definitions and the commander indices.
   * When present it replaces the test deck named by `humanDeck`, which then only labels it.
   */
  readonly humanCards?: DeckConfig;
  /**
   * The opponent's deck when it is a real precon (D-137): the engine definitions and the commander
   * indices, prepared by the page. When present it replaces the test deck named by `aiDeck`.
   */
  readonly aiCards?: DeckConfig;
  /**
   * The first mulligan is free: after it you keep seven cards, with the London bottoming starting
   * from the second (Commander's usual rule; a house rule in two-player games, CR 103.5c).
   * Defaults to true.
   */
  readonly freeMulligan?: boolean;
  /**
   * Which agent plays the opponent (D-164). The page always sets it: `'normal'` from the menu and the
   * import screen, or `'casual'` for `?autostart` unless `&ai=` says otherwise. Absent means `'casual'`,
   * the host's default, so a host built without it behaves as before M7d.
   */
  readonly ai?: AiKind;
}

export type LogLevel = 'major' | 'detail';

export interface LogEntry {
  readonly id: number;
  readonly turn: number;
  /**
   * The seat whose turn it was and the round it was in when the line was written (D-153), so a turn
   * heading in the log can read "Your turn 5". Absent in a log made before they were recorded.
   */
  readonly activeSeat?: SeatId;
  readonly round?: number;
  /** The seat whose action caused the entry, or null for the game itself. */
  readonly seat: SeatId | null;
  readonly level: LogLevel;
  readonly text: string;
  /** Objects mentioned, so the page can show a card in the preview panel while it still exists. */
  readonly objects: readonly ObjectId[];
  /** Comprehensive Rules reference, shown when the log is set to show them. */
  readonly rule: string | null;
  /**
   * Set when the line is an activated ability going on the stack: the stack object, so the stack
   * panel can call it an activated ability (the view does not tell triggered from activated).
   */
  readonly activation?: ObjectId;
}

/** One action the engine accepted, with the events it produced (SPEC 12: replays are exact). */
export interface AppliedStep {
  readonly seat: SeatId;
  readonly action: Action;
  readonly events: readonly GameEvent[];
}

/**
 * A card whose face prints `*` for power or toughness (D-109, CR 208.2a, 604.3): which of the two, and
 * the words of the ability that defines it ("Defined by an ability: equal to the number of cards in
 * your hand"). The engine's view carries the derived number only, so the host sends this beside it.
 */
export interface DefinedPtNote {
  readonly power: boolean;
  readonly toughness: boolean;
  readonly text: string;
}

export interface Snapshot {
  /** Increases by one on every snapshot, so the page can drop a stale reply. */
  readonly revision: number;
  readonly view: GameView;
  /** The visible cards whose face prints `*` for power or toughness, by object id. Absent when none. */
  readonly definedPt?: Readonly<Record<string, DefinedPtNote>>;
  /**
   * The words of the play-rule static abilities (extra land drops, the top card of the library, the cost of
   * attacking, the optional untap; D-125) of the visible permanents, by object id. Absent when none.
   */
  readonly staticNotes?: Readonly<Record<string, readonly string[]>>;
  /**
   * The cards the human looked at for their own "look at the top N cards ... you may reveal" question that cannot be
   * taken (D-139, `looked-cards.ts`); absent otherwise. Never the opponent's.
   */
  readonly lookedCards?: readonly LookedCard[];
  /** Everything applied since the previous snapshot: the human's action, then the AI's. */
  readonly steps: readonly AppliedStep[];
  readonly log: readonly LogEntry[];
  /** Actions applied since the game began. */
  readonly actionCount: number;
  /** Decisions the AI watchdog replaced with the safe fallback (A28). */
  readonly aiFallbacks: number;
  /** The engine refused the action; the snapshot is unchanged. */
  readonly error: string | null;
  /** How many human actions may be taken back right now (D-050). Zero when none. */
  readonly undoDepth: number;
  /**
   * After an undo: the whole log as it stands, replacing what the page holds. Null otherwise, when
   * `log` is only the new lines.
   */
  readonly logReset: readonly LogEntry[] | null;
}

export interface UnsupportedCard {
  readonly seat: SeatId;
  readonly name: string;
  readonly count: number;
}

/** A28: shown before the first turn. */
export interface HonestySummary {
  readonly unsupported: readonly UnsupportedCard[];
}

export interface GameStarted {
  readonly snapshot: Snapshot;
  readonly summary: HonestySummary;
}

/** Everything the page may ask the Worker. Implemented by the Worker and by an in-process host. */
export interface GameClient {
  newGame(options: NewGameOptions): Promise<GameStarted>;
  act(action: Action): Promise<Snapshot>;
  /** Takes back the human's last small action, if the rules of D-050 allow it. */
  undo(): Promise<Snapshot>;
}
