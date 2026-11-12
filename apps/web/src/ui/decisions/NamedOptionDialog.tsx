import type { Action, ChooseOptionDecision } from '@commander-arena/engine';
import { useEffect, useRef } from 'react';
import { Dialog } from './Dialog';
import {
  CHAPTER_HINT,
  isChapterChoice,
  isEffectChoice,
  isMeldOrderChoice,
  isReplacementChoice,
  isRiotChoice,
  isVoteChoice,
  namedOptionPrompt,
  namedOptionRows,
} from './option-names';

/**
 * The modal of "choose one of the names the card gives" (D-151, CR 614.12a, 607.2d) and of a Saga's read ahead (CR 702.155b): one
 * button for each option, "Khans", "Dragons", or "Chapter I" with the words of that chapter. There is no way out: the permanent
 * cannot enter before it has chosen. It also asks the choice among the instructions an effect offers as it resolves (D-175, CR 608.2d):
 * "Create a Food token", "Create a Treasure token". And the order of prevention effects on a damage event (D-191, CR 616.1): "Damage
 * replacement", with one button for each effect, the words of the effect and "Then: 0 damage" under them; no way out either: damage is not undone.
 * And a vote (D-194, CR 701.38a): one button for each option the card words ("Profit", "Security"), with the votes already cast in the prompt; a vote is
 * not taken back either.
 */
export function NamedOptionDialog({
  d,
  act,
}: {
  d: ChooseOptionDecision;
  act: (action: Action) => void;
}) {
  const rows = namedOptionRows(d);
  const chapters = isChapterChoice(d);
  const replacement = isReplacementChoice(d);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <Dialog
      label={
        chapters
          ? 'Choose a chapter'
          : replacement
            ? 'Damage replacement'
            : isMeldOrderChoice(d)
              ? 'Order the two cards'
              : isVoteChoice(d)
                ? 'Vote'
                : isEffectChoice(d) || isRiotChoice(d)
                  ? 'Choose one'
                  : 'Choose an option'
      }
      className="dec-option dec-named"
    >
      <h2 className="dec-title">{replacement ? 'Damage replacement' : d.sourceName}</h2>
      {d.sourceOracleText === '' ? null : <p className="dec-source-quote">{d.sourceOracleText}</p>}
      <p className="dec-sub" data-option-prompt>
        {namedOptionPrompt(d)}
      </p>
      {chapters ? <p className="dec-sub">{CHAPTER_HINT}</p> : null}
      <ul className="dec-named-list">
        {rows.map((row, i) => (
          <li key={row.option}>
            <button
              ref={i === 0 ? first : undefined}
              type="button"
              className="dec-btn dec-btn-secondary dec-named-btn"
              data-option={row.option}
              onClick={() => act({ kind: 'chooseOption', option: row.option })}
            >
              <span className="dec-named-label">{row.label}</span>
              {row.detail === null ? null : <span className="dec-named-detail">{row.detail}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
