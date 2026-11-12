/**
 * Face-down permanents in the page (D-968): the words, the log of the host, the menu and the payment of turning a permanent face up, the notes the host sends beside the view, and
 * the lookup of the Manifest token's picture. The states are real engine states (the scenario DSL); the log lines are those `describeEvent` writes for the human seat.
 *
 * Hidden information: whatever the human is shown of the AI's face-down permanents (a log line, a note) must not name the card.
 */
import type { GameEvent, GameState, PriorityDecision, SeatId } from '@commander-arena/engine';
import { getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { definedPtNotes } from '../src/game/defined-pt';
import { describeEvent } from '../src/game/describe';
import {
  faceDownBadgeTitle,
  isFaceDownPermanent,
  isOwnFaceDown,
  realCardOf,
  turnUpLabel,
  turnUpPayPrompt,
} from '../src/game/face-down-text';
import { staticNotes } from '../src/game/static-notes';
import {
  MANIFEST_TOKEN_LOOKUP,
  MANIFEST_TOKEN_NUMBER,
  MANIFEST_TOKEN_SET,
  manifestTokenArt,
  parseManifestArt,
  resetManifestTokenArt,
} from '../src/ui/board/face-down-art';
import { menuItems } from '../src/ui/decisions/abilities';
import { payBarPrompt, payCancelLabel } from '../src/ui/decisions/payment';
import { playableObjects } from '../src/ui/decisions/priority';
import { lookupIndexFor } from './decisions-helpers';

const SELF = 'SYNTHETIC Manifest Self';
const BRUTE = 'SYNTHETIC Manifest Brute';
const LORD = 'SYNTHETIC Manifest Lord';
const FLIER = 'SYNTHETIC Manifest Flier';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

/** Seat 1 (the AI) manifests the top of its library in its turn; seat 0 is the human. */
function aiManifests(top: string): { g: ScenarioGame; before: GameState; events: GameEvent[] } {
  const g = scenario()
    .seat(0)
    .life(20)
    .battlefield('Mountain')
    .hand('Lightning Bolt')
    .library(...FILLER)
    .seat(1)
    .life(20)
    .hand(SELF)
    .battlefield('Forest', { count: 6 })
    .library(top, ...FILLER)
    .at('precombatMain', { active: 1, turn: 4 })
    .build();
  const before = g.state;
  const mark = g.mark();
  g.act(1).cast(SELF, { pay: true });
  g.passAll();
  return { g, before, events: [...g.eventsSince(mark)] };
}

const lines = (events: readonly GameEvent[], before: GameState, after: GameState, viewer: SeatId) =>
  events.flatMap((e) => {
    const d = describeEvent(e, before, after, viewer);
    return d === null ? [] : [d.text];
  });

describe('the log says a manifest without naming the card', () => {
  const { g, before, events } = aiManifests(BRUTE);

  test('the human reads that the opponent manifested the top card of their library', () => {
    const text = lines(events, before, g.state, 0);
    expect(text).toContain('Opponent manifests the top card of their library.');
    expect(text.join('\n')).not.toContain(BRUTE);
    // The permanent that came is not logged as entering by name.
    expect(text.join('\n')).not.toMatch(/library to battlefield/);
  });

  test('the player who did it reads "You manifest the top card of your library", and no card either', () => {
    const text = lines(events, before, g.state, 1);
    expect(text).toContain('You manifest the top card of your library.');
    expect(text.join('\n')).not.toContain(BRUTE);
  });

  test('a spell that targets it says "Face-down creature 1", and its death names the card (CR 708.9)', () => {
    const mark = g.mark();
    const prior = g.state;
    g.advanceTo('endOfCombat');
    g.pass(1);
    g.act(0).cast('Lightning Bolt', { targets: [BRUTE], pay: true });
    const cast = lines(g.eventsSince(mark), prior, g.state, 0).join('\n');
    expect(cast).toContain('Face-down creature 1');
    expect(cast).not.toContain(BRUTE);
    const atCast = g.state;
    const mark2 = g.mark();
    g.passAll();
    const dies = lines(g.eventsSince(mark2), atCast, g.state, 0).join('\n');
    expect(dies).toContain(BRUTE);
  });
});

describe('turning a permanent face up is logged with the card, which is public from then on', () => {
  test('the line names it', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Forest', { count: 4 })
      .battlefield(BRUTE, { faceDown: true })
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    const before = g.state;
    const mark = g.mark();
    g.act(1).turnFaceUp(BRUTE, { pay: true });
    const text = lines(g.eventsSince(mark), before, g.state, 0);
    expect(text).toContain(`Opponent turns a face-down card face up: it is ${BRUTE}.`);
  });
});

describe('the notes the host sends beside the view', () => {
  const build = (down: boolean) =>
    scenario()
      .seat(0)
      .life(20)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(LORD, down ? { faceDown: true } : {})
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a lord that is face down has no note of its rules; face up it does', () => {
    const up = build(false);
    const upNotes = staticNotes(up.state, getView(up.state, 0));
    expect(Object.keys(upNotes).length).toBeGreaterThan(0);
    const down = build(true);
    expect(staticNotes(down.state, getView(down.state, 0))).toEqual({});
    expect(definedPtNotes(down.state, getView(down.state, 0))).toEqual({});
  });
});

