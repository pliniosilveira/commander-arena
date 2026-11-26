// Case cards (CR 719) and the Solved keyword (CR 702.169), played through applyAction with a SYNTHETIC Case. The "To solve" trigger is the triggered ability CR 719.3a gives it
// ("At the beginning of your end step, if [condition] and this Case is not solved, this Case becomes solved"), and the "Solved" abilities are `solved` abilities (CR 702.169b-d, 719.3c).
import { describe, expect, test } from 'vitest';
import type { CardDefinition, CardFace, Condition } from '../src/index';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const CASE_NAME = 'SYNTHETIC Solving Case';
const BEARS = 'Grizzly Bears';

const BOUNCE = 'SYNTHETIC Return Enchantment';
const EXILE_GY = 'SYNTHETIC Exile Graveyards';

const base = syntheticCard('SYNTHETIC Ring Watcher');
const baseFace = base.faces[0];
if (baseFace === undefined) throw new Error('no synthetic face');
const FACE: CardFace = baseFace;

/** "To solve -- There are three or more cards in your graveyard." plus the Solved abilities given. */
function caseCard(
  name: string,
  solved: CardDefinition['faces'][number]['abilities'],
  condition?: Condition,
): CardDefinition {
  const toSolve: Condition = condition ?? {
    kind: 'amountIs',
    amount: { kind: 'countOf', filter: { zone: 'graveyard', controller: 'you' } },
    compare: { cmp: 'atLeast', value: 3 },
  };
  return {
    ...base,
    name,
    layout: 'case',
    faces: [
      {
        ...FACE,
        name,
        manaCost: ['W'],
        types: ['enchantment'],
        subtypes: ['Case'],
        abilities: [
          {
            kind: 'triggered',
            trigger: { kind: 'endStep', whose: 'you' },
            interveningIf: {
              kind: 'and',
              terms: [toSolve, { kind: 'not', term: { kind: 'thisSolved' } }],
            },
            effect: { kind: 'solve' },
          },
          { kind: 'solved', abilities: solved },
        ],
      },
    ],
  };
}

// Solved -- Creatures you control get +1/+1 (a static ability, CR 702.169b), and
// Solved -- At the beginning of your upkeep, you gain 1 life (a triggered ability, CR 702.169c).
const CASE = caseCard(CASE_NAME, [
  {
    kind: 'static',
    static: {
      kind: 'modifyPt',
      subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
      power: 1,
      toughness: 1,
    },
  },
  {
    kind: 'triggered',
    trigger: { kind: 'upkeep', whose: 'you' },
    effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
  },
]);

const SPELLS: readonly CardDefinition[] = [
  {
    ...base,
    name: BOUNCE,
    faces: [
      {
        ...FACE,
        name: BOUNCE,
        manaCost: ['W'],
        types: ['instant'],
        subtypes: [],
        abilities: [],
        spell: {
          targets: [
            {
              id: 't1',
              what: { kind: 'object', filter: { zone: 'battlefield', types: ['enchantment'] } },
            },
          ],
          effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
        },
      },
    ],
  },
  {
    ...base,
    name: EXILE_GY,
    faces: [
      {
        ...FACE,
        name: EXILE_GY,
        manaCost: ['W'],
        types: ['instant'],
        subtypes: [],
        abilities: [],
        spell: {
          effect: {
            kind: 'exile',
            objects: { kind: 'each', filter: { zone: 'graveyard', controller: 'you' } },
          },
        },
      },
    ],
  },
];

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

/** Walk forward, turn by turn, to `step` of the next turn of `seat` (the walk resolves what triggers on the way). */
function toNext(g: Game, step: 'upkeep' | 'end', seat: number): void {
  do {
    g.advanceTo(step, { turn: 'next' });
  } while (g.state.turn.activeSeat !== seat);
}

const solvedEvents = (g: { events: readonly { kind: string }[] }) =>
  g.events.filter((e) => e.kind === 'becameSolved').length;

test('the Case is a valid card', () => {
  expect(validateCard(CASE)).toEqual([]);
});

describe('the "Solved" label is a Case thing', () => {
  test('a card that is not a Case cannot have a Solved ability', () => {
    const notCase: CardDefinition = { ...CASE, layout: 'normal' };
    expect(validateCard(notCase).map((i) => i.message)).toContain(
      'only a Case (layout case) can be solved (CR 719.3)',
    );
  });
  test('a Case needs the subtype Case and one face', () => {
    const face = CASE.faces[0];
    if (face === undefined) throw new Error('no face');
    const wrong = { ...CASE, faces: [{ ...face, subtypes: [] }] };
    expect(validateCard(wrong).map((i) => i.message)).toContain(
      'layout case needs a face with the subtype Case (CR 719.1)',
    );
  });
});

