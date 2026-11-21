/**
 * SYNTHETIC CARDS FOR THE GRAVEYARD PERMISSION OF EACH PERMANENT TYPE (Muldrotha, the Gravetide; `playFromGraveyardEachType`). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of what the real card needs from the engine, written out by hand (the cards package checks that the grammar lowers the real Oracle text to the same node): a
 * creature with the permission, and permanents of every type to play from the graveyard with it. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST
 * does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SYNTHETIC_EACH_TYPE_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Gravetide Avatar',
    manaCost: ['3', 'B', 'G', 'U'],
    types: ['creature'],
    subtypes: ['Elemental', 'Avatar'],
    colors: ['U', 'B', 'G'],
    colorIdentity: ['U', 'B', 'G'],
    power: 6,
    toughness: 6,
    oracleText:
      'During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard.',
    abilities: [{ kind: 'static', static: { kind: 'playFromGraveyardEachType' } }],
  }),
  singleFace({
    name: 'SYNTHETIC Gear Golem',
    manaCost: ['2'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Cog Golem',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 3,
    toughness: 3,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Brass Relic',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Brass Idol',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Hushed Chapel',
    manaCost: ['1', 'W'],
    types: ['enchantment'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Wandering Sage',
    manaCost: ['2', 'U'],
    types: ['planeswalker'],
    subtypes: ['Sage'],
    colors: ['U'],
    colorIdentity: ['U'],
    loyalty: 3,
    oracleText: '',
  }),
  singleFace({
    name: 'SYNTHETIC Bone Heap',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'You gain 1 life.',
    spell: { targets: [], effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 } },
  }),
];
