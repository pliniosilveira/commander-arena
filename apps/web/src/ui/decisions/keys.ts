/**
 * Keyboard (A18, SPEC 10 Accessibility): Space or Enter press the primary button, Esc unpins the
 * preview, else closes the mana chooser, else cancels the cast, F toggles Full Control and P passes
 * the turn (issue 46: Esc cancels a running pass first of all). The
 * decision is a pure function so the rules are unit tested; `useDecisionKeys` wires it to `window`.
 */
import { useEffect, useRef } from 'react';
import type { BarModel } from './model';

export type KeyCommand =
  | 'primary'
  | 'cancel'
  | 'unpin'
  | 'closeChooser'
  | 'fullControl'
  | 'undo'
  | 'passTurn'
  | 'cancelPassTurn';

export interface KeyEventInfo {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  /** Upper-case tag name of the focused element. */
  readonly tag: string;
  readonly editable: boolean;
  /** True while a modal other than the decision layer's own (a zone viewer) is open. */
  readonly foreignModalOpen: boolean;
}

export interface KeyContext {
  readonly bar: BarModel | null;
  readonly pinned: boolean;
  readonly chooserOpen: boolean;
  /** True when the Worker has something to take back (D-050). */
  readonly canUndo: boolean;
  /** True while a "Pass turn" runs (issue 46): Esc cancels it before anything else. */
  readonly passTurnActive?: boolean;
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const ACTIVATES = new Set(['BUTTON', 'A', 'SUMMARY']);

/** The command a key press stands for, or null when it is not ours to handle. */
export function keyCommand(e: KeyEventInfo, ctx: KeyContext): KeyCommand | null {
  if (e.editable || TYPING.has(e.tag) || e.foreignModalOpen) return null;
  // Ctrl+Z or Cmd+Z takes back the last small action.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
    return ctx.canUndo ? 'undo' : null;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === 'Escape') {
    if (ctx.passTurnActive === true) return 'cancelPassTurn';
    if (ctx.pinned) return 'unpin';
    if (ctx.chooserOpen) return 'closeChooser';
    return ctx.bar?.cancel != null && !ctx.bar.cancel.disabled ? 'cancel' : null;
  }
  if (e.key === 'f' || e.key === 'F') return 'fullControl';
  if (e.key === 'p' || e.key === 'P') {
    // Only where the button is on offer (a main phase of the player's own turn, nothing on the stack).
    const pass = ctx.bar?.buttons.find((b) => b.key === 'passTurn');
    return pass !== undefined && !pass.disabled ? 'passTurn' : null;
  }
  if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
    // A focused button handles Space and Enter itself (it clicks).
    if (ACTIVATES.has(e.tag)) return null;
    const primary = ctx.bar?.buttons.find((b) => b.variant === 'primary');
    return primary !== undefined && !primary.disabled ? 'primary' : null;
  }
  return null;
}

export interface KeyActions {
  readonly bar: BarModel | null;
  readonly pinned: boolean;
  readonly chooserOpen: boolean;
  readonly canUndo: boolean;
  readonly passTurnActive: boolean;
  readonly cancelPassTurn: () => void;
  readonly undo: () => void;
  readonly unpin: () => void;
  readonly closeChooser: () => void;
  readonly toggleFullControl: () => void;
}

function describe(event: KeyboardEvent): KeyEventInfo {
  const target = event.target instanceof HTMLElement ? event.target : null;
  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    tag: target?.tagName ?? '',
    editable: target?.isContentEditable === true,
    foreignModalOpen: document.querySelector('[aria-modal="true"]:not(.dec-dialog)') !== null,
  };
}

/** Listens in the bubble phase on `window`, so a zone viewer that stops Esc keeps it to itself. */
export function useDecisionKeys(actions: KeyActions): void {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const a = latest.current;
      const command = keyCommand(describe(event), a);
      if (command === null) return;
      event.preventDefault();
      switch (command) {
        case 'primary':
          a.bar?.buttons.find((b) => b.variant === 'primary')?.run();
          return;
        case 'cancel':
          a.bar?.cancel?.run();
          return;
        case 'unpin':
          a.unpin();
          return;
        case 'closeChooser':
          a.closeChooser();
          return;
        case 'fullControl':
          a.toggleFullControl();
          return;
        case 'undo':
          a.undo();
          return;
        case 'passTurn':
          a.bar?.buttons.find((b) => b.key === 'passTurn')?.run();
          return;
        case 'cancelPassTurn':
          a.cancelPassTurn();
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
