// Federation Fleet deck, group F (Temporal Tribulation): "Exile two target permanents you control. Return those cards to the battlefield under their owner's control at the beginning of the
// next end step." The cards the exile moved come back through ONE delayed triggered ability, as the text says, so they enter the battlefield together.
// Pins (rule numbers the repository's own comments already cite; the rules text is not in this worktree, so none is quoted): CR 603.7 and 603.7c (a delayed triggered ability is created by
// the effect and refers to the objects it names; one that left exile since is a new object and is not found), CR 400.7 and 400.7j (the cards that return are new objects), CR 111.8 (a token that
// was exiled has ceased to exist and does not come back), CR 110.2 (under whose control they enter: their owner's), CR 603.7e (the delayed ability belongs to the source that created it).
// The card is the SYNTHETIC "Double Flicker" of this file; the creatures are real fixtures.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const FLICKER = 'SYNTHETIC Double Flicker';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';

const flicker = singleFaceCard({
  name: FLICKER,
  manaCost: ['2', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    "Exile two target permanents you control. Return those cards to the battlefield under their owner's control at the beginning of the next end step.",
  spell: {
    targets: [
      {
        id: 't1',
        min: 2,
        max: 2,
        what: { kind: 'object', filter: { zone: 'battlefield', controller: 'you' } },
      },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: { kind: 'target', id: 't1' } },
        {
          kind: 'delayedTrigger',
          at: { step: 'endStep', whose: 'each' },
          effect: {
            kind: 'moveToZone',
            objects: { kind: 'moved' },
            to: 'battlefield',
            controller: 'owner',
          },
        },
      ],
    },
  },
});

const game = () =>
  scenario()
    .define(flicker)
    .seat(0)
    .hand(FLICKER)
    .battlefield('Island', { count: 3 })
    .battlefield(BEARS, ELVES)
    .library('Island', 'Island', 'Island')
    .seat(1)
    .library('Island', 'Island', 'Island')
    .at('precombatMain', { active: 0, turn: 1 })
    .build();

describe('the card is valid', () => {
  test('validateCard finds nothing wrong', () => {
    expect(validateCard(flicker)).toEqual([]);
  });
});

describe('one delayed ability returns every card the exile moved (CR 603.7, 603.7c)', () => {
  test('both permanents are exiled now and come back together in the end step, under their owner', () => {
    const g = game();
    g.act(0).cast(FLICKER, { targets: [{ name: BEARS }, { name: ELVES }], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ELVES, 'exile', { seat: 0 });
    // One ability for the whole group, not one for each card.
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('end');
    g.expect.stack([`${FLICKER} (ability)`]);
    g.pass();
    g.pass();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, false);
    expect(g.state.delayedTriggers).toEqual([]);
    g.expect.invariants();
  });

  test('they do not return before the end step, and new objects come back (CR 400.7)', () => {
    const g = game();
    const before = g.id(BEARS);
    g.act(0).cast(FLICKER, { targets: [{ name: BEARS }, { name: ELVES }], pay: true });
    g.pass();
    g.pass();
    g.advanceTo('endOfCombat');
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ELVES, 'exile', { seat: 0 });
    g.advanceTo('end');
    g.pass();
    g.pass();
    expect(g.id(BEARS)).not.toBe(before);
  });
});
