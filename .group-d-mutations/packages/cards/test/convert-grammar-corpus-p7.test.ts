// The SYNTHETIC template corpus of stage P7a: damage prevention shields (CR 615). Each line is a
// template written after a real shape of the backlog (reports/backlog.md and the templates behind it;
// the count is in the note, as the report prints it: "blocked" cards, parser version 4) or marked
// SYNTHETIC; none is a real card's text, and Fog, Darkness, Holy Day, Maze of Ith and Inkshield are
// not marked supported here. Each line says whether it must import as supported, or where and why it
// stops, so a change that makes the grammar read less OR more than it should fails here. The kinds of
// expectation are those of convert-grammar-corpus.test.ts.
import { describe, expect, test } from 'vitest';
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const ALL: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt this turn.',
    expect: OK,
    note: 'backlog: 14 cards (4 of them blocked by this shape alone)',
  },
  {
    kind: 'sorcery',
    text: 'Prevent all combat damage that would be dealt this turn.',
    expect: OK,
    note: 'SYNTHETIC; the type of spell does not matter',
  },
  {
    kind: 'instant',
    text: 'Prevent all damage that would be dealt this turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: 'Prevent all noncombat damage that would be dealt this turn.',
    expect: OK,
    note: 'SYNTHETIC; the shape of the engine fixture Quiet Fog',
  },
  {
    kind: 'instant',
    text: 'Prevent all damage that would be dealt to you this turn.',
    expect: OK,
    note: 'SYNTHETIC; the shape of the engine fixture Self Ward',
  },
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt to you this turn.',
    expect: OK,
    note: 'SYNTHETIC; the first sentence of the one card with the Inkshield shape',
  },
  {
    kind: 'instant',
    text: 'Prevent all damage that would be dealt to creatures you control this turn.',
    expect: OK,
    note: 'SYNTHETIC; the shape of the engine fixture Herd Shelter',
  },
  {
    kind: 'instant',
    text: 'Prevent all damage that would be dealt to you and creatures you control this turn.',
    expect: OK,
    note: 'SYNTHETIC; two shields',
  },
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt to and dealt by target creature this turn.',
    expect: OK,
    note: 'SYNTHETIC; the shape of the engine fixture Standoff (backlog: 2 cards say "that creature")',
  },
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt by target creature this turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: 'Prevent all damage that would be dealt to target creature or planeswalker this turn.',
    expect: OK,
    note: 'SYNTHETIC; a choice of types is a filter of the target slot',
  },
  {
    kind: 'creature',
    text: '{T}: Prevent all combat damage that would be dealt this turn.',
    expect: OK,
    note: 'SYNTHETIC; an activated ability',
  },
  {
    kind: 'creature',
    text: 'Sacrifice ~: Prevent all combat damage that would be dealt this turn.',
    expect: OK,
    note: 'SYNTHETIC; an activated ability with a sacrifice cost',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ attacks, prevent all combat damage that would be dealt to you this turn.',
    expect: OK,
    note: 'SYNTHETIC; a triggered ability with no target',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, prevent all combat damage that would be dealt by target creature this turn.',
    expect: OK,
    note: 'SYNTHETIC; read, and the engine chooses its target as the trigger goes on the stack (CR 603.3d, D-089)',
  },
];

