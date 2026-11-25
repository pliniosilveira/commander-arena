/**
 * The deck import screen (M4, SPEC 6, 7.1): paste a list, see what Scryfall and the parser
 * made of it, see why a card is unsupported. Import also saves the deck (it is played from the menu).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { markCommanders } from '../../import';
import type { ImportService, SavedDeck } from '../../import/types';
import type { DeckChoice } from '../../precons';
import type { ImportTab } from '../../store';
import { usePrecons } from '../precons-context';
import { useActions, useApp } from '../store-context';
import { useDeckChoices } from '../use-deck-choices';
import { type CardPrint, findPrints } from './card-prints';
import { DeckScreen } from './DeckScreen';
import { withPreferredPrintings, withPrinting } from './deck-text';
import { type EditingPrecon, InputPanel } from './InputPanel';
import { useImportEnv } from './import-context';
import { SavedDecksView } from './ListViews';
import { loadNiceArt, saveNiceArt, withNiceCommanderArt } from './nice-art';
import { PreconDecksView } from './PreconDecksView';
import { preferPrint, preferredPrints } from './preferred-prints';
import { OfflineNotice, ResultsView } from './ResultsView';
import { useImportFlow } from './use-import-flow';
import { WhyDialog } from './WhyDialog';
import './import.css';

const DEFAULT_DECK_NAME = 'My Commander deck';

type DialogState = { readonly kind: 'why'; readonly oracleId: string } | null;

const TABS: readonly { readonly id: ImportTab; readonly label: string }[] = [
  { id: 'import', label: 'Paste a list' },
  { id: 'decks', label: 'My decks' },
];

export function ImportScreen() {
  const env = useImportEnv();
  const actions = useActions();
  const precons = usePrecons();
  const initialTab = useApp((s) => s.importTab);
  const [tab, setTab] = useState<ImportTab>(initialTab);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [decks, setDecks] = useState<readonly SavedDeck[] | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // The precon the editor is open on, when it is one (issue 93, D-215).
  const [editing, setEditing] = useState<{ readonly id: string; readonly name: string } | null>(
    null,
  );
  // The deck on the deck screen (View), read through the service that knows its cards.
  const [viewing, setViewing] = useState<{
    readonly name: string;
    readonly text: string;
    readonly service: ImportService;
    /** Absent for a built-in deck: its printings are not offered. */
    readonly onSave?: (text: string) => Promise<void>;
    readonly onSaveAll?: (cardName: string, print: CardPrint) => Promise<void>;
  } | null>(null);
  const { choices, refresh: refreshChoices, setPreconEnabled } = useDeckChoices();

  const refreshDecks = useCallback(() => {
    env.decks.list().then(setDecks, () => setDecks(null));
    refreshChoices();
  }, [env, refreshChoices]);

  const flow = useImportFlow(env);
  const [niceArt, setNiceArt] = useState(loadNiceArt);

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

  /**
   * Import saves the deck too (issue 512): the saved list is the one just imported, so each report of
   * the run keeps it current (a close match accepted, a commander chosen). A deck opened from
   * "My decks" is already saved and is not written again until it is imported anew.
   */
  const save = async () => {
    // A commander chosen above, because the list marks none, is part of the deck: it is written
    // into the saved text, or the deck forgets it on the next load (issue 123).
    const marked = markCommanders(flow.text, flow.commanderNames);
    // A new deck gets the art the player chose for all decks (a deck being edited keeps its own list).
    const text = editing === null ? withPreferredPrintings(marked, preferredPrints()) : marked;
    // No name typed: the commander names the deck, so Import never leaves a deck unsaved.
    const name = flow.name.trim() || report?.commanders[0]?.stored.name || DEFAULT_DECK_NAME;
    try {
      if (editing === null) {
        await env.decks.save({ name, text });
        setSaveMessage(`Imported and saved "${name}".`);
        if (flow.name.trim() === '') flow.setName(name);
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

  // Every new report of an import the player started is saved; `latestSave` is the render's own closure.
  const keepSaved = useRef(false);
  const latestSave = useRef(save);
  latestSave.current = save;
  useEffect(() => {
    if (keepSaved.current && report !== null) void latestSave.current();
  }, [report]);

  /** "Reset to default": forgets your version; an editor open on that precon shows the shipped list again. */
  const resetPrecon = async (precon: { readonly id: string; readonly name: string }) => {
    try {
      await env.decks.removeOverride(precon.id);
    } catch (e) {
      setSaveMessage(`Could not reset: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (editing?.id === precon.id) {
      keepSaved.current = false;
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

  const viewPrecon = async (precon: DeckChoice) => {
    const mine = (await env.decks.overrides()).find((deck) => deck.preconId === precon.id);
    setViewing({
      name: precon.name,
      text: mine?.text ?? defaultListOf(precon.id),
      service: precons.editorService(precon.id),
    });
  };

  const openSaved = (deck: SavedDeck) => {
    setEditing(null);
    setSaveMessage(null);
    setTab('import');
    keepSaved.current = false;
    void flow.start({ text: deck.text, name: deck.name });
  };

  if (viewing !== null) {
    return <DeckScreen {...viewing} onBack={() => setViewing(null)} />;
  }

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
            niceArt={niceArt}
            onNiceArt={(on) => {
              setNiceArt(on);
              saveNiceArt(on);
            }}
            onImport={() => {
              keepSaved.current = true;
              setSaveMessage(null);
              void (async () => {
                // The option writes a special printing on the commander's line before the list is imported.
                if (niceArt && editingPrecon === null) {
                  const next = await withNiceCommanderArt(flow.text, findPrints);
                  if (next !== flow.text) {
                    await flow.start({ text: next, name: flow.name });
                    return;
                  }
                }
                await flow.start();
              })();
            }}
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
            choices={choices}
            loading={decks === null}
            onOpen={openSaved}
            onView={(deck) =>
              setViewing({
                name: deck.name,
                text: deck.text,
                service: env.service,
                onSave: (text) => env.decks.save({ name: deck.name, text }).then(refreshDecks),
                onSaveAll: async (cardName, print) => {
                  const set = print.setCode.toLowerCase();
                  preferPrint(cardName, set, print.collector);
                  // Every other saved deck that has the card gets the printing now.
                  for (const other of await env.decks.list()) {
                    if (other.id === deck.id) continue;
                    const next = withPrinting(other.text, cardName, set, print.collector);
                    if (next !== null && next !== other.text) {
                      await env.decks.save({ name: other.name, text: next });
                    }
                  }
                  refreshDecks();
                },
              })
            }
            onRemove={(deck) => void env.decks.remove(deck.id).then(refreshDecks)}
          />
          <PreconDecksView
            precons={choices.filter((choice) => choice.kind === 'precon')}
            onToggle={setPreconEnabled}
            onView={(precon) => void viewPrecon(precon)}
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
