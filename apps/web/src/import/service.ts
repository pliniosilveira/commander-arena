/**
 * The import service (M4, SPEC 6, 7.1): decklist text in, an `ImportReport` out. It parses the
 * text, resolves names through the Scryfall client, converts every found card with its support
 * status (cached per parser version), decides the commanders, validates the deck and computes the
 * coverage numbers. It never throws on bad input: whatever went wrong shows up in the report.
 */
import {
  type CanonicalEntry,
  cachedSupport,
  canonicalDeck,
  type DeckSection,
  eligibleCommanders,
  type ImportedCard,
  importCard,
  type MeldLookup,
  normalizeNameKey,
  type OverrideRegistry,
  PARSER_VERSION,
  parseDecklist,
  type ResolveResult,
  relatedLookup,
  type ScryfallClient,
  type StoredCard,
  type SupportCache,
  validateDeck,
} from '@commander-arena/cards';
import { computeCoverage } from './coverage';
import type {
  FuzzyPending,
  ImportedEntry,
  ImportInput,
  ImportPhase,
  ImportReport,
  ImportService,
  NameProblem,
} from './types';

export interface ImportServiceOptions {
  readonly client: ScryfallClient;
  readonly supportCache: SupportCache;
  /** Defaults to `PARSER_VERSION`; tests pass another one to simulate a bump. */
  readonly parserVersion?: number;
  /**
   * What `importCard` consults before the parser. Defaults to the engine's fixtures; tests pass
   * another registry.
   */
  readonly overrides?: OverrideRegistry;
}

const IGNORED_SECTIONS: readonly DeckSection[] = ['sideboard', 'maybeboard', 'companion'];

interface Row {
  readonly key: string;
  readonly name: string;
  readonly count: number;
  readonly line: number;
}

function rowOf(entry: CanonicalEntry): Row {
  return {
    key: normalizeNameKey(entry.name),
    name: entry.name,
    count: entry.count,
    line: entry.line,
  };
}

/** Every key a stored card answers to when a player writes its name. */
function nameKeys(card: StoredCard): string[] {
  const keys = new Set<string>([normalizeNameKey(card.name)]);
  for (const face of card.faces) keys.add(normalizeNameKey(face.name));
  return [...keys];
}

/** The melded faces the client fetched with the deck (D-994), once each. */
function meldFacesOf(resolved: ResolveResult): StoredCard[] {
  const faces = new Map<string, StoredCard>();
  for (const entry of resolved.related?.values() ?? []) {
    if (entry.kind === 'card') faces.set(entry.card.oracleId, entry.card);
  }
  return [...faces.values()];
}

function failureResult(names: readonly string[], message: string): ResolveResult {
  return {
    found: new Map(),
    notFound: [],
    fuzzy: [],
    failures: names.map((requested) => ({ requested, message })),
  };
}

/** Distinct rows by key, in first-seen order, with counts added and the smallest line kept. */
function mergeRows(rows: readonly Row[]): Row[] {
  const merged = new Map<string, Row>();
  for (const row of rows) {
    const known = merged.get(row.key);
    merged.set(
      row.key,
      known
        ? { ...known, count: known.count + row.count, line: Math.min(known.line, row.line) }
        : row,
    );
  }
  return [...merged.values()];
}

