/** Sauron's Ransom (issue 57); Oracle text is from the issue corpus, with private pile choices. */
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

export const SAURONS_RANSOM_FIXTURE: CardDefinition = singleFace({
  name: "Sauron's Ransom",
  manaCost: ['1', 'U', 'B'],
  types: ['instant'],
  colors: ['U', 'B'],
  colorIdentity: ['U', 'B'],
  oracleText:
    'Choose an opponent. They look at the top four cards of your library and separate them into a face-down pile and a face-up pile. Put one pile into your hand and the other into your graveyard. The Ring tempts you.',
  spell: {
    effect: {
      kind: 'sequence',
      effects: [
        {
          kind: 'revealAndSeparate',
          count: 4,
          separator: 'opponent',
          chosenTo: 'hand',
          otherTo: 'graveyard',
          faceDownPile: true,
        },
        { kind: 'ringTempts' },
      ],
    },
  },
});
