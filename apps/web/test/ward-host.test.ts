/**
 * Ward (CR 702.21a), the legend rule (CR 704.5j) and the `becameTarget` log line through the game
 * host with the hidden SYNTHETIC deck `synthetic-ward`: the questions with their exact wording, the
 * log lines, what each answer does and what Undo does. Seeds are searched, not fixed.
 */
import type { GameState } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import { describeEvent } from '../src/game/describe';
import type { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi } from '../src/ui/decisions/ui-state';
import { pressButton } from './mana-decks';
import {
  canStrike,
  canTwin,
  legendAsk,
  type Session,
  searchWard,
  startHost,
  strikeWarded,
  twinKnight,
  wardAsk,
} from './ward-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 30_000 });

type Reached = { session: Session & { host: GameHost }; seed: number };

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);

async function reach(accept: Parameters<typeof searchWard>[1]): Promise<Reached> {
  const reached = await searchWard(startHost(), accept);
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached as Reached;
}

/** The model of the pending decision, with the actions its buttons send recorded. */
function modelOf(snap: Snapshot) {
  const pending = snap.view.pending;
  if (pending === null) throw new Error('nothing pending');
  const acts: unknown[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  return { model: buildModel(snap.view, pending, initialUi(pending), ctl), acts };
}

/** Everything the human did to reach a ward question for `spell` at `creature`. */
async function askWard(spell: string, creature: string, spare: number) {
  const reached = await reach((view) => canStrike(view, spell, creature, spare));
  const snap = await strikeWarded(reached.session, spell, creature);
  if (!wardAsk(snap.view)) throw new Error(`no ward question: ${snap.view.pending?.kind}`);
  return { ...reached, snap };
}

describe('the ward question', () => {
  test("a mana ward: the prompt names the spell, Pay is primary, Don't pay is the other, no Cancel", async () => {
    const { snap } = await askWard('Lightning Bolt', 'SYNTHETIC Warded Guard', 1);
    const { model } = modelOf(snap);
    expect(model.bar.prompt).toBe('Pay {1} or Lightning Bolt is countered?');
    expect(model.bar.buttons.map((b) => [b.label, b.variant])).toEqual([
      ['Pay', 'primary'],
      ["Don't pay", 'secondary'],
    ]);
    expect(model.bar.cancel).toBeNull();
    expect(model.bar.inOverlay).toBe(true);
    expect(pressButton(snap.view, 'Pay')).toEqual({ kind: 'acceptOptional' });
    expect(pressButton(snap.view, "Don't pay")).toEqual({ kind: 'declineOptional' });
    // The engine refuses cancel: the question is not part of a cast.
    const pending = snap.view.pending;
    expect(pending?.kind === 'confirmOptional' && pending.purpose).toBe('ward');
  });

  test('the spell is named from the stack: Murder against a ward of {2}', async () => {
    const { snap } = await askWard('Murder', 'SYNTHETIC Warded Sentinel', 2);
    expect(modelOf(snap).model.bar.prompt).toBe('Pay {2} or Murder is countered?');
  });

  test('a life ward reads "Pay 2 life or ..." and accepting pays the life and asks nothing more', async () => {
    const { session, snap } = await askWard('Lightning Bolt', 'SYNTHETIC Blood Warded Guard', 0);
    expect(modelOf(snap).model.bar.prompt).toBe('Pay 2 life or Lightning Bolt is countered?');
    const life = snap.view.seats[snap.view.viewer]?.life ?? 0;
    const next = await session.act({ kind: 'acceptOptional' });
    expect(next).not.toBeNull();
    expect(texts(next as Snapshot)).toContain('You pay 2 life for ward.');
    expect(next?.view.pending?.kind).toBe('priority');
    expect(next?.view.seats[next.view.viewer]?.life).toBe(life - 2);
    expect(next?.view.stack.some((o) => o.name === 'Lightning Bolt')).toBe(true);
  });

  test('declining counters the spell: one line says so, and the stack loses it', async () => {
    const { session, snap } = await askWard('Lightning Bolt', 'SYNTHETIC Warded Guard', 1);
    const next = await session.act(pressButton(snap.view, "Don't pay"));
    if (next === null) throw new Error('refused');
    expect(texts(next)).toContain("You don't pay; Lightning Bolt is countered.");
    // The answer's line already says it: the `countered` event is not worded a second time.
    expect(texts(next).filter((t) => t.includes('is countered'))).toHaveLength(1);
    expect(next.view.stack.some((o) => o.name === 'Lightning Bolt')).toBe(false);
    expect(next.view.pending?.kind).toBe('priority');
  });

  test('every answer clears Undo: the pass that began the resolution closed the window', async () => {
    const { session, snap } = await askWard('Lightning Bolt', 'SYNTHETIC Warded Guard', 1);
    const { host } = session;
    expect(snap.undoDepth).toBe(0);
    const accepted = await session.act({ kind: 'acceptOptional' });
    expect(accepted?.undoDepth).toBe(0);
    const undone = await host.undo();
    expect(undone.error).toBe('Nothing to undo.');
  });
});

describe('the ward payment', () => {
  async function pay() {
    const asked = await askWard('Lightning Bolt', 'SYNTHETIC Warded Guard', 1);
    const next = await asked.session.act({ kind: 'acceptOptional' });
    if (next?.view.pending?.kind !== 'payMana') throw new Error('no payment asked');
    return { ...asked, snap: next };
  }

  test('accepting logs the payment and asks for the mana with its own wording and Cancel', async () => {
    const { snap } = await pay();
    expect(texts(snap)).toEqual(['You pay {1} for ward.']);
    const { model } = modelOf(snap);
    expect(model.bar.prompt).toBe(
      'Pay {1} for ward or Lightning Bolt is countered: tap your mana sources.',
    );
    expect(model.bar.cancel?.label).toBe("Don't pay (it is countered)");
    expect(model.bar.buttons.map((b) => b.label)).toEqual(['Pay', 'Auto-pay']);
  });

  test('Auto-pay keeps the spell on the stack, taps the mana and is not undoable', async () => {
    const { session, snap } = await pay();
    const { host } = session;
    const lands = snap.view.battlefield.filter((o) => o.tapped !== true).length;
    const paid = await session.act(pressButton(snap.view, 'Auto-pay'));
    if (paid === null) throw new Error('refused');
    expect(paid.view.stack.some((o) => o.name === 'Lightning Bolt')).toBe(true);
    expect(paid.view.battlefield.filter((o) => o.tapped !== true).length).toBeLessThan(lands);
    expect(texts(paid).some((t) => t.includes('is countered'))).toBe(false);
    expect(paid.undoDepth).toBe(0);
    expect((await host.undo()).error).toBe('Nothing to undo.');
  });

  test('Cancel means "do not pay": the spell is countered, the log says why and Undo stays empty', async () => {
    const { session, snap } = await pay();
    const cancel = modelOf(snap).model.bar.cancel;
    expect(cancel).not.toBeNull();
    const next = await session.act({ kind: 'cancel' });
    if (next === null) throw new Error('refused');
    expect(texts(next)).toContain("You don't pay; Lightning Bolt is countered.");
    expect(next.view.stack.some((o) => o.name === 'Lightning Bolt')).toBe(false);
    expect(next.undoDepth).toBe(0);
  });
});

describe('the targeting line', () => {
  test('becameTarget is a minor line before the cast: "You target X with Y."', async () => {
    const reached = await reach((view) =>
      canStrike(view, 'Lightning Bolt', 'SYNTHETIC Warded Guard', 1),
    );
    await strikeWarded(reached.session, 'Lightning Bolt', 'SYNTHETIC Warded Guard');
    const log = reached.session.log();
    const target = log.find(
      (l) => l.text === 'You target SYNTHETIC Warded Guard with Lightning Bolt.',
    );
    if (target === undefined) throw new Error('no targeting line');
    expect(target.level).toBe('detail');
    const cast = log.findIndex((l) => l.text === 'You cast Lightning Bolt.');
    expect(cast).toBeGreaterThan(-1);
    expect(log.indexOf(target)).toBeLessThan(cast);
    // The ward trigger is named after the creature it belongs to.
    expect(log.some((l) => l.text === 'SYNTHETIC Warded Guard triggers.')).toBe(true);
  });
});

describe('the legend rule', () => {
  async function twin() {
    const reached = await reach(canTwin);
    const snap = await twinKnight(reached.session);
    if (!legendAsk(snap.view)) throw new Error(`no legend rule: ${snap.view.pending?.kind}`);
    return { ...reached, snap };
  }

  test('the prompt counts the copies and names them; there is no Cancel', async () => {
    const { snap } = await twin();
    const { model } = modelOf(snap);
    expect(model.bar.prompt).toBe(
      'You control 2 legendary permanents named SYNTHETIC Ancient Knight. Choose one to keep; the others go to the graveyard.',
    );
    expect(model.bar.cancel).toBeNull();
    expect(model.bar.buttons[0]?.label).toBe('Confirm');
    expect(model.bar.buttons[0]?.disabled).toBe(true);
  });

  test('choosing one keeps it ("Keep" badge), logs the rule and the other one dies', async () => {
    const { session, snap } = await twin();
    const pending = snap.view.pending;
    if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
    const [first, second] = pending.legal;
    if (first === undefined || second === undefined) throw new Error('need two legal permanents');
    const life = snap.view.seats[snap.view.viewer]?.life ?? 0;
    const acts: unknown[] = [];
    let ui = initialUi(pending);
    const ctl: Controller = {
      act: (a) => acts.push(a),
      update: (change) => {
        ui = change(ui);
      },
      openChooser: () => {},
    };
    buildModel(snap.view, pending, ui, ctl).interaction.onObject(second);
    const chosen = buildModel(snap.view, pending, ui, ctl);
    expect(chosen.interaction.badge(second)).toBe('Keep');
    expect(chosen.interaction.badge(first)).toBeNull();
    chosen.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'choosePermanents', objects: [second] }]);

    const next = await session.act({ kind: 'choosePermanents', objects: [second] });
    if (next === null) throw new Error('refused');
    const lines = texts(next);
    expect(lines).toContain('You keep SYNTHETIC Ancient Knight (legend rule).');
    expect(lines).toContain('SYNTHETIC Ancient Knight dies.');
    expect(lines).toContain('SYNTHETIC Ancient Knight triggers.');
    const mine = (o: { name: string; controller: number }) =>
      o.name === 'SYNTHETIC Ancient Knight' && o.controller === next.view.viewer;
    expect(next.view.battlefield.filter(mine)).toHaveLength(1);
    // The dies trigger gains 2 life for the controller once it resolves.
    expect(next.view.seats[next.view.viewer]?.life).toBeGreaterThanOrEqual(life);
    expect(next.undoDepth).toBe(0);
  });

  test('the answer clears Undo', async () => {
    const { session, snap } = await twin();
    const { host } = session;
    const pending = snap.view.pending;
    if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
    const next = await session.act({
      kind: 'choosePermanents',
      objects: pending.legal.slice(0, 1),
    });
    expect(next?.undoDepth).toBe(0);
    expect((await host.undo()).error).toBe('Nothing to undo.');
  });
});

