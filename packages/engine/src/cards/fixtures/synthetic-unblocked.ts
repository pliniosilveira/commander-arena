/**
 * SYNTHETIC CARD FOR "WHENEVER ONE OR MORE CREATURES AN OPPONENT CONTROLS ATTACK YOU AND AREN'T BLOCKED, THAT PLAYER DRAWS CARDS AND GAINS CONTROL OF ~. UNTAP IT". NOT A REAL MAGIC CARD.
 *
 * Invented for the tests of what a real card of that shape needs from the engine: a trigger of the declare blockers step (the engine's `unblockedAttackBatch`) for the creatures
 * of one opponent that attack the controller and have no blocker, whose effect is for the player who attacked (`triggerPlayer`): draw cards, gain control of the
 * permanent and untap it. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and it is not the definition of a real card.
 */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const THAT_PLAYER = { kind: 'triggerPlayer' } as const;

export const SYNTHETIC_UNBLOCKED_LIST: readonly CardDefinition[] = [
  singleFace({
    name: 'SYNTHETIC Greedy Gem',
    manaCost: ['4'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText:
      "Whenever one or more creatures an opponent controls attack you and aren't blocked, that player draws two cards and gains control of this artifact. Untap it.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'unblockedAttackBatch', who: 'opponent' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: THAT_PLAYER, count: 2 },
            { kind: 'gainControl', objects: THIS, player: THAT_PLAYER, duration: 'permanent' },
            { kind: 'untap', objects: THIS },
          ],
        },
      },
    ],
  }),
];
