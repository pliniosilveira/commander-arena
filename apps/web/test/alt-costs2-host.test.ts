/**
 * Spectacle, Escape and Unearth (D-124) through the game host with the hidden SYNTHETIC decks
 * `synthetic-spectacle`, `synthetic-escape` and `synthetic-unearth` (game/precons.ts): the cast
 * options and their labels, the exile question of Escape, the unearth ability from the graveyard and
 * the words of its delayed trigger, the badges and the log.
 */
import type { Action, GameView } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import { alternativeBadge } from '../src/game/alt-cost';
import type { Snapshot } from '../src/game/protocol';
import { triggerGist } from '../src/ui/decisions/ability-label';
import {
  cardsPrompt,
  discardTitle,
  pickerCards,
  waitingText,
} from '../src/ui/decisions/cards-picker';
import { castBadge, graveyardLabels } from '../src/ui/decisions/flashback';
import { objectIndex, stackName } from '../src/ui/decisions/lookup';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { clickOutcome } from '../src/ui/decisions/priority';
import { initialUi } from '../src/ui/decisions/ui-state';
import { holdBot, myGraveyard, myLands, priority, reach } from './alt-costs-decks';
import { chooseAction } from './bot';
import { must } from './costs-decks';
import { handOf } from './ward-decks';

vi.setConfig({ testTimeout: 90_000 });

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);
const graveyardCard = (view: GameView, name: string) =>
  myGraveyard(view).find((o) => o.name === name);

/** The cast and activate options the decision lists for a card of the viewer's graveyard. */
function graveyardOptions(view: GameView, name: string) {
  const card = graveyardCard(view, name);
  const decision = priority(view);
  if (card === undefined || decision === null) return [];
  return decision.options.filter(
    (o) =>
      (o.kind === 'castSpell' && o.object === card.id) ||
      (o.kind === 'activate' && o.object === card.id),
  );
}

describe('Spectacle', () => {
  const RAIDER = 'SYNTHETIC Spectacle Raider';
  const PULSE = 'SYNTHETIC Drain Pulse';
  const cards = (view: GameView, name: string) => handOf(view).filter((c) => c.name === name);
  const optionsOf = (view: GameView, name: string) => {
    const decision = priority(view);
    const ids = new Set(cards(view, name).map((c) => c.id));
    return (decision?.options ?? []).filter((o) => o.kind === 'castSpell' && ids.has(o.object));
  };
  // Three lands (one of them a Mountain) pay {1}{R} and the {B} of the pulse, but not {3}{R}.
  const ready = (view: GameView) =>
    myLands(view) === 3 &&
    view.battlefield.some((o) => o.controller === view.viewer && o.name === 'Mountain') &&
    optionsOf(view, PULSE).length > 0 &&
    cards(view, RAIDER).length > 0;

  test('no spectacle button until an opponent loses life; then "Spectacle {1}{R}", the log and the badge', async () => {
    const { session } = await reach('synthetic-spectacle', ready, 60);
    let view = session.snapshot().view;
    expect(view.seats[1 - view.viewer]?.lifeLostThisTurn).toBe(0);
    expect(optionsOf(view, RAIDER)).toEqual([]);

    const pulse = optionsOf(view, PULSE)[0];
    if (pulse === undefined) throw new Error('no pulse');
    let snap = await must(session, pulse);
    if (snap.view.pending?.kind === 'payMana') snap = await must(session, { kind: 'payAuto' });
    snap = await must(session, { kind: 'pass' });
    view = snap.view;
    expect(view.seats[1 - view.viewer]?.lifeLostThisTurn).toBe(1);

    const options = optionsOf(view, RAIDER);
    expect(options).toHaveLength(1);
    const decision = priority(view);
    const card = cards(view, RAIDER)[0];
    if (decision === null || card === undefined) throw new Error('no raider');
    const outcome = clickOutcome(decision, card.id, objectIndex(view));
    if (outcome.kind !== 'menu') throw new Error(`expected a menu, got ${outcome.kind}`);
    expect(outcome.items.map((i) => [i.key, i.label])).toEqual([
      ['cast-spectacle', 'Spectacle {1}{R}'],
    ]);
    snap = await must(session, outcome.items[0]?.action ?? { kind: 'pass' });
    if (snap.view.pending?.kind === 'payMana') snap = await must(session, { kind: 'payAuto' });
    expect(texts(snap).join('\n')).toContain(`You cast ${RAIDER} for its spectacle cost.`);
    const spell = snap.view.stack.find((o) => o.name === RAIDER);
    expect(alternativeBadge(spell ?? ({} as never))?.text).toBe('spectacle');
  });
});

