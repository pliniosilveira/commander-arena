// Planeswalker Party deck (issue 132), group 3: "the number of players who control more lands than you" (Oreskos Explorer's X). The lines are SYNTHETIC; the card is in
// scenario-planeswalker-party-g3.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const SIBLINGS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'When ~ enters, search your library for up to X Plains cards, where X is the number of players who control more lands than you, put them into your hand, then shuffle.',
    expect: OK,
    note: 'SYNTHETIC: the amount in a search',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, draw X cards, where X is the number of players who control more creatures than you.',
    expect: OK,
    note: 'SYNTHETIC: another kind of permanent',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'When ~ enters, draw X cards, where X is the number of players who control more lands you control than you.',
    expect: no(
      ', where X is the number of players who control more lands you control than you.',
      'effect.draw',
    ),
    note: 'SYNTHETIC: a kind with a controller of its own is not read',
  },
];

runCorpus('Planeswalker Party g3: siblings', SIBLINGS);
runCorpus('Planeswalker Party g3: unread', UNREAD);
