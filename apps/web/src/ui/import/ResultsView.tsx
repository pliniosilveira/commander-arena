/** The results of an import, section by section (M4, SPEC 6, 7.1). */
import type { ImportReport } from '../../import/types';
import { CoverageSection } from './CoverageSection';
import { looksOffline } from './model';
import { PlayNote } from './PlayNote';
import {
  CommanderPicker,
  FuzzyMatches,
  IgnoredLines,
  NameProblems,
  ParseErrors,
  ValidationPanel,
} from './ResultSections';

export interface ResultsActions {
  readonly busy: boolean;
  readonly rejectedFuzzy: readonly string[];
  onAccept(requested: string): void;
  onReject(requested: string): void;
  onChooseCommanders(names: readonly string[]): void;
  onWhy(oracleId: string): void;
}

export function OfflineNotice() {
  return (
    <p className="imp-alert" role="alert">
      Scryfall could not be reached, so no cards were looked up. Check your connection and import
      again. Offline? Go back to the menu and use Quick start with the test decks.
    </p>
  );
}

export function ResultsView({
  report,
  actions,
}: {
  report: ImportReport;
  actions: ResultsActions;
}) {
  const empty = report.entries.length === 0 && report.parse.errors.length === 0;
  return (
    <div className="imp-results" aria-live="polite" data-testid="import-results">
      <h2>Results for {report.deckName === '' ? 'your deck' : report.deckName}</h2>
      {looksOffline(report) && <OfflineNotice />}
      {empty && report.notFound.length === 0 && report.fuzzy.length === 0 && (
        <p>No cards were found in that text. Paste a decklist with one card per line.</p>
      )}
      <ParseErrors errors={report.parse.errors} />
      <NameProblems problems={report.notFound} />
      <FuzzyMatches
        pending={report.fuzzy}
        rejected={actions.rejectedFuzzy}
        busy={actions.busy}
        onAccept={actions.onAccept}
        onReject={actions.onReject}
      />
      {report.commanders.length === 0 && (
        <CommanderPicker
          choices={report.commanderChoices}
          busy={actions.busy}
          onChoose={actions.onChooseCommanders}
        />
      )}
      {report.commanders.length === 0 && report.commanderChoices.length === 0 && !empty && (
        <p className="imp-note">
          No commander was marked in your list and none of its cards can be a commander. Mark one in
          a "Commander" section.
        </p>
      )}
      <ValidationPanel validation={report.validation} />
      {report.entries.length > 0 && <CoverageSection report={report} onWhy={actions.onWhy} />}
      <PlayNote report={report} />
      <IgnoredLines ignored={report.ignored} />
    </div>
  );
}
