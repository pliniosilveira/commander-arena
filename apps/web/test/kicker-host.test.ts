/**
 * Kicker (CR 702.33) and Flashback (CR 702.34) through the game host with the hidden SYNTHETIC
 * deck `synthetic-kicker`: the question and its exact wording, the log lines, Cancel, undo, and a
 * flashback cast from the graveyard with its exile. Seeds are searched, not fixed.
 */
import type { GameState } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import type { Snapshot } from '../src/game/protocol';
import { hasRelevantAction } from '../src/policy/should-stop';
import { objectIndex } from '../src/ui/decisions/lookup';
import { clickOutcome } from '../src/ui/decisions/priority';
import { pressCancel } from './abilities-decks';
import {
  asksKicker,
  canFlashback,
  flashbackCards,
  priorityOf,
  reachKicker,
  resolveStack,
} from './kicker-decks';
import { pressButton } from './mana-decks';

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);

async function mustReach(accept: Parameters<typeof reachKicker>[0]) {
  const reached = await reachKicker(accept);
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached;
}

describe('the kicker question', () => {
  test("a mana kicker: the prompt, Kick and Don't kick, and a Cancel that sends cancel", async () => {
    const { snap } = await mustReach(asksKicker('SYNTHETIC Kicker Bear'));
    const pending = snap.view.pending;
    if (pending?.kind !== 'confirmOptional') throw new Error('wrong decision');
    expect(pending.cost).toEqual([{ kind: 'mana', symbols: ['2'] }]);
    expect(pressButton(snap.view, 'Kick')).toEqual({ kind: 'acceptOptional' });
    expect(pressButton(snap.view, "Don't kick")).toEqual({ kind: 'declineOptional' });
    expect(pressCancel(snap.view)).toEqual({ kind: 'cancel' });
  });

  test('kicking: the cast is logged "kicked", the spell and then the permanent carry the badge', async () => {
    const { host, snap } = await mustReach(asksKicker('SYNTHETIC Kicker Bear'));
    const kicked = await host.act(pressButton(snap.view, 'Kick'));
    expect(kicked.error).toBeNull();
    // No optionalAnswered line: the answer is part of the cast and has no event of its own.
    expect(texts(kicked)).toEqual([]);
    const paid = await host.act(pressButton(kicked.view, 'Auto-pay'));
    expect(paid.error).toBeNull();
    expect(texts(paid)).toContain('You cast SYNTHETIC Kicker Bear, kicked.');
    const spell = paid.view.stack.find((o) => o.name === 'SYNTHETIC Kicker Bear');
    expect(spell?.kicked).toBe(true);
    expect(spell?.flashback).toBeUndefined();
    const done = await resolveStack(host, paid);
    const bear = done.view.battlefield.find((o) => o.name === 'SYNTHETIC Kicker Bear');
    expect(bear?.kicked).toBe(true);
  });

  test('declining: the cast reads as an ordinary one and nothing is badged', async () => {
    const { host, snap } = await mustReach(asksKicker('SYNTHETIC Kicker Bear'));
    const declined = await host.act(pressButton(snap.view, "Don't kick"));
    expect(declined.error).toBeNull();
    const paid = await host.act(pressButton(declined.view, 'Auto-pay'));
    expect(texts(paid)).toContain('You cast SYNTHETIC Kicker Bear.');
    expect(paid.view.stack.find((o) => o.name === 'SYNTHETIC Kicker Bear')?.kicked).toBeUndefined();
  });

  test('a life kicker reads "Pay the kicker cost: 3 life?" and the life is paid when kicked', async () => {
    const { host, snap } = await mustReach(asksKicker('SYNTHETIC Life Kicker'));
    const life = snap.view.seats[snap.view.viewer]?.life ?? 0;
    const kicked = await host.act(pressButton(snap.view, 'Kick'));
    const paid = await host.act(pressButton(kicked.view, 'Auto-pay'));
    expect(texts(paid)).toContain('You cast SYNTHETIC Life Kicker, kicked.');
    expect(paid.view.seats[paid.view.viewer]?.life).toBe(life - 3);
  });

  test('cancel at the question rewinds the cast: the card is back in the hand', async () => {
    const { host, snap } = await mustReach(asksKicker('SYNTHETIC Kicker Bear'));
    const handBefore = snap.view.seats[snap.view.viewer]?.hand?.length ?? 0;
    const next = await host.act(pressCancel(snap.view));
    expect(next.error).toBeNull();
    expect(next.view.pending?.kind).toBe('priority');
    expect(next.view.stack.find((o) => o.name === 'SYNTHETIC Kicker Bear')).toBeUndefined();
    expect(next.view.seats[next.view.viewer]?.hand?.length).toBe(handBefore + 1);
    // The cast start point went with the cast: one fewer undo than at the question.
    expect(next.undoDepth).toBe(snap.undoDepth - 1);
  });

  test('the answer is part of the cast: Undo takes it back to the question, Cancel later rewinds all', async () => {
    const { host, snap } = await mustReach(asksKicker('SYNTHETIC Kicker Bear'));
    const kicked = await host.act(pressButton(snap.view, 'Kick'));
    expect(kicked.undoDepth).toBe(snap.undoDepth + 1);
    expect(kicked.view.pending?.kind).toBe('payMana');

    const undone = await host.undo();
    expect(undone.error).toBeNull();
    expect(undone.undoDepth).toBe(snap.undoDepth);
    expect(asksKicker('SYNTHETIC Kicker Bear')(undone)).toBe(true);

    // Answer differently this time, then cancel at the payment: the whole cast is rewound.
    const declined = await host.act(pressButton(undone.view, "Don't kick"));
    expect(declined.undoDepth).toBe(snap.undoDepth + 1);
    const cancelled = await host.act(pressCancel(declined.view));
    expect(cancelled.view.pending?.kind).toBe('priority');
    expect(cancelled.undoDepth).toBe(snap.undoDepth - 1);
  });
});

