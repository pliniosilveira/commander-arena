/**
 * Fixed panel at the left edge showing the pinned or hovered object in full (A19), as it is right
 * now: current power and toughness, damage, counters, keywords, tapped and combat state.
 *
 * Attached Auras and Equipment are listed in the details ("Attached to", "Attached"). A card with
 * more than one face (split, Adventure, double-faced) lists every face with the one that is up
 * marked (`FaceList`); the card above is the face that is up, back face included. "Affected by"
 * lists the permanents whose static abilities apply to it, with their rules text (`affectedBy`).
 * Not available from the engine's view yet, so not drawn (do not fake): the "modified" marker
 * against printed P/T and which abilities were lost.
 */
import type { ObjectView } from '@commander-arena/engine';
import { useMemo } from 'react';
import { activatedStackIds } from '../../game/activation';
import { alternativeBadge } from '../../game/alt-cost';
import { chosenLabel } from '../../game/chosen';
import { companionSeatOf, companionState } from '../../game/companion';
import { additionalCostChoiceText, additionalCostsText } from '../../game/cost-text';
import { designationKind } from '../../game/designations';
import { realCardOf } from '../../game/face-down-text';
import { controlFact } from '../../game/korvold-text';
import { laterFacts } from '../../game/later-text';
import type { RevealedCard } from '../../game/revealed-cards';
import { roomFacts } from '../../game/room-text';
import { midNameOf, seatNameOf, startNameOf, startPossessiveOf } from '../../game/seat-name';
import { castCostChanged, costsX, costText, symbolsText, withX } from '../decisions/cast-cost';
import { faceCostText, faceFacts, faceRole } from '../decisions/layouts';
import { chosenModeTexts } from '../decisions/modes-picker';
import { kickedWords, replicatedWords, typeLine } from '../format';
import { ManaCost } from '../mana';
import { objectIndex } from '../panels/objects';
import { stackWording } from '../panels/stack-wording';
import { useApp, useDefinedPt, useStaticNotes } from '../store-context';
import './board.css';
import { CardFace } from './CardFace';
import { chipsOf } from './keywords';
import {
  combatRoles,
  findObject,
  isCrewedVehicle,
  previewChoice,
  roleText,
  seatLabel,
} from './resolve';

/**
 * Every face of a multi-face card, in the card's order: its role ("Front face", "Back face",
 * "Adventure", "Split, left half"), name, cost and type line, and the rules text; the face that is
 * up is marked "showing". For a split card outside the stack both halves are up together (CR 709.4).
 */
