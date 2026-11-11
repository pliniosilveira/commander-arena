/**
 * Builds the `Interaction` for the pending decision, provides it to its children (the board) and
 * draws the action bar plus every decision overlay (SPEC 10 "Action bar", "Decisions").
 */
import type { Action } from '@commander-arena/engine';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { untappableSources } from '../../store';
import { attachDeps, startAndTarget } from '../dnd/attach-flow';
import { type DndPlan, DragProvider, NO_DND } from '../dnd/DragProvider';
import { dragSpec, resolveDrop } from '../dnd/model';
import { InteractionProvider, NO_INTERACTION } from '../interaction';
import { useActions, useApp, useStoreApi } from '../store-context';
import { ActionBar } from './ActionBar';
import './decisions.css';
import { ChooserPopover } from './Chooser';
import { waitingText } from './cards-picker';
import { useDockSlot } from './dock-slot';
import { useDecisionKeys } from './keys';
import { objectIndex } from './lookup';
import { buildModel, type Controller } from './model';
import { DockPanel, ModalOverlay } from './Overlays';
import { useOpponentThinking } from './thinking';
import { initialUi, type UiState, uiFor } from './ui-state';
import { withManaUntap } from './untap-mana';

/** Decisions whose overlay shows the engine's refusal itself; the toast would repeat it. */
const INLINE_ERROR = new Set(['payMana', 'assignDamage']);

/**
 * After a mouse click the clicked button gives up focus, so Space keeps meaning "the primary
 * button" instead of pressing the tile again. Keyboard activation (detail 0) keeps its focus.
 */
function dropFocusAfterMouseClick(event: MouseEvent): void {
  if (event.detail === 0 || !(event.target instanceof HTMLElement)) return;
  event.target.closest('button')?.blur();
}

