/**
 * Rooms in the page (CR 709.5): the menu and the payment of unlocking a locked half, the log line of an unlock, the preview facts of a Room, and the wording of the trigger "When you
 * unlock this door" and of the amount "the number of card types among those cards". The states are real engine states (the scenario DSL) with the SYNTHETIC Rooms of the engine's
 * fixtures.
 */
import type { PriorityDecision } from '@commander-arena/engine';
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { amountPhrase } from '../src/game/amount-text';
import { describeEvent } from '../src/game/describe';
import { roomFacts, unlockLabel } from '../src/game/room-text';
import { menuItems } from '../src/ui/decisions/abilities';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import { clickOutcome, playableObjects } from '../src/ui/decisions/priority';
import { lookupIndexFor } from './decisions-helpers';

const WATCH = 'SYNTHETIC Watch Room // Vault Room'; // {1}{W} | {2}{B}
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const game = () =>
  scenario()
    .seat(0)
    .life(20)
    .battlefield('Swamp', { count: 3 })
    .battlefield(WATCH, { unlocked: [0] })
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();

describe('the unlock special action in the menu and the payment', () => {
  const g = game();
  const view = getView(g.state, 0);
  const room = view.battlefield.find((o) => o.id === g.id(WATCH));

  test('the Room is playable and its menu offers "Unlock Vault Room {2}{B}"', () => {
    const decision = g.state.pending as PriorityDecision;
    expect(playableObjects(decision).has(g.id(WATCH))).toBe(true);
    const items = menuItems(decision, g.id(WATCH), lookupIndexFor(view.battlefield));
    expect(items.map((i) => i.label)).toEqual(['Unlock Vault Room {2}{B}']);
    expect(items[0]?.action).toEqual({ kind: 'unlockDoor', object: g.id(WATCH), door: 1 });
    expect(unlockLabel(room, 1)).toBe('Unlock Vault Room {2}{B}');
    // A click asks (a menu): an unlock spends mana and is never taken by a stray click.
    expect(clickOutcome(decision, g.id(WATCH), lookupIndexFor(view.battlefield)).kind).toBe('menu');
  });

  test('the payment says what it is for and Cancel leaves the half locked', () => {
    const h = game();
    h.act(0).unlock(WATCH, 1);
    const d = h.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected the payment');
    expect(d.purpose).toBe('unlockDoor');
    const prompt = payBarPrompt(d, lookupIndexFor(getView(h.state, 0).battlefield));
    expect(prompt).toBe('Pay {2}{B} to unlock Vault Room: tap your mana sources.');
    expect(payCancelLabel(d)).toBe('Cancel');
  });
});

describe('the log and the preview', () => {
  test('the log says which half was unlocked', () => {
    const h = game();
    const before = h.state;
    const mark = h.mark();
    h.act(0).unlock(WATCH, 1, { pay: true });
    const texts = [...h.eventsSince(mark)].flatMap((e) => {
      const d = describeEvent(e, before, h.state, 0);
      return d === null ? [] : [d.text];
    });
    expect(texts).toContain('You unlocked Vault Room.');
  });

  test('the preview tells which halves are unlocked and what a locked half costs', () => {
    const h = game();
    const room = getView(h.state, 0).battlefield.find((o) => o.id === h.id(WATCH));
    expect(room && roomFacts(room)).toEqual([
      'Watch Room: unlocked',
      'Vault Room: locked, no name, mana cost or rules text (unlock for {2}{B})',
    ]);
  });
});

describe('words', () => {
  test('the amount "the number of card types among those cards"', () => {
    expect(amountPhrase({ kind: 'cardTypesAmongTriggerCards' })).toBe(
      'the number of card types among those cards',
    );
  });
});
