/**
 * The deck import screen (M4, SPEC 6, 7.1): paste a list, see what Scryfall and the parser
 * made of it, see why a card is unsupported and save the deck (it is played from the menu).
 */
import { useCallback, useEffect, useState } from 'react';
import { markCommanders } from '../../import';
import type { SavedDeck } from '../../import/types';
import type { DeckChoice } from '../../precons';
import type { ImportTab } from '../../store';
import { usePrecons } from '../precons-context';
import { useActions, useApp } from '../store-context';
import { useDeckChoices } from '../use-deck-choices';
import { type EditingPrecon, InputPanel } from './InputPanel';
import { useImportEnv } from './import-context';
import { SavedDecksView } from './ListViews';
import { sampleOf } from './model';
import { PreconDecksView } from './PreconDecksView';
import { OfflineNotice, ResultsView } from './ResultsView';
import { useImportFlow } from './use-import-flow';
import { WhyDialog } from './WhyDialog';
import './import.css';

type DialogState = { readonly kind: 'why'; readonly oracleId: string } | null;

const TABS: readonly { readonly id: ImportTab; readonly label: string }[] = [
  { id: 'import', label: 'Paste a list' },
  { id: 'decks', label: 'Your decks' },
];

export function ImportScreen() {
  const env = useImportEnv();
  const actions = useActions();
  const precons = usePrecons();
  const sample = sampleOf(precons.list);
  const initialTab = useApp((s) => s.importTab);
  const [tab, setTab] = useState<ImportTab>(initialTab);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [decks, setDecks] = useState<readonly SavedDeck[] | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // The precon the editor is open on, when it is one (issue 93, D-215).
  const [editing, setEditing] = useState<{ readonly id: string; readonly name: string } | null>(
    null,
  );
  const { choices, refresh: refreshChoices } = useDeckChoices();

  const refreshDecks = useCallback(() => {
    env.decks.list().then(setDecks, () => setDecks(null));
    refreshChoices();
  }, [env, refreshChoices]);

  const flow = useImportFlow(env);

  useEffect(() => {
    refreshDecks();
  }, [refreshDecks]);

  const report = flow.report;
  const dialogCard =
    dialog?.kind === 'why' && report !== null
      ? report.entries.find((e) => e.card.stored.oracleId === dialog.oracleId)?.card
      : undefined;

  const defaultListOf = (id: string): string =>
    precons.list.find((precon) => precon.id === id)?.decklist ?? '';

  const save = async () => {
    // A commander chosen above, because the list marks none, is part of the deck: it is written
    // into the saved text, or the deck forgets it on the next load (issue 123).
    const text = markCommanders(flow.text, flow.commanderNames);
    try {
      if (editing === null) {
        await env.decks.save({ name: flow.name.trim(), text });
        setSaveMessage(`Saved "${flow.name.trim()}".`);
      } else if (text.trim() === defaultListOf(editing.id).trim()) {
        // The shipped list again: nothing to keep apart.
        await env.decks.removeOverride(editing.id);
        setSaveMessage(
          `That is the list "${editing.name}" came with, so no version of yours is kept.`,
        );
      } else {
        await env.decks.saveOverride(editing.id, editing.name, text);
        setSaveMessage(
          `Saved your version of "${editing.name}". The built-in deck is unchanged; Reset to default brings it back.`,
        );
      }
      // The field shows what was kept, so editing on from here starts from the saved list.
      if (text !== flow.text) flow.setText(text);
      refreshDecks();
    } catch (e) {
      setSaveMessage(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** Opens a precon in the editor: your saved version of it, or the list it shipped with. */
  const editPrecon = async (precon: DeckChoice) => {
    const mine = (await env.decks.overrides()).find((deck) => deck.preconId === precon.id);
    setEditing({ id: precon.id, name: precon.name });
    setSaveMessage(null);
    setTab('import');
    void flow.start({
      text: mine?.text ?? defaultListOf(precon.id),
      name: precon.name,
      service: precons.editorService(precon.id),
    });
  };

  /** "Reset to default": forgets your version; an editor open on that precon shows the shipped list again. */
  const resetPrecon = async (precon: { readonly id: string; readonly name: string }) => {
    try {
      await env.decks.removeOverride(precon.id);
    } catch (e) {
      setSaveMessage(`Could not reset: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (editing?.id === precon.id) {
      void flow.start({
        text: defaultListOf(precon.id),
        name: precon.name,
        service: precons.editorService(precon.id),
      });
    }
    setSaveMessage(`"${precon.name}" is back to the list it came with.`);
    refreshDecks();
  };

  const editingPrecon: EditingPrecon | null =
    editing === null
      ? null
      : {
          name: editing.name,
          edited: choices.some((choice) => choice.id === editing.id && choice.edited),
          onReset: () => void resetPrecon(editing),
          onStop: () => {
            setEditing(null);
            flow.readFromScryfall();
            setSaveMessage(null);
          },
        };

  const openSaved = (deck: SavedDeck) => {
    setEditing(null);
    setSaveMessage(null);
    setTab('import');
    void flow.start({ text: deck.text, name: deck.name });
  };

  return (
    <main className="imp-screen">
      <header className="imp-head">
        <button type="button" className="scr-btn" onClick={() => actions.backToMenu()}>
          Back to menu
        </button>
        <h1>Deck import</h1>
        <nav aria-label="Import sections" className="imp-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="scr-btn imp-tab"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'import' && (
        <div className="imp-body">
          <InputPanel
            text={flow.text}
            name={flow.name}
            running={flow.running}
            progress={flow.progress}
            saveMessage={saveMessage}
            onText={flow.setText}
            onName={flow.setName}
            onImport={() => void flow.start()}
            onExample={
              sample === null
                ? null
                : () => {
                    flow.setText(sample.text);
                    flow.setName(sample.name);
                  }
            }
            onSave={() => void save()}
            precon={editingPrecon}
          />
          {flow.error !== null && (
            <div role="alert" className="imp-alert">
              <p>The import failed: {flow.error}</p>
              <OfflineNotice />
            </div>
          )}
          {report !== null && (
            <ResultsView
              report={report}
              actions={{
                busy: flow.running,
                rejectedFuzzy: flow.rejectedFuzzy,
                onAccept: (r) => void flow.acceptFuzzy(r),
                onReject: flow.rejectFuzzy,
                onChooseCommanders: (names) => void flow.chooseCommanders(names),
                onWhy: (oracleId) => setDialog({ kind: 'why', oracleId }),
              }}
            />
          )}
        </div>
      )}
      {tab === 'decks' && (
        <div className="imp-body">
          <SavedDecksView
            decks={decks}
            loading={decks === null}
            onOpen={openSaved}
            onRemove={(deck) => void env.decks.remove(deck.id).then(refreshDecks)}
          />
          <PreconDecksView
            precons={choices.filter((choice) => choice.kind === 'precon')}
            onEdit={(precon) => void editPrecon(precon)}
            onReset={(precon) => void resetPrecon(precon)}
          />
        </div>
      )}

      {dialog?.kind === 'why' && dialogCard !== undefined && (
        <WhyDialog card={dialogCard} onClose={() => setDialog(null)} />
      )}
    </main>
  );
}
