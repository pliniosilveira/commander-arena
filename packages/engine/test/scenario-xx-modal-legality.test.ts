// Modal spells, part 2: which modes may be chosen, cancel, and the commander widening (D-105, D-114).
// Pins: CR 700.2a (a mode that would be illegal, for want of legal targets, cannot be chosen), CR 601.2b
// (modes are announced as the spell is cast; a cast that cannot be completed is not offered), CR 733 (cancel
// rewinds the cast), CR 700.2 ("choose one. If you control a commander as you cast this, you may choose both
// instead" widens how many modes may be chosen; "controlling a commander" is a commander permanent on the
// battlefield, CR 903.3d), CR 601.2c (targets of the modes chosen).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-modal.ts, and the two defined here).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  applyAction,
  type CardDefinition,
  checkInvariants,
  getLegalActions,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseModesDecision } from './pending-helpers';

const THREE = 'SYNTHETIC Three Way Charm';
const TWIN = 'SYNTHETIC Twin Charm';
const MANY = 'SYNTHETIC Many Charm';
const SPLIT = 'SYNTHETIC Split Strike';
const COMMAND = 'SYNTHETIC Command Charm'; // choose one; with a commander on the battlefield, both
const ISAMARU = 'Isamaru, Hound of Konda';
const BEARS = 'Grizzly Bears';

// SYNTHETIC: "Choose one — • Destroy target artifact an opponent controls. • 2 damage to target creature an
// opponent controls." Every mode needs a target.
const HUNTER: CardDefinition = singleFace({
  name: 'SYNTHETIC Hunter Charm',
  manaCost: ['R'],
  types: ['instant'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText:
    'Choose one — • Destroy target artifact an opponent controls. • Deals 2 damage to target creature an opponent controls.',
  spell: {
    chooseModes: { min: 1, max: 1 },
    modes: [
      {
        text: 'Destroy target artifact an opponent controls.',
        targets: [
          {
            id: 'art',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['artifact'], controller: 'opponent' },
            },
          },
        ],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 'art' } },
      },
      {
        text: 'Deals 2 damage to target creature an opponent controls.',
        targets: [
          {
            id: 'hit',
            what: {
              kind: 'object',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
            },
          },
        ],
        effect: { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 'hit' } },
      },
    ],
  },
});

