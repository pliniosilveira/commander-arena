// Espers to Magicite (deck-support issue 97): "Exile each opponent's graveyard. When you do, choose up to one target creature card exiled this way. Create a token that's a copy of that
// card, except it's an artifact and it loses all other card types." A `reflexive` ability with `ifMoved` (created when the exile moved a card) and `carriesMoved`, whose target slot is a
// creature card `exiledThisWay`, and a token `copyOf` with `setTypes`.
// Pins: CR 603.12 (the reflexive ability is a triggered ability of its own: its target is chosen as it goes on the stack, among the cards exiled by the resolution that created it),
// CR 400.7 and 400.7j (a card that left exile is a new object; what the effect moved), CR 707.9b (the exception is part of the copiable values), CR 603.3d (an ability with no legal target
// is removed), CR 101.4 (each opponent, never one in particular).
// Cards: the SYNTHETIC cards of this file, the real Grizzly Bears and Plains.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { manaValueOfCost } from '../src/rules/mana-value';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const RITE = 'SYNTHETIC Esper Rite';
const BEARS = 'Grizzly Bears';
const BIRD = 'SYNTHETIC Etb Bird'; // creature with "When this creature enters, you gain 3 life."
const X_MAN = 'SYNTHETIC X Man'; // creature with {X}{G} and power 1+X... printed 1/1
const TOME = 'SYNTHETIC Dull Tome'; // an artifact card, no creature
const LIBRARY = Array.from({ length: 10 }, () => 'Plains');

const rite = (extra: Record<string, unknown> = {}) =>
  singleFaceCard({
    name: RITE,
    manaCost: ['3', 'B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'SYNTHETIC text of Espers to Magicite',
    spell: {
      targets: [],
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'exile',
            objects: {
              kind: 'each',
              filter: { zone: 'graveyard', owner: { kind: 'eachOpponent' } },
            },
          },
          {
            kind: 'reflexive',
            carriesMoved: true,
            ifMoved: true,
            targets: [
              {
                id: 't1',
                what: {
                  kind: 'object',
                  filter: { zone: 'exile', types: ['creature'], exiledThisWay: true },
                },
                min: 0,
                max: 1,
              },
            ],
            effect: {
              kind: 'createToken',
              token: {
                kind: 'copyOf',
                object: { kind: 'target', id: 't1' },
                setTypes: ['artifact'],
                ...extra,
              },
              count: 1,
            },
          },
        ],
      },
    } as never,
  });

const bird = singleFaceCard({
  name: BIRD,
  manaCost: ['1', 'W'],
  types: ['creature'],
  subtypes: ['Bird'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 1,
  toughness: 1,
  oracleText: 'When this creature enters, you gain 3 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
    },
  ],
});

const xMan = singleFaceCard({
  name: X_MAN,
  manaCost: ['X', 'G'],
  types: ['creature'],
  subtypes: ['Elemental'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 1,
  toughness: 1,
  oracleText: '',
  abilities: [],
});

const tome = singleFaceCard({
  name: TOME,
  manaCost: ['2'],
  types: ['artifact'],
  colors: [],
  colorIdentity: [],
  oracleText: '',
  abilities: [],
});

const board = (opts: {
  seats?: 2 | 3;
  graveyards: readonly (readonly string[])[];
  mine?: readonly string[];
}) => {
  const seats = opts.seats ?? 2;
  const b = scenario({ seats })
    .define(rite())
    .define(bird)
    .define(xMan)
    .define(tome)
    .seat(0)
    .hand(RITE)
    .library(...LIBRARY)
    .battlefield('Swamp', { count: 4 });
  for (const card of opts.mine ?? []) b.graveyard(card);
  for (let s = 1; s < seats; s += 1) {
    b.seat(s as 1 | 2).library(...LIBRARY);
    for (const card of opts.graveyards[s - 1] ?? []) b.graveyard(card);
  }
  return b.at('precombatMain', { active: 0, turn: 1 }).build();
};

type Game = ReturnType<typeof board>;

const tokens = (g: Game) =>
  Object.values(g.state.objects).filter((o) => o.zone === 'battlefield' && o.token !== null);

describe('the card validates, and the new shapes are what the validator accepts', () => {
  test('the SYNTHETIC rite', () => {
    expect(validateCard(rite())).toEqual([]);
  });

  test('ifMoved needs carriesMoved and an effect that moves objects before it', () => {
    const card = rite();
    const face = card.faces[0];
    const spell = face?.spell;
    if (face === undefined || spell === null || spell === undefined) throw new Error('no spell');
    const only = (effect: unknown) =>
      ({ ...card, faces: [{ ...face, spell: { ...spell, effect } }] }) as never;
    const reflexive = {
      kind: 'reflexive',
      ifMoved: true,
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    };
    expect(validateCard(only(reflexive)).length).toBeGreaterThan(0);
    expect(validateCard(only({ kind: 'sequence', effects: [reflexive] })).length).toBeGreaterThan(
      0,
    );
    expect(
      validateCard(
        only({
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: { kind: 'each', filter: { zone: 'graveyard' } } },
            { ...reflexive, carriesMoved: true },
          ],
        }),
      ),
    ).toEqual([]);
  });

  test('a slot for a card exiled this way needs the reflexive ability to carry what was moved, in exile', () => {
    const card = rite();
    const face = card.faces[0];
    const spell = face?.spell;
    if (face === undefined || spell === null || spell === undefined) throw new Error('no spell');
    const effects = (spell.effect as unknown as { effects: Record<string, unknown>[] }).effects;
    const reflexive = effects[1];
    if (reflexive === undefined) throw new Error('no reflexive');
    const with_ = (patch: Record<string, unknown>) =>
      ({
        ...card,
        faces: [
          {
            ...face,
            spell: {
              ...spell,
              effect: { kind: 'sequence', effects: [effects[0], { ...reflexive, ...patch }] },
            },
          },
        ],
      }) as never;
    expect(
      validateCard(with_({ carriesMoved: undefined, ifMoved: undefined })).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        with_({
          targets: [
            {
              id: 't1',
              what: { kind: 'object', filter: { zone: 'graveyard', exiledThisWay: true } },
              min: 0,
              max: 1,
            },
          ],
        }),
      ).length,
    ).toBeGreaterThan(0);
  });

  test('a copy gets its card types instead of its own (setTypes), not both ways', () => {
    expect(validateCard(rite({ addTypes: ['enchantment'] })).length).toBeGreaterThan(0);
    expect(validateCard(rite({ setTypes: [] })).length).toBeGreaterThan(0);
  });
});

