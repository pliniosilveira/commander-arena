/**
 * The play rules of D-125 through the game host with the hidden SYNTHETIC decks `synthetic-top-card`,
 * `synthetic-extra-land`, `synthetic-attack-tax`, `synthetic-hasty-goblins` and `synthetic-optional-untap`
 * (game/precons.ts: invented engine fixtures, not real cards): the top card in the viewer's view and no
 * other, the extra land play, the payment of the cost of attacking and Cancel back to the attackers, and
 * the untap step's checklist with its log line. The scripted human plays lands and the cards it is told
 * to cast, and passes; a seed is searched for the situation.
 */
import type { Action, GameView, PendingDecision } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import { GameHost } from '../src/game/host';
import { findObject } from '../src/ui/board/resolve';
import { attackTaxPrompt, taxRows } from '../src/ui/decisions/attack-tax';
import { objectIndex } from '../src/ui/decisions/lookup';
import { payCancelLabel } from '../src/ui/decisions/payment';
import { chooseAction } from './bot';
import { must } from './costs-decks';
import { handOf, hostSession, type Session } from './ward-decks';

vi.setConfig({ testTimeout: 90_000 });

const NO_ATTACK: Action = { kind: 'declareAttackers', attacks: [] };

/** Lands first, then the named cards; passes otherwise. Untaps everything, attacks with nothing. */
function bot(cast: readonly string[]): (view: GameView, d: PendingDecision) => Action {
  return (view, d) => {
    if (d.kind === 'choosePermanent' && d.purpose === 'untap') {
      return { kind: 'choosePermanents', objects: d.legal };
    }
    if (d.kind === 'declareAttackers') return NO_ATTACK;
    if (d.kind !== 'priority') return chooseAction(view, d);
    const land = d.options.find((o) => o.kind === 'playLand');
    if (land !== undefined) return land;
    const hand = handOf(view);
    const spell = d.options.find(
      (o) =>
        o.kind === 'castSpell' &&
        o.alternative === undefined &&
        cast.includes(hand.find((c) => c.id === o.object)?.name ?? ''),
    );
    return spell ?? { kind: 'pass' };
  };
}

async function reach(
  humanDeck: string,
  aiDeck: string,
  play: (view: GameView, d: PendingDecision) => Action,
  accept: (view: GameView) => boolean,
  seeds = 30,
): Promise<{ session: Session; host: GameHost; seed: number }> {
  for (let seed = 1; seed <= seeds; seed += 1) {
    const host = new GameHost({ clock: () => 0 });
    const first = (await host.newGame({ seed, humanDeck, aiDeck })).snapshot;
    const session = hostSession(host, first);
    for (let clicks = 0; clicks < 900; clicks += 1) {
      const view = session.snapshot().view;
      if (view.result !== null || view.pending === null) break;
      if (view.pending.seat === view.viewer && accept(view)) return { session, host, seed };
      if ((await session.act(play(view, view.pending))) === null) break;
    }
  }
  throw new Error(`no seed reaches the situation in ${humanDeck}`);
}

const mine = (view: GameView, name: string) =>
  view.battlefield.filter((o) => o.controller === view.viewer && o.name === name);
const texts = (session: Session) => session.log().map((l) => l.text);

describe('looking at the top card of your library', () => {
  const LENS = 'SYNTHETIC Seer Lens';
  const ready = (view: GameView) =>
    view.pending?.kind === 'priority' && view.stack.length === 0 && mine(view, LENS).length > 0;

  test('the viewer gets the card, the opponent seat none, and the preview can find it', async () => {
    // Both decks hold the Lens, so the opponent has its own top card in its own view.
    const { session } = await reach('synthetic-top-card', 'synthetic-top-card', bot([LENS]), ready);
    const snap = session.snapshot();
    const view = snap.view;
    const me = view.seats[view.viewer];
    const them = view.seats[1 - view.viewer];
    expect(me?.libraryTop).toBeDefined();
    expect(me?.libraryTop?.name).toBeTruthy();
    expect(them?.libraryTop).toBeUndefined();
    // Hover and pin look the card up through the same lookup as every other card.
    expect(findObject(view, me?.libraryTop?.id ?? 'o0')?.name).toBe(me?.libraryTop?.name);
    // The Lens carries the words of its ability for the preview panel.
    const lens = mine(view, LENS)[0];
    expect(snap.staticNotes?.[lens?.id ?? '']).toEqual([
      'You may look at the top card of your library any time.',
    ]);
  });
});

