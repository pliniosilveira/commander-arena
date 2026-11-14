// The SYNTHETIC template corpus of stage P7b: "transform ~" (CR 701.27, Transform). Each line is
// a template written after a real shape of the backlog (reports/backlog.md and the templates behind
// it; the count is in the note, as the report prints it, parser version 4) or marked SYNTHETIC; none
// is a real card's text and no real card is marked supported here. "Transform target creature" has
// no line in the backlog, so no rule reads it (it stops at the target); day and night, the
// "no spells were cast last turn" conditions and "transformed" in a return stay unread. Each line
// says whether it must import as supported, or where and why it stops. The kinds of expectation are
// those of convert-grammar-corpus.test.ts.
import { describe, expect, test } from 'vitest';
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const TRANSFORM: readonly Line[] = [
  {
    kind: 'creature',
    text: '{2}{R}: Transform ~. Activate only as a sorcery.',
    expect: OK,
    note: 'backlog: 31 cards, "{M}: Transform ~. Activate only as a sorcery."',
  },
  { kind: 'creature', text: '{2}: Transform ~.', expect: OK, note: 'SYNTHETIC; no restriction' },
  {
    kind: 'creature',
    text: 'At the beginning of your upkeep, transform ~.',
    expect: OK,
    note: 'SYNTHETIC; the trigger of the engine fixture Moon Cub',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your end step, transform ~.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, transform ~.',
    expect: OK,
    note: 'SYNTHETIC; a trigger body is read the same way',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your end step, if you control four or more creatures, transform ~.',
    expect: OK,
    note: 'backlog: 1 card, "At the beginning of your end step, if you control N or more creatures, transform ~."; the intervening "if" of stage P4',
  },
  {
    kind: 'creature',
    text: '{T}: Transform ~.',
    expect: OK,
    note: 'SYNTHETIC; a tap cost',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'At the beginning of each upkeep, if no spells were cast last turn, transform ~.',
    expect: no('no spells were cast last turn, transform ~.', 'ability.triggered'),
    note: 'backlog: 32 cards; the werewolf shape, no condition reads it (the upkeep trigger is read)',
  },
  {
    kind: 'creature',
    text: 'At the beginning of each upkeep, if a player cast two or more spells last turn, transform ~.',
    expect: no('a player cast two or more spells last turn, transform ~.', 'ability.triggered'),
    note: 'backlog: 32 cards; the other half of the werewolf shape',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your upkeep, if it’s night, transform ~.',
    expect: no('it’s night, transform ~.', 'ability.triggered'),
    note: 'SYNTHETIC; day and night (CR 731) are not in the engine',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your upkeep, transform ~ if it’s night.',
    expect: no('if it’s night.', 'noun.self'),
    note: 'SYNTHETIC; a condition after the effect is not read: "transform ~" was, "if it’s night" was not',
  },
  {
    kind: 'creature',
    text: '{2}: Transform ~ if it’s night.',
    expect: no('if it’s night.', 'noun.self'),
    note: 'SYNTHETIC; the same in an activated ability',
  },
  {
    kind: 'creature',
    text: 'Daybound',
    expect: no('Daybound', NONE),
    note: 'SYNTHETIC; the keyword of day and night is not read',
  },
  {
    kind: 'creature',
    text: '{2}: Transform target creature.',
    expect: no('target creature.', 'effect.transform'),
    note: 'SYNTHETIC; no backlog line, so no rule: only "~" is read',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your upkeep, transform target creature.',
    expect: no('target creature.', 'effect.transform'),
    note: 'SYNTHETIC; the same in a trigger',
  },
  {
    kind: 'creature',
    text: '{2}: Transform it.',
    expect: no('it.', 'effect.transform'),
    note: 'SYNTHETIC; a pronoun has nothing to point at in an activated ability',
  },
  {
    kind: 'creature',
    text: 'When ~ dies, return it to the battlefield tapped and transformed under its owner’s control.',
    expect: no(
      'it to the battlefield tapped and transformed under its owner’s control.',
      'effect.return',
    ),
    note: 'backlog: 4 cards; entering transformed (CR 712.14a) is not read, so the return stops at "it"',
  },
];

runCorpus('transform ~', TRANSFORM);
runCorpus('transform shapes that stay unread', UNREAD);

describe('the corpus lines are distinct', () => {
  test('no two lines are the same text on the same kind of card', () => {
    const all = [...TRANSFORM, ...UNREAD].map((l) => `${l.kind}|${l.text}`);
    expect(new Set(all).size).toBe(all.length);
  });
});
