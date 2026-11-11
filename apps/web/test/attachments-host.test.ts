/**
 * Auras, Equipment and static abilities through the game host with the hidden SYNTHETIC deck
 * `synthetic-attachments` (invented engine fixtures, not real cards): casting an Aura, Equip from
 * the chooser, moving an Equipment, the log lines, and the numbers the tile reads.
 */
import type {
  GameEvent,
  GameState,
  GameView,
  PendingDecision,
  PriorityDecision,
} from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import { describeEvent } from '../src/game/describe';
import type { Snapshot } from '../src/game/protocol';
import { menuItems } from '../src/ui/decisions/abilities';
import { objectIndex } from '../src/ui/decisions/lookup';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { clickOutcome } from '../src/ui/decisions/priority';
import { initialUi } from '../src/ui/decisions/ui-state';
import {
  canActivate,
  canCast,
  castAura,
  equip,
  find,
  mine,
  mustReach,
  myCreatures,
  untappedLands,
} from './attachments-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 30_000 });

const texts = (snaps: readonly Snapshot[]) => snaps.flatMap((s) => s.log.map((l) => l.text));
const ctl: Controller = { act: () => {}, update: () => {}, openChooser: () => {} };

/** The prompt line the action bar shows for this pending decision. */
const promptOf = (view: GameView, pending: PendingDecision) =>
  buildModel(view, pending, initialUi(pending), ctl).bar.prompt;

const afterOf = (snap: Snapshot, id: string) => snap.view.battlefield.find((o) => o.id === id);

describe('casting an Aura', () => {
  const ready = (s: Snapshot) =>
    canCast(s, 'SYNTHETIC Might Aura') && myCreatures(s.view).length > 0;

  test('the targets decision has the enchant slot and the prompt says what to enchant', async () => {
    const { host, snap } = await mustReach(ready);
    const card = find(snap.view, 'SYNTHETIC Might Aura');
    if (card === undefined) throw new Error('no Aura in hand');
    const asked = await host.act({ kind: 'castSpell', object: card.id });
    expect(asked.error).toBeNull();
    const pending = asked.view.pending;
    if (pending?.kind !== 'targets') throw new Error(`expected targets, got ${pending?.kind}`);
    expect(pending.specs.map((s) => s.specId)).toEqual(['enchant']);
    expect(promptOf(asked.view, pending)).toBe('Choose what to enchant.');
  });

  test('an ordinary targeted spell keeps the generic prompt', async () => {
    // Equip's slot is `t1`, not `enchant`: the Aura wording never leaks onto other slots.
    const { host, snap } = await mustReach(
      (s) => canActivate(s, 'SYNTHETIC Blade') && myCreatures(s.view).length > 0,
    );
    const asked = await host.act(activateOption(snap, 'SYNTHETIC Blade'));
    const pending = asked.view.pending;
    if (pending?.kind !== 'targets') throw new Error('expected targets');
    expect(pending.specs.map((s) => s.specId)).toEqual(['t1']);
    expect(promptOf(asked.view, pending)).not.toContain('enchant');
  });

  test('on resolution the Aura is attached: the host is bigger and the log says who attached it', async () => {
    const { host, snap } = await mustReach(ready);
    const creature = myCreatures(snap.view)[0];
    if (creature === undefined) throw new Error('no creature');
    const before = {
      power: creature.power ?? 0,
      toughness: creature.toughness ?? 0,
      standing: creature.attachments?.length ?? 0,
    };
    const { steps, last } = await castAura(host, snap, 'SYNTHETIC Might Aura', creature.id);
    const aura = mine(last.view, 'SYNTHETIC Might Aura').find((o) => o.attachedTo === creature.id);
    expect(aura).toBeDefined();
    const after = afterOf(last, creature.id);
    expect(after?.power).toBe(before.power + 2);
    expect(after?.toughness).toBe(before.toughness + 2);
    expect(after?.attachments).toContain(aura?.id);
    expect(after?.attachments?.length).toBe(before.standing + 1);
    expect(texts(steps)).toContain(`You attach SYNTHETIC Might Aura to ${creature.name}.`);
  });
});

function activateOption(snap: Snapshot, name: string) {
  const p: PriorityDecision | null =
    snap.view.pending?.kind === 'priority' ? snap.view.pending : null;
  const id = mine(snap.view, name)[0]?.id;
  const option = p?.options.find((o) => o.kind === 'activate' && o.object === id);
  if (option?.kind !== 'activate') throw new Error(`cannot activate ${name}`);
  return option;
}

