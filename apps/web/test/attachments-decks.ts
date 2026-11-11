/**
 * The hidden SYNTHETIC deck `synthetic-attachments` (game/precons.ts: invented engine fixtures, not
 * real cards) through the game host, and a search for a seed whose game reaches a situation with an
 * Aura, an Equipment or an anthem in play. A scripted human (`chooseAction`) plays lands and casts
 * spells until `accept` says stop. `cast` and `equip` then drive one Aura or Equip through the
 * same decisions a player answers.
 */
import type { GameView, ObjectView, PriorityDecision } from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const ATTACHMENTS_DECK = 'synthetic-attachments';

export type Reached = { host: GameHost; snap: Snapshot; seed: number };

export async function reachAttachments(
  accept: (snap: Snapshot) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<Reached | null> {
  const { seeds = 80, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    let snap = (await host.newGame({ seed, humanDeck: ATTACHMENTS_DECK, aiDeck: 'swamp-forest' }))
      .snapshot;
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = snap.view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(snap)) return { host, snap, seed };
      const next = await host.act(chooseAction(view, view.pending));
      if (next.error !== null) break;
      snap = next;
    }
  }
  return null;
}

export async function mustReach(
  accept: (snap: Snapshot) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<Reached> {
  const reached = await reachAttachments(accept, opts);
  if (reached === null) throw new Error('no seed reached the situation');
  return reached;
}

export const priorityOf = (snap: Snapshot): PriorityDecision | null =>
  snap.view.pending?.kind === 'priority' ? snap.view.pending : null;

/** My permanents with this name on the battlefield. */
export function mine(view: GameView, name: string): ObjectView[] {
  return view.battlefield.filter((o) => o.name === name && o.controller === view.viewer);
}

/** A card of mine in hand or on the battlefield with this name. */
export function find(view: GameView, name: string): ObjectView | undefined {
  return [...view.battlefield, ...(view.seats[view.viewer]?.hand ?? [])].find(
    (o) => o.name === name && o.controller === view.viewer,
  );
}

export const myCreatures = (view: GameView): ObjectView[] =>
  view.battlefield.filter((o) => o.types.includes('creature') && o.controller === view.viewer);

export const untappedLands = (view: GameView): number =>
  view.battlefield.filter(
    (o) => o.types.includes('land') && o.controller === view.viewer && !o.tapped,
  ).length;

/** My turn, empty stack, priority: where a sorcery-speed action may start. */
export function mainPhase(snap: Snapshot): boolean {
  const p = priorityOf(snap);
  return (
    p !== null &&
    snap.view.activeSeat === snap.view.viewer &&
    snap.view.stack.length === 0 &&
    (snap.view.step === 'precombatMain' || snap.view.step === 'postcombatMain')
  );
}

export function canCast(snap: Snapshot, name: string): boolean {
  const id = find(snap.view, name)?.id;
  return (
    mainPhase(snap) &&
    priorityOf(snap)?.options.some((o) => o.kind === 'castSpell' && o.object === id) === true
  );
}

export function canActivate(snap: Snapshot, name: string): boolean {
  const id = mine(snap.view, name)[0]?.id;
  return (
    mainPhase(snap) &&
    priorityOf(snap)?.options.some((o) => o.kind === 'activate' && o.object === id) === true
  );
}

/**
 * Casts the named Aura from the hand onto `hostId`, pays automatically and lets it resolve.
 * Returns the snapshot after the resolution and every snapshot on the way.
 */
export async function castAura(
  host: GameHost,
  snap: Snapshot,
  name: string,
  hostId: string,
): Promise<{ steps: Snapshot[]; last: Snapshot }> {
  const card = find(snap.view, name);
  if (card === undefined) throw new Error(`no ${name}`);
  const steps: Snapshot[] = [];
  const step = async (action: Parameters<GameHost['act']>[0]) => {
    const next = await host.act(action);
    if (next.error !== null) throw new Error(next.error);
    steps.push(next);
    return next;
  };
  const asked = await step({ kind: 'castSpell', object: card.id });
  const pending = asked.view.pending;
  if (pending?.kind !== 'targets') throw new Error(`expected targets, got ${pending?.kind}`);
  const slot = pending.specs[0];
  const target = slot?.legal.find((t) => t.kind === 'object' && t.id === hostId);
  if (slot === undefined || target === undefined) throw new Error('the host is not a legal target');
  await step({ kind: 'chooseTargets', targets: [{ ...target, specId: slot.specId }] });
  await step({ kind: 'payAuto' });
  const last = await step({ kind: 'pass' });
  return { steps, last };
}

/** Activates Equip of the named Equipment onto `hostId`, pays automatically, lets it resolve. */
export async function equip(
  host: GameHost,
  snap: Snapshot,
  name: string,
  hostId: string,
): Promise<{ steps: Snapshot[]; last: Snapshot }> {
  const gear = mine(snap.view, name)[0];
  const option = priorityOf(snap)?.options.find(
    (o) => o.kind === 'activate' && o.object === gear?.id,
  );
  if (option?.kind !== 'activate') throw new Error(`cannot equip ${name}`);
  const steps: Snapshot[] = [];
  const step = async (action: Parameters<GameHost['act']>[0]) => {
    const next = await host.act(action);
    if (next.error !== null) throw new Error(next.error);
    steps.push(next);
    return next;
  };
  const asked = await step(option);
  const pending = asked.view.pending;
  if (pending?.kind !== 'targets') throw new Error(`expected targets, got ${pending?.kind}`);
  const slot = pending.specs[0];
  const target = slot?.legal.find((t) => t.kind === 'object' && t.id === hostId);
  if (slot === undefined || target === undefined) throw new Error('not a legal equip target');
  await step({ kind: 'chooseTargets', targets: [{ ...target, specId: slot.specId }] });
  if (steps[steps.length - 1]?.view.pending?.kind === 'payMana') await step({ kind: 'payAuto' });
  const last = await step({ kind: 'pass' });
  return { steps, last };
}

export type AttachmentsStore = ReturnType<typeof createAppStore>;

/** The same search through the page's store, for the render tests: returns the store at `accept`. */
export async function reachAttachmentsStore(
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number; makeHost?: () => GameHost } = {},
): Promise<AttachmentsStore | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const store = createAppStore({
      client: opts.makeHost?.() ?? new GameHost({ clock: () => 0 }),
    });
    await store.getState().startGame({ seed, humanDeck: ATTACHMENTS_DECK, aiDeck: 'swamp-forest' });
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      if (view.pending.kind === 'priority' && accept(view)) return store;
      const before = store.getState().snapshot?.revision;
      await store.getState().act(chooseAction(view, view.pending));
      if (store.getState().snapshot?.revision === before) break;
    }
  }
  return null;
}
