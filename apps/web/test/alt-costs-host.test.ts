/**
 * Overload, Evoke and Dash (D-121) through the game host with the hidden SYNTHETIC decks
 * (game/precons.ts): the cast buttons and their labels, the log line, the badges on the spell and
 * on the permanent, the words of the evoke and dash triggers on the stack (the dash return has
 * `abilityIndex` -1), and undo and the command zone with a commander that was dashed.
 */
import type { GameView } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import { alternativeBadge } from '../src/game/alt-cost';
import type { Snapshot } from '../src/game/protocol';
import { triggerCondition, triggerGist } from '../src/ui/decisions/ability-label';
import { alternativeLabel } from '../src/ui/decisions/alt-cost';
import { objectIndex } from '../src/ui/decisions/lookup';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { clickOutcome } from '../src/ui/decisions/priority';
import { initialUi } from '../src/ui/decisions/ui-state';
import { castOptionsOf, myCard, myLands, priority, reach } from './alt-costs-decks';
import { chooseAction } from './bot';
import { must, myCreatures } from './costs-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 60_000 });

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);

/** The menu a click on the card opens: [key, label] for each item. */
function menuOf(view: GameView, name: string) {
  const decision = priority(view);
  const card = myCard(view, name);
  if (decision === null || card === undefined) throw new Error('not castable');
  const outcome = clickOutcome(decision, card.id, objectIndex(view));
  if (outcome.kind !== 'menu') throw new Error(`expected a menu, got ${outcome.kind}`);
  return outcome.items;
}

/**
 * Answers what the cast asks next (targets, then Auto-pay) until the player has priority again, and
 * returns a snapshot whose log holds every line of the cast.
 */
async function pay(session: Awaited<ReturnType<typeof reach>>['session']): Promise<Snapshot> {
  let snap = session.snapshot();
  const log = [...snap.log];
  for (
    let asks = 0;
    asks < 6 && snap.view.pending !== null && snap.view.pending.kind !== 'priority';
    asks += 1
  ) {
    snap = await must(session, chooseAction(snap.view, snap.view.pending));
    log.push(...snap.log);
  }
  return { ...snap, log };
}

describe('Overload', () => {
  const NAME = 'SYNTHETIC Overload Bolt';
  const ready = (view: GameView) => castOptionsOf(view, NAME).length === 2 && myLands(view) >= 5;

  test('one button per way to cast, with the cost; the spell on the stack says "overloaded"', async () => {
    const { session } = await reach('synthetic-overload', ready);
    const view = session.snapshot().view;
    const items = menuOf(view, NAME);
    expect(items.map((i) => [i.key, i.label])).toEqual([
      ['cast', `Cast ${NAME}`],
      ['cast-overload', 'Overload {3}{R}{R}'],
    ]);
    const overload = items[1];
    if (overload === undefined) throw new Error('no overload item');
    expect(overload.action).toMatchObject({ kind: 'castSpell', alternative: 'overload' });

    await must(session, overload.action);
    const snap = await pay(session);
    expect(texts(snap)).toContain(`You cast ${NAME} for its overload cost.`);
    const spell = snap.view.stack.find((o) => o.name === NAME);
    expect(spell?.alternative).toBe('overload');
    expect(alternativeBadge(spell ?? ({} as never))?.text).toBe('overloaded');
  });

  test('the plain cast keeps "Cast X" and no badge', async () => {
    const { session } = await reach('synthetic-overload', ready);
    const plain = menuOf(session.snapshot().view, NAME)[0];
    if (plain === undefined) throw new Error('no item');
    await must(session, plain.action);
    const snap = await pay(session);
    expect(texts(snap)).toContain(`You cast ${NAME}.`);
    expect(snap.view.stack.find((o) => o.name === NAME)?.alternative).toBeUndefined();
  });
});

