// The SYNTHETIC template corpus of stage P10: the engine's library effects (scry, surveil, look and
// reorder, put from the hand on top; D-091, D-093). Each line is a template written after a real
// shape of the replay report (reports/template-replay.md and the templates behind it, parser version
// 4; the count of cards is in the note as the report prints it) or marked SYNTHETIC; none is a real
// card's text, and no real card is marked supported here. Each line says whether it must import as
// supported, or where and why it stops, so a change that makes the grammar read less OR more than it
// should fails here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const SCRY: readonly Line[] = [
  {
    kind: 'creature',
    text: 'When ~ enters, scry 1.',
    expect: OK,
    note: 'replay: 68 cards',
  },
  {
    kind: 'sorcery',
    text: 'Scry 2.',
    expect: OK,
    note: 'SYNTHETIC; the engine runs it as a spell',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your upkeep, scry 1.',
    expect: OK,
    note: 'replay: 7 cards',
  },
  {
    kind: 'creature',
    text: '{2}{U}{U}, {T}: Scry 2.',
    expect: OK,
    note: 'replay: 13 cards',
  },
  {
    kind: 'creature',
    text: 'Sacrifice a creature: Scry 1.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: 'Scry 2, then draw a card.',
    expect: OK,
    note: 'replay: 6 cards',
  },
  {
    kind: 'instant',
    text: 'Scry 2, then draw two cards. You lose 2 life.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  { kind: 'instant', text: 'Draw a card, then scry 1.', expect: OK, note: 'SYNTHETIC' },
  {
    kind: 'creature',
    text: 'When ~ enters, you may scry 1.',
    expect: OK,
    note: 'SYNTHETIC; a triggered ability may be optional as a whole',
  },
  {
    kind: 'instant',
    text: 'Scry X.',
    expect: OK,
    note: 'SYNTHETIC; stage P16: the count is the X of the spell (the engine reads an Amount)',
  },
  {
    kind: 'instant',
    text: 'Target player scries 2.',
    expect: no('scries 2.', 'effect.player'),
    note: "SYNTHETIC; another player's scry is not an engine node",
  },
  {
    kind: 'instant',
    text: 'You may scry 1.',
    expect: no('may scry 1.', 'effect.player'),
    note: 'SYNTHETIC; the engine has no "may" on spell effects',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nWhenever enchanted creature attacks, scry 1.',
    expect: OK,
    note: 'replay: 1 card; the attached permanent is a trigger subject since stage P18 (D-111)',
  },
  {
    kind: 'creature',
    text: 'Whenever enchanted creature attacks, scry 1.',
    expect: no('enchanted creature attacks, scry 1.', 'noun.attached-permanent', {
      reason: 'notRunnable',
    }),
    note: 'SYNTHETIC; only an Aura has an enchanted creature, so a creature never reads it',
  },
];

const SURVEIL: readonly Line[] = [
  {
    kind: 'creature',
    text: 'When ~ enters, surveil 1.',
    expect: OK,
    note: 'replay: 46 cards',
  },
  { kind: 'instant', text: 'Surveil 1.', expect: OK, note: 'replay: 15 cards' },
  {
    kind: 'creature',
    text: '{3}{G}, {T}: Surveil 2.',
    expect: OK,
    note: 'replay: 17 cards',
  },
  {
    kind: 'instant',
    text: 'Surveil X.',
    expect: OK,
    note: 'SYNTHETIC; stage P16: the count is the X of the spell',
  },
  {
    kind: 'instant',
    text: 'Each opponent surveils 1.',
    expect: no('surveils 1.', 'effect.player'),
    note: 'SYNTHETIC',
  },
];

const REORDER: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Look at the top three cards of your library, then put them back in any order.',
    expect: OK,
    note: 'replay: the first sentence of a 2-card line',
  },
  {
    kind: 'creature',
    text: '{1}: Look at the top three cards of your library, then put them back in any order.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'sorcery',
    text: 'Look at the top three cards of your library, then put them back in any order. You may shuffle.',
    expect: OK,
    note: "replay: 2 cards; the optional shuffle is the engine's `may` of a shuffle (stage P63, D-216: Ponder)",
  },
  {
    kind: 'sorcery',
    text: 'Draw three cards, then put two cards from your hand on top of your library in any order.',
    expect: OK,
    note: 'replay: 2 cards (Brainstorm)',
  },
  {
    kind: 'sorcery',
    text: 'Put a card from your hand on top of your library.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'sorcery',
    text: 'Put any number of cards from your hand on the bottom of your library, then draw that many cards plus one.',
    expect: no(
      'any number of cards from your hand on the bottom of your library, then draw that many cards plus one.',
      'effect.add-counters',
    ),
    note: 'replay: 1 card; a count of "any number" is not in the AST',
  },
  {
    kind: 'sorcery',
    text: 'Look at the top seven cards of your library. Put two of them into your hand and the rest on the bottom of your library in any order.',
    expect: OK,
    note: 'replay: 6 cards; read since D-960 (effect.look-take-bottom: the owner chooses the order, CR 401.4)',
  },
];

runCorpus('the template corpus (stage P10)', [...SCRY, ...SURVEIL, ...REORDER]);
