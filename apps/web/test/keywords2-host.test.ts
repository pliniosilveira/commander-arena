/**
 * Keyword batch 2 (D-116, D-120) through the game host with the hidden SYNTHETIC deck `synthetic-keywords-2`:
 * the cost-payment question of Convoke, Improvise and Delve (the decision, the model's bar, the answer, the
 * log line, Cancel rewinding the cast), Extort's and Cascade's questions, a regeneration shield on the view and
 * in the log, and that the autopilot never answers the cost-payment question. Each integration case
 * pins a verified seed and fails instead of searching if its checkpoint moves.
 */
import type { GameView } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import type { Snapshot } from '../src/game/protocol';
import { DEFAULT_STOPS, shouldStop } from '../src/policy/should-stop';
import { chipsOf } from '../src/ui/board/keywords';
import { buildModel } from '../src/ui/decisions/model';
import { initialUi } from '../src/ui/decisions/ui-state';
import { chooseAction } from './bot';
import {
  asksConfirm,
  asksPayOptions,
  payOptionsOf,
  reachKeywords2,
  reachKeywords2Store,
} from './keywords2-decks';
import { pressButton } from './mana-decks';

// The seed search plays whole games: give each test room.
vi.setConfig({ testTimeout: 120_000 });

const CASCADE = ['SYNTHETIC Cascade Giant'];
const texts = (snap: Snapshot) => snap.log.map((l) => l.text);

async function must(
  accept: (view: GameView) => boolean,
  opts: { seed?: number; prefer?: readonly string[]; seeds?: number } = {},
) {
  const reached = await reachKeywords2(accept, opts);
  if (reached === null)
    throw new Error(
      opts.seed === undefined
        ? 'no seed reaches the situation'
        : `seed ${opts.seed} missed the situation`,
    );
  return reached;
}

const model = (view: GameView) => {
  const pending = view.pending;
  if (pending === null) throw new Error('nothing pending');
  return buildModel(view, pending, initialUi(pending), {
    act: () => {},
    update: () => {},
    openChooser: () => {},
  });
};

describe('Convoke', () => {
  test('the question names the spell and its cost, preselects the engine suggestion and its Confirm is enabled', async () => {
    const { snap } = await must(asksPayOptions('convoke', { nonEmpty: true }), { seed: 2 });
    const d = payOptionsOf(snap.view);
    if (d === null) throw new Error('wrong decision');
    const spell = snap.view.stack.find((o) => o.id === d.source);
    expect(d.suggested.length).toBeGreaterThan(0);
    const ui = initialUi(d);
    expect(ui.payOptions).toEqual(d.suggested);
    const m = model(snap.view);
    expect(m.bar.prompt).toBe(
      `Convoke: tap creatures to pay for ${spell?.name} (${d.cost.map((s) => `{${s}}`).join('')})`,
    );
    expect(m.bar.buttons[0]?.disabled).toBe(false);
    expect(m.bar.buttons[0]?.label).toMatch(/^Tap \d creatures?$/);
    expect(m.bar.cancel?.label).toBe('Cancel');
    expect(m.bar.inOverlay).toBe(true);
  });

  test('Confirm taps the creatures, the log says so in one line, and the spell goes on to the payment', async () => {
    const { host, snap } = await must(asksPayOptions('convoke', { nonEmpty: true }), { seed: 2 });
    const d = payOptionsOf(snap.view);
    if (d === null) throw new Error('wrong decision');
    const spell = snap.view.stack.find((o) => o.id === d.source)?.name ?? '';
    const names = d.suggested.map(
      (id) => snap.view.battlefield.find((o) => o.id === id)?.name ?? 'a card',
    );
    // The button of the model, pressed as a click would, sends the engine's suggestion as it stands.
    const action = pressButton(snap.view, model(snap.view).bar.buttons[0]?.label ?? '');
    expect(action).toEqual({ kind: 'choosePayOptions', objects: d.suggested });
    const next = await host.act(action);
    expect(next.error).toBeNull();
    const taps = texts(next).filter((t) => t.includes('to convoke'));
    expect(taps).toHaveLength(1);
    const listed =
      names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    expect(taps[0]).toBe(`You tap ${listed} to convoke ${spell}.`);
    // One line, not one per creature.
    expect(texts(next).filter((t) => / taps\.$/.test(t))).toEqual([]);
    for (const id of d.suggested) {
      expect(next.view.battlefield.find((o) => o.id === id)?.tapped).toBe(true);
    }
    // The question of this mechanism is answered (a spell with another keyword may ask the next).
    expect(payOptionsOf(next.view)?.mechanism).not.toBe('convoke');
  });

  test('Cancel rewinds the cast: the spell is back in the hand and the creatures are untapped', async () => {
    const { host, snap } = await must(asksPayOptions('convoke', { nonEmpty: true }), { seed: 2 });
    const d = payOptionsOf(snap.view);
    if (d === null) throw new Error('wrong decision');
    const spell = snap.view.stack.find((o) => o.id === d.source)?.name ?? '';
    const next = await host.act({ kind: 'cancel' });
    expect(next.error).toBeNull();
    expect(next.view.stack.some((o) => o.name === spell)).toBe(false);
    expect(next.view.seats[next.view.viewer]?.hand?.some((c) => c.name === spell)).toBe(true);
    for (const id of d.suggested) {
      expect(next.view.battlefield.find((o) => o.id === id)?.tapped).toBe(false);
    }
    expect(texts(next).some((t) => t.includes('to convoke'))).toBe(false);
  });

  test('an answer that is not a candidate is refused by the engine and the question stays', async () => {
    const { host, snap } = await must(asksPayOptions('convoke'), { seed: 2 });
    const next = await host.act({ kind: 'choosePayOptions', objects: ['o999999'] });
    expect(next.error).not.toBeNull();
    expect(next.view.pending?.kind).toBe('choosePayOptions');
    expect(next.view.pending?.id).toBe(snap.view.pending?.id);
  });
});

