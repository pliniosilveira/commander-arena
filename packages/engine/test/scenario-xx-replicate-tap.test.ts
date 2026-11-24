// Replicate with a cost that taps permanents (CR 702.56a; Psionic Ritual: "Replicate—Tap an untapped Horror you control."): the cost is paid once for each time the caster chose, so that many
// untapped permanents that match are tapped, and the spell is copied that many times. The count offered is the most that can be tapped. Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-g8.ts), except the creatures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { choosePermanentDecision, chooseXDecision } from './pending-helpers';

const RITUAL = 'SYNTHETIC Tap Replicate Ritual'; // {B} sorcery, replicate—tap an untapped Horror you control; you gain 1 life
const WATCHER = 'SYNTHETIC Suspend Watcher'; // a 4/4 Horror
const BEARS = 'Grizzly Bears'; // not a Horror
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

function game(seats: 2 | 3 | 4, configure: (b: Builder) => Builder): ScenarioGame {
  let b = scenario({ seats })
    .seat(0)
    .life(20)
    .library(...FILLER);
  for (let seat = 1; seat < seats; seat += 1) {
    b = b
      .seat(seat as 1 | 2 | 3)
      .life(20)
      .library(...FILLER);
  }
  return configure(b).at('precombatMain', { active: 0, turn: 3 }).build();
}

const tappedNamed = (g: ScenarioGame, name: string): number =>
  g.find({ name, zone: 'battlefield' }).filter((o) => o.tapped).length;

describe('the count (CR 702.56a, 601.2b)', () => {
  test('is asked up to the number of untapped Horrors the caster controls, and no mana is part of it', () => {
    const g = game(2, (b) =>
      b
        .seat(0)
        .hand(RITUAL)
        .battlefield('Swamp')
        .battlefield(WATCHER, { count: 3 })
        .battlefield(BEARS)
        .seat(0),
    );
    g.act(0).cast(RITUAL);
    expect(chooseXDecision(g)).toMatchObject({
      purpose: 'replicate',
      min: 0,
      max: 3,
      cost: [{ kind: 'tapPermanents', filter: { subtypes: ['Horror'] }, count: 1 }],
    });
  });

  test('a tapped Horror is not counted', () => {
    const g = game(2, (b) =>
      b
        .seat(0)
        .hand(RITUAL)
        .battlefield('Swamp')
        .battlefield(WATCHER, { count: 2 })
        .battlefield(WATCHER, { tapped: true })
        .seat(0),
    );
    g.act(0).cast(RITUAL);
    expect(chooseXDecision(g)).toMatchObject({ max: 2 });
  });

  test('with no untapped Horror nothing is asked and the spell is cast as it is', () => {
    const g = game(2, (b) =>
      b.seat(0).hand(RITUAL).battlefield('Swamp').battlefield(BEARS).seat(0),
    );
    g.act(0).cast(RITUAL, { pay: true });
    g.expect.stack([RITUAL]);
  });
});

describe('paying (CR 702.56a, 601.2h)', () => {
  test('two times taps two Horrors and puts the spell and two copies on the stack', () => {
    const g = game(2, (b) =>
      b.seat(0).hand(RITUAL).battlefield('Swamp').battlefield(WATCHER, { count: 3 }).seat(0),
    );
    g.act(0).cast(RITUAL, { replicas: 2 }).pay();
    // Three Horrors qualify and two are tapped, after the mana: the caster chooses which.
    const d = choosePermanentDecision(g);
    expect(d).toMatchObject({ purpose: 'tap', min: 2, max: 2, forCost: true });
    const [a, b] = d.legal;
    if (a === undefined || b === undefined) throw new Error('no candidates');
    g.act(0).choose({ kind: 'choosePermanents', objects: [a, b] });
    expect(tappedNamed(g, WATCHER)).toBe(2);
    g.passAll();
    expect(g.state.stack).toHaveLength(0);
    // The spell and its two copies each gained 1 life.
    expect(g.state.seats[0]?.life).toBe(23);
  });

  test('with exactly as many Horrors as times, they are tapped at once', () => {
    const g = game(2, (b) =>
      b.seat(0).hand(RITUAL).battlefield('Swamp').battlefield(WATCHER, { count: 2 }).seat(0),
    );
    g.act(0).cast(RITUAL, { replicas: 2, pay: true });
    expect(tappedNamed(g, WATCHER)).toBe(2);
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(23);
  });

  test('0 times taps nothing and copies nothing', () => {
    const g = game(2, (b) =>
      b.seat(0).hand(RITUAL).battlefield('Swamp').battlefield(WATCHER, { count: 2 }).seat(0),
    );
    g.act(0).cast(RITUAL, { replicas: 0, pay: true });
    expect(tappedNamed(g, WATCHER)).toBe(0);
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(21);
  });

  test('only the caster’s own Horrors count, whatever the number of opponents', () => {
    const g = game(4, (b) =>
      b
        .seat(0)
        .hand(RITUAL)
        .battlefield('Swamp')
        .battlefield(WATCHER)
        .seat(1)
        .battlefield(WATCHER, { count: 2 })
        .seat(2)
        .battlefield(WATCHER)
        .seat(3)
        .battlefield(WATCHER)
        .seat(0),
    );
    g.act(0).cast(RITUAL);
    expect(chooseXDecision(g)).toMatchObject({ max: 1 });
  });
});

describe('validation', () => {
  const base = syntheticCard(RITUAL);
  const face = base.faces[0];
  if (face === undefined) throw new Error('no face');
  const withReplicate = (cost: unknown, extra: readonly unknown[] = []) =>
    ({
      ...base,
      faces: [
        {
          ...face,
          abilities: [{ kind: 'keyword', keyword: { kind: 'replicate', cost } }, ...extra],
        },
      ],
    }) as never;

  test('the fixture is valid', () => {
    expect(validateCard(base)).toEqual([]);
  });

  test('a replicate cost that taps permanents has no other cost', () => {
    const tap = { kind: 'tapPermanents', filter: { subtypes: ['Horror'] }, count: 1 };
    expect(
      JSON.stringify(validateCard(withReplicate([tap, { kind: 'mana', symbols: ['B'] }]))),
    ).toContain('no other cost');
  });

  test('a replicate cost of another kind is still refused', () => {
    expect(JSON.stringify(validateCard(withReplicate([{ kind: 'payLife', amount: 2 }])))).toContain(
      'tapping of untapped permanents',
    );
  });

  test('with convoke it is refused: both tap permanents for the cast', () => {
    const tap = { kind: 'tapPermanents', filter: { subtypes: ['Horror'] }, count: 1 };
    const convoke = { kind: 'keyword', keyword: { kind: 'convoke' } };
    expect(JSON.stringify(validateCard(withReplicate([tap], [convoke])))).toContain(
      'is not supported',
    );
  });
});
