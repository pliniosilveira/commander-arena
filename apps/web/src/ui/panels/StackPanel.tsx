/** The stack (SPEC 10 "Stack panel"): top item first, with arrows from each item to its targets. */
import type { ObjectId, ObjectView, SeatId } from '@commander-arena/engine';
import { useMemo } from 'react';
import { abilityTypeLine, activatedStackIds } from '../../game/activation';
import { withAnnouncedX } from '../../game/amount-text';
import { copyAbilityWords } from '../../game/copy-text';
import { sharesText } from '../../game/dinosaurs-text';
import { delayedWording, dropYou, laterAbilityWords } from '../../game/later-text';
import { inherentWording, isInherentAbility } from '../../game/monarch-text';
import { stackLabel } from '../../game/saga';
import { CastBadges } from '../board/CardFace';
import { useHoverPreview } from '../board/hover';
import { triggerCondition, triggerGist } from '../decisions/ability-label';
import { withX } from '../decisions/cast-cost';
import { chosenModesLine } from '../decisions/modes-picker';
import { typeLine } from '../format';
import { ManaCost } from '../mana';
import { useApp } from '../store-context';
import { objectIndex, seatName, targetLabel } from './objects';
import { StackArrows } from './StackArrows';
import './panels.css';

const NO_ITEMS: readonly ObjectView[] = [];
const NO_OBJECTS: ReadonlyMap<ObjectId, ObjectView> = new Map();

function StackItem({
  item,
  top,
  viewer,
  index,
  activated,
}: {
  item: ObjectView;
  top: boolean;
  viewer: SeatId;
  activated: boolean;
  index: ReadonlyMap<ObjectId, ObjectView>;
}) {
  const hover = useHoverPreview(item.id);
  const mine = item.controller === viewer;
  // An ability is shown under its source's name, but it is not the card (CR 113.7a). Whether it
  // was activated or triggered comes from the log (game/activation.ts).
  // The monarch's abilities (CR 725.2) have no source and no card: worded from the kind, nothing to hover.
  const inherent = isInherentAbility(item);
  const triggered = item.abilitySource !== undefined || inherent;
  const kind = triggered
    ? abilityTypeLine(activated)
    : item.types.length > 0
      ? typeLine(item)
      : 'Ability';
  // What set a triggered ability off, and what it does: "At the beginning of combat on your turn,
  // you gain 1 life". A shape the words do not know shows nothing (the source's name is above).
  const source = item.abilitySource === undefined ? undefined : index.get(item.abilitySource);
  const monarchWords =
    inherent && item.ability !== undefined
      ? inherentWording(item.ability, item.controller === viewer)
      : null;
  // Suspend's and Madness's abilities are the engine's own (D-128): "Remove a time counter from Name."
  // A delayed trigger of an effect says "the next turn's upkeep" (CR 603.7).
  const later =
    inherent || item.ability === undefined
      ? null
      : laterAbilityWords(item.ability, item.name, mine);
  // Storm's and Replicate's triggers say what they copy (D-129).
  const copies =
    inherent || item.ability === undefined ? null : copyAbilityWords(item.ability, source);
  const delayed =
    inherent || item.ability === undefined ? null : delayedWording(item.ability, item.oracleText);
  const when = inherent
    ? null
    : (later?.when ??
      copies?.when ??
      delayed ??
      triggerCondition(item.ability, item.name, source ?? item));
  const words = item.ability === undefined || inherent ? '' : triggerGist(item.ability, source);
  const gist = later !== null || copies !== null ? '' : delayed !== null ? dropYou(words) : words;
  // An activated ability has no "when": its words are what it does, as Unearth's (D-124) would
  // otherwise show only the card's name.
  const does =
    later?.does ?? copies?.does ?? (when === null && activated && gist !== '' ? gist : null);
  // "Chosen: Destroy target artifact; Draw a card": the modes of a modal spell or ability (D-114).
  // Issue 107: the X announced for the spell or ability is written into the words that say X.
  const sayX = (text: string): string =>
    item.x === undefined ? text : withAnnouncedX(text, item.x);
  const modes = chosenModesLine(item);
  const targets = item.targets.map((t) => targetLabel(t, index, viewer));
  // D-145 (CR 601.2d): a spell that divided damage shows each target with its share, "3 damage to Goblin, 2 damage to Elf".
  const shares = sharesText(item.targets, (t) => targetLabel(t, index, viewer));
  return (
    <li
      className={`pnl-stack-item ${mine ? 'pnl-mine' : 'pnl-theirs'}${top ? ' pnl-top' : ''}${triggered ? ' pnl-triggered' : ''}`}
      data-object-id={item.id}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: focusing an item previews it for keyboard users
      tabIndex={0}
      {...(inherent ? {} : hover)}
    >
      <div className="pnl-stack-head">
        <span className="pnl-stack-name">{stackLabel(item)}</span>
        {triggered ? null : (
          <ManaCost
            cost={
              item.x === undefined || item.manaCost === null
                ? item.manaCost
                : withX(item.manaCost, item.x)
            }
          />
        )}
      </div>
      <div className="pnl-stack-meta">
        <span>
          {kind} <CastBadges object={item} />
        </span>
        <span className="pnl-stack-who">
          {top ? 'Top · ' : ''}
          {seatName(item.controller, viewer)}
        </span>
      </div>
      {when === null ? null : (
        <div className="pnl-stack-when">
          {sayX(`${when}${gist === '' ? '' : `, ${gist.charAt(0).toLowerCase()}${gist.slice(1)}`}`)}
        </div>
      )}
      {does === null ? null : (
        <div
          className="pnl-stack-when"
          {...(later === null
            ? copies === null
              ? {}
              : { 'data-copy-wording': '' }
            : { 'data-later-wording': '' })}
        >
          {sayX(does)}
        </div>
      )}
      {monarchWords === null ? null : (
        <div className="pnl-stack-when" data-monarch-wording>
          {monarchWords}
        </div>
      )}
      {modes === null ? null : (
        <div className="pnl-stack-modes" data-stack-modes>
          {sayX(modes)}
        </div>
      )}
      {targets.length > 0 && (
        <div
          className="pnl-stack-targets"
          {...(shares === null ? {} : { 'data-stack-shares': '' })}
        >
          <span aria-hidden="true">{'→ '}</span>
          <span className="pnl-visually-hidden">Targets </span>
          {shares ?? targets.join(', ')}
        </div>
      )}
    </li>
  );
}

export function StackPanel() {
  const view = useApp((s) => s.snapshot?.view ?? null);
  const index = useMemo(() => (view === null ? NO_OBJECTS : objectIndex(view)), [view]);
  const log = useApp((s) => s.log);
  const activated = useMemo(() => activatedStackIds(log), [log]);
  const stack = view?.stack ?? NO_ITEMS;
  // The engine lists the stack bottom first; the panel shows the top item first.
  const shown = useMemo(() => [...stack].reverse(), [stack]);

  return (
    <section className="pnl-panel pnl-stack" aria-label="Stack" data-drop="stack">
      <h2 className="pnl-title">
        Stack
        {shown.length > 0 && <span className="pnl-count">{shown.length}</span>}
      </h2>
      {view === null || shown.length === 0 ? (
        <p className="pnl-empty">Stack is empty</p>
      ) : (
        <ol className="pnl-stack-list">
          {shown.map((item, i) => (
            <StackItem
              key={item.id}
              item={item}
              top={i === 0}
              viewer={view.viewer}
              index={index}
              activated={activated.has(item.id)}
            />
          ))}
        </ol>
      )}
      <StackArrows items={shown} />
    </section>
  );
}
