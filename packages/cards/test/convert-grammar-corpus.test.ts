// A SYNTHETIC corpus of Oracle-text lines written from the templates the grammar covers (S1 spell
// effects, P1 mana, lands, triggers and tokens) and from the ones it deliberately does not. Nothing here is real card data: names are invented and
// every line is a template, some shaped after the unsupported cards of the owner's first real deck
// (docs/analysis/korvold-deck-blockers.md, "shaped after"; that document has the tags, not the
// Oracle text). Each line says whether it must import as supported or not, and why not, so a
// change that makes the grammar read less OR more than it should fails here:
//
// - `supported`: every ability parsed and the engine validator is clean;
// - `unparsed`: the text is not read; the diagnostic must point where it stops;
// - `engine`: the text is read into the AST, but the engine does not run something in it yet.
import { expect, test } from 'vitest';
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const SPELLS: readonly Line[] = [
  // Damage (CR 120)
  { kind: 'instant', text: '~ deals 3 damage to any target.', expect: OK },
  { kind: 'instant', text: '~ deals 2 damage to target creature.', expect: OK },
  { kind: 'sorcery', text: '~ deals 4 damage to target player.', expect: OK },
  { kind: 'instant', text: '~ deals 1 damage to target opponent.', expect: OK },
  { kind: 'instant', text: '~ deals 3 damage to each opponent.', expect: OK },
  { kind: 'sorcery', text: '~ deals 5 damage to each creature.', expect: OK },
  { kind: 'sorcery', text: '~ deals 2 damage to each creature you don’t control.', expect: OK },
  { kind: 'instant', text: '~ deals three damage to target creature you control.', expect: OK },
  { kind: 'instant', text: '~ deals 3 damage to any target. You gain 3 life.', expect: OK },
  {
    kind: 'instant',
    text: '~ deals 2 damage to target creature or planeswalker.',
    expect: OK,
    note: 'stage P2: a choice of types is ObjectFilter.anyOf',
  },
  {
    kind: 'sorcery',
    text: '~ deals X damage to target player or planeswalker and each creature they control.',
    expect: no('they control.', 'noun.each-permanent'),
    note: 'shaped after Lavalanche: "target player or planeswalker" is read since stage P37 (D-180), and "each creature that player controls"; "they control" on a player is not',
  },
  {
    kind: 'instant',
    text: '~ deals X damage to any target.',
    expect: OK,
    note: 'read into the AST (Amount x); the engine runs X spells since D-103',
  },
  {
    kind: 'instant',
    text: '~ deals damage to target creature equal to its power.',
    expect: no('equal to its power.', 'effect.damage-count'),
    note: 'an amount that depends on an object is not in the template',
  },

  // Destroy (CR 701.8)
  { kind: 'instant', text: 'Destroy target creature.', expect: OK },
  { kind: 'sorcery', text: 'Destroy target nonland permanent.', expect: OK },
  { kind: 'sorcery', text: 'Destroy target artifact.', expect: OK },
  { kind: 'sorcery', text: 'Destroy target enchantment.', expect: OK },
  { kind: 'sorcery', text: 'Destroy target land.', expect: OK },
  { kind: 'sorcery', text: 'Destroy target planeswalker.', expect: OK },
  { kind: 'instant', text: 'Destroy target creature an opponent controls.', expect: OK },
  { kind: 'instant', text: 'Destroy target tapped creature.', expect: OK },
  {
    kind: 'sorcery',
    text: 'Destroy target artifact, target creature, target enchantment, and target land.',
    expect: OK,
    note: 'shaped after Decimate: four target slots, four destroy effects in one sequence',
  },
  { kind: 'sorcery', text: 'Destroy all creatures.', expect: OK },
  { kind: 'sorcery', text: 'Destroy all artifacts.', expect: OK },
  { kind: 'sorcery', text: 'Destroy all lands.', expect: OK },
  { kind: 'sorcery', text: 'Destroy all nonland permanents.', expect: OK },
  { kind: 'instant', text: 'Destroy target creature or planeswalker.', expect: OK },
  {
    kind: 'instant',
    text: 'Destroy target nonblack creature.',
    expect: no('nonblack creature.', 'noun.target-permanent'),
    note: 'there is no "not this color" in the filter',
  },
  {
    kind: 'instant',
    text: 'Destroy target creature with flying.',
    expect: OK,
    note: 'read since stage P29: "with flying" is a part of the filter (D-133)',
  },
  {
    kind: 'sorcery',
    text: 'Destroy all creatures. They can’t be regenerated this turn.',
    expect: no('this turn.', 'effect.cant-be-regenerated'),
    note: 'SYNTHETIC; the engine\'s flag is on this destroy only, "this turn" would also cover a later destruction (stage P21)',
  },
  {
    kind: 'sorcery',
    text: 'Destroy all creatures. They can’t be regenerated.',
    expect: OK,
    note: 'replay: 4 cards; the engine has regeneration and the flag on destroy since D-120 (stage P21)',
  },
  {
    kind: 'sorcery',
    text: 'Destroy up to two target creatures.',
    expect: OK,
    note: 'SYNTHETIC; "up to two" is a target slot with no minimum (stage P9, CR 115.2)',
  },
  {
    kind: 'instant',
    text: 'Destroy target creature. Its controller loses 2 life.',
    expect: OK,
    note: 'SYNTHETIC; "its controller" is the controller of the target (stage P9, CR 109.4)',
  },

  // Exile (CR 406)
  { kind: 'instant', text: 'Exile target creature.', expect: OK },
  { kind: 'sorcery', text: 'Exile target nonland permanent.', expect: OK },
  { kind: 'sorcery', text: 'Exile target card from a graveyard.', expect: OK },
  { kind: 'sorcery', text: 'Exile all creatures.', expect: OK },
  { kind: 'sorcery', text: 'Exile two target creatures.', expect: OK },
  { kind: 'instant', text: 'Exile target creature. You gain 3 life.', expect: OK },
  {
    kind: 'instant',
    text: 'Exile target artifact or enchantment.',
    expect: OK,
    note: 'shaped after the first half of Tear Asunder (which also has kicker): stage P2 reads the choice',
  },
  {
    kind: 'sorcery',
    text: 'Exile target player’s graveyard.',
    expect: OK,
    note: 'shaped after Bojuka Bog: the cards of a graveyard selected by their owner (D-092, stage P11)',
  },

  // Return (CR 400, 701.8 zone changes)
  { kind: 'instant', text: 'Return target creature to its owner’s hand.', expect: OK },
  { kind: 'instant', text: "Return target nonland permanent to its owner's hand.", expect: OK },
  { kind: 'sorcery', text: 'Return all creatures to their owners’ hands.', expect: OK },
  {
    kind: 'sorcery',
    text: 'Return target creature card from your graveyard to your hand.',
    expect: OK,
  },
  {
    kind: 'sorcery',
    text: 'Return target creature card from your graveyard to the battlefield.',
    expect: OK,
  },
  {
    kind: 'sorcery',
    text: 'Return all land cards from your graveyard to the battlefield tapped.',
    expect: OK,
    note: 'shaped after Splendid Reclamation',
  },
  {
    kind: 'sorcery',
    text: 'Return target creature card from an opponent’s graveyard to your hand.',
    expect: no('from an opponent’s graveyard to your hand.', 'effect.return'),
    note: 'it would go to the owner’s hand, not yours',
  },
  {
    kind: 'sorcery',
    text: 'Put all creature cards from all graveyards onto the battlefield under your control.',
    expect: OK,
    note: 'shaped after Rise of the Dark Realms; read since stage P15 ("from all graveyards" names no owner, and the engine puts what it moves under the control of the effect, CR 110.2a)',
  },

  // Counter (CR 701.6)
  { kind: 'instant', text: 'Counter target spell.', expect: OK },
  { kind: 'instant', text: 'Counter target spell. Draw a card.', expect: OK },
  {
    kind: 'instant',
    text: 'Counter target spell unless its controller pays {1}.',
    expect: OK,
    note: 'the controller of the spell may pay on resolution (D-092, stage P11)',
  },
  {
    kind: 'instant',
    text: 'Counter target creature spell.',
    expect: OK,
    note: 'SYNTHETIC; a spell filter of card types (stage P9)',
  },

  // Players, cards and life (CR 119, 121)
  { kind: 'sorcery', text: 'Draw a card.', expect: OK },
  { kind: 'sorcery', text: 'Draw two cards.', expect: OK },
  { kind: 'sorcery', text: 'Draw three cards.', expect: OK },
  { kind: 'sorcery', text: 'Target player draws two cards.', expect: OK },
  { kind: 'sorcery', text: 'Each player draws a card.', expect: OK },
  { kind: 'instant', text: 'You gain 5 life.', expect: OK },
  { kind: 'instant', text: 'Target player gains 4 life.', expect: OK },
  { kind: 'sorcery', text: 'Each opponent loses 2 life.', expect: OK },
  { kind: 'sorcery', text: 'Target player loses 3 life.', expect: OK },
  { kind: 'sorcery', text: 'Target player draws two cards and loses 2 life.', expect: OK },
  { kind: 'sorcery', text: 'You gain 3 life and draw a card.', expect: OK },
  { kind: 'sorcery', text: 'Draw a card. Shuffle your library.', expect: OK },
  { kind: 'sorcery', text: 'Destroy target creature. Draw a card.', expect: OK },
  { kind: 'sorcery', text: 'Destroy target creature, then draw a card.', expect: OK },
  {
    kind: 'sorcery',
    text: 'Draw X cards.',
    expect: OK,
  },
  { kind: 'sorcery', text: 'Draw a card, then discard a card.', expect: OK },
  { kind: 'sorcery', text: 'Target player discards a card.', expect: OK },
  {
    kind: 'sorcery',
    text: 'You may draw a card.',
    expect: no('may draw a card.', 'effect.player'),
    note: 'optional effects need the "may" decision',
  },

  // Tap, untap and mana (CR 701.26, 106)
  { kind: 'instant', text: 'Tap target creature.', expect: OK },
  { kind: 'instant', text: 'Untap target land.', expect: OK },
  { kind: 'sorcery', text: 'Untap all lands you control.', expect: OK },
  { kind: 'sorcery', text: 'Tap all creatures your opponents control.', expect: OK },
  { kind: 'instant', text: 'Add {C}{C}.', expect: OK },
  { kind: 'instant', text: 'Add {R}{R}{R}.', expect: OK },
  {
    kind: 'instant',
    text: 'Add one mana of any color.',
    expect: no('one mana of any color.', 'effect.add-mana', {
      reason: 'notRunnable',
      needs: ['selector:colorChoice'],
    }),
    note: 'read, but the interpreter has no color choice while a spell resolves (a mana ability chooses while paying)',
  },

  // Structure and everything the engine has no node for
  {
    kind: 'sorcery',
    text: 'Choose one —\n• Destroy all creatures.\n• Draw a card.',
    expect: OK,
    note: 'modal spells run since D-105 and D-114; the parser reads them since stage P19',
  },
  {
    kind: 'sorcery',
    text: 'Escalate {1}',
    expect: { engine: 'escalate belongs to a modal spell that lets more than one mode be chosen' },
    note: 'Escalate is read since stage P32 (D-147); alone it has no modes to choose beyond the first (D-114)',
  },
  {
    kind: 'instant',
    text: 'Target creature gets +3/+0 until end of turn.',
    expect: OK,
    note: 'shaped after Overkill; stage P2 reads it (modifyPt until end of turn)',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    expect: OK,
    note: 'stage P2: library search',
  },
  {
    kind: 'instant',
    text: 'The next time a source of your choice would deal damage to you this turn, prevent that damage.',
    expect: no(
      'The next time a source of your choice would deal damage to you this turn, prevent that damage.',
      NONE,
    ),
    note: 'a source chosen as the effect is created (CR 609.7a) is not read; stage P7a reads shields with a fixed recipient',
  },
  {
    kind: 'instant',
    text: 'Kicker {2}',
    expect: { engine: 'an instant or sorcery must have spell text' },
    note: 'Kicker is read since stage P4 (D-079); an instant with nothing else has no text for it to apply to',
  },
];

