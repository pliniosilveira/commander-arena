// Planeswalker Party deck (issue 132), group 1: "that aren't legendary" after a group. The REAL line is the Oracle text of Urza's Ruinous Blast with the reminder text
// removed (a legendary sorcery's cast restriction is read from the type line); the rest are SYNTHETIC siblings and near misses.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const REAL: readonly Line[] = [
  {
    kind: 'sorcery',
    text: "Exile all nonland permanents that aren't legendary.",
    expect: OK,
    note: "Urza's Ruinous Blast",
  },
];

const SIBLINGS: readonly Line[] = [
  {
    kind: 'sorcery',
    text: "Destroy all creatures that aren't legendary.",
    expect: OK,
    note: 'SYNTHETIC: another effect over the same group',
  },
  {
    kind: 'sorcery',
    text: "Exile all other creatures you control that aren't legendary.",
    expect: OK,
    note: 'SYNTHETIC: "other" and a controller',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'sorcery',
    text: "Exile all nonland permanents that aren't snow.",
    expect: no("that aren't snow.", 'noun.all-permanents'),
    note: 'SYNTHETIC: another supertype is not read',
  },
];

runCorpus('Planeswalker Party g1: the card', REAL);
runCorpus('Planeswalker Party g1: siblings', SIBLINGS);
runCorpus('Planeswalker Party g1: unread', UNREAD);
