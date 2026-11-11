/**
 * The hidden SYNTHETIC deck `synthetic-ward` (game/precons.ts: invented engine fixtures, not real
 * cards) through the game host or the page's store, and a search for a seed whose game reaches a
 * situation. A scripted human plays lands and creatures only (a spell is kept in hand until a
 * scenario casts it on purpose), until `accept` says stop. Two scenarios are scripted from there:
 * a Bolt (or Murder) at the opponent's warded creature, and a Twin Image on the human's own
 * legendary creature, whose token copy meets the legend rule.
 */
import type {
  Action,
  GameView,
  ObjectView,
  PendingDecision,
  PriorityDecision,
} from '@commander-arena/engine';
import { GameHost } from '../src/game/host';
import type { LogEntry, Snapshot } from '../src/game/protocol';
import { createAppStore } from '../src/store';
import { chooseAction } from './bot';

export const WARD_DECK = 'synthetic-ward';

/** What a scenario needs from the game: the latest snapshot and a way to send an action. */
export interface Session {
  readonly snapshot: () => Snapshot;
  /** Every log line since the game began, in order. */
  readonly log: () => readonly LogEntry[];
  /** Sends the action; resolves to the new snapshot, or null when the engine refused it. */
  readonly act: (action: Action) => Promise<Snapshot | null>;
}

export type WardStore = ReturnType<typeof createAppStore>;

export function hostSession(host: GameHost, first: Snapshot): Session {
  let latest = first;
  const log: LogEntry[] = [...first.log];
  return {
    snapshot: () => latest,
    log: () => log,
    act: async (action) => {
      const next = await host.act(action);
      if (next.error !== null) return null;
      latest = next;
      log.push(...next.log);
      return next;
    },
  };
}

export function storeSession(store: WardStore): Session {
  const snapshot = (): Snapshot => {
    const snap = store.getState().snapshot;
    if (snap === null) throw new Error('no game');
    return snap;
  };
  return {
    snapshot,
    log: () => store.getState().log,
    act: async (action) => {
      const before = snapshot().revision;
      await store.getState().act(action);
      return snapshot().revision === before ? null : snapshot();
    },
  };
}

export const handOf = (view: GameView): readonly ObjectView[] =>
  view.seats[view.viewer]?.hand ?? [];

export const priorityOf = (view: GameView): PriorityDecision | null =>
  view.pending?.kind === 'priority' ? view.pending : null;

/** The scripted human: lands first, then creatures; every other card stays in the hand. */
export function wardBot(view: GameView, decision: PendingDecision): Action {
  if (decision.kind !== 'priority') return chooseAction(view, decision);
  const land = decision.options.find((o) => o.kind === 'playLand');
  if (land !== undefined) return land;
  const hand = handOf(view);
  const creature = decision.options.find(
    (o) =>
      o.kind === 'castSpell' && hand.some((c) => c.id === o.object && c.types.includes('creature')),
  );
  return creature ?? { kind: 'pass' };
}

/** The viewer's castable card with this name, as the priority option that casts it. */
export function castOption(view: GameView, name: string): Action | null {
  const priority = priorityOf(view);
  const card = handOf(view).find((c) => c.name === name);
  if (priority === null || card === undefined) return null;
  return priority.options.find((o) => o.kind === 'castSpell' && o.object === card.id) ?? null;
}

/** The permanent with this name, among the viewer's (`mine`) or the opponent's. */
export function permanent(view: GameView, name: string, mine: boolean): ObjectView | undefined {
  return view.battlefield.find((o) => o.name === name && (o.controller === view.viewer) === mine);
}

/** How many untapped permanents of the viewer have this name. */
export function untapped(view: GameView, name: string): number {
  return view.battlefield.filter(
    (o) => o.name === name && o.controller === view.viewer && o.tapped !== true,
  ).length;
}

/** Untapped mana the viewer has: lands count 1 and a Sol Ring 2. */
export function manaAvailable(view: GameView): number {
  return view.battlefield
    .filter((o) => o.controller === view.viewer && o.tapped !== true)
    .reduce((n, o) => n + (o.name === 'Sol Ring' ? 2 : o.types.includes('land') ? 1 : 0), 0);
}

/**
 * The viewer has priority with `spell` castable and the opponent controls `creature`; with enough
 * mana for the spell (a Mountain for the Bolt, three sources for a Murder) and `spare` more.
 */
