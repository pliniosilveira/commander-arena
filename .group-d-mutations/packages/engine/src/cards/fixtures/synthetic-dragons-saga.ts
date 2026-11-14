/**
 * SYNTHETIC CARDS FOR READ AHEAD AND "DISCARD ANY NUMBER, THEN DRAW THAT MANY". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-151 (the Dragons slice): a Saga with Read ahead (CR 702.155, 714.3b), whose chapters deal damage to each creature and
 * each opponent, discard any number of cards and then draw that many (`discard` with `anyNumber`, the `thisWay` amount `discarded`), and create a
 * token. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the
 * definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

const YOU = { kind: 'you' } as const;

export const SYNTHETIC_DRAGONS_SAGA_LIST: readonly CardDefinition[] = [
  // "Read ahead. I — This Saga deals 2 damage to each creature and each opponent. II — Discard any number of cards, then draw that many cards.
  //  III — Create a 3/3 token."
  (() => {
    const base = singleFace({
      name: 'SYNTHETIC Reading Rite',
      manaCost: ['2', 'R', 'R'],
      types: ['enchantment'],
      subtypes: ['Saga'],
      colors: ['R'],
      colorIdentity: ['R'],
      oracleText:
        'Read ahead\nI — This Saga deals 2 damage to each creature and each opponent.\nII — Discard any number of cards, then draw that many cards.\nIII — Create a 3/3 Golem artifact creature token.',
      abilities: [
        kw('readAhead'),
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 1, to: 1 },
          effect: {
            kind: 'sequence',
            effects: [
              {
                kind: 'dealDamage',
                amount: 2,
                to: { kind: 'each', filter: { types: ['creature'] } },
              },
              { kind: 'dealDamage', amount: 2, to: { kind: 'eachOpponent' } },
            ],
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 2, to: 2 },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'discard', player: YOU, count: 0, anyNumber: true },
              { kind: 'draw', player: YOU, count: { kind: 'thisWay', what: 'discarded' } },
            ],
          },
        },
        {
          kind: 'triggered',
          trigger: { kind: 'chapter', from: 3, to: 3 },
          effect: {
            kind: 'createToken',
            count: 1,
            token: {
              kind: 'custom',
              definition: {
                name: 'Golem',
                manaCost: null,
                supertypes: [],
                types: ['artifact', 'creature'],
                subtypes: ['Golem'],
                colors: [],
                power: 3,
                toughness: 3,
                loyalty: null,
                defense: null,
                oracleText: '',
                abilities: [],
              },
            },
          },
        },
      ],
    });
    const face = base.faces[0];
    if (face === undefined) throw new Error('SYNTHETIC Reading Rite has no face');
    return { ...base, layout: 'saga' as const, faces: [{ ...face, finalChapter: 3 }] };
  })(),
];
