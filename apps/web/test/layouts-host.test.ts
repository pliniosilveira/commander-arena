/**
 * Split, Adventure, modal double-faced and transforming cards (CR 709, 715, 712) through the game
 * host with the hidden SYNTHETIC deck `synthetic-layouts`: the face chooser's items and the action
 * a click sends, each half of a split card, an Adventure and then the creature from exile, a
 * back-face land (and the shock question that keeps its face), a transform on upkeep, the log
 * lines and Undo. Seeds are searched, not fixed.
 */
import type { GameState } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';
import { describeEvent } from '../src/game/describe';
import type { GameHost } from '../src/game/host';
import type { Snapshot } from '../src/game/protocol';
import { clickOutcome } from '../src/ui/decisions/priority';
import {
  adventureCards,
  basicLandBot,
  clickOn,
  finishCast,
  indexOf,
  inHand,
  layoutsBot,
  must,
  mustPriority,
  offers,
  offersOnly,
  optionsFor,
  priorityOf,
  resolveAll,
  type Session,
  searchLayouts,
  startHost,
} from './layouts-decks';
import { pressButton } from './mana-decks';

// Each test searches seeds for its situation; a loaded machine needs more than 5 seconds.
vi.setConfig({ testTimeout: 60_000 });

type Reached = { session: Session & { host: GameHost }; seed: number };

async function reach(
  accept: Parameters<typeof searchLayouts>[1],
  bot: Parameters<typeof searchLayouts>[2] = { bot: basicLandBot },
): Promise<Reached> {
  const reached = await searchLayouts(startHost, accept, bot);
  if (reached === null) throw new Error('no seed reaches the situation');
  return reached as Reached;
}

const texts = (snap: Snapshot) => snap.log.map((l) => l.text);
const viewOf = (session: Session) => session.snapshot().view;

describe('a split card', () => {
  const both = offers('Study // Zap', 'castSpell 0', 'castSpell 1');

  test('a click asks which half, labelled from the faces; the options carry their face', async () => {
    const { session } = await reach(both);
    const view = viewOf(session);
    const card = inHand(view, 'Study // Zap');
    expect(card.layout).toBe('split');
    expect(optionsFor(view, 'Study // Zap')).toEqual([
      { kind: 'castSpell', object: card.id, face: 0 },
      { kind: 'castSpell', object: card.id, face: 1 },
    ]);
    const outcome = clickOutcome(mustPriority(view), card.id, indexOf(view));
    if (outcome.kind !== 'menu') throw new Error('expected a menu');
    expect(outcome.items.map((i) => i.label)).toEqual(['Cast Study', 'Cast Zap']);
    expect(outcome.items.map((i) => i.detail)).toEqual(['{1}{U} · Sorcery', '{R} · Instant']);
    expect(outcome.items.map((i) => i.action)).toEqual([
      { kind: 'castSpell', object: card.id, face: 0 },
      { kind: 'castSpell', object: card.id, face: 1 },
    ]);
    // Through the page's model: the click opens the chooser and sends nothing yet.
    expect(clickOn(view, card.id)).toEqual({ acts: [], chooser: [card.id] });
  });

  test('the second half: logged by its own name, on the stack as that half, then the card goes to the graveyard', async () => {
    const { session } = await reach(both);
    const card = inHand(viewOf(session), 'Study // Zap');
    const life = viewOf(session).seats[1]?.life ?? 0;
    const asked = await must(session, { kind: 'castSpell', object: card.id, face: 1 });
    const cast = asked.view.pending?.kind === 'payMana' ? await finishCast(session) : asked;
    expect(texts(cast)).toContain('You cast Zap.');
    expect(texts(cast).join('\n')).not.toContain('//');
    const spell = cast.view.stack[0];
    expect(spell?.name).toBe('Zap');
    expect(spell?.face).toBe(1);
    expect(spell?.layout).toBe('split');
    // Both halves stay in the view's `faces`, whichever is up.
    expect(spell?.faces?.map((f) => f.name)).toEqual(['Study', 'Zap']);
    const done = await resolveAll(session);
    expect(done.view.seats[1]?.life).toBe(life - 1);
    const grave = done.view.seats[0]?.graveyard.find((o) => o.name === 'Study // Zap');
    expect(grave?.face).toBe(0);
  });

  test('the first half is cast the same way and draws two cards', async () => {
    const { session } = await reach(both);
    const card = inHand(viewOf(session), 'Study // Zap');
    const hand = viewOf(session).seats[0]?.handCount ?? 0;
    await must(session, { kind: 'castSpell', object: card.id, face: 0 });
    const cast = await finishCast(session);
    expect(texts(cast)).toContain('You cast Study.');
    expect(cast.view.stack[0]?.name).toBe('Study');
    const done = await resolveAll(session);
    expect(done.view.seats[0]?.handCount).toBe(hand - 1 + 2);
  });

  test('the cast is undoable like any cast: the card is back in the hand with both options', async () => {
    const { session } = await reach(both);
    const card = inHand(viewOf(session), 'Study // Zap');
    const before = session.snapshot().undoDepth;
    await must(session, { kind: 'castSpell', object: card.id, face: 1 });
    const cast = await finishCast(session);
    expect(cast.undoDepth).toBeGreaterThan(before);
    // Each step of the cast (the cast, the payment) is its own undo point, as for any cast.
    let back = cast;
    for (let i = 0; i < 4 && back.undoDepth > before; i += 1) {
      back = await session.host.undo();
      expect(back.error).toBeNull();
    }
    expect(back.view.stack).toEqual([]);
    expect(optionsFor(back.view, 'Study // Zap').map((o) => o.face)).toEqual([0, 1]);
  });

  test('a half with no legal target is not offered, so a click casts the other half at once', async () => {
    // Singe needs a creature to hit and none is on the battlefield early: only Mend is listed.
    const { session } = await reach(offersOnly('Singe // Mend', 'castSpell 1'));
    const view = viewOf(session);
    const card = inHand(view, 'Singe // Mend');
    expect(clickOn(view, card.id)).toEqual({
      acts: [{ kind: 'castSpell', object: card.id, face: 1 }],
      chooser: [],
    });
  });
});