const NEXT: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Prevent the next 3 damage that would be dealt to any target this turn.',
    expect: OK,
    note: 'SYNTHETIC; the shape of the engine fixture Shield Three (CR 615.7)',
  },
  {
    kind: 'instant',
    text: 'Prevent the next 1 damage that would be dealt to target creature this turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: 'Prevent the next two damage that would be dealt to target player this turn.',
    expect: OK,
    note: 'SYNTHETIC; the number as a word',
  },
  {
    kind: 'instant',
    text: 'Prevent the next 2 combat damage that would be dealt to you this turn.',
    expect: OK,
    note: 'SYNTHETIC; the shape of the engine fixture Soften Blow',
  },
  {
    kind: 'instant',
    text: 'Prevent the next 1 damage that would be dealt to each creature you control this turn.',
    expect: OK,
    note: 'SYNTHETIC; the shape of the engine fixture Ward Circle (CR 615.11)',
  },
  {
    kind: 'creature',
    text: '{1}{W}: Prevent the next 1 damage that would be dealt to target creature this turn.',
    expect: OK,
    note: 'SYNTHETIC; an activated ability with a target',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, prevent the next 1 damage that would be dealt to any target this turn.',
    expect: OK,
    note: 'SYNTHETIC; read, and the engine chooses its target as the trigger goes on the stack (CR 603.3d, D-089)',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'instant',
    text: "Combat damage that would be dealt by creatures you control can't be prevented this turn.",
    expect: no(
      "Combat damage that would be dealt by creatures you control can't be prevented this turn.",
      NONE,
    ),
    note: 'SYNTHETIC; CR 615.12: the engine has no unpreventable damage',
  },
  {
    kind: 'instant',
    text: 'The next time a source of your choice would deal damage to you this turn, prevent that damage.',
    expect: no(
      'The next time a source of your choice would deal damage to you this turn, prevent that damage.',
      NONE,
    ),
    note: 'SYNTHETIC; CR 609.7a, 615.8: a source chosen as the effect is created',
  },
  {
    kind: 'instant',
    text: 'Prevent all damage that would be dealt to you this turn by a source of your choice.',
    expect: no('by a source of your choice.', 'effect.prevent-all'),
    note: 'SYNTHETIC; CR 615.9',
  },
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt this turn instead.',
    expect: no('Prevent all combat damage that would be dealt this turn instead.', NONE),
    note: 'SYNTHETIC; "instead" makes a replacement effect (CR 614)',
  },
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt until your next turn.',
    expect: no('until your next turn.', 'effect.prevent-all'),
    note: 'SYNTHETIC; a duration other than "this turn"',
  },
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt until end of turn.',
    expect: no('until end of turn.', 'effect.prevent-all'),
    note: 'SYNTHETIC; Oracle says "this turn" for a shield',
  },
  {
    kind: 'instant',
    text: 'Prevent all damage that would be dealt to you.',
    expect: no('.', 'effect.prevent-all'),
    note: 'SYNTHETIC; no duration: it would last for ever',
  },
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt by creatures you control this turn.',
    expect: OK,
    note: "SYNTHETIC; read since stage P32 (D-147): the engine's `byFilter`, a group of sources read as each damage event would happen",
  },
  {
    kind: 'instant',
    text: 'Prevent all damage that would be dealt by sources you control this turn.',
    expect: no('sources you control this turn.', 'effect.prevent-all'),
    note: 'SYNTHETIC; the engine `by` is one object, not a filter',
  },
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt to two target creatures this turn.',
    expect: no('two target creatures this turn.', 'effect.prevent-all'),
    note: 'SYNTHETIC; one target for a shield',
  },
  {
    kind: 'instant',
    text: 'Prevent all damage that would be dealt to target creature or player this turn.',
    expect: no('or player this turn.', 'effect.prevent-all'),
    note: 'SYNTHETIC; the old wording of "any target" is not a noun',
  },
  {
    kind: 'instant',
    text: 'Prevent all damage that would be dealt to all creatures this turn.',
    expect: no('all creatures this turn.', 'effect.prevent-all'),
    note: 'SYNTHETIC; recipients are read with "each" or a plural without a determiner only',
  },
  {
    kind: 'land',
    text: '{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn.',
    expect: no('that creature this turn.', 'effect.prevent-all'),
    note: 'backlog: 2 cards (1 blocked by it alone); "attacking" is read since stage P31, "that creature" is not',
  },
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt to and dealt by that creature this turn.',
    expect: no('that creature this turn.', 'effect.prevent-all'),
    note: 'SYNTHETIC; the second sentence of the line above on its own: "that creature" is not read',
  },
  {
    kind: 'instant',
    text: 'Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying.',
    expect: no(
      'For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying.',
      'spell.effect',
    ),
    note: 'backlog: 1 card; the first sentence reads, the amount prevented is not a value',
  },
  {
    kind: 'instant',
    text: 'Prevent the next X damage that would be dealt to any target this turn.',
    expect: no('X damage that would be dealt to any target this turn.', 'effect.prevent-next'),
    note: 'SYNTHETIC; the engine shield takes a number',
  },
  {
    kind: 'instant',
    text: 'Prevent the next 3 damage that would be dealt this turn.',
    expect: no('this turn.', 'effect.prevent-next'),
    note: 'SYNTHETIC; a number needs the recipient it shields',
  },
  {
    kind: 'instant',
    text: 'Prevent the next 1 damage that would be dealt to you and creatures you control this turn.',
    expect: no('and creatures you control this turn.', 'effect.prevent-next'),
    note: 'SYNTHETIC; CR 615.7 does not say whether a number is shared by recipients',
  },
  {
    kind: 'instant',
    text: 'Prevent the next 1 damage that would be dealt to creatures you control this turn.',
    expect: no('creatures you control this turn.', 'effect.prevent-next'),
    note: 'SYNTHETIC; CR 615.11 is about "each" of a number of creatures',
  },
  {
    kind: 'instant',
    text: 'Prevent the next 2 damage that would be dealt to each player this turn.',
    expect: no('each player this turn.', 'effect.prevent-next'),
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: 'Prevent the next 2 damage that would be dealt by target creature this turn.',
    expect: no('by target creature this turn.', 'effect.prevent-next'),
    note: 'SYNTHETIC; a number from one source is not read',
  },
];

runCorpus('prevent all', ALL);
runCorpus('prevent the next N', NEXT);
runCorpus('prevention shapes that stay unread', UNREAD);

describe('the corpus lines are distinct', () => {
  test('no two lines are the same text on the same kind of card', () => {
    const all = [...ALL, ...NEXT, ...UNREAD].map((l) => `${l.kind}|${l.text}`);
    expect(new Set(all).size).toBe(all.length);
  });
});
