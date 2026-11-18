// Cost reductions for spells that name a keyword ("Creature spells with flying you cast cost {1} less to cast", Warden of Evos Isle): the filter of the reduction
// says `keywords: ['flying']`, read from the spell as it is on the stack (the card's own abilities, as `derive` gives them to a stack object).
// Pins: CR 118.7a (only generic mana is reduced), CR 601.2f (the total cost is determined with the spell's characteristics on the stack, then reduced), CR 604.2 (a static
// ability of a permanent on the battlefield works for the spells its controller casts), CR 702.9a (flying). Cards are SYNTHETIC: the AST is written by hand.
import { describe, expect, test } from 'vitest';
import type { ObjectFilter } from '../src/ast/types';
import { kw, singleFace } from '../src/cards/fixtures/helpers';
import { type CardDefinition, getView, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WARDEN = 'SYNTHETIC Sky Warden'; // 2/2 flying: creature spells with flying you cast cost {1} less
const FLYER = 'SYNTHETIC Cloud Bird'; // {2}{U} creature, flying
const GROUND = 'SYNTHETIC Plain Mole'; // {2}{U} creature, no flying
const GLIDER = 'SYNTHETIC Glide Charm'; // {2}{U} instant with flying (a noncreature spell)
const BIG = 'SYNTHETIC Big Cloud'; // {X}{U} creature, flying
const LORD = 'SYNTHETIC Wing Lord'; // creatures you control have flying

const spells: ObjectFilter = { types: ['creature'], keywords: ['flying'], controller: 'you' };

const WARDEN_CARD = singleFace({
  name: WARDEN,
  manaCost: ['2', 'U'],
  types: ['creature'],
  subtypes: ['Bird'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 2,
  toughness: 2,
  oracleText: 'Flying\nCreature spells with flying you cast cost {1} less to cast.',
  abilities: [
    kw('flying'),
    { kind: 'static', static: { kind: 'costReduction', spells, amount: 1 } },
  ],
});
const creature = (
  name: string,
  mana: string[],
  abilities: CardDefinition['faces'][number]['abilities'],
) =>
  singleFace({
    name,
    manaCost: mana,
    types: ['creature'],
    subtypes: ['Bird'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 1,
    toughness: 1,
    oracleText: 'SYNTHETIC',
    abilities: [...abilities],
  });
const CARDS: readonly CardDefinition[] = [
  WARDEN_CARD,
  creature(FLYER, ['2', 'U'], [kw('flying')]),
  creature(GROUND, ['2', 'U'], []),
  creature(BIG, ['X', 'U'], [kw('flying')]),
  creature(
    LORD,
    ['2', 'U'],
    [
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'flying' },
        },
      },
    ],
  ),
  singleFace({
    name: GLIDER,
    manaCost: ['2', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'SYNTHETIC',
    abilities: [kw('flying')],
    spell: { targets: [], effect: { kind: 'gainLife', amount: 1, player: { kind: 'you' } } },
  }),
];

function costOf(g: ScenarioGame, name: string, seat = 0): readonly string[] | undefined {
  const s = getView(g.state, seat).seats[seat];
  return [...(s?.hand ?? [])].find((o) => o.name === name)?.castCost;
}

function game(opts: {
  wardens?: number;
  mine?: readonly string[];
  theirs?: readonly string[];
  extra?: readonly string[];
}) {
  const b = scenario();
  for (const c of CARDS) b.define(c);
  b.seat(0)
    .hand(...(opts.mine ?? []))
    .battlefield('Island', { count: 4 });
  for (let i = 0; i < (opts.wardens ?? 0); i++) b.battlefield(WARDEN);
  for (const e of opts.extra ?? []) b.battlefield(e);
  b.seat(1)
    .hand(...(opts.theirs ?? []))
    .battlefield('Island', { count: 4 });
  return b.at('precombatMain', { active: 0, turn: 1 }).build();
}

describe('"Creature spells with flying you cast cost {1} less to cast"', () => {
  test('the card validates', () => {
    expect(validateCard(WARDEN_CARD)).toEqual([]);
  });

  test('a creature spell with flying costs {1} less, a creature spell without flying does not', () => {
    const g = game({ wardens: 1, mine: [FLYER, GROUND] });
    expect(costOf(g, FLYER)).toEqual(['1', 'U']);
    expect(costOf(g, GROUND)).toEqual(['2', 'U']);
  });

  test('without the Warden nothing is reduced', () => {
    const g = game({ mine: [FLYER] });
    expect(costOf(g, FLYER)).toEqual(['2', 'U']);
  });

  test('a noncreature spell that has flying is not a creature spell: no reduction', () => {
    const g = game({ wardens: 1, mine: [GLIDER] });
    expect(costOf(g, GLIDER)).toEqual(['2', 'U']);
  });

  test('flying granted to creatures on the battlefield does not make a creature spell in hand a spell with flying', () => {
    const g = game({ wardens: 1, mine: [GROUND], extra: [LORD] });
    expect(costOf(g, GROUND)).toEqual(['2', 'U']);
  });

  test("the opponent's spell with flying is not reduced, and my Warden does not reduce it", () => {
    const g = game({ wardens: 1, mine: [FLYER], theirs: [FLYER] });
    expect(costOf(g, FLYER, 1)).toEqual(['2', 'U']);
    expect(costOf(g, FLYER, 0)).toEqual(['1', 'U']);
  });

  test('only generic mana is reduced: the colored part stays however many Wardens', () => {
    const g = game({ wardens: 3, mine: [FLYER] });
    expect(costOf(g, FLYER)).toEqual(['U']);
  });

  test('two Wardens stack', () => {
    const g = game({ wardens: 2, mine: [FLYER] });
    expect(costOf(g, FLYER)).toEqual(['U']);
  });

  test('the reduced cost is what is paid: Warden plus two Islands cast a {2}{U} flyer', () => {
    const b = scenario();
    for (const c of CARDS) b.define(c);
    b.seat(0).hand(FLYER).battlefield('Island', { count: 2 }).battlefield(WARDEN);
    const g = b.seat(1).at('precombatMain', { active: 0, turn: 1 }).build();
    g.expect.legal(0, { cast: FLYER });
    g.act(0).cast(FLYER, { pay: true });
    g.expect.stack([FLYER]);
    expect(g.find({ name: 'Island', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(2);
  });

  test('a flyer with an {X} cost: the reduction takes generic mana off the cost with X announced (CR 601.2f)', () => {
    const b = scenario();
    for (const c of CARDS) b.define(c);
    b.seat(0).hand(BIG).battlefield('Island', { count: 3 }).battlefield(WARDEN);
    const g = b.seat(1).at('precombatMain', { active: 0, turn: 1 }).build();
    // X = 2: {2}{U} less {1} is {1}{U}, two Islands.
    g.act(0).cast(BIG, { x: 2, pay: true });
    g.expect.stack([BIG]);
    expect(g.find({ name: 'Island', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(2);
  });
});
