/**
 * SYNTHETIC CARDS FOR "DISCARD N CARDS UNLESS YOU DISCARD A <FILTER> CARD" AND "LOOK AT THE TOP N CARDS ... YOU MAY REVEAL A <FILTER> CARD". NOT REAL
 * MAGIC CARDS.
 *
 * Invented for the tests of D-139 (the Artifacts slice): a draw followed by a discard that one card of a kind can replace, over several
 * filters (an artifact card, a creature card), and spells and an Equipment's attack trigger that look at the top cards of the library and
 * take the cards of a kind into the hand (an artifact card, up to two creature cards, a land card), the rest going to the bottom in a
 * random order or into the graveyard. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not
 * Oracle text, and none of these is the definition of a real card.
 */
import type { Effect, ObjectFilter } from '../../ast/types';
import type { CardType } from '../../characteristics';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

/** "Draw N cards. Then discard M cards unless you discard a [type] card." */
const rite = (name: string, draw: number, discard: number, type: CardType): CardDefinition =>
  singleFace({
    name,
    manaCost: ['2', 'U'],
    types: ['instant'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: `Draw ${draw} cards. Then discard ${discard} cards unless you discard ${type === 'artifact' ? 'an' : 'a'} ${type} card.`,
    spell: {
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: YOU, count: draw },
          { kind: 'discard', player: YOU, count: discard, unless: { types: [type] } },
        ],
      },
    },
  });

const look = (
  count: number,
  filter: ObjectFilter,
  max: number,
  rest: 'bottomRandom' | 'graveyard',
): Effect => ({ kind: 'lookAtTop', count, take: { filter, max }, rest });

/** A sorcery: "Look at the top N cards of your library. You may reveal [up to M] [filter] card[s] from among them and put [it | them] into your hand. [Put the rest ...]" */
const sketch = (
  name: string,
  count: number,
  filter: ObjectFilter,
  max: number,
  rest: 'bottomRandom' | 'graveyard',
  oracle: string,
): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1', 'U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: oracle,
    spell: { effect: look(count, filter, max, rest) },
  });

export const SYNTHETIC_LIBRARY_ARTIFACTS_LIST: readonly CardDefinition[] = [
  rite('SYNTHETIC Study Rite', 3, 2, 'artifact'),
  rite('SYNTHETIC Beast Rite', 2, 2, 'creature'),
  sketch(
    'SYNTHETIC Artifact Sketch',
    6,
    { types: ['artifact'] },
    1,
    'bottomRandom',
    'Look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.',
  ),
  sketch(
    'SYNTHETIC Beast Sketch',
    4,
    { types: ['creature'] },
    2,
    'graveyard',
    'Look at the top four cards of your library. You may reveal up to two creature cards from among them and put them into your hand. Put the rest into your graveyard.',
  ),
  sketch(
    'SYNTHETIC Land Sketch',
    3,
    { types: ['land'] },
    1,
    'bottomRandom',
    'Look at the top three cards of your library. You may reveal a land card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.',
  ),
  // "Equipped creature gets +1/+1. Whenever equipped creature attacks, look at the top six cards ... artifact card ..."
  singleFace({
    name: 'SYNTHETIC Scout Gear',
    manaCost: ['2'],
    types: ['artifact'],
    subtypes: ['Equipment'],
    colors: [],
    colorIdentity: [],
    oracleText:
      'Equipped creature gets +1/+1. Whenever equipped creature attacks, look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. Equip {3}',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: { kind: 'attached', types: ['creature'] },
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'attached' } },
        effect: look(6, { types: ['artifact'] }, 1, 'bottomRandom'),
      },
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['3'] }] } },
    ],
  }),
];
