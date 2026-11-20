// "Whenever one or more other creatures you control enter, if they entered or were cast from a graveyard, create a token that's a copy of one of them. This ability triggers only
// once each turn." (Twilight Diviner; CR 603.2c, 603.4, 603.6a, 601.2a, 707.2, 111.4): `entersBatch` with `fromGraveyard`, the effect `copyOneOfTriggerCards` and `oncePerTurn`.
// The card is SYNTHETIC (the real wording is read in packages/cards/test/parser-enters-from-graveyard.test.ts). Gaining life says the copy's enters ability triggered.
import { describe, expect, test } from 'vitest';
import type { Effect } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';
import { nameOf } from '../src/testing/describe';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { settle } from './meld-helpers';

const DIVINER = 'SYNTHETIC Graveyard Doubler';
const REANIMATE = 'SYNTHETIC Reanimate Rite';
const RAISER = 'SYNTHETIC Lifegain Raiser';
const CORPSE = 'SYNTHETIC Restless Corpse';
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const BEARS = 'Grizzly Bears';
const SERRA = 'Serra Angel';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const diviner = singleFace({
  name: DIVINER,
  manaCost: ['2', 'B'],
  types: ['creature'],
  colors: ['B'],
  colorIdentity: ['B'],
  power: 3,
  toughness: 3,
  oracleText:
    'SYNTHETIC: other creatures you control that enter from a graveyard are copied once each turn.',
  abilities: [
    {
      kind: 'triggered',
      trigger: {
        kind: 'entersBatch',
        what: { types: ['creature'], controller: 'you', other: true },
        fromGraveyard: true,
      },
      effect: { kind: 'copyOneOfTriggerCards' },
      oncePerTurn: true,
    },
  ],
});

/** "When this creature enters, you gain 3 life." A creature with an enters ability to copy. */
const raiser = singleFace({
  name: RAISER,
  manaCost: ['1', 'W'],
  types: ['creature'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 1,
  toughness: 1,
  oracleText: 'SYNTHETIC: When this creature enters, you gain 3 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
    },
  ],
});

/** "Put each creature card from your graveyard onto the battlefield." */
const reanimate = singleFace({
  name: REANIMATE,
  manaCost: ['B'],
  types: ['sorcery'],
  colors: ['B'],
  colorIdentity: ['B'],
  oracleText: 'SYNTHETIC: put each creature card from your graveyard onto the battlefield.',
  spell: {
    effect: {
      kind: 'moveToZone',
      objects: {
        kind: 'each',
        filter: { zone: 'graveyard', owner: { kind: 'you' }, types: ['creature'] },
      },
      to: 'battlefield',
    } as Effect,
  },
});

type Builder = ReturnType<typeof scenario>;

function game(mine: (b: Builder) => Builder) {
  return mine(scenario().define(diviner).define(raiser).define(reanimate).seat(0).life(20))
    .library(...FILLER)
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain')
    .build();
}

const tokensNamed = (g: ScenarioGame, name: string) =>
  g.state.battlefield
    .map((id) => g.state.objects[id])
    .filter((o) => o?.token?.characteristics.name === name && o.controller === 0);

const cast = (g: ScenarioGame, name: string) => {
  g.act(0).cast(name, { pay: true });
  settle(g);
};

describe('the definitions are valid', () => {
  test('every fixture validates', () => {
    for (const card of [diviner, raiser, reanimate]) {
      const issues = validateCard(card);
      if (issues.length > 0) throw new Error(JSON.stringify(issues));
    }
  });

  test('copyOneOfTriggerCards needs a batch enters trigger', () => {
    const bad = singleFace({
      name: 'SYNTHETIC Bad Doubler',
      manaCost: ['B'],
      types: ['creature'],
      colors: ['B'],
      colorIdentity: ['B'],
      power: 1,
      toughness: 1,
      oracleText: 'SYNTHETIC',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: { kind: 'copyOneOfTriggerCards' },
        },
      ],
    });
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });
});

