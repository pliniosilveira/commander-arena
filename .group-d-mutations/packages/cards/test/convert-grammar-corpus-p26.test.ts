// The template corpus of stage P26: the cast-later slice of the engine (D-128, ENGINE_VERSION 26). The lines are the
// real shapes of reports/templates.json ("Suspend N—{M}", "Madness {M}", "Foretell {M}", "You draw a card at the
// beginning of the next turn's upkeep." and the imperative "Draw a card at the beginning of the next turn's
// upkeep."); everything else is SYNTHETIC (the Oracle text of the cards that have them is not in the repository). No
// real card is marked supported here except through the golden corpus. Each line says whether it must import as
// supported, or where and why it stops, so a change that makes the grammar read less OR more than it should fails
// here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const SUPPORTED: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Draw a card.\nSuspend 2—{1}{B}',
    expect: OK,
    note: 'the real line (65 cards: Profane Tutor, Search for Tomorrow, ...); SYNTHETIC card and spell text around it',
  },
  {
    kind: 'instant',
    text: 'Suspend 1—{R}\nDraw a card.',
    expect: OK,
    note: 'SYNTHETIC: Suspend on an instant with spell text',
  },
  {
    kind: 'creature',
    text: 'Suspend 3—{G}',
    expect: OK,
    note: 'SYNTHETIC: Suspend on a creature',
  },
  {
    kind: 'artifact',
    text: 'Suspend 4—{0}',
    expect: OK,
    note: 'SYNTHETIC: a cost of {0}, which the engine takes without payment',
  },
  {
    kind: 'creature',
    text: 'Madness {1}{B}{B}',
    expect: OK,
    note: 'the real line (56 cards: Necrogoyf, Markov Baron, ...); SYNTHETIC card around it',
  },
  {
    kind: 'instant',
    text: 'Madness {R}\nDraw a card.',
    expect: OK,
    note: 'SYNTHETIC: Madness on an instant with spell text',
  },
  {
    kind: 'creature',
    text: 'Madness {1}{B}\nFlying',
    expect: OK,
    note: 'SYNTHETIC: Madness beside a keyword line',
  },
  {
    kind: 'sorcery',
    text: 'Foretell {4}{R}{R}\nDraw a card.',
    expect: OK,
    note: 'the real line (50 cards: Delayed Blast Fireball, Ravenform, ...); SYNTHETIC card and spell text around it',
  },
  {
    kind: 'creature',
    text: 'Foretell {1}{W}',
    expect: OK,
    note: 'SYNTHETIC: Foretell on a creature',
  },
  {
    kind: 'instant',
    text: 'Draw a card.\nForetell {U}',
    expect: OK,
    note: 'SYNTHETIC: the spell text first',
  },
  {
    kind: 'creature',
    text: 'Madness {1}{B}\nForetell {3}{B}',
    expect: OK,
    note: 'SYNTHETIC: two different alternative costs on one card',
  },
  {
    kind: 'sorcery',
    text: "You draw a card at the beginning of the next turn's upkeep.",
    expect: OK,
    note: 'the real line (Arcane Denial has it as its second line, with another sentence in front); SYNTHETIC card around it',
  },
  {
    kind: 'instant',
    text: "Draw a card at the beginning of the next turn's upkeep.",
    expect: OK,
    note: 'the real imperative line (40 cards: Portent, Balduvian Rage, ...); SYNTHETIC card around it',
  },
  {
    kind: 'sorcery',
    text: "Draw a card.\nYou draw a card at the beginning of the next turn's upkeep.",
    expect: OK,
    note: 'SYNTHETIC: an immediate draw and the delayed one',
  },
  {
    kind: 'creature',
    text: "When ~ enters, draw a card at the beginning of the next turn's upkeep.",
    expect: OK,
    note: 'SYNTHETIC: the delayed draw under an enters trigger',
  },
  {
    kind: 'sorcery',
    text: "Suspend 1—{U}\nYou draw two cards at the beginning of the next turn's upkeep.",
    expect: OK,
    note: 'SYNTHETIC: a number of cards, beside Suspend',
  },
];