function FaceList({ object }: { object: ObjectView }) {
  const { faces, layout } = object;
  if (faces === undefined || layout === undefined) return null;
  const both = layout === 'split' && object.zone !== 'stack';
  return (
    <section className="board-preview-faces" aria-label="Faces">
      <ol>
        {faces.map((face, i) => {
          const current = both || object.face === i;
          return (
            <li
              key={face.name}
              className={current ? 'is-current' : undefined}
              aria-current={current ? 'true' : undefined}
              data-face={i}
            >
              <p className="board-preview-face-head">
                <span className="board-preview-face-role">{faceRole(layout, i, face)}</span>
                <b>{face.name}</b>
                {current && <span className="board-flag">showing</span>}
              </p>
              <p className="board-dim">
                {[faceCostText(face), typeLine(face)].filter((x) => x !== '').join(' · ')}
              </p>
              {face.oracleText === '' ? null : (
                <p className="board-preview-face-text">{face.oracleText}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * What a melded permanent is made of (D-277, CR 701.42a, 712.4a): the two cards that represent it, each as its front face (the permanent itself has the characteristics
 * of the combined face, which the card above shows), with the cost, the type line and the rules text of each.
 */
export function MeldList({ object }: { object: ObjectView }) {
  if (object.meld === undefined) return null;
  return (
    <section className="board-preview-faces" aria-label="Melded from">
      <ol>
        {object.meld.components.map((face) => (
          <li key={face.name}>
            <p className="board-preview-face-head">
              <span className="board-preview-face-role">Melded from</span>
              <b>{face.name}</b>
            </p>
            <p className="board-dim">
              {[faceCostText(face), typeLine(face)].filter((x) => x !== '').join(' · ')}
            </p>
            {face.oracleText === '' ? null : (
              <p className="board-preview-face-text">{face.oracleText}</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function PreviewDetails({ object }: { object: ObjectView }) {
  const view = useApp((s) => s.snapshot?.view ?? null);
  const defined = useDefinedPt(object.id);
  const playRules = useStaticNotes(object.id);
  const role = view === null ? undefined : combatRoles(view).get(object.id);
  const counters = Object.entries(object.counters).filter(
    ([name, n]) => n > 0 && !(name === 'lore' && object.finalChapter !== undefined),
  );
  const chips = chipsOf(object);
  const chosen = chosenLabel(object);
  const additionalCost = [
    additionalCostsText(object.additionalCosts),
    additionalCostChoiceText(object.additionalCostChoice),
  ]
    .filter((part) => part !== '')
    .join('; ');
  const paidCost =
    object.x !== undefined && object.manaCost?.includes('X') === true
      ? withX(object.manaCost, object.x)
      : null;
  const keywordChips = chips.filter((c) => !c.restriction);
  const restrictionChips = chips.filter((c) => c.restriction);
  const facts: string[] = [];
  const designation = designationKind(object.id);
  const companionSeat = companionSeatOf(object.id);
  if (companionSeat !== null && view !== null) {
    // SPEC 5.8, CR 702.139: the companion is outside the game; its owner may bring it into their hand once, for {3} (CR 116.2g).
    const brought = view.seats.find((s) => s.id === companionSeat)?.companion?.brought === true;
    const mine = companionSeat === view.viewer;
    facts.push(
      brought
        ? `${startPossessiveOf(companionSeat, view.viewer, view.seats.length)} companion was brought into the game: it is an ordinary card now`
        : `${startPossessiveOf(companionSeat, view.viewer, view.seats.length)} companion, outside the game (${companionState(false)}). ${
            mine ? 'You may bring it into your hand' : 'They may bring it into their hand'
          } once, for {3}`,
    );
  } else if (designation !== null && view !== null) {
    // D-243: the monarch and the Ring are no objects in a zone: say whose they are.
    const you = object.controller === view.viewer;
    facts.push(
      designation === 'monarch'
        ? `${you ? 'You are' : `${startNameOf(object.controller, view.viewer, view.seats.length)} is`} the monarch (CR 725.1)`
        : `The Ring has tempted ${midNameOf(object.controller, view.viewer, view.seats.length)} (CR 701.54c)`,
    );
  } else {
    if (view !== null)
      facts.push(
        `${seatLabel(view, object.controller)} control${object.controller === view.viewer ? '' : 's'} it`,
      );
    facts.push(object.zone === 'battlefield' ? 'On the battlefield' : `In ${object.zone}`);
  }
  const host =
    view === null || object.attachedTo === undefined ? null : findObject(view, object.attachedTo);
  // The permanents whose static abilities apply to it now (a lord, a Sliver that gives the others an ability), with their own rules text:
  // what the object has that its card does not say comes from one of them.
  const affecting =
    view === null
      ? []
      : (object.affectedBy ?? []).flatMap((id) => {
          const found = findObject(view, id);
          return found === null ? [] : [found];
        });
  const attached =
    view === null
      ? []
      : (object.attachments ?? []).flatMap((id) => {
          const found = findObject(view, id);
          return found === null ? [] : [found.name];
        });
  if (view !== null) {
    const taken = controlFact(object, {
      viewer: view.viewer,
      activeSeat: view.activeSeat,
      nameOf: (id) => findObject(view, id)?.name ?? null,
    });
    if (taken !== null) facts.push(taken);
  }
  // CR 303.4b (D-629): an Aura that enchants a player says whom.
  if (object.attachedToPlayer !== undefined && view !== null) {
    facts.push(`Enchants ${seatLabel(view, object.attachedToPlayer)} (CR 303.4b)`);
  }
  // CR 701.15 (D-639): a goaded creature says who goaded it; it attacks each combat if able, and not that player if able.
  if (object.goadedBy !== undefined) {
    const by =
      view === null
        ? ''
        : ` by ${object.goadedBy.map((seat) => seatLabel(view, seat)).join(' and ')}`;
    facts.push(`Goaded${by}: attacks each combat if able, another player if able (CR 701.15)`);
  }
  // CR 702.95b (D-286): the creature this one is paired with, while the pair stands (the engine says it only then).
  if (object.pairedWith !== undefined && view !== null) {
    const partner = findObject(view, object.pairedWith);
    facts.push(`Paired with ${partner === null ? 'another creature' : partner.name} (CR 702.95)`);
  }
  if (object.pairedPhasedOut === true) {
    facts.push('Paired, on hold: one of the two is phased out (CR 702.95, 702.26)');
  }
  // CR 716.2 (D-235): the level of a Class; its next level is gained with the level bar ability.
  if (object.level !== undefined) facts.push(`Class level ${object.level}`);
  if (object.tapped) facts.push('Tapped');
  if (object.summoningSick && object.types.includes('creature')) facts.push('Summoning sick');
  if (isCrewedVehicle(object)) facts.push('Crewed');
  if (object.isToken) facts.push('Token');
  facts.push(...faceFacts(object));
  // CR 701.40a, 701.40b (D-315): a face-down permanent says what made it face down and, to its controller, what turning it face up costs.
  if (object.faceDown === true && object.faceDownBy !== undefined) {
    facts.push(object.faceDownBy === 'manifest' ? 'Manifested: face down' : 'Face down');
    if (object.hiddenFace !== undefined) {
      facts.push(
        object.turnFaceUpCost === undefined
          ? 'It can’t be turned face up: its card is not a creature card with a mana cost'
          : `You may turn it face up for ${object.turnFaceUpCost.map((c) => `{${c}}`).join('') || '{0}'}`,
      );
    }
  }
  // CR 709.5c (Room): which halves are unlocked and which are locked, and what unlocking a locked half costs.
  facts.push(...roomFacts(object));
  if (view !== null) facts.push(...laterFacts(object, view.viewer));
  const kicked = kickedWords(object);
  if (kicked !== null) facts.push(`${kicked.charAt(0).toUpperCase()}${kicked.slice(1)}`);
  const replicated = replicatedWords(object);
  if (replicated !== null)
    facts.push(`${replicated.charAt(0).toUpperCase()}${replicated.slice(1)}`);
  if (object.copy === true) facts.push('A copy of a spell: not a card');
  if (object.flashback === true) facts.push('Cast with flashback');
  if (object.free === true) facts.push('Cast without paying its mana cost');
  const alternative = alternativeBadge(object);
  if (alternative !== null) facts.push(alternative.fact);
  if (role !== undefined) facts.push(roleText(role));
  return (
    <dl className="board-preview-details">
      {object.power !== null && object.toughness !== null && (
        <>
          <dt>Now</dt>
          <dd>
            {object.power}/{object.toughness}
            {object.damage > 0 ? `, ${object.damage} damage marked` : ''}
          </dd>
        </>
      )}
      {defined !== undefined && (
        <>
          <dt>Defined</dt>
          <dd data-defined-pt>
            {object.zone !== 'battlefield' && object.zone !== 'stack'
              ? `Printed ${defined.power ? '*' : object.power}/${defined.toughness ? '*' : object.toughness}. `
              : ''}
            {defined.text}
          </dd>
        </>
      )}
      {playRules !== undefined && (
        <>
          <dt>Rules in words</dt>
          <dd data-play-rules>{playRules.join(' ')}</dd>
        </>
      )}
      {object.power === null && object.printedPt !== undefined && (
        <>
          <dt>Printed</dt>
          <dd>
            {object.printedPt.power}/{object.printedPt.toughness}, only while it is a creature
          </dd>
        </>
      )}
      {object.power === null && object.damage > 0 && (
        <>
          <dt>Damage</dt>
          <dd>{object.damage} marked</dd>
        </>
      )}
      {chosen !== null && (
        <>
          <dt>{chosen.heading}</dt>
          <dd data-chosen>{chosen.short}</dd>
        </>
      )}
      {castCostChanged(object) && object.castCost !== undefined && (
        <>
          <dt>Cost now</dt>
          <dd data-cost-now>
            {costText(object.castCost)} (printed{' '}
            {symbolsText(object.faces?.[0]?.manaCost ?? object.manaCost ?? [])}). Commander tax and
            cost reductions are included.
          </dd>
        </>
      )}
      {chosenModeTexts(object) !== null && (
        <>
          <dt>Modes chosen</dt>
          <dd data-modes-chosen>{chosenModeTexts(object)?.join('; ')}</dd>
        </>
      )}
      {object.x !== undefined && (
        <>
          <dt>X</dt>
          <dd data-x-value>
            {object.x}
            {paidCost === null ? '' : ` (mana cost paid: ${symbolsText(paidCost)})`}
            {object.additionalCosts?.some((c) => c.kind === 'payXLife')
              ? `, ${object.x} life paid`
              : ''}
            {object.additionalCosts?.some((c) => c.kind === 'discardX')
              ? `, ${object.x} ${object.x === 1 ? 'card' : 'cards'} discarded`
              : ''}
          </dd>
        </>
      )}
      {costsX(object) && !castCostChanged(object) && object.castCost !== undefined && (
        <>
          <dt>Cost</dt>
          <dd data-x-cost>
            {costText(object.castCost ?? object.manaCost ?? [])}. You choose X as you cast it, up to
            what you can pay.
          </dd>
        </>
      )}
      {additionalCost !== '' && (
        <>
          <dt>Additional cost</dt>
          <dd data-additional-cost>{additionalCost}</dd>
        </>
      )}
      {counters.length > 0 && (
        <>
          <dt>Counters</dt>
          <dd>{counters.map(([name, n]) => `${n} ${name}`).join(', ')}</dd>
        </>
      )}
      {(object.regenerationShields ?? 0) > 0 && (
        <>
          <dt>Regeneration shield</dt>
          <dd data-regeneration-shield>
            {object.regenerationShields === 1
              ? '1 shield'
              : `${object.regenerationShields} shields`}
            . The next time it would be destroyed this turn, it is instead tapped, removed from
            combat and has its damage removed. It ends with the turn.
          </dd>
        </>
      )}
      {host !== null && (
        <>
          <dt>Attached to</dt>
          <dd>{host.name}</dd>
        </>
      )}
      {attached.length > 0 && (
        <>
          <dt>Attached</dt>
          <dd>{attached.join(', ')}</dd>
        </>
      )}
      {keywordChips.length > 0 && (
        <>
          <dt>Keywords</dt>
          <dd>{keywordChips.map((c) => c.full).join(', ')}</dd>
        </>
      )}
      {restrictionChips.length > 0 && (
        <>
          <dt>Restrictions</dt>
          <dd>{restrictionChips.map((c) => c.full).join(', ')}</dd>
        </>
      )}
      {affecting.length > 0 && (
        <>
          <dt>Affected by</dt>
          <dd data-affected-by>
            <ul className="preview-affecting">
              {affecting.map((source) => (
                <li key={source.id}>
                  <b>{source.name}</b>
                  {source.oracleText === '' ? null : `: ${source.oracleText.split('\n').join(' ')}`}
                </li>
              ))}
            </ul>
          </dd>
        </>
      )}
      <dt>State</dt>
      <dd>{facts.join('. ')}.</dd>
    </dl>
  );
}

/**
 * What the object on the stack says: for a triggered or activated ability what set it off and what it does, the
 * modes chosen and the targets (the stack panel's words, `stack-wording.ts`), so the card on top of the stack is
 * explained here and not only named.
 */
function StackWords({ object }: { object: ObjectView }) {
  const view = useApp((s) => s.snapshot?.view ?? null);
  const log = useApp((s) => s.log);
  const activated = useMemo(() => activatedStackIds(log), [log]);
  const index = useMemo(() => (view === null ? new Map() : objectIndex(view)), [view]);
  if (view === null || object.zone !== 'stack') return null;
  const w = stackWording(object, index, view.viewer, activated.has(object.id), view.seats.length);
  const lines: string[] = [];
  if (w.when !== null)
    lines.push(
      w.sayX(
        `${w.when}${w.gist === '' ? '' : `, ${w.gist.charAt(0).toLowerCase()}${w.gist.slice(1)}`}`,
      ),
    );
  if (w.does !== null) lines.push(w.sayX(w.does));
  if (w.monarchWords !== null) lines.push(w.monarchWords);
  if (w.modes !== null) lines.push(w.sayX(w.modes));
  if (w.targets.length > 0) lines.push(`Targets: ${w.shares ?? w.targets.join(', ')}`);
  if (lines.length === 0) return null;
  return (
    <section className="board-preview-stack" aria-label="On the stack" data-preview-stack-words>
      <p className="board-preview-face-head">
        <span className="board-preview-face-role">
          {w.triggered ? 'Triggered' : 'On the stack'}
        </span>
        <b>{object.name}</b>
      </p>
      {lines.map((line) => (
        <p key={line} className="board-preview-face-text">
          {line}
        </p>
      ))}
    </section>
  );
}

/** The cards a reveal showed (CR 701.20): who revealed them and from where, each with its cost, type line and text. */
function RevealedList({ cards }: { cards: readonly RevealedCard[] }) {
  const viewer = useApp((s) => s.snapshot?.view.viewer ?? null);
  const seatCount = useApp((s) => s.snapshot?.view.seats.length ?? 2);
  const first = cards[0];
  if (first === undefined) return null;
  const who =
    first.seat === viewer
      ? 'You reveal'
      : `${seatNameOf(first.seat, viewer ?? 0, seatCount)} reveals`;
  return (
    <div className="board-preview-revealed" data-preview-revealed>
      <div className="board-preview-bar">
        <span className="board-flag">Revealed. Esc clears</span>
      </div>
      <p className="board-preview-title">
        {who} from {first.from}
      </p>
      <ol>
        {cards.map((card) => (
          <li key={card.key}>
            <p className="board-preview-face-head">
              <b>{card.name}</b>
              <ManaCost cost={card.manaCost} />
            </p>
            <p className="board-dim">{typeLine(card)}</p>
            {card.oracleText === '' ? null : (
              <p className="board-preview-face-text">{card.oracleText}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PreviewPanel() {
  const hover = useApp((s) => s.hover);
  const dismissStackPreview = useApp((s) => s.dismissStackPreview);
  const dismissedStack = useApp((s) => s.preview.dismissedStack ?? null);
  const view = useApp((s) => s.snapshot?.view ?? null);
  const hoveredId = useApp((s) => s.preview.hovered);
  const revealed = useApp((s) => s.preview.revealed);
  const { id, source } =
    view === null ? { id: null, source: 'none' } : previewChoice(view, hoveredId, dismissedStack);
  const log = useApp((s) => s.log);
  const activated = useMemo(() => activatedStackIds(log), [log]);
  const object = view !== null && id !== null ? findObject(view, id) : null;
  // The card behind the viewer's own face-down permanent (D-315), or null.
  const real = object === null ? null : realCardOf(object);
  // A tap on the preview closes it: it drops the hover, a reveal and the stack's card.
  const dismiss = () => {
    hover(null);
    // The card on top of the stack is shown by itself: the tap closes it until another is on top.
    if (source === 'stack' && id !== null) dismissStackPreview(id);
  };
  // A reveal is read when the player holds no object (hovered) and nothing newer than it is on the stack.
  if (revealed.length > 0 && (source === 'none' || source === 'stack')) {
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: a tap closes the preview; Esc already does it from the keyboard
      <aside
        className="preview-panel board-preview"
        aria-label="Card preview"
        aria-live="polite"
        data-dismissable="true"
        onClick={dismiss}
      >
        <RevealedList cards={revealed} />
      </aside>
    );
  }
  // Nothing to read: the panel floats over the board, so it is not drawn at all.
  if (object === null) return null;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a tap closes the preview; Esc already does it from the keyboard
    <aside
      className="preview-panel board-preview"
      aria-label="Card preview"
      aria-live="polite"
      data-stack-preview={source === 'stack' ? 'true' : undefined}
      onClick={dismiss}
    >
      <div className="board-preview-bar">
        {source === 'stack' ? (
          <span className="board-flag" data-preview-stack>
            Top of the stack
          </span>
        ) : (
          <span className="board-dim">Click closes</span>
        )}
      </div>
      {real !== null && (
        // CR 708.5 (D-315): the player who controls a face-down permanent may look at the card. The marker says what the others see.
        <p className="board-flag" data-preview-face-down>
          Face down. Only you can see this card; {object.name}, a {object.power}/{object.toughness}{' '}
          creature, is what everyone sees.
        </p>
      )}
      <div className="board-preview-card" data-preview-id={object.id}>
        <CardFace object={real ?? object} variant="full" activated={activated.has(object.id)} />
      </div>
      <StackWords object={object} />
      <PreviewDetails object={object} />
      <FaceList object={object} />
      <MeldList object={object} />
    </aside>
  );
}