describe('log wording of the new events', () => {
  const state = (pending: unknown = null) =>
    ({
      objects: {
        o1: { card: 'c1', token: null, stack: null, controller: 0 },
        o2: { card: 'c2', token: null, stack: null, controller: 1 },
      },
      cards: { c1: { definition: 'd1' }, c2: { definition: 'd2' } },
      definitions: { d1: { name: 'Bolt' }, d2: { name: 'Guard' } },
      lki: {},
      pending,
    }) as unknown as GameState;
  const line = (event: object, seat: number, pending: unknown = null) =>
    describeEvent(event as never, state(pending), state(), seat);

  test('becameTarget: you and the opponent, as a minor line', () => {
    const you = line({ kind: 'becameTarget', object: 'o2', by: 'o1', seat: 0 }, 0);
    expect(you?.text).toBe('You target Guard with Bolt.');
    expect(you?.level).toBe('detail');
    expect(line({ kind: 'becameTarget', object: 'o1', by: 'o2', seat: 1 }, 0)?.text).toBe(
      'Opponent targets Bolt with Guard.',
    );
  });

  test('legendRule: you keep, the opponent keeps', () => {
    const keep = (seat: number) =>
      line({ kind: 'legendRule', seat, name: 'Ancient Knight', kept: 'o1' }, 0);
    expect(keep(0)?.text).toBe('You keep Ancient Knight (legend rule).');
    expect(keep(1)?.text).toBe('Opponent keeps Ancient Knight (legend rule).');
    expect(keep(0)?.level).toBe('major');
  });

  test('the ward answer, worded from the pending question; the opponent form too', () => {
    const asked = (cost: unknown[]) => ({
      kind: 'confirmOptional',
      seat: 1,
      source: 'o2',
      purpose: 'ward',
      subject: 'o1',
      cost,
    });
    const answer = (accepted: boolean, seat: number, cost: unknown[]) =>
      line({ kind: 'optionalAnswered', seat, source: 'o2', accepted }, 0, asked(cost))?.text;
    expect(answer(true, 0, [{ kind: 'mana', symbols: ['2'] }])).toBe('You pay {2} for ward.');
    expect(answer(true, 1, [{ kind: 'payLife', amount: 3 }])).toBe(
      'Opponent pays 3 life for ward.',
    );
    expect(answer(false, 0, [{ kind: 'mana', symbols: ['2'] }])).toBe(
      "You don't pay; Bolt is countered.",
    );
    expect(answer(false, 1, [{ kind: 'mana', symbols: ['2'] }])).toBe(
      "Opponent doesn't pay; Bolt is countered.",
    );
  });

  test('a counter that nobody was asked about reads as before', () => {
    expect(line({ kind: 'countered', object: 'o1' }, 0)?.text).toBe('Bolt is countered.');
  });
});
