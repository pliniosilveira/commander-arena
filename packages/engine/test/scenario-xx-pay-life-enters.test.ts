// "As this artifact enters, pay any amount of life." (`asEntersChoose` of `lifePaid`) and the amount `lifePaidAsEntered`, which a token's power and toughness read.
// Pins: CR 119.4 and 119.4b (pay life: no more than the life total, 0 always), CR 614.12 and 614.12a (a choice made as it enters, before it is on the battlefield),
// CR 400.7 (a new object remembers nothing), CR 113.7a and 608.2h (an ability whose source left reads its last-known information), CR 111.4 (the token's
// characteristics are set as it is created), CR 119.8 (a life total that cannot change pays 0). Cards are SYNTHETIC probes built here.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Ability, CardDefinition } from '../src/index';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const MINION = {
  kind: 'custom',
  definition: {
    name: 'Minion',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Minion'],
    colors: ['B'],
    power: 0,
    toughness: 0,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  },
  ptAmount: { kind: 'lifePaidAsEntered' },
} as const;

const PAY: Ability = {
  kind: 'replacement',
  replacement: { kind: 'asEntersChoose', what: 'lifePaid' },
};
const MAKE: Ability = {
  kind: 'activated',
  cost: [{ kind: 'tap' }],
  effect: { kind: 'createToken', token: MINION, count: 1 },
};
const SACRIFICE_SELF_THEN: Ability = {
  kind: 'activated',
  cost: [{ kind: 'sacrifice', what: { kind: 'this' } }],
  effect: { kind: 'createToken', token: MINION, count: 1 },
};

const card = (name: string, abilities: Ability[]): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'SYNTHETIC',
    abilities,
  });

/** "Return target artifact to its owner's hand." (the real Unsummon only reaches creatures) */
const BOUNCE = singleFace({
  name: 'SYNTHETIC Artifact Bounce',
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: "Return target artifact to its owner's hand.",
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } } },
    ],
    effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
  },
});

/** "Create a token that's a copy of target artifact." */
const COPIER = singleFace({
  name: 'SYNTHETIC Artifact Copier',
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: "Create a token that's a copy of target artifact.",
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } } },
    ],
    effect: {
      kind: 'createToken',
      token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
      count: 1,
    },
  },
});

const PROCESSOR = card('SYNTHETIC Life Press', [PAY, MAKE]);
const SACRIFICER = card('SYNTHETIC Life Altar', [PAY, SACRIFICE_SELF_THEN]);
const FILLER = Array.from({ length: 20 }, () => 'Island');

const game = (def: CardDefinition, life = 40) =>
  scenario()
    .define(def)
    .define(BOUNCE)
    .seat(0)
    .life(life)
    .hand(def.name, BOUNCE.name)
    .battlefield('Island', 'Island', 'Island')
    .library(...FILLER)
    .seat(1)
    .library(...FILLER)
    .build();

describe('validateCard', () => {
  test('the face that pays life and reads it is valid', () => {
    expect(validateCard(PROCESSOR)).toEqual([]);
  });

  test('the amount needs the payment on the same face', () => {
    expect(JSON.stringify(validateCard(card('SYNTHETIC No Payment', [MAKE])))).toContain(
      'does not pay any as it enters',
    );
  });

  test('a face asks one question as it enters: paying life and choosing a color are two', () => {
    const two = card('SYNTHETIC Two Questions', [
      PAY,
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'color' } },
    ]);
    expect(validateCard(two).length).toBeGreaterThan(0);
  });

  test('a list of options belongs to a choice among options only', () => {
    const named = card('SYNTHETIC Named Payment', [
      {
        kind: 'replacement',
        replacement: { kind: 'asEntersChoose', what: 'lifePaid', options: ['A', 'B'] },
      },
    ]);
    expect(validateCard(named).length).toBeGreaterThan(0);
  });
});