export function canStrike(view: GameView, spell: string, creature: string, spare: number): boolean {
  const base = spell === 'Lightning Bolt' ? 1 : 3;
  const colored = spell === 'Lightning Bolt' ? untapped(view, 'Mountain') > 0 : true;
  return (
    castOption(view, spell) !== null &&
    permanent(view, creature, false) !== undefined &&
    colored &&
    manaAvailable(view) >= base + spare
  );
}

/** The viewer has priority, a Twin Image castable, one Ancient Knight of their own and an Island. */
export function canTwin(view: GameView): boolean {
  return (
    castOption(view, 'SYNTHETIC Twin Image') !== null &&
    permanent(view, 'SYNTHETIC Ancient Knight', true) !== undefined &&
    untapped(view, 'Island') > 0 &&
    manaAvailable(view) >= 2
  );
}

/** A game of the ward deck against the same deck, played by the scripted human until `accept`. */
export async function searchWard(
  start: (seed: number) => Promise<Session>,
  accept: (view: GameView) => boolean,
  opts: { seeds?: number; maxClicks?: number } = {},
): Promise<{ session: Session; seed: number } | null> {
  const { seeds = 60, maxClicks = 500 } = opts;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const session = await start(seed);
    for (let clicks = 0; clicks < maxClicks; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view)) return { session, seed };
      if ((await session.act(wardBot(view, view.pending))) === null) break;
    }
  }
  return null;
}

export const startHost =
  (humanDeck = WARD_DECK) =>
  async (seed: number): Promise<Session & { host: GameHost }> => {
    const host = new GameHost({ clock: () => 0 });
    const first = (await host.newGame({ seed, humanDeck, aiDeck: WARD_DECK })).snapshot;
    return { ...hostSession(host, first), host };
  };

export const startStore = async (seed: number): Promise<Session & { store: WardStore }> => {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed, humanDeck: WARD_DECK, aiDeck: WARD_DECK });
  return { ...storeSession(store), store };
};

async function must(session: Session, action: Action): Promise<Snapshot> {
  const next = await session.act(action);
  if (next === null) throw new Error(`the engine refused ${action.kind}`);
  return next;
}

/** Casts the spell at the target (the first legal slot entry for it) and pays for it with Auto-pay. */
export async function castAt(session: Session, spell: string, targetId: string): Promise<Snapshot> {
  const option = castOption(session.snapshot().view, spell);
  if (option === null) throw new Error(`${spell} cannot be cast`);
  let snap = await must(session, option);
  const asked = snap.view.pending;
  if (asked?.kind !== 'targets') throw new Error(`expected targets, got ${asked?.kind}`);
  const chosen = asked.specs
    .flatMap((s) => s.legal)
    .find((t) => t.kind === 'object' && t.id === targetId);
  if (chosen === undefined) throw new Error('the target is not legal');
  snap = await must(session, { kind: 'chooseTargets', targets: [chosen] });
  if (snap.view.pending?.kind === 'payMana') snap = await must(session, { kind: 'payAuto' });
  return snap;
}

/** Passes priority until the human is asked something other than priority (or `max` passes). */
export async function passUntilAsked(session: Session, max = 6): Promise<Snapshot> {
  let snap = session.snapshot();
  for (let i = 0; i < max && snap.view.pending?.kind === 'priority'; i += 1) {
    snap = await must(session, { kind: 'pass' });
  }
  return snap;
}

/** Bolts (or Murders) the opponent's creature and passes until the ward question. */
export async function strikeWarded(
  session: Session,
  spell: string,
  creature: string,
): Promise<Snapshot> {
  const target = permanent(session.snapshot().view, creature, false);
  if (target === undefined) throw new Error(`${creature} is not on the battlefield`);
  await castAt(session, spell, target.id);
  return passUntilAsked(session);
}

/** Twin Images the human's Ancient Knight and passes until the legend rule is asked. */
export async function twinKnight(session: Session): Promise<Snapshot> {
  const knight = permanent(session.snapshot().view, 'SYNTHETIC Ancient Knight', true);
  if (knight === undefined) throw new Error('no Ancient Knight');
  await castAt(session, 'SYNTHETIC Twin Image', knight.id);
  return passUntilAsked(session);
}

/** True when the pending decision is Ward's question. */
export function wardAsk(view: GameView): boolean {
  const p = view.pending;
  return p?.kind === 'confirmOptional' && p.purpose === 'ward';
}

export const legendAsk = (view: GameView): boolean =>
  view.pending?.kind === 'choosePermanent' && view.pending.purpose === 'legendRule';
