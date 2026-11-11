/**
 * SYNTHETIC CARDS FOR THE COSTS OF ACTIVATED ABILITIES THE ARTIFACTS SLICE ADDS (D-139). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests: an activated ability that costs less for each of something (a count of other artifacts, twice a count of
 * Zombies, a count of cards in a graveyard), an ability that puts a counter on its own permanent as a cost, a state trigger on those
 * counters, an ability that returns a permanent you control to its owner's hand as a cost, and an ability that may be activated only
 * once each turn. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and
 * none of these is the definition of a real card.
 */
import type { Ability, Amount, Cost, Effect } from '../../ast/types';
import type { Color } from '../../characteristics';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

const activated = (
  cost: readonly Cost[],
  effect: Effect,
  extra: Partial<Extract<Ability, { kind: 'activated' }>> = {},
): Ability => ({ kind: 'activated', cost, effect, ...extra });

/** The colors of the colored mana symbols a cost has: they are part of the color identity (CR 903.4). */
const costColors = (cost: readonly Cost[]): Color[] =>
  (['W', 'U', 'B', 'R', 'G'] as const).filter((c) =>
    cost.some((k) => k.kind === 'mana' && k.symbols.includes(c)),
  );

const draw = (count = 1): Effect => ({ kind: 'draw', player: YOU, count });

/** An artifact whose single activated ability reduces its own cost by an amount. */
const lamp = (
  name: string,
  types: readonly ('artifact' | 'creature')[],
  subtypes: readonly string[],
  cost: readonly Cost[],
  effect: Effect,
  amount: Amount,
  oracle: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2'],
    types,
    subtypes,
    colors: [],
    colorIdentity: costColors(cost),
    oracleText: oracle,
    ...(types.includes('creature') ? { power: 1, toughness: 1 } : {}),
    abilities: [activated(cost, effect, { costReducedBy: { amount } })],
  });

const THIS = { kind: 'this' } as const;

/** "When there are N or more <counter> counters on this, <take it away>. If you do, <reward>." (a state trigger, CR 603.8) */
const counterTrigger = (
  counter: string,
  atLeast: number,
  away: Effect,
  reward: Effect,
): Ability => ({
  kind: 'triggered',
  trigger: {
    kind: 'state',
    condition: {
      kind: 'amountIs',
      amount: { kind: 'countersOn', of: THIS, counter },
      compare: { cmp: 'atLeast', value: atLeast },
    },
  },
  effect: {
    kind: 'sequence',
    effects: [away, { kind: 'conditional', condition: { kind: 'didPrevious' }, effect: reward }],
  },
});

/** "You may put a [type] card from your [zone] onto the battlefield." */
const putFrom = (
  zone: 'hand' | 'graveyard',
  type: 'artifact' | 'creature',
  tapped = false,
): Effect => ({
  kind: 'moveToZone',
  objects: {
    kind: 'choose',
    filter: { zone, types: [type], controller: 'you' },
    optional: true,
  },
  to: 'battlefield',
  ...(tapped ? { tapped: true } : {}),
});

const bouncer = (
  name: string,
  types: readonly ('artifact' | 'creature')[],
  subtypes: readonly string[],
  cost: readonly Cost[],
  effect: Effect,
  oracle: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2'],
    types,
    subtypes,
    colors: [],
    colorIdentity: costColors(cost),
    oracleText: oracle,
    ...(types.includes('creature') ? { power: 1, toughness: 2 } : {}),
    abilities: [activated(cost, effect)],
  });

