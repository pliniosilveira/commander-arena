/**
 * The importer's state: the pasted text, the latest report and the choices the player made while
 * resolving it (accepted close matches, chosen commanders). Every choice re-runs the import over
 * the text the report was made from, keeping the earlier choices.
 */
import { useCallback, useRef, useState } from 'react';
import type {
  ImportEnvironment,
  ImportProgress,
  ImportReport,
  ImportService,
} from '../../import/types';

export interface ImportFlow {
  readonly text: string;
  readonly name: string;
  readonly report: ImportReport | null;
  readonly progress: ImportProgress | null;
  readonly running: boolean;
  /** A thrown failure of the whole import (a failure per name is in the report). */
  readonly error: string | null;
  readonly rejectedFuzzy: readonly string[];
  /** The commanders the player chose because the list marks none (exact card names). */
  readonly commanderNames: readonly string[];
  setText(text: string): void;
  setName(name: string): void;
  /**
   * A fresh import of the text field: earlier choices are dropped. With `override` the field is
   * filled in first. `service` is the one that reads the names from then on (an edited precon reads
   * its own cards from the snapshot); left out, the page's Scryfall service reads them.
   */
  start(override?: {
    text: string;
    name: string;
    service?: ImportService | undefined;
  }): Promise<void>;
  /** Back to the page's Scryfall service for the next imports (the player left a precon). */
  readFromScryfall(): void;
  acceptFuzzy(requested: string): Promise<void>;
  rejectFuzzy(requested: string): void;
  chooseCommanders(names: readonly string[]): Promise<void>;
}

export function useImportFlow(env: ImportEnvironment): ImportFlow {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commanderNames, setCommanderNames] = useState<readonly string[]>([]);
  const [acceptedFuzzy, setAcceptedFuzzy] = useState<readonly string[]>([]);
  const [rejectedFuzzy, setRejectedFuzzy] = useState<readonly string[]>([]);
  /** The text and name the current report was made from. */
  const source = useRef({ text: '', name: '' });
  const generation = useRef(0);
  /** Reads the names; null means the page's service. Set when a precon is opened for editing (D-215). */
  const service = useRef<ImportService | null>(null);

  const execute = useCallback(
    async (
      input: { text: string; name: string },
      commanders: readonly string[],
      fuzzy: readonly string[],
    ) => {
      generation.current += 1;
      const mine = generation.current;
      source.current = input;
      setRunning(true);
      setError(null);
      setProgress({ phase: 'parsing', done: 0, total: 0 });
      try {
        const next = await (service.current ?? env.service).run({
          text: input.text,
          deckName: input.name,
          commanderNames: commanders,
          acceptedFuzzy: fuzzy,
          onProgress: (p) => {
            if (generation.current === mine) setProgress(p);
          },
        });
        if (generation.current !== mine) return;
        setReport(next);
      } catch (e) {
        if (generation.current !== mine) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (generation.current === mine) {
          setRunning(false);
          setProgress(null);
        }
      }
    },
    [env],
  );

  const start = useCallback(
    async (override?: { text: string; name: string; service?: ImportService | undefined }) => {
      const input =
        override === undefined ? { text, name } : { text: override.text, name: override.name };
      if (override !== undefined) {
        setText(override.text);
        setName(override.name);
        service.current = override.service ?? null;
      }
      setCommanderNames([]);
      setAcceptedFuzzy([]);
      setRejectedFuzzy([]);
      await execute(input, [], []);
    },
    [execute, text, name],
  );

  const readFromScryfall = useCallback(() => {
    service.current = null;
  }, []);

  const acceptFuzzy = useCallback(
    async (requested: string) => {
      const next = acceptedFuzzy.includes(requested)
        ? acceptedFuzzy
        : [...acceptedFuzzy, requested];
      setAcceptedFuzzy(next);
      await execute(source.current, commanderNames, next);
    },
    [execute, acceptedFuzzy, commanderNames],
  );

  const rejectFuzzy = useCallback((requested: string) => {
    setRejectedFuzzy((prev) => (prev.includes(requested) ? prev : [...prev, requested]));
  }, []);

  const chooseCommanders = useCallback(
    async (names: readonly string[]) => {
      setCommanderNames(names);
      await execute(source.current, names, acceptedFuzzy);
    },
    [execute, acceptedFuzzy],
  );

  return {
    text,
    name,
    report,
    progress,
    running,
    error,
    rejectedFuzzy,
    commanderNames,
    setText,
    setName,
    start,
    readFromScryfall,
    acceptFuzzy,
    rejectFuzzy,
    chooseCommanders,
  };
}