describe('Equip', () => {
  const ready = (s: Snapshot) =>
    canActivate(s, 'SYNTHETIC Blade') && myCreatures(s.view).length > 0;

  test('the chooser lists "Equip {1}" and a click on the Equipment goes straight to it', async () => {
    const { snap } = await mustReach(ready);
    const decision = snap.view.pending;
    if (decision?.kind !== 'priority') throw new Error('not at priority');
    const blade = mine(snap.view, 'SYNTHETIC Blade')[0];
    if (blade === undefined) throw new Error('no Blade');
    const index = objectIndex(snap.view);
    expect(menuItems(decision, blade.id, index).map((m) => m.label)).toEqual(['Equip {1}']);
    // Equip is the Blade's only ability, so there is nothing to choose between.
    expect(clickOutcome(decision, blade.id, index)).toMatchObject({
      kind: 'act',
      action: { kind: 'activate', object: blade.id },
    });
  });

  test('the target prompt is "Choose a creature you control to equip."', async () => {
    const { host, snap } = await mustReach(ready);
    const asked = await host.act(activateOption(snap, 'SYNTHETIC Blade'));
    expect(asked.error).toBeNull();
    const pending = asked.view.pending;
    if (pending?.kind !== 'targets') throw new Error(`expected targets, got ${pending?.kind}`);
    expect(promptOf(asked.view, pending)).toBe('Choose a creature you control to equip.');
    // Only creatures of mine are on offer.
    const legal = pending.specs[0]?.legal.flatMap((t) => (t.kind === 'object' ? [t.id] : [])) ?? [];
    expect(legal.length).toBeGreaterThan(0);
    for (const id of legal) expect(afterOf(asked, id)?.controller).toBe(asked.view.viewer);
  });

  test('the creature gets the bonus and the Equipment is attached to it', async () => {
    const { host, snap } = await mustReach(ready);
    const creature = myCreatures(snap.view)[0];
    if (creature === undefined) throw new Error('no creature');
    const { steps, last } = await equip(host, snap, 'SYNTHETIC Blade', creature.id);
    const blade = mine(last.view, 'SYNTHETIC Blade')[0];
    expect(blade?.attachedTo).toBe(creature.id);
    expect(afterOf(last, creature.id)?.power).toBe((creature.power ?? 0) + 2);
    expect(afterOf(last, creature.id)?.toughness).toBe(creature.toughness);
    expect(texts(steps)).toContain(`You attach SYNTHETIC Blade to ${creature.name}.`);
  });

  test('re-equipping moves it: the log says it moves off, then attaches; both creatures update', async () => {
    const { host, snap } = await mustReach(
      (s) => ready(s) && myCreatures(s.view).length >= 2 && untappedLands(s.view) >= 2,
    );
    const [a, b] = myCreatures(snap.view);
    if (a === undefined || b === undefined) throw new Error('need two creatures');
    const first = await equip(host, snap, 'SYNTHETIC Blade', a.id);
    expect(canActivate(first.last, 'SYNTHETIC Blade')).toBe(true);
    const second = await equip(host, first.last, 'SYNTHETIC Blade', b.id);

    const lines = texts(second.steps);
    const off = lines.indexOf(`SYNTHETIC Blade moves off ${a.name}.`);
    const on = lines.indexOf(`You attach SYNTHETIC Blade to ${b.name}.`);
    expect(off).toBeGreaterThanOrEqual(0);
    expect(on).toBeGreaterThan(off);
    expect(afterOf(second.last, a.id)?.attachments).toBeUndefined();
    expect(afterOf(second.last, a.id)?.power).toBe(a.power);
    expect(afterOf(second.last, b.id)?.power).toBe((b.power ?? 0) + 2);
    expect(mine(second.last.view, 'SYNTHETIC Blade')[0]?.attachedTo).toBe(b.id);
  });
});

describe('static bonuses in the numbers the tile reads', () => {
  // A seed search over whole games: slow when the suite runs in parallel under load, so it gets
  // more than the default 5 s.
  test('an anthem raises the view power and toughness once, and an Aura adds on top of it', {
    timeout: 30_000,
  }, async () => {
    const { host, snap } = await mustReach(
      (s) =>
        mine(s.view, 'SYNTHETIC Anthem').length > 0 &&
        canCast(s, 'SYNTHETIC Might Aura') &&
        myCreatures(s.view).some((o) => o.name === 'Grizzly Bears') &&
        mine(s.view, 'SYNTHETIC Standard Bearer').length === 0,
    );
    const bears = myCreatures(snap.view).find((o) => o.name === 'Grizzly Bears');
    if (bears === undefined) throw new Error('no bears');
    // Printed 2/2, plus the anthem's +1/+1 and nothing else.
    expect([bears.power, bears.toughness]).toEqual([3, 3]);
    const { last } = await castAura(host, snap, 'SYNTHETIC Might Aura', bears.id);
    const after = afterOf(last, bears.id);
    expect([after?.power, after?.toughness]).toEqual([5, 5]);
  });
});

describe('log wording', () => {
  // Names come from the state around the action; an object that is gone keeps its last-known name.
  const state = (objects: Record<string, unknown>, lki: Record<string, unknown> = {}) =>
    ({
      objects,
      cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' } },
      definitions: { d1: { name: 'Blade' }, d2: { name: 'Bear' } },
      lki,
    }) as unknown as GameState;
  const permanent = (card: string, controller: number) => ({
    card,
    token: null,
    stack: null,
    controller,
  });
  const both = state({ o1: permanent('c1', 0), o2: permanent('c2', 1) });
  const line = (event: GameEvent, before = both, after = both) =>
    describeEvent(event, before, after, 0)?.text;

  test('attached: you attach, or the opponent attaches, by who controls the attachment', () => {
    const attached: GameEvent = { kind: 'attached', object: 'o1', to: 'o2' };
    expect(line(attached)).toBe('You attach Blade to Bear.');
    const theirs = state({ o1: permanent('c1', 1), o2: permanent('c2', 1) });
    expect(line(attached, theirs, theirs)).toBe('Opponent attaches Blade to Bear.');
  });

  test('replaced reads "moves off"; left and illegal read "becomes unattached"', () => {
    const unattached = (reason: 'left' | 'illegal' | 'replaced'): GameEvent => ({
      kind: 'unattached',
      object: 'o1',
      from: 'o2',
      reason,
    });
    expect(line(unattached('replaced'))).toBe('Blade moves off Bear.');
    expect(line(unattached('left'))).toBe('Blade becomes unattached.');
    expect(line(unattached('illegal'))).toBe('Blade becomes unattached.');
  });

  test('a host that has left is named from last-known information', () => {
    const gone = state(
      { o1: permanent('c1', 0) },
      { o2: { characteristics: { name: 'Departed Bear' } } },
    );
    const moved: GameEvent = { kind: 'unattached', object: 'o1', from: 'o2', reason: 'replaced' };
    expect(line(moved, gone, gone)).toBe('Blade moves off Departed Bear.');
  });
});