const REFUSED_BY_THE_ENGINE: readonly Line[] = [
  {
    kind: 'land',
    text: 'Suspend 2—{R}',
    expect: { engine: 'suspend' },
    note: 'SYNTHETIC: a land is not cast, so it cannot be suspended',
  },
  {
    kind: 'creature',
    text: 'Suspend 2—{R}\nSuspend 1—{G}',
    expect: { engine: 'suspend' },
    note: 'SYNTHETIC: one suspend ability on a face',
  },
  {
    kind: 'land',
    text: 'Madness {R}',
    expect: { engine: 'madness' },
    note: 'SYNTHETIC: a land is not cast',
  },
  {
    kind: 'creature',
    text: 'Madness {R}\nMadness {1}{B}',
    expect: { engine: 'more than one alternative cost of kind madness' },
    note: 'SYNTHETIC: a second alternative of the same kind (CR 118.9a)',
  },
  {
    kind: 'land',
    text: 'Foretell {R}',
    expect: { engine: 'foretell' },
    note: 'SYNTHETIC: a land is not cast',
  },
  {
    kind: 'creature',
    text: 'Foretell {R}\nForetell {1}{B}',
    expect: { engine: 'more than one alternative cost of kind foretell' },
    note: 'SYNTHETIC: a second alternative of the same kind (CR 118.9a)',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Suspend 2—{X}{B}',
    expect: no('{X}{B}', 'keyword.suspend'),
    note: 'SYNTHETIC: X in the cost',
  },
  {
    kind: 'sorcery',
    text: 'Suspend 2—Pay 2 life.',
    expect: no('Pay 2 life.', 'keyword.suspend'),
    note: 'SYNTHETIC: a cost that is not mana',
  },
  {
    kind: 'sorcery',
    text: 'Suspend 0—{R}',
    expect: no('0—{R}', 'keyword.suspend'),
    note: 'SYNTHETIC: no time counters',
  },
  {
    kind: 'creature',
    text: 'Flying, suspend 2—{1}{B}',
    expect: no('suspend 2—{1}{B}', 'keyword.line'),
    note: 'SYNTHETIC: Suspend is read on a line of its own, not in a keyword list',
  },
  {
    kind: 'creature',
    text: 'Madness {X}{B}',
    expect: no('{X}{B}', 'keyword.madness'),
    note: 'SYNTHETIC: X in the cost',
  },
  {
    kind: 'creature',
    text: 'Madness—Discard a card.',
    expect: no('Madness—Discard a card.', NONE),
    note: 'SYNTHETIC: a cost that is not mana',
  },
  {
    kind: 'creature',
    text: 'Foretell {X}{R}',
    expect: no('{X}{R}', 'keyword.foretell'),
    note: 'SYNTHETIC: X in the cost',
  },
  {
    kind: 'creature',
    text: 'Foretell—Pay 2 life.',
    expect: no('Foretell—Pay 2 life.', NONE),
    note: 'SYNTHETIC: a cost that is not mana',
  },
  {
    kind: 'instant',
    text: "Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep.",
    expect: OK,
    note: 'Arcane Denial as printed (real text): read since stage P64 (D-217): the player is remembered from the resolution and chooses the number',
  },
  {
    kind: 'sorcery',
    text: 'You draw a card at the beginning of your next upkeep.',
    expect: no('at the beginning of your next upkeep.', 'effect.player.draw'),
    note: 'SYNTHETIC: "your next upkeep" is not read',
  },
  {
    kind: 'sorcery',
    text: "You gain 2 life at the beginning of the next turn's upkeep.",
    expect: no("at the beginning of the next turn's upkeep.", 'effect.player.life'),
    note: 'SYNTHETIC: only the draw is a delayed effect the grammar reads',
  },
];

runCorpus('stage P26: cast-later lines read and run', SUPPORTED);
runCorpus('stage P26: what stays unread', UNREAD);

runCorpus('stage P26: what the engine refuses', REFUSED_BY_THE_ENGINE);
