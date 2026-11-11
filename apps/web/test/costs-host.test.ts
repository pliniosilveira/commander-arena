/**
 * Additional costs, cost reductions and free casts (D-095, D-101) through the game host with the
 * hidden SYNTHETIC deck `synthetic-costs`: the sacrifice and discard questions of a cast with their
 * wording and a Cancel that rewinds the whole cast, the cost a card has now, and the free cast with
 * the commander on the battlefield. Seeds are searched, not fixed.
 */
import type { GameView } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import type { Snapshot } from '../src/game/protocol';
import { castLabel } from '../src/ui/decisions/flashback';
import { objectIndex } from '../src/ui/decisions/lookup';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { clickOutcome } from '../src/ui/decisions/priority';
import { initialUi } from '../src/ui/decisions/ui-state';
import {
  castAndPay,
  castOptions,
  must,
  myCreatures,
  myUntapped,
  onBattlefield,
  PLAIN,
  searchCosts,
  startHost,
  startWardHost,
} from './costs-decks';
import { pressButton } from './mana-decks';
import { castAt, castOption, handOf, passUntilAsked, permanent, searchWard } from './ward-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 60_000 });

/** The first of the ids a question lists; a question with none is a failed test. */
function firstOf<T>(list: readonly T[]): T {
  const first = list[0];
  if (first === undefined) throw new Error('the question lists nothing');
  return first;
}

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);
const hand = (view: GameView) => handOf(view).map((c) => c.name);
const graveyard = (view: GameView) => view.seats[view.viewer]?.graveyard.map((c) => c.name) ?? [];

/** The model of the pending decision, with the actions its buttons send recorded. */
function modelOf(snap: Snapshot) {
  const pending = snap.view.pending;
  if (pending === null) throw new Error('nothing pending');
  const acts: unknown[] = [];
  const ctl: Controller = { act: (a) => acts.push(a), update: () => {}, openChooser: () => {} };
  return { model: buildModel(snap.view, pending, initialUi(pending), ctl), acts };
}

async function reach(
  accept: (view: GameView) => boolean,
  play = PLAIN,
): Promise<NonNullable<Awaited<ReturnType<typeof searchCosts>>>> {
  const reached = await searchCosts(startHost, accept, { play });
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached;
}

const canCast = (name: string) => (view: GameView) =>
  castOptions(view, name).length > 0 && myCreatures(view).length >= 2;

describe('a sacrifice as an additional cost', () => {
  const SPELL = 'SYNTHETIC Sacrifice Draw';

  async function ask() {
    const { session } = await reach(canCast(SPELL));
    const option = castOptions(session.snapshot().view, SPELL)[0];
    if (option === undefined) throw new Error('not castable');
    const snap = await castAndPay(session, option);
    if (snap.view.pending?.kind !== 'choosePermanent') {
      throw new Error(`no sacrifice question: ${snap.view.pending?.kind}`);
    }
    return { session, snap };
  }

  test('the question says it is an additional cost, names what may be sacrificed and has a Cancel', async () => {
    const { snap } = await ask();
    const pending = snap.view.pending;
    expect(pending?.kind === 'choosePermanent' && pending.forCost).toBe(true);
    const { model } = modelOf(snap);
    expect(model.bar.prompt).toBe(`Sacrifice a creature as an additional cost to cast ${SPELL}.`);
    expect(model.bar.cancel?.label).toBe('Cancel');
    expect(model.bar.buttons.find((b) => b.label === 'Confirm')?.disabled).toBe(true);
  });

  test('Cancel sends cancel, which puts the spell back in the hand with nothing sacrificed', async () => {
    const { session, snap } = await ask();
    const creatures = myCreatures(snap.view).length;
    const untapped = myUntapped(snap.view);
    const { model, acts } = modelOf(snap);
    model.bar.cancel?.run();
    expect(acts).toEqual([{ kind: 'cancel' }]);
    const back = await must(session, { kind: 'cancel' });
    expect(back.view.pending?.kind).toBe('priority');
    expect(hand(back.view)).toContain(SPELL);
    expect(myCreatures(back.view)).toHaveLength(creatures);
    // The mana paid for the cast is back too (CR 733).
    expect(myUntapped(back.view)).toBeGreaterThan(untapped);
    expect(back.view.stack.some((o) => o.name === SPELL)).toBe(false);
  });

  test('choosing a creature and confirming sacrifices it, and the log says why', async () => {
    const { session, snap } = await ask();
    const pending = snap.view.pending;
    if (pending?.kind !== 'choosePermanent') throw new Error('no question');
    const victim = snap.view.battlefield.find((o) => o.id === pending.legal[0]);
    if (victim === undefined) throw new Error('no legal permanent');
    const action = pressButton(snap.view, 'Confirm', (ui) => ({ ...ui, permanents: [victim.id] }));
    expect(action).toEqual({ kind: 'choosePermanents', objects: [victim.id] });
    const next = await must(session, action);
    expect(graveyard(next.view)).toContain(victim.name);
    expect(texts(next)).toContain(
      `You choose ${victim.name} to sacrifice as an additional cost to cast ${SPELL}.`,
    );
    expect(texts(next)).toContain(`You sacrifice ${victim.name}.`);
    expect(texts(next)).toContain(`You cast ${SPELL}.`);
  });
});

