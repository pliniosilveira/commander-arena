// The template corpus of issue 144 (Witch's Mark, Redcap Gutter-Dweller, Howlsquad Heavy). The first group is the Oracle text of the three cards as the issue gives it, with the name
// replaced by ~; the siblings, the variants and the near misses are SYNTHETIC. Each line says whether it must import as supported, or where and why it stops, so a change that makes
// the grammar read less OR more than it should fails here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const REAL: readonly Line[] = [
  {
    kind: 'instant',
    text: 'You may discard a card. If you do, draw two cards. Create a Wicked Role token attached to up to one target creature you control.',
    expect: OK,
    note: "Witch's Mark",
  },
  {
    kind: 'creature',
    text: 'Menace\nWhen ~ enters, create two 1/1 black Rat creature tokens with "This token can\'t block."\nAt the beginning of your upkeep, you may sacrifice another creature. If you do, put a +1/+1 counter on ~ and exile the top card of your library. You may play that card this turn.',
    expect: OK,
    note: 'Redcap Gutter-Dweller',
    stats: ['3', '3'],
  },
];

const SIBLINGS: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Create a Wicked Role token attached to target creature you control.',
    expect: OK,
    note: 'a Role token is an Aura token created attached to a target',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, create a Wicked Role token attached to up to one target creature you control.',
    expect: OK,
    note: 'a triggered ability with an "up to one" host',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your upkeep, you may sacrifice another creature. If you do, exile the top card of your library. You may play that card this turn.',
    expect: OK,
    note: '"that card" after an "if you do" that exiled it',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Create a Wicked Role token.',
    expect: no('.', 'effect.create-token'),
    note: 'the engine creates a Role only attached to a target',
  },
  {
    kind: 'sorcery',
    text: 'Create a Wicked Role token attached to target creatures you control.',
    expect: no('creatures you control.', 'noun.target-permanent'),
    note: 'one host',
  },
  {
    kind: 'sorcery',
    text: 'Create two Wicked Role tokens attached to target creature you control.',
    expect: no(
      'two Wicked Role tokens attached to target creature you control.',
      'token.predefined',
      { reason: 'notRunnable' },
    ),
    note: 'one token for one host',
  },
  {
    kind: 'creature',
    text: 'Start your engines!',
    expect: OK,
    note: 'speed (CR 702.179) is built: the keyword sets speed 1 as a state-based action',
  },
  {
    kind: 'creature',
    text: 'Max speed — {T}: Add {R}.',
    expect: OK,
    note: 'the label limits the ability to max speed, so it is not dropped as a flavor word',
  },
  {
    kind: 'creature',
    text: 'At the beginning of combat on your turn, create a 1/1 red Goblin creature token. That token attacks this combat if able.',
    expect: OK,
    note: '"this combat" has its own duration (CR 508.1d): it ends with the combat, not the turn',
  },
];

runCorpus('the template corpus (issue 144): the cards', REAL);
runCorpus('the template corpus (issue 144): the sibling wordings', SIBLINGS);
runCorpus('the template corpus (issue 144): what stays unread', UNREAD);
