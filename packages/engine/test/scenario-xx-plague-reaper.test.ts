// "Each player sacrifices a creature or planeswalker of their choice. Each player who can't discards a card." (the Plaguecrafter shape).
// Pins: CR 101.4 (the players choose in turn order, the active player first, each knowing the earlier choices), CR 701.21a (each player sacrifices
// only among the permanents they control; the chosen permanents are sacrificed at the same time), CR 701.9 (a player with nothing to sacrifice chooses a card
// in hand, and the chosen cards are discarded at the same time), and that the source of the ability may be the permanent its controller sacrifices.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-player-effects.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';
import { twoSeatGame } from './two-seat-helpers';

const REAPER = 'SYNTHETIC Plague Reaper'; // enters: each player sacrifices a creature or planeswalker; each who can't discards a card
const EDICT = 'SYNTHETIC Culling Edict'; // the same, as a sorcery
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';

const discards = (g: ScenarioGame) =>
  g.eventsSince(0).flatMap((e) => (e.kind === 'discarded' ? [e.seat] : []));

describe('the cards are valid', () => {
  test.each([REAPER, EDICT])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('what a card may say', () => {
  const withEffect = (effect: unknown) => {
    const card = syntheticCard(EDICT);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...card, faces: [{ ...face, spell: { effect } }] } as typeof card;
  };
  const messages = (effect: unknown) =>
    validateCard(withEffect(effect))
      .map((m) => m.message)
      .join(' | ');
  const couldnt = { kind: 'couldntSacrificeThisWay' } as const;

  test("each player who can't needs a sacrifice before it in the same sequence", () => {
    expect(messages({ kind: 'discard', player: couldnt, count: 1 })).toMatch(
      /needs a sacrifice effect before it/,
    );
  });

  test('together goes with neither random nor hand', () => {
    const sacrifice = {
      kind: 'sacrifice',
      objects: { kind: 'choose', filter: { types: ['creature'] } },
      player: { kind: 'eachPlayer' },
    };
    const then = (discard: unknown) => ({ kind: 'sequence', effects: [sacrifice, discard] });
    expect(messages(then({ kind: 'discard', player: couldnt, count: 1, together: true }))).toBe('');
    expect(
      messages(then({ kind: 'discard', player: couldnt, count: 1, together: true, random: true })),
    ).toMatch(/together is true/);
  });
});

describe('"each player sacrifices a creature or planeswalker of their choice"', () => {
  test('each player chooses in turn order, and nothing is sacrificed until the last has chosen', () => {
    const g = twoSeatGame(
      (b) => b.hand(REAPER).battlefield('Swamp', { count: 4 }).battlefield(BEARS),
      (b) => b.battlefield(SPIDER, ELVES),
    );
    g.act(0).cast(REAPER, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS);
    // CR 101.4: seat 1 now chooses, knowing seat 0's choice, and the Bears are still on the battlefield.
    g.expect.pending('choosePermanent', 1);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.act(1).choosePermanents(ELVES);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.zone(REAPER, 'battlefield', { seat: 0 });
    // Everyone sacrificed, so nobody discards.
    expect(discards(g)).toEqual([]);
    g.expect.invariants();
  });

  test('a planeswalker may be the permanent sacrificed', () => {
    const g = twoSeatGame(
      (b) => b.hand(REAPER).battlefield('Swamp', { count: 4 }).battlefield(BEARS),
      (b) => b.battlefield(WALKER, SPIDER),
    );
    g.act(0).cast(REAPER, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.act(1).choosePermanents(WALKER);
    g.expect.zone(WALKER, 'graveyard', { seat: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('the creature itself may be the one its controller sacrifices; it is the only candidate here', () => {
    const g = twoSeatGame(
      (b) => b.hand(REAPER).battlefield('Swamp', { count: 4 }),
      (b) => b.battlefield(SPIDER),
    );
    g.act(0).cast(REAPER, { pay: true });
    g.passAll();
    // Each player has exactly one candidate: both are sacrificed without a question.
    g.expect.zone(REAPER, 'graveyard', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    expect(discards(g)).toEqual([]);
    g.expect.invariants();
  });

  test('a player with no creature or planeswalker chooses a card in hand and discards it; the others do not discard', () => {
    const g = twoSeatGame(
      (b) => b.hand(REAPER).battlefield('Swamp', { count: 4 }).battlefield(BEARS),
      (b) => b.hand('Plains', 'Island').battlefield('Mountain'),
    );
    g.act(0).cast(REAPER, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    // Seat 1 has no creature or planeswalker (a land does not count): their hand is the choice.
    g.expect.pending('chooseCards', 1);
    const d = chooseCardsDecision(g);
    expect(d.purpose).toBe('discard');
    expect(d.min).toBe(1);
    expect(d.max).toBe(1);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.act(1).chooseCards('Island');
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    g.expect.zone('Plains', 'hand', { seat: 1 });
    g.expect.handSize(0, 0);
    expect(discards(g)).toEqual([1]);
    g.expect.invariants();
  });

  test('a player who cannot sacrifice and has an empty hand discards nothing', () => {
    const g = twoSeatGame(
      (b) => b.hand(REAPER).battlefield('Swamp', { count: 4 }).battlefield(BEARS),
      (b) => b,
    );
    g.act(0).cast(REAPER, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.expect.pending('priority', 0);
    expect(discards(g)).toEqual([]);
    g.expect.invariants();
  });

  test('both players who cannot sacrifice choose in turn order, and the cards are discarded at the same time', () => {
    const g = twoSeatGame(
      (b) => b.hand(EDICT, 'Plains', 'Island').battlefield('Swamp', { count: 2 }),
      (b) => b.hand('Mountain', 'Forest'),
    );
    g.act(0).cast(EDICT, { pay: true });
    g.passAll();
    // CR 101.4: the active player first.
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Plains');
    // Seat 0 has chosen but nothing has been discarded yet; seat 1 chooses next.
    g.expect.pending('chooseCards', 1);
    g.expect.zone('Plains', 'hand', { seat: 0 });
    g.act(1).chooseCards('Forest');
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.zone('Forest', 'graveyard', { seat: 1 });
    g.expect.zone('Island', 'hand', { seat: 0 });
    g.expect.zone('Mountain', 'hand', { seat: 1 });
    expect(discards(g)).toEqual([0, 1]);
    g.expect.invariants();
  });

  test('only the player who could not sacrifice discards, whoever the active player is', () => {
    const g = twoSeatGame(
      (b) => b.hand(EDICT).battlefield('Swamp', { count: 2 }).battlefield(BEARS),
      (b) => b.hand('Mountain', 'Forest'),
    );
    g.act(0).cast(EDICT, { pay: true });
    g.passAll();
    // Seat 0 has the Bears alone and sacrifices them unasked; seat 1 has no candidate and chooses a card.
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards('Mountain');
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone('Mountain', 'graveyard', { seat: 1 });
    expect(discards(g)).toEqual([1]);
    g.expect.invariants();
  });
});
