/**
 * SYNTHETIC CARDS FOR "ADDITIONAL BEGINNING PHASE". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-1130 to D-1139 (group 7 of the Hashaton deck): the effect `extraBeginningPhase` that adds a whole beginning phase (untap, upkeep and
 * draw steps) directly after the postcombat main phase it is said in (CR 500.8, 500.10). Names start with "SYNTHETIC "; oracleId is null. The text describes what the
 * AST does; it is not Oracle text, and none of these is the definition of a real card (the real card, Sphinx of the Second Sun, is read from its Oracle text by
 * the grammar in the tests of the cards package).
 */
import type { CardDefinition } from '../definition';
import { kw, singleFace } from './helpers';

export const SYNTHETIC_HASHATON_G7_LIST: readonly CardDefinition[] = [
  // "Flying. At the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase." (cheap, so a scenario can cast it)
  singleFace({
    name: 'SYNTHETIC Second Sun Sphinx',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Sphinx'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText:
      'Flying\nAt the beginning of each of your postcombat main phases, there is an additional beginning phase after this phase.',
    abilities: [
      kw('flying'),
      {
        kind: 'triggered',
        trigger: { kind: 'step', step: 'main2', whose: 'you' },
        effect: { kind: 'extraBeginningPhase' },
      },
    ],
  }),
];