describe('Evoke', () => {
  const NAME = 'SYNTHETIC Evoke Martyr';
  // One Plains is not enough for the ordinary cast ({2}{W}) but pays Evoke {W}: the only option.
  const ready = (view: GameView) =>
    castOptionsOf(view, NAME).length === 1 && myLands(view) <= 2 && myLands(view) >= 1;

  test('an alternative that is the only option is asked about, not cast by the click', async () => {
    const { session } = await reach('synthetic-evoke', ready);
    const items = menuOf(session.snapshot().view, NAME);
    expect(items.map((i) => [i.key, i.label])).toEqual([['cast-evoke', 'Evoke {W}']]);
  });

  test('the evoke trigger is worded on the stack, the permanent is badged and then sacrificed', async () => {
    const { session } = await reach('synthetic-evoke', ready);
    const item = menuOf(session.snapshot().view, NAME)[0];
    if (item === undefined) throw new Error('no item');
    await must(session, item.action);
    let snap = await pay(session);
    expect(texts(snap)).toContain(`You cast ${NAME} for its evoke cost.`);
    expect(alternativeBadge(snap.view.stack[0] ?? ({} as never))?.text).toBe('evoked');

    // Both players pass: the spell resolves, the creature enters and the sacrifice goes on the stack.
    snap = await must(session, { kind: 'pass' });
    const permanent = snap.view.battlefield.find((o) => o.name === NAME);
    expect(permanent?.alternative).toBe('evoke');
    expect(alternativeBadge(permanent ?? ({} as never))).toMatchObject({
      text: 'evoked',
      title: 'Evoked: sacrificed when it enters.',
    });
    const trigger = snap.view.stack[snap.view.stack.length - 1];
    if (trigger?.ability === undefined) throw new Error('no trigger on the stack');
    const index = objectIndex(snap.view);
    const source =
      trigger.abilitySource === undefined ? undefined : index.get(trigger.abilitySource);
    expect(triggerCondition(trigger.ability, trigger.name, source)).toBe(`Whenever ${NAME} enters`);
    expect(triggerGist(trigger.ability, source)).toBe('Sacrifice this creature');
    expect(texts(snap)).toContain(`${NAME} triggers.`);

    snap = await must(session, { kind: 'pass' });
    expect(snap.view.battlefield.some((o) => o.name === NAME)).toBe(false);
    // The sacrifice made its dies ability trigger (CR 700.4): it gains 3 life when it resolves.
    expect(texts(snap)).toContain(`${NAME} dies.`);
    snap = await must(session, { kind: 'pass' });
    expect(texts(snap).join('\n')).toContain('Your life: 40 to 43.');
  });
});

describe('Dash', () => {
  const NAME = 'SYNTHETIC Dash Raider';
  // Two lands pay Dash {1}{R} but not the ordinary {2}{R}{R}.
  const ready = (view: GameView) =>
    castOptionsOf(view, NAME).length === 1 && myLands(view) >= 2 && myLands(view) <= 3;

  async function dash() {
    const reached = await reach('synthetic-dash', ready);
    const item = menuOf(reached.session.snapshot().view, NAME)[0];
    if (item === undefined) throw new Error('no item');
    return { ...reached, item };
  }

  test('the button reads "Dash {1}{R}"; the log, the stack and the permanent say it', async () => {
    const { session, item } = await dash();
    expect(item.label).toBe('Dash {1}{R}');
    await must(session, item.action);
    let snap = await pay(session);
    expect(texts(snap)).toContain(`You cast ${NAME} for its dash cost.`);
    expect(alternativeBadge(snap.view.stack[0] ?? ({} as never))?.text).toBe('dashed');
    snap = await must(session, { kind: 'pass' });
    const permanent = snap.view.battlefield.find((o) => o.name === NAME);
    expect(permanent?.alternative).toBe('dash');
    expect(alternativeBadge(permanent ?? ({} as never))?.fact).toBe(
      'Dashed: returns to its owner’s hand at the next end step',
    );
  });

  test('the return at the end step is worded (abilityIndex -1) and the creature is back in the hand', async () => {
    const { session, item } = await dash();
    await must(session, item.action);
    await pay(session);
    let snap = await must(session, { kind: 'pass' });
    const inHand = (view: GameView) =>
      (view.seats[view.viewer]?.hand ?? []).filter((c) => c.name === NAME).length;
    const before = inHand(snap.view);
    let words: { when: string | null; gist: string } | null = null;
    const indexes: number[] = [];
    for (let clicks = 0; clicks < 60 && words === null; clicks += 1) {
      for (const step of snap.steps) {
        for (const event of step.events) {
          if (event.kind === 'abilityTriggered') indexes.push(event.abilityIndex);
        }
      }
      const top = snap.view.stack[snap.view.stack.length - 1];
      if (top?.ability?.kind === 'triggered') {
        const index = objectIndex(snap.view);
        const source = top.abilitySource === undefined ? undefined : index.get(top.abilitySource);
        words = {
          when: triggerCondition(top.ability, top.name, source),
          gist: triggerGist(top.ability, source),
        };
        break;
      }
      const pending = snap.view.pending;
      if (pending === null) break;
      snap = await must(
        session,
        pending.kind === 'priority' ? { kind: 'pass' } : chooseAction(snap.view, pending),
      );
    }
    expect(words).toEqual({
      when: 'At the beginning of each end step',
      gist: "Return this creature to its owner's hand",
    });
    // The trigger that put it on the stack is the engine's first delayed trigger: no printed ability.
    expect(indexes).toContain(-1);
    expect(texts(snap).join('\n')).toContain(`${NAME} triggers.`);
    snap = await must(session, { kind: 'pass' });
    expect(snap.view.battlefield.some((o) => o.name === NAME)).toBe(false);
    expect(inHand(snap.view)).toBe(before + 1);
    expect(myCreatures(snap.view).some((o) => o.name === NAME)).toBe(false);
  });
});