export function DecisionLayer({ children }: { children: ReactNode }) {
  const view = useApp((s) => s.snapshot?.view ?? null);
  const passing = useApp((s) => s.passing);
  const passTurn = useApp((s) => s.yieldTurn !== null);
  const error = useApp((s) => s.error);
  const fullControl = useApp((s) => s.settings.fullControl);
  const manualPay = useApp((s) => s.manualPay);
  const pinned = useApp((s) => s.preview.pinned);
  const undoDepth = useApp((s) => s.snapshot?.undoDepth ?? 0);
  const manaTaps = useApp((s) => s.manaTaps);
  const thinking = useOpponentThinking();
  const actions = useActions();
  const store = useStoreApi();
  const layer = useRef<HTMLDivElement>(null);
  const dockSlot = useDockSlot();
  // The layer and the column the dock is drawn in (it is outside the layer in the page).
  useEffect(() => {
    const roots = [layer.current, dockSlot ?? null];
    for (const root of roots) root?.addEventListener('click', dropFocusAfterMouseClick);
    return () => {
      for (const root of roots) root?.removeEventListener('click', dropFocusAfterMouseClick);
    };
  }, [dockSlot]);
  const [stored, setStored] = useState<UiState>(() => initialUi(null));

  const pending = view?.pending ?? null;
  const ui = uiFor(stored, pending);

  const update = useCallback(
    (change: (ui: UiState) => UiState) => setStored((prev) => change(uiFor(prev, pending))),
    [pending],
  );
  const act = useCallback((action: Action) => void actions.act(action), [actions]);

  const controller: Controller = {
    act,
    update,
    explain: (message) => actions.fail(message),
    passTurn: () => void actions.passTurn(),
    fullControl,
    openChooser: (object, abilityIndex) => {
      // Point the popover at the clicked tile, falling back to the layer's corner. Where it goes
      // (under the tile, above it, inside the layer) is decided once it is drawn and measured
      // (`usePopoverPlace`, issue 85).
      const box = layer.current?.getBoundingClientRect();
      const tile = document.querySelector(`[data-object-id="${object}"]`)?.getBoundingClientRect();
      const known = tile !== undefined && box !== undefined;
      update((u) => ({
        ...u,
        chooser: {
          object,
          ...(abilityIndex === undefined ? {} : { abilityIndex }),
          left: known ? tile.left - box.left : 40,
          top: known ? tile.top - box.top : 40,
          bottom: known ? tile.bottom - box.top : 40,
        },
      }));
    },
  };

  const model =
    view !== null && pending !== null ? buildModel(view, pending, ui, controller) : null;
  const interactive = model !== null && !passing;
  // A land tapped for mana whose mana is unspent can be clicked to take the tap back (issue 19).
  const interaction = interactive
    ? withManaUntap(
        model.interaction,
        untappableSources(manaTaps, undoDepth, view),
        (id) => void actions.untapMana(id),
      )
    : NO_INTERACTION;
  // Drag and drop is an addition to the click path: a drop runs the same reducers a click does.
  const dnd: DndPlan =
    interactive && view !== null && pending !== null
      ? {
          spec: (id, source) => dragSpec(pending, ui, objectIndex(view), view.viewer, id, source),
          drop: (id, source, target) => {
            const result = resolveDrop(
              pending,
              ui,
              objectIndex(view),
              view.viewer,
              id,
              source,
              target,
            );
            if (result.kind === 'click') model.interaction.onObject(id);
            else if (result.kind === 'act') act(result.action);
            else if (result.kind === 'attach') {
              // Equip or an Aura: the action, then the engine's target question answered.
              void startAndTarget(attachDeps(store), result.start, result.host);
            } else if (result.kind === 'ui') update(result.change);
          },
        }
      : NO_DND;
  const closeChooser = () => update((u) => ({ ...u, chooser: null }));

  useDecisionKeys({
    bar: interactive ? model.bar : null,
    pinned: pinned !== null,
    chooserOpen: ui.chooser !== null,
    canUndo: undoDepth > 0 && !passing,
    passTurnActive: passTurn,
    cancelPassTurn: () => actions.cancelPassTurn(),
    undo: () => void actions.undo(),
    unpin: () => actions.pin(null),
    closeChooser,
    toggleFullControl: () => actions.setSettings({ fullControl: !fullControl }),
  });

  const overlayProps =
    interactive && view !== null && pending !== null
      ? { view, pending, ui, model, update, act, error }
      : null;
  const showToast = error !== null && !(pending !== null && INLINE_ERROR.has(pending.kind));

  const dock =
    view === null || view.result !== null || model?.bar.inOverlay === true ? null : (
      <div className="dec-dock">
        {overlayProps === null ? null : <DockPanel {...overlayProps} />}
        <ActionBar
          bar={interactive ? model.bar : null}
          waiting={view === null ? null : waitingText(view)}
          passing={passing && pending !== null}
          thinking={thinking}
          passTurn={passTurn}
          onCancelPassTurn={() => actions.cancelPassTurn()}
          fullControl={fullControl}
          manualPay={manualPay}
          onSeize={() => actions.seize()}
          onFullControl={(on) => actions.setSettings({ fullControl: on })}
          onManualPay={(on) => actions.setManualPay(on)}
          undoDepth={undoDepth}
          onUndo={() => void actions.undo()}
        />
      </div>
    );

  return (
    <div className="decision-layer" ref={layer}>
      <InteractionProvider value={interaction}>
        <DragProvider plan={dnd}>{children}</DragProvider>
      </InteractionProvider>
      {overlayProps === null ? null : <ModalOverlay {...overlayProps} />}
      {showToast ? (
        <div className="dec-toast" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="dec-toast-close"
            aria-label="Dismiss message"
            onClick={() => actions.clearError()}
          >
            ×
          </button>
        </div>
      ) : null}
      {overlayProps !== null && pending !== null ? (
        <ChooserPopover
          pending={pending}
          ui={ui}
          act={act}
          update={update}
          close={closeChooser}
          index={objectIndex(overlayProps.view)}
        />
      ) : null}
      {dockSlot === undefined
        ? dock
        : dockSlot === null || dock === null
          ? null
          : createPortal(dock, dockSlot)}
    </div>
  );
}