describe('an Adventure card', () => {
  const adventure = offers('Wise Owl', 'castSpell 0', 'castSpell 1');

  test('the chooser lists the creature and the Adventure, the Adventure marked', async () => {
    const { session } = await reach(adventure);
    const view = viewOf(session);
    const card = inHand(view, 'Wise Owl');
    expect(card.layout).toBe('adventure');
    const outcome = clickOutcome(mustPriority(view), card.id, indexOf(view));
    if (outcome.kind !== 'menu') throw new Error('expected a menu');
    expect(outcome.items.map((i) => i.label)).toEqual(['Cast Wise Owl', 'Cast Peek (Adventure)']);
    expect(outcome.items[1]?.detail).toBe('{U} · Sorcery — Adventure');
    expect(outcome.items[1]?.action).toEqual({ kind: 'castSpell', object: card.id, face: 1 });
  });

  test('Peek, then the owl from exile: "goes on an adventure", the exile click path, the cast', async () => {
    const { session } = await reach(adventure);
    const card = inHand(viewOf(session), 'Wise Owl');
    const hand = viewOf(session).seats[0]?.handCount ?? 0;
    await must(session, { kind: 'castSpell', object: card.id, face: 1 });
    const cast = await finishCast(session);
    expect(texts(cast)).toContain('You cast Peek.');
    expect(cast.view.stack[0]?.name).toBe('Peek');
    expect(cast.view.stack[0]?.face).toBe(1);
    const done = await resolveAll(session);
    expect(done.view.seats[0]?.handCount).toBe(hand - 1 + 1);
    // The card went to exile "on an Adventure" and the log says so, by the creature's name.
    const [owl] = adventureCards(done.view);
    expect(owl?.name).toBe('Wise Owl');
    expect(owl?.zone).toBe('exile');
    expect(session.log().map((l) => l.text)).toContain('Wise Owl goes on an adventure.');
    expect(
      session
        .log()
        .map((l) => l.text)
        .join('\n'),
    ).not.toContain('Wise Owl goes to the exile');

    // Play on (lands only) until the owl can be cast from exile: it costs {2}{U}.
    let snap = done;
    for (let i = 0; i < 300; i += 1) {
      const view = snap.view;
      if (view.pending === null || view.result !== null) break;
      const priority = priorityOf(view);
      if (
        view.pending.seat === view.viewer &&
        priority?.options.some((o) => o.kind === 'castSpell' && o.object === owl?.id)
      ) {
        break;
      }
      snap = await must(session, basicLandBot(view, view.pending));
    }
    if (owl === undefined) throw new Error('no owl');
    const priority = mustPriority(snap.view);
    const castable = priority.options.filter((o) => o.kind === 'castSpell' && o.object === owl.id);
    // From exile only the creature (face 0) is listed, never the Adventure again (CR 715.3d).
    expect(castable).toEqual([{ kind: 'castSpell', object: owl.id, face: 0 }]);
    // One option: a click sends the cast at once, with the face.
    expect(clickOn(snap.view, owl.id).acts).toEqual([
      { kind: 'castSpell', object: owl.id, face: 0 },
    ]);
    await must(session, { kind: 'castSpell', object: owl.id, face: 0 });
    const owlCast = await finishCast(session);
    expect(texts(owlCast)).toContain('You cast Wise Owl.');
    const resolved = await resolveAll(session);
    expect(adventureCards(resolved.view)).toEqual([]);
    const bird = resolved.view.battlefield.find((o) => o.name === 'Wise Owl');
    expect(bird?.face).toBe(0);
    expect(bird?.keywords).toContain('flying');
    expect(bird?.onAdventure).toBeUndefined();
  });
});