const REPLACEMENTS: readonly Line[] = [
  {
    kind: 'land',
    text: '~ enters tapped.',
    expect: OK,
    note: 'the enters-tapped lines of the deck',
  },
  { kind: 'land', text: '~ enters the battlefield tapped.', expect: OK },
  { kind: 'land', text: '~ enters tapped.\n{T}: Add {G}.', expect: OK },
  { kind: 'creature', text: '~ enters with two +1/+1 counters on it.', expect: OK },
  { kind: 'creature', text: '~ enters with a +1/+1 counter on it.', expect: OK },
  {
    kind: 'creature',
    text: '~ enters the battlefield with three +1/+1 counters on it.',
    expect: OK,
  },
  {
    kind: 'creature',
    text: '~ enters with X +1/+1 counters on it.',
    expect: OK,
    note: 'stage P16: the X of the spell it was cast as (D-103, CR 107.3m); the card has an {X}',
  },
  {
    kind: 'land',
    text: '~ enters tapped.\nWhen ~ enters, exile target player’s graveyard.\n{T}: Add {B}.',
    expect: OK,
    note: 'shaped after Bojuka Bog: the whole land reads (D-092, stage P11)',
  },
];

const P1_MANA_AND_LANDS: readonly Line[] = [
  // Real shapes of the backlog (reports/backlog.md), numbers as printed.
  { kind: 'land', text: '{T}: Add {U} or {B}.', expect: OK, note: 'backlog: 305 cards' },
  { kind: 'land', text: '{T}: Add {R}, {G}, or {W}.', expect: OK, note: 'backlog: 38 cards' },
  { kind: 'land', text: '{T}: Add {C}.', expect: OK },
  { kind: 'land', text: '{T}: Add {G}{G}.', expect: OK },
  { kind: 'artifact', text: '{1}, {T}: Add {U}{B}.', expect: OK, note: 'backlog: 31 cards' },
  {
    kind: 'land',
    text: '{T}: Add {U} or {B}. ~ deals 1 damage to you.',
    expect: OK,
    note: 'backlog: 26 cards (pain lands)',
  },
  {
    kind: 'land',
    text: '{T}: Add {C}{C}. ~ deals 2 damage to you.',
    expect: OK,
    note: 'backlog: 8 cards',
  },
  { kind: 'land', text: '{T}: Add {W}. You gain 1 life.', expect: OK },
  { kind: 'land', text: '{T}: Add {B}{B}. You lose 2 life.', expect: OK },
  {
    kind: 'land',
    text: '~ enters tapped unless you control two or more basic lands.\n{T}: Add {U} or {R}.',
    expect: OK,
    note: 'backlog: 10 cards (check lands)',
  },
  {
    kind: 'land',
    text: '~ enters tapped unless you control two or more other lands.\n{T}: Add {G} or {W}.',
    expect: OK,
    note: 'backlog: 10 cards',
  },
  {
    kind: 'land',
    text: '~ enters tapped unless you have two or more opponents.\n{T}: Add {G} or {U}.',
    expect: OK,
    note: 'backlog: 10 cards',
  },
  {
    kind: 'land',
    text: '~ enters tapped unless you control an Island or a Mountain.\n{T}: Add {U} or {R}.',
    expect: OK,
    note: 'backlog: Sulfur Falls and two more shapes of the same kind',
  },
  {
    kind: 'land',
    text: '~ enters tapped unless you control two or fewer other lands.\n{T}: Add {B} or {G}.',
    expect: OK,
    note: 'SYNTHETIC line of the printed fast-land wording; not in the first 100 shapes of the backlog',
  },
  {
    kind: 'land',
    text: "As ~ enters, you may pay 2 life. If you don't, it enters tapped.\n{T}: Add {G} or {U}.",
    expect: OK,
    note: 'backlog: 26 cards (shock lands)',
  },
  {
    kind: 'artifact',
    text: 'You have no maximum hand size.',
    expect: OK,
    note: 'backlog: 23 cards',
  },
  {
    kind: 'land',
    text: 'You have no maximum hand size.\n{T}: Add {C}.',
    expect: OK,
    note: 'shaped after Reliquary Tower',
  },
  // What stays out, and where the diagnostic points.
  {
    kind: 'land',
    text: '{T}: Add {R}{R}, {R}{W}, or {W}{W}.',
    expect: OK,
    note: 'stage P14: a choice among combinations is the engine `combination` production (D-099)',
  },
  {
    kind: 'land',
    text: '{T}: Add one mana of any color that a land an opponent controls could produce.',
    expect: OK,
    note: 'stage P14 (backlog: 4 cards): the engine `couldProduce` production (D-099, D-102)',
  },
  {
    kind: 'land',
    text: '{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}.',
    expect: OK,
    note: 'stage P14 (backlog: filter lands): a hybrid cost of a mana ability and `combination`',
  },
  {
    kind: 'land',
    text: '{T}, Pay 1 life: Add {W} or {B}.',
    expect: OK,
    note: 'stage P14: the engine pays life for a mana ability (D-099; stage P2 reads "Pay N life")',
  },
  {
    kind: 'land',
    text: '{T}: Add {R}{W}, {W}{R}, or {R}{R}.',
    expect: no('or {R}{R}.', 'ability.activated'),
    note: 'still unread: "{R}{W}" and "{W}{R}" are one combination twice, and the engine has none of that',
  },
  {
    kind: 'land',
    text: '{T}: Add {G}. Spend this mana only to cast creature spells.',
    expect: OK,
    note: 'stage P33 (D-149, D-150): the engine restricts what mana is spent on (`spendOnly`, CR 106.6); it was unread before',
  },
  {
    kind: 'land',
    text: '{T}: Add {G}. Activate only once each turn.',
    expect: no('Activate only once each turn.', 'restriction.once-each-turn', {
      reason: 'notRunnable',
    }),
    note: 'read and not run (stage P31): the engine limits the activations of an ordinary ability per turn, not of a mana ability',
  },
  {
    kind: 'land',
    text: '{G/P}, {T}: Add {G}{G}.',
    expect: no('{G/P}, {T}: Add {G}{G}.', NONE),
    note: 'still unread: a Phyrexian symbol in a mana ability cost (the planner pays hybrid, not that)',
  },
  {
    kind: 'land',
    text: '{T}: Add {U} or {B}. ~ deals 1 damage to target creature.',
    expect: no('{U} or {B}. ~ deals 1 damage to target creature.', 'effect.add-mana', {
      reason: 'notRunnable',
      needs: ['selector:colorChoice'],
    }),
    note: 'with a target it is not a mana ability (CR 605.1a), so the colour is chosen as it resolves',
  },
  {
    kind: 'land',
    text: '~ enters tapped unless you control a creature with flying.',
    expect: OK,
    note: 'read since stage P29: "with flying" is a part of the filter (D-133)',
  },
  {
    kind: 'land',
    text: "As ~ enters, you may pay {2}. If you don't, it enters tapped.",
    expect: no("{2}. If you don't, it enters tapped.", 'replacement.enters-tapped-unless-pays'),
    note: 'only life can be paid here',
  },
  {
    kind: 'artifact',
    text: 'You have no maximum hand size as long as you control a Dragon.',
    expect: no('You have no maximum hand size as long as you control a Dragon.', NONE),
    note: 'a condition on a static ability is not read',
  },
];

