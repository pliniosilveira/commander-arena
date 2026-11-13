import type { ConfirmOptionalDecision } from '@commander-arena/engine';
import { BarButtons } from './BarButtons';
import { Dialog } from './Dialog';
import type { Index } from './lookup';
import type { DecisionModel } from './model';
import {
  cascadeKind,
  mayBeholdPrompt,
  mayDelayedPrompt,
  mayEffectPrompt,
  optionalSource,
} from './optional';

/** The accessible name of the dialog for each question. */
const DIALOG_LABELS: Readonly<
  Record<NonNullable<ConfirmOptionalDecision['purpose']> | 'optional', string>
> = {
  optional: 'Optional ability',
  kicker: 'Kicker',
  ward: 'Ward',
  counterUnlessPays: 'Counterspell',
  unlessPays: 'Unless you pay',
  search: 'Search',
  mayPay: 'You may pay',
  cascade: 'Cascade',
  suspend: 'Suspend',
  madness: 'Madness',
  miracleReveal: 'Miracle: reveal',
  miracle: 'Miracle',
  gift: 'Gift',
  costChoice: 'Additional cost',
  pairReturn: 'Return the cards',
  castCard: 'Cast from a graveyard',
};

/**
 * The small modal of the `confirmOptional` question: a "you may" ability, a shock land's "pay or
 * enter tapped", the kicker question, the ward question ("Pay {2} or it is countered?"), the same
 * question for a counterspell ("Counter target spell unless its controller pays {3}"), "may
 * search", Extort's "Pay {W/B} for extort?" and Cascade's "cast it without paying its mana cost?". The model's bar holds the prompt and the buttons; for the kicker question its Cancel
 * (Esc) is drawn as a button too, because the dialog hides the bar.
 */
export function OptionalDialog({
  d,
  model,
  index,
}: {
  d: ConfirmOptionalDecision;
  model: DecisionModel;
  index: Index;
}) {
  const source = optionalSource(d, index);
  // D-151: Discover and its kin ask the Cascade question and put the card into the hand when it is not cast.
  const label =
    d.purpose === 'cascade' && cascadeKind(d, index).kind !== 'cascade'
      ? 'Cast without paying'
      : DIALOG_LABELS[d.purpose ?? 'optional'];
  // These questions say everything in the bar's prompt; a plain "you may" is worded here.
  // A delayed ability (D-284) is worded from the ability on the stack, which may be granted: the text of the permanent is not quoted for it.
  const delayed = mayDelayedPrompt(d, index) !== null;
  const prompted =
    d.purpose !== undefined ||
    delayed ||
    mayEffectPrompt(d, index) !== null ||
    mayBeholdPrompt(d, index) !== null;
  const { cancel } = model.bar;
  return (
    <Dialog label={label} className="dec-small">
      <h2 className="dec-title">{source.name}</h2>
      {source.text === '' || delayed ? null : <p className="dec-source-quote">{source.text}</p>}
      {prompted ? (
        <p className="dec-sub">{model.bar.prompt}</p>
      ) : d.cost === undefined ? (
        <p className="dec-sub">You may do this. Do it?</p>
      ) : (
        <p className="dec-sub">
          {model.bar.prompt} If you don't, {source.name} enters tapped.
        </p>
      )}
      <BarButtons buttons={cancel === null ? model.bar.buttons : [...model.bar.buttons, cancel]} />
    </Dialog>
  );
}
