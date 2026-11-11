// The SYNTHETIC template corpus of stage P18: the trigger slice of the engine (D-108, D-111). Each line is a
// template written after a real shape of the replay report (reports/template-replay.md, the owner's run,
// parser version 4; the count of cards is in the note as the report prints it) or marked SYNTHETIC; none is
// a real card's text, and no real card is marked supported here. Each line says whether it must import as
// supported, or where and why it stops, so a change that makes the grammar read less OR more than it should
// fails here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const STEPS: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'At the beginning of combat on your turn, put a +1/+1 counter on target creature you control.',
    expect: OK,
    note: 'replay: 4 cards',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your draw step, you gain 1 life.',
    expect: OK,
    note: 'SYNTHETIC; the draw step',
  },
  {
    kind: 'enchantment',
    text: "At the beginning of each opponent's upkeep, you gain 1 life.",
    expect: OK,
    note: 'SYNTHETIC; the body of the replay line is "that player sacrifices", which has no engine selector',
  },
  {
    kind: 'enchantment',
    text: 'At the beginning of your precombat main phase, you gain 1 life.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'enchantment',
    text: 'At end of combat, you gain 1 life.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: 'At the beginning of each combat, double the power and toughness of each creature you control until end of turn.',
    expect: OK,
    note: 'replay: 2 cards; read since stage P32 (D-147): the `affected` power and toughness of the engine',
  },
  {
    kind: 'enchantment',
    text: "At the beginning of each opponent's upkeep, that player sacrifices a creature of their choice.",
    expect: OK,
    note: 'replay: 1 card; "that player" is the player whose turn it is, the occurrence player of a step trigger (Keeper of the Accord, bruna-keeper)',
  },
  {
    kind: 'enchantment',
    text: "At the beginning of each player's draw step, that player draws an additional card.",
    expect: no('additional card.', 'effect.player.draw'),
    note: 'replay: 5 cards; "that player" is read since stage P29, the extra card of the draw step is not',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your upkeep, you may pay {4}. If you do, untap ~.',
    expect: OK,
    note: 'replay: 6 cards; read since stage P21 (the engine runs "you may pay [cost]. If you do", D-120)',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your draw step, if ~ is tapped, it deals 1 damage to you.',
    expect: no('it deals 1 damage to you.', 'noun.it', { reason: 'unboundReference' }),
    note: 'replay: 1 card; the condition is read since stage P29 ("~ is tapped"), the "it" of the damage is not about anything',
  },
];

const DRAWS: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'Whenever an opponent draws their second card each turn, you draw a card.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: 'Whenever you draw a card, put a +1/+1 counter on ~.',
    expect: OK,
    note: 'replay: 10 cards',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you draw a card, each opponent loses 1 life.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you draw a card, you gain 2 life.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'creature',
    text: 'Whenever you draw a card, ~ deals 1 damage to any target.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'enchantment',
    text: 'Whenever you draw a card, put a +1/+1 counter on target creature you control.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'Whenever an opponent draws a card, you may draw two cards.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'Whenever an opponent draws a card, ~ deals 1 damage to that player.',
    expect: OK,
    note: 'replay: 4 cards; "that player" is the engine\'s `triggerPlayer` since stage P29 (D-133)',
  },
  {
    kind: 'enchantment',
    text: 'Whenever an opponent draws a card, they lose 2 life.',
    expect: OK,
    note: 'replay: 1 card; "they" is the player the text has just named, the engine\'s `triggerPlayer` (stage P33, D-150)',
  },
  {
    kind: 'enchantment',
    text: "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.",
    expect: no("may pay {2}. If the player doesn't, you create a Treasure token.", 'effect.player'),
    note: 'replay: 1 card; "that player" is read since stage P29; "may pay" with a rider is not "unless"',
  },
  {
    kind: 'enchantment',
    text: 'Whenever an opponent draws a card, you may draw a card unless that player pays {1}.',
    expect: OK,
    note: 'SYNTHETIC; the shape of the cast trigger on a draw: the player who drew is `triggerPlayer` since stage P29 (D-133)',
  },
];

const DAMAGE: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Whenever ~ deals combat damage to a player, put a +1/+1 counter on it.',
    expect: OK,
    note: 'replay: 19 cards',
  },
  {
    kind: 'enchantment',
    text: 'Whenever a creature you control deals combat damage to a player, you may draw a card.',
    expect: OK,
    note: 'replay: 3 cards',
  },
  {
    kind: 'equipment',
    text: 'Whenever equipped creature attacks, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\nEquip {1}',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'enchantment',
    text: 'Whenever one or more creatures you control deal combat damage to a player, create a Treasure token.',
    expect: OK,
    note: "replay: 3 cards; read since stage P31 (D-140): the engine's `combatDamageBatch`, once for each player damaged",
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.',
    expect: no('deals damage to an opponent, you may draw a card.', 'trigger.becomes-target'),
    note: 'replay: 3 cards; damage that is not combat damage is not an event the engine reads',
  },
  {
    kind: 'equipment',
    text: 'Whenever equipped creature deals combat damage to a player, that player discards a card and you untap all lands you control.\nEquip {3}',
    expect: no('untap all lands you control.', 'effect.player'),
    note: 'replay: 1 card; "that player" is read since stage P29, "untap all lands you control" after "you" is not',
  },
  {
    kind: 'creature',
    text: 'Whenever a creature you control leaves the battlefield, if it had counters on it, put those counters on ~.',
    expect: no('those counters on ~.', 'effect.add-counters'),
    note: 'replay: 1 card; "if it had counters" is not a condition the grammar reads (the engine refuses a look-back condition that counts)',
  },
  {
    kind: 'enchantment',
    text: 'Whenever a creature an opponent controls dies, that player loses 2 life.',
    expect: no('that player loses 2 life.', 'noun.that-player', { reason: 'unboundReference' }),
    note: 'replay: 1 card; "that player" is the controller of the creature, which no antecedent of the text names',
  },
  {
    kind: 'creature',
    text: "When ~ is put into a graveyard from the battlefield, return it to its owner's hand.",
    expect: OK,
    note: 'replay: 20 cards; the trigger is "dies" (CR 700.4); "return it" is the card the permanent became, the engine\'s thisCard (stage P35, D-176)',
  },
  {
    kind: 'creature',
    text: 'When ~ leaves the battlefield, you gain 3 life.',
    expect: OK,
    note: 'SYNTHETIC',
  },
];

