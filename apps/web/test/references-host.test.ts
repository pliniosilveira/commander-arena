/**
 * The questions of the D-092 references slice through the game host with the hidden SYNTHETIC deck
 * `synthetic-references`: "counter target spell unless its controller pays" asked of the human
 * (CR 701.6, Ward's path), "its controller may search" asked of the human during the opponent's
 * spell (CR 608.2d, 701.23), and a bounce land's choice of a land to return (CR 608.2d). The words
 * of each dialog and log line, what each answer does and what Undo does. Seeds are searched, not
 * fixed.
 */

import { describe, expect, test, vi } from 'vitest';
import type { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi } from '../src/ui/decisions/ui-state';
import { pressButton } from './mana-decks';
import {
  bounceAsk,
  counterAsk,
  type Session,
  searchAsk,
  searchRefs,
  startHost,
} from './references-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 60_000 });

type Reached = { session: Session & { host: GameHost }; seed: number };

async function reach(
  accept: Parameters<typeof searchRefs>[1],
  opts: Parameters<typeof searchRefs>[2] = {},
): Promise<Reached> {
  const reached = await searchRefs(startHost, accept, opts);
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

const texts = (session: Session) => session.log().map((l) => l.text);

/** The question of the soft counter, with the human holding 5 mana before the creature. */
const askCounter = () =>
  reach((view) => counterAsk(view) && view.stack.some((o) => o.name === 'SYNTHETIC Soft Counter'), {
    creatureMana: 5,
  });

describe('counter target spell unless its controller pays', () => {
  test('the question names both spells, Pay is primary and there is no Cancel', async () => {
    const { session } = await askCounter();
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('wrong decision');
    expect(asked.purpose).toBe('counterUnlessPays');
    const spell = snap.view.stack.find((o) => o.id === asked.subject);
    if (spell === undefined) throw new Error('the countered spell is not on the stack');
    const { model } = modelOf(snap);
    expect(model.bar.prompt).toBe(`Pay {3} or ${spell.name} is countered by ${asked.sourceName}?`);
    expect(asked.sourceName).toBe('SYNTHETIC Soft Counter');
    expect(model.bar.buttons.map((b) => [b.label, b.variant])).toEqual([
      ['Pay', 'primary'],
      ["Don't pay", 'secondary'],
    ]);
    expect(model.bar.cancel).toBeNull();
    expect(model.bar.inOverlay).toBe(true);
    expect(pressButton(snap.view, 'Pay')).toEqual({ kind: 'acceptOptional' });
    expect(pressButton(snap.view, "Don't pay")).toEqual({ kind: 'declineOptional' });
  });

  test('declining counters the spell: one line says so and the stack loses it', async () => {
    const { session } = await askCounter();
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('wrong decision');
    const name = snap.view.stack.find((o) => o.id === asked.subject)?.name ?? '';
    const next = await session.act(pressButton(snap.view, "Don't pay"));
    if (next === null) throw new Error('refused');
    expect(next.log.map((l) => l.text)).toContain(`You don't pay; ${name} is countered.`);
    expect(next.log.filter((l) => l.text.includes('is countered'))).toHaveLength(1);
    expect(next.view.stack.some((o) => o.name === name)).toBe(false);
    expect(next.undoDepth).toBe(0);
  });

  test('accepting logs the payment and asks for the mana, naming the counterspell', async () => {
    const { session } = await askCounter();
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('wrong decision');
    const name = snap.view.stack.find((o) => o.id === asked.subject)?.name ?? '';
    const next = await session.act({ kind: 'acceptOptional' });
    if (next === null) throw new Error('refused');
    const pay = next.view.pending;
    if (pay?.kind !== 'payMana') throw new Error(`no payment asked: ${pay?.kind}`);
    expect(pay.purpose).toBe('counterUnlessPays');
    expect(next.log.map((l) => l.text)).toEqual([`You pay {3} so ${name} is not countered.`]);
    const { model } = modelOf(next);
    expect(model.bar.prompt).toBe(
      `Pay {3} for ${asked.sourceName} or ${name} is countered: tap your mana sources.`,
    );
    expect(model.bar.cancel?.label).toBe("Don't pay (it is countered)");
    // Auto-pay: the spell survives, and nothing can be undone.
    const paid = await session.act(pressButton(next.view, 'Auto-pay'));
    if (paid === null) throw new Error('refused');
    expect(paid.log.some((l) => l.text.includes('is countered'))).toBe(false);
    expect(paid.undoDepth).toBe(0);
    expect((await session.host.undo()).error).toBe('Nothing to undo.');
  });

  test('a life cost is paid at the question: "Pay 2 life or X is countered by Toll Counter?"', async () => {
    const { session } = await reach(
      (view) => counterAsk(view) && view.stack.some((o) => o.name === 'SYNTHETIC Toll Counter'),
      { creatureMana: 5 },
    );
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('wrong decision');
    const name = snap.view.stack.find((o) => o.id === asked.subject)?.name ?? '';
    expect(modelOf(snap).model.bar.prompt).toBe(
      `Pay 2 life or ${name} is countered by SYNTHETIC Toll Counter?`,
    );
    const life = snap.view.seats[snap.view.viewer]?.life ?? 0;
    const next = await session.act({ kind: 'acceptOptional' });
    if (next === null) throw new Error('refused');
    expect(next.log.map((l) => l.text)).toContain(`You pay 2 life so ${name} is not countered.`);
    expect(next.view.seats[next.view.viewer]?.life).toBe(life - 2);
  });

  test('Cancel at the payment means "do not pay": countered, one line, Undo empty', async () => {
    const { session } = await askCounter();
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('wrong decision');
    const name = snap.view.stack.find((o) => o.id === asked.subject)?.name ?? '';
    const next = await session.act({ kind: 'acceptOptional' });
    expect(next?.view.pending?.kind).toBe('payMana');
    const cancelled = await session.act({ kind: 'cancel' });
    if (cancelled === null) throw new Error('refused');
    expect(cancelled.log.map((l) => l.text)).toContain(`You don't pay; ${name} is countered.`);
    expect(cancelled.view.stack.some((o) => o.name === name)).toBe(false);
    expect(cancelled.undoDepth).toBe(0);
  });
});

describe('"its controller may search", asked of the human', () => {
  test("the dialog says whose spell it is, Search is primary and the answer is the human's", async () => {
    const { session } = await reach(searchAsk);
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('wrong decision');
    expect(asked.purpose).toBe('search');
    expect(asked.seat).toBe(snap.view.viewer);
    const { model } = modelOf(snap);
    expect(model.bar.prompt).toBe(
      `${asked.sourceName} (the opponent's spell) lets you search your library. Search?`,
    );
    expect(model.bar.buttons.map((b) => [b.label, b.variant])).toEqual([
      ['Search', 'primary'],
      ["Don't search", 'secondary'],
    ]);
    expect(model.bar.cancel).toBeNull();
    expect(model.bar.inOverlay).toBe(true);
    expect(pressButton(snap.view, 'Search')).toEqual({ kind: 'acceptOptional' });
    expect(pressButton(snap.view, "Don't search")).toEqual({ kind: 'declineOptional' });
  });

  test('declining logs it and skips the search and the shuffle', async () => {
    const { session } = await reach(searchAsk);
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('wrong decision');
    const next = await session.act(pressButton(snap.view, "Don't search"));
    if (next === null) throw new Error('refused');
    const lines = next.log.map((l) => l.text);
    expect(lines).toContain(`You decline to search your library (${asked.sourceName}).`);
    expect(lines.some((t) => t.includes('search your library and find'))).toBe(false);
    expect(lines.some((t) => t.includes('library is shuffled'))).toBe(false);
    expect(next.undoDepth).toBe(0);
  });

  test('accepting logs the choice, then asks for the land card and finds it', async () => {
    const { session } = await reach(searchAsk);
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'confirmOptional') throw new Error('wrong decision');
    const next = await session.act(pressButton(snap.view, 'Search'));
    if (next === null) throw new Error('refused');
    expect(next.log.map((l) => l.text)).toContain(
      `You choose to search your library (${asked.sourceName}).`,
    );
    const pick = next.view.pending;
    if (pick?.kind !== 'chooseCards') throw new Error(`expected a search, got ${pick?.kind}`);
    expect(pick.purpose).toBe('search');
    const found = await session.act({ kind: 'chooseCards', objects: pick.legal.slice(0, 1) });
    if (found === null) throw new Error('refused');
    expect(found.log.map((l) => l.text)).toContain('You search your library and find 1 card.');
  });
});

