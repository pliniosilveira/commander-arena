import type { ChooseCardsDecision, GameView } from '@commander-arena/engine';
import { typeLine } from '../format';
import { ManaCost } from '../mana';
import { useLookedCards } from '../store-context';
import {
  ALONE,
  beholdCards,
  beholdHelp,
  type CardGroup,
  cardsRange,
  castVerb,
  clickGroup,
  discardTitle,
  foundCount,
  groupCards,
  lookTakeDestination,
  lookTakeRevealed,
  ordinal,
  pickerCards,
  pickOrderLabel,
  pickOrderMatters,
  pileList,
  pilesPreview,
  toggleFound,
} from './cards-picker';
import { useHoverProps } from './hover';
import { objectIndex } from './lookup';
import type { UiState } from './ui-state';

/** What the look-and-take question does with the card, after "Choose a card" (D-145, CR 702.75a for Hideaway). */
const LOOK_TAKE_WORDS = {
  hand: ' to reveal and put into your hand',
  battlefield: ' to reveal and put onto the battlefield',
  exileFaceDown: ' to exile face down',
} as const;

/**
 * The dock panel of a chooseCards decision (a library search, a discard from the hand, or the exile
 * cost of Escape from the graveyard): a row
 * per distinct card (equal names are one row with a count) with its cost, type line and rules text,
 * and the order the player picked them in. A search puts the first card found at the first
 * destination, so the order shows as "1st", "2nd". Rows are buttons, so the choice can be made from
 * the keyboard. A library's cards are listed only from `view.pendingCards`, which the engine fills
 * for the deciding viewer alone.
 */
