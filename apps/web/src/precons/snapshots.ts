/**
 * The precon snapshots that ship with the app (D-137): every `snapshots/<id>.json`, written by
 * `pnpm precon:snapshot` and committed. With none present the list is empty and the menu says so;
 * nothing here is a fallback or a made-up deck.
 */
import {
  canonicalDeck,
  fromSnapshotCard,
  normalizeNameKey,
  type PreconSnapshot,
  parseDecklist,
  parsePreconSnapshot,
} from '@commander-arena/cards';
import { indexByName } from './snapshot-client';

/** What the menu shows of a precon. */
export interface PreconInfo {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** The commander's card name, from the decklist's Commander section; empty when it has none. */
  readonly commander: string;
  /** The decklist exactly as shipped. */
  readonly decklist: string;
}

export interface LoadedSnapshots {
  /** The valid snapshots, sorted by id. */
  readonly snapshots: readonly PreconSnapshot[];
  /** One line per file that was skipped: unreadable, not a snapshot, or named differently. */
  readonly problems: readonly string[];
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const fileId = (path: string): string => {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base.endsWith('.json') ? base.slice(0, -'.json'.length) : base;
};

/** Reads the modules of the glob (path to parsed JSON). A bad file is skipped and reported. */
export function loadSnapshots(modules: Readonly<Record<string, unknown>>): LoadedSnapshots {
  const snapshots: PreconSnapshot[] = [];
  const problems: string[] = [];
  for (const path of Object.keys(modules).sort(compare)) {
    const parsed = parsePreconSnapshot(modules[path]);
    if (!parsed.ok) {
      problems.push(`${path}: ${parsed.error}`);
    } else if (parsed.snapshot.id !== fileId(path)) {
      problems.push(`${path}: the file name does not match the id "${parsed.snapshot.id}"`);
    } else if (snapshots.some((known) => known.id === parsed.snapshot.id)) {
      problems.push(`${path}: the id "${parsed.snapshot.id}" is used twice`);
    } else {
      snapshots.push(parsed.snapshot);
    }
  }
  return { snapshots: snapshots.sort((a, b) => compare(a.id, b.id)), problems };
}

/** The card name of the commander of a snapshot's decklist, as the snapshot's cards spell it. */
function commanderOf(snapshot: PreconSnapshot): string {
  const written = canonicalDeck(parseDecklist(snapshot.decklist)).commander[0]?.name;
  if (written === undefined) return '';
  const card = indexByName(snapshot.cards.map(fromSnapshotCard))(normalizeNameKey(written));
  return card?.name ?? written;
}

export function infoOf(snapshot: PreconSnapshot): PreconInfo {
  return {
    id: snapshot.id,
    name: snapshot.name,
    blurb: snapshot.blurb,
    commander: commanderOf(snapshot),
    decklist: snapshot.decklist,
  };
}

/** The glob is eager and matches nothing when no snapshot has been generated yet. */
export const SHIPPED: LoadedSnapshots = loadSnapshots(
  import.meta.glob('./snapshots/*.json', { eager: true, import: 'default' }),
);
