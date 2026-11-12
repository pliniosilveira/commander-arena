// The SYNTHETIC template corpus of stage P11: the references the engine runs since D-092 and D-096
// (the power and mana value of a target, "its controller" creating tokens and searching, "target
// player's graveyard", "counter ... unless its controller pays", a land you control returned to its
// owner's hand). Each line is a template written after a real shape of the replay report
// (reports/template-replay.md and the templates behind it, parser version 4; the count of cards is
// in the note as the report prints it) or marked SYNTHETIC; none is a real card's text, and no real
// card is marked supported here. Each line says whether it must import as supported, or where and
// why it stops, so a change that makes the grammar read less OR more than it should fails here. The
// kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const POWER_AND_VALUE: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Exile target creature. Its controller gains life equal to its power.',
    expect: OK,
    note: 'replay: 1 card (Swords to Plowshares); the heaviest line of the report',
  },
  {
    kind: 'sorcery',
    text: "Destroy target creature. You gain life equal to that creature's power.",
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'sorcery',
    text: 'Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card’s mana value.',
    expect: OK,
    note: 'replay: 1 card; a reanimation that costs life',
  },
  {
    kind: 'sorcery',
    text: 'Put target creature card from a graveyard onto the battlefield tapped. You lose life equal to its mana value.',
    expect: OK,
    note: 'SYNTHETIC; the control is the default (CR 110.2a)',
  },
  {
    kind: 'sorcery',
    text: 'Destroy target creature or enchantment an opponent controls. You lose life equal to that permanent’s mana value.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: 'Counter target spell. You lose life equal to that spell’s mana value.',
    expect: OK,
    note: 'SYNTHETIC; a spell’s mana value is read since stage P37 (D-180: "that spell\'s mana value", the engine reads it from the spell that was countered, CR 608.2h)',
  },
  {
    kind: 'instant',
    text: 'Counter target spell. Its controller gains life equal to its power.',
    expect: no('equal to its power.', 'effect.player', { reason: 'notRunnable' }),
    note: 'SYNTHETIC; a spell on the stack has no power, so it is read and not lowered',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you lose life equal to its mana value.',
    expect: no('equal to its mana value.', 'effect.player', { reason: 'notRunnable' }),
    note: 'SYNTHETIC; the mana value of ~ is not something a rule reads',
  },
  {
    kind: 'creature',
    text: 'Whenever a creature you control enters, you gain life equal to its power.',
    expect: OK,
    note: 'SYNTHETIC; read since stage P28 (D-131): the engine reads the power of the trigger subject (`triggerSubject`)',
  },
];

const IT_CONTROLLER: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
    expect: OK,
    note: 'replay: 1 card (Path to Exile)',
  },
  {
    kind: 'sorcery',
    text: 'Destroy target permanent an opponent controls. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: 'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.',
    expect: OK,
    note: 'replay: 1 card (Beast Within)',
  },
  {
    kind: 'instant',
    text: 'Destroy target nonland permanent. Its controller creates a 1/1 white Human creature token.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: 'Counter target noncreature spell. Its controller creates two Treasure tokens.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: 'Destroy target creature. It can’t be regenerated. Its controller creates a 3/3 green Ape creature token.',
    expect: OK,
    note: 'replay: 1 card; read since stage P21: the second sentence is the flag of the destroy, the third is read as before',
  },
  {
    kind: 'instant',
    text: 'Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.',
    expect: OK,
    note: 'replay: 1 card; read since stage P15 (a token with a keyword of the engine)',
  },
  {
    kind: 'instant',
    text: 'Exile target creature. Its controller manifests the top card of their library.',
    expect: OK,
    note: 'replay: 1 card; read since manifest (D-967, CR 701.40a): the engine effect `manifest` and the verb of effect.player',
  },
  {
    kind: 'instant',
    text: 'Counter target spell. Its controller may draw up to two cards at the beginning of the next turn’s upkeep.',
    expect: OK,
    note: "replay: 1 card; read since stage P64 (D-217): a delayed draw of up to two cards by the countered spell's controller",
  },
  {
    kind: 'instant',
    text: 'Exile target creature. Its controller searches their library for a basic land card, put it onto the battlefield, then shuffle.',
    expect: no(
      'searches their library for a basic land card, put it onto the battlefield, then shuffle.',
      'effect.player',
    ),
    note: 'SYNTHETIC; without "may" the search is not read',
  },
  {
    kind: 'sorcery',
    text: 'Destroy target land. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle. Creatures without flying can’t block this turn.',
    expect: OK,
    note: 'replay: 1 card; read since stage P29: "without flying" is a part of the filter (D-133)',
  },
];

