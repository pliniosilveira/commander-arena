// "As this enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to
// the power of the other card." (Grand Larceny deck, issue 119, The Mimeoplasm): the replacement `entersAsCopy` with `exileTwoFromGraveyards`.
// Pins (rule numbers the repository's own comments already use; the CR text file was not in the worktree, so none was looked up): CR 614.12 and 707.9 (it enters as the copy: the
// questions are asked as it enters), CR 707.2 (copiable values: the card as it is in the graveyard), CR 707.9b (the counters of the exception), CR 122.6 (enters with counters),
// CR 400.7. Rulings of the card: you can't exile just one creature card; the two cards may come from one graveyard or two; you choose which one is copied and which gives the counters.
// The card is SYNTHETIC. Played on three and four seats: the cards come from the graveyards of any player.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const MIMIC = 'SYNTHETIC Graveyard Mimic';
const ANGEL = 'Serra Angel'; // 4/4 flying
const SPIDER = 'Giant Spider'; // 2/4 reach
const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

const mimic = singleFace({
  name: MIMIC,
  manaCost: ['1', 'B'],
  supertypes: ['legendary'],
  types: ['creature'],
  subtypes: ['Ooze'],
  power: 0,
  toughness: 0,
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText:
    'As this creature enters, you may exile two creature cards from graveyards. If you do, it enters as a copy of one of those cards with a number of additional +1/+1 counters on it equal to the power of the other card.',
  abilities: [
    {
      kind: 'replacement',
      replacement: {
        kind: 'entersAsCopy',
        what: { types: ['creature'], zone: 'graveyard' },
        exileTwoFromGraveyards: { counter: '+1/+1' },
        optional: true,
        duration: 'permanent',
      },
    },
  ],
});

const LANDS = ['Swamp', 'Swamp', 'Swamp'] as const;

type Build = ReturnType<typeof scenario>;

/** Seat 0 holds the card; the graveyards of the other seats (and of seat 0) are filled by `graves`. */
function game(seats: 2 | 3 | 4, graves: readonly (readonly string[])[]) {
  let b: Build = scenario({ seats }).define(mimic);
  for (let s = 0; s < seats; s++) {
    b = b.seat(s as 0 | 1 | 2 | 3).library(...LIBRARY);
    if (s === 0) b = b.hand(MIMIC).battlefield(...LANDS);
    for (const name of graves[s] ?? []) b = b.graveyard(name);
  }
  return b.seat(0).at('precombatMain').build();
}

const asked = (g: ReturnType<typeof game>) => {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent') throw new Error(`expected a question, got ${d?.kind}`);
  return d;
};

describe('the card is valid and the shapes are checked', () => {
  const withRule = (rule: Record<string, unknown>) =>
    ({
      ...mimic,
      faces: [
        {
          ...mimic.faces[0],
          abilities: [
            {
              kind: 'replacement',
              replacement: {
                kind: 'entersAsCopy',
                what: { types: ['creature'], zone: 'graveyard' },
                exileTwoFromGraveyards: { counter: '+1/+1' },
                optional: true,
                duration: 'permanent',
                ...rule,
              },
            },
          ],
        },
      ],
    }) as never;

  test('valid', () => {
    expect(validateCard(mimic)).toEqual([]);
  });

  test('refused: no zone, the copy of the own graveyard too, not optional, a copy until end of turn, no counter kind', () => {
    const issues = (rule: Record<string, unknown>) => validateCard(withRule(rule)).length;
    expect(issues({ what: { types: ['creature'] } })).toBeGreaterThan(0);
    expect(issues({ fromGraveyard: true })).toBeGreaterThan(0);
    expect(issues({ optional: undefined })).toBeGreaterThan(0);
    expect(issues({ duration: 'untilEndOfTurn' })).toBeGreaterThan(0);
    expect(issues({ exileTwoFromGraveyards: { counter: '' } })).toBeGreaterThan(0);
  });
});