describe('an additional land drop', () => {
  const SCOUT = 'SYNTHETIC Wandering Scout';
  const landOption = (view: GameView) =>
    view.pending?.kind === 'priority'
      ? view.pending.options.find((o) => o.kind === 'playLand')
      : undefined;
  const ready = (view: GameView) =>
    view.pending?.kind === 'priority' &&
    view.stack.length === 0 &&
    mine(view, SCOUT).length > 0 &&
    view.seats[view.viewer]?.landsPlayedThisTurn === 1 &&
    landOption(view) !== undefined;

  test('the second land play is offered, counted and then used up', async () => {
    const { session } = await reach('synthetic-extra-land', 'swamp-forest', bot([SCOUT]), ready);
    const view = session.snapshot().view;
    const seat = view.seats[view.viewer];
    expect([seat?.landsPlayedThisTurn, seat?.landPlaysAllowed]).toEqual([1, 2]);
    const play = landOption(view);
    if (play === undefined) throw new Error('no land to play');
    const snap = await must(session, play);
    const after = snap.view.seats[snap.view.viewer];
    expect([after?.landsPlayedThisTurn, after?.landPlaysAllowed]).toEqual([2, 2]);
    expect(landOption(snap.view)).toBeUndefined();
  });
});

describe('the cost of attacking', () => {
  const GATE = 'SYNTHETIC Tax Gate';
  const gateOf = (view: GameView) =>
    view.battlefield.find((o) => o.name === GATE && o.controller !== view.viewer);
  const play = (view: GameView, d: PendingDecision): Action => bot(['Raging Goblin'])(view, d);
  // Two hasty goblins can attack, the Gate is on the battlefield and the mana covers both.
  const ready = (view: GameView) => {
    const d = view.pending;
    return (
      d?.kind === 'declareAttackers' &&
      gateOf(view) !== undefined &&
      d.candidates.length >= 2 &&
      (d.attackCosts?.[0]?.affordable ?? 0) >= 2
    );
  };

  test('the declaration lists the cost; paying asks per attacker; Cancel asks for the attackers again', async () => {
    const { session } = await reach(
      'synthetic-hasty-goblins',
      'synthetic-attack-tax',
      play,
      ready,
      40,
    );
    const view = session.snapshot().view;
    const asked = view.pending;
    if (asked?.kind !== 'declareAttackers') throw new Error('no declaration');
    const gate = gateOf(view);
    const target = asked.attackCosts?.[0]?.target;
    if (target === undefined || gate === undefined) throw new Error('no taxed target');
    expect(asked.attackCosts?.[0]?.cost).toEqual(['2']);
    const picks = asked.candidates.slice(0, 2).map((c) => ({ attacker: c.attacker, target }));
    const index = objectIndex(view);
    const [row] = taxRows(asked, picks, index, view.viewer);
    expect(row).toMatchObject({ attackers: 2, over: false, total: ['4'] });

    // The declaration is answered with the payment of the tax.
    let snap = await must(session, { kind: 'declareAttackers', attacks: picks });
    const pay = snap.view.pending;
    if (pay?.kind !== 'payMana' || pay.purpose !== 'attackTax') throw new Error('no tax payment');
    expect(pay.totalCost).toEqual(['2', '2']);
    expect(pay.attacks).toHaveLength(2);
    expect(pay.source).toBe(gate.id);
    expect(attackTaxPrompt(pay)).toBe(
      'Pay {2} per attacking creature (4 total) so these creatures can attack: tap your mana sources.',
    );
    expect(payCancelLabel(pay)).toBe('Choose other attackers');

    // Cancel changes nothing but asks for the attackers again; no undo point is left or taken.
    snap = await must(session, { kind: 'cancel' });
    expect(snap.view.pending?.kind).toBe('declareAttackers');
    expect(snap.undoDepth).toBe(0);
    const again = snap.view.pending;
    if (again?.kind !== 'declareAttackers') throw new Error('not asked again');
    expect(again.candidates.map((c) => c.attacker)).toEqual(
      asked.candidates.map((c) => c.attacker),
    );
    expect(again.attackCosts).toEqual(asked.attackCosts);

    // Paying declares the attackers and gives priority; nothing can be undone across the attack.
    snap = await must(session, { kind: 'declareAttackers', attacks: picks });
    snap = await must(session, { kind: 'payAuto' });
    expect(snap.undoDepth).toBe(0);
    expect(snap.view.pending?.kind).toBe('priority');
    expect(
      snap.view.battlefield.filter((o) => o.controller === view.viewer && o.tapped).length,
    ).toBeGreaterThanOrEqual(2);
    expect(texts(session).join('\n')).toMatch(/attack/i);
  });

  test('the Gate carries the words of its ability for the preview', async () => {
    const { session } = await reach(
      'synthetic-hasty-goblins',
      'synthetic-attack-tax',
      play,
      (view) => gateOf(view) !== undefined && view.pending?.kind === 'priority',
      40,
    );
    const snap = session.snapshot();
    const gate = gateOf(snap.view);
    expect(snap.staticNotes?.[gate?.id ?? '']).toEqual([
      "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.",
    ]);
  });
});