describe('the words', () => {
  const g = scenario()
    .seat(0)
    .life(20)
    .battlefield('Forest', { count: 4 })
    .battlefield(BRUTE, { faceDown: true })
    .library(...FILLER)
    .seat(1)
    .life(20)
    .battlefield(FLIER, { faceDown: true })
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  const mine = getView(g.state, 0).battlefield.find((o) => o.id === g.id(BRUTE));
  const theirs = getView(g.state, 0).battlefield.find((o) => o.id === g.id(FLIER));

  test('a face-down permanent is told from a face-up one, and the card is the viewer’s own only', () => {
    expect(mine && isFaceDownPermanent(mine)).toBe(true);
    expect(mine && isOwnFaceDown(mine)).toBe(true);
    expect(theirs && isFaceDownPermanent(theirs)).toBe(true);
    expect(theirs && isOwnFaceDown(theirs)).toBe(false);
    const real = mine === undefined ? null : realCardOf(mine);
    expect(real?.name).toBe(BRUTE);
    expect([real?.power, real?.toughness]).toEqual([4, 4]);
    expect(real?.faceDown).toBeUndefined();
    expect(theirs === undefined ? 'x' : realCardOf(theirs)).toBeNull();
    expect(faceDownBadgeTitle(theirs as never)).not.toContain(FLIER);
    expect(faceDownBadgeTitle(mine as never)).toContain(BRUTE);
  });

  test('the menu of the permanent offers "Turn face up {3}{G}", and the payment says what it is for', () => {
    const decision = g.state.pending as PriorityDecision;
    const turn = decision.options.find((o) => o.kind === 'turnFaceUp');
    expect(turn).toBeDefined();
    expect(playableObjects(decision).has(g.id(BRUTE))).toBe(true);
    const view = getView(g.state, 0);
    const items = menuItems(decision, g.id(BRUTE), lookupIndexFor(view.battlefield));
    expect(items.map((i) => i.label)).toEqual(['Turn face up {3}{G}']);
    expect(items[0]?.action).toEqual({ kind: 'turnFaceUp', object: g.id(BRUTE) });
    expect(turnUpLabel(mine)).toBe('Turn face up {3}{G}');
    expect(turnUpPayPrompt(['3', 'G'], 'Face-down creature 1')).toBe(
      'Pay {3}{G} to turn Face-down creature 1 face up',
    );
    // Nothing is offered for the opponent's permanent.
    expect(menuItems(decision, g.id(FLIER), lookupIndexFor(view.battlefield))).toEqual([]);
  });

  test('the payment decision is worded and cancelled like the other special actions', () => {
    const h = scenario()
      .seat(0)
      .life(20)
      .battlefield('Forest', { count: 4 })
      .battlefield(BRUTE, { faceDown: true })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    h.act(0).turnFaceUp(BRUTE);
    const d = h.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected the payment');
    expect(d.purpose).toBe('turnFaceUp');
    const prompt = payBarPrompt(d, lookupIndexFor(getView(h.state, 0).battlefield));
    expect(prompt).toBe('Pay {3}{G} to turn Face-down creature 1 face up: tap your mana sources.');
    expect(payCancelLabel(d)).toBe('Cancel');
  });
});

describe('the Manifest token picture', () => {
  const ANSWER = {
    object: 'card',
    name: 'Manifest',
    layout: 'token',
    image_uris: {
      small: 'https://cards.scryfall.io/small/front/x/y/id.jpg?1',
      normal: 'https://cards.scryfall.io/normal/front/x/y/id.jpg?1',
      art_crop: 'https://cards.scryfall.io/art_crop/front/x/y/id.jpg?1',
      large: 'https://cards.scryfall.io/large/front/x/y/id.jpg?1',
    },
  };

  test('the lookup is the card by set code and collector number (verified on 2026-11-12), and no image address is kept here', () => {
    expect(MANIFEST_TOKEN_SET).toBe('tfrf');
    expect(MANIFEST_TOKEN_NUMBER).toBe('4');
    expect(MANIFEST_TOKEN_LOOKUP).toBe('https://api.scryfall.com/cards/tfrf/4');
  });

  test('the answer gives the files the page uses, only on the image host of Scryfall', () => {
    expect(parseManifestArt(ANSWER)).toEqual({
      small: ANSWER.image_uris.small,
      normal: ANSWER.image_uris.normal,
      art_crop: ANSWER.image_uris.art_crop,
    });
    expect(parseManifestArt({ image_uris: { normal: 'https://evil.example/x.jpg' } })).toBeNull();
    expect(
      parseManifestArt({ image_uris: { normal: 'http://cards.scryfall.io/x.jpg' } }),
    ).toBeNull();
    expect(parseManifestArt({})).toBeNull();
    expect(parseManifestArt(null)).toBeNull();
    expect(parseManifestArt('x')).toBeNull();
  });

  test('it is asked once per session, and a failure is remembered (the drawn card stays)', async () => {
    resetManifestTokenArt();
    let calls = 0;
    const ok = (async (url: string) => {
      calls += 1;
      expect(url).toBe(MANIFEST_TOKEN_LOOKUP);
      return { ok: true, json: async () => ANSWER } as Response;
    }) as unknown as typeof fetch;
    expect((await manifestTokenArt(ok))?.normal).toBe(ANSWER.image_uris.normal);
    await manifestTokenArt(ok);
    expect(calls).toBe(1);

    resetManifestTokenArt();
    const down = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await manifestTokenArt(down)).toBeNull();
    expect(await manifestTokenArt(ok)).toBeNull();
    resetManifestTokenArt();
    const missing = (async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    expect(await manifestTokenArt(missing)).toBeNull();
    resetManifestTokenArt();
  });
});