export const SYNTHETIC_ABILITY_COSTS_LIST: readonly CardDefinition[] = [
  // "{5}{U}, {T}: Draw a card. This ability costs {1} less to activate for each other artifact you control."
  lamp(
    'SYNTHETIC Reading Lamp',
    ['artifact'],
    ['Book'],
    [{ kind: 'mana', symbols: ['5', 'U'] }, { kind: 'tap' }],
    draw(),
    { kind: 'countOf', filter: { types: ['artifact'], controller: 'you', other: true } },
    '{5}{U}, {T}: Draw a card. This ability costs {1} less to activate for each other artifact you control.',
  ),
  // "{6}: You gain 3 life. This ability costs {2} less to activate for each other Zombie you control."
  lamp(
    'SYNTHETIC Zombie Furnace',
    ['artifact'],
    [],
    [{ kind: 'mana', symbols: ['6'] }],
    { kind: 'gainLife', player: YOU, amount: 3 },
    {
      kind: 'multiple',
      factor: 2,
      of: { kind: 'countOf', filter: { subtypes: ['Zombie'], controller: 'you', other: true } },
    },
    '{6}: You gain 3 life. This ability costs {2} less to activate for each other Zombie you control.',
  ),
  // "{4}, {T}: Draw a card. This ability costs {1} less to activate for each creature card in your graveyard."
  lamp(
    'SYNTHETIC Grave Lamp',
    ['artifact'],
    [],
    [{ kind: 'mana', symbols: ['4'] }, { kind: 'tap' }],
    draw(),
    { kind: 'countOf', filter: { zone: 'graveyard', types: ['creature'], controller: 'you' } },
    '{4}, {T}: Draw a card. This ability costs {1} less to activate for each creature card in your graveyard.',
  ),
  // ---- Counters as a cost and a state trigger on them (CR 603.8)
  singleFace({
    name: 'SYNTHETIC Reading Tome',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Book'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{T}, Put a page counter on this artifact: Scry 1. {2}, {T}, Put a page counter on this artifact: Draw a card. When there are four or more page counters on this artifact, exile it. If you do, you gain 4 life.',
    abilities: [
      activated([{ kind: 'tap' }, { kind: 'putCounters', counter: 'page', count: 1 }], {
        kind: 'scry',
        count: 1,
      }),
      activated(
        [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'tap' },
          { kind: 'putCounters', counter: 'page', count: 1 },
        ],
        draw(),
      ),
      counterTrigger(
        'page',
        4,
        { kind: 'exile', objects: THIS },
        { kind: 'gainLife', player: YOU, amount: 4 },
      ),
    ],
  }),
  // "{1}, Put a lore counter on this artifact: You gain 1 life. When there are three or more lore counters on this artifact, sacrifice it. If you do, draw two cards."
  singleFace({
    name: 'SYNTHETIC Lore Idol',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{1}, Put a lore counter on this artifact: You gain 1 life. When there are three or more lore counters on this artifact, sacrifice it. If you do, draw two cards.',
    abilities: [
      activated(
        [
          { kind: 'mana', symbols: ['1'] },
          { kind: 'putCounters', counter: 'lore', count: 1 },
        ],
        { kind: 'gainLife', player: YOU, amount: 1 },
      ),
      counterTrigger('lore', 3, { kind: 'sacrifice', objects: THIS }, draw(2)),
    ],
  }),
  // "{2}, Put two ember counters on this artifact: Draw a card." and the trigger with a count of 2 (one activation reaches it).
  singleFace({
    name: 'SYNTHETIC Ember Urn',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      '{2}, Put two ember counters on this artifact: Draw a card. When there are three or more ember counters on this artifact, exile it. If you do, you gain 2 life.',
    abilities: [
      activated(
        [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'putCounters', counter: 'ember', count: 2 },
        ],
        draw(),
      ),
      counterTrigger(
        'ember',
        3,
        { kind: 'exile', objects: THIS },
        { kind: 'gainLife', player: YOU, amount: 2 },
      ),
    ],
  }),
  // A state trigger that is not about counters: "When you have 30 or more life, exile this. If you do, draw a card."
  singleFace({
    name: 'SYNTHETIC Pride Statue',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'When you have 30 or more life, exile this artifact. If you do, draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: {
          kind: 'state',
          condition: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 30 } },
        },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exile', objects: THIS },
            { kind: 'conditional', condition: { kind: 'didPrevious' }, effect: draw() },
          ],
        },
      },
    ],
  }),
  // ---- Returning a permanent you control to its owner's hand as a cost
  // "{U}, {T}, Return an artifact you control to its owner's hand: You may put an artifact card from your hand onto the battlefield."
  bouncer(
    'SYNTHETIC Ferry Mage',
    ['artifact', 'creature'],
    ['Human'],
    [
      { kind: 'mana', symbols: ['U'] },
      { kind: 'tap' },
      { kind: 'returnToHand', what: { types: ['artifact'], controller: 'you' } },
    ],
    putFrom('hand', 'artifact'),
    "{U}, {T}, Return an artifact you control to its owner's hand: You may put an artifact card from your hand onto the battlefield.",
  ),
  // "{2}, Return a creature you control to its owner's hand: You may put a creature card from your hand onto the battlefield tapped."
  bouncer(
    'SYNTHETIC Swap Lodge',
    ['artifact'],
    [],
    [
      { kind: 'mana', symbols: ['2'] },
      { kind: 'returnToHand', what: { types: ['creature'], controller: 'you' } },
    ],
    putFrom('hand', 'creature', true),
    "{2}, Return a creature you control to its owner's hand: You may put a creature card from your hand onto the battlefield tapped.",
  ),
  // "{1}, Return two lands you control to their owner's hand: You may put a creature card from your graveyard onto the battlefield."
  bouncer(
    'SYNTHETIC Tide Shrine',
    ['artifact'],
    [],
    [
      { kind: 'mana', symbols: ['1'] },
      { kind: 'returnToHand', what: { types: ['land'], controller: 'you' }, count: 2 },
    ],
    putFrom('graveyard', 'creature'),
    "{1}, Return two lands you control to their owner's hand: You may put a creature card from your graveyard onto the battlefield.",
  ),
  // "{T}, Return this artifact to its owner's hand: Draw a card."
  bouncer(
    'SYNTHETIC Fleeting Lens',
    ['artifact'],
    [],
    [{ kind: 'tap' }, { kind: 'returnToHand', what: THIS }],
    draw(),
    "{T}, Return this artifact to its owner's hand: Draw a card.",
  ),
];
