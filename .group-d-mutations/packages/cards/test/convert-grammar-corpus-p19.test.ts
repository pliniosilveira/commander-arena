// The SYNTHETIC template corpus of stage P19: modal spells and abilities (D-105, D-114; ENGINE_VERSION 19).
// Each line is a template written after a real shape of the replay report (reports/template-replay.md, the
// owner's run, parser version 4; the count of cards is in the note as the report prints it) or marked
// SYNTHETIC; none is a real card's text, and no real card is marked supported here. Each line says whether it
// must import as supported, or where and why it stops, so a change that makes the grammar read less OR more
// than it should fails here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const REPLAY: readonly Line[] = [
  {
    kind: 'instant',
    text: "Choose one. If you control a commander as you cast ~, you may choose both instead.\n• Add {R} for each card in target opponent's hand.\n• Exile the top three cards of your library. You may play them this turn.",
    expect: no(
      "for each card in target opponent's hand.\n• Exile the top three cards of your library. You may play them this turn.",
      'effect.add-mana',
    ),
    note: 'replay: 1 card; the widening is read, the first mode ("Add {R} for each card ...") is not',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your first main phase, choose one or more —\n• Sell Contraband — Create a Treasure token. You lose 1 life.\n• Buy Information — Draw a card. You lose 2 life.\n• Hire a Mercenary — Create a 3/2 colorless Shapeshifter creature token with changeling. You lose 3 life.',
    expect: no(
      'Sell Contraband — Create a Treasure token. You lose 1 life.\n• Buy Information — Draw a card. You lose 2 life.\n• Hire a Mercenary — Create a 3/2 colorless Shapeshifter creature token with changeling. You lose 3 life.',
      'modal.choose',
    ),
    note: 'replay: 1 card; the labels before the bullets are not rules text the grammar reads',
  },
  {
    kind: 'instant',
    text: 'Choose one —\n• ~ deals 3 damage to target creature.\n• Destroy target artifact.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'sorcery',
    text: 'Choose two —\n• Destroy all artifacts.\n• Destroy all enchantments.\n• Destroy all creatures with mana value 3 or less.\n• Destroy all creatures with mana value 4 or greater.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: 'Choose one —\n• Draw cards equal to the greatest power among non-Human creatures you control.\n• Non-Human creatures you control get +3/+3 until end of turn.',
    expect: OK,
    note: 'replay: 1 card; read since stage P29 ("non-Human" is a part of the filter, D-133)',
  },
  {
    kind: 'sorcery',
    text: 'Choose one or more —\n• Exile all artifacts.\n• Exile all creatures.\n• Exile all enchantments.\n• Exile all graveyards.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: 'Choose one —\n• ~ deals 4 damage to target player or planeswalker.\n• Permanents you control gain indestructible until end of turn.\n• Target creature gains double strike until end of turn.',
    expect: OK,
    note: 'replay: 1 card; read since stage P37 (D-180): "target player or planeswalker" is the player (the engine has no planeswalker permanent to target)',
  },
  {
    kind: 'instant',
    text: 'Choose one. If you control a commander as you cast ~, you may choose both instead.\n• Creatures you control gain flying, vigilance, and double strike until end of turn.\n• Creatures you control gain lifelink, indestructible, and protection from each color until end of turn.',
    expect: no('protection from each color until end of turn.', 'effect.gain-keyword-all'),
    note: 'replay: 1 card; the second mode grants "protection from each color", which no rule reads',
  },
  {
    kind: 'instant',
    text: "Choose one —\n• Destroy target artifact.\n• Change the target of target spell or ability with a single target.\n• One or two target creatures can't block this turn.",
    expect: OK,
    note: 'replay: 1 card; the second mode ("Change the target of target spell or ability", stage P38, D-182) is read, and since D-295 the third ("One or two target creatures can\'t block this turn")',
  },
  {
    kind: 'creature',
    text: "Whenever you cast a spell, choose up to one —\n• Return target spell you don't control to its owner's hand.\n• Return target nonland permanent to its owner's hand.",
    expect: no(
      "choose up to one —\n• Return target spell you don't control to its owner's hand.\n• Return target nonland permanent to its owner's hand.",
      'modal.choose',
    ),
    note: 'replay: 1 card; "choose up to one" has no minimum of one, which the engine\'s modal choice needs',
  },
  {
    kind: 'instant',
    text: "Choose one —\n• Exile target player's graveyard.\n• Destroy target artifact.\n• Each creature deals 1 damage to its controller.",
    expect: no('deals 1 damage to its controller.', 'effect.gain-keyword-each'),
    note: 'replay: 1 card; the third mode is read by no effect rule (an "each" that deals damage)',
  },
  {
    kind: 'instant',
    text: 'Choose one —\n• Counter target blue spell.\n• Destroy target blue permanent.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: "Choose one —\n• Counter target spell if it's blue.\n• Destroy target permanent if it's blue.",
    expect: no("if it's blue.\n• Destroy target permanent if it's blue.", 'noun.target-spell'),
    note: 'replay: 1 card; a condition on a spell target is not read',
  },
  {
    kind: 'creature',
    text: 'Whenever a land you control enters, choose one —\n• Create a 2/2 white Cat Beast creature token.\n• Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.',
    expect: no('Those creatures gain vigilance until end of turn.', 'modal.choose'),
    note: 'replay: 1 card; the second mode says "Those creatures gain vigilance"',
  },
  {
    kind: 'instant',
    text: "Choose one —\n• Search your library for a creature or land card and reveal it. Put it onto the battlefield tapped if it's a land card. Otherwise, put it into your hand. Then shuffle.\n• Put a +1/+1 counter on target creature you control. It deals damage equal to its power to target creature you don't control.\n• Exile target artifact or enchantment.",
    expect: no(
      "and reveal it. Put it onto the battlefield tapped if it's a land card. Otherwise, put it into your hand. Then shuffle.\n• Put a +1/+1 counter on target creature you control. It deals damage equal to its power to target creature you don't control.\n• Exile target artifact or enchantment.",
      'effect.search',
    ),
    note: 'replay: 1 card; the reveal and the conditional destination of the search are not read',
  },
  {
    kind: 'instant',
    text: 'Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Exile target card from a graveyard.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'instant',
    text: 'Choose one or more —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Target creature gains hexproof and indestructible until end of turn.',
    expect: OK,
    note: 'replay: 1 card',
  },
];

