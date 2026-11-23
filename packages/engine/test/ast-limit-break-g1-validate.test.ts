// validateCard for the Limit Break deck, group 1 primitives (Zack Fair): `putCountersOf`, `AttachedTo` `sacrificedCost` and `ObjectFilter.equipped` (CR 113.7a, 122.1, 301.5).
// Cards are SYNTHETIC and defined here.
import { describe, expect, test } from 'vitest';
import type { Ability, Cost, Effect, ObjectFilter } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { singleFace } from '../src/cards/fixtures/helpers';

function creature(abilities: readonly Ability[]): CardDefinition {
  return singleFace({
    name: 'SYNTHETIC Limit Break Creature',
    manaCost: ['1'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'test',
    abilities,
  });
}

const SACRIFICE_THIS: Cost = { kind: 'sacrifice', what: { kind: 'this' } };
const MANA: Cost = { kind: 'mana', symbols: ['1'] };
const TARGETS = [{ id: 't1', what: { kind: 'object', filter: { types: ['creature'] } } }] as const;

function activated(cost: readonly Cost[], effect: Effect): Ability {
  return { kind: 'activated', cost, targets: TARGETS, effect } as Ability;
}

function triggered(effect: Effect): Ability {
  return {
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    targets: TARGETS,
    effect,
  } as Ability;
}

const messages = (def: CardDefinition) => validateCard(def).map((i) => i.message);

const WAS_ATTACHED: ObjectFilter = {
  subtypes: ['Equipment'],
  attachedTo: { kind: 'sacrificedCost' },
};

describe('putCountersOf (CR 122.1, 113.7a)', () => {
  const put: Effect = {
    kind: 'putCountersOf',
    from: { kind: 'this' },
    to: { kind: 'target', id: 't1' },
  };

  test('an activated ability that sacrifices its source may put its counters on a target', () => {
    expect(validateCard(creature([activated([MANA, SACRIFICE_THIS], put)]))).toEqual([]);
  });

  test("a triggered ability may put the source's counters on a target", () => {
    expect(validateCard(creature([triggered(put)]))).toEqual([]);
  });

  test('"sacrificedCost" is read only where a cost sacrificed something', () => {
    const fromCost: Effect = { ...put, from: { kind: 'sacrificedCost' } };
    expect(validateCard(creature([activated([MANA, SACRIFICE_THIS], fromCost)]))).toEqual([]);
    expect(messages(creature([activated([MANA], fromCost)])).join('\n')).toMatch(/sacrificedCost/);
  });

  test("only the source's or the sacrificed permanent's counters, and the destination is a reference", () => {
    const fromTarget: Effect = { ...put, from: { kind: 'target', id: 't1' } };
    expect(messages(creature([activated([MANA, SACRIFICE_THIS], fromTarget)])).join('\n')).toMatch(
      /putCountersOf takes the counters of/,
    );
  });
});

describe('attachedTo sacrificedCost (CR 113.7a, 301.5)', () => {
  const choose: Effect = {
    kind: 'sequence',
    effects: [
      { kind: 'chooseObjects', id: 'c1', filter: WAS_ATTACHED, count: 1, exactly: true },
      { kind: 'attach', object: { kind: 'chosen', id: 'c1' }, to: { kind: 'target', id: 't1' } },
    ],
  };

  test('a forced choice of what was attached to the sacrificed permanent, of any controller, is valid', () => {
    expect(validateCard(creature([activated([MANA, SACRIFICE_THIS], choose)]))).toEqual([]);
  });

  test('it is refused where nothing was sacrificed', () => {
    expect(messages(creature([activated([MANA], choose)])).join('\n')).toMatch(
      /attachedTo 'sacrificedCost'/,
    );
    expect(messages(creature([triggered(choose)])).join('\n')).toMatch(
      /attachedTo 'sacrificedCost'/,
    );
  });

  test('a forced choice with no attachment condition still needs a controller', () => {
    const forced: Effect = {
      kind: 'chooseObjects',
      id: 'c1',
      filter: { subtypes: ['Equipment'] },
      count: 1,
      exactly: true,
    };
    expect(messages(creature([activated([MANA, SACRIFICE_THIS], forced)])).join('\n')).toMatch(
      /chooseObjects must select permanents the controller controls/,
    );
  });
});

describe('ObjectFilter.equipped (CR 301.5)', () => {
  const draw = (filter: ObjectFilter): Effect => ({
    kind: 'draw',
    player: { kind: 'you' },
    count: { kind: 'countOf', filter },
  });

  test('equipped is a boolean that names permanents on the battlefield', () => {
    const ok = creature([triggered(draw({ types: ['creature'], equipped: true }))]);
    expect(validateCard(ok)).toEqual([]);
    const bad = creature([
      triggered(draw({ types: ['creature'], equipped: 'yes' as unknown as boolean })),
    ]);
    expect(messages(bad).join('\n')).toMatch(/equipped must be a boolean/);
    const elsewhere = creature([
      triggered(draw({ types: ['creature'], equipped: true, zone: 'graveyard' })),
    ]);
    expect(messages(elsewhere).join('\n')).toMatch(/only a permanent on the battlefield/);
  });
});
