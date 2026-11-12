/**
 * Fixed panel at the left edge showing the pinned or hovered object in full (A19), as it is right
 * now: current power and toughness, damage, counters, keywords, tapped and combat state.
 *
 * Attached Auras and Equipment are listed in the details ("Attached to", "Attached"). A card with
 * more than one face (split, Adventure, double-faced) lists every face with the one that is up
 * marked (`FaceList`); the card above is the face that is up, back face included. Not available
 * from the engine's view yet, so not drawn (do not fake): the "modified" marker against printed
 * P/T and granted and lost abilities as an overlay. They belong in `PreviewDetails` when
 * `ObjectView` carries them.
 */
import type { ObjectView } from '@commander-arena/engine';
import { useMemo } from 'react';
import { activatedStackIds } from '../../game/activation';
import { alternativeBadge } from '../../game/alt-cost';
import { chosenLabel } from '../../game/chosen';
import { additionalCostChoiceText, additionalCostsText } from '../../game/cost-text';
import { designationKind } from '../../game/designations';
import { realCardOf } from '../../game/face-down-text';
import { controlFact } from '../../game/korvold-text';
import { laterFacts } from '../../game/later-text';
import { castCostChanged, costsX, costText, symbolsText, withX } from '../decisions/cast-cost';
import { faceCostText, faceFacts, faceRole } from '../decisions/layouts';
import { chosenModeTexts } from '../decisions/modes-picker';
import { kickedWords, replicatedWords, typeLine } from '../format';
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
                <span className="board-preview-face-role">{faceRole(layout, i)}</span>
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
  if (designation !== null && view !== null) {
    // D-243: the monarch and the Ring are no objects in a zone: say whose they are.
    const you = object.controller === view.viewer;
    facts.push(
      designation === 'monarch'
        ? `${you ? 'You are' : 'The opponent is'} the monarch (CR 725.1)`
        : `The Ring has tempted ${you ? 'you' : 'the opponent'} (CR 701.54c)`,
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
  // CR 701.40a, 701.40b (D-968): a face-down permanent says what made it face down and, to its controller, what turning it face up costs.
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
      <dt>State</dt>
      <dd>{facts.join('. ')}.</dd>
    </dl>
  );
}

export function PreviewPanel() {
  const view = useApp((s) => s.snapshot?.view ?? null);
  const pinnedId = useApp((s) => s.preview.pinned);
  const hoveredId = useApp((s) => s.preview.hovered);
  const { id, source } =
    view === null ? { id: null, source: 'none' } : previewChoice(view, pinnedId, hoveredId);
  const log = useApp((s) => s.log);
  const activated = useMemo(() => activatedStackIds(log), [log]);
  const object = view !== null && id !== null ? findObject(view, id) : null;
  const pinned = source === 'pinned' && object !== null;
  // The card behind the viewer's own face-down permanent (D-968), or null.
  const real = object === null ? null : realCardOf(object);
  return (
    <aside className="preview-panel board-preview" aria-label="Card preview" aria-live="polite">
      {object === null ? (
        <div className="board-preview-empty">
          <p className="board-preview-title">
            {id === null ? 'Hover a card to read it' : 'Not visible any more'}
          </p>
          <p>
            {id === null
              ? 'Right-click pins, Esc unpins.'
              : 'That object has moved to another zone or is hidden from you.'}
          </p>
        </div>
      ) : (
        <>
          <div className="board-preview-bar">
            {pinned ? (
              <span className="board-flag board-flag-pin">Pinned. Esc unpins</span>
            ) : source === 'stack' ? (
              <span className="board-flag" data-preview-stack>
                Top of the stack
              </span>
            ) : (
              <span className="board-dim">Right-click pins, Esc unpins</span>
            )}
          </div>
          {real !== null && (
            // CR 708.5 (D-968): the player who controls a face-down permanent may look at the card. The marker says what the others see.
            <p className="board-flag" data-preview-face-down>
              Face down. Only you can see this card; {object.name}, a {object.power}/
              {object.toughness} creature, is what everyone sees.
            </p>
          )}
          <div className="board-preview-card" data-preview-id={object.id}>
            <CardFace object={real ?? object} variant="full" activated={activated.has(object.id)} />
          </div>
          <PreviewDetails object={object} />
          <FaceList object={object} />
          <MeldList object={object} />
        </>
      )}
    </aside>
  );
}
