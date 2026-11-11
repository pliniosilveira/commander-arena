import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { computeCoverage } from '../src/import/coverage';
import { MemoryDeckStore } from '../src/import/stores';
import type { ImportEnvironment, ImportReport } from '../src/import/types';
import { createAppStore } from '../src/store';
import { ImportScreen } from '../src/ui/import/ImportScreen';
import { InputPanel } from '../src/ui/import/InputPanel';
import { ImportProvider } from '../src/ui/import/import-context';
import { SavedDecksView } from '../src/ui/import/ListViews';
import { PlayNote } from '../src/ui/import/PlayNote';
import { type ResultsActions, ResultsView } from '../src/ui/import/ResultsView';
import { WhyDialog } from '../src/ui/import/WhyDialog';
import { Menu } from '../src/ui/screens/Menu';
import { StoreProvider } from '../src/ui/store-context';
import {
  BEAR,
  BOTH_GAPS,
  COMMANDER,
  ENGINE_GAP,
  emptyReport,
  entry,
  LEGACY,
  playableReport,
  SEER,
  UNBOUND,
  VALID,
} from './import-ui-fixtures';

const noActions: ResultsActions = {
  busy: false,
  rejectedFuzzy: [],
  onAccept: () => {},
  onReject: () => {},
  onChooseCommanders: () => {},
  onWhy: () => {},
};

const fakeEnv = (): ImportEnvironment => ({
  service: {
    run: async () => {
      throw new Error('not used');
    },
  },
  decks: new MemoryDeckStore(() => 0),
});

const results = (report: ImportReport, actions: ResultsActions = noActions) =>
  renderToStaticMarkup(
    <ImportProvider environment={fakeEnv()}>
      <ResultsView report={report} actions={actions} />
    </ImportProvider>,
  );

