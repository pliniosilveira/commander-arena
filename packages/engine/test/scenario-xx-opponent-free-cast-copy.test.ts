// Federation Fleet deck, group F (Cmdr. Troi, Outgoing Empath): "{T}: Target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy
// that spell. You may choose new targets for the copy. If they don't, you draw a card." The player the effect names casts from their own hand during the resolution, the cast spell is
// what the next instruction copies (the copy is the controller's), and what "if they do / if they don't" reads is whether a spell was cast.
// Pins (rule numbers the repository's own comments already cite; the rules text is not in this worktree, so none is quoted): CR 115.1 (the target is chosen as the ability is put on the
// stack; "whose turn it is" leaves no legal target on the controller's own turn), CR 500.1 (the active player), CR 608.2g and 118.9 (the player casts it during the resolution without
// paying its mana cost; no timing restriction; no player receives priority), CR 608.2c ("if they do" reads whether a spell was cast), CR 707.10 and 707.10c (the copy is put on the stack
// under the control of the player who copies it, who may choose new targets), CR 400.7 (a spell cast is an object of its own).
// Card: the SYNTHETIC "Test Empath" of this file; the spells are real fixtures.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { chooseCardsDecision } from './pending-helpers';

const EMPATH = 'SYNTHETIC Test Empath';
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';

const empath = singleFaceCard({
  name: EMPATH,
  manaCost: ['2', 'U', 'R'],
  types: ['creature'],
  colors: ['U', 'R'],
  colorIdentity: ['U', 'R'],
  power: 3,
  toughness: 3,
  oracleText:
    "{T}: Target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, you copy that spell. You may choose new targets for the copy. If they don't, you draw a card.",
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'tap' }],
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponentWhoseTurn' } }],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'castFree',
            objects: { kind: 'choose', filter: { zone: 'hand' } },
            player: { kind: 'target', id: 't1' },
            remember: true,
          },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: { kind: 'copySpell', spell: { kind: 'moved' }, newTargets: 'may' },
            else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          },
        ],
      },
    },
  ],
});

/** Seat 1's precombat main phase: seat 1 has a Bolt in hand; seat 0 has the Empath (untapped) and cards to draw. */
const board = (hand1: readonly string[] = [BOLT]) =>
  scenario()
    .define(empath)
    .seat(0)
    .life(20)
    .battlefield(EMPATH)
    .library('Island', 'Island', 'Island')
    .seat(1)
    .life(20)
    .hand(...hand1)
    .library('Island', 'Island', 'Island')
    .at('precombatMain', { active: 1, priority: 0 })
    .build();

describe('the card is valid', () => {
  test('validateCard finds nothing wrong', () => {
    expect(validateCard(empath)).toEqual([]);
  });
});

describe('"target opponent whose turn it is" (CR 115.1, 500.1)', () => {
  test('on the turn of the opponent the ability can be activated, targeting them', () => {
    const g = board();
    expect(g.act(0).try.activate(EMPATH).ok).toBe(true);
  });

  test("on the controller's own turn there is no legal target: the ability cannot be activated", () => {
    const g = scenario()
      .define(empath)
      .seat(0)
      .battlefield(EMPATH)
      .library('Island', 'Island')
      .seat(1)
      .hand(BOLT)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    expect(g.act(0).try.activate(EMPATH).ok).toBe(false);
  });
});

describe('the opponent casts a spell from their hand for free, and the controller copies it (CR 608.2g, 707.10)', () => {
  test("the spell is offered from the opponent's own hand, cast without paying, and copied for the controller", () => {
    const g = board();
    g.act(0).activate(EMPATH, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.pending('chooseCards', 1);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('cast');
    expect(d.legal).toEqual([g.id({ name: BOLT, zone: 'hand' })]);
    g.act(1).chooseCards(BOLT);
    // They cast the Bolt, choosing its target; no mana is paid.
    g.act(1).chooseTargets({ player: 0 });
    // The controller of the ability copies it and may choose new targets for the copy.
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    // Two Bolts are on the stack: the copy (controlled by seat 0) above the original (seat 1's).
    g.passAll();
    g.expect.life(0, 17);
    g.expect.life(1, 17);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('if they cast nothing, the controller draws a card', () => {
    const g = board();
    g.act(0).activate(EMPATH, { targets: [{ player: 1 }] });
    g.passAll();
    g.act(1).chooseCards();
    g.expect.handSize(0, 1);
    g.expect.zone(BOLT, 'hand', { seat: 1 });
    g.expect.invariants();
  });

  test('with no spell they can cast (only a land in hand) nobody is asked and the controller draws', () => {
    const g = board(['Island']);
    g.act(0).activate(EMPATH, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('a creature spell is copied too: the copy is a token (CR 707.10f) under the controller', () => {
    const g = board([BEARS]);
    g.act(0).activate(EMPATH, { targets: [{ player: 1 }] });
    g.passAll();
    g.act(1).chooseCards(BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});