describe('Delve', () => {
  test('the exiled cards are one count in the log and the graveyard is smaller', async () => {
    const { host, snap } = await must(asksPayOptions('delve', { nonEmpty: true }), { seed: 1 });
    const d = payOptionsOf(snap.view);
    if (d === null) throw new Error('wrong decision');
    const spell = snap.view.stack.find((o) => o.id === d.source)?.name ?? '';
    const before = snap.view.seats[snap.view.viewer]?.graveyard.length ?? 0;
    const m = model(snap.view);
    expect(m.bar.prompt).toBe(
      `Delve: exile cards from your graveyard to pay for ${spell} (${d.cost.map((s) => `{${s}}`).join('')})`,
    );
    expect(m.bar.buttons[0]?.label).toMatch(/^Exile \d cards?$/);
    const next = await host.act({ kind: 'choosePayOptions', objects: d.suggested });
    expect(next.error).toBeNull();
    const n = d.suggested.length;
    expect(texts(next)).toContain(`You exile ${n} card${n === 1 ? '' : 's'} to delve ${spell}.`);
    expect(next.view.seats[next.view.viewer]?.graveyard.length).toBe(before - n);
    // Their moves to exile are folded into that line.
    expect(texts(next).filter((t) => t.endsWith('goes to the exile.'))).toEqual([]);
  });
});

