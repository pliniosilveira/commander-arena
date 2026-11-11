// The template corpus of stage P23: the second slice of named alternative costs (D-117, D-124; ENGINE_VERSION 23).
// The lines are the real shapes of reports/templates.json ("Spectacle {R}", "Escape—{G}{G}{U}{U}, Exile five
// other cards from your graveyard.", "Unearth {R}", "When ~ enters, sacrifice it unless it escaped."); everything
// else is SYNTHETIC (the Oracle text of the cards that have them is not in the repository). No real card is
// marked supported here except through the golden corpus. Each line says whether it must import as supported, or
// where and why it stops, so a change that makes the grammar read less OR more than it should fails here. The kinds
// of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const ESCAPE = 'Escape—{G}{G}{U}{U}, Exile five other cards from your graveyard.';
const UNLESS_ESCAPED = 'When ~ enters, sacrifice it unless it escaped.';

const SUPPORTED: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Spectacle {R}',
    expect: OK,
    note: 'the real line; SYNTHETIC card around it',
  },
  {
    kind: 'creature',
    text: 'Spectacle {1}{R}\nHaste',
    expect: OK,
    note: 'SYNTHETIC: a keyword and the spectacle line',
  },
  {
    kind: 'sorcery',
    text: 'Spectacle {B}\nDraw a card.',
    expect: OK,
    note: 'SYNTHETIC: Spectacle on a sorcery with spell text',
  },
  {
    kind: 'instant',
    text: 'Spectacle {U}\nDraw a card.',
    expect: OK,
    note: 'SYNTHETIC: Spectacle on an instant',
  },
  {
    kind: 'creature',
    text: 'Dash {1}{R}\nSpectacle {R}',
    expect: OK,
    note: 'SYNTHETIC: two different kinds on one card (CR 118.9a is per spell)',
  },
  {
    kind: 'creature',
    text: `${UNLESS_ESCAPED}\n${ESCAPE}`,
    expect: OK,
    note: 'the two real lines of Uro (the other lines of that card are not in this test); SYNTHETIC card around them',
  },
  {
    kind: 'creature',
    text: ESCAPE,
    expect: OK,
    note: 'the real escape line alone: the card escapes and nothing else is said',
  },
  {
    kind: 'creature',
    text: 'Flying\nEscape—{B}{B}, Exile three other cards from your graveyard.',
    expect: OK,
    note: 'SYNTHETIC: a keyword and the escape line',
  },
  {
    kind: 'sorcery',
    text: 'Draw a card.\nEscape—{B}{B}, Exile two other cards from your graveyard.',
    expect: OK,
    note: 'SYNTHETIC: Escape on a sorcery',
  },
  {
    kind: 'instant',
    text: 'Draw a card.\nEscape—{U}{U}, Exile four other cards from your graveyard.',
    expect: OK,
    note: 'SYNTHETIC: Escape on an instant',
  },
  {
    kind: 'creature',
    text: 'Unearth {R}',
    expect: OK,
    note: 'the real line; SYNTHETIC card around it',
  },
  {
    kind: 'creature',
    text: 'Flying\nWhen ~ dies, draw a card.\nUnearth {2}{B}',
    expect: OK,
    note: 'SYNTHETIC: a keyword, a trigger and the unearth line',
  },
  {
    kind: 'creature',
    text: 'Unearth {1}{B}\nEscape—{B}{B}, Exile three other cards from your graveyard.',
    expect: OK,
    note: 'SYNTHETIC: both graveyard mechanics on one creature',
  },
  {
    kind: 'artifact',
    text: 'Unearth {R}',
    expect: OK,
    note: 'SYNTHETIC: Unearth on a permanent that is not a creature (the engine allows any permanent card)',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, sacrifice it.',
    expect: OK,
    note: 'SYNTHETIC: "sacrifice it" is the permanent itself in its own enters trigger',
  },
];

