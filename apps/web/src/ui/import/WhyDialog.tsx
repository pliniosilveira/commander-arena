/** "Why unsupported?": the card's Oracle text with the parts the parser did not understand marked. */
import type { ImportedCard } from '@commander-arena/cards';
import { Dialog } from './Dialog';
import { highlightFace } from './highlight';
import { sourceLabel } from './model';
import { UnparsedList } from './UnparsedList';

export function WhyDialog({ card, onClose }: { card: ImportedCard; onClose: () => void }) {
  const { stored, support } = card;
  const faces = stored.faces.map((face, i) => ({
    face,
    index: i,
    highlight: highlightFace(face, i, support.unparsed),
  }));
  return (
    <Dialog title={`Why is ${stored.name} unsupported?`} onClose={onClose} wide>
      <p className="imp-note">
        The engine does not understand every ability on this card, so a deck that contains it cannot
        be played yet. Replace it to play the deck. Nothing is ever half-run.
      </p>

      {faces.map(({ face, index, highlight }) => (
        <section key={`${face.name}:${index}`} className="imp-face">
          <h3>
            {face.name} <span className="scr-help">{face.typeLine}</span>
          </h3>
          {face.oracleText === '' ? (
            <p className="scr-help">This face has no Oracle text.</p>
          ) : (
            <p className="imp-oracle">
              {highlight.lines.map((line, i) => (
                // Lines are positional and never reorder.
                // biome-ignore lint/suspicious/noArrayIndexKey: positional list of lines
                <span key={i} className="imp-oline" data-understood={line.understood}>
                  {line.understood ? (
                    line.text
                  ) : (
                    <mark className="imp-mark">
                      {line.text}
                      <span className="imp-sr"> (not understood)</span>
                    </mark>
                  )}
                </span>
              ))}
            </p>
          )}
        </section>
      ))}

      <UnparsedList card={card} />

      {support.reasons.length > 0 && (
        <section className="imp-face">
          <h3>Other reasons</h3>
          <ul className="imp-list">
            {support.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="scr-help">
        Checked with {sourceLabel(support.source)}. Parser version {support.parserVersion}.
      </p>
      <div className="imp-dialog-actions">
        <button type="button" className="scr-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