export function CardPickerPanel({
  decision,
  view,
  ui,
  update,
}: {
  decision: ChooseCardsDecision;
  view: GameView;
  ui: UiState;
  update: (change: (ui: UiState) => UiState) => void;
}) {
  const hoverProps = useHoverProps();
  const groups = groupCards(pickerCards(view, decision));
  // D-151 (CR 701.4a): Behold lists the cards of the hand and the permanents you control apart.
  const behold = decision.purpose === 'behold' ? beholdCards(view, decision) : null;
  const search = decision.purpose === 'search';
  const putOnTop = decision.purpose === 'putOnTop';
  const exile = decision.purpose === 'exile';
  const move = decision.purpose === 'move';
  const lookTake = decision.purpose === 'lookTake';
  // D-1200 (CR 701.20a): a reveal shows the cards to everyone, a look to this player only.
  const revealedToAll = lookTakeRevealed(decision);
  // D-303 (CR 700.3): the cards to separate into two piles; the cards clicked are pile 1.
  const separate = decision.purpose === 'separate';
  const piles = separate ? pilesPreview(pickerCards(view, decision), ui.found) : null;
  // D-145: a free cast or play ("You may cast a spell ... without paying its mana cost") and where a looked-at card goes.
  const cast = decision.purpose === 'cast';
  const takeTo = lookTake ? lookTakeDestination(decision, objectIndex(view)) : 'hand';
  // D-139: the cards looked at that cannot be taken, which only this player sees (looked-cards.ts).
  const others = useLookedCards();
  const alone = new Set(decision.orSingle ?? []);
  const ordered = pickOrderMatters(decision);
  const names = new Map(groups.flatMap((g) => g.ids.map((id) => [id, g.name] as const)));
  const rows = (list: readonly CardGroup[], label?: string) => (
    <ul className="dec-pick-list" aria-label={label}>
      {list.map((group) => {
        const picks = group.ids.flatMap((id) => {
          const at = ui.found.indexOf(id);
          return at === -1 ? [] : [at + 1];
        });
        return (
          <li key={group.name}>
            <button
              type="button"
              className="dec-pick"
              aria-pressed={picks.length > 0}
              onClick={() => update((u) => ({ ...u, found: clickGroup(u.found, decision, group) }))}
              {...hoverProps(group.ids[0] ?? group.card.id)}
            >
              <span className="dec-pick-head">
                <span className="dec-pick-name">
                  {group.name}
                  {group.ids.length > 1 ? ` ×${group.ids.length}` : ''}
                </span>
                <ManaCost cost={group.card.manaCost} />
                {group.ids.every((id) => alone.has(id)) ? (
                  <span className="dec-pick-alone">{ALONE}</span>
                ) : null}
                {picks.length === 0 ? null : (
                  <span className="dec-pick-order">
                    {ordered ? picks.map((n) => pickOrderLabel(decision, n)).join(', ') : 'Chosen'}
                  </span>
                )}
              </span>
              <span className="dec-pick-type">{typeLine(group.card)}</span>
              {group.card.oracleText === '' || behold !== null ? null : (
                <span className="dec-pick-text" title={group.card.oracleText}>
                  {group.card.oracleText}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
  return (
    <section
      className="dec-panel dec-cards-panel"
      aria-label={
        search
          ? 'Cards to find'
          : putOnTop
            ? 'Cards to put on top'
            : exile
              ? 'Cards to exile'
              : move
                ? 'Cards to put onto the battlefield'
                : lookTake
                  ? revealedToAll
                    ? 'Cards revealed'
                    : 'Cards looked at'
                  : cast
                    ? 'Cards to cast for free'
                    : separate
                      ? 'Cards to separate into two piles'
                      : decision.purpose === 'behold'
                        ? 'Cards to behold'
                        : decision.purpose === 'pair'
                          ? 'Cards to choose from'
                          : 'Cards to discard'
      }
    >
      <h3 className="dec-panel-title">
        {search
          ? 'Search your library'
          : putOnTop
            ? 'Put on top of your library'
            : discardTitle(decision, objectIndex(view))}
      </h3>
      <p className="dec-sub dec-left">
        {separate
          ? 'Click the cards of pile 1; the other cards are pile 2. Either pile may be empty. The cards are revealed to everyone and stay in the library'
          : cast
            ? `Choose a card to ${castVerb(decision)} without paying its mana cost, or none`
            : behold !== null
              ? beholdHelp(decision, objectIndex(view)).replace(/\.$/, '')
              : decision.orSingle === undefined
                ? `Choose ${cardsRange(decision.min, decision.max)}`
                : `Choose ${cardsRange(decision.max, decision.max)}, or one card marked “${ALONE}”`}
        {exile ? ' from your graveyard' : ''}
        {lookTake ? LOOK_TAKE_WORDS[takeTo] : ''}.
        {lookTake
          ? revealedToAll
            ? ' Everyone sees these cards.'
            : ' Only you see these cards.'
          : ''}
        {decision.reveal && search ? ' The cards you find are revealed.' : ''}
        {putOnTop && ordered ? ' The first you pick ends on top.' : ''}
      </p>
      {behold === null ? (
        rows(groups)
      ) : (
        <>
          {behold.hand.length === 0 ? null : (
            <>
              <p className="dec-sub dec-left dec-pick-zone" data-behold-zone="hand">
                In your hand, revealed when chosen:
              </p>
              {rows(groupCards(behold.hand), 'Cards of your hand')}
            </>
          )}
          {behold.battlefield.length === 0 ? null : (
            <>
              <p className="dec-sub dec-left dec-pick-zone" data-behold-zone="battlefield">
                On the battlefield, only chosen:
              </p>
              {rows(groupCards(behold.battlefield), 'Permanents you control')}
            </>
          )}
        </>
      )}
      {lookTake && others.length > 0 ? (
        <>
          <p className="dec-sub dec-left">
            {revealedToAll
              ? 'Also revealed (cannot be taken):'
              : 'Also looked at (cannot be taken):'}
          </p>
          <ul className="dec-pick-list" aria-label="Other cards looked at">
            {others.map((card) => (
              <li key={card.id}>
                <div className="dec-pick dec-pick-other" aria-disabled="true">
                  <span className="dec-pick-head">
                    <span className="dec-pick-name">{card.name}</span>
                    <ManaCost cost={card.manaCost} />
                  </span>
                  <span className="dec-pick-type">{typeLine(card)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {ordered && ui.found.length > 0 ? (
        <ol className="dec-pick-order-list" aria-label="Your picks, in order">
          {ui.found.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                className="dec-chip"
                aria-label={`Take back ${ordinal(i + 1)}: ${names.get(id) ?? 'a card'}`}
                onClick={() => update((u) => ({ ...u, found: toggleFound(u.found, decision, id) }))}
              >
                {ordinal(i + 1)} {names.get(id) ?? 'a card'} ×
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      {piles === null ? null : (
        <p className="dec-sub dec-left" data-piles>
          Pile 1: {pileList(piles.first)}. Pile 2: {pileList(piles.second)}.
        </p>
      )}
      <p className="dec-sub dec-left">{foundCount(ui.found, decision)}</p>
    </section>
  );
}