describe('ResultsView', () => {
  test('an empty report says nothing was found and gives the reason it cannot be played', () => {
    const out = results(emptyReport());
    expect(out).toContain('No cards were found in that text');
    expect(out).toContain('The deck cannot be played yet');
    expect(out).toContain('No commander is chosen yet.');
    expect(out).not.toContain('Play this deck');
  });

  test('parse errors show line numbers and the offending text', () => {
    const base = playableReport();
    const out = results(
      playableReport({
        parse: {
          ...base.parse,
          errors: [{ line: 7, text: '??? what is this', message: 'Could not read this line' }],
        },
      }),
    );
    expect(out).toContain('Lines that could not be read (1)');
    expect(out).toContain('Line 7:');
    expect(out).toContain('??? what is this');
  });

  test('names not found and lookup failures are separate sections with lines and counts', () => {
    const out = results(
      emptyReport({
        notFound: [
          { name: 'Missing Card', count: 3, line: 4, reason: 'not-found' },
          { name: 'Offline Card', count: 1, line: 9, reason: 'network error' },
        ],
      }),
    );
    expect(out).toContain('Cards Scryfall could not find (1)');
    expect(out).toContain('Missing Card');
    expect(out).toContain('×3');
    expect(out).toContain('(line 4)');
    expect(out).toContain('Cards that could not be looked up (1)');
    expect(out).toContain('network error');
  });

  test('every failed name with nothing resolved shows the offline notice', () => {
    const out = results(
      emptyReport({ notFound: [{ name: 'A', count: 1, line: 1, reason: 'network error' }] }),
    );
    expect(out).toContain('Scryfall could not be reached');
    expect(out).toContain('Quick start');
  });

  test('pending close matches ask "Did you mean" with Accept and Reject', () => {
    const out = results(
      emptyReport({
        fuzzy: [{ requested: 'Bear Cub', candidate: BEAR.stored, count: 2 }],
      }),
    );
    expect(out).toContain('Close matches to confirm (1)');
    expect(out).toContain('Did you mean');
    expect(out).toContain('SYNTHETIC Bear');
    expect(out).toContain('>Accept<');
    expect(out).toContain('>Reject<');
  });

  test('a rejected close match offers no buttons', () => {
    const out = results(
      emptyReport({ fuzzy: [{ requested: 'Bear Cub', candidate: BEAR.stored, count: 1 }] }),
      { ...noActions, rejectedFuzzy: ['Bear Cub'] },
    );
    expect(out).not.toContain('>Accept<');
    expect(out).toContain('Rejected');
  });

  test('commander choices show a picker when no commander is set', () => {
    const out = results(
      emptyReport({
        entries: [entry(BEAR)],
        commanderChoices: [COMMANDER.stored],
      }),
    );
    expect(out).toContain('Choose your commander');
    expect(out).toContain('SYNTHETIC Leader, the Test');
    expect(out).toContain('Use this commander');
    // With a commander set, there is no picker.
    expect(results(playableReport({ commanderChoices: [COMMANDER.stored] }))).not.toContain(
      'Choose your commander',
    );
  });

  test('the validation panel states ok in words and groups issues with card names', () => {
    const bad = results(
      playableReport({
        playable: false,
        validation: {
          ok: false,
          issues: [
            {
              severity: 'error',
              code: 'singleton',
              message: 'Too many copies.',
              cards: ['SYNTHETIC Bear'],
            },
            { severity: 'warning', code: 'w', message: 'A warning.', cards: [] },
          ],
        },
      }),
    );
    expect(bad).toContain('Deck is not valid: 1 error.');
    expect(bad).toContain('Errors (1)');
    expect(bad).toContain('Warnings (1)');
    expect(bad).toContain('Cards: SYNTHETIC Bear');
    expect(results(playableReport())).toContain('Deck is valid: no errors, no warnings.');
    expect(VALID.ok).toBe(true);
  });

  test('the coverage report has a headline, a real table and Why buttons for unsupported cards', () => {
    const out = results(playableReport());
    expect(out).toContain('39 of 40 cards supported');
    expect(out).toContain('<table');
    expect(out).toContain('<caption');
    expect(out).toContain('scope="col"');
    expect(out).toContain('scope="row"');
    expect(out).toContain('Supported');
    expect(out).toContain('Unsupported');
    expect(out).toContain('Why unsupported?');
    expect(out).not.toContain('Request support');
    expect(out.match(/Why unsupported\?/g)).toHaveLength(1);
    // Mana cost symbols are drawn with the shared component.
    expect(out).toContain('mana-cost');
  });

  test('the template panel splits unsupported cards by grammar gap and engine gap, in words', () => {
    const entries = [
      entry(COMMANDER, 1, 'commander'),
      entry(SEER),
      entry(ENGINE_GAP),
      entry(BOTH_GAPS),
    ];
    const out = results(playableReport({ entries, coverage: computeCoverage(entries) }));
    expect(out).toContain('data-testid="block-split"');
    expect(out).toContain(
      'Of 3 unsupported cards: 1 blocked only by the grammar, 1 blocked only by the engine, 1 blocked by both.',
    );
  });

  test('a fully supported deck has no Why buttons', () => {
    const entries = [entry(COMMANDER, 1, 'commander'), entry(BEAR, 2)];
    const out = results(
      playableReport({ entries, coverage: { ...playableReport().coverage, unsupported: [] } }),
    );
    expect(out).not.toContain('Why unsupported?');
  });

  test('ignored lines are listed inside a collapsed details element', () => {
    const out = results(
      playableReport({ ignored: [{ name: 'Sideboard Card', section: 'sideboard', count: 2 }] }),
    );
    expect(out).toMatch(/<details[^>]*>(?!.* open)/);
    expect(out).toContain('Ignored lines (1)');
    expect(out).toContain('2 Sideboard Card');
  });

  test('a deck with an unsupported card cannot be played, and the panel says why (D-056)', () => {
    const base = playableReport();
    expect(base.coverage.unsupported.length).toBeGreaterThan(0);
    const out = results({ ...base, playable: false });
    expect(out).not.toContain('Play this deck');
    expect(out).toContain('The deck cannot be played yet');
    expect(out).toContain('abilities the engine cannot run yet');
    expect(out).not.toContain('Play anyway');
  });

  test('a deck of supported cards says where to play it and has no play box or opponent list (issue 19)', () => {
    const base = playableReport();
    const out = results({
      ...base,
      playable: true,
      coverage: { ...base.coverage, unsupported: [] },
    });
    expect(out).toContain('The deck is ready.');
    expect(out).not.toContain('Play this deck');
    expect(out).not.toContain("Opponent's deck");
    expect(out).not.toContain('<select');
  });
});