describe('To solve (CR 719.3a): the end step of the Case controller, once', () => {
  const game = (graveyard: number) => {
    const b = scenario().define(CASE).seat(0).library('Plains', 'Plains', 'Plains', 'Plains');
    const withCase = b.battlefield(CASE_NAME).battlefield(BEARS, { label: 'bears' });
    const filled =
      graveyard === 0
        ? withCase
        : withCase.graveyard(...Array.from({ length: graveyard }, () => 'Plains'));
    return filled.seat(1).library('Plains', 'Plains', 'Plains', 'Plains').build();
  };

  test('with enough cards in the graveyard the Case becomes solved at the beginning of the end step', () => {
    const g = game(3);
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBeUndefined();
    g.advanceTo('end');
    // The trigger is on the stack; the Case is not solved until it resolves.
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBeUndefined();
    g.passAll();
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBe(true);
    expect(solvedEvents(g)).toBe(1);
    g.expect.invariants();
  });

  test('with too few cards it stays unsolved (the condition is read as the end step begins)', () => {
    const g = game(2);
    g.advanceTo('end');
    g.passAll();
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBeUndefined();
    expect(solvedEvents(g)).toBe(0);
  });

  test('the condition is checked again as the trigger resolves (CR 603.4)', () => {
    const g = scenario()
      .define(CASE)
      .define(SPELLS[1] as CardDefinition)
      .seat(0)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(CASE_NAME)
      .hand(EXILE_GY)
      .battlefield('Plains')
      .graveyard('Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .build();
    g.advanceTo('end');
    // The trigger is on the stack, its condition true. In response your graveyard is exiled: the condition is false as it resolves.
    g.act(0).cast(EXILE_GY).pay();
    g.passAll();
    g.passAll();
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBeUndefined();
    expect(solvedEvents(g)).toBe(0);
  });

  test('the end step of another player does not solve it (CR 719.3a: "your end step")', () => {
    const g = scenario()
      .define(CASE)
      .seat(0)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(CASE_NAME)
      .graveyard('Plains', 'Plains', 'Plains')
      .build();
    g.advanceTo('end');
    expect(g.state.turn.activeSeat).toBe(0);
    g.passAll();
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBeUndefined();
    toNext(g, 'end', 1);
    g.passAll();
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBe(true);
  });

  test('a solved Case is not solved again: the trigger does not trigger (CR 719.3a "and this Case is not solved")', () => {
    const g = game(3);
    g.advanceTo('end');
    g.passAll();
    expect(solvedEvents(g)).toBe(1);
    toNext(g, 'end', 0);
    // Nothing is on the stack at the next end step of the controller: the intervening if is false.
    g.expect.stack([]);
    expect(solvedEvents(g)).toBe(1);
  });
});

describe('Solved abilities (CR 702.169, 719.3c)', () => {
  const game = (solved: boolean) =>
    scenario()
      .define(CASE)
      .seat(0)
      .life(20)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(CASE_NAME, solved ? { solved: true } : {})
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .build();

  test('an unsolved Case has none of them: no bonus, no upkeep life gain', () => {
    const g = game(false);
    g.expect.pt('bears', 2, 2);
    toNext(g, 'upkeep', 0);
    g.passAll();
    g.expect.life(0, 20);
  });

  test('a solved Case has the static ability and the triggered ability', () => {
    const g = game(true);
    g.expect.pt('bears', 3, 3);
    toNext(g, 'upkeep', 0);
    g.passAll();
    g.expect.life(0, 21);
  });

  test('the abilities begin the moment the Case is solved (nothing is locked in, CR 611.3a)', () => {
    const g = scenario()
      .define(CASE)
      .seat(0)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(CASE_NAME)
      .battlefield(BEARS, { label: 'bears' })
      .graveyard('Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .build();
    g.expect.pt('bears', 2, 2);
    g.advanceTo('end');
    g.passAll();
    g.expect.pt('bears', 3, 3);
  });

  test('the bonus is for its controller only', () => {
    const g = scenario()
      .define(CASE)
      .seat(0)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(CASE_NAME, { solved: true })
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS, { label: 'theirs' })
      .build();
    g.expect.pt('theirs', 2, 2);
  });

  test('a Case that leaves the battlefield and comes back is not solved (CR 400.7, 719.3b)', () => {
    const g = scenario()
      .define(CASE)
      .define(SPELLS[0] as CardDefinition)
      .seat(0)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(CASE_NAME, { solved: true })
      .battlefield(BEARS, { label: 'bears' })
      .hand(BOUNCE)
      .battlefield('Plains', { count: 2 })
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .build();
    g.expect.pt('bears', 3, 3);
    g.act(0)
      .cast(BOUNCE, { targets: [CASE_NAME] })
      .pay();
    g.passAll();
    g.expect.zone(CASE_NAME, 'hand');
    g.act(0).cast(CASE_NAME).pay();
    g.passAll();
    g.expect.zone(CASE_NAME, 'battlefield');
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBeUndefined();
    g.expect.pt('bears', 2, 2);
  });
});

describe('the condition is read from the current state (three seats)', () => {
  test('"your graveyard" counts the Case controller graveyard, not the others', () => {
    const g = scenario({ seats: 3 })
      .define(CASE)
      .seat(0)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(CASE_NAME)
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .graveyard('Plains', 'Plains', 'Plains', 'Plains')
      .seat(2)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .graveyard('Plains', 'Plains', 'Plains', 'Plains')
      .build();
    g.advanceTo('end');
    g.passAll();
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBeUndefined();
  });

  test('in a three-seat game the Case is solved at its controller end step only', () => {
    const g = scenario({ seats: 3 })
      .define(CASE)
      .seat(0)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(CASE_NAME)
      .graveyard('Plains', 'Plains', 'Plains')
      .seat(2)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .build();
    // Seat 0's end step: seat 1's Case does not trigger.
    g.advanceTo('end');
    g.passAll();
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBeUndefined();
    // Seat 1's end step (turn 2).
    toNext(g, 'end', 1);
    g.passAll();
    expect(g.state.objects[g.id(CASE_NAME)]?.solved).toBe(true);
  });
});
