import type {
  ChosenTarget,
  GameView,
  SeatId,
  TargetChoiceSpec,
  TargetsDecision,
} from '@commander-arena/engine';
import { possessiveOf, seatNameOf } from '../../game/seat-name';
import { targetZoneToOpen } from '../board/target-zone';
import { keptDivisionText, keptTargets, shareLabel } from './copy-division';
import { bumpShare, divisionLine, shareOf, sharesLeft, withEvenShares } from './divide';
import { useHoverProps } from './hover';
import { type Index, nameOf, objectIndex } from './lookup';
import { modeHeading, slotLabel } from './target-prompt';
import {
  allLegalTargets,
  chosenObjects,
  chosenSeats,
  groupOf,
  modeGroups,
  pickedFor,
  toggleTarget,
} from './targeting';
import type { UiState } from './ui-state';
import { useZoneGate } from './zone-decision';

type Update = (change: (ui: UiState) => UiState) => void;

const targetLabel = (t: ChosenTarget, index: Index, viewer: SeatId, seatCount = 2): string =>
  t.kind === 'object' ? nameOf(index, t.id) : seatNameOf(t.seat, viewer, seatCount);

const targetKey = (t: ChosenTarget): string => (t.kind === 'object' ? t.id : `p${t.seat}`);

/**
 * A permanent or a player is already a target on the board (highlighted, clickable there), so it gets no chip:
 * only objects elsewhere (graveyard, hand, exile, the stack) are listed.
 */
const offBoard =
  (view: GameView) =>
  (t: ChosenTarget): boolean => {
    if (t.kind !== 'object') return false;
    return !view.battlefield.some((o) => o.id === t.id);
  };

type HoverOf = ReturnType<typeof useHoverProps>;

/**
 * #45, #23: hovering or focusing the chip of an object shows it in the preview panel, so the
 * player can read a card of a graveyard (or anywhere else) before picking it; a player has none.
 */
const hoverOf = (hoverProps: HoverOf, t: ChosenTarget) =>
  t.kind === 'object' ? hoverProps(t.id) : {};

/**
 * The dock panel of the targets decision: one chip per legal target. For a modal spell or ability
 * (D-114) the chips are grouped under the heading of the mode whose slot they fill, "Mode 2: Destroy
 * target artifact", and a chip picks the target for that mode's slot only (CR 601.2c, 700.2c).
 */