describe('a discard as an additional cost, taken back', () => {
  const SPELL = 'SYNTHETIC Double Toll';

  test('the discard question names the spell, has a Cancel, and cancelling undoes the sacrifice too', async () => {
    const { session } = await reach((view) => canCast(SPELL)(view) && handOf(view).length >= 3);
    const before = session.snapshot().view;
    const creatures = myCreatures(before).length;
    const cards = hand(before);
    const option = castOptions(before, SPELL)[0];
    if (option === undefined) throw new Error('not castable');
    let snap = await castAndPay(session, option);
    const sacrifice = snap.view.pending;
    if (sacrifice?.kind !== 'choosePermanent') throw new Error('no sacrifice question');
    snap = await must(session, { kind: 'choosePermanents', objects: [firstOf(sacrifice.legal)] });
    const discard = snap.view.pending;
    if (discard?.kind !== 'chooseCards') throw new Error(`no discard question: ${discard?.kind}`);
    expect(discard.forCost).toBe(true);
    expect(myCreatures(snap.view)).toHaveLength(creatures - 1);

    const { model, acts } = modelOf(snap);
    expect(model.bar.prompt).toBe(`Discard a card as an additional cost to cast ${SPELL}.`);
    expect(model.bar.cancel?.label).toBe('Cancel');
    model.bar.cancel?.run();
    expect(acts).toEqual([{ kind: 'cancel' }]);

    // Cancel rewinds the whole cast: the sacrificed creature is back and the hand is whole again.
    const back = await must(session, { kind: 'cancel' });
    expect(back.view.pending?.kind).toBe('priority');
    expect(myCreatures(back.view)).toHaveLength(creatures);
    expect(hand(back.view).sort()).toEqual(cards.sort());
    expect(texts(back).some((t) => t.includes('discard'))).toBe(false);
  });

  test('choosing the card and confirming discards it and casts the spell', async () => {
    const { session } = await reach((view) => canCast(SPELL)(view) && handOf(view).length >= 3);
    const option = castOptions(session.snapshot().view, SPELL)[0];
    if (option === undefined) throw new Error('not castable');
    let snap = await castAndPay(session, option);
    const sacrifice = snap.view.pending;
    if (sacrifice?.kind !== 'choosePermanent') throw new Error('no sacrifice question');
    snap = await must(session, { kind: 'choosePermanents', objects: [firstOf(sacrifice.legal)] });
    const discard = snap.view.pending;
    if (discard?.kind !== 'chooseCards') throw new Error('no discard question');
    const card = handOf(snap.view).find((c) => c.id === discard.legal[0]);
    if (card === undefined) throw new Error('no card');
    const next = await must(session, {
      kind: 'chooseCards',
      objects: [card.id],
    });
    expect(graveyard(next.view)).toContain(card.name);
    expect(texts(next)).toContain(
      `You discard ${card.name} as an additional cost to cast ${SPELL}.`,
    );
    expect(texts(next)).toContain(`You cast ${SPELL}.`);
  });
});

describe('the cost a card has now', () => {
  const play = (c: { name: string; types: readonly string[] }) =>
    (c.types.includes('creature') && c.name !== 'Grizzly Bears') ||
    c.name === 'Sol Ring' ||
    c.name === 'SYNTHETIC Giant Discount';

  async function discounted() {
    return reach(
      (view) =>
        onBattlefield(view, 'SYNTHETIC Giant Discount') !== undefined &&
        castOptions(view, 'Grizzly Bears').length > 0,
      play,
    );
  }

  test('a creature spell costs {2} less with Giant Discount: castCost differs from the printed cost', async () => {
    const { session } = await discounted();
    const bears = handOf(session.snapshot().view).find((c) => c.name === 'Grizzly Bears');
    expect(bears?.manaCost).toEqual(['1', 'G']);
    expect(bears?.castCost).toEqual(['G']);
  });

  test('the cast option says what it costs and paying takes one source', async () => {
    const { session } = await discounted();
    const view = session.snapshot().view;
    const option = castOptions(view, 'Grizzly Bears')[0];
    const bears = handOf(view).find((c) => c.name === 'Grizzly Bears');
    if (option === undefined || bears === undefined) throw new Error('no Bears');
    expect(castLabel(option, bears, bears.name)).toBe('Cast Grizzly Bears for {G}');
    const before = myUntapped(view);
    const next = await castAndPay(session, option);
    expect(before - myUntapped(next.view)).toBe(1);
    expect(texts(next)).toContain('You cast Grizzly Bears.');
  });

  test('a commander in the command zone shows its tax in castCost', async () => {
    const { session } = await reach(
      (view) => (view.seats[view.viewer]?.command ?? []).length > 0,
      () => false,
    );
    const cmdr = session.snapshot().view.seats[0]?.command[0];
    expect(cmdr?.castCost).toEqual(cmdr?.manaCost);
  });
});