describe('Escape', () => {
  const NAME = 'SYNTHETIC Escape Wraith';
  const filled = (view: GameView) => myGraveyard(view).length >= 5;
  const ready = (view: GameView) =>
    filled(view) && graveyardOptions(view, NAME).some((o) => o.kind === 'castSpell');
  const reached = () => reach('synthetic-escape', ready, 40, holdBot(filled, NAME));

  test('a graveyard card with escape gets a button with the cost and the number of cards', async () => {
    const { session } = await reached();
    const view = session.snapshot().view;
    const card = graveyardCard(view, NAME);
    const decision = priority(view);
    if (card === undefined || decision === null) throw new Error('no escape card');
    expect(card.alternativeCosts).toEqual([{ kind: 'escape', cost: ['B', 'B'], exile: 3 }]);
    expect(graveyardLabels(decision, card)).toEqual(['Escape {B}{B}, exile 3 other cards']);
    expect(castBadge(decision, new Set([card.id]), objectIndex(view), card.id)).toBe(
      'Escape {B}{B}, exile 3 other cards',
    );
    // A single named alternative is asked about, never cast by the click.
    const outcome = clickOutcome(decision, card.id, objectIndex(view));
    if (outcome.kind !== 'menu') throw new Error(`expected a menu, got ${outcome.kind}`);
    expect(outcome.items.map((i) => [i.key, i.label])).toEqual([
      ['cast-escape', 'Escape {B}{B}, exile 3 other cards'],
    ]);
    expect(outcome.items[0]?.action).toEqual({
      kind: 'castSpell',
      object: card.id,
      alternative: 'escape',
    });
    // The cards in hand and on the battlefield have none of it.
    expect(graveyardLabels(decision, handOf(view)[0])).toEqual([]);
  });

  test('the exile question: words, Cancel rewinds, the answer exiles the cards and the permanent is escaped', async () => {
    const { session } = await reached();
    const view = session.snapshot().view;
    const card = graveyardCard(view, NAME);
    if (card === undefined) throw new Error('no escape card');
    const before = myGraveyard(view).length;
    let snap = await must(session, { kind: 'castSpell', object: card.id, alternative: 'escape' });
    if (snap.view.pending?.kind === 'payMana') {
      snap = await must(session, { kind: 'payAuto' });
    }
    const ask = snap.view.pending;
    if (ask?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${ask?.kind}`);
    expect(ask).toMatchObject({ purpose: 'exile', zone: 'graveyard', forCost: true, reveal: true });
    expect(ask.legal).not.toContain(card.id);
    const index = objectIndex(snap.view);
    expect(cardsPrompt(ask, index)).toBe(
      `Exile 3 other cards from your graveyard to cast ${NAME}.`,
    );
    expect(discardTitle(ask, index)).toBe(`Exile to cast ${NAME}`);

    // The opponent sees only that cards are being chosen from a graveyard.
    // (the other seat's view: `waitingText` reads `waitingOn`, which names no card.)
    expect(
      waitingText({ ...snap.view, waitingOn: { seat: 0, purpose: 'exile', sourceName: NAME } }),
    ).toBe(`Opponent is choosing cards to exile from their graveyard (${NAME}).`);

    // The bar: the prompt, "Exile" ready at exactly three, a Cancel, the graveyard cards clickable.
    const acts: Action[] = [];
    let ui = initialUi(ask);
    const ctl: Controller = {
      act: (a) => acts.push(a),
      update: (change) => {
        ui = change(ui);
      },
      openChooser: () => {},
    };
    let model = buildModel(snap.view, ask, ui, ctl);
    expect(model.bar.prompt).toBe(cardsPrompt(ask, index));
    expect(model.interaction.clickable).toEqual(new Set(ask.legal));
    expect(model.interaction.dimOthers).toBe(false);
    expect(model.bar.cancel?.label).toBe('Cancel');
    expect(model.bar.buttons.map((b) => [b.label, b.disabled])).toEqual([['Exile', true]]);
    expect(pickerCards(snap.view, ask).map((o) => o.id)).toEqual(ask.legal);
    for (const id of ask.legal.slice(0, 3)) model.interaction.onObject(id);
    model = buildModel(snap.view, ask, ui, ctl);
    expect(model.bar.buttons.map((b) => [b.label, b.disabled])).toEqual([['Exile', false]]);
    expect(model.interaction.badge(ask.legal[0] ?? 'o0')).toBe('Exile');
    model.bar.buttons[0]?.run();
    expect(acts).toEqual([{ kind: 'chooseCards', objects: ask.legal.slice(0, 3) }]);

    // Cancel rewinds the whole cast: the card is in the graveyard again, nothing is exiled.
    snap = await must(session, { kind: 'cancel' });
    expect(myGraveyard(snap.view)).toHaveLength(before);
    expect(snap.view.stack).toHaveLength(0);
    expect(priority(snap.view)).not.toBeNull();

    // Cast again and choose.
    snap = await must(session, { kind: 'castSpell', object: card.id, alternative: 'escape' });
    if (snap.view.pending?.kind === 'payMana') {
      snap = await must(session, { kind: 'payAuto' });
    }
    const again = snap.view.pending;
    if (again?.kind !== 'chooseCards') throw new Error('expected chooseCards');
    snap = await must(session, { kind: 'chooseCards', objects: again.legal.slice(0, 3) });
    expect(texts(snap)).toContain(`You cast ${NAME} for its escape cost.`);
    const spell = snap.view.stack.find((o) => o.name === NAME);
    expect(spell?.alternative).toBe('escape');
    expect(alternativeBadge(spell ?? ({} as never))?.text).toBe('escaped');
    expect(snap.view.exile.length).toBe(3);
    expect(myGraveyard(snap.view)).toHaveLength(before - 4);

    snap = await must(session, { kind: 'pass' });
    const permanent = snap.view.battlefield.find((o) => o.name === NAME);
    expect(permanent?.alternative).toBe('escape');
    expect(alternativeBadge(permanent ?? ({} as never))).toMatchObject({ text: 'escaped' });
    expect(myLands(snap.view)).toBeGreaterThanOrEqual(2);
  });
});

describe('Unearth', () => {
  const NAME = 'SYNTHETIC Unearth Gnoll';
  const filled = (view: GameView) => myGraveyard(view).length >= 1;
  const ready = (view: GameView) => graveyardOptions(view, NAME).some((o) => o.kind === 'activate');
  const reached = () => reach('synthetic-unearth', ready, 40, holdBot(filled, NAME));

  test('an activate option for a graveyard card: "Unearth {R}", the ability on the stack, the permanent', async () => {
    const { session } = await reached();
    const view = session.snapshot().view;
    const card = graveyardCard(view, NAME);
    const decision = priority(view);
    if (card === undefined || decision === null) throw new Error('no unearth card');
    expect(graveyardLabels(decision, card)).toEqual(['Unearth {R}']);
    const outcome = clickOutcome(decision, card.id, objectIndex(view));
    if (outcome.kind !== 'act') throw new Error(`expected an action, got ${outcome.kind}`);
    expect(outcome.action).toMatchObject({ kind: 'activate', object: card.id });

    let snap = await must(session, outcome.action);
    if (snap.view.pending?.kind === 'payMana') snap = await must(session, { kind: 'payAuto' });
    const ability = snap.view.stack[snap.view.stack.length - 1];
    if (ability?.ability === undefined) throw new Error('no ability on the stack');
    expect(stackName(objectIndex(snap.view), ability.id)).toBe(`${NAME}'s ability`);
    expect(triggerGist(ability.ability, ability)).toMatch(
      /^Return this card from your graveyard to the battlefield\. It gains haste\. Exile it at the beginning of the next end step/,
    );
    // Not a spell: nothing says "cast".
    expect(texts(snap).join('\n')).not.toContain(`You cast ${NAME}`);

    snap = await must(session, { kind: 'pass' });
    const permanent = snap.view.battlefield.find((o) => o.name === NAME);
    expect(permanent?.alternative).toBe('unearth');
    expect(permanent?.keywords).toContain('haste');
    expect(alternativeBadge(permanent ?? ({} as never))?.fact).toBe(
      'Unearthed: exiled at the end of turn, and if it would leave the battlefield it is exiled instead',
    );
    // The delayed trigger is on the stack only at the end step; pass until it is.
    let trigger = snap.view.stack.find((o) => o.ability?.kind === 'triggered');
    for (let step = 0; step < 30 && trigger === undefined; step += 1) {
      const view = snap.view;
      const next = await must(
        session,
        view.pending === null ? { kind: 'pass' } : chooseAction(view, view.pending),
      );
      snap = next;
      trigger = snap.view.stack.find((o) => o.ability?.kind === 'triggered');
    }
    if (trigger?.ability === undefined) throw new Error('the delayed trigger never came');
    expect(trigger.ability.kind === 'triggered' && trigger.ability.trigger.kind).toBe('endStep');
    expect(
      triggerGist(
        trigger.ability,
        snap.view.battlefield.find((o) => o.name === NAME),
      ),
    ).toBe('Exile this creature');
  });
});
