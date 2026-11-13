// The SYNTHETIC template corpus of stage P6: Ward, Crew, token copies, the additive type change and
// the return to the battlefield with a stated control. Each line is a template written after a real
// shape of the backlog (reports/backlog.md and the templates behind it; the count is in the note, as
// the report prints it, parser version 4) or marked SYNTHETIC; none is a real card's text and no real
// card is marked supported here. Each line says whether it must import as supported, or where and
// why it stops, so a change that makes the grammar read less OR more than it should fails here. The
// kinds of expectation are those of convert-grammar-corpus.test.ts.
import { describe, expect, test } from 'vitest';
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const NOT_RUNNABLE = { reason: 'notRunnable' } as const;

const WARD: readonly Line[] = [
  { kind: 'creature', text: 'Ward {2}', expect: OK, note: 'backlog: 89 cards' },
  { kind: 'creature', text: 'Ward {1}{U}', expect: OK, note: 'SYNTHETIC; two symbols' },
  { kind: 'creature', text: 'Ward—Pay 2 life.', expect: OK, note: 'backlog: 18 cards' },
  { kind: 'creature', text: 'Flying\nWard {2}', expect: OK, note: 'SYNTHETIC; on its own line' },
  {
    kind: 'creature',
    text: 'Ward—Sacrifice a permanent.',
    expect: { engine: 'cost "sacrifice" is not implemented by the engine yet' },
    note: 'SYNTHETIC; read as the keyword, the engine pays mana and life only',
  },
  {
    kind: 'creature',
    text: 'Ward—Discard a card.',
    expect: OK,
    note: 'backlog: 12 cards; stage P13 reads the discard, the engine pays it since D-095',
  },
  {
    kind: 'creature',
    text: 'Flying, ward {2}',
    expect: OK,
    note: 'backlog: 22 cards, "Flying, ward {M}"; a list of keywords that ends with a plain ward',
  },
  {
    kind: 'creature',
    text: 'Flying, ward—Discard a card.',
    expect: no('ward—Discard a card.', 'keyword.line'),
    note: 'SYNTHETIC; only a plain mana ward ends a list',
  },
  {
    kind: 'creature',
    text: 'Ward {X}',
    expect: no('{X}', 'keyword.ward'),
    note: 'SYNTHETIC; CR 702.21b is not built',
  },
];

const CREW: readonly Line[] = [
  { kind: 'vehicle', text: 'Crew 1', expect: OK, note: 'backlog: 180 cards' },
  { kind: 'vehicle', text: 'Crew 3', expect: OK, note: 'backlog: 180 cards' },
  { kind: 'vehicle', text: 'Flying\nCrew 2', expect: OK, note: 'SYNTHETIC; on its own line' },
  {
    kind: 'creature',
    text: 'Crew 2',
    expect: no('Crew 2', 'keyword.crew', NOT_RUNNABLE),
    note: 'SYNTHETIC; only a Vehicle has crew (CR 301.7)',
  },
  { kind: 'vehicle', text: 'Crew X', expect: no('X', 'keyword.crew'), note: 'SYNTHETIC' },
];