const ATTACHED: readonly Line[] = [
  {
    kind: 'equipment',
    text: 'Whenever equipped creature dies, draw two cards.\nEquip {2}',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nWhenever enchanted creature attacks, scry 1.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nWhenever enchanted creature becomes tapped, scry 1.',
    expect: no('enchanted creature becomes tapped, scry 1.', 'noun.attached-permanent', {
      reason: 'notRunnable',
    }),
    note: 'SYNTHETIC; an Aura could enchant a land, and the engine subject does not check the type of its host',
  },
  {
    kind: 'creature',
    text: 'Whenever enchanted creature attacks, scry 1.',
    expect: no('enchanted creature attacks, scry 1.', 'noun.attached-permanent', {
      reason: 'notRunnable',
    }),
    note: 'SYNTHETIC; nothing is attached to a creature card',
  },
];

const COUNTS: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'Whenever a creature you control with power 4 or greater enters, draw a card.',
    expect: OK,
    note: 'replay: 4 cards',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, if you control a creature with power 4 or greater, draw a card.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'land',
    text: "{T}: Add {C}.\n{3}, {T}: Target creature with power 3 or less can't be blocked this turn.",
    expect: OK,
    note: 'replay: 5 cards (the second line)',
  },
  {
    kind: 'creature',
    text: '{T}: Add {G}{G}{G}{G}. Activate only if you control a creature with power 4 or greater.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'artifact',
    text: '{3}, {T}: Draw a card. Activate only if you control a creature with power 4 or greater.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: 'Counter target spell with mana value 1.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'sorcery',
    text: 'Destroy target nonland permanent with mana value 3 or less.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'sorcery',
    text: 'Return target creature card with mana value 3 or less from your graveyard to the battlefield.',
    expect: OK,
    note: 'replay: 3 cards',
  },
  {
    kind: 'instant',
    text: 'Exile target permanent with mana value 4 or greater.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'artifact',
    text: "{T}, Sacrifice ~: Target creature with power 2 or less can't be blocked this turn.",
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: "~ can't be blocked by creatures with power 2 or less.",
    expect: OK,
    note: "replay: 31 cards; read since stage P31 (D-140): the engine's `cantBeBlockedBy`",
  },
  {
    kind: 'enchantment',
    text: 'Creature spells you cast with power 4 or greater cost {2} less to cast.',
    expect: OK,
    note: 'replay: 1 card; read since stage P32 (D-147): the cost reduction compares the power of the spell',
  },
  {
    kind: 'enchantment',
    text: 'Whenever a nontoken creature you control enters, put a +1/+1 counter on it and draw a card.',
    expect: OK,
    note: 'replay: 1 card; read since stage P29: "nontoken" is a part of the filter and "it" the creature that entered (D-133)',
  },
  {
    kind: 'enchantment',
    text: 'Creatures you control with power 2 or less have flying.',
    expect: no('Creatures you control with power 2 or less have flying.', 'noun.plain-permanents', {
      reason: 'notRunnable',
    }),
    note: 'SYNTHETIC; only a +1/+1 effect may name its creatures by power (CR 613.8)',
  },
];

const UNLESS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'Whenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your upkeep, sacrifice ~ unless you pay {U}.',
    expect: OK,
    note: 'replay: 44 cards',
  },
  {
    kind: 'enchantment',
    text: 'Whenever a player casts an instant or sorcery spell, you draw a card.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is ~'s power.",
    expect: no(
      "their first noncreature spell each turn, draw a card unless that player pays {X}, where X is ~'s power.",
      'trigger.cast',
    ),
    note: 'replay: 1 card; "first ... each turn" is not an event the engine reads, and {X} has no value here',
  },
  {
    kind: 'enchantment',
    text: 'Whenever an opponent casts a spell, you may draw a card unless any opponent pays {1}.',
    expect: no('any opponent pays {1}.', 'condition.unless-pays'),
    note: 'SYNTHETIC; "any opponent may pay" is not built',
  },
  {
    kind: 'enchantment',
    text: 'Whenever an opponent casts a spell, draw a card unless that player pays {X}.',
    expect: no('{X}.', 'condition.unless-pays'),
    note: 'SYNTHETIC; no X in a triggered ability (CR 107.3j)',
  },
];

runCorpus('the template corpus (stage P18): steps and phases', STEPS);
runCorpus('the template corpus (stage P18): a card drawn', DRAWS);
runCorpus('the template corpus (stage P18): combat damage and leaving the battlefield', DAMAGE);
runCorpus('the template corpus (stage P18): the attached permanent', ATTACHED);
runCorpus('the template corpus (stage P18): power, toughness and mana value', COUNTS);
runCorpus('the template corpus (stage P18): "unless a player pays"', UNLESS);
