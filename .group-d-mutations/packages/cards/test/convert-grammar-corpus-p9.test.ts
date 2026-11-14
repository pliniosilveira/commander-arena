// The SYNTHETIC template corpus of stage P9: class T gaps of reports/template-replay.md (the engine
// already runs what the line means, the grammar did not read the wording). Each line is a template
// written after a real shape of the replay report (reports/template-replay.md and the templates
// behind it, parser version 4; the count of cards is in the note as the report prints it) or marked
// SYNTHETIC; none is a real card's text, and no real card is marked supported here. Each line says
// whether it must import as supported, or where and why it stops, so a change that makes the grammar
// read less OR more than it should fails here. The kinds of expectation are those of
// convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const COUNTERSPELLS: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Counter target noncreature spell.',
    expect: OK,
    note: "replay: 6 cards (Negate and Dovin's Veto shapes)",
  },
  { kind: 'instant', text: 'Counter target spell.', expect: OK, note: 'unchanged' },
  { kind: 'instant', text: 'Counter target creature spell.', expect: OK, note: 'SYNTHETIC' },
  {
    kind: 'instant',
    text: 'Counter target instant or sorcery spell.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: 'Counter target enchantment, instant, or sorcery spell.',
    expect: OK,
    note: 'SYNTHETIC; the first sentence of a replay line with a second sentence',
  },
  {
    kind: 'instant',
    text: 'Counter target blue spell.',
    expect: OK,
    note: 'replay: the first mode of a modal spell',
  },
  {
    kind: 'instant',
    text: 'Counter target noncreature spell. Its controller creates two Treasure tokens.',
    expect: OK,
    note: "replay: 1 card; the token is created under the spell's controller (D-092, stage P11)",
  },
  {
    kind: 'instant',
    text: 'Counter target noncreature spell unless its controller pays {2}.',
    expect: OK,
    note: 'replay: 2 cards; counterUnlessPays names a target spell (D-092, stage P11)',
  },
  {
    kind: 'instant',
    text: 'Counter target spell with mana value 1.',
    expect: OK,
    note: 'replay: 2 cards; a spell filter compares mana value since stage P18 (D-111)',
  },
];

const SWORDS: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Destroy target artifact or enchantment. Its controller gains 4 life.',
    expect: OK,
    note: 'replay: 1 card; "its controller" is the controller of the target (CR 109.4)',
  },
  {
    kind: 'instant',
    text: "Destroy target creature. That creature's controller loses 2 life.",
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: 'Exile target creature. Its controller gains life equal to its power.',
    expect: OK,
    note: 'replay: the heaviest line of the report (Swords to Plowshares); the engine reads the power of a target since D-092 (stage P11)',
  },
  {
    kind: 'instant',
    text: 'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.',
    expect: OK,
    note: "replay: 1 card; the token goes to the target's controller (D-092, stage P11)",
  },
  {
    kind: 'instant',
    text: 'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
    expect: OK,
    note: 'replay: 1 card; the controller of the target searches (D-092, stage P11)',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ attacks, you gain life equal to its power.',
    expect: OK,
    note: 'SYNTHETIC; the power of ~ is what the engine reads',
  },
];

const CASTING: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'Whenever you cast a creature spell, draw a card.',
    expect: OK,
    note: 'replay: 3 cards',
  },
  {
    kind: 'creature',
    text: 'Whenever you cast an instant or sorcery spell, ~ deals 2 damage to each opponent.',
    expect: OK,
    note: 'replay: 4 cards',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast a noncreature spell, ~ deals 1 damage to each opponent.',
    expect: OK,
    note: 'replay: 6 cards',
  },
  {
    kind: 'creature',
    text: 'Whenever a player casts a spell, you may put a +1/+1 counter on ~.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast an enchantment spell, draw a card.',
    expect: OK,
    note: 'replay: 3 cards',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast an enchantment spell, you may draw a card.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'enchantment',
    text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
    expect: OK,
    note: 'replay: 1 card; "an opponent casts" and "unless that player pays" since stage P18 (D-111)',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you cast or copy an instant or sorcery spell, draw a card.',
    expect: OK,
    note: 'replay: 1 card; read since stage P65 (D-218): the trigger sees the copy of a spell',
  },
  {
    kind: 'enchantment',
    text: "Whenever you cast a creature spell, create a token that's a copy of it.",
    expect: { engine: 'cannot tell the type of' },
    note: 'SYNTHETIC; the triggering object is a spell, not a permanent to copy (CR 707.2)',
  },
];

const OR_SUBJECTS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Whenever ~ or another creature dies, target player loses 1 life and you gain 1 life.',
    expect: OK,
    note: 'replay: 2 cards (Blood Artist and Falkenrath Noble shapes)',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ or another creature you control dies, each opponent loses 1 life and you gain 1 life.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ or another creature enters, you gain 1 life.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ or a creature dies, you gain 1 life.',
    expect: no('dies, you gain 1 life.', 'trigger.or-subjects'),
    note: 'SYNTHETIC; "a creature" is ~ itself too, which is not what "another" says',
  },
  {
    kind: 'creature',
    text: 'At the beginning of the end step, sacrifice ~.',
    expect: OK,
    note: 'replay: 16 cards; "the end step" is every end step (CR 513.1a)',
  },
  {
    kind: 'creature',
    text: 'At the beginning of the next end step, sacrifice ~.',
    expect: no('next end step, sacrifice ~.', 'trigger.end-step'),
    note: 'SYNTHETIC; a delayed trigger (CR 603.7) is not an engine ability',
  },
];