describe('the copy and the counters', () => {
  test('two graveyards of three seats: the card chosen is the copy, the other gives its power as counters, both are exiled', () => {
    const g = game(3, [[BEARS], [ANGEL], [SPIDER]]);
    g.act(0).cast(MIMIC, { pay: true });
    g.passAll();
    const first = asked(g);
    expect(first.purpose).toBe('entersCopy');
    expect(first.min).toBe(0);
    expect(first.legal).toHaveLength(3);
    g.act(0).choosePermanents({ name: ANGEL, zone: 'graveyard', seat: 1 });
    const second = asked(g);
    expect(second.purpose).toBe('entersCopyOther');
    expect(second.min).toBe(1);
    expect(second.max).toBe(1);
    // The copied card is not a choice for the other one.
    expect(second.legal).toHaveLength(2);
    g.act(0).choosePermanents({ name: SPIDER, zone: 'graveyard', seat: 2 });
    // A Serra Angel (4/4 flying) with two +1/+1 counters, the power of Giant Spider (2).
    g.expect.zone(MIMIC, 'battlefield', { seat: 0 });
    g.expect.derived(MIMIC, {
      types: ['creature'],
      subtypes: ['Angel'],
      keywords: ['flying', 'vigilance'],
    });
    g.expect.pt(MIMIC, 6, 6);
    g.expect.counters(MIMIC, { '+1/+1': 2 });
    // Both cards were exiled; the third one stays where it was.
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.expect.zone(SPIDER, 'exile', { seat: 2 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the cards may come from one graveyard, and the roles may be swapped: the other choice gives another number of counters', () => {
    const g = game(2, [[], [ANGEL, SPIDER]]);
    g.act(0).cast(MIMIC, { pay: true });
    g.passAll();
    // With exactly two cards, choosing the copy leaves the other one with no choice to make: only one question.
    g.act(0).choosePermanents({ name: SPIDER, zone: 'graveyard', seat: 1 });
    expect(g.state.pending?.kind === 'choosePermanent').toBe(false);
    // A Giant Spider (2/4 reach) with four counters, the power of Serra Angel.
    g.expect.derived(MIMIC, { subtypes: ['Spider'], keywords: ['reach'] });
    g.expect.pt(MIMIC, 6, 8);
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.invariants();
  });

  test('four seats: cards of any graveyard are choices, including the controller own', () => {
    const g = game(4, [[ELVES], [], [BEARS], [ANGEL]]);
    g.act(0).cast(MIMIC, { pay: true });
    g.passAll();
    expect(asked(g).legal).toHaveLength(3);
    g.act(0).choosePermanents({ name: ELVES, zone: 'graveyard', seat: 0 });
    g.act(0).choosePermanents({ name: ANGEL, zone: 'graveyard', seat: 3 });
    g.expect.pt(MIMIC, 5, 5);
    g.expect.zone(ELVES, 'exile', { seat: 0 });
    g.expect.zone(ANGEL, 'exile', { seat: 3 });
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
  });

  test('"you may": choosing none exiles nothing and it enters as itself, a 0/0 that dies', () => {
    const g = game(3, [[BEARS], [ANGEL], []]);
    g.act(0).cast(MIMIC, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.zone(MIMIC, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
  });

  test('"you can\'t choose to exile just one creature card": with one creature card in all graveyards nothing is asked', () => {
    const g = game(3, [[], [ANGEL], []]);
    g.act(0).cast(MIMIC, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind === 'choosePermanent').toBe(false);
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(MIMIC, 'graveyard', { seat: 0 });
  });

  test('a card that is not a creature card is not a choice', () => {
    const g = game(3, [['Murder'], [ANGEL], [BEARS]]);
    g.act(0).cast(MIMIC, { pay: true });
    g.passAll();
    const d = asked(g);
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents({ name: BEARS, zone: 'graveyard', seat: 2 });
    g.expect.derived(MIMIC, { subtypes: ['Bear'] });
    g.expect.pt(MIMIC, 6, 6);
  });
});
