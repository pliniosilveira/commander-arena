/**
 * What the import results say about playing the deck (issue 19, D-226): that it is ready and where to
 * play it, or what stops it. There is no play button on this screen: a deck is saved here and picked as
 * "Your deck" on the menu, which also holds the opponent, the seed and the free mulligan.
 */
import type { ImportReport } from '../../import/types';
import { playBlockers } from './model';

export function PlayNote({ report }: { report: ImportReport }) {
  const blockers = playBlockers(report);
  return (
    <section className="imp-section" aria-label="Playing this deck" data-testid="play-note">
      {report.playable ? (
        <p className="scr-help">
          The deck is ready. Save it, then pick it as "Your deck" on the menu to play it.
        </p>
      ) : (
        <>
          <p className="scr-help">The deck cannot be played yet:</p>
          <ul className="imp-list">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
