/**
 * A scripted human for tests: answers what the page would ask by clicking through the store, one
 * explicit action at a time, and records every click with the situation it happened in.
 */
import {
  type Action,
  defaultDivision,
  type GameView,
  type PendingDecision,
} from '@commander-arena/engine';
import { hasRelevantAction } from '../src/policy/should-stop';
import type { AppStore } from '../src/store';

export interface Click {
  readonly turn: number;
  readonly activeSeat: number;
  readonly step: string;
  readonly kind: PendingDecision['kind'];
  readonly action: Action['kind'];
  readonly stackSize: number;
  readonly relevant: boolean;
}

/** A plain sensible answer to every decision kind (no cleverness needed). */
export function chooseAction(view: GameView, decision: PendingDecision): Action {
  switch (decision.kind) {
    case 'priority': {
      const land = decision.options.find((o) => o.kind === 'playLand');
      if (land?.kind === 'playLand') return land;
      const spell = decision.options.find((o) => o.kind === 'castSpell');
      if (spell?.kind === 'castSpell') return spell;
      return { kind: 'pass' };
    }
    case 'mulligan':
      return { kind: 'keepHand' };
    case 'mulliganBottom':
    case 'discard':
      return { kind: 'chooseCards', objects: decision.hand.slice(0, decision.count) };
    case 'targets':
      return {
        kind: 'chooseTargets',
        targets: decision.specs.flatMap((s) => {
          const chosen = s.legal.slice(0, Math.max(s.min, 1));
          // D-145 (CR 601.2d): a slot that divides damage wants a share on each target, summing to the total.
          if (s.divide === undefined) return chosen;
          const total = s.divide;
          const some = chosen.slice(0, Math.max(1, Math.min(chosen.length, total)));
          return some.map((t, i) => ({
            ...t,
            share: Math.floor(total / some.length) + (i < total % some.length ? 1 : 0),
          }));
        }),
      };
    case 'payMana':
      return { kind: 'payAuto' };
    case 'commanderZone':
      return { kind: 'moveToCommandZone' };
    case 'declareAttackers':
      return {
        kind: 'declareAttackers',
        attacks: decision.candidates.flatMap((c) =>
          c.targets[0] === undefined ? [] : [{ attacker: c.attacker, target: c.targets[0] }],
        ),
      };
    case 'declareBlockers':
      return { kind: 'declareBlockers', blocks: [] };
    case 'assignDamage':
      return { kind: 'assignDamage', assignments: defaultDivision(decision.choices) };
    case 'choosePermanent':
      return { kind: 'choosePermanents', objects: decision.legal.slice(0, decision.min) };
    case 'chooseCards': {
      // D-139: a discard "unless you discard an artifact card" takes one card that will do alone.
      const alone = decision.orSingle?.[0];
      if (alone !== undefined) return { kind: 'chooseCards', objects: [alone] };
      return { kind: 'chooseCards', objects: decision.legal.slice(0, decision.min) };
    }
    case 'orderTriggers':
      // The engine's own order, kept as it is.
      return { kind: 'orderTriggers', order: decision.triggers.map((_, i) => i) };
    case 'confirmOptional':
      return { kind: 'acceptOptional' };
    case 'chooseX':
      // Announce the smallest X (0): nothing extra is paid.
      return { kind: 'chooseX', value: decision.min };
    case 'chooseOption':
      // The first option, as the engine lists them.
      return { kind: 'chooseOption', option: decision.options[0] ?? '' };
    case 'chooseModes':
      // The first legal set, as the engine lists them (fewest modes first).
      return { kind: 'chooseModes', modes: decision.sets[0] ?? [] };
    case 'choosePayOptions':
      // The engine's own suggestion: what its payment planner would tap or exile.
      return { kind: 'choosePayOptions', objects: decision.suggested };
    case 'arrangeCards':
      // Everything stays on top, in the order it was looked at.
      return { kind: 'arrangeCards', top: decision.cards, other: [] };
  }
  void view;
}

/** Clicks until the game ends or `maxClicks` is reached. Returns every click. */
export async function playThrough(store: AppStore, maxClicks: number): Promise<Click[]> {
  const clicks: Click[] = [];
  while (clicks.length < maxClicks) {
    const view = store.getState().snapshot?.view;
    if (view === undefined || view.result !== null || view.pending === null) break;
    const action = chooseAction(view, view.pending);
    clicks.push({
      turn: view.turn,
      activeSeat: view.activeSeat,
      step: view.step,
      kind: view.pending.kind,
      action: action.kind,
      stackSize: view.stack.length,
      relevant: view.pending.kind === 'priority' && hasRelevantAction(view, view.pending),
    });
    const before = store.getState().snapshot?.revision;
    await store.getState().act(action);
    if (store.getState().snapshot?.revision === before)
      throw new Error(`stuck on ${action.kind}: ${store.getState().error}`);
  }
  return clicks;
}
