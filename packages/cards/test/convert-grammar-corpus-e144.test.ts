// The template corpus of issue 144 (Spree, Boast, "triggers an additional time" of the chosen type): the first group is the real Oracle text of the three cards of the issue, with the
// name replaced by ~ (Roaming Throne is in packages/cards/test/fixtures/corpus/golden.jsonl); the siblings and the near misses are SYNTHETIC. Each line says whether it must import as
// supported, or where and why it stops. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const REAL: readonly Line[] = [
  {
    kind: 'instant',
    text: "Spree (Choose one or more additional costs.)\n+ {2}{R} — Untap all creatures you control. If it's your combat phase, there is an additional combat phase after this phase.\n+ {2} — Creatures you control get +1/+0 and gain first strike until end of turn.\n+ {R} — Choose target opponent. Whenever a creature you control deals combat damage to that player this turn, create a tapped Treasure token.",
    expect: OK,
    note: 'Great Train Heist',
  },
  {
    kind: 'creature',
    text: "Menace, haste\nBoast — Sacrifice another creature or artifact: ~ deals damage equal to 2 plus the sacrificed permanent's mana value to any target. (Activate only if this creature attacked this turn and only once each turn.)",
    expect: OK,
    note: 'Broadside Bombardiers',
  },
  {
    kind: 'creature',
    text: 'Ward {2}\nAs this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nIf a triggered ability of another creature you control of the chosen type triggers, it triggers an additional time.',
    expect: OK,
    note: 'Roaming Throne',
  },
];

const SIBLINGS: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Spree\n+ {1} — Draw a card.\n+ {2}{B} — Each opponent loses 2 life.',
    expect: OK,
    note: 'a Spree spell of two modes: one or more are chosen',
  },
  {
    kind: 'creature',
    text: 'Boast — {1}: Draw a card.',
    expect: OK,
    note: 'a boast ability with a mana cost',
  },
  {
    kind: 'creature',
    text: 'Sacrifice a creature: ~ deals damage equal to the sacrificed creature’s mana value to any target.',
    expect: OK,
    note: 'the mana value of what the cost sacrificed, alone',
  },
  {
    kind: 'creature',
    text: 'If a triggered ability of another creature you control triggers, it triggers an additional time.',
    expect: OK,
    note: 'every other creature of the controller',
  },
  {
    kind: 'sorcery',
    text: "If it's your combat phase, draw a card.",
    expect: OK,
    note: 'the test of the combat phase is read before any instruction',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Boast — {2}: ~ deals damage equal to 3 plus the sacrificed creature’s mana value to any target.',
    expect: { engine: 'needs an activated ability whose cost sacrifices a permanent' },
    note: 'the cost sacrifices nothing: there is no sacrificed permanent to read',
  },
  {
    kind: 'sorcery',
    text: 'Spree\n+ Draw a card.\n+ {2}{B} — Each opponent loses 2 life.',
    expect: no('Spree', 'none'),
    note: 'a Spree mode with no cost is not read',
  },
  {
    kind: 'creature',
    text: 'If a triggered ability of a creature you control of the chosen type triggers, it triggers an additional time.',
    expect: no(
      'If a triggered ability of a creature you control of the chosen type triggers, it triggers an additional time.',
      'none',
    ),
    note: 'with no "another" the creature itself would be doubled: not read',
  },
  {
    kind: 'creature',
    text: 'If a triggered ability of another creature you control triggers, it triggers two additional times.',
    expect: no(
      'If a triggered ability of another creature you control triggers, it triggers two additional times.',
      'none',
    ),
    note: 'another number of times is not read',
  },
];

runCorpus('the template corpus (issue 144): the cards of the issue', REAL);
runCorpus('the template corpus (issue 144): the sibling wordings', SIBLINGS);
runCorpus('the template corpus (issue 144): what stays unread', UNREAD);