describe('Improvise', () => {
  test('the artifacts to tap are listed, and the log says "improvise"', async () => {
    const reached = await reachKeywords2(asksPayOptions('improvise'), {
      prefer: ['SYNTHETIC Trinket', 'SYNTHETIC Resourceful Hulk'],
      seed: 26,
    });
    if (reached === null) throw new Error('no seed reaches the situation');
    const { host, snap } = reached;
    const d = payOptionsOf(snap.view);
    if (d === null) throw new Error('wrong decision');
    const m = model(snap.view);
    expect(m.bar.prompt).toMatch(
      /^Improvise: tap artifacts to pay for SYNTHETIC Resourceful Hulk \(/,
    );
    const next = await host.act({ kind: 'choosePayOptions', objects: d.suggested });
    expect(next.error).toBeNull();
    if (d.suggested.length > 0) {
      expect(
        texts(next).some((t) => /^You tap .+ to improvise SYNTHETIC Resourceful Hulk\.$/.test(t)),
      ).toBe(true);
    }
  });
});

describe('the autopilot', () => {
  test('never answers the cost-payment question: it stays pending and the stop policy says stop', async () => {
    const store = await reachKeywords2Store(asksPayOptions('convoke'), { seed: 2 });
    if (store === null) throw new Error('no seed reaches the situation');
    const view = store.getState().snapshot?.view;
    if (view === undefined) throw new Error('no view');
    expect(shouldStop(view, DEFAULT_STOPS)).toBe(true);
    expect(shouldStop(view, { ...DEFAULT_STOPS, myTurnStops: [], opponentTurnStops: [] })).toBe(
      true,
    );
    await new Promise((done) => setTimeout(done, 50));
    expect(store.getState().passing).toBe(false);
    expect(store.getState().snapshot?.view.pending?.kind).toBe('choosePayOptions');
    expect(store.getState().snapshot?.view.pending?.id).toBe(view.pending?.id);
  });

  test('the scripted human answers it with the engine suggestion', async () => {
    const { snap } = await must(asksPayOptions('convoke'), { seed: 2 });
    const d = payOptionsOf(snap.view);
    if (d === null || snap.view.pending === null) throw new Error('wrong decision');
    expect(chooseAction(snap.view, snap.view.pending)).toEqual({
      kind: 'choosePayOptions',
      objects: d.suggested,
    });
  });
});

describe('Extort', () => {
  test('"Pay {W/B} for extort?", the payment, and what declining and backing out say', async () => {
    const { host, snap } = await must(asksConfirm('mayPay'), { seed: 11 });
    const q = snap.view.pending;
    if (q?.kind !== 'confirmOptional') throw new Error('wrong decision');
    const m = model(snap.view);
    expect(m.bar.prompt).toBe('Pay {W/B} for extort?');
    expect(m.bar.buttons.map((b) => b.label)).toEqual(['Pay', "Don't pay"]);
    expect(m.bar.cancel).toBeNull();

    const accepted = await host.act({ kind: 'acceptOptional' });
    expect(accepted.error).toBeNull();
    expect(texts(accepted)).toContain('You choose to pay {W/B} for extort.');
    const pay = accepted.view.pending;
    if (pay?.kind !== 'payMana') throw new Error('wrong decision');
    expect(pay.purpose).toBe('mayPay');
    const paying = model(accepted.view);
    expect(paying.bar.prompt).toBe('Pay {W/B} for extort: tap your mana sources.');
    expect(paying.bar.cancel?.label).toBe("Don't pay");

    // Backing out of the payment is not paying: nothing is lost, and the log says so.
    const backed = await host.act({ kind: 'cancel' });
    expect(backed.error).toBeNull();
    expect(texts(backed)).toContain("You don't pay {W/B}.");
  });

  test('declining is a line of its own', async () => {
    const { host } = await must(asksConfirm('mayPay'), { seed: 11 });
    const declined = await host.act({ kind: 'declineOptional' });
    expect(declined.error).toBeNull();
    expect(texts(declined)).toContain("You don't pay {W/B} for extort.");
  });
});

describe('Cascade', () => {
  test('the question names the exiled card; accepting casts it and declining puts the cards on the bottom', async () => {
    const { host, snap } = await must(asksConfirm('cascade'), { prefer: CASCADE, seed: 28 });
    const q = snap.view.pending;
    if (q?.kind !== 'confirmOptional' || q.subject === undefined) throw new Error('wrong decision');
    const card = snap.view.exile.find((o) => o.id === q.subject)?.name;
    expect(card).toBeDefined();
    const m = model(snap.view);
    expect(m.bar.prompt).toBe(`Cascade: cast ${card} without paying its mana cost?`);
    expect(m.bar.buttons.map((b) => b.label)).toEqual(['Cast it', "Don't cast it"]);
    expect(m.bar.cancel).toBeNull();

    const declined = await host.act({ kind: 'declineOptional' });
    expect(declined.error).toBeNull();
    expect(texts(declined)).toContain(`You don't cast ${card} (cascade).`);
    // Only a count of the cards put on the bottom reaches the log, never which went where.
    const bottomed = texts(declined).filter((t) => t.includes('on the bottom of your library'));
    expect(bottomed).toHaveLength(1);
    expect(bottomed[0]).toMatch(
      /^You put \d+ cards? on the bottom of your library in a random order\.$/,
    );
  });

  test('accepting casts the card without paying', async () => {
    const { host, snap } = await must(asksConfirm('cascade'), { prefer: CASCADE, seed: 28 });
    const q = snap.view.pending;
    if (q?.kind !== 'confirmOptional' || q.subject === undefined) throw new Error('wrong decision');
    const card = snap.view.exile.find((o) => o.id === q.subject)?.name;
    const accepted = await host.act({ kind: 'acceptOptional' });
    expect(accepted.error).toBeNull();
    expect(texts(accepted)).toContain(`You cast ${card} without paying its mana cost (cascade).`);
  });
});

describe('a regeneration shield', () => {
  test('is in the view of the permanent and shows as a chip', async () => {
    const { snap } = await must(
      (view) => view.battlefield.some((o) => (o.regenerationShields ?? 0) > 0),
      { seed: 3 },
    );
    const shielded = snap.view.battlefield.find((o) => (o.regenerationShields ?? 0) > 0);
    if (shielded === undefined) throw new Error('no shield');
    expect(chipsOf(shielded).map((c) => c.full)).toContain('Regeneration shield');
  });
});