describe("a bounce land's choice", () => {
  const askBounce = () => reach(bounceAsk, { bounce: true });

  test('the prompt names the land you return; the panel badge is "Chosen"', async () => {
    const { session } = await askBounce();
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'choosePermanent') throw new Error('wrong decision');
    expect(asked.purpose).toBe('effect');
    const { model } = modelOf(snap);
    expect(model.bar.prompt).toBe("Choose a land you control to return to its owner's hand.");
    expect(model.bar.cancel).toBeNull();
    expect([...model.interaction.clickable].sort()).toEqual([...asked.legal].sort());
  });

  test('choosing a land returns it to the hand and logs the choice', async () => {
    const { session } = await askBounce();
    const snap = session.snapshot();
    const asked = snap.view.pending;
    if (asked?.kind !== 'choosePermanent') throw new Error('wrong decision');
    const [land] = asked.legal;
    const name = snap.view.battlefield.find((o) => o.id === land)?.name ?? '';
    const next = await session.act({
      kind: 'choosePermanents',
      objects: land === undefined ? [] : [land],
    });
    if (next === null) throw new Error('refused');
    const lines = next.log.map((l) => l.text);
    expect(lines).toContain(`You choose ${name} for SYNTHETIC Bounce Land's ability.`);
    expect(lines).toContain(`${name} goes to a hand.`);
    expect(next.undoDepth).toBe(0);
    expect(texts(session).filter((t) => t.includes('sacrifice'))).toEqual([]);
  });
});