export function createImportService(options: ImportServiceOptions): ImportService {
  const parserVersion = options.parserVersion ?? PARSER_VERSION;

  /**
   * D-994: a meld card is read with its melded face, the card the client fetched with the deck (`ResolveResult.related`); the support report of a meld card is
   * worked out for the import being made and never taken from the cache, which cannot know whether that card was had.
   */
  async function convert(stored: StoredCard, meldFaces: MeldLookup): Promise<ImportedCard> {
    const support = await cachedSupport(
      options.supportCache,
      stored,
      parserVersion,
      options.overrides,
      meldFaces,
    );
    return {
      ...importCard(stored, parserVersion, options.overrides, undefined, undefined, meldFaces),
      support,
    };
  }

  return {
    async run(input: ImportInput): Promise<ImportReport> {
      const progress = (phase: ImportPhase, done: number, total: number): void => {
        input.onProgress?.({ phase, done, total });
      };

      progress('parsing', 0, 1);
      const parse = parseDecklist(input.text);
      const canonical = canonicalDeck(parse);
      progress('parsing', 1, 1);

      const commanderRows = canonical.commander.map(rowOf);
      const mainRows = canonical.main.map(rowOf);
      const ignored = IGNORED_SECTIONS.flatMap((section) =>
        canonical[section].map((entry) => ({ name: entry.name, section, count: entry.count })),
      );

      // Resolve each distinct name once, commander section first.
      const requested = mergeRows([...commanderRows, ...mainRows]);
      progress('resolving', 0, requested.length);
      const names = requested.map((row) => row.name);
      let resolved: ResolveResult;
      try {
        resolved =
          names.length === 0 ? failureResult([], '') : await options.client.resolveNames(names);
      } catch (error) {
        resolved = failureResult(names, error instanceof Error ? error.message : String(error));
      }
      progress('resolving', requested.length, requested.length);

      const accepted = new Set((input.acceptedFuzzy ?? []).map(normalizeNameKey));
      const cards = new Map<string, StoredCard>(resolved.found);
      const fuzzy: FuzzyPending[] = [];
      for (const match of resolved.fuzzy) {
        const key = normalizeNameKey(match.requested);
        const row = requested.find((candidate) => candidate.key === key);
        if (accepted.has(key)) cards.set(key, match.candidate);
        else {
          fuzzy.push({
            requested: match.requested,
            candidate: match.candidate,
            count: row ? row.count : 0,
          });
        }
      }
      const reasons = new Map<string, string>();
      for (const name of resolved.notFound) reasons.set(normalizeNameKey(name), 'not-found');
      for (const failure of resolved.failures) {
        reasons.set(normalizeNameKey(failure.requested), failure.message);
      }
      const notFound = requested
        .filter((row) => reasons.has(row.key) && !cards.has(row.key))
        .map(
          (row): NameProblem => ({
            name: row.name,
            count: row.count,
            line: row.line,
            reason: reasons.get(row.key) ?? 'not-found',
          }),
        );

      // Convert every distinct resolved card once, with its (cached) support status.
      const distinct = new Map<string, StoredCard>();
      for (const row of requested) {
        const card = cards.get(row.key);
        if (card) distinct.set(card.oracleId, card);
      }
      const meldFaces = relatedLookup(resolved.related);
      progress('converting', 0, distinct.size);
      const imported = new Map<string, ImportedCard>();
      for (const [oracleId, stored] of distinct) {
        imported.set(oracleId, await convert(stored, meldFaces));
        progress('converting', imported.size, distinct.size);
      }
      const importedFor = (row: Row): ImportedCard | undefined => {
        const card = cards.get(row.key);
        return card ? imported.get(card.oracleId) : undefined;
      };

      progress('validating', 0, 1);
      // Counts of the main section by card, in list order; commanders are taken out of it below.
      const mainCounts = new Map<string, { card: ImportedCard; count: number }>();
      const addMain = (card: ImportedCard, count: number): void => {
        if (count <= 0) return;
        const known = mainCounts.get(card.stored.oracleId);
        if (known) known.count += count;
        else mainCounts.set(card.stored.oracleId, { card, count });
      };
      for (const row of mergeRows(mainRows)) {
        const card = importedFor(row);
        if (card) addMain(card, row.count);
      }

      const commanders: ImportedCard[] = [];
      let commanderChoices: StoredCard[] = [];
      const marked = parse.hasCommanderMarking && commanderRows.length > 0;
      if (marked) {
        // The commander section names the commanders; extra copies of one stay in the main deck.
        for (const row of mergeRows(commanderRows)) {
          const card = importedFor(row);
          if (!card) continue;
          if (!commanders.some((known) => known.stored.oracleId === card.stored.oracleId)) {
            commanders.push(card);
            addMain(card, row.count - 1);
          } else addMain(card, row.count);
        }
      } else {
        commanderChoices = eligibleCommanders([...mainCounts.values()].map((e) => e.card.stored));
        const wanted = (input.commanderNames ?? []).map(normalizeNameKey);
        for (const key of wanted) {
          const found = [...mainCounts.values()].find((entry) =>
            nameKeys(entry.card.stored).includes(key),
          );
          if (found && !commanders.includes(found.card)) commanders.push(found.card);
        }
        for (const commander of commanders) {
          const entry = mainCounts.get(commander.stored.oracleId);
          if (entry) {
            entry.count -= 1;
            if (entry.count <= 0) mainCounts.delete(commander.stored.oracleId);
          }
        }
      }

      const entries: ImportedEntry[] = [
        ...commanders.map((card) => ({ card, count: 1, section: 'commander' as const })),
        ...[...mainCounts.values()].map(({ card, count }) => ({
          card,
          count,
          section: 'main' as const,
        })),
      ];
      const coverage = computeCoverage(entries);
      const commanderRules =
        commanders.length === 0
          ? null
          : validateDeck({
              commanders: commanders.map((card) => card.stored),
              main: [...mainCounts.values()].map(({ card, count }) => ({
                card: card.stored,
                count,
              })),
            });
      // D-056: a deck with a card the engine cannot fully run is not valid, so it cannot be played.
      const unsupportedNames = coverage.unsupported.map((entry) => entry.card.stored.name);
      const validation =
        commanderRules === null || unsupportedNames.length === 0
          ? commanderRules
          : {
              ok: false,
              issues: [
                {
                  severity: 'error' as const,
                  code: 'unsupported',
                  message: `${unsupportedNames.length} ${
                    unsupportedNames.length === 1 ? 'card has' : 'cards have'
                  } abilities the engine cannot run yet, so the deck cannot be played. Replace ${
                    unsupportedNames.length === 1 ? 'it' : 'them'
                  }.`,
                  cards: unsupportedNames,
                },
                ...commanderRules.issues,
              ],
            };
      progress('validating', 1, 1);

      const report: ImportReport = {
        deckName: input.deckName,
        parse,
        entries,
        notFound,
        fuzzy,
        ignored,
        commanderChoices,
        commanders,
        validation,
        coverage,
        ...(meldFacesOf(resolved).length === 0 ? {} : { meldFaces: meldFacesOf(resolved) }),
        playable:
          notFound.length === 0 &&
          fuzzy.length === 0 &&
          commanders.length > 0 &&
          unsupportedNames.length === 0 &&
          validation?.ok === true,
      };
      progress('done', 1, 1);
      return report;
    },
  };
}
