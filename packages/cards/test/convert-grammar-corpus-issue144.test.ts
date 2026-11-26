// The template corpus of issue 144 (the Goblin deck): "you attacked this turn" (Raid), "~ has five or more quest counters on it" after "as long as", and a token "that's tapped and
// attacking" after "whenever one or more Goblins you control attack". The first group is the Oracle text of the three cards of the issue, with the name replaced by ~; the siblings, the
// variants and the near misses are SYNTHETIC. Each line says whether it must import as supported, or where and why it stops, so a change that makes the grammar read less OR more than
// it should fails here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const REAL: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Raid — At the beginning of your end step, if you attacked this turn, create a 1/1 red Goblin creature token.',
    expect: OK,
    note: 'Searslicer Goblin',
  },
  {
    kind: 'enchantment',
    text: 'Whenever a Goblin you control enters, you may put a quest counter on this enchantment.\nAs long as this enchantment has five or more quest counters on it, creatures you control get +2/+0.',
    expect: OK,
    note: 'Quest for the Goblin Lord',
  },
  {
    kind: 'creature',
    text: "Whenever one or more Goblins you control attack, create a 1/1 red Goblin creature token that's tapped and attacking.\nWhenever another creature you control enters, ~ deals 1 damage to each opponent.",
    expect: OK,
    note: 'General Kreat, the Boltbringer',
  },
];

const SIBLINGS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'At the beginning of your end step, if you attacked this turn, draw a card.',
    expect: OK,
    note: 'the same test with another effect',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your end step, if you attacked with a creature this turn, you gain 1 life.',
    expect: OK,
    note: '"with a creature" is the count of one',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your end step, if you attacked with two or more creatures this turn, draw a card.',
    expect: OK,
    note: 'the counted form that was already read',
  },
  {
    kind: 'enchantment',
    text: 'As long as ~ has three or more quest counters on it, creatures you control get +1/+1.',
    expect: OK,
    note: 'another count and another bonus',
  },
  {
    kind: 'creature',
    text: "Whenever one or more Elves you control attack, create a 1/1 green Elf Warrior creature token that's tapped and attacking.",
    expect: OK,
    note: 'another kind of creature and token',
  },
  {
    kind: 'creature',
    text: "Whenever one or more creatures you control attack, create a 2/2 black Zombie creature token with menace that's tapped and attacking.",
    expect: OK,
    note: 'a token with a keyword before the words',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'At the beginning of your end step, if an opponent attacked this turn, draw a card.',
    expect: no('an opponent attacked this turn, draw a card.', 'ability.triggered'),
    note: 'only the controller attacking is read',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your end step, if you attacked, draw a card.',
    expect: no('you attacked, draw a card.', 'ability.triggered'),
    note: 'no "this turn"',
  },
  {
    kind: 'creature',
    text: "When ~ enters, create a 1/1 red Goblin creature token that's tapped and attacking.",
    expect: no("a 1/1 red Goblin creature token that's tapped and attacking.", 'token.custom', {
      reason: 'notRunnable',
    }),
    note: 'only after an attack batch trigger of the controller, which names the player attacked',
  },
  {
    kind: 'creature',
    text: "Whenever one or more creatures attack, create a 1/1 red Goblin creature token that's tapped and attacking.",
    expect: no("a 1/1 red Goblin creature token that's tapped and attacking.", 'token.custom', {
      reason: 'notRunnable',
    }),
    note: 'the attackers of any player: the player attacked is read only for the creatures you control',
  },
  {
    kind: 'enchantment',
    text: 'As long as ~ has no quest counters on it, creatures you control get +2/+0.',
    expect: no(
      'no quest counters on it, creatures you control get +2/+0.',
      'condition.this-counter-count',
    ),
    note: 'SYNTHETIC: "no counters" is not read ("one or more" is, as a counter condition of the permanent)',
  },
];

runCorpus('the template corpus (issue 144): the cards of the issue', REAL);
runCorpus('the template corpus (issue 144): the sibling wordings', SIBLINGS);
runCorpus('the template corpus (issue 144): what stays unread', UNREAD);
