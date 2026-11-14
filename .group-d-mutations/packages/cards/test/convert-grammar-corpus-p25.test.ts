// The template corpus of stage P25: the upkeep slice of the engine (D-127, ENGINE_VERSION 25). The lines are the real
// shapes of reports/templates.json ("Echo {M}", "Cumulative upkeep {M}", "When ~ enters, you become the monarch.");
// everything else is SYNTHETIC (the Oracle text of the cards that have them is not in the repository). No real card is
// marked supported here except through the golden corpus. Each line says whether it must import as supported, or
// where and why it stops, so a change that makes the grammar read less OR more than it should fails here. The kinds
// of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const SUPPORTED: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Echo {3}{W}{W}',
    expect: OK,
    note: 'the real line (47 cards: Karmic Guide, Mogg War Marshal, ...); SYNTHETIC card around it',
    stats: ['2', '2'],
  },
  {
    kind: 'artifact',
    text: 'Echo {2}',
    expect: OK,
    note: 'SYNTHETIC: an Echo cost on a noncreature permanent (CR 702.30a says "this permanent")',
  },
  {
    kind: 'creature',
    text: 'Echo {1}{R}\nEcho {G}',
    expect: OK,
    note: 'SYNTHETIC: two instances trigger separately',
    stats: ['2', '2'],
  },
  {
    kind: 'creature',
    text: 'Cumulative upkeep {1}',
    expect: OK,
    note: 'the real line (57 cards: Mystic Remora, Illusionary Wall, ...); SYNTHETIC card around it',
  },
  {
    kind: 'enchantment',
    text: 'Cumulative upkeep {1}',
    expect: OK,
    note: 'the real line on an enchantment (Mystic Remora is shaped so); SYNTHETIC card',
  },
  {
    kind: 'land',
    text: 'Cumulative upkeep {G}',
    expect: OK,
    note: 'SYNTHETIC: a land with the keyword',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you become the monarch.',
    expect: OK,
    note: 'the real line (38 cards: Court of Grace, Regal Behemoth, ...); SYNTHETIC card around it',
  },
  {
    kind: 'enchantment',
    text: 'When ~ enters, you become the monarch.',
    expect: OK,
    note: 'the real line on an enchantment; SYNTHETIC card',
  },
  {
    kind: 'sorcery',
    text: 'You become the monarch.',
    expect: OK,
    note: 'SYNTHETIC: the bare spell sentence (the reports hold no real spell line of it)',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you become the monarch.\nFlying',
    expect: OK,
    note: 'SYNTHETIC: the line beside another ability (the Courts and Regal Behemoth have more lines)',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ deals combat damage to a player, you become the monarch.',
    expect: OK,
    note: 'SYNTHETIC: the effect under another trigger the grammar reads',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Echo {X}',
    expect: no('{X}', 'keyword.echo'),
    note: 'SYNTHETIC: X in the cost is not read',
  },
  {
    kind: 'creature',
    text: 'Echo—Pay 2 life.',
    expect: no('Echo—Pay 2 life.', NONE),
    note: 'SYNTHETIC: the engine pays mana only for Echo',
  },
  {
    kind: 'creature',
    text: 'Flying, echo {2}{R}',
    expect: no('echo {2}{R}', 'keyword.line'),
    note: 'SYNTHETIC: Echo is read on a line of its own, not in a keyword list',
  },
  {
    kind: 'enchantment',
    text: 'Cumulative upkeep—Pay 1 life.',
    expect: no('Cumulative upkeep—Pay 1 life.', NONE),
    note: 'SYNTHETIC: the engine could pay it, but the reports hold no real line of this form',
  },
  {
    kind: 'enchantment',
    text: 'Cumulative upkeep—Discard a card.',
    expect: no('Cumulative upkeep—Discard a card.', NONE),
    note: 'SYNTHETIC: as the life form, no real line in the reports',
  },
  {
    kind: 'enchantment',
    text: 'Cumulative upkeep—Sacrifice a creature.',
    expect: no('Cumulative upkeep—Sacrifice a creature.', NONE),
    note: 'SYNTHETIC: the question cannot pay a sacrifice',
  },
  {
    kind: 'enchantment',
    text: 'Cumulative upkeep {X}',
    expect: no('{X}', 'keyword.cumulative-upkeep'),
    note: 'SYNTHETIC: X in the cost is not read',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, target player becomes the monarch.',
    expect: no('becomes the monarch.', 'effect.player'),
    note: 'SYNTHETIC: only "you become the monarch" is read',
  },
  {
    kind: 'enchantment',
    text: 'At the beginning of your end step, if an opponent is not the monarch, draw a card.',
    expect: no('an opponent is not the monarch, draw a card.', 'ability.triggered'),
    note: 'SYNTHETIC: the condition about the monarch is read for one player and for "is", not for "is not" of an opponent (stage P28)',
  },
];

runCorpus('stage P25: upkeep slice lines read and run', SUPPORTED);
runCorpus('stage P25: what stays unread', UNREAD);
