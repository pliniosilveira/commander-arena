/** Pure helpers for the log panel: filtering, grouping by turn and picking the preview object. */
import type { ObjectId, ObjectView, SeatId } from '@commander-arena/engine';
import type { LogEntry } from '../../game/protocol';
import { turnOwner } from '../../game/turn-label';

export interface LogFilter {
  /** False shows only major entries; true shows every detail line too. */
  readonly detail: boolean;
}

export const DEFAULT_LOG_FILTER: LogFilter = { detail: false };

export function filterLog(entries: readonly LogEntry[], filter: LogFilter): readonly LogEntry[] {
  return filter.detail ? entries : entries.filter((e) => e.level === 'major');
}

export interface TurnGroup {
  readonly turn: number;
  /** Whose turn it was and its round, from the group's first entry (D-153); absent in an old log. */
  readonly activeSeat?: SeatId;
  readonly round?: number;
  readonly entries: readonly LogEntry[];
}

/** Consecutive entries of one turn form a group; the log is already in game order. */
export function groupByTurn(entries: readonly LogEntry[]): readonly TurnGroup[] {
  const groups: {
    turn: number;
    activeSeat?: SeatId;
    round?: number;
    entries: LogEntry[];
  }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.turn === entry.turn) last.entries.push(entry);
    else {
      groups.push({
        turn: entry.turn,
        ...(entry.activeSeat === undefined ? {} : { activeSeat: entry.activeSeat }),
        ...(entry.round === undefined ? {} : { round: entry.round }),
        entries: [entry],
      });
    }
  }
  return groups;
}

export const turnHeading = (turn: number): string => (turn <= 0 ? 'Setup' : `Turn ${turn}`);

/**
 * The heading of a group: "Setup", then "Your turn 5" or "Opponent's turn 5" (the owner's naming,
 * D-153: the official word, numbered by round). A log without the seat and round falls back to
 * the engine's turn number.
 */
export function groupHeading(group: TurnGroup, viewer: SeatId): string {
  if (group.turn <= 0) return 'Setup';
  if (group.activeSeat === undefined || group.round === undefined) return turnHeading(group.turn);
  return `${turnOwner(group.activeSeat, viewer)} turn ${group.round}`;
}

/** The first object an entry mentions that can still be shown (it is in `known`), else null. */
export function previewTarget(entry: LogEntry, known: ReadonlySet<ObjectId>): ObjectId | null {
  return entry.objects.find((id) => known.has(id)) ?? null;
}

/** A piece of a log line: plain text, or the name of an object the player can still preview. */
export type NameSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'name'; readonly text: string; readonly id: ObjectId };

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds the names of the objects in view inside a log line, so each can be hovered to show that card
 * in the preview panel (issue 34). A name stands for the object the entry itself mentions when it
 * has that name, otherwise for an object in view with the name (a creature that died is a new object
 * in the graveyard, CR 400.7, and its card is what the preview shows). Names are matched whole, the
 * longest first, so "Zombie Token" is not read as "Zombie".
 */
export function nameLinker(
  index: ReadonlyMap<ObjectId, ObjectView>,
): (text: string, entryObjects: readonly ObjectId[]) => readonly NameSegment[] {
  const byName = new Map<string, ObjectId>();
  for (const o of index.values()) {
    if (o.name.length >= 3 && !byName.has(o.name)) byName.set(o.name, o.id);
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const pattern =
    names.length === 0
      ? null
      : new RegExp(
          `(?<![\\p{L}\\p{N}])(?:${names.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`,
          'gu',
        );
  return (text, entryObjects) => {
    if (pattern === null) return [{ kind: 'text', text }];
    const mine = new Map<string, ObjectId>();
    for (const id of entryObjects) {
      const name = index.get(id)?.name;
      if (name !== undefined && !mine.has(name)) mine.set(name, id);
    }
    const out: NameSegment[] = [];
    let at = 0;
    for (const m of text.matchAll(pattern)) {
      const id = mine.get(m[0]) ?? byName.get(m[0]);
      if (id === undefined) continue;
      if (m.index > at) out.push({ kind: 'text', text: text.slice(at, m.index) });
      out.push({ kind: 'name', text: m[0], id });
      at = m.index + m[0].length;
    }
    if (at < text.length) out.push({ kind: 'text', text: text.slice(at) });
    return out;
  };
}
