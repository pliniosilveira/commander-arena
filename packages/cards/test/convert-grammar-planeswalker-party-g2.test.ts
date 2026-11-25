// Planeswalker Party deck (issue 132), group 2: prevention by a permanent and prevention for its controller. The REAL line is the Oracle text of Fog Bank (The Wanderer, a planeswalker, is in
// scenario-planeswalker-party-g2.test.ts); the siblings and near misses are SYNTHETIC.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const REAL: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Defender\nFlying\nPrevent all combat damage that would be dealt to and dealt by ~.',
    expect: OK,
    note: 'Fog Bank',
    stats: ['0', '2'],
  },
];

const SIBLINGS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Prevent all combat damage that would be dealt by ~.',
    expect: OK,
    note: 'SYNTHETIC: only by the permanent',
    stats: ['3', '3'],
  },
  {
    kind: 'creature',
    text: 'Prevent all damage that would be dealt to you and other permanents you control.',
    expect: OK,
    note: 'SYNTHETIC: all damage',
    stats: ['3', '3'],
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Prevent all noncombat damage that would be dealt to you and other creatures you control.',
    expect: no(
      'Prevent all noncombat damage that would be dealt to you and other creatures you control.',
      'none',
    ),
    note: 'SYNTHETIC: only permanents are read',
    stats: ['3', '3'],
  },
];

runCorpus('Planeswalker Party g2: the cards', REAL);
runCorpus('Planeswalker Party g2: siblings', SIBLINGS);
runCorpus('Planeswalker Party g2: unread', UNREAD);