const GRAVEYARD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'When ~ enters, exile target player’s graveyard.',
    expect: OK,
    note: 'replay: 5 cards',
  },
  {
    kind: 'land',
    text: '~ enters tapped.\nWhen ~ enters, exile target player’s graveyard.\n{T}: Add {B}.',
    expect: OK,
    note: 'shaped after Bojuka Bog',
  },
  { kind: 'sorcery', text: 'Exile target player’s graveyard.', expect: OK, note: 'SYNTHETIC' },
  {
    kind: 'sorcery',
    text: 'Exile target opponent’s graveyard.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'sorcery',
    text: 'Exile each player’s graveyard.',
    expect: OK,
    note: 'SYNTHETIC; read since stage P31 (D-140): the cards each player owns there (`owner` `eachPlayer`)',
  },
];

const COUNTER_UNLESS: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Counter target spell unless its controller pays {3}.',
    expect: OK,
    note: 'replay: 27 cards',
  },
  {
    kind: 'instant',
    text: 'Counter target noncreature spell unless its controller pays {2}.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'instant',
    text: 'Counter target instant or sorcery spell unless its controller pays {1}.',
    expect: OK,
    note: 'replay: 3 cards',
  },
  {
    kind: 'instant',
    text: 'Counter target spell unless its controller pays {X}.',
    expect: no('{X}.', 'effect.counter-unless'),
    note: 'SYNTHETIC; the engine has no {X} here',
  },
  {
    kind: 'instant',
    text: 'Counter target spell unless its controller pays 2 life.',
    expect: no('2 life.', 'effect.counter-unless'),
    note: 'SYNTHETIC; no line of the corpus says it, so no rule reads it',
  },
  {
    kind: 'instant',
    text: 'Counter target noncreature spell. If that spell is countered this way, exile it instead of putting it into its owner’s graveyard.',
    expect: no(
      'If that spell is countered this way, exile it instead of putting it into its owner’s graveyard.',
      'spell.effect',
    ),
    note: 'replay: 1 card',
  },
];

const BOUNCE: readonly Line[] = [
  {
    kind: 'creature',
    text: 'When ~ enters, return a land you control to its owner’s hand.',
    expect: OK,
    note: 'replay: 12 cards (bounce lands)',
  },
  {
    kind: 'land',
    text: '~ enters tapped.\nWhen ~ enters, return a land you control to its owner’s hand.\n{T}: Add {W}{U}.',
    expect: OK,
    note: 'shaped after the bounce lands',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you may return a creature you control to its owner’s hand.',
    expect: OK,
    note: 'SYNTHETIC; "you may" makes the whole ability optional (CR 603.5)',
  },
  {
    kind: 'sorcery',
    text: 'Return a land to its owner’s hand.',
    expect: no('to its owner’s hand.', 'effect.return'),
    note: 'SYNTHETIC; without "you control" the choice would reach every player’s lands',
  },
  {
    kind: 'sorcery',
    text: 'Return target creature to its owner’s hand. Untap up to two lands.',
    expect: OK,
    note: 'replay: 1 card; the player chooses up to two lands to untap (stage P63, D-216: Teferi, Hero of Dominaria)',
  },
];

const KEYWORDS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Fear',
    expect: OK,
    note: 'replay: 37 cards; the engine runs fear (D-094)',
  },
  {
    kind: 'creature',
    text: 'Intimidate',
    expect: OK,
    note: 'replay: 22 cards; the engine runs intimidate (D-094)',
  },
  {
    kind: 'creature',
    text: 'Shadow',
    expect: OK,
    note: 'replay: 36 cards; the engine runs shadow (D-094)',
  },
  {
    kind: 'instant',
    text: 'Target creature gains shadow until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; a keyword the engine can grant is a word of "gains"',
  },
];

runCorpus('the template corpus (stage P11)', [
  ...POWER_AND_VALUE,
  ...IT_CONTROLLER,
  ...GRAVEYARD,
  ...COUNTER_UNLESS,
  ...BOUNCE,
  ...KEYWORDS,
]);
