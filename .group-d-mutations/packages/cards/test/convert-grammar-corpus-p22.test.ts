// The template corpus of stage P22: the named alternative costs (D-117, D-121; ENGINE_VERSION 22). The keyword
// lines are the real shapes of reports/templates.json ("Overload {6}{U}", "Evoke {2}{U}", "Dash {1}{R}") and the
// real wording of Cyclonic Rift; everything else is SYNTHETIC (the Oracle text of the other cards is not in the
// repository). No real card is marked supported here except through the golden corpus. Each line says whether it
// must import as supported, or where and why it stops, so a change that makes the grammar read less OR more than
// it should fails here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const RIFT = "Return target nonland permanent you don't control to its owner's hand.";
const RIFT_REMINDER =
  '(You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")';

const SUPPORTED: readonly Line[] = [
  {
    kind: 'instant',
    text: `${RIFT}\nOverload {6}{U} ${RIFT_REMINDER}`,
    expect: OK,
    note: 'Cyclonic Rift: the real text, in the golden corpus',
  },
  {
    kind: 'instant',
    text: `${RIFT}\nOverload {6}{U}`,
    expect: OK,
    note: 'the same without the reminder text',
  },
  {
    kind: 'sorcery',
    text: `Overload {4}{R}\n${RIFT}`,
    expect: OK,
    note: 'SYNTHETIC: the keyword line first, on a sorcery',
  },
  {
    kind: 'sorcery',
    text: "Destroy target creature you don't control.\nOverload {5}{B}{B}",
    expect: OK,
    note: 'SYNTHETIC: a destroy; the engine changes the target to each creature you do not control',
  },
  {
    kind: 'creature',
    text: 'Flying\nWhen ~ enters, draw two cards.\nEvoke {2}{U}',
    expect: OK,
    note: 'SYNTHETIC; the shape of Mulldrifter, whose real text is not in the repository',
  },
  {
    kind: 'creature',
    text: 'Evoke {1}{B}',
    expect: OK,
    note: 'SYNTHETIC: Evoke on a creature with no other ability',
  },
  {
    kind: 'artifact',
    text: 'Evoke {R}',
    expect: OK,
    note: 'SYNTHETIC: Evoke on a permanent card that is not a creature',
  },
  {
    kind: 'creature',
    text: 'Dash {1}{R}',
    expect: OK,
    note: 'SYNTHETIC: Dash on a creature with no other ability',
  },
  {
    kind: 'creature',
    text: 'Haste\nDash {2}{R}{R}',
    expect: OK,
    note: 'SYNTHETIC: a keyword line and the dash line',
  },
  {
    kind: 'creature',
    text: 'Evoke {2}{U}\nDash {1}{R}',
    expect: OK,
    note: 'SYNTHETIC: two different kinds on one card (CR 118.9a is per spell)',
  },
  {
    kind: 'creature',
    text: 'Dash {1}{R} (SYNTHETIC reminder text.)',
    expect: OK,
    note: 'SYNTHETIC: reminder text dropped before the line is read',
  },
];

const REFUSED_BY_THE_ENGINE: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Choose one —\n• Draw a card.\n• You gain 2 life.\nOverload {3}{U}',
    expect: { engine: 'overload needs spell text' },
    note: 'SYNTHETIC: a modal spell cannot be overloaded; the card stays unsupported with the engine reason',
  },
  {
    kind: 'sorcery',
    text: 'Target player draws a card.\nOverload {3}{U}',
    expect: { engine: 'overload needs spell text' },
    note: 'SYNTHETIC: a player slot has no "each" the engine can read off the text',
  },
  {
    kind: 'sorcery',
    text: 'Draw a card.\nOverload {3}{U}',
    expect: { engine: 'overload needs spell text' },
    note: 'SYNTHETIC: a spell with no target has nothing for the cost to change',
  },
  {
    kind: 'creature',
    text: 'Overload {3}{G}',
    expect: { engine: 'overload is on an instant or a sorcery' },
    note: 'SYNTHETIC: Overload on a permanent card',
  },
  {
    kind: 'instant',
    text: 'Evoke {2}{U}',
    expect: { engine: 'evoke is on a permanent card' },
    note: 'SYNTHETIC: Evoke on an instant',
  },
  {
    kind: 'enchantment',
    text: 'Dash {1}{R}',
    expect: { engine: 'dash is on a creature card' },
    note: 'SYNTHETIC: Dash on a permanent that is not a creature',
  },
  {
    kind: 'creature',
    text: 'Evoke {2}{U}\nEvoke {1}{B}',
    expect: { engine: 'more than one alternative cost of kind evoke' },
    note: 'SYNTHETIC: a second alternative of the same kind (CR 118.9a)',
  },
  {
    kind: 'creature',
    text: 'Dash {1}{R}\nDash {2}{R}',
    expect: { engine: 'more than one alternative cost of kind dash' },
    note: 'SYNTHETIC: a second alternative of the same kind',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Evoke—Exile a white card from your hand.',
    expect: no('Evoke—Exile a white card from your hand.', NONE),
    note: 'real wording of Solitude, Fury, Grief, Endurance and Subtlety (backlog): a cost that is not mana is not read',
  },
  {
    kind: 'creature',
    text: 'Evoke {X}{U}',
    expect: no('{X}{U}', 'keyword.evoke'),
    note: 'SYNTHETIC: X in the cost (CR 107.3b)',
  },
  {
    kind: 'creature',
    text: 'Dash—Pay 3 life.',
    expect: no('Dash—Pay 3 life.', NONE),
    note: 'SYNTHETIC: a cost that is not mana',
  },
  {
    kind: 'instant',
    text: `${RIFT}\nOverload {X}{U}`,
    expect: no('{X}{U}', 'keyword.overload'),
    note: 'SYNTHETIC: X in the cost; the spell text is read but the card stays unsupported',
  },
  {
    kind: 'instant',
    text: `${RIFT}\nOverload {6}{U}\nSYNTHETIC Rider: fly under the radar.`,
    expect: no('SYNTHETIC Rider: fly under the radar.', NONE),
    note: 'SYNTHETIC: another line the grammar does not read keeps the card unsupported',
  },
];

runCorpus('stage P22: lines of the named alternative costs read and run', SUPPORTED);
runCorpus('stage P22: refused by validateCard, with the engine reason', REFUSED_BY_THE_ENGINE);
runCorpus('stage P22: what stays unread', UNREAD);
