import { readFileSync } from 'node:fs';
import { type CardDefinition, type Effect, getView, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const NAMES = [
  'Eccentric Pestfinder // Turn Stones',
  'Stensian Sanguinist // Exsanguinate',
  'Immoral Bargain',
  'Nether Traitor',
  'Ominous Harvest',
  'Pest Infestation',
];

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`Missing corpus card ${name}`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

function syntheticSpell(name: string, effect: Effect): CardDefinition {
  const base = real('Immoral Bargain');
  const face = base.faces[0];
  if (face === undefined) throw new Error('Missing spell face');
  const { additionalCosts: _costs, ...plain } = face;
  return {
    ...base,
    oracleId: null,
    name: `SYNTHETIC ${name}`,
    faces: [
      {
        ...plain,
        name: `SYNTHETIC ${name}`,
        manaCost: ['0'],
        oracleText: 'SYNTHETIC test spell.',
        abilities: [],
        spell: { effect },
      },
    ],
  };
}

describe('issue58 group D real imports', () => {
  test.each(NAMES)('%s reads entirely and validates', (name) => {
    expect(validateCard(real(name))).toEqual([]);
  });

  test('Immoral Bargain announces X before exactly X targets and sacrifices X creatures', () => {
    const card = real('Immoral Bargain');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Grizzly Bears', { count: 2 })
      .battlefield('Swamp', { count: 2 })
      .battlefield('Forest')
      .seat(1)
      .battlefield('Giant Spider', { count: 2 })
      .build();
    g.act(0).cast(card.name);
    g.expect.pending('chooseX', 0);
    g.act(0).chooseX(2);
    g.act(0).chooseTargets({ name: 'Giant Spider', nth: 0 }, { name: 'Giant Spider', nth: 1 });
    g.act(0).payAuto();
    g.pass();
    g.pass();
    expect(g.find({ name: 'Grizzly Bears', zone: 'battlefield' })).toHaveLength(0);
    expect(g.find({ name: 'Giant Spider', zone: 'battlefield' })).toHaveLength(0);
    g.expect.invariants();
  });

  test('Immoral Bargain allows X zero without creatures or targets', () => {
    const card = real('Immoral Bargain');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Swamp', 'Swamp', 'Forest')
      .build();
    g.act(0).cast(card.name);
    const spell = g.state.stack[0];
    expect(spell === undefined ? undefined : g.state.objects[spell]?.stack?.x).toBe(0);
    g.act(0).payAuto();
    g.passAll();
    g.expect.invariants();
  });

  test('Immoral Bargain caps X by both sacrifices and targets and cancellation restores payment', () => {
    const card = real('Immoral Bargain');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Swamp', 'Swamp', 'Forest')
      .battlefield('Grizzly Bears', { count: 3 })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    const initial = g.state;
    g.act(0).cast(card.name);
    expect(g.state.pending).toMatchObject({ max: 3 });
    g.act(0).chooseX(2);
    g.act(0).chooseTargets({ name: 'Grizzly Bears', nth: 0 }, 'Giant Spider').payAuto();
    g.expect.pending('choosePermanent', 0);
    expect(g.state.pending).toMatchObject({ min: 2, max: 2, forCost: true });
    g.act(0).cancel();
    expect(g.state.seats[0]?.hand).toEqual(initial.seats[0]?.hand);
    expect(g.find({ name: 'Grizzly Bears', zone: 'battlefield' })).toHaveLength(3);
    expect(g.state.battlefield.map((id) => g.state.objects[id]?.tapped)).not.toContain(true);
    g.expect.invariants();
  });

  test('Pest Infestation may choose zero targets with X above the number of legal targets', () => {
    const card = real('Pest Infestation');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Forest', { count: 5 })
      .build();
    g.act(0).cast(card.name);
    g.act(0).chooseX(2);
    g.act(0).chooseTargets().payAuto();
    g.passAll();
    expect(getView(g.state, 0).battlefield.filter((o) => o.name === 'Pest')).toHaveLength(4);
    g.expect.invariants();
  });

  test('Pest tokens really trigger life gain when they die', () => {
    const card = real('Pest Infestation');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name, 'Murder')
      .battlefield('Forest', { count: 3 })
      .battlefield('Swamp', { count: 3 })
      .build();
    g.act(0).cast(card.name);
    g.act(0).chooseX(1).chooseTargets().payAuto();
    g.passAll();
    g.act(0).cast('Murder', { targets: [{ name: 'Pest', nth: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 41);
    g.expect.invariants();
  });

  test.each([false, true])(
    'Pest Infestation target legality on resolution, surviving target=%s',
    (survives) => {
      const card = real('Pest Infestation');
      const removal = syntheticSpell('Remove opposing artifacts', {
        kind: 'destroy',
        objects: { kind: 'each', filter: { types: ['artifact'], controller: 'opponent' } },
      });
      const instant = {
        ...removal,
        faces: removal.faces.map((face) => ({ ...face, types: ['instant'] as const })),
      };
      let b = scenario()
        .define(card)
        .define(instant)
        .seat(0)
        .hand(card.name, instant.name)
        .battlefield('Forest', { count: 5 });
      if (survives) b = b.battlefield('Sol Ring');
      const g = b.seat(1).battlefield('Sol Ring').build();
      g.act(0).cast(card.name);
      g.act(0).chooseX(survives ? 2 : 1);
      if (survives) {
        g.act(0).chooseTargets({ name: 'Sol Ring', seat: 0 }, { name: 'Sol Ring', seat: 1 });
      } else {
        g.act(0).chooseTargets('Sol Ring');
      }
      g.act(0).payAuto();
      g.act(0).cast(instant.name, { pay: true });
      g.passAll();
      expect(getView(g.state, 0).battlefield.filter((o) => o.name === 'Pest')).toHaveLength(
        survives ? 4 : 0,
      );
      g.expect.invariants();
    },
  );

  test('a copy of Immoral Bargain preserves X and does not sacrifice again', () => {
    const card = real('Immoral Bargain');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name, 'SYNTHETIC Twin Spell')
      .battlefield('Swamp', 'Swamp', 'Forest', 'Island', 'Island', 'Grizzly Bears')
      .seat(1)
      .battlefield('Giant Spider', { count: 2 })
      .build();
    g.act(0).cast(card.name);
    g.act(0).chooseX(1);
    g.act(0).chooseTargets({ name: 'Giant Spider', nth: 0 }).payAuto();
    g.act(0).cast('SYNTHETIC Twin Spell', {
      targets: [{ name: card.name, zone: 'stack' }],
      pay: true,
    });
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    expect(g.state.pending).toMatchObject({ specs: [{ min: 1, max: 1 }] });
    g.act(0).chooseTargets({ name: 'Giant Spider', nth: 1 });
    expect(g.state.stack.map((id) => g.state.objects[id]?.stack?.x)).toEqual([1, 1]);
    g.passAll();
    expect(g.find({ name: 'Giant Spider', zone: 'battlefield' })).toHaveLength(0);
    expect(g.eventsSince(0).filter((e) => e.kind === 'sacrificed')).toHaveLength(1);
    g.expect.invariants();
  });

  test('a copy of an up-to-X spell keeps zero chosen targets rather than announcing new ones', () => {
    const card = real('Pest Infestation');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name, 'SYNTHETIC Twin Spell')
      .battlefield('Forest', { count: 3 })
      .battlefield('Island', 'Island')
      .seat(1)
      .battlefield('Sol Ring')
      .build();
    g.act(0).cast(card.name);
    g.act(0).chooseX(1).chooseTargets().payAuto();
    g.act(0).cast('SYNTHETIC Twin Spell', {
      targets: [{ name: card.name, zone: 'stack' }],
      pay: true,
    });
    g.pass();
    g.pass();
    if (g.state.pending?.kind === 'targets') {
      expect(g.state.pending).toMatchObject({ specs: [{ min: 0, max: 0 }] });
      g.act(0).chooseTargets();
    }
    g.passAll();
    expect(getView(g.state, 0).battlefield.filter((o) => o.name === 'Pest')).toHaveLength(4);
    expect(g.find({ name: 'Sol Ring', zone: 'battlefield' })).toHaveLength(1);
    g.expect.invariants();
  });

  test('Immoral Bargain may sacrifice its chosen target and then fails for its only illegal target', () => {
    const card = real('Immoral Bargain');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Swamp', 'Swamp', 'Forest', 'Grizzly Bears')
      .build();
    g.act(0).cast(card.name);
    g.act(0).chooseX(1).chooseTargets('Grizzly Bears').payAuto();
    g.passAll();
    g.expect.life(0, 40);
    expect(g.find({ name: 'Grizzly Bears', zone: 'graveyard' })).toHaveLength(1);
    g.expect.invariants();
  });

  test('exact X permanent targeting refuses too few targets', () => {
    const card = real('Immoral Bargain');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield('Swamp', 'Swamp', 'Forest')
      .battlefield('Grizzly Bears', { count: 2 })
      .build();
    g.act(0).cast(card.name);
    g.act(0).chooseX(2);
    expect(() => g.act(0).chooseTargets({ name: 'Grizzly Bears', nth: 0 })).toThrow();
    g.expect.pending('targets', 0);
    g.act(0).cancel();
    g.expect.invariants();
  });

  test('Nether Traitor returns only when already in the graveyard as another owned creature dies', () => {
    const card = real('Nether Traitor');
    const g = scenario()
      .define(card)
      .seat(0)
      .graveyard(card.name)
      .hand('Murder')
      .battlefield('Grizzly Bears')
      .battlefield('Swamp', { count: 4 })
      .build();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    if (g.state.pending?.kind === 'payMana') g.act(0).payAuto();
    g.passAll();
    expect(g.find({ name: card.name, zone: 'battlefield' })).toHaveLength(1);
    g.expect.invariants();
  });

  test('Nether Traitor does not trigger when it dies simultaneously with another creature', () => {
    const card = real('Nether Traitor');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand('SYNTHETIC Wrath')
      .battlefield(card.name, 'Grizzly Bears')
      .battlefield('Plains', { count: 4 })
      .build();
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.find({ name: card.name, zone: 'graveyard' })).toHaveLength(1);
    expect(g.eventsSince(0).filter((e) => e.kind === 'abilityTriggered')).toHaveLength(0);
    g.expect.invariants();
  });

  test.each([true, false])(
    'Nether Traitor tracks separate destruction instructions, Traitor destroyed first=%s',
    (first) => {
      const card = real('Nether Traitor');
      const destroy = (subtype: string): Effect => ({
        kind: 'destroy',
        objects: { kind: 'each', filter: { types: ['creature'], subtypes: [subtype] } },
      });
      const sequence = syntheticSpell('Sequential destruction', {
        kind: 'sequence',
        effects: first
          ? [destroy('Spirit'), destroy('Bear')]
          : [destroy('Bear'), destroy('Spirit')],
      });
      const g = scenario()
        .define(card)
        .define(sequence)
        .seat(0)
        .hand(sequence.name)
        .battlefield(card.name, 'Grizzly Bears', 'Swamp')
        .build();
      g.act(0).cast(sequence.name, { pay: true });
      g.passAll();
      g.expect.pending(first ? 'confirmOptional' : 'priority', 0);
      if (first) {
        g.act(0).accept();
        g.act(0).payAuto();
        g.passAll();
        expect(g.find({ name: card.name, zone: 'battlefield' })).toHaveLength(1);
      } else {
        expect(g.find({ name: card.name, zone: 'graveyard' })).toHaveLength(1);
      }
      g.expect.invariants();
    },
  );

  test('Nether Traitor does not trigger for an opponent-owned creature', () => {
    const card = real('Nether Traitor');
    const g = scenario()
      .define(card)
      .seat(0)
      .graveyard(card.name)
      .hand('Murder')
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    expect(g.find({ name: card.name, zone: 'graveyard' })).toHaveLength(1);
  });

  test('Nether Traitor may decline to pay and stays in the graveyard', () => {
    const card = real('Nether Traitor');
    const g = scenario()
      .define(card)
      .seat(0)
      .graveyard(card.name)
      .hand('Murder')
      .battlefield('Grizzly Bears')
      .battlefield('Swamp', { count: 4 })
      .build();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    expect(g.find({ name: card.name, zone: 'graveyard' })).toHaveLength(1);
    expect(
      getView(g.state, 0).battlefield.filter((o) => o.name === 'Swamp' && o.tapped),
    ).toHaveLength(3);
    g.expect.invariants();
  });

  test('Ominous Harvest copies for a destroyed land and creature, with optional new targets', () => {
    const card = real('Ominous Harvest');
    const destroyLand = syntheticSpell('Destroy opposing lands', {
      kind: 'destroy',
      objects: { kind: 'each', filter: { types: ['land'], controller: 'opponent' } },
    });
    const g = scenario()
      .define(card)
      .define(destroyLand)
      .seat(0)
      .hand(card.name, destroyLand.name, 'Murder')
      .battlefield('Swamp', { count: 6 })
      .battlefield('Mountain', { count: 3 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Forest', 'Grizzly Bears')
      .library('Plains', 'Plains', 'Plains')
      .build();
    g.act(0).cast(destroyLand.name, { pay: true });
    g.passAll();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).cast(card.name, { targets: [{ player: 1 }], pay: true });
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).chooseTargets({ player: 0 });
    expect(g.state.stack).toHaveLength(3);
    g.passAll();
    g.expect.life(0, 39);
    g.expect.life(1, 38);
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(3);
    g.expect.invariants();
  });

  test('gravestorm counts token deaths occurring after the spell is cast but before its trigger resolves', () => {
    const card = real('Ominous Harvest');
    const pest = real('Pest Infestation');
    const g = scenario()
      .define(card)
      .define(pest)
      .seat(0)
      .hand(card.name, pest.name, 'Murder')
      .battlefield('Forest', { count: 3 })
      .battlefield('Swamp', { count: 6 })
      .library('Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .build();
    g.act(0).cast(pest.name);
    g.act(0).chooseX(1).chooseTargets().payAuto();
    g.passAll();
    g.act(0).cast(card.name, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast('Murder', { targets: [{ name: 'Pest', nth: 0 }], pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 38);
    expect(g.state.seats[0]?.spellsCastThisTurn).toBe(3);
    g.expect.invariants();
  });

  test('gravestorm does not count permanents that died in an earlier turn', () => {
    const card = real('Ominous Harvest');
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name, 'Murder')
      .battlefield('Swamp', { count: 6 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield('Grizzly Bears')
      .library('Plains', 'Plains', 'Plains')
      .build();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(card.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.invariants();
  });

  test('Eccentric Pestfinder prepares after life gain, casts Turn Stones, and may prepare again', () => {
    const card = real('Eccentric Pestfinder // Turn Stones');
    const front = 'Eccentric Pestfinder';
    const gain = syntheticSpell('Gain life', {
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: 3,
    });
    const g = scenario()
      .define(card)
      .define(gain)
      .seat(0)
      .battlefield(card.name)
      .hand(gain.name)
      .battlefield('Plains', 'Swamp', 'Forest')
      .library('Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .build();
    g.act(0).cast(gain.name, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === front)?.prepared).toBe(true);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    const copy = Object.values(g.state.objects).find((o) => o.prepareOf !== undefined);
    if (copy === undefined) throw new Error('Missing prepared spell');
    g.act(0).cast(copy.id, { pay: true });
    g.passAll();
    expect(getView(g.state, 0).battlefield.filter((o) => o.name === 'Pest')).toHaveLength(1);
    expect(getView(g.state, 0).battlefield.find((o) => o.name === front)?.prepared).toBeUndefined();
    g.expect.invariants();
  });

  test('Stensian Sanguinist watches the target but prepares the original source after combat damage', () => {
    const card = real('Stensian Sanguinist // Exsanguinate');
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name, 'Grizzly Bears')
      .battlefield('Swamp', { count: 4 })
      .library('Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('postcombatMain');
    expect(
      getView(g.state, 0).battlefield.find((o) => o.name === 'Stensian Sanguinist')?.prepared,
    ).toBe(true);
    expect(g.state.delayedTriggers).toHaveLength(0);
    const copy = Object.values(g.state.objects).find((o) => o.prepareOf !== undefined);
    if (copy === undefined) throw new Error('Missing prepared Exsanguinate');
    g.act(0).cast(copy.id);
    g.act(0).chooseX(2).payAuto();
    g.passAll();
    g.expect.life(0, 42);
    g.expect.life(1, 36);
    expect(
      getView(g.state, 0).battlefield.find((o) => o.name === 'Stensian Sanguinist')?.prepared,
    ).toBeUndefined();
    g.expect.invariants();
  });

  test('Sanguinist delayed preparation expires when the chosen attacker deals no player damage', () => {
    const card = real('Stensian Sanguinist // Exsanguinate');
    const g = scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name, 'Grizzly Bears')
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .library('Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('Grizzly Bears');
    g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    g.act(0).cast('Murder', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.advanceTo('postcombatMain');
    expect(g.state.delayedTriggers).toHaveLength(0);
    expect(
      getView(g.state, 0).battlefield.find((o) => o.name === 'Stensian Sanguinist')?.prepared,
    ).toBeUndefined();
    g.expect.invariants();
  });
});