describe('a modal double-faced card', () => {
  test('a back-face land is one option: a click plays it with its face, the log names the land', async () => {
    const { session } = await reach(offersOnly('Ridge Drake', 'playLand 1'));
    const view = viewOf(session);
    const card = inHand(view, 'Ridge Drake');
    expect(card.layout).toBe('modal_dfc');
    expect(card.faces?.map((f) => f.name)).toEqual(['Ridge Drake', 'Ridge Pass']);
    // Not enough mana for the creature yet: the land is the only option, so the click plays it.
    expect(optionsFor(view, 'Ridge Drake')).toEqual([
      { kind: 'playLand', object: card.id, face: 1 },
    ]);
    expect(clickOn(view, card.id).acts).toEqual([{ kind: 'playLand', object: card.id, face: 1 }]);
    const played = await must(session, { kind: 'playLand', object: card.id, face: 1 });
    expect(texts(played)).toContain('You play Ridge Pass.');
    const land = played.view.battlefield.find((o) => o.name === 'Ridge Pass');
    expect(land?.face).toBe(1);
    expect(land?.types).toEqual(['land']);
    expect(land?.faces?.[0]?.name).toBe('Ridge Drake');
  });

  test('a creature and a land face both listed: the chooser has "Cast" and "Play", each from its face', async () => {
    const { session } = await reach(offers('Ridge Drake', 'castSpell 0', 'playLand 1'), {
      bot: layoutsBot,
    });
    const view = viewOf(session);
    const card = inHand(view, 'Ridge Drake');
    const outcome = clickOutcome(mustPriority(view), card.id, indexOf(view));
    if (outcome.kind !== 'menu') throw new Error('expected a menu');
    // The items follow the engine's order of options; each is worded from its own face.
    expect(outcome.items.map((i) => i.label)).toEqual(['Play Ridge Pass', 'Cast Ridge Drake']);
    expect(outcome.items.map((i) => i.detail)).toEqual(['Land', '{2}{R} · Creature — Dragon']);
    expect(outcome.items[0]?.action).toEqual({ kind: 'playLand', object: card.id, face: 1 });
    expect(outcome.items[1]?.action).toEqual({ kind: 'castSpell', object: card.id, face: 0 });
  });

  test("the shock-land face keeps its face through the question: Pay and Don't pay both end as Shock Pass", async () => {
    const { session } = await reach(offers('Zeal Charm', 'playLand 1'));
    const card = inHand(viewOf(session), 'Zeal Charm');
    await must(session, { kind: 'playLand', object: card.id, face: 1 });
    const asked = session.snapshot();
    const pending = asked.view.pending;
    if (pending?.kind !== 'confirmOptional') throw new Error('expected the shock question');
    expect(pending.face).toBe(1);
    // The answer carries no face of its own: the engine keeps the one the question has.
    expect(pressButton(asked.view, 'Pay')).toEqual({ kind: 'acceptOptional' });
    expect(pressButton(asked.view, "Don't pay")).toEqual({ kind: 'declineOptional' });
    const life = asked.view.seats[0]?.life ?? 0;
    const paid = await must(session, { kind: 'acceptOptional' });
    const land = paid.view.battlefield.find((o) => o.name === 'Shock Pass');
    expect(land?.face).toBe(1);
    expect(land?.tapped).toBe(false);
    expect(paid.view.seats[0]?.life).toBe(life - 2);
    expect(session.log().map((l) => l.text)).toContain('You play Shock Pass.');
  });

  test('declining enters it tapped, still as the back face', async () => {
    const { session } = await reach(offers('Zeal Charm', 'playLand 1'));
    const card = inHand(viewOf(session), 'Zeal Charm');
    await must(session, { kind: 'playLand', object: card.id, face: 1 });
    const declined = await must(session, { kind: 'declineOptional' });
    const land = declined.view.battlefield.find((o) => o.name === 'Shock Pass');
    expect(land?.face).toBe(1);
    expect(land?.tapped).toBe(true);
  });

  test('a land played from the back face is undoable like any land', async () => {
    const { session } = await reach(offersOnly('Ridge Drake', 'playLand 1'));
    const card = inHand(viewOf(session), 'Ridge Drake');
    await must(session, { kind: 'playLand', object: card.id, face: 1 });
    const back = await session.host.undo();
    expect(back.error).toBeNull();
    expect(inHand(back.view, 'Ridge Drake').id).toBe(card.id);
    expect(back.view.battlefield.some((o) => o.name === 'Ridge Pass')).toBe(false);
  });
});