describe('a creature enters or is cast from a graveyard (CR 603.6a, 601.2a)', () => {
  test('reanimated: the trigger makes a token copy of it', () => {
    const g = game((b) =>
      b.hand(REANIMATE).battlefield('Swamp').battlefield(DIVINER).graveyard(BEARS),
    );
    cast(g, REANIMATE);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(tokensNamed(g, BEARS)).toHaveLength(1);
    g.expect.invariants();
  });

  test('cast from the graveyard: the permanent remembers it, so it triggers', () => {
    const g = game((b) =>
      b.graveyard(CORPSE).battlefield(ZOMBIE).battlefield('Swamp').battlefield(DIVINER),
    );
    g.act(0).cast(CORPSE, { pay: true });
    settle(g);
    g.expect.zone(CORPSE, 'battlefield', { seat: 0 });
    expect(tokensNamed(g, CORPSE)).toHaveLength(1);
  });

  test('cast from the hand: it does not trigger', () => {
    const g = game((b) => b.hand(BEARS).battlefield('Forest', { count: 2 }).battlefield(DIVINER));
    cast(g, BEARS);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(tokensNamed(g, BEARS)).toHaveLength(0);
  });

  test('the diviner entering itself from the graveyard is not "other"', () => {
    const g = game((b) => b.hand(REANIMATE).battlefield('Swamp').graveyard(DIVINER));
    cast(g, REANIMATE);
    g.expect.zone(DIVINER, 'battlefield', { seat: 0 });
    expect(tokensNamed(g, DIVINER)).toHaveLength(0);
  });

  test('a creature of the opponent entering from their graveyard is not yours', () => {
    const g = scenario()
      .define(diviner)
      .define(reanimate)
      .seat(0)
      .life(20)
      .hand(REANIMATE)
      .battlefield('Swamp')
      .battlefield(DIVINER)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .graveyard(BEARS)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    cast(g, REANIMATE);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(tokensNamed(g, BEARS)).toHaveLength(0);
  });
});

describe('"a copy of one of them" (CR 603.2c, 608.2d, 707.2)', () => {
  test('two creatures reanimated together: one trigger, the controller chooses one, one token', () => {
    const g = game((b) =>
      b.hand(REANIMATE).battlefield('Swamp').battlefield(DIVINER).graveyard(BEARS, SERRA),
    );
    cast(g, REANIMATE);
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect(d.purpose).toBe('copyTrigger');
    expect(d.legal).toHaveLength(2);
    const serra = d.legal.find((id) => {
      const o = g.state.objects[id];
      return o !== undefined && nameOf(g.state, o) === SERRA;
    });
    if (serra === undefined) throw new Error('no Serra Angel');
    g.act(0).choosePermanents(serra);
    expect(tokensNamed(g, SERRA)).toHaveLength(1);
    expect(tokensNamed(g, BEARS)).toHaveLength(0);
    g.expect.invariants();
  });

  test('a copy of a creature with an enters ability: the token triggers it (CR 707.2, 603.6a)', () => {
    const g = game((b) =>
      b.hand(REANIMATE).battlefield('Swamp').battlefield(DIVINER).graveyard(RAISER),
    );
    cast(g, REANIMATE);
    // The raiser itself gains 3 life as it enters and its token copy gains 3 more.
    expect(tokensNamed(g, RAISER)).toHaveLength(1);
    g.expect.life(0, 26);
  });

  test('the second trigger in a turn does nothing (once each turn)', () => {
    const g = game((b) =>
      b
        .hand(REANIMATE)
        .graveyard(BEARS, CORPSE)
        .battlefield(ZOMBIE)
        .battlefield('Swamp', { count: 3 })
        .battlefield(DIVINER),
    );
    g.act(0).cast(CORPSE, { pay: true });
    settle(g);
    expect(tokensNamed(g, CORPSE)).toHaveLength(1);
    cast(g, REANIMATE);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(tokensNamed(g, BEARS)).toHaveLength(0);
  });
});