const COPIES: readonly Line[] = [
  {
    kind: 'sorcery',
    text: "Create a token that's a copy of target creature.",
    expect: OK,
    note: 'SYNTHETIC; the shape of the engine fixture Echo Image',
  },
  {
    kind: 'sorcery',
    text: 'Create two tokens that are copies of target creature you control.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: "{3}: Create a token that's a copy of ~.",
    expect: OK,
    note: 'SYNTHETIC; the shape of the engine fixture Cloner Imp',
  },
  {
    kind: 'creature',
    text: "When ~ enters, create a token that's a copy of it.",
    expect: OK,
    note: 'SYNTHETIC; "it" is ~ in a trigger about ~',
  },
  {
    kind: 'enchantment',
    text: "Whenever another creature you control dies, create a token that's a copy of it.",
    expect: OK,
    note: 'SYNTHETIC; "it" is the triggering permanent',
  },
  {
    kind: 'sorcery',
    text: "Create a token that's a copy of target nonland permanent.",
    expect: { engine: 'could be an Aura is not implemented by the engine yet' },
    note: 'SYNTHETIC; the engine refuses a copy that could be an Aura (CR 303.4f)',
  },
  {
    kind: 'sorcery',
    text: "Create a token that's a copy of target land.",
    expect: OK,
    note: 'SYNTHETIC; a token copy of a land asks what the land asks as it enters (CR 614.12, D-211)',
  },
  {
    kind: 'creature',
    text: "When ~ dies, create a token that's a copy of it.",
    expect: { engine: 'cannot tell the type of' },
    note: 'SYNTHETIC; after "dies" "it" is the trigger subject',
  },
  {
    kind: 'sorcery',
    text: "Create a token that's a copy of ~.",
    expect: { engine: 'a copy is made from this permanent, a target or the triggering permanent' },
    note: 'SYNTHETIC; "~" in an instant is the spell',
  },
  {
    kind: 'sorcery',
    text: "Create a token that's a copy of target creature, except it's a 1/1.",
    expect: no(", except it's a 1/1.", 'token.copy-except'),
    note: 'SYNTHETIC; "except" (CR 707.9) is not read unless it says the whole of the copy (a 1/1 with no color or type is not that); since Hashaton group 5 (D-382) the rule that gets furthest is `token.copy-except`',
  },
  {
    kind: 'sorcery',
    text: "Create a token that's a copy of target creature, except it's an artifact in addition to its other types.",
    expect: no(", except it's an artifact in addition to its other types.", 'token.copy-except'),
    note: 'SYNTHETIC; "except" is not read (the rule that gets furthest is `token.copy-except` since Hashaton group 5, D-382)',
  },
  {
    kind: 'creature',
    text: "When this Class becomes level 2, create a token that's a copy of target token you control.",
    expect: no(
      "becomes level 2, create a token that's a copy of target token you control.",
      'trigger.or',
    ),
    note: 'backlog: 1 card (Caretaker\'s Talent); the level trigger and "target token" are not read',
  },
  {
    kind: 'enchantment',
    text: "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste.",
    expect: no(
      "equipped creature, except the token isn't legendary. That token gains haste.",
      'token.copy-except',
    ),
    note: 'backlog: 1 card (Helm of the Host); "except" and a rider are not read (the rule that gets furthest is `token.copy-except` since Hashaton group 5, D-382)',
  },
];

const ADDITIVE: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Target creature becomes an artifact creature until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; CR 205.1b keeps the prior types',
  },
  {
    kind: 'sorcery',
    text: 'Target creature becomes an artifact creature in addition to its other types until end of turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'artifact',
    text: '{T}: Target nonland permanent becomes an artifact in addition to its other types until end of turn.',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'sorcery',
    text: 'Target creature becomes a Golem artifact creature until end of turn.',
    expect: no('artifact creature until end of turn.', 'effect.becomes'),
    note: 'SYNTHETIC; "a [creature type] artifact creature" has no node (D-085)',
  },
  {
    kind: 'sorcery',
    text: 'Target creature becomes an artifact until end of turn.',
    expect: no('artifact until end of turn.', 'effect.becomes'),
    note: 'SYNTHETIC; an artifact type alone replaces the card types (CR 205.1a)',
  },
];

const RETURNS: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Return target creature card from a graveyard to the battlefield under your control.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'sorcery',
    text: 'Return target creature card from a graveyard to the battlefield.',
    expect: OK,
    note: 'SYNTHETIC; the caster controls it (CR 110.2a)',
  },
  {
    kind: 'sorcery',
    text: "Return target creature card from a graveyard to the battlefield under its owner's control.",
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'sorcery',
    text: 'Return target creature card from a graveyard to your hand.',
    expect: no('from a graveyard to your hand.', 'effect.return'),
    note: "SYNTHETIC; it would go to its owner's hand",
  },
];

runCorpus('Ward', WARD);
runCorpus('Crew', CREW);
runCorpus('token copies', COPIES);
runCorpus('additive types', ADDITIVE);
runCorpus('returns with a control', RETURNS);

describe('the corpus lines are distinct', () => {
  test('no two lines are the same text on the same kind of card', () => {
    const all = [...WARD, ...CREW, ...COPIES, ...ADDITIVE, ...RETURNS].map(
      (l) => `${l.kind}|${l.text}`,
    );
    expect(new Set(all).size).toBe(all.length);
  });
});