// SYNTHETIC: "Choose two — • Destroy target artifact an opponent controls. • 2 damage to target creature an
// opponent controls. • You gain 1 life." With only a creature to aim at, two modes cannot both be legal.
const DUO: CardDefinition = singleFace({
  name: 'SYNTHETIC Duo Charm',
  manaCost: ['R'],
  types: ['instant'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText:
    'Choose two — • Destroy target artifact an opponent controls. • Deals 2 damage to target creature an opponent controls. • You gain 1 life.',
  spell: {
    chooseModes: { min: 2, max: 2 },
    modes: [
      ...(HUNTER.faces[0]?.spell?.modes ?? []),
      {
        text: 'You gain 1 life.',
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ],
  },
});

const base = () =>
  scenario()
    .define(HUNTER)
    .define(DUO)
    .seat(0)
    .battlefield('Mountain', { count: 4 })
    .battlefield('Plains', { count: 2 })
    .battlefield('Island', { count: 2 })
    .battlefield('Swamp', { count: 2 })
    .library('Plains', 'Plains', 'Plains');

describe('a mode with no legal target cannot be chosen (CR 700.2a)', () => {
  test('choose one of three with no creature to hit: the damage mode is offered no more', () => {
    const g = base().hand(THREE).seat(1).build();
    g.act(0).cast(THREE);
    const d = chooseModesDecision(g);
    expect(d.sets).toEqual([[1], [2]]);
    expect(d.modes.map((m) => m.legal)).toEqual([false, true, true]);
    expect(applyAction(g.state, 0, { kind: 'chooseModes', modes: [0] }).ok).toBe(false);
  });

  test('a creature of either side makes the mode legal again', () => {
    const g = base().hand(THREE).battlefield(BEARS).seat(1).build();
    g.act(0).cast(THREE);
    expect(chooseModesDecision(g).sets).toEqual([[0], [1], [2]]);
  });

  test('choose one or more: the sets are built of the legal modes only', () => {
    const g = base().hand(MANY).seat(1).build();
    g.act(0).cast(MANY);
    expect(chooseModesDecision(g).sets).toEqual([[0], [1], [0, 1]]);
  });

  test('with exactly one legal set the engine chooses it and does not ask', () => {
    // Twin Charm needs two modes; without a creature the only pair is the player gaining life and the draw.
    const g = base().hand(TWIN).seat(1).build();
    const mark = g.mark();
    g.act(0).cast(TWIN);
    g.expect.pending('targets', 0);
    const stack = g.id({ name: TWIN, zone: 'stack' });
    expect(g.state.objects[stack]?.stack?.chosenModes).toEqual([1, 2]);
    g.expect.eventLog(
      [{ kind: 'modesChosen', seat: 0, source: stack, modes: [1, 2], automatic: true }],
      { since: mark },
    );
    expect(g.state.casting?.stage).toBe('targets');
  });
});

describe('a spell with no legal choice of modes cannot be cast (CR 700.2a, 601.3)', () => {
  test('every mode needs a target and there is none: not offered, not castable', () => {
    const g = base().hand(HUNTER.name).seat(1).build();
    g.expect.illegal(0, { cast: HUNTER.name });
    const r = applyAction(g.state, 0, { kind: 'castSpell', object: g.id(HUNTER.name) });
    expect(r.ok).toBe(false);
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell')).toBe(false);
  });

  test('a creature to hit makes it castable', () => {
    const g = base().hand(HUNTER.name).seat(1).battlefield(BEARS).build();
    g.expect.legal(0, { cast: HUNTER.name });
  });

  test('choose two with only one mode legal is not castable (the number cannot be reached)', () => {
    const g = base().hand(DUO.name).seat(1).battlefield(BEARS).build();
    // Modes 1 (the creature) and 2 (the life) are legal: a pair exists, so it is castable...
    g.expect.legal(0, { cast: DUO.name });
    // ...but with nothing to aim at, only the life mode is legal and no pair exists.
    const none = base().hand(DUO.name).seat(1).build();
    none.expect.illegal(0, { cast: DUO.name });
  });

  test('a modal spell is not counted legal by the card alone: the cast is refused with no state change', () => {
    const g = base().hand(HUNTER.name).seat(1).build();
    const before = g.hash();
    expect(applyAction(g.state, 0, { kind: 'castSpell', object: g.id(HUNTER.name) }).ok).toBe(
      false,
    );
    expect(g.hash()).toBe(before);
  });
});

describe('cancel at the mode stage rewinds the cast (CR 733)', () => {
  test('cancelling the modes question gives back the exact position', () => {
    const g = base().hand(THREE).battlefield(BEARS).seat(1).build();
    const before = g.positionHash();
    g.act(0).cast(THREE);
    g.expect.pending('chooseModes', 0);
    expect(g.positionHash()).not.toBe(before);
    g.act(0).cancel();
    expect(g.positionHash()).toBe(before);
    g.expect.pending('priority', 0);
    g.expect.zone(THREE, 'hand', { seat: 0 });
    g.expect.invariants();
    // And it can be cast again, to the same question.
    g.act(0).cast(THREE);
    expect(chooseModesDecision(g).sets).toEqual([[0], [1], [2]]);
  });

  test('cancelling later (at the targets) also rewinds the modes', () => {
    const g = base().hand(THREE).battlefield(BEARS).seat(1).build();
    const before = g.positionHash();
    g.act(0).cast(THREE).modes(0);
    g.expect.pending('targets', 0);
    g.act(0).cancel();
    expect(g.positionHash()).toBe(before);
    g.expect.zone(THREE, 'hand', { seat: 0 });
  });

  test('cancelling at the payment rewinds the modes and the targets', () => {
    const g = base().hand(THREE).seat(1).battlefield(BEARS, { label: 'bears' }).build();
    const before = g.positionHash();
    g.act(0).cast(THREE, { modes: [0], targets: ['bears'] });
    g.expect.pending('payMana', 0);
    g.act(0).cancel();
    expect(g.positionHash()).toBe(before);
  });
});

describe('"if you control a commander as you cast this, you may choose both instead" (CR 700.2, 903.3d)', () => {
  test('without a commander only one mode may be chosen', () => {
    const g = base().hand(COMMAND).seat(1).build();
    g.act(0).cast(COMMAND);
    expect(chooseModesDecision(g)).toMatchObject({ min: 1, max: 1, sets: [[0], [1]] });
  });

  test('with a commander on the battlefield both may be chosen too', () => {
    const g = base().hand(COMMAND).battlefield(ISAMARU, { commander: true }).seat(1).build();
    g.act(0).cast(COMMAND);
    expect(chooseModesDecision(g)).toMatchObject({ min: 1, max: 2, sets: [[0], [1], [0, 1]] });
    g.act(0).chooseModes(0, 1).payAuto();
    g.pass();
    g.pass();
    g.expect.handSize(0, 1);
    g.expect.life(0, 43);
  });

  test('a commander in the command zone is not controlled: the choice stays at one', () => {
    const g = base().hand(COMMAND).commander(ISAMARU).seat(1).build();
    g.act(0).cast(COMMAND);
    expect(chooseModesDecision(g)).toMatchObject({ max: 1, sets: [[0], [1]] });
  });

  test('a commander the other player controls does not count for the caster', () => {
    const g = base().hand(COMMAND).seat(1).battlefield(ISAMARU, { commander: true }).build();
    g.act(0).cast(COMMAND);
    expect(chooseModesDecision(g)).toMatchObject({ max: 1 });
  });

  test('both modes are refused when the condition does not hold', () => {
    const g = base().hand(COMMAND).seat(1).build();
    g.act(0).cast(COMMAND);
    expect(applyAction(g.state, 0, { kind: 'chooseModes', modes: [0, 1] }).ok).toBe(false);
  });
});

describe('the legal actions and applyAction agree: every offered set runs to the end', () => {
  const cards = [THREE, TWIN, MANY, SPLIT, COMMAND];

  /** Answers whatever the engine asks until the spell is on the stack, the first legal choice each time. */
  function castToTheEnd(g: ScenarioGame, set: number): void {
    for (let guard = 0; guard < 20; guard += 1) {
      const d = g.state.pending;
      if (d === null || d.kind === 'priority') return;
      const seat = d.seat;
      if (d.kind === 'chooseModes') {
        const modesAction = getLegalActions(g.state, seat).filter((a) => a.kind === 'chooseModes')[
          set
        ];
        if (modesAction === undefined) throw new Error('no such set');
        g.choose(seat, modesAction);
      } else if (d.kind === 'targets') {
        g.choose(seat, {
          kind: 'chooseTargets',
          targets: d.specs.flatMap((s) => s.legal.slice(0, Math.max(s.min, 1))),
        });
      } else if (d.kind === 'payMana') {
        g.choose(seat, { kind: 'payAuto' });
      } else {
        throw new Error(`unexpected ${d.kind}`);
      }
    }
    throw new Error('the cast did not finish');
  }

  for (const card of cards) {
    test(`${card}: each set can be cast and resolved, with sound state throughout`, () => {
      const probe = base()
        .hand(card)
        .battlefield(ISAMARU, { commander: true })
        .seat(1)
        .battlefield(BEARS)
        .build();
      probe.act(0).cast(card);
      const count = getLegalActions(probe.state, 0).filter((a) => a.kind === 'chooseModes').length;
      expect(count).toBeGreaterThan(0);
      for (let set = 0; set < count; set += 1) {
        const g = base()
          .hand(card)
          .battlefield(ISAMARU, { commander: true })
          .seat(1)
          .battlefield(BEARS)
          .build();
        g.act(0).cast(card);
        castToTheEnd(g, set);
        g.expect.pending('priority', 0);
        expect(g.state.stack).toHaveLength(1);
        g.pass();
        g.pass();
        expect(g.state.stack).toHaveLength(0);
        expect(checkInvariants(g.state)).toEqual([]);
      }
    });
  }
});

describe('the cards are valid and supported (D-114)', () => {
  test.each([HUNTER, DUO])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});