describe('a free cast with the commander on the battlefield', () => {
  const SPELL = 'SYNTHETIC Free Colossus';
  const play = (c: { name: string }) =>
    c.name === 'Isamaru, Hound of Konda' || c.name === 'Sol Ring' || c.name === 'Grizzly Bears';

  async function reachFree() {
    return reach((view) => castOptions(view, SPELL).some((o) => o.alternative === 'free'), play);
  }

  test('the option carries alternative free and a click sends it', async () => {
    const { session } = await reachFree();
    const view = session.snapshot().view;
    expect(onBattlefield(view, 'Isamaru, Hound of Konda')?.isCommander).toBe(true);
    const decision = view.pending;
    if (decision?.kind !== 'priority') throw new Error('no priority');
    const colossus = handOf(view).find((c) => c.name === SPELL);
    if (colossus === undefined) throw new Error('no Colossus');
    const free = castOptions(view, SPELL).find((o) => o.alternative === 'free');
    if (free === undefined) throw new Error('no free option');
    const outcome = clickOutcome(decision, colossus.id, objectIndex(view));
    // Seven mana is not at hand, so the free option is the only way to cast it: a click casts it.
    expect(outcome).toEqual({ kind: 'act', action: free });
    expect(castLabel(free, colossus, colossus.name)).toBe(
      `Cast ${SPELL} without paying its mana cost`,
    );
  });

  test('casting it taps nothing, logs the free cast and badges the spell on the stack', async () => {
    const { session } = await reachFree();
    const view = session.snapshot().view;
    const free = castOptions(view, SPELL).find((o) => o.alternative === 'free');
    if (free === undefined) throw new Error('no free option');
    const before = myUntapped(view);
    const next = await castAndPay(session, free);
    expect(myUntapped(next.view)).toBe(before);
    expect(texts(next)).toContain(`You cast ${SPELL} without paying its mana cost.`);
    expect(next.view.stack.find((o) => o.name === SPELL)?.free).toBe(true);
  });
});

describe("Ward—Discard a card on the opponent's creature", () => {
  const GUARD = 'SYNTHETIC Tithe Warded Guard';
  const lands = (view: GameView) =>
    view.battlefield.filter(
      (o) => o.controller === view.viewer && !o.tapped && o.name === 'Mountain',
    ).length;

  async function askWard() {
    const reached = await searchWard(
      startWardHost,
      (view) =>
        castOption(view, 'Lightning Bolt') !== null &&
        permanent(view, GUARD, false) !== undefined &&
        lands(view) > 0 &&
        handOf(view).length >= 3,
    );
    if (reached === null) throw new Error('no seed reaches the situation');
    const { session } = reached;
    const target = permanent(session.snapshot().view, GUARD, false);
    if (target === undefined) throw new Error('no Guard');
    await castAt(session, 'Lightning Bolt', target.id);
    const snap = await passUntilAsked(session);
    if (snap.view.pending?.kind !== 'confirmOptional') {
      throw new Error(`no ward question: ${snap.view.pending?.kind}`);
    }
    return { session, snap };
  }

  test('the question and then the discard are worded like the ward payment, with no Cancel', async () => {
    const { session, snap } = await askWard();
    const question = modelOf(snap).model.bar;
    expect(question.prompt).toBe('Discard a card or Lightning Bolt is countered?');
    expect(question.buttons.map((b) => b.label)).toEqual(['Discard', "Don't discard"]);
    expect(question.cancel).toBeNull();

    const next = await must(session, { kind: 'acceptOptional' });
    expect(texts(next)).toContain('You discard a card for ward.');
    const pending = next.view.pending;
    if (pending?.kind !== 'chooseCards') throw new Error(`no discard question: ${pending?.kind}`);
    expect(pending.forCost).toBeUndefined();
    const { model } = modelOf(next);
    expect(model.bar.prompt).toBe('Discard a card or Lightning Bolt is countered?');
    expect(model.bar.cancel).toBeNull();

    const card = handOf(next.view).find((c) => c.id === pending.legal[0]);
    if (card === undefined) throw new Error('no card');
    const done = await must(session, { kind: 'chooseCards', objects: [card.id] });
    expect(texts(done)).toContain(`You discard ${card.name}.`);
    expect(done.view.stack.some((o) => o.name === 'Lightning Bolt')).toBe(true);
  });
});
