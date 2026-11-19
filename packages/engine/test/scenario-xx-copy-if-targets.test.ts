// "Whenever you cast your second spell each turn, copy that spell if it targets a permanent or player, and you may choose new targets for the copy. If you don't copy
// a spell this way, draw a card." (jeskai copy group, Shiko and Narset, Unified shape: the Flurry trigger).
// Pins: CR 603.2 and 601.2i (the second spell cast this turn triggers it; a copy is not cast), CR 115.1 and 601.2c (a spell targets what was chosen as it was cast: a
// permanent, a player or nothing), CR 608.2c ("Otherwise": the instruction after the condition reads what the game is now), CR 707.10 and 707.10c (the copy, with new targets).
// The conditional is the engine's `conditional` with an `else`, over the new `ObjectFilter.targetsPlayer`. Cards are SYNTHETIC (built here) or real fixtures.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const FLURRY = 'SYNTHETIC Flurry Twin'; // {1}{U} 2/2: the trigger above
const BOLT = 'SYNTHETIC Copy Bolt'; // {R} instant: 2 damage to any target
const GAIN = 'SYNTHETIC Quiet Gain'; // {U} instant: you gain 3 life (no target)
const WRATH_TARGET = 'SYNTHETIC Stack Pointer'; // {U} instant: counter target spell (targets only a spell on the stack)
const BEARS = 'Grizzly Bears';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const SPELL_ON_STACK = {
  anyOf: [{ targetsObject: { zone: 'battlefield' } }, { targetsPlayer: true }],
} as const;

const flurry = singleFaceCard({
  name: FLURRY,
  manaCost: ['1', 'U'],
  types: ['creature'],
  subtypes: ['Human'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 2,
  toughness: 2,
  oracleText: '',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: { stackKind: 'spell' },
        by: 'you',
        nth: 2,
      },
      effect: {
        kind: 'conditional',
        condition: {
          kind: 'objectMatches',
          of: { kind: 'triggerSubject' },
          filter: SPELL_ON_STACK,
        },
        effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
        else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    },
  ],
});

const gain = singleFaceCard({
  name: GAIN,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'You gain 3 life.',
  spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 } },
});

const pointer = singleFaceCard({
  name: WRATH_TARGET,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Counter target spell.',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { stackKind: 'spell', zone: 'stack' } } },
    ],
    effect: { kind: 'counter', objects: { kind: 'target', id: 't1' } },
  },
});

function game(configure: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) {
  return configure(scenario().define(flurry).define(gain).define(pointer).seat(0).life(20))
    .seat(0)
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

describe('copy that spell if it targets a permanent or player, otherwise draw (CR 115.1, 608.2c, 707.10)', () => {
  test('the card passes the engine validation', () => {
    expect(validateCard(flurry)).toEqual([]);
  });

  test('the second spell that targets a player is copied, and nothing is drawn', () => {
    const g = game((b) =>
      b.seat(0).hand(GAIN, BOLT).battlefield(FLURRY).battlefield('Mountain').battlefield('Island'),
    );
    g.act(0).cast(GAIN, { pay: true });
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.pass(); // the trigger goes on the stack and resolves
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    const handBefore = g.state.seats[0]?.hand.length;
    expect(handBefore).toBe(0);
    resolveTop(g); // the copy
    g.expect.life(1, 18);
    resolveTop(g); // the original
    g.expect.life(1, 16);
    expect(g.state.seats[0]?.hand.length).toBe(0); // no card drawn
    g.expect.invariants();
  });

  test('the second spell that targets a permanent is copied too', () => {
    const g = game((b) =>
      b
        .seat(0)
        .hand(GAIN, BOLT)
        .battlefield(FLURRY)
        .battlefield('Mountain')
        .battlefield('Island')
        .seat(1)
        .battlefield(BEARS),
    );
    g.act(0).cast(GAIN, { pay: true });
    g.act(0).cast(BOLT, { targets: [{ name: BEARS }], pay: true });
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ name: BEARS });
    expect(g.state.seats[0]?.hand.length).toBe(0);
    expect(g.state.stack).toHaveLength(3); // the first spell, Bolt and the copy of Bolt
  });

  test('a second spell with no target is not copied: its controller draws a card', () => {
    const g = game((b) =>
      b.seat(0).hand(GAIN, GAIN).battlefield(FLURRY).battlefield('Island', { count: 2 }),
    );
    g.act(0).cast({ name: GAIN, nth: 1 }, { pay: true });
    g.act(0).cast({ name: GAIN, zone: 'hand' }, { pay: true });
    g.pass();
    g.pass();
    expect(g.state.seats[0]?.hand.length).toBe(1);
    expect(Object.values(g.state.objects).filter((o) => o.copyOf !== undefined)).toHaveLength(0);
    g.expect.invariants();
  });

  test('a second spell that targets only a spell on the stack is not copied: draw a card', () => {
    const g = game((b) =>
      b.seat(0).hand(GAIN, WRATH_TARGET).battlefield(FLURRY).battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(GAIN, { pay: true });
    g.act(0).cast(WRATH_TARGET, { targets: [{ name: GAIN, zone: 'stack' }], pay: true });
    g.pass();
    g.pass();
    expect(g.state.seats[0]?.hand.length).toBe(1);
    expect(Object.values(g.state.objects).filter((o) => o.copyOf !== undefined)).toHaveLength(0);
  });

  test('the first spell of the turn does nothing', () => {
    const g = game((b) => b.seat(0).hand(BOLT).battlefield(FLURRY).battlefield('Mountain'));
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
    expect(g.state.seats[0]?.hand.length).toBe(0);
  });
});