export function TargetsPanel({
  decision: d,
  view,
  ui,
  update,
}: {
  decision: TargetsDecision;
  view: GameView;
  ui: UiState;
  update: Update;
}) {
  const index = objectIndex(view);
  const hoverProps = useHoverProps();
  const groups = modeGroups(d.specs);
  const gate = useZoneGate();
  const zoneToOpen = targetZoneToOpen(view);
  if (zoneToOpen !== null) {
    // Every legal target is in one graveyard: a button opens it, and the cards are chosen there.
    return (
      <section className="dec-panel dec-targets" aria-label="Legal targets">
        <h3 className="dec-panel-title">Legal targets</h3>
        <button type="button" className="dec-chip" onClick={gate.ask}>
          Open graveyard
        </button>
      </section>
    );
  }
  const listed = offBoard(view);
  if (groups !== null) {
    const shownGroups = groups.filter((g) => g.specs.some((sp) => sp.legal.some(listed)));
    if (shownGroups.length === 0) return null;
    return (
      <section className="dec-panel dec-targets" aria-label="Legal targets">
        <h3 className="dec-panel-title">Legal targets</h3>
        {shownGroups.map((group) => (
          <div
            key={`${group.mode}/${group.time}`}
            className="dec-target-group"
            data-mode={group.mode}
          >
            <h4 className="dec-target-group-title">
              {modeHeading(index, d.source, group.mode, group.time)}
            </h4>
            {group.specs.map((spec) => (
              <ul key={spec.specId} className="dec-target-list">
                {spec.legal.filter(listed).map((t) => (
                  <li key={targetKey(t)}>
                    <button
                      type="button"
                      className="dec-chip"
                      {...hoverOf(hoverProps, t)}
                      aria-pressed={pickedFor(ui.targets, t, spec.specId)}
                      onClick={() =>
                        update((u) => ({
                          ...u,
                          targets: toggleTarget(d.specs, u.targets, t, spec.specId),
                        }))
                      }
                    >
                      {targetLabel(t, index, view.viewer, view.seats.length)}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        ))}
      </section>
    );
  }
  const hasChips = d.specs.some((sp) => sp.legal.some(listed));
  const hasDivision =
    d.specs.some((sp) => sp.divide !== undefined) ||
    keptDivisionText(d, index, view.viewer, view.seats.length) !== null;
  if (!hasChips && !hasDivision) return null;
  return (
    <section className="dec-panel dec-targets" aria-label="Legal targets">
      {hasChips ? <h3 className="dec-panel-title">Legal targets</h3> : null}
      <PlainList
        listed={listed}
        specs={d.specs}
        index={index}
        viewer={view.viewer}
        seatCount={view.seats.length}
        ui={ui}
        update={update}
        hoverProps={hoverProps}
      />
      <KeptDivision decision={d} index={index} viewer={view.viewer} seatCount={view.seats.length} />
      {d.specs.map((spec) => (
        <DivisionSection
          key={spec.specId}
          specs={d.specs}
          spec={spec}
          index={index}
          viewer={view.viewer}
          seatCount={view.seats.length}
          ui={ui}
          update={update}
        />
      ))}
    </section>
  );
}

function PlainList({
  listed,
  specs,
  index,
  viewer,
  seatCount,
  ui,
  update,
  hoverProps,
}: {
  listed: (t: ChosenTarget) => boolean;
  specs: readonly TargetChoiceSpec[];
  index: Index;
  viewer: SeatId;
  seatCount: number;
  ui: UiState;
  update: Update;
  hoverProps: HoverOf;
}) {
  const pickedObjects = chosenObjects(ui.targets);
  const pickedSeats = chosenSeats(ui.targets);
  // D-149 (TargetSpec.onePerOpponent): a slot with one target for each opponent lists each opponent's permanents under their own heading.
  const grouped = specs.find((s) => s.onePerGroup === true);
  if (grouped !== undefined) {
    const groups = [
      ...new Set(grouped.legal.filter(listed).flatMap((t) => groupOf(grouped, t) ?? [])),
    ];
    return (
      <>
        {groups.map((seat) => (
          <div key={`g${seat}`} className="dec-target-group" data-group={seat}>
            <h4 className="dec-target-group-title">
              {possessiveOf(seat, viewer, seatCount)} permanents: up to one
            </h4>
            <ul className="dec-target-list">
              {grouped.legal
                .filter(listed)
                .filter((t) => groupOf(grouped, t) === seat)
                .map((t) => (
                  <li key={targetKey(t)}>
                    <button
                      type="button"
                      className="dec-chip"
                      {...hoverOf(hoverProps, t)}
                      aria-pressed={pickedFor(ui.targets, t, grouped.specId)}
                      onClick={() =>
                        update((u) => ({
                          ...u,
                          targets: toggleTarget(specs, u.targets, t, grouped.specId),
                        }))
                      }
                    >
                      {targetLabel(t, index, viewer, seatCount)}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </>
    );
  }
  // Several slots with different effects: one list for each slot under what it is for ("Slot 2: target creature you control"), so a chip picks the target of that slot.
  if (specs.length > 1 && specs.every((s) => s.target !== undefined)) {
    return (
      <>
        {specs.map((spec, at) =>
          !spec.legal.some(listed) ? null : (
            <div key={spec.specId} className="dec-target-group" data-slot={spec.specId}>
              <h4 className="dec-target-group-title">{slotLabel(specs, at)}</h4>
              <ul className="dec-target-list">
                {spec.legal.filter(listed).map((t) => (
                  <li key={targetKey(t)}>
                    <button
                      type="button"
                      className="dec-chip"
                      {...hoverOf(hoverProps, t)}
                      aria-pressed={pickedFor(ui.targets, t, spec.specId)}
                      onClick={() =>
                        update((u) => ({
                          ...u,
                          targets: toggleTarget(specs, u.targets, t, spec.specId),
                        }))
                      }
                    >
                      {targetLabel(t, index, viewer, seatCount)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </>
    );
  }
  const plain = allLegalTargets(specs).filter(listed);
  if (plain.length === 0) return null;
  return (
    <ul className="dec-target-list">
      {plain.map((t) => (
        <li key={targetKey(t)}>
          <button
            type="button"
            className="dec-chip"
            {...hoverOf(hoverProps, t)}
            aria-pressed={t.kind === 'object' ? pickedObjects.has(t.id) : pickedSeats.has(t.seat)}
            onClick={() => update((u) => ({ ...u, targets: toggleTarget(specs, u.targets, t) }))}
          >
            {targetLabel(t, index, viewer, seatCount)}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The shares of a copy of a divided spell (D-149, CR 707.10, 115.7f): read only, as the division is the original's and the answer
 * names no share. Nothing is drawn for a question that keeps no division.
 */
function KeptDivision({
  decision,
  index,
  viewer,
  seatCount,
}: {
  decision: TargetsDecision;
  index: Index;
  viewer: SeatId;
  seatCount: number;
}) {
  if (keptDivisionText(decision, index, viewer, seatCount) === null) return null;
  return (
    <fieldset className="dec-divide dec-divide-kept" data-divide-kept aria-label="Division kept">
      <legend>Division of the original</legend>
      <ul className="dec-damage-rows">
        {keptTargets(decision).map((t) => (
          <li key={targetKey(t)} className="dec-damage-row">
            <span className="dec-damage-name">{shareLabel(t, index, viewer, seatCount)}</span>
          </li>
        ))}
      </ul>
      <p className="dec-sub dec-left">
        The division cannot be changed. A new target takes the share of the one it replaces.
      </p>
    </fieldset>
  );
}

/**
 * The division of a slot that divides damage (CR 601.2d, D-145): "Divide 5 damage", one row per chosen target with a stepper,
 * and how much is left to assign. The shares start as an even split of whatever is chosen; "Even split" goes back to it.
 * Buttons all the way, so the whole division is made from the keyboard; the line under the steppers is a live region.
 */
function DivisionSection({
  specs,
  spec,
  index,
  viewer,
  seatCount,
  ui,
  update,
}: {
  specs: readonly TargetChoiceSpec[];
  spec: TargetChoiceSpec;
  index: Index;
  viewer: SeatId;
  seatCount: number;
  ui: UiState;
  update: Update;
}) {
  const total = spec.divide;
  if (total === undefined) return null;
  const mine = ui.targets.filter((t) => t.specId === spec.specId);
  const left = sharesLeft(specs, ui.targets, spec.specId);
  return (
    <fieldset
      className="dec-divide"
      data-divide={spec.specId}
      aria-label={spec.divideUpTo === true ? `Divide up to ${total}` : `Divide ${total} damage`}
    >
      <legend title="Divide the damage among the targets: each gets at least 1">
        {spec.divideUpTo === true ? `Divide up to ${total}` : `Divide ${total} damage`}
      </legend>
      {mine.length === 0 ? (
        <p className="dec-sub dec-left">
          Choose the targets above (each gets at least 1), then divide the damage here.
        </p>
      ) : (
        <ul className="dec-damage-rows">
          {mine.map((t) => {
            const name = targetLabel(t, index, viewer, seatCount);
            const amount = shareOf(ui.targets, t, spec.specId);
            return (
              <li key={targetKey(t)} className="dec-damage-row">
                <span className="dec-damage-name">{name}</span>
                <button
                  type="button"
                  className="dec-step"
                  aria-label={`Less damage to ${name}`}
                  disabled={amount <= 1}
                  onClick={() =>
                    update((u) => ({
                      ...u,
                      targets: bumpShare(specs, u.targets, t, spec.specId, -1),
                    }))
                  }
                >
                  −
                </button>
                <output className="dec-amount" aria-label={`Damage to ${name}`}>
                  {amount}
                </output>
                <button
                  type="button"
                  className="dec-step"
                  aria-label={`More damage to ${name}`}
                  disabled={left === 0}
                  onClick={() =>
                    update((u) => ({
                      ...u,
                      targets: bumpShare(specs, u.targets, t, spec.specId, 1),
                    }))
                  }
                >
                  +
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="dec-divide-foot">
        <p
          className={`dec-sub dec-left${left === 0 || spec.divideUpTo === true ? '' : ' dec-warn'}`}
          role="status"
          data-divide-left={left}
        >
          {mine.length === 0 ? '' : divisionLine(total, left, spec.divideUpTo === true)}
        </p>
        {mine.length > 1 ? (
          <button
            type="button"
            className="dec-chip"
            onClick={() => update((u) => ({ ...u, targets: withEvenShares(specs, u.targets) }))}
          >
            Even split
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}