describe('WhyDialog', () => {
  const html = renderToStaticMarkup(<WhyDialog card={SEER} onClose={() => {}} />);

  test('is a labelled modal dialog with the plain statement that the deck cannot be played', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby');
    expect(html).toContain('cannot');
    expect(html).toContain('be played yet');
  });

  test('marks the unparsed line and shows the diagnostic', () => {
    expect(html).toContain('<mark');
    expect(html).toContain('When SYNTHETIC Seer enters, venture into the dungeon.');
    expect(html).toContain('Not understood');
    expect(html).toContain('Closest rule');
    expect(html).toContain('Matching stopped at');
    expect(html).toContain('(not understood)');
  });

  const why = (card: typeof SEER) =>
    renderToStaticMarkup(<WhyDialog card={card} onClose={() => {}} />);

  test('unrecognised: says the grammar does not read it, slot as secondary detail', () => {
    expect(html).toContain('The grammar does not read this wording yet.');
    expect(html).toContain('Kind of phrase being read: effect.');
    // The schema 1 details stay as secondary text, and the highlight is kept.
    expect(html).toContain('Closest rule');
    expect(html).toContain('<mark');
  });

  test('notRunnable: says the engine cannot run it and lists each missing feature', () => {
    const out = why(ENGINE_GAP);
    expect(out).toContain('The grammar reads this, but the engine cannot run it yet: needs ');
    expect(out).toContain('token: Blood');
    expect(out).toContain('Rules that matched before it stopped: trigger.enters');
    expect(out).toContain('<mark');
  });

  test('unboundReference: names the reference it could not resolve', () => {
    const out = why(UNBOUND);
    expect(out).toContain('The grammar could not tell what &#x27;those cards&#x27; refers to.');
    expect(out).toContain('Rules that matched before it stopped: effect.exile');
  });

  test('every ability of a card shows its own reason; no reason means schema 1 details only', () => {
    const both = why(BOTH_GAPS);
    expect(both).toContain('the engine cannot run it yet');
    expect(both).toContain('The grammar does not read this wording yet.');
    const legacy = why(LEGACY);
    expect(legacy).not.toContain('The grammar');
    expect(legacy).toContain('Closest rule');
  });

  test('shows reasons that are not parse failures', () => {
    const odd = {
      ...SEER,
      support: { ...SEER.support, unparsed: [], reasons: ['layout saga is not supported'] },
    };
    const out = renderToStaticMarkup(<WhyDialog card={odd} onClose={() => {}} />);
    expect(out).toContain('Other reasons');
    expect(out).toContain('layout saga is not supported');
    expect(out).not.toContain('<mark');
  });
});

