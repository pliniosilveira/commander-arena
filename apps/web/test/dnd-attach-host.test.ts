/**
 * The three drops that start something and then need a second answer, through the page's store
 * with the hidden SYNTHETIC decks `synthetic-attachments` and `synthetic-kicker` (invented
 * engine fixtures, not real cards): Equip dragged onto a creature, an Aura dragged from the hand
 * onto a permanent, a flashback card dragged out of the graveyard. Every test drops exactly the way
 * the decision layer does (`resolveDrop`, then `startAndTarget` or the action) and reads what the
 * host was sent, so the sequence of real actions is what is asserted.
 */
import type { Action, GameView, ObjectId, PendingDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import type { AppStore } from '../src/store';
import { objectIndex } from '../src/ui/decisions/lookup';
import { initialUi } from '../src/ui/decisions/ui-state';
import { attachDeps, startAndTarget } from '../src/ui/dnd/attach-flow';
import { type DragSource, type DropTarget, dragSpec, resolveDrop } from '../src/ui/dnd/model';
import { find, mine, myCreatures, reachAttachmentsStore } from './attachments-decks';
import { flashbackCards, reachKickerStore } from './kicker-decks';

/** A host that remembers every action the page sent it. */
class SpyHost extends GameHost {
  readonly sent: Action[] = [];
  override async act(action: Action) {
    this.sent.push(action);
    return super.act(action);
  }
}

interface Rig {
  readonly store: AppStore;
  readonly host: SpyHost;
}

const viewOf = (store: AppStore): GameView => {
  const view = store.getState().snapshot?.view;
  if (view === undefined) throw new Error('no game');
  return view;
};
const pendingOf = (store: AppStore): PendingDecision => {
  const pending = viewOf(store).pending;
  if (pending === null) throw new Error('no decision');
  return pending;
};

function specOf(view: GameView, id: ObjectId, source: DragSource) {
  const pending = view.pending;
  if (pending === null) return null;
  return dragSpec(pending, initialUi(pending), objectIndex(view), view.viewer, id, source);
}

/** Reaches a situation with a spy host; `accept` is checked at each priority decision. */
async function reach(
  finder: typeof reachAttachmentsStore,
  accept: (view: GameView) => boolean,
): Promise<Rig> {
  let host = new SpyHost({ clock: () => 0 });
  const store = await finder(accept, {
    makeHost: () => {
      host = new SpyHost({ clock: () => 0 });
      return host;
    },
  });
  if (store === null) throw new Error('no seed reached the situation');
  return { store, host };
}

/** What the decision layer does with a drop; returns what it did. */
async function drop(
  store: AppStore,
  id: ObjectId,
  source: DragSource,
  target: DropTarget,
): Promise<string> {
  const view = viewOf(store);
  const pending = pendingOf(store);
  const result = resolveDrop(
    pending,
    initialUi(pending),
    objectIndex(view),
    view.viewer,
    id,
    source,
    target,
  );
  if (result.kind === 'act') {
    await store.getState().act(result.action);
    return 'act';
  }
  if (result.kind === 'attach') {
    return startAndTarget(attachDeps(store), result.start, result.host);
  }
  return result.kind;
}

/** Passes (the Resolve button) until the stack is empty. */
async function resolveAll(store: AppStore): Promise<GameView> {
  for (let i = 0; i < 12 && viewOf(store).stack.length > 0; i += 1) {
    await store.getState().act({ kind: 'pass' });
  }
  return viewOf(store);
}

const kinds = (actions: readonly Action[]) => actions.map((a) => a.kind);
const object = (id: ObjectId): DropTarget => ({ kind: 'object', id });

/** My turn at priority with Equipment on the field that a drag may move onto a creature. */
const canDragBlade = (view: GameView): boolean => {
  const blade = mine(view, 'SYNTHETIC Blade').find((o) => o.attachedTo === undefined);
  return blade !== undefined && specOf(view, blade.id, 'permanent') !== null;
};
const canDragAura = (view: GameView): boolean => {
  const aura = find(view, 'SYNTHETIC Might Aura');
  return aura?.zone === 'hand' && specOf(view, aura.id, 'card') !== null;
};

const SLOW = { timeout: 40_000 };

describe('Equip dragged onto a creature', () => {
  test('activate, then the target answered with the creature, then auto-pay', SLOW, async () => {
    const { store, host } = await reach(reachAttachmentsStore, canDragBlade);
    const view = viewOf(store);
    const blade = mine(view, 'SYNTHETIC Blade')[0];
    const zones = blade === undefined ? null : specOf(view, blade.id, 'permanent');
    const creature = zones?.zones[0]?.target;
    if (blade === undefined || creature?.kind !== 'object') throw new Error('no gesture');
    const power = myCreatures(view).find((c) => c.id === creature.id)?.power ?? 0;
    const sent = host.sent.length;

    expect(await drop(store, blade.id, 'permanent', creature)).toBe('attached');
    const actions = host.sent.slice(sent);
    expect(kinds(actions).slice(0, 3)).toEqual(['activate', 'chooseTargets', 'payAuto']);
    const answer = actions[1];
    if (answer?.kind !== 'chooseTargets') throw new Error('no answer');
    expect(answer.targets).toEqual([{ kind: 'object', id: creature.id, specId: 't1' }]);
    // The ability is on the stack now; the page's Resolve attaches it.
    const after = await resolveAll(store);
    expect(mine(after, 'SYNTHETIC Blade')[0]?.attachedTo).toBe(creature.id);
    expect(after.battlefield.find((o) => o.id === creature.id)?.power).toBe(power + 2);
    expect(store.getState().error).toBeNull();
  });

  test('a drop that is no zone sends nothing at all', SLOW, async () => {
    const { store, host } = await reach(reachAttachmentsStore, canDragBlade);
    const view = viewOf(store);
    const blade = mine(view, 'SYNTHETIC Blade')[0];
    const land = view.battlefield.find((o) => o.types.includes('land') && o.controller === 0);
    if (blade === undefined || land === undefined) throw new Error('nothing to drop on');
    const sent = host.sent.length;
    expect(await drop(store, blade.id, 'permanent', object(land.id))).toBe('none');
    expect(await drop(store, blade.id, 'permanent', { kind: 'battlefield' })).toBe('none');
    expect(await drop(store, blade.id, 'permanent', { kind: 'seat', seat: 1 })).toBe('none');
    expect(host.sent.length).toBe(sent);
    expect(viewOf(store).pending?.kind).toBe('priority');
  });

  test(
    'with manual payment on, the drop stops at the payment overlay and pays nothing',
    SLOW,
    async () => {
      const { store, host } = await reach(reachAttachmentsStore, canDragBlade);
      store.getState().setManualPay(true);
      const view = viewOf(store);
      const blade = mine(view, 'SYNTHETIC Blade')[0];
      const creature =
        blade === undefined ? undefined : specOf(view, blade.id, 'permanent')?.zones[0];
      if (blade === undefined || creature === undefined) throw new Error('no gesture');
      const sent = host.sent.length;
      expect(await drop(store, blade.id, 'permanent', creature.target)).toBe('attached');
      expect(kinds(host.sent.slice(sent))).toEqual(['activate', 'chooseTargets']);
      expect(pendingOf(store).kind).toBe('payMana');
    },
  );

  test(
    'a creature the engine does not offer: the activation is cancelled and the player told',
    SLOW,
    async () => {
      const { store, host } = await reach(reachAttachmentsStore, canDragBlade);
      const view = viewOf(store);
      const blade = mine(view, 'SYNTHETIC Blade')[0];
      const land = view.battlefield.find((o) => o.types.includes('land') && o.controller === 0);
      const option = view.pending?.kind === 'priority' ? view.pending.options : [];
      const equip = option.find((o) => o.kind === 'activate' && o.object === blade?.id);
      if (blade === undefined || land === undefined || equip === undefined)
        throw new Error('setup');
      const depth = store.getState().snapshot?.undoDepth ?? 0;
      const sent = host.sent.length;

      // Not reachable by a drop (the land is no zone): call the flow directly.
      const outcome = await startAndTarget(attachDeps(store), equip as Action, land.id);
      expect(outcome).toBe('cancelled');
      expect(kinds(host.sent.slice(sent))).toEqual(['activate', 'cancel']);
      const after = viewOf(store);
      expect(after.pending?.kind).toBe('priority');
      expect(mine(after, 'SYNTHETIC Blade')[0]?.attachedTo).toBeUndefined();
      expect(store.getState().error).toBe(`SYNTHETIC Blade cannot be attached to ${land.name}.`);
      // Cancelling put the game back; the cast's undo point is gone with it.
      expect(store.getState().snapshot?.undoDepth).toBe(depth);
    },
  );

  test(
    'an activation the engine refuses leaves the game alone and sends nothing more',
    SLOW,
    async () => {
      const { store, host } = await reach(reachAttachmentsStore, canDragBlade);
      const sent = host.sent.length;
      const bogus: Action = { kind: 'activate', object: 'o99999', abilityIndex: 0 };
      expect(await startAndTarget(attachDeps(store), bogus, 'o1')).toBe('left');
      expect(host.sent.length).toBe(sent + 1);
      expect(store.getState().error).not.toBeNull();
      expect(viewOf(store).pending?.kind).toBe('priority');
    },
  );

  test(
    'undo after the drop is the same as after the click path, state for state',
    SLOW,
    async () => {
      const dragRig = await reach(reachAttachmentsStore, canDragBlade);
      const clickRig = await reach(reachAttachmentsStore, canDragBlade);
      // Full control keeps the autopilot from passing, so the undo window stays open.
      dragRig.store.getState().setSettings({ fullControl: true });
      clickRig.store.getState().setSettings({ fullControl: true });
      const view = viewOf(dragRig.store);
      const blade = mine(view, 'SYNTHETIC Blade')[0];
      const host = blade === undefined ? undefined : specOf(view, blade.id, 'permanent')?.zones[0];
      const target = host?.target;
      const option = view.pending?.kind === 'priority' ? view.pending.options : [];
      const equip = option.find((o) => o.kind === 'activate' && o.object === blade?.id);
      if (blade === undefined || target?.kind !== 'object' || equip === undefined)
        throw new Error('x');

      await drop(dragRig.store, blade.id, 'permanent', target);
      // The click path: the chooser-less click, then a click on the creature and Confirm.
      await clickRig.store.getState().act(equip as Action);
      await clickRig.store
        .getState()
        .act({ kind: 'chooseTargets', targets: [{ kind: 'object', id: target.id, specId: 't1' }] });

      const a = dragRig.store.getState().snapshot;
      const b = clickRig.store.getState().snapshot;
      expect(a?.view).toEqual(b?.view);
      expect(a?.undoDepth).toBe(b?.undoDepth);
      expect(a?.undoDepth).toBeGreaterThan(0);

      await dragRig.store.getState().undo();
      await clickRig.store.getState().undo();
      expect(dragRig.store.getState().snapshot?.view).toEqual(
        clickRig.store.getState().snapshot?.view,
      );
      expect(dragRig.store.getState().snapshot?.undoDepth).toBe(
        clickRig.store.getState().snapshot?.undoDepth,
      );
    },
  );
});

describe('an Aura dragged onto a permanent', () => {
  test('cast, then the enchant slot answered with the permanent, then auto-pay', SLOW, async () => {
    const { store, host } = await reach(reachAttachmentsStore, canDragAura);
    const view = viewOf(store);
    const aura = find(view, 'SYNTHETIC Might Aura');
    const zone = aura === undefined ? undefined : specOf(view, aura.id, 'card')?.zones[0];
    if (aura === undefined || zone?.target.kind !== 'object') throw new Error('no gesture');
    const hostId = zone.target.id;
    const before = view.battlefield.find((o) => o.id === hostId);
    const sent = host.sent.length;

    expect(await drop(store, aura.id, 'card', zone.target)).toBe('attached');
    const actions = host.sent.slice(sent);
    expect(kinds(actions).slice(0, 3)).toEqual(['castSpell', 'chooseTargets', 'payAuto']);
    const answer = actions[1];
    if (answer?.kind !== 'chooseTargets') throw new Error('no answer');
    expect(answer.targets).toEqual([{ kind: 'object', id: hostId, specId: 'enchant' }]);

    const after = await resolveAll(store);
    const resolved = mine(after, 'SYNTHETIC Might Aura').find((o) => o.attachedTo === hostId);
    expect(resolved).toBeDefined();
    const now = after.battlefield.find((o) => o.id === hostId);
    expect(now?.power).toBe((before?.power ?? 0) + 2);
    expect(now?.toughness).toBe((before?.toughness ?? 0) + 2);
  });

  test('every zone offered is a legal enchant target of the engine', SLOW, async () => {
    const { store, host } = await reach(reachAttachmentsStore, canDragAura);
    const view = viewOf(store);
    const aura = find(view, 'SYNTHETIC Might Aura');
    if (aura === undefined) throw new Error('no Aura');
    const zones = specOf(view, aura.id, 'card')?.zones ?? [];
    expect(zones.length).toBeGreaterThan(0);
    // Start the cast the click way and read the engine's own list of legal targets.
    const sent = host.sent.length;
    await store.getState().act({ kind: 'castSpell', object: aura.id });
    const asked = pendingOf(store);
    if (asked.kind !== 'targets') throw new Error('expected targets');
    const legal = new Set(
      asked.specs
        .find((s) => s.specId === 'enchant')
        ?.legal.flatMap((t) => (t.kind === 'object' ? [t.id] : [])),
    );
    for (const z of zones) expect(z.target.kind === 'object' && legal.has(z.target.id)).toBe(true);
    expect(host.sent.length).toBe(sent + 1);
  });

  test('a drop outside the hosts sends nothing: the Aura stays in the hand', SLOW, async () => {
    const { store, host } = await reach(reachAttachmentsStore, canDragAura);
    const aura = find(viewOf(store), 'SYNTHETIC Might Aura');
    if (aura === undefined) throw new Error('no Aura');
    const sent = host.sent.length;
    expect(await drop(store, aura.id, 'card', { kind: 'battlefield' })).toBe('none');
    expect(await drop(store, aura.id, 'card', { kind: 'stack' })).toBe('none');
    expect(host.sent.length).toBe(sent);
    expect(find(viewOf(store), 'SYNTHETIC Might Aura')?.zone).toBe('hand');
  });

  test('a host the engine does not offer cancels the cast and says so', SLOW, async () => {
    const { store, host } = await reach(reachAttachmentsStore, canDragAura);
    const view = viewOf(store);
    const aura = find(view, 'SYNTHETIC Might Aura');
    const land = view.battlefield.find((o) => o.types.includes('land') && o.controller === 0);
    if (aura === undefined || land === undefined) throw new Error('setup');
    const sent = host.sent.length;
    const outcome = await startAndTarget(
      attachDeps(store),
      { kind: 'castSpell', object: aura.id },
      land.id,
    );
    expect(outcome).toBe('cancelled');
    expect(kinds(host.sent.slice(sent))).toEqual(['castSpell', 'cancel']);
    expect(find(viewOf(store), 'SYNTHETIC Might Aura')?.zone).toBe('hand');
    expect(store.getState().error).toBe(`SYNTHETIC Might Aura cannot be attached to ${land.name}.`);
  });

  test('undo takes the cast back like a click does', SLOW, async () => {
    const { store } = await reach(reachAttachmentsStore, canDragAura);
    store.getState().setSettings({ fullControl: true });
    const view = viewOf(store);
    const aura = find(view, 'SYNTHETIC Might Aura');
    const zone = aura === undefined ? undefined : specOf(view, aura.id, 'card')?.zones[0];
    if (aura === undefined || zone === undefined) throw new Error('no gesture');
    const handBefore = view.seats[0]?.hand?.length;
    await drop(store, aura.id, 'card', zone.target);
    expect(store.getState().snapshot?.undoDepth).toBeGreaterThan(0);
    for (let i = 0; i < 6 && viewOf(store).stack.length > 0; i += 1) await store.getState().undo();
    expect(viewOf(store).stack).toHaveLength(0);
    expect(viewOf(store).seats[0]?.hand?.length).toBe(handBefore);
  });
});

describe('a graveyard card dragged onto the board', () => {
  const flashbackOf = (name: string) => (view: GameView) =>
    view.pending?.kind === 'priority' &&
    flashbackCards(view).some((c) => c.name === name && specOf(view, c.id, 'card') !== null);

  test('casts with flashback, then the usual flow pays and exiles it', SLOW, async () => {
    const { store, host } = await reach(reachKickerStore, flashbackOf('SYNTHETIC Flash Gain'));
    store.getState().setSettings({ fullControl: true });
    const view = viewOf(store);
    const card = flashbackCards(view).find((c) => c.name === 'SYNTHETIC Flash Gain');
    if (card === undefined) throw new Error('no card');
    const sent = host.sent.length;

    expect(await drop(store, card.id, 'card', { kind: 'battlefield' })).toBe('act');
    const [cast, pay] = host.sent.slice(sent);
    expect(cast).toEqual({ kind: 'castSpell', object: card.id, alternative: 'flashback' });
    expect(pay?.kind).toBe('payAuto');
    expect(viewOf(store).stack.find((o) => o.name === 'SYNTHETIC Flash Gain')?.flashback).toBe(
      true,
    );
    const after = await resolveAll(store);
    expect(after.exile.some((o) => o.name === 'SYNTHETIC Flash Gain')).toBe(true);
  });

  test('the stack panel takes it too, and anywhere else sends nothing', SLOW, async () => {
    const { store, host } = await reach(reachKickerStore, flashbackOf('SYNTHETIC Flash Gain'));
    const card = flashbackCards(viewOf(store)).find((c) => c.name === 'SYNTHETIC Flash Gain');
    if (card === undefined) throw new Error('no card');
    const sent = host.sent.length;
    expect(await drop(store, card.id, 'card', { kind: 'seat', seat: 1 })).toBe('none');
    expect(await drop(store, card.id, 'card', object('o1'))).toBe('none');
    expect(host.sent.length).toBe(sent);
    expect(await drop(store, card.id, 'card', { kind: 'stack' })).toBe('act');
    expect(host.sent[sent]).toMatchObject({ kind: 'castSpell', alternative: 'flashback' });
  });

  test(
    'a flashback spell with a target asks for it afterwards, as a click does',
    SLOW,
    async () => {
      const { store } = await reach(reachKickerStore, flashbackOf('SYNTHETIC Flash Slay'));
      const card = flashbackCards(viewOf(store)).find((c) => c.name === 'SYNTHETIC Flash Slay');
      if (card === undefined) throw new Error('no card');
      expect(await drop(store, card.id, 'card', { kind: 'battlefield' })).toBe('act');
      expect(pendingOf(store).kind).toBe('targets');
    },
  );

  test('undo takes the flashback cast back like a click does', SLOW, async () => {
    const { store } = await reach(reachKickerStore, flashbackOf('SYNTHETIC Flash Gain'));
    store.getState().setSettings({ fullControl: true });
    const view = viewOf(store);
    const card = flashbackCards(view).find((c) => c.name === 'SYNTHETIC Flash Gain');
    if (card === undefined) throw new Error('no card');
    await drop(store, card.id, 'card', { kind: 'battlefield' });
    expect(store.getState().snapshot?.undoDepth).toBeGreaterThan(0);
    for (let i = 0; i < 4 && viewOf(store).stack.length > 0; i += 1) await store.getState().undo();
    const back = viewOf(store);
    expect(back.stack).toHaveLength(0);
    expect(flashbackCards(back).some((c) => c.id === card.id)).toBe(true);
  });
});