describe('a transforming card', () => {
  test('cast as its front face (no face in the option), it transforms at the next upkeep and the view follows', async () => {
    const { session } = await reach(offers('Moon Cub', 'castSpell 0'));
    const view = viewOf(session);
    const card = inHand(view, 'Moon Cub');
    expect(card.layout).toBe('transform');
    // A transforming card's back face is never cast: its option has no `face` and one option
    // means a click casts at once.
    expect(optionsFor(view, 'Moon Cub')).toEqual([{ kind: 'castSpell', object: card.id }]);
    expect(clickOn(view, card.id).acts).toEqual([{ kind: 'castSpell', object: card.id }]);
    await must(session, { kind: 'castSpell', object: card.id });
    await finishCast(session);
    const settled = await resolveAll(session);
    const cub = settled.view.battlefield.find((o) => o.name === 'Moon Cub');
    expect(cub?.face).toBe(0);
    expect(cub?.power).toBe(2);

    // Pass to the next upkeep of ours: the trigger resolves and the permanent turns over.
    let snap = settled;
    for (let i = 0; i < 400; i += 1) {
      const view = snap.view;
      if (view.pending === null || view.result !== null) break;
      if (view.battlefield.some((o) => o.name === 'Moon Beast')) break;
      snap = await must(session, layoutsBot(view, view.pending));
    }
    const beast = snap.view.battlefield.find((o) => o.name === 'Moon Beast');
    expect(beast?.face).toBe(1);
    expect(beast?.layout).toBe('transform');
    expect(beast?.power).toBe(4);
    expect(beast?.keywords).toContain('trample');
    expect(beast?.oracleText).toContain('Trample');
    expect(beast?.faces?.map((f) => f.name)).toEqual(['Moon Cub', 'Moon Beast']);
    // The same permanent: no second object, and the front face is not on the board any more.
    expect(snap.view.battlefield.some((o) => o.name === 'Moon Cub')).toBe(false);
    expect(beast?.id).toBe(cub?.id);
  });
});