const P1_TRIGGERS: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Flying\nWhenever ~ enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on ~ and draw a card.',
    expect: OK,
    note: 'the text of Korvold, Fae-Cursed King as in the golden corpus, with ~ for its name',
  },
  { kind: 'creature', text: 'When ~ enters, draw a card.', expect: OK, note: 'backlog: 117 cards' },
  {
    kind: 'creature',
    text: 'When ~ enters, you gain 1 life.',
    expect: OK,
    note: 'backlog: 119 cards',
  },
  {
    kind: 'creature',
    text: 'When ~ dies, you may draw a card.',
    expect: OK,
    note: 'backlog: 4 cards',
  },
  { kind: 'creature', text: 'When ~ dies, create a Treasure token.', expect: OK },
  { kind: 'creature', text: 'Whenever ~ attacks, each opponent loses 1 life.', expect: OK },
  { kind: 'creature', text: 'Whenever ~ attacks, ~ deals 1 damage to each opponent.', expect: OK },
  { kind: 'creature', text: 'Whenever ~ becomes tapped, you gain 1 life.', expect: OK },
  { kind: 'creature', text: 'At the beginning of your upkeep, draw a card.', expect: OK },
  { kind: 'creature', text: 'At the beginning of each end step, you gain 1 life.', expect: OK },
  { kind: 'creature', text: 'At the beginning of your end step, sacrifice ~.', expect: OK },
  {
    kind: 'enchantment',
    text: 'Whenever a land you control enters, create a 1/1 white Soldier creature token.',
    expect: OK,
  },
  {
    kind: 'enchantment',
    text: 'Whenever a land enters under your control, you gain 1 life.',
    expect: OK,
  },
  {
    kind: 'enchantment',
    text: 'Whenever another creature you control dies, you gain 1 life.',
    expect: OK,
  },
  {
    kind: 'enchantment',
    text: 'Whenever a creature you control attacks, you gain 1 life.',
    expect: OK,
  },
  {
    kind: 'enchantment',
    text: 'Whenever you sacrifice a creature, create a Treasure token.',
    expect: OK,
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you may draw a card. If you do, discard a card.',
    expect: OK,
    note: 'stage P30 (D-135): "you may" and "if you do" are the engine\'s `may` and `didPrevious`',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, amass 1.',
    expect: no('amass 1.', 'ability.triggered'),
    note: 'amass is not an effect rule',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, return a land you control to its owner’s hand.',
    expect: OK,
    note: 'backlog: 12 cards (bounce lands); the controller chooses (D-092, stage P11)',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, exile target player’s graveyard.',
    expect: OK,
    note: 'backlog: Bojuka Bog (D-092, stage P11)',
  },
  {
    kind: 'creature',
    text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',
    expect: OK,
    note: 'the cast trigger of an opponent and a payment on resolution are read since stage P18',
  },
  {
    kind: 'creature',
    text: 'Whenever ~ deals combat damage to a player, draw a card.',
    expect: OK,
    note: 'combat damage dealt is an event since stage P18 (D-111)',
  },
  {
    kind: 'creature',
    text: 'At ~ enters, draw a card.',
    expect: no('~ enters, draw a card.', 'trigger.enters'),
    note: '"At" goes with the beginning of a step only',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, you may draw a card and you gain 1 life.',
    expect: no('~ enters, you may draw a card and you gain 1 life.', 'ability.triggered', {
      reason: 'notRunnable',
    }),
    note: 'the engine\'s "may" covers a whole effect; this one covers only the first part',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, put a +1/+1 counter on target creature.',
    expect: OK,
    note: 'SYNTHETIC; a target chosen as the trigger goes on the stack (CR 603.3d, D-089)',
  },
];