const REFUSED_BY_THE_ENGINE: readonly Line[] = [
  {
    kind: 'creature',
    text: UNLESS_ESCAPED,
    expect: { engine: 'need an escape cost' },
    note: 'the real line on a card with no escape cost: nothing could have escaped (CR 702.138b)',
  },
  {
    kind: 'creature',
    text: 'Delve\nEscape—{B}{B}, Exile three other cards from your graveyard.',
    expect: { engine: 'escape with delve is not supported' },
    note: 'SYNTHETIC: both would exile the same cards',
  },
  {
    kind: 'land',
    text: 'Spectacle {R}',
    expect: { engine: 'spectacle' },
    note: 'SYNTHETIC: a land is not cast',
  },
  {
    kind: 'land',
    text: 'Escape—{B}{B}, Exile three other cards from your graveyard.',
    expect: { engine: 'escape is on a spell, not on a land' },
    note: 'SYNTHETIC: a land is not cast',
  },
  {
    kind: 'creature',
    text: 'Spectacle {R}\nSpectacle {1}{R}',
    expect: { engine: 'more than one alternative cost of kind spectacle' },
    note: 'SYNTHETIC: a second alternative of the same kind (CR 118.9a)',
  },
  {
    kind: 'creature',
    text: 'Escape—{B}{B}, Exile three other cards from your graveyard.\nEscape—{B}, Exile five other cards from your graveyard.',
    expect: { engine: 'more than one alternative cost of kind escape' },
    note: 'SYNTHETIC: a second alternative of the same kind',
  },
  {
    kind: 'instant',
    text: 'Unearth {R}',
    expect: { engine: 'unearth' },
    note: 'SYNTHETIC: unearth on an instant (a permanent card only)',
  },
  {
    kind: 'creature',
    text: 'Unearth {R}\nUnearth {1}{R}',
    expect: { engine: 'unearth' },
    note: 'SYNTHETIC: two unearth instances on a card',
  },
];

const UNREAD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Escape—{B}{B}, Pay 3 life, Exile three other cards from your graveyard.',
    expect: no(', Pay 3 life, Exile three other cards from your graveyard.', 'keyword.escape'),
    note: 'SYNTHETIC: another component of the cost',
  },
  {
    kind: 'creature',
    text: 'Escape—{X}{B}, Exile three other cards from your graveyard.',
    expect: no('{X}{B}, Exile three other cards from your graveyard.', 'keyword.escape'),
    note: 'SYNTHETIC: X in the cost',
  },
  {
    kind: 'creature',
    text: 'Escape—{B}{B}, Exile ten other cards from your graveyard.',
    expect: no('ten other cards from your graveyard.', 'keyword.escape'),
    note: 'SYNTHETIC: a count above nine',
  },
  {
    kind: 'creature',
    text: 'Spectacle—Pay 2 life.',
    expect: no('Spectacle—Pay 2 life.', NONE),
    note: 'SYNTHETIC: a cost that is not mana',
  },
  {
    kind: 'creature',
    text: 'Spectacle {X}{R}',
    expect: no('{X}{R}', 'keyword.spectacle'),
    note: 'SYNTHETIC: X in the cost',
  },
  {
    kind: 'creature',
    text: 'Unearth {X}{R}',
    expect: no('{X}{R}', 'keyword.unearth'),
    note: 'SYNTHETIC: X in the cost',
  },
  {
    kind: 'creature',
    text: 'Unearth—Pay 2 life.',
    expect: no('Unearth—Pay 2 life.', NONE),
    note: 'SYNTHETIC: a cost that is not mana',
  },
  {
    kind: 'creature',
    text: `${UNLESS_ESCAPED}\nEscape—{B}{B}, Pay 3 life, Exile three other cards from your graveyard.`,
    expect: no(', Pay 3 life, Exile three other cards from your graveyard.', 'keyword.escape'),
    note: 'the real trigger beside an escape line that is not read: the dropped line is the reason',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, draw a card unless it escaped.\nEscape—{B}{B}, Exile three other cards from your graveyard.',
    expect: no('~ enters, draw a card unless it escaped.', 'ability.triggered', {
      reason: 'notRunnable',
    }),
    note: 'SYNTHETIC: the condition is lowered only as the sacrifice of the permanent in its own enters trigger',
  },
  {
    kind: 'enchantment',
    text: "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.",
    expect: no(
      "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard.",
      NONE,
    ),
    note: 'the real shape of Underworld Breach: a grant of escape to the cards of a graveyard, not built (D-124)',
  },
  {
    kind: 'creature',
    text: '~ escapes with a +1/+1 counter on it.',
    expect: no('escapes with a +1/+1 counter on it.', 'static.self'),
    note: 'SYNTHETIC wording: "escapes with" (CR 702.138c) is not read, no real line is in the repository',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you may sacrifice it unless it escaped.\nEscape—{B}{B}, Exile three other cards from your graveyard.',
    expect: no('~ enters, you may sacrifice it unless it escaped.', 'ability.triggered', {
      reason: 'notRunnable',
    }),
    note: 'SYNTHETIC: a choice beside the escape condition is not lowered',
  },
];

runCorpus('stage P23: lines of the named alternative costs read and run', SUPPORTED);
runCorpus('stage P23: refused by validateCard, with the engine reason', REFUSED_BY_THE_ENGINE);
runCorpus('stage P23: what stays unread', UNREAD);