describe('a commander that was dashed', () => {
  const NAME = 'SYNTHETIC Dash Raider';
  const ready = (view: GameView) =>
    castOptionsOf(view, NAME).length === 1 && myLands(view) >= 2 && myLands(view) <= 3;

  test('undo takes the dash cast back; the end step asks about the command zone and the tax shows in the dash cost', async () => {
    const { host, session } = await reach('synthetic-dash-commander', ready);
    const view = session.snapshot().view;
    const item = menuOf(view, NAME)[0];
    if (item === undefined) throw new Error('no item');
    expect(item.label).toBe('Dash {1}{R}');

    await must(session, item.action);
    await pay(session);
    expect(session.snapshot().undoDepth).toBeGreaterThan(0);
    // Undo, step by step, back to the command zone.
    let snap = await host.undo();
    for (let steps = 0; steps < 10 && snap.undoDepth > 0; steps += 1) snap = await host.undo();
    expect(snap.undoDepth).toBe(0);
    expect(snap.error).toBeNull();
    expect(texts(snap).join('\n')).not.toContain('for its dash cost');
    expect(snap.view.stack).toHaveLength(0);
    expect(snap.view.seats[snap.view.viewer]?.command.map((c) => c.name)).toContain(NAME);
    expect((await host.undo()).error).toBe('Nothing to undo.');
  });

  test('after the creature is returned the owner is asked, and the command zone card shows the taxed dash cost', async () => {
    const { session } = await reach('synthetic-dash-commander', ready);
    const item = menuOf(session.snapshot().view, NAME)[0];
    if (item === undefined) throw new Error('no item');
    await must(session, item.action);
    await pay(session);
    let snap = await must(session, { kind: 'pass' });
    for (let clicks = 0; clicks < 80 && snap.view.pending?.kind !== 'commanderZone'; clicks += 1) {
      const pending = snap.view.pending;
      if (pending === null) break;
      snap = await must(
        session,
        pending.kind === 'priority' ? { kind: 'pass' } : chooseAction(snap.view, pending),
      );
    }
    const pending = snap.view.pending;
    if (pending?.kind !== 'commanderZone') throw new Error(`no question: ${pending?.kind}`);
    // The pass that got here cleared the history: there is nothing to undo at the question.
    expect(snap.undoDepth).toBe(0);
    const sent: unknown[] = [];
    const ctl: Controller = { act: (a) => sent.push(a), update: () => {}, openChooser: () => {} };
    const model = buildModel(snap.view, pending, initialUi(pending), ctl);
    expect(model.bar.prompt).toBe(`Move ${NAME} to the command zone?`);
    model.bar.buttons.find((b) => b.label === 'Yes')?.run();
    expect(sent).toEqual([{ kind: 'moveToCommandZone' }]);

    snap = await must(session, { kind: 'moveToCommandZone' });
    const commander = snap.view.seats[snap.view.viewer]?.command.find((c) => c.name === NAME);
    // Commander tax {2} is in the dash cost now (CR 903.8).
    expect(alternativeLabel('dash', commander)).toBe('Dash {3}{R}');
  });
});