describe('the optional untap', () => {
  const ROD = 'SYNTHETIC Drowsy Rod';
  const LAND = 'SYNTHETIC Drowsy Land';
  const ready = (view: GameView) =>
    view.pending?.kind === 'choosePermanent' &&
    view.pending.purpose === 'untap' &&
    view.pending.legal.length >= 2;

  test('the question lists the tapped lands; leaving one tapped is logged and keeps it tapped', async () => {
    const { session } = await reach('synthetic-optional-untap', 'swamp-forest', bot([ROD]), ready);
    const view = session.snapshot().view;
    const ask = view.pending;
    if (ask?.kind !== 'choosePermanent') throw new Error('no untap question');
    expect(ask.min).toBe(0);
    expect(ask.max).toBe(ask.legal.length);
    const [first, second, ...rest] = ask.legal;
    if (first === undefined || second === undefined) throw new Error('too few');
    const stay = second;
    const snap = await must(session, {
      kind: 'choosePermanents',
      objects: [first, ...rest],
    });
    expect(texts(session).join('\n')).toContain(`You left ${LAND} tapped.`);
    const stayed = snap.view.battlefield.find((o) => o.id === stay);
    const untapped = snap.view.battlefield.find((o) => o.id === first);
    expect(stayed?.tapped).toBe(true);
    expect(untapped?.tapped).toBe(false);
    // The upkeep follows the answer; the game is not stuck on the question.
    expect(snap.view.pending?.kind).not.toBe('choosePermanent');
  });

  test('untapping everything logs nothing about staying tapped', async () => {
    const { session } = await reach('synthetic-optional-untap', 'swamp-forest', bot([ROD]), ready);
    const ask = session.snapshot().view.pending;
    if (ask?.kind !== 'choosePermanent') throw new Error('no untap question');
    const before = session.log().length;
    await must(session, { kind: 'choosePermanents', objects: ask.legal });
    expect(
      session
        .log()
        .slice(before)
        .some((l) => l.text.includes('tapped.') && l.text.includes('left')),
    ).toBe(false);
  });
});