describe('flashback', () => {
  test('a graveyard card is offered with flashback; the click sends it, the plain cast is refused', async () => {
    const { host, snap } = await mustReach(canFlashback());
    const [card] = flashbackCards(snap.view);
    const pending = priorityOf(snap);
    if (card === undefined || pending === null) throw new Error('nothing to cast');
    expect(card.zone).toBe('graveyard');
    const outcome = clickOutcome(pending, card.id, objectIndex(snap.view));
    expect(outcome).toEqual({
      kind: 'act',
      action: { kind: 'castSpell', object: card.id, alternative: 'flashback' },
    });
    // What the page used to send: the engine refuses it, and nothing changes.
    const plain = await host.act({ kind: 'castSpell', object: card.id });
    expect(plain.error).not.toBeNull();
    expect(plain.view.stack).toHaveLength(0);
  });

  test('a flashback instant in the graveyard is a relevant action for the autopilot', async () => {
    const { snap } = await mustReach(canFlashback('SYNTHETIC Flash Gain'));
    const pending = priorityOf(snap);
    if (pending === null) throw new Error('no priority');
    expect(hasRelevantAction(snap.view, pending)).toBe(true);
  });

  test('cast with flashback: the log says so and the spell is exiled when it resolves', async () => {
    const { host, snap } = await mustReach(canFlashback('SYNTHETIC Flash Gain'));
    const card = flashbackCards(snap.view).find((c) => c.name === 'SYNTHETIC Flash Gain');
    const pending = priorityOf(snap);
    if (card === undefined || pending === null) throw new Error('nothing to cast');
    const outcome = clickOutcome(pending, card.id, objectIndex(snap.view));
    if (outcome.kind !== 'act') throw new Error('expected a cast');
    const graveBefore = snap.view.seats[snap.view.viewer]?.graveyard.length ?? 0;
    const cast = await host.act(outcome.action);
    expect(cast.error).toBeNull();
    expect(cast.view.pending?.kind).toBe('payMana');
    const paid = await host.act(pressButton(cast.view, 'Auto-pay'));
    expect(paid.error).toBeNull();
    expect(texts(paid)).toContain('You cast SYNTHETIC Flash Gain with flashback.');
    expect(paid.view.stack.find((o) => o.name === 'SYNTHETIC Flash Gain')?.flashback).toBe(true);
    const done = await resolveStack(host, paid);
    expect(done.view.exile.some((o) => o.name === 'SYNTHETIC Flash Gain')).toBe(true);
    expect(done.view.seats[done.view.viewer]?.graveyard.length).toBe(graveBefore - 1);
  });

  test('a flashback cast is undoable like any cast, and Cancel at its payment rewinds it', async () => {
    const { host, snap } = await mustReach(canFlashback());
    const card = flashbackCards(snap.view)[0];
    if (card === undefined) throw new Error('nothing to cast');
    const cast = await host.act({ kind: 'castSpell', object: card.id, alternative: 'flashback' });
    expect(cast.error).toBeNull();
    expect(cast.undoDepth).toBeGreaterThan(snap.undoDepth);
    const cancelled = await host.act(pressCancel(cast.view));
    expect(cancelled.view.pending?.kind).toBe('priority');
    expect(cancelled.undoDepth).toBe(snap.undoDepth);
    expect(canFlashback(card.name)(cancelled)).toBe(true);
  });
});

describe('log wording of spellCast', () => {
  const state = (controller: number) =>
    ({
      objects: { o1: { card: 'c1', token: null, stack: null, controller } },
      cards: { c1: { definition: 'd1' } },
      definitions: { d1: { name: 'Bolt' } },
      lki: {},
    }) as unknown as GameState;
  const line = (extra: object, seat: number) =>
    describeEvent(
      { kind: 'spellCast', seat, object: 'o1', commanderTax: 0, ...extra } as never,
      state(seat),
      state(seat),
      0,
    )?.text;

  test('you cast it kicked, with flashback, or both', () => {
    expect(line({}, 0)).toBe('You cast Bolt.');
    expect(line({ kicked: true }, 0)).toBe('You cast Bolt, kicked.');
    expect(line({ alternative: 'flashback' }, 0)).toBe('You cast Bolt with flashback.');
    expect(line({ kicked: true, alternative: 'flashback' }, 0)).toBe(
      'You cast Bolt with flashback, kicked.',
    );
  });

  test('the opponent forms', () => {
    expect(line({ kicked: true }, 1)).toBe('Opponent casts Bolt, kicked.');
    expect(line({ alternative: 'flashback' }, 1)).toBe('Opponent casts Bolt with flashback.');
    expect(line({ kicked: true, alternative: 'flashback' }, 1)).toBe(
      'Opponent casts Bolt with flashback, kicked.',
    );
  });

  test('commander tax stays before the how', () => {
    const event = { kind: 'spellCast', seat: 0, object: 'o1', commanderTax: 2, kicked: true };
    expect(describeEvent(event as never, state(0), state(0), 0)?.text).toBe(
      'You cast Bolt (commander tax 2), kicked.',
    );
  });
});
