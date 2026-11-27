// The replay of an AI report (issue 627): the block the game's "That was a dumb move" button writes into an issue is found,
// decompressed and read (`parseAiReportText` of the cards package), every deck is rebuilt the way the web app built it, and the
// action log is replayed through `createGame` and `applyAction` up to the reported decision. Nothing of the issue is executed: the
// record is data, checked by its schema, and each action goes through the engine, which refuses an action that is not legal.
//
// A deck is rebuilt by the web app's own pipeline (the same modules as tools/ai/precons.ts): a shipped precon from its snapshot in
// apps/web/src/precons/snapshots/ or challenges/, plus the card data the record carries for the cards the snapshot lacks; a saved
// deck from the carried card data alone; a hidden test deck from its id (apps/web/src/game/precons.ts).

import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  type AiReport,
  aiReportPayload,
  PARSER_VERSION,
  type PreconSnapshot,
  parseAiReportText,
  type ReplayDeck,
} from '@commander-arena/cards';
import {
  type Action,
  applyAction,
  createGame,
  type DeckConfig,
  ENGINE_VERSION,
  type GameEvent,
  type GameState,
} from '@commander-arena/engine';
import { deckFor, isHiddenDeckId, preconById } from '../../apps/web/src/game/precons.ts';
import { buildDeck, readSnapshots, SNAPSHOT_FOLDER } from './precons.ts';

/** Where the challenge opponents' snapshots live, beside the precons'. */
const CHALLENGE_FOLDER = path.join(SNAPSHOT_FOLDER, '..', 'challenges');

/** The record of an issue description; throws, saying why, when the block is missing or damaged. */
export function reportOfBody(body: string): AiReport {
  const payload = aiReportPayload(body);
  if (payload === null)
    throw new Error('the description has no "Game replay for the AI coach" block');
  let text: string;
  try {
    text = gunzipSync(Buffer.from(payload, 'base64url')).toString('utf8');
  } catch (error) {
    throw new Error(
      `the replay does not decompress: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parseAiReportText(text);
}

/** Warnings when the report was made by another engine or parser than this tree's: the replay may then differ or fail. */
export function versionWarnings(report: AiReport): string[] {
  const out: string[] = [];
  const check = (what: string, theirs: number, ours: number): void => {
    if (theirs === ours) return;
    const relation = theirs > ours ? 'newer than' : 'older than';
    out.push(
      `The report was made with ${what} ${theirs}, ${relation} this tree's ${ours}: the replay may differ from the game.`,
    );
  };
  check('engine', report.engine, ENGINE_VERSION);
  check('card parser', report.parser, PARSER_VERSION);
  return out;
}

let challengeAndPrecons: readonly PreconSnapshot[] | undefined;

function shippedSnapshot(id: string): PreconSnapshot | undefined {
  challengeAndPrecons ??= [
    ...readSnapshots(SNAPSHOT_FOLDER).snapshots,
    ...readSnapshots(CHALLENGE_FOLDER).snapshots,
  ];
  return challengeAndPrecons.find((s) => s.id === id);
}

/** The engine deck of one seat, built as the web app built it; throws with the reason when it cannot be. */
export async function rebuildDeck(deck: ReplayDeck, seat: number): Promise<DeckConfig> {
  if (deck.hidden !== undefined) {
    if (!isHiddenDeckId(deck.hidden)) {
      throw new Error(`seat ${seat}: there is no hidden test deck "${deck.hidden}" in this tree`);
    }
    return deckFor(preconById(deck.hidden));
  }
  const base = deck.precon === undefined ? undefined : shippedSnapshot(deck.precon);
  if (deck.precon !== undefined && base === undefined) {
    throw new Error(`seat ${seat}: there is no precon "${deck.precon}" in this tree`);
  }
  const built = await buildDeck({
    id: base?.id ?? 'replay',
    name: deck.name === '' ? `seat ${seat}` : deck.name,
    blurb: '',
    source: 'AI report',
    decklist: deck.decklist ?? '',
    cards: [...(base?.cards ?? []), ...(deck.cards ?? [])],
  });
  if (!built.ok) throw new Error(`seat ${seat}: ${built.reason}`);
  return built.deck;
}

export interface ReplayedStep {
  readonly index: number;
  readonly seat: number;
  readonly action: Action;
  readonly before: GameState;
  readonly after: GameState;
  readonly events: readonly GameEvent[];
}

export type Replay =
  | {
      readonly ok: true;
      /** The state at the reported decision, before the reported action. */
      readonly position: GameState;
      /** Every step before the reported one, then the reported one, with the states around it. */
      readonly steps: readonly ReplayedStep[];
    }
  | { readonly ok: false; readonly reason: string };

/** Replays the record to the reported decision and checks that the engine accepts the reported action there. */
export async function replayReport(report: AiReport): Promise<Replay> {
  const decks: DeckConfig[] = [];
  try {
    for (const [seat, deck] of report.decks.entries()) decks.push(await rebuildDeck(deck, seat));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  let state: GameState;
  try {
    state = createGame({
      seed: report.seed,
      decks,
      settings: { freeFirstMulligan: report.freeMulligan },
      ...(report.emblems.length === 0 ? {} : { startingEmblems: report.emblems }),
    }).state;
  } catch (error) {
    return {
      ok: false,
      reason: `the game cannot be created: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const steps: ReplayedStep[] = [];
  let position: GameState = state;
  for (const [index, step] of report.actions.entries()) {
    if (index === report.reported) {
      if (state.pending?.seat !== report.aiSeat) {
        return {
          ok: false,
          reason: `at action ${index} the engine asks seat ${state.pending?.seat ?? 'nobody'}, not the AI seat ${report.aiSeat}`,
        };
      }
      position = state;
    }
    const applied = applyAction(state, step.seat, step.action);
    if (!applied.ok) {
      return {
        ok: false,
        reason: `action ${index} (seat ${step.seat}, ${step.action.kind}) was refused: ${applied.error}`,
      };
    }
    steps.push({
      index,
      seat: step.seat,
      action: step.action,
      before: state,
      after: applied.state,
      events: applied.events,
    });
    state = applied.state;
  }
  return { ok: true, position, steps };
}
