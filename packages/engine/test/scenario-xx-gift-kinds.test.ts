// Gift, the Peace Offering deck (issue 112): the gifts "an Octopus" (CR 702.174i) and "an extra turn" (CR 702.174g), and "whenever you give a gift" (CR 702.174c:
// a player gives a gift as an instant or sorcery spell they control whose gift cost was paid resolves, or as the gift triggered ability of a permanent they control
// resolves). Also "create a token that's a copy of target creature token that entered the battlefield this turn" at each end step (CR 707.2, 400.7), the Octopus
// being the token copied. Cards are SYNTHETIC, defined here; none is a real card.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type Ability, type CardDefinition, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const OCTO = 'SYNTHETIC Octopus Gifter';
const TURN = 'SYNTHETIC Turn Gift';
const WATCHER = 'SYNTHETIC Gift Watcher';
const RIVAL = 'SYNTHETIC Rival Gift Watcher';
const COPIER = 'SYNTHETIC Token Copier';

const gift = (kind: 'octopus' | 'extraTurn'): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'gift', gift: kind },
});

const octo: CardDefinition = singleFace({
  name: OCTO,
  manaCost: ['2', 'U'],
  types: ['creature'],
  subtypes: ['Frog'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 3,
  toughness: 3,
  oracleText: 'Gift an Octopus',
  abilities: [gift('octopus')],
});

const turn: CardDefinition = singleFace({
  name: TURN,
  manaCost: ['1', 'U'],
  types: ['sorcery'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Gift an extra turn. You gain 2 life.',
  abilities: [gift('extraTurn')],
  spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 2 } },
});

const watcher: CardDefinition = singleFace({
  name: WATCHER,
  manaCost: ['1', 'W'],
  types: ['creature'],
  subtypes: ['Hamster'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 3,
  oracleText: 'Whenever you give a gift, draw a card.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'givesGift', who: 'you' },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ],
});

const rival: CardDefinition = singleFace({
  name: RIVAL,
  manaCost: ['2'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: 'Whenever an opponent gives a gift, you gain 3 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'givesGift', who: 'opponent' },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
    },
  ],
});

const copier: CardDefinition = singleFace({
  name: COPIER,
  manaCost: ['3'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText:
    "At the beginning of each end step, create a token that's a copy of target creature token that entered the battlefield this turn.",
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'endStep', whose: 'each' },
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: {
              zone: 'battlefield',
              types: ['creature'],
              token: true,
              enteredThisTurn: true,
            },
          },
        },
      ],
      effect: {
        kind: 'createToken',
        token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
        count: 1,
      },
    },
  ],
});

const VANISH = 'SYNTHETIC Vanishing Gift';
const vanish: CardDefinition = singleFace({
  name: VANISH,
  manaCost: ['1', 'U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Gift an extra turn. All permanents you control phase out.',
  abilities: [gift('extraTurn')],
  spell: {
    effect: {
      kind: 'phaseOut',
      objects: { kind: 'each', filter: { zone: 'battlefield', controller: 'you' } },
    },
  },
});

const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

/** Seat 0 has `mine` on the battlefield, four Islands and `hand`; each other seat has `theirs` and a library. */
function game(
  seats: 2 | 3,
  hand: readonly string[],
  mine: readonly string[] = [],
  theirs: readonly string[] = [],
): ScenarioGame {
  let b = scenario({ seats })
    .define(octo)
    .define(turn)
    .define(watcher)
    .define(rival)
    .define(copier)
    .define(vanish)
    .seat(0)
    .life(20)
    .library(...FILLER)
    .hand(...hand)
    .battlefield('Island', { count: 4 });
  for (const card of mine) b = b.battlefield(card);
  for (let seat = 1; seat < seats; seat += 1) {
    b = b
      .seat(seat)
      .life(20)
      .library(...FILLER);
    for (const card of theirs) b = b.battlefield(card);
  }
  return b.at('precombatMain', { active: 0, priority: 0 }).build();
}

describe('the cards are valid', () => {
  test.each([octo, turn, watcher, rival, copier, vanish])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('a card cannot write the gift ability itself: it is derived from the keyword', () => {
    const forged = singleFace({
      name: 'SYNTHETIC Forged Gift',
      manaCost: ['1', 'W'],
      types: ['creature'],
      colors: ['W'],
      colorIdentity: ['W'],
      power: 2,
      toughness: 3,
      oracleText: 'When this creature enters, draw a card.',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
          giftAbility: true,
        },
      ],
    });
    expect(validateCard(forged).map((i) => i.path)).toContainEqual(
      expect.stringContaining('giftAbility'),
    );
  });
});

