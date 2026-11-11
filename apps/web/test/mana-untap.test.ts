/**
 * Playtest issue 19 (1): clicking a land that was tapped for mana, while its mana is unspent, untaps
 * it: a shortcut for Undo (D-050), offered only while the history still ends at the tap.
 */
import {
  type Action,
  type GameView,
  type ObjectId,
  objectId,
  type PriorityDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore, untappableSources } from '../src/store';
import { withManaUntap } from '../src/ui/decisions/untap-mana';
import { chooseAction } from './bot';

type Store = ReturnType<typeof createAppStore>;

/** The decision of the viewer, when it is a priority decision. */
const priority = (store: Store): PriorityDecision | null => {
  const p = store.getState().snapshot?.view.pending;
  return p?.kind === 'priority' ? p : null;
};

/** A main phase of ours with two lands on the battlefield that tap for mana. */
async function withTwoLands(): Promise<Store> {
  for (let seed = 1; seed < 40; seed += 1) {
    const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
    store.getState().setSettings({ fullControl: true });
    await store.getState().startGame({ seed, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
    for (let i = 0; i < 400; i += 1) {
      const view = store.getState().snapshot?.view;
      if (view === undefined || view.result !== null || view.pending === null) break;
      const lands = view.battlefield.filter(
        (o) => o.controller === view.viewer && o.types.includes('land') && !o.tapped,
      );
      const p = priority(store);
      if (
        p !== null &&
        lands.length >= 2 &&
        lands.every((l) => p.options.some((o) => o.kind === 'activateAbility' && o.source === l.id))
      ) {
        return store;
      }
      await store.getState().act(chooseAction(view, view.pending));
    }
  }
  throw new Error('no seed reaches two untapped lands');
}

const tapOf = (store: Store, source: ObjectId): Action => {
  const option = priority(store)?.options.find(
    (o) => o.kind === 'activateAbility' && o.source === source,
  );
  if (option?.kind !== 'activateAbility') throw new Error('not tappable');
  return option;
};

const landsOf = (view: GameView) =>
  view.battlefield.filter((o) => o.controller === view.viewer && o.types.includes('land'));

const o1 = objectId(1);
const o2 = objectId(2);

describe('clicking a tapped land takes its mana back', () => {
  test('one tap: the land is offered, untaps, and the pool is empty again', async () => {
    const store = await withTwoLands();
    const [a] = landsOf(store.getState().snapshot?.view as GameView).filter((l) => !l.tapped);
    if (a === undefined) throw new Error('no land');
    await store.getState().act(tapOf(store, a.id));
    const s = store.getState();
    expect(
      untappableSources(s.manaTaps, s.snapshot?.undoDepth ?? 0, s.snapshot?.view ?? null),
    ).toEqual(new Set([a.id]));
    expect(s.snapshot?.view.seats[0]?.manaPool.length).toBeGreaterThan(0);
    await store.getState().untapMana(a.id);
    const after = store.getState();
    expect(after.snapshot?.view.battlefield.find((o) => o.id === a.id)?.tapped).toBe(false);
    expect(after.snapshot?.view.seats[0]?.manaPool.length).toBe(0);
    expect(after.manaTaps).toEqual([]);
  });

  test('two taps: clicking the first takes both back', async () => {
    const store = await withTwoLands();
    const [a, b] = landsOf(store.getState().snapshot?.view as GameView).filter((l) => !l.tapped);
    if (a === undefined || b === undefined) throw new Error('two lands');
    await store.getState().act(tapOf(store, a.id));
    await store.getState().act(tapOf(store, b.id));
    expect(store.getState().manaTaps.map((t) => t.source)).toEqual([a.id, b.id]);
    await store.getState().untapMana(a.id);
    const view = store.getState().snapshot?.view as GameView;
    expect(view.battlefield.find((o) => o.id === a.id)?.tapped).toBe(false);
    expect(view.battlefield.find((o) => o.id === b.id)?.tapped).toBe(false);
    expect(store.getState().snapshot?.undoDepth).toBeLessThan(2);
  });

  test('clicking the second takes back only the second', async () => {
    const store = await withTwoLands();
    const [a, b] = landsOf(store.getState().snapshot?.view as GameView).filter((l) => !l.tapped);
    if (a === undefined || b === undefined) throw new Error('two lands');
    await store.getState().act(tapOf(store, a.id));
    await store.getState().act(tapOf(store, b.id));
    await store.getState().untapMana(b.id);
    const view = store.getState().snapshot?.view as GameView;
    expect(view.battlefield.find((o) => o.id === a.id)?.tapped).toBe(true);
    expect(view.battlefield.find((o) => o.id === b.id)?.tapped).toBe(false);
    expect(store.getState().manaTaps.map((t) => t.source)).toEqual([a.id]);
  });

  test('once something else was done the land is no longer offered and a click does nothing', async () => {
    const store = await withTwoLands();
    const [a, b] = landsOf(store.getState().snapshot?.view as GameView).filter((l) => !l.tapped);
    if (a === undefined || b === undefined) throw new Error('two lands');
    await store.getState().act(tapOf(store, a.id));
    // Something that is not a mana tap: the run is over.
    await store.getState().act({ kind: 'pass' });
    expect(store.getState().manaTaps).toEqual([]);
    const before = store.getState().snapshot;
    await store.getState().untapMana(a.id);
    expect(store.getState().snapshot).toBe(before);
  });

  test('not while the game waits for anything but priority', () => {
    const taps = [{ source: o1, depth: 1 }];
    const waiting = { pending: { kind: 'payMana' } } as unknown as GameView;
    expect(untappableSources(taps, 1, waiting)).toEqual(new Set());
    expect(untappableSources(taps, 2, { pending: { kind: 'priority' } } as GameView)).toEqual(
      new Set(),
    );
    expect(untappableSources(taps, 1, null)).toEqual(new Set());
  });
});

describe('the interaction of a tapped land', () => {
  const base = {
    clickable: new Set<ObjectId>([o2]),
    selected: new Set<ObjectId>(),
    clickableSeats: new Set<number>(),
    selectedSeats: new Set<number>(),
    dimOthers: false,
    onObject: () => {},
    onSeat: () => {},
    badge: () => null,
  };

  test('the tapped land becomes clickable and a click untaps it; another keeps its own click', () => {
    const clicks: string[] = [];
    const ix = withManaUntap(
      { ...base, onObject: (id) => clicks.push(`base ${id}`) },
      new Set([o1]),
      (id) => clicks.push(`untap ${id}`),
    );
    expect([...ix.clickable].sort()).toEqual([o1, o2]);
    ix.onObject(o1);
    ix.onObject(o2);
    expect(clicks).toEqual([`untap ${o1}`, `base ${o2}`]);
    expect(ix.badge(o1)).toBe('Untap');
    expect(ix.badge(o2)).toBeNull();
  });

  test('a permanent the decision already makes clickable keeps its click, and nothing changes without taps', () => {
    const same = withManaUntap(base, new Set([o2]), () => {});
    expect(same).toBe(base);
    expect(withManaUntap(base, new Set(), () => {})).toBe(base);
  });
});