describe('the question and the payment', () => {
  test('the options are 0 to the life total, in order, and the answer is stored and paid', () => {
    const g = game(PROCESSOR, 3);
    g.act(0).cast(PROCESSOR.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the question');
    expect(d.purpose).toBe('lifePaid');
    expect(d.options).toEqual(['0', '1', '2', '3']);
    g.act(0).chooseOption('2');
    g.expect.life(0, 1);
    g.expect.chosen(PROCESSOR.name, { lifePaid: 2 });
    g.expect.invariants();
  });

  test('a payment above the life total is refused and the question stays', () => {
    const g = game(PROCESSOR, 3);
    g.act(0).cast(PROCESSOR.name, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseOption('4')).toThrow();
    expect(() => g.act(0).chooseOption('-1')).toThrow();
    expect(() => g.act(0).chooseOption('1.5')).toThrow();
    g.expect.pending('chooseOption', 0);
  });

  test('the life lost is an ordinary life change in the log', () => {
    const g = game(PROCESSOR);
    g.act(0).cast(PROCESSOR.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('5');
    g.expect.eventLog([{ kind: 'lifeChanged', seat: 0, from: 40, to: 35 }]);
  });
});

describe('what the permanent remembers', () => {
  test('the token is the amount it paid, however much life the controller has now', () => {
    const g = scenario()
      .define(PROCESSOR)
      .seat(0)
      .life(10)
      .battlefield(PROCESSOR.name, { chosen: { lifePaid: 8 } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).activate(PROCESSOR.name);
    g.passAll();
    g.expect.pt('Minion', 8, 8);
  });

  test('a permanent with nothing remembered makes a 0/0', () => {
    const g = scenario()
      .define(PROCESSOR)
      .seat(0)
      .battlefield(PROCESSOR.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).activate(PROCESSOR.name);
    g.passAll();
    g.expect.noObject('Minion', { zone: 'battlefield' });
  });

  test('the ability still reads it when its source left the battlefield as the cost (last-known information, CR 113.7a)', () => {
    const g = scenario()
      .define(SACRIFICER)
      .seat(0)
      .battlefield(SACRIFICER.name, { chosen: { lifePaid: 6 } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).activate(SACRIFICER.name);
    g.passAll();
    g.expect.zone(SACRIFICER.name, 'graveyard', { seat: 0 });
    g.expect.pt('Minion', 6, 6);
  });

  test('a new object after a zone change forgets it (CR 400.7): returned to the hand and cast again, it asks again and remembers the new amount', () => {
    const g = game(PROCESSOR);
    g.act(0).cast(PROCESSOR.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('9');
    g.expect.chosen(PROCESSOR.name, { lifePaid: 9 });
    g.act(0).cast(BOUNCE.name, { targets: [{ name: PROCESSOR.name, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(PROCESSOR.name, 'hand', { seat: 0 });
    expect(g.find({ name: PROCESSOR.name, zone: 'hand' })).toHaveLength(1);
    g.act(0).cast(PROCESSOR.name, { pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('1');
    g.expect.chosen(PROCESSOR.name, { lifePaid: 1 });
    g.expect.life(0, 30);
  });

  test('the scenario refuses a choice the card does not ask for', () => {
    expect(() =>
      scenario()
        .define(card('SYNTHETIC Plain Artifact', []))
        .seat(0)
        .battlefield('SYNTHETIC Plain Artifact', { chosen: { lifePaid: 1 } })
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .build(),
    ).toThrow();
  });
});

describe('a token that is a copy of the artifact pays too (CR 614.12: tokens ask as they enter)', () => {
  test('its controller chooses the amount, loses it, and the token makes a token of that size', () => {
    const g = scenario()
      .define(PROCESSOR)
      .define(COPIER)
      .seat(0)
      .life(30)
      .hand(COPIER.name)
      .battlefield(PROCESSOR.name, { chosen: { lifePaid: 2 } })
      .battlefield('Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();
    g.act(0).cast(COPIER.name, { targets: [{ name: PROCESSOR.name, seat: 0 }], pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the question');
    expect(d.purpose).toBe('lifePaid');
    expect(d.options).toHaveLength(31);
    g.act(0).chooseOption('4');
    g.expect.life(0, 26);
    const copies = g.find({ name: PROCESSOR.name, zone: 'battlefield' });
    expect(copies).toHaveLength(2);
    g.expect.invariants();
  });
});