const SYNTHETIC: readonly Line[] = [
  {
    kind: 'instant',
    text: 'Choose one or both —\n• Draw a card.\n• You gain 4 life.',
    expect: OK,
    note: 'SYNTHETIC; "one or both" is two modes',
  },
  {
    kind: 'instant',
    text: 'Choose one. If you control a commander as you cast ~, you may choose both instead.\n• Draw a card.\n• You gain 3 life.',
    expect: OK,
    note: 'SYNTHETIC; the replay has the wording with modes the grammar does not read',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, choose one —\n• You gain 3 life.\n• ~ deals 2 damage to target creature an opponent controls.',
    expect: OK,
    note: 'SYNTHETIC; a modal enters trigger',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ attacks, choose one —\n• Draw a card.\n• Target creature gets +1/+1 until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; a modal attack trigger',
  },
  {
    kind: 'artifact',
    text: '{2}, {T}: Choose one —\n• Draw a card.\n• You gain 3 life.',
    expect: OK,
    note: 'SYNTHETIC; a modal activated ability',
  },
  {
    kind: 'instant',
    text: 'Choose X —\n• Draw a card.\n• You gain 3 life.',
    expect: no('Choose X —\n• Draw a card.\n• You gain 3 life.', 'none'),
    note: 'SYNTHETIC; "choose X" is not a number of modes the engine runs',
  },
  {
    kind: 'instant',
    text: 'Choose three —\n• Draw a card.\n• You gain 3 life.\n• Scry 1.',
    expect: no('Choose three —\n• Draw a card.\n• You gain 3 life.\n• Scry 1.', 'none'),
    note: 'SYNTHETIC; the lead lines read are one, two, one or both and one or more (D-114)',
  },
  {
    kind: 'instant',
    text: 'Choose one —\n• Draw a card.',
    expect: no('Choose one —\n• Draw a card.', 'modal.choose', { reason: 'notRunnable' }),
    note: 'SYNTHETIC; a modal spell has two modes at least (CR 700.2)',
  },
  {
    kind: 'instant',
    text: 'Escalate {1}',
    expect: { engine: 'escalate belongs to a modal spell that lets more than one mode be chosen' },
    note: 'SYNTHETIC; Escalate is read since stage P32 (D-147); alone it has no modes to choose beyond the first',
  },
  {
    kind: 'instant',
    text: 'Entwine {2}',
    expect: no('Entwine {2}', 'none'),
    note: 'SYNTHETIC; Entwine chooses all the modes for a cost, which the engine does not run',
  },
  {
    kind: 'instant',
    text: 'Spree',
    expect: no('Spree', 'none'),
    note: 'SYNTHETIC; Spree puts a cost on each mode, which the engine does not run',
  },
  {
    kind: 'creature',
    text: 'Choose one —\n• Draw a card.\n• You gain 3 life.',
    expect: no('Choose one —\n• Draw a card.\n• You gain 3 life.', 'modal.choose'),
    note: 'SYNTHETIC; a permanent has no spell to give modes to',
  },
];

runCorpus('the template corpus of stage P19 (replay lines)', REPLAY);
runCorpus('the template corpus of stage P19 (SYNTHETIC lines)', SYNTHETIC);
