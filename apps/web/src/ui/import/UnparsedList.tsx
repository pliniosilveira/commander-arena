/** The "Not understood" list of the "Why unsupported?" dialog: reason first, schema 1 details second. */
import type { ImportedCard } from '@commander-arena/cards';
import { reasonDetails, reasonStatement } from './diagnostics';

export function UnparsedList({ card }: { card: ImportedCard }) {
  const { stored, support } = card;
  if (support.unparsed.length === 0) return null;
  return (
    <section className="imp-face">
      <h3>Not understood</h3>
      <ul className="imp-list">
        {support.unparsed.map((u) => {
          const statement = reasonStatement(u);
          const details = reasonDetails(u);
          return (
            <li key={`${u.face}:${u.ability}`} className="imp-diag" data-reason={u.reason}>
              <code className="imp-code">{u.text}</code>
              {statement !== null && (
                <strong className="imp-reason" data-testid="unparsed-reason">
                  {statement}
                </strong>
              )}
              {details.map((line) => (
                <span key={line} className="scr-help imp-detail">
                  {line}
                </span>
              ))}
              <span className="scr-help imp-detail">
                Closest rule: <code>{u.closestRule}</code>. Matching stopped at:{' '}
                <code>{u.stoppedAt === '' ? '(end of the ability)' : u.stoppedAt}</code>
                {stored.faces.length > 1 ? ` (face ${u.face + 1})` : ''}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="scr-help">
        The parser normalizes text first (reminder text removed, the card's own name written as ~),
        so quotes above can differ slightly from the printed card.
      </p>
    </section>
  );
}