describe('Gift an Octopus (CR 702.174i)', () => {
  test('promised: the chosen opponent creates an 8/8 blue Octopus creature token as the permanent enters', () => {
    const g = game(2, [OCTO]);
    g.act(0).cast(OCTO, { gift: true, pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone('Octopus', 'battlefield', { seat: 1 });
    g.expect.pt('Octopus', 8, 8);
    expect(g.object('Octopus').token).toBeDefined();
    g.expect.derived('Octopus', { colors: ['U'], subtypes: ['Octopus'] });
    g.expect.zone(OCTO, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('not promised: nobody gets an Octopus', () => {
    const g = game(2, [OCTO]);
    g.act(0).cast(OCTO, { gift: false, pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.noObject('Octopus');
  });

  test('3 seats: declining the first opponent and promising the second gives the second the Octopus', () => {
    const g = game(3, [OCTO]);
    g.act(0).cast(OCTO).gift(false).gift(true).pay();
    g.passAll();
    g.passAll();
    g.expect.zone('Octopus', 'battlefield', { seat: 2, count: 1 });
    g.expect.noObject('Octopus', { seat: 1 });
  });
});

describe('Gift an extra turn (CR 702.174g, 500.7)', () => {
  test('promised: the chosen opponent takes an extra turn after this one, before the gift spell is done', () => {
    const g = game(3, [TURN]);
    g.act(0).cast(TURN).gift(false).gift(true).pay();
    g.passAll();
    g.expect.life(0, 22);
    expect(g.state.extraTurns).toEqual([2]);
    // The extra turn of seat 2 comes right after this one; then the turn order goes on from seat 0 (CR 500.7).
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 2 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
  });

  test('not promised: no extra turn', () => {
    const g = game(2, [TURN]);
    g.act(0).cast(TURN, { gift: false, pay: true });
    g.passAll();
    expect(g.state.extraTurns ?? []).toEqual([]);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
  });
});

describe('"Whenever you give a gift" (CR 702.174c)', () => {
  test('a permanent: the gift is given as its gift ability resolves, and the watcher draws', () => {
    const g = game(2, [OCTO], [WATCHER]);
    g.act(0).cast(OCTO, { gift: true, pay: true });
    g.pass();
    g.pass();
    // The creature resolved and its gift ability is on the stack: nothing is given yet.
    g.expect.zone(OCTO, 'battlefield', { seat: 0 });
    expect(g.state.stack).toHaveLength(1);
    g.expect.noEvent({ kind: 'giftGiven' });
    g.passAll();
    g.expect.zone('Octopus', 'battlefield', { seat: 1 });
    g.expect.eventLog([{ kind: 'giftGiven', seat: 0 }]);
    g.expect.handSize(0, 1);
    g.expect.stack([]);
  });

  test('an instant or sorcery: the gift is given as the spell resolves, and the watcher draws', () => {
    const g = game(2, [TURN], [WATCHER]);
    g.act(0).cast(TURN, { gift: true, pay: true });
    g.passAll();
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(0, 22);
  });

  test('the watcher phases out later in the same resolution: it saw the gift first, and still draws (CR 702.26d, 603.2)', () => {
    const g = game(2, [VANISH], [WATCHER]);
    g.act(0).cast(VANISH, { gift: true, pay: true });
    g.passAll();
    g.expect.zone(WATCHER, 'phased', { seat: 0 });
    g.expect.eventLog([{ kind: 'giftGiven', seat: 0 }, { kind: 'phasedOut' }]);
    g.expect.handSize(0, 1);
  });

  test('no gift promised, no gift given: the watcher does not trigger', () => {
    const g = game(2, [OCTO, TURN], [WATCHER]);
    g.act(0).cast(TURN, { gift: false, pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.handSize(0, 1);
    g.expect.noEvent({ kind: 'giftGiven' });
  });

  test('3 seats: "an opponent gives a gift" triggers for each opponent of the giver, "you give" only for the giver', () => {
    const g = game(3, [OCTO], [WATCHER], [RIVAL, WATCHER]);
    g.act(0).cast(OCTO).gift(true).pay();
    g.passAll();
    g.passAll();
    // Seat 0's watcher and the rival watchers of seats 1 and 2 trigger; the watchers of seats 1 and 2 do not.
    g.passAll();
    g.passAll();
    g.passAll();
    g.expect.stack([]);
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 0);
    g.expect.handSize(2, 0);
    g.expect.life(1, 23);
    g.expect.life(2, 23);
  });
});

describe('a copy of a creature token that entered this turn, at each end step (CR 707.2, 400.7)', () => {
  test('the Octopus the opponent got this turn is copied for the controller of the ability', () => {
    const g = game(2, [OCTO], [COPIER]);
    g.act(0).cast(OCTO, { gift: true, pay: true });
    g.passAll();
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Octopus', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Octopus', 'battlefield', { seat: 1, count: 1 });
    g.expect.pt({ name: 'Octopus', seat: 0 }, 8, 8);
  });

  test('a token that entered on an earlier turn is not a legal target: the ability is removed', () => {
    const g = game(2, [OCTO], [COPIER]);
    g.act(0).cast(OCTO, { gift: true, pay: true });
    g.passAll();
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.advanceTo('end', { turn: 'next' });
    g.passAll();
    g.expect.zone('Octopus', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Octopus', 'battlefield', { seat: 1, count: 1 });
  });
});