const P1_EFFECTS: readonly Line[] = [
  { kind: 'sorcery', text: 'Create a Treasure token.', expect: OK },
  { kind: 'sorcery', text: 'Create two Treasure tokens.', expect: OK },
  { kind: 'sorcery', text: 'Create a 1/1 white Soldier creature token.', expect: OK },
  { kind: 'sorcery', text: 'Create three 2/2 black Zombie creature tokens.', expect: OK },
  { kind: 'sorcery', text: 'Create a 1/1 colorless Servo artifact creature token.', expect: OK },
  { kind: 'sorcery', text: 'Create a Treasure token. Draw a card.', expect: OK },
  { kind: 'sorcery', text: 'Create a Food token.', expect: OK, note: 'Food runs since D-075' },
  {
    kind: 'sorcery',
    text: 'Create a Map token.',
    expect: no('a Map token.', 'token.predefined', {
      reason: 'notRunnable',
      needs: ['token:Map'],
    }),
    note: 'the AST has no Map token',
  },
  {
    kind: 'sorcery',
    text: 'Create a 1/1 white Soldier creature token with changeling.',
    expect: no('with changeling.', 'token.custom'),
    note: 'a token with an ability the engine has no keyword for would be created without it',
  },
  { kind: 'sorcery', text: 'Sacrifice a creature.', expect: OK },
  { kind: 'sorcery', text: 'Sacrifice two lands.', expect: OK },
  {
    kind: 'sorcery',
    text: 'Sacrifice target creature.',
    expect: no('target creature.', 'effect.sacrifice'),
    note: 'you can only sacrifice your own permanents (CR 701.21a)',
  },
  { kind: 'instant', text: 'Put a +1/+1 counter on target creature.', expect: OK },
  { kind: 'instant', text: 'Put two +1/+1 counters on each creature you control.', expect: OK },
  { kind: 'instant', text: 'Put a +1/+1 counter on target creature or planeswalker.', expect: OK },
];

const CORPUS = [...SPELLS, ...REPLACEMENTS, ...P1_MANA_AND_LANDS, ...P1_TRIGGERS, ...P1_EFFECTS];

runCorpus('the template corpus (S1 and P1)', CORPUS);

test('the corpus is large enough, with unique lines, and both kinds of expectation', () => {
  expect(CORPUS.length).toBeGreaterThanOrEqual(60);
  expect(new Set(CORPUS.map((l) => `${l.kind}|${l.text}`)).size).toBe(CORPUS.length);
  expect(CORPUS.filter((l) => 'supported' in l.expect).length).toBeGreaterThanOrEqual(30);
  expect(CORPUS.filter((l) => !('supported' in l.expect)).length).toBeGreaterThanOrEqual(20);
});
