/**
 * SYNTHETIC KEYWORD CARDS OF BATCH 1. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-104 and D-110: Changeling (CR 702.73), Devoid (CR 702.114),
 * Partner (CR 702.124), Exalted (CR 702.83), Annihilator (CR 702.86), Persist (CR 702.79), Undying (CR
 * 702.93), Infect (CR 702.90), Wither (CR 702.80), Toxic (CR 702.164), Split second (CR 702.61), typecycling
 * (CR 702.29e) and Multikicker (CR 702.33c). Names start with "SYNTHETIC "; oracleId is null. The text
 * describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Cost, Effect } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;
const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });
const ANY_TARGET = { id: 't1', what: { kind: 'anyTarget' } } as const;
const T1 = { kind: 'target', id: 't1' } as const;

const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });

export const SYNTHETIC_KEYWORD_LIST: readonly CardDefinition[] = [
  // Changeling: every creature type, in every zone.
  singleFace({
    name: 'SYNTHETIC Chameleon Drifter',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Shapeshifter'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: 'Changeling (This card is every creature type.)',
    abilities: [kw('changeling')],
  }),
  // Devoid: colorless, but the blue mana symbol stays in its mana cost.
  singleFace({
    name: 'SYNTHETIC Void Wisp',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Eldrazi', 'Drone'],
    colors: [],
    colorIdentity: ['U'],
    power: 2,
    toughness: 1,
    oracleText: 'Devoid (This card has no color.)',
    abilities: [kw('devoid')],
  }),
  // Partner: no effect in the game.
  singleFace({
    name: 'SYNTHETIC Duo Scout',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Scout'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 2,
    oracleText: 'Partner (You can have two commanders if both have partner.)',
    abilities: [kw('partner')],
  }),
  // Exalted on a creature and on a permanent that is not one.
  singleFace({
    name: 'SYNTHETIC Exalted Squire',
    manaCost: ['W'],
    types: ['creature'],
    subtypes: ['Human', 'Soldier'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 1,
    oracleText:
      'Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)',
    abilities: [kw('exalted')],
  }),
  singleFace({
    name: 'SYNTHETIC Exalted Banner',
    manaCost: ['2', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Exalted',
    abilities: [kw('exalted')],
  }),
  // Annihilator 2 and 1.
  singleFace({
    name: 'SYNTHETIC Annihilator Titan',
    manaCost: ['6'],
    types: ['artifact', 'creature'],
    subtypes: ['Eldrazi'],
    colors: [],
    colorIdentity: [],
    power: 5,
    toughness: 5,
    oracleText:
      'Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents.)',
    abilities: [{ kind: 'keyword', keyword: { kind: 'annihilator', count: 2 } }],
  }),
  singleFace({
    name: 'SYNTHETIC Eater Imp',
    manaCost: ['3', 'B'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 3,
    oracleText: 'Annihilator 1',
    abilities: [{ kind: 'keyword', keyword: { kind: 'annihilator', count: 1 } }],
  }),
  // Persist, plain and with a "when this dies" trigger of its own.
  singleFace({
    name: 'SYNTHETIC Persist Bear',
    manaCost: ['2', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText:
      "Persist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)",
    abilities: [kw('persist')],
  }),
  singleFace({
    name: 'SYNTHETIC Persist Wisp',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Spirit'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 2,
    oracleText: 'Persist. When this creature dies, you gain 1 life.',
    abilities: [
      kw('persist'),
      { kind: 'triggered', trigger: { kind: 'dies', what: { kind: 'this' } }, effect: gain(1) },
    ],
  }),
  // Undying.
  singleFace({
    name: 'SYNTHETIC Undying Imp',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText:
      "Undying (When this creature dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)",
    abilities: [kw('undying')],
  }),
  // Infect, with lifelink, with deathtouch, and as a source of noncombat damage.
  singleFace({
    name: 'SYNTHETIC Infect Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText:
      'Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)',
    abilities: [kw('infect')],
  }),
  singleFace({
    name: 'SYNTHETIC Infect Lifelinker',
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 2,
    oracleText: 'Infect, lifelink',
    abilities: [kw('infect'), kw('lifelink')],
  }),
  singleFace({
    name: 'SYNTHETIC Infect Viper',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Snake'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: 'Infect, deathtouch',
    abilities: [kw('infect'), kw('deathtouch')],
  }),
  singleFace({
    name: 'SYNTHETIC Infect Pinger',
    manaCost: ['2'],
    types: ['artifact', 'creature'],
    subtypes: ['Construct'],
    colors: [],
    colorIdentity: [],
    power: 1,
    toughness: 1,
    oracleText: 'Infect. {T}: This creature deals 1 damage to any target.',
    abilities: [
      kw('infect'),
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [ANY_TARGET],
        effect: { kind: 'dealDamage', amount: 1, to: T1 },
      },
    ],
  }),
  // Wither.
  singleFace({
    name: 'SYNTHETIC Wither Imp',
    manaCost: ['1', 'R'],
    types: ['creature'],
    subtypes: ['Imp'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 2,
    toughness: 2,
    oracleText: 'Wither (This deals damage to creatures in the form of -1/-1 counters.)',
    abilities: [kw('wither')],
  }),
  // Toxic.
  singleFace({
    name: 'SYNTHETIC Toxic Rat',
    manaCost: ['B'],
    types: ['creature'],
    subtypes: ['Rat'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: 'Toxic 1 (Players dealt combat damage by this creature also get a poison counter.)',
    abilities: [{ kind: 'keyword', keyword: { kind: 'toxic', count: 1 } }],
  }),
  singleFace({
    name: 'SYNTHETIC Toxic Brute',
    manaCost: ['3', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 3,
    toughness: 3,
    oracleText: 'Toxic 2',
    abilities: [{ kind: 'keyword', keyword: { kind: 'toxic', count: 2 } }],
  }),
  // Split second.
  singleFace({
    name: 'SYNTHETIC Hush Bolt',
    manaCost: ['1', 'R'],
    types: ['instant'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Split second. This spell deals 3 damage to any target.',
    abilities: [kw('splitSecond')],
    spell: { targets: [ANY_TARGET], effect: { kind: 'dealDamage', amount: 3, to: T1 } },
  }),
  singleFace({
    name: 'SYNTHETIC Hush Gain',
    manaCost: ['W'],
    types: ['instant'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: 'Split second. You gain 3 life.',
    abilities: [kw('splitSecond')],
    spell: { effect: gain(3) },
  }),
  // Typecycling: "Basic landcycling {1}" and "Islandcycling {2}".
  singleFace({
    name: 'SYNTHETIC Landcycler Beast',
    manaCost: ['4', 'G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 4,
    toughness: 4,
    oracleText: 'Basic landcycling {1}',
    abilities: [
      {
        kind: 'keyword',
        keyword: {
          kind: 'typecycling',
          filter: { types: ['land'], supertypes: ['basic'] },
          cost: [mana('1')],
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Islandcycler Drake',
    manaCost: ['3', 'U'],
    types: ['creature'],
    subtypes: ['Drake'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText: 'Flying. Islandcycling {2}',
    abilities: [
      kw('flying'),
      {
        kind: 'keyword',
        keyword: { kind: 'typecycling', filter: { subtypes: ['Island'] }, cost: [mana('2')] },
      },
    ],
  }),
  // A land with two basic land types, which Islandcycling finds (and Forestcycling too).
  singleFace({
    name: 'SYNTHETIC Tide Pool',
    manaCost: null,
    types: ['land'],
    subtypes: ['Forest', 'Island'],
    colors: [],
    colorIdentity: ['U', 'G'],
    oracleText: '{T}: Add {G} or {U}.',
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'oneOf', colors: ['G', 'U'] } },
    ],
  }),
  // Multikicker: a counter for each time it was kicked; damage for each time; a cost of life.
  singleFace({
    name: 'SYNTHETIC Strider Cub',
    manaCost: ['G'],
    types: ['creature'],
    subtypes: ['Beast'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText:
      'Multikicker {1}. When this creature enters, put a +1/+1 counter on it for each time it was kicked.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'multikicker', cost: [mana('1')] } },
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'addCounters',
          objects: { kind: 'this' },
          counter: '+1/+1',
          count: { kind: 'timesKicked' },
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Volley Barrage',
    manaCost: ['R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      'Multikicker {1}. This spell deals 1 damage to any target for each time it was kicked.',
    abilities: [{ kind: 'keyword', keyword: { kind: 'multikicker', cost: [mana('1')] } }],
    spell: {
      targets: [ANY_TARGET],
      effect: { kind: 'dealDamage', amount: { kind: 'timesKicked' }, to: T1 },
    },
  }),
  singleFace({
    name: 'SYNTHETIC Blood Tithe',
    manaCost: ['B'],
    types: ['instant'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Multikicker—Pay 2 life. Draw a card for each time it was kicked. If it was kicked, you gain 1 life.',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'multikicker', cost: [{ kind: 'payLife', amount: 2 }] } },
    ],
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count: { kind: 'timesKicked' } },
          { kind: 'conditional', condition: { kind: 'kicked' }, effect: gain(1) },
        ],
      },
    },
  }),
];
