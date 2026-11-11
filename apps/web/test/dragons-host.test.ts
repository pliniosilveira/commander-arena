/**
 * The questions of the Dragons slice (D-151) end to end through the page's store, in real games of the hidden SYNTHETIC decks
 * `synthetic-dragons` and `synthetic-dragons-early`: the chapter a Saga with read ahead starts with and the discard of any number of
 * cards it leads to, a Behold over cards of the hand and permanents, a card exiled to be played, the top card of the library cast,
 * paying any amount of a symbol and the Khans or Dragons choice. The seeds are found by the search of `dragons-decks.ts`; the checks
 * fail loudly when a seed no longer reaches the situation.
 */
import type {
  ChooseCardsDecision,
  ChooseOptionDecision,
  ChooseXDecision,
  GameView,
  PayManaDecision,
  PriorityDecision,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { menuItems } from '../src/ui/decisions/abilities';
import {
  beholdCards,
  cardsPrompt,
  confirmLabel,
  foundDetail,
  foundReady,
} from '../src/ui/decisions/cards-picker';
import { castBadge, castLabel } from '../src/ui/decisions/flashback';
import { objectIndex } from '../src/ui/decisions/lookup';
import { namedOptionRows } from '../src/ui/decisions/option-names';
import { optionPrompt } from '../src/ui/decisions/option-picker';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import { playableObjects } from '../src/ui/decisions/priority';
import { payAmountButtonText, payAmountPrompt, xPrompt } from '../src/ui/decisions/x-picker';
import {
  asksAnyDiscard,
  asksBeholdBoth,
  asksChapter,
  asksNamedOption,
  asksPayAny,
  DRAGONS_DECK,
  mayCastFromTop,
  mayPlayFromExile,
  reachDragonsStore,
} from './dragons-decks';

const viewOf = (found: { store: { getState: () => { snapshot: { view: GameView } | null } } }) =>
  found.store.getState().snapshot?.view as GameView;

test('a Saga with read ahead asks for the chapter, with the words of each chapter; the discard it leads to takes any number', async () => {
  const found = await reachDragonsStore(asksChapter, /Reading Rite/, { seeds: 30 });
  if (found === null) throw new Error('no seed reaches the chapter choice');
  const { store } = found;
  const view = viewOf(found);
  const d = view.pending as ChooseOptionDecision;
  expect(d.options).toEqual(['1', '2', '3']);
  expect(optionPrompt(d)).toBe('Choose a chapter to start with for SYNTHETIC Reading Rite.');
  expect(namedOptionRows(d).map((r) => r.label)).toEqual([
    'Chapter I',
    'Chapter II',
    'Chapter III',
  ]);
  expect(namedOptionRows(d)[1]?.detail).toBe(
    'Discard any number of cards, then draw that many cards.',
  );
  expect(namedOptionRows(d)[2]?.detail).toBe('Create a 3/3 Golem artifact creature token.');

  // Chapter II: it triggers as the Saga enters, and asks the discard when it resolves.
  await store.getState().act({ kind: 'chooseOption', option: '2' });
  expect(store.getState().error).toBeNull();
  for (let n = 0; n < 12 && !asksAnyDiscard(viewOf(found)); n += 1) {
    await store.getState().act({ kind: 'pass' });
  }
  const next = viewOf(found);
  expect(asksAnyDiscard(next)).toBe(true);
  const discard = next.pending as ChooseCardsDecision;
  const index = objectIndex(next);
  expect(discard.min).toBe(0);
  expect(cardsPrompt(discard, index)).toMatch(
    /^Discard any number of cards \(SYNTHETIC Reading Rite/,
  );
  expect(confirmLabel(discard, [], 'hand')).toBe('Discard none');
  expect(confirmLabel(discard, discard.legal.slice(0, 1), 'hand')).toBe('Discard');
  expect(foundReady([], discard)).toBe(true);
  expect(foundDetail(discard, [])).toContain('Confirm to discard none');
  // Nothing discarded, nothing drawn.
  const handBefore = next.seats[next.viewer]?.handCount;
  await store.getState().act({ kind: 'chooseCards', objects: [] });
  expect(store.getState().error).toBeNull();
  expect(viewOf(found).seats[next.viewer]?.handCount).toBe(handBefore);
}, 300_000);

test('Behold lists the cards of the hand and the permanents you control, and the answer is one of them', async () => {
  const found = await reachDragonsStore(asksBeholdBoth, /Dragon Scout/, {
    seeds: 30,
    filler: /Plain Drake/,
  });
  if (found === null) throw new Error('no seed reaches a Behold with both');
  const { store } = found;
  const view = viewOf(found);
  const d = view.pending as ChooseCardsDecision;
  const index = objectIndex(view);
  expect(d.purpose).toBe('behold');
  expect(cardsPrompt(d, index)).toBe("Behold a Dragon (SYNTHETIC Dragon Scout's ability).");
  const { hand, battlefield } = beholdCards(view, d);
  expect(hand.length).toBeGreaterThan(0);
  expect(battlefield.length).toBeGreaterThan(0);
  expect(hand.every((o) => o.zone === 'hand' && o.subtypes.includes('Dragon'))).toBe(true);
  expect(battlefield.every((o) => o.zone === 'battlefield' && o.subtypes.includes('Dragon'))).toBe(
    true,
  );
  expect(confirmLabel(d, [], 'hand')).toBe('Behold');
  const treasures = (v: GameView) => v.battlefield.filter((o) => o.name === 'Treasure').length;
  const before = treasures(view);
  // A permanent is chosen, not revealed: the Treasure comes either way.
  await store
    .getState()
    .act({ kind: 'chooseCards', objects: battlefield.slice(0, 1).map((o) => o.id) });
  expect(store.getState().error).toBeNull();
  for (let n = 0; n < 6 && treasures(viewOf(found)) === before; n += 1) {
    await store.getState().act({ kind: 'pass' });
  }
  expect(treasures(viewOf(found))).toBe(before + 1);
}, 300_000);

test('a card exiled to be played is castable from exile, and its labels say so', async () => {
  const found = await reachDragonsStore(mayPlayFromExile, /Impulse Rite/, { seeds: 30 });
  if (found === null) throw new Error('no seed reaches a card to play from exile');
  const view = viewOf(found);
  const d = view.pending as PriorityDecision;
  const index = objectIndex(view);
  const playable = playableObjects(d);
  const option = d.options.find(
    (o) =>
      (o.kind === 'castSpell' || o.kind === 'playLand') &&
      view.exile.some((e) => e.id === o.object),
  );
  if (option === undefined || (option.kind !== 'castSpell' && option.kind !== 'playLand')) {
    throw new Error('no option on an exiled card');
  }
  const card = index.get(option.object);
  expect(card?.zone).toBe('exile');
  const badge = castBadge(d, playable, index, option.object);
  expect(badge).toBe(option.kind === 'playLand' ? 'Play from exile' : 'Cast from exile');
  const [item] = menuItems(d, option.object, index);
  if (option.kind === 'castSpell') {
    expect(castLabel(option, card, card?.name ?? '')).toMatch(/^Cast .+ from exile/);
  }
  expect(item?.label).toContain('from exile');
}, 300_000);

test('the top card of the library, when a permanent lets you cast it, is castable from there', async () => {
  const found = await reachDragonsStore(mayCastFromTop, /Seer Drake/, { seeds: 30 });
  if (found === null) throw new Error('no seed reaches a cast from the top of the library');
  const { store } = found;
  const view = viewOf(found);
  const d = view.pending as PriorityDecision;
  const index = objectIndex(view);
  const top = view.seats[view.viewer]?.libraryTop;
  if (top === undefined) throw new Error('no top card in the view');
  // The viewer's own top card is in the index, the opponent's is nowhere.
  expect(index.get(top.id)?.zone).toBe('library');
  expect(castBadge(d, playableObjects(d), index, top.id)).toBe('Cast from the top of your library');
  const [item] = menuItems(d, top.id, index);
  expect(item?.label).toMatch(/^Cast .+ from the top of your library/);
  expect(view.seats[1 - view.viewer]?.libraryTop).toBeUndefined();
  const libraryBefore = view.seats[view.viewer]?.libraryCount ?? 0;
  await store.getState().act(item?.action ?? { kind: 'pass' });
  expect(store.getState().error).toBeNull();
  expect(viewOf(found).seats[view.viewer]?.libraryCount).toBeLessThan(libraryBefore);
}, 300_000);

test('paying any amount asks a number from 0, with the symbol, and the payment follows', async () => {
  const found = await reachDragonsStore(asksPayAny, /Ember Tyrant/, { seeds: 30, manual: true });
  if (found === null) throw new Error('no seed reaches paying any amount');
  const { store } = found;
  const view = viewOf(found);
  const d = view.pending as ChooseXDecision;
  expect(d.purpose).toBe('payAnyAmount');
  expect(d.min).toBe(0);
  expect(d.max).toBeGreaterThan(0);
  expect(d.cost).toEqual([{ kind: 'mana', symbols: ['R'] }]);
  expect(xPrompt(d)).toBe(payAmountPrompt(d));
  expect(payAmountPrompt(d)).toBe(
    `Pay any amount of {R} for SYNTHETIC Ember Tyrant's ability. You can pay up to ${d.max}.`,
  );
  expect(payAmountButtonText(d, 0)).toBe("Don't pay");
  expect(payAmountButtonText(d, 1)).toBe('Pay {R}');
  expect(payAmountButtonText(d, 2)).toBe('Pay {R}{R}');
  await store.getState().act({ kind: 'chooseX', value: 1 });
  expect(store.getState().error).toBeNull();
  const next = viewOf(found);
  const pay = next.pending as PayManaDecision;
  expect(pay.kind).toBe('payMana');
  expect(pay.purpose).toBe('mayPay');
  expect(payBarPrompt(pay, objectIndex(next))).toContain(
    "Pay {R} for SYNTHETIC Ember Tyrant's ability",
  );
  expect(payCancelLabel(pay)).toBe("Don't pay");
}, 300_000);

test('Khans or Dragons: the options are the names the card gives', async () => {
  const found = await reachDragonsStore(asksNamedOption, /Siege of Choices/, {
    seeds: 40,
    human: DRAGONS_DECK,
    ai: DRAGONS_DECK,
  });
  if (found === null) throw new Error('no seed reaches the choice of a name');
  const view = viewOf(found);
  const d = view.pending as ChooseOptionDecision;
  expect(d.options).toEqual(['Khans', 'Dragons']);
  expect(optionPrompt(d)).toBe('As SYNTHETIC Siege of Choices enters, choose Khans or Dragons.');
  expect(namedOptionRows(d).map((r) => r.label)).toEqual(['Khans', 'Dragons']);
  await found.store.getState().act({ kind: 'chooseOption', option: 'Dragons' });
  expect(found.store.getState().error).toBeNull();
}, 300_000);