describe("\"Exile each opponent's graveyard. When you do, choose up to one target creature card exiled this way. Create a token that's a copy of that card, except it's an artifact and it loses all other card types.\" (CR 603.12, 707.9b)", () => {
  const cast = (g: Game) => {
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
  };

  test('the opponent graveyard is exiled, and the token is an artifact that is no creature', () => {
    const g = board({ graveyards: [[BEARS, TOME]] });
    cast(g);
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(TOME, 'exile', { seat: 1 });
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    const [token] = tokens(g);
    expect(tokens(g)).toHaveLength(1);
    if (token === undefined) throw new Error('no token');
    expect(token.token?.characteristics.name).toBe(BEARS);
    expect(derive(g.state, token).types).toEqual(['artifact']);
    expect(token.token?.characteristics.subtypes).toEqual([]);
    // It is a copy of the card as it was printed (CR 707.9b): the colors and the cost stay.
    expect(token.token?.characteristics.colors).toEqual(['G']);
    g.expect.zone(BEARS, 'exile', { seat: 1 });
  });

  test('your own graveyard is not exiled', () => {
    const g = board({ graveyards: [[BEARS]], mine: [BIRD] });
    cast(g);
    g.expect.zone(BIRD, 'graveyard', { seat: 0 });
  });

  test('only a creature card exiled this way can be chosen: an artifact card cannot', () => {
    const g = board({ graveyards: [[TOME]] });
    cast(g);
    g.expect.zone(TOME, 'exile', { seat: 1 });
    // No creature card was exiled, so the reflexive ability has nothing to choose and does nothing (CR 603.3d), or never makes a token.
    g.passAll();
    expect(tokens(g)).toHaveLength(0);
  });

  test('a creature card that was in exile before is not exiled this way', () => {
    const b = scenario()
      .define(rite())
      .define(tome)
      .seat(0)
      .hand(RITE)
      .library(...LIBRARY)
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .library(...LIBRARY)
      .graveyard(TOME)
      .exile(BEARS)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    b.act(0).cast(RITE, { pay: true });
    b.passAll();
    // The creature card that was already in exile is not a legal target: only the cards this resolution exiled are.
    expect(() => b.act(0).chooseTargets(BEARS)).toThrow();
  });

  test('up to one: with three seats every opponent graveyard is exiled and one card is copied', () => {
    const g = board({ seats: 3, graveyards: [[BEARS], [BIRD]] });
    cast(g);
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(BIRD, 'exile', { seat: 2 });
    g.act(0).chooseTargets(BIRD);
    g.passAll();
    expect(tokens(g)).toHaveLength(1);
    expect(tokens(g)[0]?.token?.characteristics.name).toBe(BIRD);
  });

  test('the token has the enters abilities of the card, and they trigger (CR 707.9b)', () => {
    const g = board({ graveyards: [[BIRD]] });
    const life = g.state.seats[0]?.life;
    cast(g);
    g.act(0).chooseTargets(BIRD);
    g.passAll();
    g.passAll();
    expect(g.state.seats[0]?.life).toBe((life ?? 0) + 3);
  });

  test('X in the mana cost of the copied card is 0 (CR 107.3)', () => {
    const g = board({ graveyards: [[X_MAN]] });
    cast(g);
    g.act(0).chooseTargets(X_MAN);
    g.passAll();
    const [token] = tokens(g);
    if (token === undefined) throw new Error('no token');
    expect(token.token?.characteristics.name).toBe(X_MAN);
    expect(manaValueOfCost(token.token?.characteristics.manaCost ?? null, token)).toBe(1);
  });

  test('empty opponent graveyards: nothing is exiled and the reflexive ability is not created', () => {
    const g = board({ graveyards: [[]] });
    cast(g);
    g.expect.stack([]);
    expect(tokens(g)).toHaveLength(0);
  });
});