const CONDITIONS: readonly Line[] = [
  {
    kind: 'land',
    text: '~ enters tapped unless you control a legendary creature.',
    expect: OK,
    note: 'replay: 6 cards',
  },
  {
    kind: 'land',
    text: '~ enters tapped unless you control a basic land.',
    expect: OK,
    note: 'replay: 5 cards',
  },
  {
    kind: 'land',
    text: '~ enters tapped unless you control three or more other Islands.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'land',
    text: '~ enters tapped unless your opponents control eight or more lands.',
    expect: OK,
    note: 'replay: 8 cards; read since stage P73 (D-236): the lands of all the opponents together',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, if you control a legendary creature, you gain 1 life.',
    expect: OK,
    note: 'SYNTHETIC; the intervening "if" of a trigger takes the same condition (CR 603.4)',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, if you control a creature with power 4 or greater, draw a card.',
    expect: OK,
    note: 'replay: 2 cards; a filter compares power since stage P18 (D-111)',
  },
];

const SELF: readonly Line[] = [
  {
    kind: 'creature',
    text: '{3}: Untap ~.',
    expect: OK,
    note: 'replay: 21 cards',
  },
  {
    kind: 'creature',
    text: "{W}: Return ~ to its owner's hand.",
    expect: OK,
    note: 'replay: 32 cards',
  },
  {
    kind: 'sorcery',
    text: 'Draw a card. Exile ~.',
    expect: OK,
    note: 'replay: 26 cards say "Exile ~." after other sentences',
  },
  {
    kind: 'creature',
    text: "{T}: Draw a card, then put ~ on top of its owner's library.",
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'artifact',
    text: '{1}{W}, {T}: Put target enchantment card from your graveyard on top of your library.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: "When ~ dies, return ~ to its owner's hand.",
    expect: no("return ~ to its owner's hand.", 'effect.return', { reason: 'notRunnable' }),
    note: 'SYNTHETIC; ~ is a card in a graveyard when the effect runs (CR 400.7), and the engine moves nothing from there',
  },
  {
    kind: 'instant',
    text: 'Untap ~.',
    expect: no('Untap ~.', 'effect.untap', { reason: 'notRunnable' }),
    note: 'SYNTHETIC; a spell is not a permanent',
  },
];

const DAMAGE_AND_ATTACH: readonly Line[] = [
  {
    kind: 'land',
    text: 'Whenever ~ becomes tapped, it deals 1 damage to you.\n{T}: Add {C}.',
    expect: OK,
    note: 'replay: 1 card (a pain land shape)',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, it deals 1 damage to target opponent.',
    expect: OK,
    note: 'replay: 10 cards',
  },
  {
    kind: 'creature',
    text: 'Remove a +1/+1 counter from ~: It deals 1 damage to any target.',
    expect: OK,
    note: 'replay: 3 cards',
  },
  {
    kind: 'creature',
    text: 'Sacrifice ~: It deals 1 damage to any target.',
    expect: no('It deals 1 damage to any target.', 'noun.it', { reason: 'unboundReference' }),
    note: 'SYNTHETIC; "it" is a sacrificed permanent',
  },
  {
    kind: 'equipment',
    text: 'When ~ enters, attach it to target creature you control.',
    expect: OK,
    note: 'replay: 30 cards',
  },
  {
    kind: 'equipment',
    text: 'When ~ enters, attach it to target legendary creature you control.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'creature',
    text: 'Whenever another creature enters, you may gain 1 life.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'sorcery',
    text: 'Draw two cards and lose 2 life.',
    expect: OK,
    note: 'SYNTHETIC',
  },
];

const TARGETS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'When ~ enters, destroy up to one target artifact or enchantment.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'sorcery',
    text: 'Return up to three target land cards from your graveyard to your hand.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, put a +1/+1 counter on each of up to two target creatures.',
    expect: OK,
    note: 'replay: 6 cards; read since stage P15 ("each of up to two target creatures" is one target slot)',
  },
  {
    kind: 'aura',
    text: 'Enchant Forest',
    expect: OK,
    note: 'replay: 2 cards; a basic land type is a subtype (CR 205.3i)',
  },
  {
    kind: 'aura',
    text: 'Enchant player',
    expect: no('player', 'keyword.enchant'),
    note: 'replay: 46 cards; the engine enchants permanents',
  },
];

const OTHERS: readonly Line[] = [
  {
    kind: 'creature',
    text: "~ can't be countered.",
    expect: OK,
    note: 'replay: 87 cards; the engine runs it since D-094 (stage P12)',
  },
  {
    kind: 'creature',
    text: 'Changeling',
    expect: OK,
    note: 'replay: 62 cards; read since stage P17 (the engine runs it, D-104)',
  },
  {
    kind: 'creature',
    text: 'Cumulative upkeep {1}',
    expect: OK,
    note: 'replay: 57 cards; read since stage P25 (the engine runs it, D-127; it was an unread keyword, D-119, before)',
  },
  {
    kind: 'creature',
    text: 'Convoke',
    expect: OK,
    note: 'replay: 102 cards; read since stage P21 (the engine runs it, D-120)',
  },
];

runCorpus('the template corpus (stage P9)', [
  ...COUNTERSPELLS,
  ...SWORDS,
  ...CASTING,
  ...OR_SUBJECTS,
  ...CONDITIONS,
  ...SELF,
  ...DAMAGE_AND_ATTACH,
  ...TARGETS,
  ...OTHERS,
]);
