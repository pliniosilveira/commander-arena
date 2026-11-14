import { describe, expect, test } from 'vitest';
import {
  type Amount,
  type CardDefinition,
  type Effect,
  fixtureCard,
  syntheticCard,
  type TargetSpec,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const LIBRARY = Array.from({ length: 12 }, () => 'Plains');
const YOU = { kind: 'you' } as const;
function spell(
  suffix: string,
  effect: Effect,
  targets: readonly TargetSpec[] = [],
): CardDefinition {
  const base = syntheticCard('SYNTHETIC Mend');
  const face = base.faces[0];
  if (face === undefined) throw new Error('missing fixture');
  const name = `SYNTHETIC History ${suffix}`;
  return {
    ...base,
    name,
    faces: [{ ...face, name, manaCost: ['0'], spell: { targets, effect } }],
  };
}
const gain = (amount: Amount): Effect => ({ kind: 'gainLife', player: YOU, amount });
const dead = { kind: 'diedThisTurn', controller: 'you', types: ['creature'] } as const;
const bears = fixtureCard('Grizzly Bears').faces[0];
if (bears === undefined) throw new Error('missing Bears');
const MAKE = spell('Tokens', {
  kind: 'createToken',
  count: 2,
  token: {
    kind: 'custom',
    definition: { ...bears, name: 'SYNTHETIC History Cub', manaCost: null },
  },
});
const WIPE = spell('Wipe', {
  kind: 'destroy',
  objects: { kind: 'each', filter: { types: ['creature'] } },
});
const COUNT = spell('Count', gain(dead));
const HISTORY_AMOUNTS: readonly Amount[] = [
  { kind: 'lifeGainedThisTurn' },
  { kind: 'enteredThisTurn', controller: 'you', types: ['creature'] },
  dead,
];

describe('event-time history amounts', () => {
  test.each(HISTORY_AMOUNTS)('state conditions evaluate %j through amountOf', (amount) => {
    const proof = spell('State Condition', {
      kind: 'sequence',
      effects: [
        gain(2),
        {
          kind: 'conditional',
          condition: { kind: 'amountIs', amount, compare: { cmp: 'atLeast', value: 1 } },
          effect: gain(3),
        },
      ],
    });
    const g = scenario()
      .define(MAKE)
      .define(WIPE)
      .define(proof)
      .seat(0)
      .hand(MAKE.name, WIPE.name, proof.name)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(MAKE.name, { pay: true });
    g.passAll();
    g.act(0).cast(WIPE.name, { pay: true });
    g.passAll();
    g.act(0).cast(proof.name, { pay: true });
    g.passAll();
    g.expect.life(0, 45);
  });

  test.each(HISTORY_AMOUNTS)('unsupported continuous P/T rejects history amount %j', (amount) => {
    const card = fixtureCard('Grizzly Bears');
    const invalid = {
      ...card,
      name: 'SYNTHETIC Unsupported History Static',
      faces: [
        {
          ...bears,
          name: 'SYNTHETIC Unsupported History Static',
          abilities: [
            {
              kind: 'static',
              static: {
                kind: 'modifyPt',
                subject: { kind: 'this' },
                power: amount,
                toughness: 0,
              },
            },
          ],
        },
      ],
    } as unknown as CardDefinition;
    expect(validateCard(invalid).some((issue) => issue.path.endsWith('.power'))).toBe(true);
  });

  test('token and nontoken deaths are counted once each; opponents are excluded and the log resets', () => {
    const g = scenario()
      .define(MAKE)
      .define(WIPE)
      .define(COUNT)
      .seat(0)
      .battlefield('Grizzly Bears')
      .hand(MAKE.name, WIPE.name, COUNT.name, COUNT.name)
      .library(...LIBRARY)
      .seat(1)
      .battlefield('Grizzly Bears')
      .library(...LIBRARY)
      .build();
    g.act(0).cast(MAKE.name, { pay: true });
    g.passAll();
    g.act(0).cast(WIPE.name, { pay: true });
    g.passAll();
    g.act(0).cast({ name: COUNT.name, nth: 0 }, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
    expect(g.state.turnLog.died).toHaveLength(4);
    g.advanceTo('upkeep');
    g.act(1).pass();
    g.act(0).cast(COUNT.name, { pay: true });
    g.passAll();
    g.expect.life(0, 43);
    expect(g.state.turnLog.died).toEqual([]);
    g.expect.invariants();
  });

  test('entry counts retain leavers and distinguish tokens', () => {
    const countEntries = spell(
      'Entries',
      gain({
        kind: 'enteredThisTurn',
        controller: 'you',
        types: ['creature'],
        token: true,
      }),
    );
    const g = scenario()
      .define(MAKE)
      .define(WIPE)
      .define(countEntries)
      .seat(0)
      .hand(MAKE.name, WIPE.name, countEntries.name)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(MAKE.name, { pay: true });
    g.passAll();
    g.act(0).cast(WIPE.name, { pay: true });
    g.passAll();
    g.act(0).cast(countEntries.name, { pay: true });
    g.passAll();
    g.expect.life(0, 42);
  });

  test('death history uses the effective controller, not the owner or original controller', () => {
    const steal = spell(
      'Steal',
      {
        kind: 'gainControl',
        objects: { kind: 'target', id: 't1' },
        duration: 'untilEndOfTurn',
      },
      [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }],
    );
    const g = scenario()
      .define(steal)
      .define(WIPE)
      .define(COUNT)
      .seat(0)
      .hand(steal.name, WIPE.name, COUNT.name)
      .library(...LIBRARY)
      .seat(1)
      .battlefield('Grizzly Bears')
      .library(...LIBRARY)
      .build();
    g.act(0).cast(steal.name, { pay: true, targets: ['Grizzly Bears'] });
    g.passAll();
    g.act(0).cast(WIPE.name, { pay: true });
    g.passAll();
    g.act(0).cast(COUNT.name, { pay: true });
    g.passAll();
    g.expect.life(0, 41);
  });

  test('a death replaced by exile does not count', () => {
    const g = scenario()
      .define(WIPE)
      .define(COUNT)
      .seat(0)
      .battlefield('Grizzly Bears', { counters: { finality: 1 } })
      .hand(WIPE.name, COUNT.name)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(WIPE.name, { pay: true });
    g.passAll();
    g.act(0).cast(COUNT.name, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.zone('Grizzly Bears', 'exile');
    expect(g.state.turnLog.died).toEqual([]);
  });

  test('life gained is read in sequence, including replacement amounts and excluding prevented gains', () => {
    const countLife = spell('Life', {
      kind: 'sequence',
      effects: [gain(2), gain({ kind: 'lifeGainedThisTurn' })],
    });
    const g = scenario()
      .define(countLife)
      .seat(0)
      .battlefield('SYNTHETIC Vital Angel')
      .hand(countLife.name)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(countLife.name, { pay: true });
    g.passAll();
    g.expect.life(0, 47);
    const stopped = scenario()
      .define(countLife)
      .seat(0)
      .hand(countLife.name)
      .library(...LIBRARY)
      .seat(1)
      .battlefield('SYNTHETIC Joyless Idol')
      .library(...LIBRARY)
      .build();
    stopped.act(0).cast(countLife.name, { pay: true });
    stopped.passAll();
    stopped.expect.life(0, 40);
  });

  test.each([
    { ...dead, controller: 'opponent' },
    { ...dead, token: 'no' },
    { ...dead, types: ['invalid'] },
    { ...dead, types: [] },
    { ...dead, subtypes: ['Elf'] },
    { ...dead, filter: { types: ['creature'] } },
    { ...dead, owner: 'you' },
  ])('validation rejects unrecorded history shape %j', (amount) => {
    expect(validateCard(spell('Invalid', gain(amount as Amount))).length).toBeGreaterThan(0);
  });
});