describe('other views', () => {
  test('the input panel explains Scryfall, offline use and has an example, import and save', () => {
    const out = renderToStaticMarkup(
      <InputPanel
        text=""
        name=""
        running={false}
        progress={null}
        saveMessage={null}
        onText={() => {}}
        onName={() => {}}
        onImport={() => {}}
        onExample={() => {}}
        onSave={() => {}}
      />,
    );
    expect(out).toContain('Scryfall');
    expect(out).toContain('internet connection');
    expect(out).toContain('Quick start');
    expect(out).toContain('Fill in an example');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Import</);
  });

  test('progress shows a labelled progress bar', () => {
    const out = renderToStaticMarkup(
      <InputPanel
        text="1 x"
        name="n"
        running
        progress={{ phase: 'resolving', done: 30, total: 99 }}
        saveMessage={null}
        onText={() => {}}
        onName={() => {}}
        onImport={() => {}}
        onExample={() => {}}
        onSave={() => {}}
      />,
    );
    expect(out).toContain('Resolving cards (30 of 99)');
    expect(out).toContain('<progress');
    expect(out).toContain('aria-live="polite"');
  });

  test('your decks lists saved decks with Open and Delete', () => {
    const decks = [
      { id: '1', name: 'SYNTHETIC One', text: 'x', savedAt: '2026-10-21T10:00:00.000Z' },
    ];
    const out = renderToStaticMarkup(
      <SavedDecksView decks={decks} loading={false} onOpen={() => {}} onRemove={() => {}} />,
    );
    expect(out).toContain('SYNTHETIC One');
    expect(out).toContain('>Open<');
    expect(out).toContain('>Delete<');
    expect(
      renderToStaticMarkup(
        <SavedDecksView decks={[]} loading={false} onOpen={() => {}} onRemove={() => {}} />,
      ),
    ).toContain('No saved decks yet');
  });

  test('the note explains what blocks a deck that is not playable and has no play button', () => {
    const out = renderToStaticMarkup(<PlayNote report={emptyReport()} />);
    expect(out).toContain('The deck cannot be played yet');
    expect(out).not.toContain('<button');
    expect(out).not.toContain('Play this deck');
  });

  test('a playable deck is told to be saved and picked on the menu', () => {
    const out = renderToStaticMarkup(<PlayNote report={{ ...emptyReport(), playable: true }} />);
    expect(out).toContain('The deck is ready.');
    expect(out).toContain('Your deck');
    expect(out).not.toContain('<button');
  });
});

describe('screens', () => {
  const store = () => {
    const s = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    return { ...s, getInitialState: s.getState };
  };

  test('the import screen renders its tabs, back button and the input panel', () => {
    const out = renderToStaticMarkup(
      <StoreProvider store={store()}>
        <ImportProvider environment={fakeEnv()}>
          <ImportScreen />
        </ImportProvider>
      </StoreProvider>,
    );
    expect(out).toContain('Back to menu');
    expect(out).toContain('aria-label="Import sections"');
    expect(out).toContain('aria-current="page"');
    expect(out).toContain('Your decks');
    expect(out).not.toContain('Your requests');
    expect(out).toContain('Import a deck');
  });

  test('the menu has the import entry points and works without an import provider', () => {
    const out = renderToStaticMarkup(
      <StoreProvider store={store()}>
        <Menu />
      </StoreProvider>,
    );
    expect(out).toContain('Import a deck');
    expect(out).toContain('Your decks');
    expect(out).not.toContain('Your requests');
  });
});

describe('store', () => {
  test('openImport shows the import screen on the chosen tab and backToMenu returns', () => {
    const s = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    expect(s.getState().screen).toBe('menu');
    s.getState().openImport('decks');
    expect(s.getState().screen).toBe('import');
    expect(s.getState().importTab).toBe('decks');
    s.getState().backToMenu();
    expect(s.getState().screen).toBe('menu');
  });
});

describe('the template panel', () => {
  test('lists the shapes that block this deck and offers the report', () => {
    const out = results({ ...playableReport(), playable: false });
    expect(out).toContain('data-testid="template-panel"');
    expect(out).toContain('What blocks this deck?');
    expect(out).toContain('Copy template report');
  });

  test('is absent when every card is supported', () => {
    const base = playableReport();
    const out = results({
      ...base,
      playable: true,
      entries: base.entries.filter((e) => e.card.support.status === 'supported'),
      coverage: { ...base.coverage, unsupported: [] },
    });
    expect(out).not.toContain('template-panel');
  });
});
