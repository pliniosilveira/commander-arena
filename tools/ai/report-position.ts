// The position of an AI report (issue 627) as the AI seat saw it, in Markdown for a reader and as JSON for a machine: life,
// commander damage, the boards with names and P/T, the AI's hand and the opponents' hand sizes, the mana the AI has, the step, the
// last ten actions before the decision, the reported action and the player's comment. Everything comes from `getView` of the AI
// seat, so nothing the AI could not see is shown, except the actions, which are worded as the player's game log words them.

import type { AiReport } from '@commander-arena/cards';
import {
  type GameState,
  type GameView,
  getView,
  type ObjectView,
  type SeatView,
} from '@commander-arena/engine';
import { describeEvents } from '../../apps/web/src/game/describe.ts';
import type { ReplayedStep } from './report-replay.ts';

/** How many actions before the reported one the summary lists. */
export const LAST_ACTIONS = 10;

export interface PermanentLine {
  readonly name: string;
  readonly power: number | null;
  readonly toughness: number | null;
  readonly tapped: boolean;
  readonly counters: Readonly<Record<string, number>>;
}

export interface SeatPosition {
  readonly seat: number;
  readonly ai: boolean;
  readonly life: number;
  readonly poison: number;
  readonly handCount: number;
  readonly libraryCount: number;
  /** The AI seat's own hand; null for every other seat (hidden). */
  readonly hand: readonly string[] | null;
  /** Commander damage this seat has taken: one line per commander. */
  readonly commanderDamage: readonly {
    readonly from: number;
    readonly commander: string;
    readonly damage: number;
  }[];
  readonly battlefield: readonly PermanentLine[];
  readonly command: readonly string[];
  readonly graveyard: readonly string[];
  readonly manaPool: readonly string[];
  /** Untapped lands and other untapped permanents whose text adds mana. */
  readonly untappedManaSources: readonly string[];
}

export interface ActionLine {
  readonly index: number;
  readonly seat: number;
  readonly kind: string;
  readonly text: string;
}

export interface Position {
  readonly turn: number;
  readonly activeSeat: number;
  readonly phase: string;
  readonly step: string;
  /** What the AI was asked: the kind of its pending decision. */
  readonly decision: string;
  readonly stack: readonly string[];
  readonly seats: readonly SeatPosition[];
  readonly lastActions: readonly ActionLine[];
  readonly reported: ActionLine & { readonly action: unknown };
  readonly comment: string;
}