describe('log wording', () => {
  // A hand-made state: a split card (o1 on the stack as its second half, o2 in the graveyard), an
  // Adventure that has just been exiled (o3), a transformed permanent (o4) and a land played
  // as the back face (o5).
  const state = (): GameState => {
    const faces = (a: string, b: string) => [{ name: a }, { name: b }];
    return {
      objects: {
        o1: { card: 'c1', token: null, stack: null, zone: 'stack', face: 1 },
        o2: { card: 'c1', token: null, stack: null, zone: 'graveyard', face: 0 },
        o3: { card: 'c2', token: null, stack: null, zone: 'exile', face: 0, onAdventure: true },
        o4: { card: 'c3', token: null, stack: null, zone: 'battlefield', face: 1 },
        o5: { card: 'c4', token: null, stack: null, zone: 'battlefield', face: 1 },
      },
      cards: {
        c1: { definition: 'd1' },
        c2: { definition: 'd2' },
        c3: { definition: 'd3' },
        c4: { definition: 'd4' },
      },
      definitions: {
        d1: { name: 'SYNTHETIC Study // Zap', layout: 'split', faces: faces('Study', 'Zap') },
        d2: {
          name: 'SYNTHETIC Wise Owl // Peek',
          layout: 'adventure',
          faces: faces('Wise Owl', 'Peek'),
        },
        d3: {
          name: 'SYNTHETIC Moon Cub // Moon Beast',
          layout: 'transform',
          faces: faces('Moon Cub', 'Moon Beast'),
        },
        d4: {
          name: 'SYNTHETIC Ridge Drake // Ridge Pass',
          layout: 'modal_dfc',
          faces: faces('Ridge Drake', 'Ridge Pass'),
        },
      },
      lki: {},
      pending: null,
    } as unknown as GameState;
  };
  const line = (event: object, seat = 0) => describeEvent(event as never, state(), state(), seat);
  const cast = (seat: number, object: string, face?: number) => ({
    kind: 'spellCast',
    seat,
    object,
    fromZone: 'hand',
    commanderTax: 0,
    ...(face === undefined ? {} : { face }),
  });

  test('a cast names the face cast, never "A // B"', () => {
    expect(line(cast(0, 'o1', 1))?.text).toBe('You cast Zap.');
    expect(line(cast(1, 'o1', 1))?.text).toBe('Opponent casts Zap.');
    // No face in the event is face 0: the first half or the creature.
    expect(line(cast(0, 'o2'))?.text).toBe('You cast Study.');
    expect(line(cast(0, 'o3'))?.text).toBe('You cast Wise Owl.');
    expect(line({ ...cast(0, 'o1', 1), kicked: true })?.text).toBe('You cast Zap, kicked.');
  });

  test('a land played from the back face names that face', () => {
    expect(line({ kind: 'landPlayed', seat: 0, object: 'o5', face: 1 })?.text).toBe(
      'You play Ridge Pass.',
    );
    expect(line({ kind: 'landPlayed', seat: 1, object: 'o5', face: 1 })?.text).toBe(
      'Opponent plays Ridge Pass.',
    );
  });

  test('an Adventure that is exiled "goes on an adventure"; an ordinary exile keeps the generic line', () => {
    const exiled = (to: string) => ({
      kind: 'zoneChanged',
      card: 'c2',
      from: 'o9',
      to,
      fromZone: 'stack',
      toZone: 'exile',
    });
    expect(line(exiled('o3'))?.text).toBe('Wise Owl goes on an adventure.');
    expect(line({ ...exiled('o2'), fromZone: 'hand' })?.text).toBe(
      'Study // Zap goes to the exile.',
    );
  });

  test('a transformed permanent and a split card elsewhere are named as the view names them', () => {
    expect(line({ kind: 'tapped', object: 'o4' })?.text).toBe('Moon Beast taps.');
    expect(
      line({
        kind: 'zoneChanged',
        card: 'c3',
        from: 'o4',
        to: 'o4',
        fromZone: 'battlefield',
        toZone: 'graveyard',
      })?.text,
    ).toBe('Moon Beast goes to the graveyard.');
    expect(
      line({
        kind: 'zoneChanged',
        card: 'c1',
        from: 'o1',
        to: 'o2',
        fromZone: 'hand',
        toZone: 'graveyard',
      })?.text,
    ).toBe('Study // Zap goes to the graveyard.');
  });
});