const isManaSource = (o: ObjectView): boolean =>
  !o.tapped && (o.types.includes('land') || /\bAdd \{/.test(o.oracleText));

/** The name of a commander by its card id: which cards are commanders is public (CR 903.3). */
function commanderName(state: GameState, cardId: string): string {
  const card = state.cards[cardId];
  return (
    (card === undefined ? undefined : state.definitions[card.definition]?.name) ?? 'a commander'
  );
}

function seatPosition(
  state: GameState,
  view: GameView,
  seat: SeatView,
  aiSeat: number,
): SeatPosition {
  const commanderDamage = Object.entries(view.commanderDamage)
    .filter(([key, damage]) => key.startsWith(`${seat.id}:`) && damage > 0)
    .map(([key, damage]) => ({
      from: view.commanderDamageSources[key] ?? -1,
      commander: commanderName(state, key.slice(key.indexOf(':') + 1)),
      damage,
    }));
  const mine = view.battlefield.filter((o) => o.controller === seat.id);
  return {
    seat: seat.id,
    ai: seat.id === aiSeat,
    life: seat.life,
    poison: seat.poison,
    handCount: seat.handCount,
    libraryCount: seat.libraryCount,
    hand: seat.id === aiSeat ? (seat.hand ?? []).map((o) => o.name) : null,
    commanderDamage,
    battlefield: mine.map((o) => ({
      name: o.name,
      power: o.power,
      toughness: o.toughness,
      tapped: o.tapped,
      counters: o.counters,
    })),
    command: seat.command.map((o) => o.name),
    graveyard: seat.graveyard.map((o) => o.name),
    manaPool: seat.manaPool.map((m) => m.color),
    untappedManaSources: mine.filter(isManaSource).map((o) => o.name),
  };
}

/** One action in the words of the player's game log (seat 0's view), or its kind when the log writes no line for it. */
export function actionLine(step: ReplayedStep): ActionLine {
  const lines = describeEvents(step.events, step.before, step.after, 0, step.action);
  const major = lines.filter((l) => l.level === 'major').map((l) => l.text);
  const text = (major.length > 0 ? major : lines.map((l) => l.text)).join(' ');
  return {
    index: step.index,
    seat: step.seat,
    kind: step.action.kind,
    text: text === '' ? `(${step.action.kind}, no log line)` : text,
  };
}

/** The position of the report at the reported decision. `steps` ends with the reported step. */
export function positionOf(
  report: AiReport,
  position: GameState,
  steps: readonly ReplayedStep[],
): Position {
  const view = getView(position, report.aiSeat);
  const reportedStep = steps[steps.length - 1];
  if (reportedStep === undefined) throw new Error('the replay has no step');
  return {
    turn: view.turn,
    activeSeat: view.activeSeat,
    phase: view.phase,
    step: view.step,
    decision: view.pending?.kind ?? 'none',
    stack: view.stack.map((o) => o.name),
    seats: view.seats.map((s) => seatPosition(position, view, s, report.aiSeat)),
    lastActions: steps.slice(Math.max(0, steps.length - 1 - LAST_ACTIONS), -1).map(actionLine),
    reported: { ...actionLine(reportedStep), action: reportedStep.action },
    comment: report.comment,
  };
}

const pt = (p: PermanentLine): string =>
  p.power === null || p.toughness === null ? '' : ` ${p.power}/${p.toughness}`;

function permanentText(p: PermanentLine): string {
  const counters = Object.entries(p.counters)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${n} ${kind}`);
  const notes = [...(p.tapped ? ['tapped'] : []), ...counters];
  return `${p.name}${pt(p)}${notes.length === 0 ? '' : ` (${notes.join(', ')})`}`;
}

const list = (items: readonly string[]): string => (items.length === 0 ? 'none' : items.join(', '));

const seatTitle = (s: SeatPosition): string =>
  s.ai
    ? `Seat ${s.seat} (the AI, reported)`
    : s.seat === 0
      ? 'Seat 0 (the player)'
      : `Seat ${s.seat} (AI)`;

/** The position as Markdown, for the triage comment and a reader. */
export function positionMarkdown(
  report: AiReport,
  p: Position,
  warnings: readonly string[],
): string {
  const out: string[] = ['**Replays: yes**', ''];
  for (const w of warnings) out.push(`> ${w}`, '');
  out.push(
    `Engine ${report.engine} · Card parser ${report.parser} · Build ${report.app} · Seed ${report.seed} · ${report.seats} seats · AI \`${report.ai}\``,
    '',
    `Turn ${p.turn}, seat ${p.activeSeat}'s turn, ${p.phase} phase, ${p.step} step. The AI (seat ${report.aiSeat}) was asked: \`${p.decision}\`.`,
    '',
    `**Reported action** (#${p.reported.index}, \`${p.reported.kind}\`): ${p.reported.text}`,
    '',
    `**The player says it should have:** ${p.comment === '' ? '(no answer)' : p.comment}`,
    '',
  );
  if (p.stack.length > 0) out.push(`**Stack** (top first): ${p.stack.join(', ')}`, '');
  for (const s of p.seats) {
    out.push(`### ${seatTitle(s)}`, '');
    out.push(
      `- Life ${s.life}${s.poison > 0 ? `, poison ${s.poison}` : ''}; hand ${s.handCount}; library ${s.libraryCount}`,
    );
    if (s.commanderDamage.length > 0) {
      const lines = s.commanderDamage.map(
        (d) => `${d.damage} from seat ${d.from}'s ${d.commander}`,
      );
      out.push(`- Commander damage taken: ${lines.join('; ')}`);
    }
    if (s.hand !== null) out.push(`- Hand: ${list(s.hand)}`);
    out.push(`- Battlefield: ${list(s.battlefield.map(permanentText))}`);
    out.push(`- Command zone: ${list(s.command)}`);
    if (s.graveyard.length > 0) out.push(`- Graveyard: ${s.graveyard.join(', ')}`);
    if (s.ai) {
      out.push(
        `- Mana: pool ${list(s.manaPool)}; untapped sources ${s.untappedManaSources.length} (${list(s.untappedManaSources)})`,
      );
    }
    out.push('');
  }
  out.push(`**The last ${p.lastActions.length} actions** (as the player's log words them):`, '');
  for (const a of p.lastActions) out.push(`${a.index}. seat ${a.seat}: ${a.text}`);
  return out.join('\n');
}
