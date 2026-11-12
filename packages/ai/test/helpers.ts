/**
 * Shared helpers for the AI tests: small decks built from the real engine fixtures, a seeded
 * deck-mix generator, and a driver that applies agent answers one step at a time so tests can
 * inspect the real state after every action.
 */
import {
  type Action,
  applyAction,
  type CardDefinition,
  createGame,
  type DamageRecipient,
  type DeckConfig,
  deckOf,
  FIXTURE_CARDS,
  type GameConfig,
  type GameEvent,
  type GameState,
  type GameView,
  getView,
  type PendingDecision,
  SYNTHETIC_CARDS,
  validateCard,
} from '@commander-arena/engine';
import type { Agent, DecideContext } from '../src/index';

export const COMMANDERS = ['Isamaru, Hound of Konda', 'Yargle, Glutton of Urborg'] as const;

/**
 * SYNTHETIC cards with triggered abilities, sacrifice effects and tokens (M5). They give the games
 * the decisions those need: choosePermanent, orderTriggers and confirmOptional. The Food and Clue
 * cards are not here (they have their own 'food' style, FOOD_CARD_NAMES): adding them would change
 * the pools, and so the seeded games, of every older test.
 */
export const TRIGGER_CARD_NAMES = [
  'SYNTHETIC Sacrifice Dragon',
  'SYNTHETIC Dies Treasure Creature',
  'SYNTHETIC Enters Draw Creature',
  'SYNTHETIC May Draw Creature',
  'SYNTHETIC Landfall Tokenmaker',
  'SYNTHETIC Make Treasures',
  'SYNTHETIC Edict',
  'SYNTHETIC Land Edict',
  'SYNTHETIC Fleeting Spirit',
  'SYNTHETIC Sacrifice Lifegainer',
  'SYNTHETIC Sacrifice Reader',
  'SYNTHETIC Creature Sacrifice Watcher',
  'SYNTHETIC Mourner',
  'SYNTHETIC Welcome Committee',
  'SYNTHETIC Dragon Roost',
  'SYNTHETIC Spite Watcher',
  'SYNTHETIC Upkeep Reader',
  'SYNTHETIC Each Upkeep Lifegainer',
  'SYNTHETIC End Step Reader',
  'SYNTHETIC Banner Bearer',
  'SYNTHETIC Spell Watcher',
  'SYNTHETIC Tap Watcher',
] as const;

/**
 * SYNTHETIC cards with flash, hexproof and shroud (CR 702.8, 702.11, 702.18) and a two-target
 * spell, with the real removal and burn that aims at them. Used by the 'keywords' deck style.
 */
export const KEYWORD_TARGET_NAMES = [
  'SYNTHETIC Flash Bear',
  'SYNTHETIC Flash Trinket',
  'SYNTHETIC Hexproof Bear',
  'SYNTHETIC Shroud Bear',
  'SYNTHETIC Flash Hexproof Wisp',
  'SYNTHETIC Twin Bolt',
] as const;

/**
 * SYNTHETIC mana and land cards (the mana and lands slice): a choice of two colors, pain lands (a
 * mana ability with damage), a Signet (a mana ability with a mana cost), lands that enter tapped
 * unless a condition holds, shock lands (a payment asked as the land enters), "no maximum hand
 * size". They give the games the `confirmOptional` of a shock land and the manual-pay paths.
 */
export const MANA_LAND_NAMES = [
  'SYNTHETIC Dual Land',
  'SYNTHETIC Tri Land',
  'SYNTHETIC Pain Land',
  'SYNTHETIC Gain Land',
  'SYNTHETIC Drain Land',
  'SYNTHETIC Basic Check Land',
  'SYNTHETIC Other Lands Land',
  'SYNTHETIC Crowd Land',
  'SYNTHETIC Shock Land',
] as const;
export const MANA_SPELL_NAMES = [
  'SYNTHETIC Signet',
  'SYNTHETIC Green Signet',
  'SYNTHETIC Shock Rock',
  'SYNTHETIC Reading Hat',
  'SYNTHETIC Land Recall',
] as const;

/**
 * SYNTHETIC library-search and discard cards: one or two basic lands onto the battlefield or into
 * the hand, a subtype search, a creature tutor with a reveal, searches with and without a shuffle,
 * a graveyard search, a trigger that searches, looting and discard spells. They give the games
 * the `chooseCards` decision for a search and for a discard, by either player.
 */
export const SEARCH_CARD_NAMES = [
  'SYNTHETIC Land Fetch',
  'SYNTHETIC Twin Land Fetch',
  'SYNTHETIC Forest Fetch',
  'SYNTHETIC Creature Tutor',
  'SYNTHETIC Quiet Land Search',
  'SYNTHETIC Graveyard Search',
  'SYNTHETIC Triple Fetch',
  'SYNTHETIC Scout Creature',
  'SYNTHETIC Loot',
  'SYNTHETIC Discard Three',
  'SYNTHETIC Each Player Discards',
  'SYNTHETIC Opponent Discards Two',
] as const;

const LAND_CANDIDATES = [
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Command Tower',
  'SYNTHETIC Tapped Land',
  'SYNTHETIC Treasure Land',
  ...MANA_LAND_NAMES,
] as const;

const SPELL_CANDIDATES = [
  'Lightning Bolt',
  'Murder',
  'Unsummon',
  'Counterspell',
  'Divination',
  "Angel's Mercy",
  'Grizzly Bears',
  'Llanowar Elves',
  'Sol Ring',
  'SYNTHETIC Draw Three Gain Five',
  'SYNTHETIC Bolt Two',
  'SYNTHETIC Opponent Discards Two',
  'SYNTHETIC Wrath',
  'SYNTHETIC Pinger',
  'SYNTHETIC Flying Lifelinker',
  'SYNTHETIC Welcome Gain Three',
  ...TRIGGER_CARD_NAMES,
  ...MANA_SPELL_NAMES,
] as const;

/**
 * Only cards the engine fully supports go into test decks (an unsupported card reaching the
 * interpreter is an engine bug by SPEC 17.2 A7, not something agents should be fed). The
 * candidate lists name every card we would like; `validateCard` drops those not yet supported, so
 * the pool grows by itself as the engine gains features.
 */
const supported = (names: readonly string[]) =>
  names.filter((name) => validateCard(deckOf([[name, 1]])[0] as CardDefinition).length === 0);
export const LANDS = supported(LAND_CANDIDATES);
export const SPELLS = supported(SPELL_CANDIDATES);
/** Basic lands and the mana lands, every mana land twice: games full of the new land decisions. */
export const MANA_LANDS = [
  ...supported(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']),
  ...supported(MANA_LAND_NAMES),
  ...supported(MANA_LAND_NAMES),
];
/** The Signets, the shock artifact and the hat, with ordinary spells to spend the mana on. */
export const MANA_SPELLS = [
  ...supported(MANA_SPELL_NAMES),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Divination', 'Grizzly Bears', 'Sol Ring']),
];
/** The supported trigger, sacrifice and token cards, with a few ordinary spells for variety. */
export const TRIGGER_SPELLS = [
  ...supported(TRIGGER_CARD_NAMES),
  ...supported(['Lightning Bolt', 'Murder', 'Sol Ring', 'Grizzly Bears']),
];

/**
 * The search and discard cards twice, with a landfall engine, creatures to find and ordinary
 * spells: searches find cards, lands enter and trigger, hands run low enough for discards to take
 * the whole hand.
 */
export const SEARCH_SPELLS = [
  ...supported(SEARCH_CARD_NAMES),
  ...supported(SEARCH_CARD_NAMES),
  ...supported([
    'SYNTHETIC Landfall Tokenmaker',
    'Grizzly Bears',
    'Llanowar Elves',
    'Lightning Bolt',
    'Murder',
    'Divination',
    'Sol Ring',
  ]),
];

/** Basic lands only, so that every land search has cards to find. */
export const BASIC_LANDS = supported(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);

/**
 * SYNTHETIC cards with activated abilities and Cycling (slice S3): pumps (with and without a target,
 * with a mana cost and with {T}), a sacrifice outlet, a Snack ({2}, {T}, sacrifice itself), life and
 * counter costs, a sorcery-speed ability and cards that cycle from the hand. They give the games
 * the `activate` option, the targets decision of an ability, the sacrifice question of a cost and
 * "until end of turn" effects. Used by the 'activated' deck style.
 */
export const ACTIVATED_CARD_NAMES = [
  'SYNTHETIC Pump Bear',
  'SYNTHETIC Firebreather',
  'SYNTHETIC Coach',
  'SYNTHETIC Altar',
  'SYNTHETIC Snack',
  'SYNTHETIC Life Tap',
  'SYNTHETIC Charge Battery',
  'SYNTHETIC Slow Scholar',
  'SYNTHETIC Cycling Bear',
  'SYNTHETIC Life Cycler',
  'SYNTHETIC Pinger',
  'SYNTHETIC Shrink',
] as const;
export const ACTIVATED_LAND_NAMES = ['SYNTHETIC Cycling Land'] as const;

/**
 * The activated-ability cards (every one twice, so each cost kind shows up in a small deck) with
 * creatures to sacrifice and some removal and mana.
 */
export const ACTIVATED_SPELLS = [
  ...supported(ACTIVATED_CARD_NAMES),
  ...supported(ACTIVATED_CARD_NAMES),
  // The cards whose paths are rarer: the outlet (a sacrifice to choose), targeted abilities.
  ...supported([
    'SYNTHETIC Altar',
    'SYNTHETIC Altar',
    'SYNTHETIC Altar',
    'SYNTHETIC Pinger',
    'SYNTHETIC Pinger',
    'SYNTHETIC Coach',
    'SYNTHETIC Coach',
    'SYNTHETIC Slow Scholar',
  ]),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves']),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Sol Ring']),
  // Instant-speed removal, so that abilities are sometimes answered while they wait on the stack.
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon']),
];
/** Basic lands, and the land that cycles four times as often so it is often held in hand. */
export const ACTIVATED_LANDS = [
  ...supported(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']),
  ...supported(ACTIVATED_LAND_NAMES),
  ...supported(ACTIVATED_LAND_NAMES),
  ...supported(ACTIVATED_LAND_NAMES),
  ...supported(ACTIVATED_LAND_NAMES),
];

/**
 * SYNTHETIC Auras, Equipment and static-ability permanents (slice S4a): Auras that give +N/+N or a
 * keyword (one that hurts, one only for lands, one only for the caster's creatures), Equipment with
 * mana and life costs, an Anthem, a lord and a Banner that shrinks the opponent's creatures. They
 * give the games Aura casts (with a target decision), equip activations, moves of an Equipment,
 * Auras that fall off or fizzle, and the layers' bonuses in combat. Used by the 'attachments' style.
 */
export const ATTACHMENT_CARD_NAMES = [
  'SYNTHETIC Might Aura',
  'SYNTHETIC Wings Aura',
  'SYNTHETIC Loyal Aura',
  'SYNTHETIC Curse Aura',
  'SYNTHETIC Shield Land Aura',
  'SYNTHETIC Hex Aura',
  'SYNTHETIC Blade',
  'SYNTHETIC Cloak',
  'SYNTHETIC Wing Boots',
  'SYNTHETIC Blood Blade',
  'SYNTHETIC Anthem',
  'SYNTHETIC Standard Bearer',
  'SYNTHETIC Plague Banner',
  // "Enchant permanent" Auras whose statics name the host's type: they can land on a land or on a
  // creature and give something only to the right kind of host.
  'SYNTHETIC Growth Aura',
  'SYNTHETIC Land Ward Aura',
  'SYNTHETIC Legend Aura',
] as const;

/**
 * The attachment cards twice, with creatures to carry them and removal that kills or bounces the
 * carrier (so Auras fall off and Equipment is left behind), and some mana.
 */
export const ATTACHMENT_SPELLS = [
  ...supported(ATTACHMENT_CARD_NAMES),
  ...supported(ATTACHMENT_CARD_NAMES),
  ...supported([
    'Grizzly Bears',
    'Grizzly Bears',
    'Llanowar Elves',
    'SYNTHETIC Vanilla 2/2',
    'SYNTHETIC Vanilla 3/3',
    'SYNTHETIC Flier 1/1',
    'SYNTHETIC Pump Bear',
    'SYNTHETIC Hexproof Bear',
  ]),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Lightning Bolt', 'Murder', 'Unsummon']),
];

/**
 * SYNTHETIC kicker, flashback and conditional-effect cards (Kicker CR 702.33, Flashback CR 702.34,
 * `conditional` CR 608.2c): kicker creatures and spells with mana and life costs, spells that do
 * more when kicked, flashback instants and sorceries (one with a target, one that is also kicked)
 * and a conditional on the board. They give the games the kicker question, kicked and unkicked
 * casts, casts from the graveyard and spells exiled instead of going to the graveyard. Used by the
 * 'kicker' deck style.
 */
export const KICKER_CARD_NAMES = [
  'SYNTHETIC Kicker Bear',
  'SYNTHETIC Kicker Seer',
  'SYNTHETIC Kicker Bolt',
  'SYNTHETIC Kicker Gain',
  'SYNTHETIC Life Kicker',
  'SYNTHETIC Double Kicker',
  'SYNTHETIC Rally Cry',
  'SYNTHETIC Flash Slay',
  'SYNTHETIC Flash Study',
  'SYNTHETIC Flash Gain',
  'SYNTHETIC Kick Flash',
  // "When this enters, if it was kicked": no trigger at all when unkicked (CR 603.4).
  'SYNTHETIC Kicker Warden',
] as const;

/**
 * SYNTHETIC cards with the named alternative costs (D-117, D-121): Overload (CR 702.96), Evoke (CR 702.74) and
 * Dash (CR 702.109). Overload spells that hit the opponent's creatures or permanents (one that also hits the
 * caster's own, one whose overload is cheap when a commander is on the battlefield), evoke creatures with an
 * enters, a targeted enters, a dies and a leaves ability, and dash creatures (one with an enters ability).
 * They give the games a choice among the options of one card, delayed triggers, haste and sacrifices. Used by
 * the 'altCosts' deck style and kept out of every other pool.
 */
export const ALT_COST_NAMES = [
  'SYNTHETIC Overload Bolt',
  'SYNTHETIC Overload Bounce',
  'SYNTHETIC Overload Sap',
  'SYNTHETIC Overload Ping',
  'SYNTHETIC Overload Gated',
  'SYNTHETIC Overload Toll',
  'SYNTHETIC Evoke Drifter',
  'SYNTHETIC Evoke Reaper',
  'SYNTHETIC Evoke Martyr',
  'SYNTHETIC Evoke Wisp',
  'SYNTHETIC Dash Raider',
  'SYNTHETIC Dash Scout',
  'SYNTHETIC Spectacle Raider',
  'SYNTHETIC Spectacle Insight',
  'SYNTHETIC Drain Pulse',
  'SYNTHETIC Escape Wraith',
  'SYNTHETIC Escape Brute',
  'SYNTHETIC Escape Titan',
  'SYNTHETIC Escape Pulse',
  'SYNTHETIC Unearth Gnoll',
  'SYNTHETIC Unearth Shade',
  'SYNTHETIC Grave Scour',
] as const;

/**
 * SYNTHETIC cards of the play rules of D-125: extra land drops (CR 305.2), the top card of the library, the
 * attack tax and the optional untap. Used by the 'playRules' deck style and kept out of every other pool.
 */
export const PLAY_RULE_NAMES = [
  'SYNTHETIC Wandering Path',
  'SYNTHETIC Wandering Scout',
  'SYNTHETIC Twin Path',
  'SYNTHETIC Shared Path',
  'SYNTHETIC Seer Lens',
  'SYNTHETIC Seer Scout',
  'SYNTHETIC Tax Gate',
  'SYNTHETIC Tax Toll',
  'SYNTHETIC Tax Warden',
  'SYNTHETIC Tax Rune',
  'SYNTHETIC Tax Aegis',
  'SYNTHETIC Tax Blood',
  'SYNTHETIC Drowsy Giant',
  'SYNTHETIC Drowsy Rod',
  'SYNTHETIC Drowsy Sleeper',
] as const;

/**
 * SYNTHETIC cards of Echo (CR 702.30), Cumulative upkeep (CR 702.24) and the monarch (CR 725), D-127. Used by the
 * 'upkeep' deck style and kept out of every other pool.
 */
export const UPKEEP_NAMES = [
  'SYNTHETIC Echo Hound',
  'SYNTHETIC Echo Giant',
  'SYNTHETIC Echo Twins',
  'SYNTHETIC Echo Relic',
  'SYNTHETIC Aging Wall',
  'SYNTHETIC Aging Bloodline',
  'SYNTHETIC Aging Scholar',
  'SYNTHETIC Aging Twins',
  'SYNTHETIC Aging Garden',
  'SYNTHETIC Court Herald',
  'SYNTHETIC Throne Hall',
  'SYNTHETIC Crown Claim',
  'SYNTHETIC Crown Flash',
] as const;

/** The upkeep cards three times each, with bodies to attack and block with, and cheap removal and bounce. */
export const UPKEEP_SPELLS = [
  ...supported(UPKEEP_NAMES),
  ...supported(UPKEEP_NAMES),
  ...supported(UPKEEP_NAMES),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * SYNTHETIC cards of Miracle (CR 702.94, D-274): miracle costs with and without {X}, a target, a permanent, and cards that draw
 * (several cards, the opponent's). Used by the 'miracle' deck style and kept out of every other pool.
 */
export const MIRACLE_NAMES = [
  'SYNTHETIC Miracle Host',
  'SYNTHETIC Miracle Bolt',
  'SYNTHETIC Miracle Beast',
  'SYNTHETIC Careful Digging',
  'SYNTHETIC Twin Draw',
  'SYNTHETIC Generous Gift',
] as const;

/** The Miracle cards three times each (a miracle card must come as the first draw of a turn), with bodies and removal. */
export const MIRACLE_SPELLS = [
  ...supported(MIRACLE_NAMES),
  ...supported(MIRACLE_NAMES),
  ...supported(MIRACLE_NAMES),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * SYNTHETIC cards of delayed triggers (CR 603.7), Suspend (CR 702.62), Madness (CR 702.35) and Foretell (CR 702.143),
 * D-128. Used by the 'later' deck style and kept out of every other pool.
 */
export const LATER_NAMES = [
  'SYNTHETIC Delayed Insight',
  'SYNTHETIC Delayed Windfall',
  'SYNTHETIC Delayed Tithe',
  'SYNTHETIC Delayed Drain',
  'SYNTHETIC Suspend Bear',
  'SYNTHETIC Suspend Bolt',
  'SYNTHETIC Suspend Scrap',
  'SYNTHETIC Suspend Insight',
  'SYNTHETIC Suspend Relic',
  'SYNTHETIC Suspend Flash Giant',
  'SYNTHETIC Suspend Commander',
  'SYNTHETIC Madness Fiend',
  'SYNTHETIC Madness Bolt',
  'SYNTHETIC Madness Cycler',
  'SYNTHETIC Madness Commander',
  'SYNTHETIC Mind Rot',
  'SYNTHETIC Mind Nibble',
  'SYNTHETIC Rummage Spell',
  'SYNTHETIC Foretell Bolt',
  'SYNTHETIC Foretell Insight',
  'SYNTHETIC Foretell Giant',
  'SYNTHETIC Foretell Commander',
] as const;

/**
 * SYNTHETIC cards that copy a spell (CR 707.10), Storm (CR 702.40) and Replicate (CR 702.56), D-129. Used by the 'copies' deck style and kept
 * out of every other pool.
 */
export const COPY_NAMES = [
  'SYNTHETIC Twin Spell',
  'SYNTHETIC Exact Twin',
  'SYNTHETIC Twin Then Draw',
  'SYNTHETIC Echo Chamber',
  'SYNTHETIC Echo Mirror',
  'SYNTHETIC Mirror Engine',
  'SYNTHETIC Copy Bolt',
  'SYNTHETIC Split Bolt',
  'SYNTHETIC Storm Bolt',
  'SYNTHETIC Storm Drain',
  'SYNTHETIC Storm X Drain',
  'SYNTHETIC Storm Kick Bolt',
  'SYNTHETIC Double Storm',
  'SYNTHETIC Storm Beast',
  'SYNTHETIC Storm Charm',
  'SYNTHETIC Replicate Bolt',
  'SYNTHETIC Replicate Drain',
  'SYNTHETIC Replicate Imp',
  'SYNTHETIC Replicate Kick Bolt',
  'SYNTHETIC Replicate X Burn',
] as const;

/**
 * The copy cards five times each (the games are short), with bodies to attack and block with, cheap removal and the cheap spells that
 * raise the storm count.
 */
export const COPY_SPELLS = [
  ...supported(COPY_NAMES),
  ...supported(COPY_NAMES),
  ...supported(COPY_NAMES),
  ...supported(COPY_NAMES),
  ...supported(COPY_NAMES),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel']),
  ...supported(['Lightning Bolt', 'Lightning Bolt', 'Lightning Bolt', 'Murder', 'Unsummon']),
  // The counterspells answer the copies on the stack, the permanents with Storm become tokens when copied.
  ...supported(['Counterspell', 'Counterspell', 'Counterspell']),
  ...supported([
    'SYNTHETIC Storm Beast',
    'SYNTHETIC Storm Beast',
    'SYNTHETIC Storm Beast',
    'SYNTHETIC Storm Beast',
    'SYNTHETIC Double Storm',
  ]),
];

/**
 * SYNTHETIC cards of the amounts slice (D-131): counted amounts that read the game, "where X is" text, tokens that
 * enter tapped, several players in one selector, each player sacrifices, mill, one-sided damage and the conditions
 * about players. Used by the 'amounts' deck style and kept out of every other pool.
 */
export const AMOUNT_NAMES = [
  'SYNTHETIC Zombie Mourner',
  'SYNTHETIC Zombie Toll',
  'SYNTHETIC Swamp Siphon',
  'SYNTHETIC Chain Reaction',
  'SYNTHETIC Swamp Blight',
  'SYNTHETIC Grave Swell',
  'SYNTHETIC Rank Raiser',
  'SYNTHETIC Mighty Feast',
  'SYNTHETIC Grave Horde',
  'SYNTHETIC Stampede Call',
  'SYNTHETIC Stalwart Study',
  'SYNTHETIC Wall Tithe',
  'SYNTHETIC Twin Tithe',
  'SYNTHETIC Relic Tithe',
  'SYNTHETIC Mighty Colossus',
  'SYNTHETIC Dark Merchant',
  'SYNTHETIC Blood Devotion',
  'SYNTHETIC Identity Tithe',
  'SYNTHETIC Hybrid Idol',
  'SYNTHETIC Hearty Host',
  'SYNTHETIC Herald of Counters',
  'SYNTHETIC Costly Angel',
  'SYNTHETIC Power Scout',
  'SYNTHETIC Graveyard Count',
  'SYNTHETIC Web Swarm',
  'SYNTHETIC Hand Detective',
  'SYNTHETIC Army Muster',
  'SYNTHETIC Tapped Hoard',
  'SYNTHETIC Plain Zombie',
  'SYNTHETIC Czar of Two Colors',
  'SYNTHETIC Shared Rendezvous',
  'SYNTHETIC Overlapping Feast',
  'SYNTHETIC Shared Mill',
  'SYNTHETIC Shared Sacrifice',
  'SYNTHETIC Mighty Pump',
  'SYNTHETIC Cut a Deal Cousin',
  'SYNTHETIC Double Deal',
  'SYNTHETIC Bag Marauder',
  'SYNTHETIC Necrotic Sweep',
  'SYNTHETIC Siphon Flesh Cousin',
  'SYNTHETIC Weighted Toll',
  'SYNTHETIC Hydra Reaper',
  'SYNTHETIC Mire Merfolk',
  'SYNTHETIC Tide Mill',
  'SYNTHETIC Gnash Down',
  'SYNTHETIC Surge Watcher',
  'SYNTHETIC Dragon Scourge',
  'SYNTHETIC Self Strike',
  'SYNTHETIC Lifelink Hound',
  'SYNTHETIC Deathtouch Viper',
  'SYNTHETIC Wither Imp',
  'SYNTHETIC Skyline Tyrant',
  'SYNTHETIC Court of Grace Cousin',
  'SYNTHETIC Usurper Scout',
  'SYNTHETIC Envious Cleric',
  'SYNTHETIC Outnumbered Priest',
  'SYNTHETIC Instant Culling',
  'SYNTHETIC Shared Burn',
  'SYNTHETIC Shared Ward',
  'SYNTHETIC Flat Bite',
  'SYNTHETIC Tapped Twin',
  'SYNTHETIC Zombie Recall',
] as const;

/** The amounts cards twice each, with bodies to attack and block with, cheap removal and bounce. */
export const AMOUNT_SPELLS = [
  ...supported(AMOUNT_NAMES),
  ...supported(AMOUNT_NAMES),
  ...supported(AMOUNT_NAMES),
  // The cards that count what was sacrificed, drawn or destroyed this way are rare in random play; they get more slots.
  ...supported([
    'SYNTHETIC Necrotic Sweep',
    'SYNTHETIC Necrotic Sweep',
    'SYNTHETIC Siphon Flesh Cousin',
    'SYNTHETIC Siphon Flesh Cousin',
    'SYNTHETIC Rank Raiser',
    'SYNTHETIC Rank Raiser',
    'SYNTHETIC Dark Merchant',
    'SYNTHETIC Dark Merchant',
  ]),
  // Two ways to become the monarch (the cards of the upkeep style), for the conditions about the designation.
  ...supported([
    'SYNTHETIC Court Herald',
    'SYNTHETIC Court Herald',
    'SYNTHETIC Court Herald',
    'SYNTHETIC Crown Flash',
    'SYNTHETIC Crown Flash',
    'SYNTHETIC Skyline Tyrant',
    'SYNTHETIC Skyline Tyrant',
    'SYNTHETIC Court of Grace Cousin',
    'SYNTHETIC Court of Grace Cousin',
  ]),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** The cast-later cards three times each, with bodies to attack and block with, and cheap removal and bounce. */
export const LATER_SPELLS = [
  ...supported(LATER_NAMES),
  ...supported(LATER_NAMES),
  ...supported(LATER_NAMES),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** The play-rule cards three times each (the games need the permanents out early), with bodies to attack with. */
export const PLAY_RULE_SPELLS = [
  ...supported(PLAY_RULE_NAMES),
  ...supported(PLAY_RULE_NAMES),
  ...supported(PLAY_RULE_NAMES),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * The alternative-cost cards twice, with bodies for the overloads to hit and for the dash creatures to meet,
 * and cheap removal and bounce.
 */
export const ALT_COST_SPELLS = [
  ...supported(ALT_COST_NAMES),
  ...supported(ALT_COST_NAMES),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * The kicker cards twice, the flashback ones four times (they must be cast from the hand first),
 * with creatures to aim at and instant-speed removal and a counterspell, so that flashback spells
 * are sometimes countered or left without a target.
 */
export const KICKER_SPELLS = [
  ...supported(KICKER_CARD_NAMES),
  ...supported(KICKER_CARD_NAMES),
  ...supported(['SYNTHETIC Flash Slay', 'SYNTHETIC Flash Gain', 'SYNTHETIC Kick Flash']),
  ...supported(['SYNTHETIC Flash Slay', 'SYNTHETIC Flash Gain', 'SYNTHETIC Flash Study']),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * SYNTHETIC Food and Clue cards (CR 111.10b, 111.10f): spells and creatures that make the tokens,
 * "whenever a player sacrifices a permanent" watchers that see the sacrifice paid as a cost, and
 * creatures with an intervening "if" (CR 603.4) that trigger only while the condition holds. They
 * give the games activations with a sacrifice cost, tokens that cease to exist, and triggers that
 * are not put on the stack. Used by the 'food' deck style.
 */
export const FOOD_CARD_NAMES = [
  'SYNTHETIC Food Maker',
  'SYNTHETIC Clue Maker',
  'SYNTHETIC Feast Scout',
  'SYNTHETIC Clue Scout',
  'SYNTHETIC Sacrifice Lifegainer',
  'SYNTHETIC Sacrifice Reader',
  'SYNTHETIC Crowd Pleaser',
  'SYNTHETIC Lone Wolf',
  'SYNTHETIC Table Talker',
  'SYNTHETIC Fickle Host',
] as const;

/**
 * The Food and Clue cards twice, so a token is made in most games, with creatures and a little
 * removal: Food is eaten and Clues cracked by CasualAgent, sacrificed by the random agent's
 * activations, killed with the token's creator.
 */
export const FOOD_SPELLS = [
  ...supported(FOOD_CARD_NAMES),
  ...supported(FOOD_CARD_NAMES),
  ...supported([
    'SYNTHETIC Food Maker',
    'SYNTHETIC Clue Maker',
    'SYNTHETIC Crowd Pleaser',
    'SYNTHETIC Fickle Host',
    'SYNTHETIC Fickle Host',
  ]),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider']),
  // Instant-speed removal and bounce, so that a creature sometimes dies while a trigger with an
  // intervening "if" waits on the stack.
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'SYNTHETIC Shrink']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'SYNTHETIC Shrink']),
];

/** Keyword creatures plus every kind of targeted removal and burn, so targets are chosen often. */
export const KEYWORD_TARGET_SPELLS = [
  ...supported(KEYWORD_TARGET_NAMES),
  ...supported(KEYWORD_TARGET_NAMES),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell', 'Grizzly Bears']),
];

/**
 * SYNTHETIC layer, flicker and prowess cards (CR 613, 400.7, 702.108): a pump, a "becomes a blue
 * Frog" spell, a keyword grant, a type change, a flicker, and a prowess creature. They give the games
 * continuous effects in several layers, objects that come back as new objects, and prowess triggers.
 * Used by the 'layers' deck style.
 */
export const LAYER_CARD_NAMES = [
  'SYNTHETIC Growth Spurt',
  'SYNTHETIC Frog Hex',
  'SYNTHETIC Gust of Wings',
  'SYNTHETIC Rust Touch',
  'SYNTHETIC Flicker Spell',
  'SYNTHETIC Prowess Adept',
] as const;

/**
 * SYNTHETIC ward, copy and legend cards (CR 702.21, 707.2, 613.2a, 704.5j): creatures with Ward
 * (mana and life), spells that make a token copy of a creature or turn one into a copy, two legendary
 * creatures (so copies of them meet the legend rule) and a creature that copies itself. They give the
 * games the ward trigger, its question and payment, the countered spells, the legend-rule choice,
 * token copies and copy effects. Used by the 'ward' deck style.
 */
export const WARD_CARD_NAMES = [
  'SYNTHETIC Warded Guard',
  'SYNTHETIC Blood Warded Guard',
  'SYNTHETIC Warded Sentinel',
  'SYNTHETIC Twin Image',
  'SYNTHETIC Echo Image',
  'SYNTHETIC Doppel Shift',
  'SYNTHETIC Ancient Knight',
  'SYNTHETIC Ancient Sage',
  'SYNTHETIC Cloner Imp',
] as const;

/**
 * The ward cards twice, the creatures and copy spells once more, with ordinary creatures, a Pinger
 * and the targeted removal that aims at the warded ones (Bolt, Murder, Unsummon, the two-target
 * bolt).
 */
export const WARD_SPELLS = [
  ...supported(WARD_CARD_NAMES),
  ...supported(WARD_CARD_NAMES),
  ...supported([
    'SYNTHETIC Warded Guard',
    'SYNTHETIC Blood Warded Guard',
    'SYNTHETIC Warded Sentinel',
    'SYNTHETIC Ancient Knight',
    'SYNTHETIC Twin Image',
    'SYNTHETIC Echo Image',
  ]),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider']),
  // The Pinger's tapped ability aims at creatures too: a countered ability, not only a spell.
  ...supported(['SYNTHETIC Pinger', 'SYNTHETIC Pinger']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'SYNTHETIC Twin Bolt']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'SYNTHETIC Twin Bolt']),
];

/**
 * SYNTHETIC Vehicles (CR 301.7, 702.122): three artifacts with printed power and toughness and a
 * crew cost of 1, 3 and 4. They give the games the crew question (`choosePermanent` with
 * `purpose: 'crew'`), artifacts that become creatures until end of turn, that attack and block and
 * can be killed or bounced while they are creatures. Used by the 'vehicles' deck style.
 */
export const VEHICLE_CARD_NAMES = [
  'SYNTHETIC Rattle Wagon',
  'SYNTHETIC Scout Skiff',
  'SYNTHETIC Dread Barge',
] as const;

/**
 * The Vehicles three times, with creatures to crew them (big and small, some that can attack and
 * some that are summoning sick when the Vehicle is crewed), two Equipment that can land on a crewed
 * Vehicle, and instant-speed removal and bounce, so that a crewed Vehicle sometimes dies or goes
 * back to its owner's hand while it is a creature.
 */
export const VEHICLE_SPELLS = [
  ...supported(VEHICLE_CARD_NAMES),
  ...supported(VEHICLE_CARD_NAMES),
  ...supported(VEHICLE_CARD_NAMES),
  ...supported([
    'Grizzly Bears',
    'Grizzly Bears',
    'Llanowar Elves',
    'Giant Spider',
    'SYNTHETIC Vanilla 1/1',
    'SYNTHETIC Vanilla 2/2',
    'SYNTHETIC Vanilla 3/3',
    'SYNTHETIC Vanilla 5/5',
    'SYNTHETIC Flier 1/1',
  ]),
  ...supported(['SYNTHETIC Blade', 'SYNTHETIC Wing Boots']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Murder']),
];

/**
 * SYNTHETIC damage prevention cards (CR 615): Fog, shields on you, on a creature or any target, on
 * creatures you control (all damage, and the numeric one that makes a shield per creature), a
 * noncombat Fog and a combat shield for a number. Used by the 'prevention' deck style.
 */
export const PREVENTION_CARD_NAMES = [
  'SYNTHETIC Fog Spell',
  'SYNTHETIC Self Ward',
  'SYNTHETIC Quiet Fog',
  'SYNTHETIC Standoff',
  'SYNTHETIC Shield Three',
  'SYNTHETIC Herd Shelter',
  'SYNTHETIC Ward Circle',
  'SYNTHETIC Soften Blow',
] as const;

/**
 * The prevention cards twice, with creatures that attack (some with lifelink, deathtouch, trample
 * and double strike, so the things prevention must not trigger are on the board) and burn that makes
 * noncombat damage to players and creatures, on basic lands.
 */
export const PREVENTION_SPELLS = [
  ...supported(PREVENTION_CARD_NAMES),
  ...supported(PREVENTION_CARD_NAMES),
  ...supported([
    'Grizzly Bears',
    'Grizzly Bears',
    'Giant Spider',
    "Healer's Hawk",
    'SYNTHETIC Vanilla 3/3',
    'SYNTHETIC Vanilla 5/5',
    'SYNTHETIC Trampler 4/4',
    'SYNTHETIC Deathtouch Trampler 4/4',
    'SYNTHETIC Double Strike Lifelink 3/3',
  ]),
  ...supported([
    'Lightning Bolt',
    'Lightning Bolt',
    'Lightning Bolt',
    'Lightning Bolt',
    'SYNTHETIC Bolt Two',
    'SYNTHETIC Bolt Two',
    'SYNTHETIC Pinger',
    'SYNTHETIC Pinger',
  ]),
];

/**
 * SYNTHETIC multi-face cards (split CR 709, Adventure CR 715, double-faced CR 712): two split cards,
 * two Adventure creatures (one with a targeted Adventure), three modal double-faced cards (a
 * creature with a land back, a spell with a shock land back, two creatures), two transforming
 * creatures (at upkeep and for mana), and a spell that transforms. They give the games the face
 * choice when casting and playing lands, casts from exile on an Adventure, back-face lands played
 * with a pay-life question, and transformations. Used by the 'layouts' deck style.
 */
export const LAYOUT_CARD_NAMES = [
  'SYNTHETIC Singe // Mend',
  'SYNTHETIC Study // Zap',
  'SYNTHETIC Brawler Bear // Chop',
  'SYNTHETIC Wise Owl // Peek',
  'SYNTHETIC Ridge Drake // Ridge Pass',
  'SYNTHETIC Zeal Charm // Shock Pass',
  'SYNTHETIC Twin Knight // Twin Wall',
  'SYNTHETIC Moon Cub // Moon Beast',
  'SYNTHETIC Squire // Grown Knight',
  'SYNTHETIC Turn Over',
] as const;

/**
 * The layout cards twice, with creatures to aim the Adventures and the halves at, and instant-speed
 * removal and a counterspell, so that Adventures and halves are sometimes countered or left without
 * a target and transformed creatures die and are bounced.
 */
export const LAYOUT_SPELLS = [
  ...supported(LAYOUT_CARD_NAMES),
  ...supported(LAYOUT_CARD_NAMES),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * SYNTHETIC Saga cards (CR 714) and what acts on them: Sagas with three and two chapters, one whose
 * chapter ability covers two chapters, one whose last chapter makes a creature token, and instants
 * that put one or two lore counters on a Saga, destroy it, exile and return it, or copy it. They
 * give the games chapters triggered at every precombat main phase, Sagas sacrificed after their
 * last chapter, and Sagas that leave early or return. Used by the 'sagas' deck style.
 */
export const SAGA_CARD_NAMES = [
  'SYNTHETIC Rite of Three',
  'SYNTHETIC Echo Verse',
  'SYNTHETIC Rising Golem',
  'SYNTHETIC Brief Tale',
  'SYNTHETIC Lore Surge',
  'SYNTHETIC Lore Flood',
  'SYNTHETIC Saga Breaker',
  'SYNTHETIC Saga Flicker',
  'SYNTHETIC Saga Mirror',
] as const;

/** The four Sagas, three times each, so every game plays several; the instants once; some bodies. */
export const SAGA_SPELLS = [
  ...supported(SAGA_CARD_NAMES.slice(0, 4)),
  ...supported(SAGA_CARD_NAMES.slice(0, 4)),
  ...supported(SAGA_CARD_NAMES.slice(0, 4)),
  ...supported(SAGA_CARD_NAMES.slice(4)),
  ...supported(['Grizzly Bears', 'Llanowar Elves']),
  ...supported(['Lightning Bolt', 'Counterspell']),
];

/**
 * SYNTHETIC cards that arrange the top of a library (D-091): scry and surveil as spells and as
 * "when this enters" triggers, a reordering of the top three cards, a Brainstorm-like draw and put
 * back, and spells that put cards from the hand on top. They give the games the `arrangeCards`
 * decision and the `chooseCards` decision of a put on top, by either player. Used by the 'library'
 * deck style.
 */
export const LIBRARY_CARD_NAMES = [
  'SYNTHETIC Scry Two',
  'SYNTHETIC Scry Three',
  'SYNTHETIC Scry Zero',
  'SYNTHETIC Scry Five',
  'SYNTHETIC Scry One You',
  'SYNTHETIC Surveil Two',
  'SYNTHETIC Surveil Three',
  'SYNTHETIC Surveil Zero',
  'SYNTHETIC Reorder Three',
  'SYNTHETIC Reorder One',
  'SYNTHETIC Brainstorm Like',
  'SYNTHETIC Put Back One',
  'SYNTHETIC Put Back Two',
  'SYNTHETIC Seer Of The Door',
  'SYNTHETIC Grave Watcher',
] as const;

/**
 * SYNTHETIC cards whose triggered abilities choose targets as they go on the stack (CR 603.3d):
 * enters, dies and attack triggers that destroy, damage, bounce, put counters or drain, with one and
 * two slots, "up to one", a player target, "you may", an intervening "if", a watcher and a totem that
 * trigger on other creatures entering, and a Saga whose chapters target. They give the games the
 * `targets` decision of a trigger (no cancel), abilities removed for want of a target, targets that
 * became illegal and Ward on the target of a trigger. Used by the 'triggerTargets' deck style.
 */
export const TRIGGER_TARGET_CARD_NAMES = [
  'SYNTHETIC Reaper Imp',
  'SYNTHETIC Last Gasp Imp',
  'SYNTHETIC Twin Spark Imp',
  'SYNTHETIC Tinker Imp',
  'SYNTHETIC Drain Imp',
  'SYNTHETIC Eager Imp',
  'SYNTHETIC Pinger Imp',
  'SYNTHETIC Mentor Imp',
  'SYNTHETIC Bounce Imp',
  'SYNTHETIC Careful Imp',
  'SYNTHETIC Ember Watcher',
  'SYNTHETIC Growth Totem',
  'SYNTHETIC Purge Saga',
] as const;

/**
 * The targeted-trigger cards twice, with the warded creatures (so a trigger's target is sometimes
 * warded), plain creatures, an artifact for "destroy target artifact", and instant-speed removal and
 * bounce, so that a target sometimes becomes illegal while the trigger waits on the stack.
 */
export const TRIGGER_TARGET_SPELLS = [
  ...supported(TRIGGER_TARGET_CARD_NAMES),
  ...supported(TRIGGER_TARGET_CARD_NAMES),
  ...supported(['SYNTHETIC Warded Guard', 'SYNTHETIC Warded Sentinel']),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Sol Ring']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon']),
];

/**
 * The arranging cards twice, with ordinary creatures and a draw spell: hands and libraries run low
 * enough for a put on top to take the whole hand, a scry or surveil to meet a library of one card,
 * and creatures arrive so that the "when this enters" triggers and the heuristics' spells matter.
 */
export const LIBRARY_SPELLS = [
  ...supported(LIBRARY_CARD_NAMES),
  ...supported(LIBRARY_CARD_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Divination']),
];

/**
 * SYNTHETIC cards that refer to a target's controller, owner and values (D-092): life equal to a
 * target's power or mana value, a token created and a library searched by "its controller", a
 * graveyard exiled by owner (as a spell and as an enters trigger), counters "unless its controller
 * pays" a target spell, and a bounce land. They give the games a "may search" asked of the other
 * seat, the counter-unless payment, `choosePermanent` with `purpose: 'effect'`, and amounts read from
 * last-known information. Used by the 'references' deck style.
 */
export const REFERENCE_CARD_NAMES = [
  'SYNTHETIC Exile Gain Power',
  'SYNTHETIC Weigh Creature',
  'SYNTHETIC Reanimate Pay Life',
  'SYNTHETIC Costly Counter',
  'SYNTHETIC Banish Seek Land',
  'SYNTHETIC Wild Transform',
  'SYNTHETIC Optional Land Fetch',
  'SYNTHETIC Seek And Shuffle',
  'SYNTHETIC Graveyard Wipe',
  'SYNTHETIC Graveyard Watcher',
  'SYNTHETIC Soft Counter',
  'SYNTHETIC Toll Counter',
] as const;
export const REFERENCE_LAND_NAMES = ['SYNTHETIC Bounce Land'] as const;

/**
 * The reference cards twice, with creatures to aim at (some with counters to read, and the enters
 * trigger that exiles a graveyard), instant-speed removal that fills graveyards and a counterspell
 * for the counters to answer, and Bolt for the creatures to die in response.
 */
export const REFERENCE_SPELLS = [
  ...supported(REFERENCE_CARD_NAMES),
  ...supported(REFERENCE_CARD_NAMES),
  ...supported([
    'SYNTHETIC Graveyard Watcher',
    'SYNTHETIC Soft Counter',
    'SYNTHETIC Banish Seek Land',
  ]),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** Basic lands (so every search has cards to find), with the bounce land three times as common. */
export const REFERENCE_LANDS = [
  ...BASIC_LANDS,
  ...supported(REFERENCE_LAND_NAMES),
  ...supported(REFERENCE_LAND_NAMES),
  ...supported(REFERENCE_LAND_NAMES),
];

/**
 * SYNTHETIC restriction, requirement and evasion cards (D-094): "can't block", "can't be blocked",
 * "attacks each combat if able", "doesn't untap", "can't be countered", landwalk, fear, intimidate
 * and shadow, from the creature itself, an Aura, an Equipment or a spell, with colored and artifact
 * blockers for the evasion rules to read. Used by the 'restrictions' deck style.
 */
export const RESTRICTION_CARD_NAMES = [
  'SYNTHETIC Cant Block Bear',
  'SYNTHETIC Unblockable Bear',
  'SYNTHETIC Berserker',
  'SYNTHETIC Sleepy Giant',
  'SYNTHETIC Raging Brute',
  'SYNTHETIC Muzzling Banner',
  'SYNTHETIC Veil Blade',
  'SYNTHETIC Slumber Aura',
  'SYNTHETIC Ghost Step',
  'SYNTHETIC Muzzle',
  'SYNTHETIC Goad Rage',
  'SYNTHETIC Mind Wipe',
  'SYNTHETIC Stubborn Insight',
  'SYNTHETIC Stubborn Bolt',
  'SYNTHETIC Stubborn Beast',
  'SYNTHETIC Islandwalker',
  'SYNTHETIC Desertwalker',
  'SYNTHETIC Nonbasic Walker',
  'SYNTHETIC Fear Bear',
  'SYNTHETIC Intimidate Bear',
  'SYNTHETIC Shadow Bear',
  'SYNTHETIC Dread Wraith',
  'SYNTHETIC Black Flier',
  'SYNTHETIC Shadow Wall',
  'SYNTHETIC Black Blocker',
  'SYNTHETIC Red Blocker',
  'SYNTHETIC Artifact Golem',
] as const;
export const RESTRICTION_LAND_NAMES = [
  'SYNTHETIC Rogue Gate',
  'SYNTHETIC Dual Island',
  'SYNTHETIC Dry Desert',
] as const;

const RESTRICTION_COUNTER_SLOTS = [
  'Counterspell',
  'SYNTHETIC Soft Counter',
  'SYNTHETIC Toll Counter',
  'SYNTHETIC Stubborn Insight',
  'SYNTHETIC Stubborn Bolt',
  'SYNTHETIC Stubborn Beast',
];

/**
 * The restriction cards twice, with creatures to aim at, counters for the unstoppable spells to
 * face (the counter-unless cards and Ward bears among them) and removal that fills graveyards.
 */
export const RESTRICTION_SPELLS = [
  ...supported(RESTRICTION_CARD_NAMES),
  ...supported(RESTRICTION_CARD_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Serra Angel']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
  ...supported(['SYNTHETIC Soft Counter', 'SYNTHETIC Toll Counter', 'SYNTHETIC Warded Guard']),
  // Counters and the spells that can't be countered, more often, so that they meet.
  ...supported(RESTRICTION_COUNTER_SLOTS),
  ...supported(RESTRICTION_COUNTER_SLOTS),
  ...supported(RESTRICTION_COUNTER_SLOTS),
];

/** Basic lands, with the Rogue Gate (a land with a targeted ability) and the nonbasic lands. */
export const RESTRICTION_LANDS = [
  ...BASIC_LANDS,
  ...supported(RESTRICTION_LAND_NAMES),
  ...supported(RESTRICTION_LAND_NAMES),
];

/**
 * SYNTHETIC cards with additional costs, cost reductions, counted amounts and free casts (D-095):
 * spells that sacrifice a creature, an artifact or creature or a land, discard a card, pay life or
 * mana as they are cast, one with two costs and one with kicker too; "for each creature" and "the
 * number of lands" amounts; a wrath and a sacrifice spell that cost less for each creature; permanents
 * that make artifacts, instants and sorceries and creatures cheaper; spells and a creature cast
 * without paying their mana cost when their controller controls a commander (the commanders of the
 * games are on the battlefield often enough), and Ward and an ability that discard. Used by the
 * 'costs' deck style.
 */
export const COST_CARD_NAMES = [
  'SYNTHETIC Crowd Burn',
  'SYNTHETIC Land Tithe',
  'SYNTHETIC Hand Refill',
  'SYNTHETIC Grave Growth',
  'SYNTHETIC Rally Bear',
  'SYNTHETIC Doomed Scout',
  'SYNTHETIC Sacrifice Draw',
  'SYNTHETIC Offering Bolt',
  'SYNTHETIC Land Offering',
  'SYNTHETIC Discard Burn',
  'SYNTHETIC Double Toll',
  'SYNTHETIC Blood Price',
  'SYNTHETIC Extra Mana Tax',
  'SYNTHETIC Sacrifice Kicker',
  'SYNTHETIC Tithe Warded Guard',
  'SYNTHETIC Scavenger Bear',
  'SYNTHETIC Wrath of Many',
  'SYNTHETIC Tinker Bench',
  'SYNTHETIC Spell Chant',
  'SYNTHETIC Giant Discount',
  'SYNTHETIC Market Haze',
  'SYNTHETIC Sacrifice Rite',
  'SYNTHETIC Free Counter',
  'SYNTHETIC Free Exile',
  'SYNTHETIC Free Offering',
  'SYNTHETIC Always Free',
  'SYNTHETIC Free Colossus',
] as const;

/**
 * The cost cards twice, with bodies to sacrifice and cards to discard (creatures, an artifact
 * creature, Sol Ring), removal to aim the Ward and the counters at, and a counterspell for the free
 * counters to be cast beside.
 */
export const COST_SPELLS = [
  ...supported(COST_CARD_NAMES),
  ...supported(COST_CARD_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Sol Ring', 'Sol Ring']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * SYNTHETIC more-mana cards (D-099): lands that make a color an opponent land could produce, a
 * filter land with a hybrid cost and a choice of combinations, lands with "Activate only if" and a
 * life cost, a Lantern that gives lands a mana ability, a gated activated ability, and the removal
 * that changes what lands have and what the board holds. Used by the 'manaPlus' deck style.
 */
export const MANA_PLUS_LAND_NAMES = [
  'SYNTHETIC Orchard',
  'SYNTHETIC Reflecting Pond',
  'SYNTHETIC Filter Land',
  'SYNTHETIC Bare Filter Land',
  'SYNTHETIC Twist Filter Land',
  'SYNTHETIC Temple',
  'SYNTHETIC Tainted Land',
  'SYNTHETIC Confluence',
] as const;
export const MANA_PLUS_SPELL_NAMES = [
  'SYNTHETIC Fellwar Rock',
  'SYNTHETIC Blood Rock',
  'SYNTHETIC Prism Lantern',
  'SYNTHETIC Murk Lantern',
  'SYNTHETIC Gated Fountain',
  'SYNTHETIC Land Wipe',
  'SYNTHETIC Artifact Smash',
] as const;

/** Every land of the style (basics too, so colors are not all on odd lands). */
export const MANA_PLUS_LANDS = [
  ...BASIC_LANDS,
  ...BASIC_LANDS,
  ...supported(MANA_PLUS_LAND_NAMES),
  ...supported(MANA_PLUS_LAND_NAMES),
];

/** The mana cards twice, with spells of each color and a few bodies to spend the mana on. */
export const MANA_PLUS_SPELLS = [
  ...supported(MANA_PLUS_SPELL_NAMES),
  ...supported(MANA_PLUS_SPELL_NAMES),
  ...supported([
    'Lightning Bolt',
    'Murder',
    'Unsummon',
    'Divination',
    'Grizzly Bears',
    'Serra Angel',
    'Wall of Stone',
    'Typhoid Rats',
    'Raging Goblin',
    'Isamaru, Hound of Konda',
  ]),
];

/**
 * SYNTHETIC chosen-type and chosen-color cards (D-100): permanents that ask "As this enters, choose a
 * creature type / a color" and read the answer (type and color lords, a lord that is the chosen type, a
 * cost reducer and a trigger of the chosen type), a land that asks as it is played, and the spell that
 * puts a creature card onto the battlefield from the graveyard. Used by the 'chosen' deck style.
 */
export const CHOSEN_LAND_NAMES = ['SYNTHETIC Tribal Land'] as const;
export const CHOSEN_SPELL_NAMES = [
  'SYNTHETIC Rally Banner',
  'SYNTHETIC Hue Banner',
  'SYNTHETIC Banner Captain',
  'SYNTHETIC Shifting Captain',
  'SYNTHETIC Hue Captain',
  'SYNTHETIC Tribal Discount',
  'SYNTHETIC Tribal Scout',
  'SYNTHETIC Raise Dead',
] as const;

/** Basic lands and the land that asks, so a land play is often a question. */
export const CHOSEN_LANDS = [
  ...BASIC_LANDS,
  ...supported(CHOSEN_LAND_NAMES),
  ...supported(CHOSEN_LAND_NAMES),
  ...supported(CHOSEN_LAND_NAMES),
];

/**
 * The chosen cards twice, with creatures of a few types for the lords to read, removal and a flicker,
 * a token copy and a "loses all abilities" effect that make the choices come, go and be asked again.
 */
export const CHOSEN_SPELLS = [
  ...supported(CHOSEN_SPELL_NAMES),
  ...supported(CHOSEN_SPELL_NAMES),
  ...supported([
    'Grizzly Bears',
    'Llanowar Elves',
    'Llanowar Elves',
    'Serra Angel',
    'Raging Goblin',
    'Typhoid Rats',
    'SYNTHETIC Flicker Spell',
    'SYNTHETIC Twin Image',
    'SYNTHETIC Frog Hex',
    'Lightning Bolt',
    'Murder',
    'Unsummon',
  ]),
];

/**
 * SYNTHETIC X cards that only a dedicated test plays (casual-x.test.ts), so they are in no style: the card is a 0/0 body that dies without
 * X counters, which the casual agents rightly rarely cast, and a random game that drew it asked `chooseX` in a mix that must not (games-100).
 */
export const X_FIXTURE_ONLY_NAMES = ['SYNTHETIC Hydra Zero'] as const;

/**
 * SYNTHETIC X cards (D-103): "deals X damage", "draw X cards", "put X +1/+1 counters", "enters with X
 * +1/+1 counters", two {X}, "pay X life" as an additional cost, kicker with X, a spell with a free
 * alternative cost (X is 0), activated abilities with {X} and with "pay X life", and a cost reducer.
 * Used by the 'x' deck style, and kept out of every other (the seeded games the older tests rely on).
 */
export const X_SPELL_NAMES = [
  'SYNTHETIC X Burn',
  'SYNTHETIC X Draw',
  'SYNTHETIC Double X Draw',
  'SYNTHETIC X Pump',
  'SYNTHETIC Hydra Cub',
  'SYNTHETIC Blood Burn',
  'SYNTHETIC Kicked X Burn',
  'SYNTHETIC Free X Burn',
  'SYNTHETIC X Cannon',
  'SYNTHETIC Blood Lance',
  'SYNTHETIC Double Well',
  'SYNTHETIC Spell Discount',
] as const;

/**
 * The X cards three times, a Signet that makes more mana, bodies for the pumps and the flicker to aim
 * at, burn and removal: many casts have an X to announce, and the X cards meet each other's effects.
 * No creature here makes mana, so the mana a player has is the lands, the Signets and the pool.
 */
export const X_SPELLS = [
  ...supported(X_SPELL_NAMES),
  ...supported(X_SPELL_NAMES),
  ...supported(X_SPELL_NAMES),
  ...supported([
    'SYNTHETIC Signet',
    'SYNTHETIC Signet',
    'SYNTHETIC Flicker Spell',
    'Grizzly Bears',
    'Serra Angel',
    'Giant Spider',
    'Lightning Bolt',
    'Murder',
  ]),
];

/**
 * SYNTHETIC modal cards (D-105, D-114): choose one, two, one or both and one or more, the commander
 * widening, modal spells with kicker and with X, modal enters and attack triggers and modal activated
 * abilities. Used by the 'modal' deck style, and kept out of every other (the seeded games the older
 * tests rely on): the modal creatures would otherwise join the generic creature pools.
 */
export const MODAL_CARD_NAMES = [
  'SYNTHETIC Three Way Charm',
  'SYNTHETIC Twin Charm',
  'SYNTHETIC Both Charm',
  'SYNTHETIC Split Strike',
  'SYNTHETIC Many Charm',
  'SYNTHETIC Command Charm',
  'SYNTHETIC Kicked Charm',
  'SYNTHETIC X Charm',
  'SYNTHETIC Drain Charm',
  'SYNTHETIC Modal Greeter',
  'SYNTHETIC Modal Hunter',
  'SYNTHETIC Twin Greeter',
  'SYNTHETIC Modal Raider',
  'SYNTHETIC Modal Totem',
  'SYNTHETIC Picky Totem',
] as const;

/**
 * The modal cards twice, with bodies for the creature modes to aim at, a cost reducer-free mix of burn and
 * removal, and the artifacts the destroy-an-artifact modes look for: many modal casts, triggers and
 * activations have only some of their modes legal, and some have none.
 */
export const MODAL_SPELLS = [
  ...supported(MODAL_CARD_NAMES),
  ...supported(MODAL_CARD_NAMES),
  ...supported([
    'SYNTHETIC Signet',
    'Grizzly Bears',
    'Serra Angel',
    'Giant Spider',
    'Lightning Bolt',
    'Murder',
    'Sol Ring',
  ]),
];

/**
 * SYNTHETIC counted power and toughness cards (D-109, D-115): "+1/+1 for each artifact you control" on an
 * Equipment and an Aura, a creature and a lord, "-1/-1 for each creature card in your graveyard",
 * characteristic-defining power and toughness (cards in hand, lands, creatures, creature cards in the
 * graveyard) and the "-X/-X", "+X/+0" and counted pump spells and abilities. Used by the 'pt' deck style,
 * and kept out of every other (the seeded games the older tests rely on): the creatures would otherwise
 * join the generic creature pools.
 */
export const PT_CARD_NAMES = [
  'SYNTHETIC Artisan Blade',
  'SYNTHETIC Artisan Aura',
  'SYNTHETIC Grave Chill Aura',
  'SYNTHETIC Pack Wolf',
  'SYNTHETIC Elf Chanter',
  'SYNTHETIC Elf Scout',
  'SYNTHETIC Stone Golem',
  'SYNTHETIC Hand Hydra',
  'SYNTHETIC Land Lurker',
  'SYNTHETIC Horde Hound',
  'SYNTHETIC Grave Ghoul',
  'SYNTHETIC Lifeline Hydra',
  'SYNTHETIC Withering Surge',
  'SYNTHETIC Surge Strike',
  'SYNTHETIC Mass Rally',
  'SYNTHETIC Land Shape',
  'SYNTHETIC Base Four',
  'SYNTHETIC Dress Down',
  'SYNTHETIC Rage Bear',
] as const;

/**
 * The counted cards twice, with artifacts for the counts, plain bodies and the removal that makes the
 * graveyard counts grow: bodies whose size changes as cards are drawn, played and die, pumps with an X,
 * and creatures that reach 0 toughness.
 */
export const PT_SPELLS = [
  ...supported(PT_CARD_NAMES),
  ...supported(PT_CARD_NAMES),
  ...supported([
    'SYNTHETIC Signet',
    'Grizzly Bears',
    'Serra Angel',
    'Giant Spider',
    'Lightning Bolt',
    'Murder',
    'Sol Ring',
  ]),
];

/**
 * SYNTHETIC keyword cards of batch 1 (D-104, D-110): Changeling, Devoid, Partner, Exalted, Annihilator,
 * Persist, Undying, Infect, Wither, Toxic, Split second, typecycling and Multikicker, with a land that
 * typecycling finds. Used by the 'keywordBatch' deck style, and kept out of every other (the seeded
 * games the older tests rely on).
 */
export const KEYWORD_BATCH_NAMES = [
  'SYNTHETIC Chameleon Drifter',
  'SYNTHETIC Void Wisp',
  'SYNTHETIC Duo Scout',
  'SYNTHETIC Exalted Squire',
  'SYNTHETIC Exalted Banner',
  'SYNTHETIC Annihilator Titan',
  'SYNTHETIC Eater Imp',
  'SYNTHETIC Persist Bear',
  'SYNTHETIC Persist Wisp',
  'SYNTHETIC Undying Imp',
  'SYNTHETIC Infect Bear',
  'SYNTHETIC Infect Lifelinker',
  'SYNTHETIC Infect Viper',
  'SYNTHETIC Infect Pinger',
  'SYNTHETIC Wither Imp',
  'SYNTHETIC Toxic Rat',
  'SYNTHETIC Toxic Brute',
  'SYNTHETIC Hush Bolt',
  'SYNTHETIC Hush Gain',
  'SYNTHETIC Landcycler Beast',
  'SYNTHETIC Islandcycler Drake',
  'SYNTHETIC Strider Cub',
  'SYNTHETIC Volley Barrage',
  'SYNTHETIC Blood Tithe',
] as const;
export const KEYWORD_BATCH_LAND_NAMES = ['SYNTHETIC Tide Pool'] as const;

/**
 * The keyword cards twice, with the removal and counterspells that meet split second and kill the
 * persisting creatures, a few creatures to block and be blocked by, and burn.
 */
export const KEYWORD_BATCH_SPELLS = [
  ...supported(KEYWORD_BATCH_NAMES),
  ...supported(KEYWORD_BATCH_NAMES),
  // The poison and recursion cards a third time: the races and the returns are the paths worth meeting.
  ...supported([
    'SYNTHETIC Infect Bear',
    'SYNTHETIC Toxic Rat',
    'SYNTHETIC Toxic Brute',
    'SYNTHETIC Persist Bear',
    'SYNTHETIC Persist Wisp',
    'SYNTHETIC Undying Imp',
    'SYNTHETIC Annihilator Titan',
    'SYNTHETIC Eater Imp',
  ]),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** Basic lands (so typecycling finds something), and the land with two basic land types. */
export const KEYWORD_BATCH_LANDS = [...BASIC_LANDS, ...supported(KEYWORD_BATCH_LAND_NAMES)];

/**
 * SYNTHETIC keyword cards of batch 2 (D-116, D-120): Skulk, Battle cry, Mentor, Evolve, Bushido, Extort,
 * Affinity, regeneration, Convoke, Improvise, Delve and Cascade. Used by the 'keywordBatch2' deck style, and
 * kept out of every other (the seeded games the older tests rely on).
 */
export const KEYWORD2_NAMES = [
  'SYNTHETIC Skulk Rogue',
  'SYNTHETIC Battle Cry Chief',
  'SYNTHETIC Mentor Veteran',
  'SYNTHETIC Evolve Whelp',
  'SYNTHETIC Bushido Duelist',
  'SYNTHETIC Extort Priest',
  'SYNTHETIC Affinity Golem',
  'SYNTHETIC Affinity Sphinx',
  'SYNTHETIC Trinket',
  'SYNTHETIC Regenerating Troll',
  'SYNTHETIC Regrowth Charm',
  'SYNTHETIC Final Smite',
  'SYNTHETIC Self Edict',
  'SYNTHETIC Convoke Wurm',
  'SYNTHETIC Convoke Pair',
  'SYNTHETIC Convoke Hybrid',
  'SYNTHETIC Improvise Construct',
  'SYNTHETIC Delve Spirit',
  'SYNTHETIC Resourceful Hulk',
  'SYNTHETIC Cascade Giant',
  'SYNTHETIC Cascade Drake',
  'SYNTHETIC Cascade Sprite',
] as const;

/**
 * The batch 2 cards twice, a third copy of the ones that need company (the cost-payment keywords need creatures,
 * artifacts and a graveyard; cascade needs a library of cheap spells), and bodies, burn and removal.
 */
export const KEYWORD2_SPELLS = [
  ...supported(KEYWORD2_NAMES),
  ...supported(KEYWORD2_NAMES),
  ...supported([
    'SYNTHETIC Convoke Wurm',
    'SYNTHETIC Convoke Pair',
    'SYNTHETIC Delve Spirit',
    'SYNTHETIC Cascade Giant',
    'SYNTHETIC Regenerating Troll',
    'SYNTHETIC Extort Priest',
    'SYNTHETIC Trinket',
    'SYNTHETIC Improvise Construct',
  ]),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Typhoid Rats', 'Sol Ring']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell', 'Divination']),
  ...supported(['Lightning Bolt', 'Murder']),
];

/**
 * SYNTHETIC cards of the trigger slice (D-111): step triggers of every kind of "whose", "whenever you
 * draw", combat damage dealt to a player or a creature, leaving the battlefield (with and without a zone),
 * power and mana value comparisons, "equipped / enchanted creature" as a subject, "an opponent casts" with
 * "unless that player pays", and the bodies, removal and cantrips that make them happen. Used by the
 * 'triggerSlice' deck style, and kept out of every other (the seeded games the older tests rely on).
 */
export const TRIGGER_SLICE_NAMES = [
  'SYNTHETIC Step Watcher beginCombat you',
  'SYNTHETIC Step Watcher draw opponent',
  'SYNTHETIC Step Watcher main1 each',
  'SYNTHETIC Step Watcher main2 each',
  'SYNTHETIC Step Watcher combatEnd you',
  'SYNTHETIC Step Watcher upkeep opponent',
  'SYNTHETIC Step Watcher endStep each',
  'SYNTHETIC Draw Watcher',
  'SYNTHETIC Opponent Draw Watcher',
  'SYNTHETIC Second Draw Watcher',
  'SYNTHETIC Cantrip',
  'SYNTHETIC Player Hit Watcher',
  'SYNTHETIC Opponent Hit Watcher',
  'SYNTHETIC Creature Hit Watcher',
  'SYNTHETIC Big Creature Hit Watcher',
  'SYNTHETIC Any Damage Watcher',
  'SYNTHETIC Every Hit Watcher',
  'SYNTHETIC Biting Bear',
  'SYNTHETIC Scrapping Bear',
  'SYNTHETIC Striking Bear',
  'SYNTHETIC Leaver any',
  'SYNTHETIC Leaver graveyard',
  'SYNTHETIC Leaver exile',
  'SYNTHETIC Leaver hand',
  'SYNTHETIC Departure Watcher',
  'SYNTHETIC Rival Departure Watcher',
  'SYNTHETIC Exile Watcher',
  'SYNTHETIC Big Arrival Watcher',
  'SYNTHETIC Frail Death Watcher',
  'SYNTHETIC Tough Death Watcher',
  'SYNTHETIC Cheap Spell Watcher',
  'SYNTHETIC Exact Spell Watcher',
  'SYNTHETIC Rival Spell Watcher',
  'SYNTHETIC Giant Slayer',
  'SYNTHETIC Wall Breaker',
  'SYNTHETIC Grower',
  'SYNTHETIC Big Stompers',
  'SYNTHETIC Titan Roost',
  'SYNTHETIC Titan Anthem',
  'SYNTHETIC Frail Anthem',
  'SYNTHETIC Cheap Lord',
  'SYNTHETIC Last Gift Blade',
  'SYNTHETIC Drumbeat Blade',
  'SYNTHETIC Doom Aura',
  'SYNTHETIC Tap Aura',
  'SYNTHETIC Tax Collector',
  'SYNTHETIC Strict Tax Collector',
  'SYNTHETIC Blood Tax Collector',
  'SYNTHETIC Tithe Collector',
  'SYNTHETIC Toll Keeper',
] as const;

/**
 * The other cards of the trigger slice's fixture file, which the 'triggerSlice' style does not play (the
 * unit tests use them): kept out of every deck style so that no generic pool picks them up.
 */
export const TRIGGER_SLICE_UNUSED_NAMES = [
  'SYNTHETIC Step Watcher upkeep you',
  'SYNTHETIC Step Watcher upkeep each',
  'SYNTHETIC Step Watcher draw you',
  'SYNTHETIC Step Watcher draw each',
  'SYNTHETIC Step Watcher main1 you',
  'SYNTHETIC Step Watcher main1 opponent',
  'SYNTHETIC Step Watcher beginCombat each',
  'SYNTHETIC Step Watcher beginCombat opponent',
  'SYNTHETIC Step Watcher combatEnd each',
  'SYNTHETIC Step Watcher combatEnd opponent',
  'SYNTHETIC Step Watcher main2 you',
  'SYNTHETIC Step Watcher main2 opponent',
  'SYNTHETIC Step Watcher endStep you',
  'SYNTHETIC Step Watcher endStep opponent',
  'SYNTHETIC Leaver library',
  'SYNTHETIC Any Draw Watcher',
  'SYNTHETIC Opponent Second Draw Watcher',
] as const;

/** Every card of the trigger slice twice, with real bodies, removal and burn, and the mana to cast them. */
export const TRIGGER_SLICE_SPELLS = [
  ...supported(TRIGGER_SLICE_NAMES),
  ...supported(TRIGGER_SLICE_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Serra Angel', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell', 'Divination']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell', 'Divination']),
];

/**
 * SYNTHETIC cards of the subjects slice (D-133): lords and grants to a filter, triggers on filtered creatures (nontoken, a
 * subtype, "another"), "that player" and "that much", conditional statics, costs that tap or sacrifice other permanents with
 * "the sacrificed creature's power", a replacement of a death, a limit on blockers and casting from the graveyard. Used by
 * the 'subjects' deck style and kept out of every other pool.
 */
export const SUBJECT_NAMES = [
  'SYNTHETIC Accursed Lord',
  'SYNTHETIC Altar Scholar',
  'SYNTHETIC Artifact Adept',
  'SYNTHETIC Banner of the Lone Duel',
  'SYNTHETIC Big Rallier',
  'SYNTHETIC Bone Baron',
  'SYNTHETIC Brass Trinket',
  'SYNTHETIC Clip Wings',
  'SYNTHETIC Clockwork Ledger',
  'SYNTHETIC Colorless Banner',
  'SYNTHETIC Crawler Cousin',
  'SYNTHETIC Crown Banner',
  'SYNTHETIC Decree Stone',
  'SYNTHETIC Farewell Bell',
  'SYNTHETIC Field Marshal',
  'SYNTHETIC Firebreathing Brute',
  'SYNTHETIC Gale Tempest',
  'SYNTHETIC Ghoul Summoner',
  'SYNTHETIC Goreclaw Cousin',
  'SYNTHETIC Grave Rider',
  'SYNTHETIC Grave Whisperer',
  'SYNTHETIC Ground Pound',
  'SYNTHETIC Hale Brute',
  'SYNTHETIC Lone Guard',
  'SYNTHETIC Mass Decay',
  'SYNTHETIC Menacing Titan',
  'SYNTHETIC Midnight Cousin',
  'SYNTHETIC Muster Sergeant',
  'SYNTHETIC Open Graves',
  'SYNTHETIC Pin Sentinels',
  'SYNTHETIC Plain Golem',
  'SYNTHETIC Plain Skeleton',
  'SYNTHETIC Prime Valkyrie',
  'SYNTHETIC Quiet Shroud',
  'SYNTHETIC Radiant Tapper',
  'SYNTHETIC Raise Zombie',
  'SYNTHETIC Reaver Cousin',
  'SYNTHETIC Regent Cousin',
  'SYNTHETIC Restless Corpse',
  'SYNTHETIC Scar Ledger',
  'SYNTHETIC Sentry Chant',
  'SYNTHETIC Shade Druid',
  'SYNTHETIC Shield Mentor',
  'SYNTHETIC Soul Collector',
  'SYNTHETIC Soulful Seraph',
  'SYNTHETIC Spiteful Raptor',
  'SYNTHETIC Spitfire Whelp',
  'SYNTHETIC Standing Sentinel',
  'SYNTHETIC Stubborn Shade',
  'SYNTHETIC Thopter Weaver',
  'SYNTHETIC Token Herald',
  'SYNTHETIC Toll Totem',
  'SYNTHETIC Undead Lord',
  'SYNTHETIC Vigil Captain',
  'SYNTHETIC Volatile Imp',
  'SYNTHETIC Wary Sentinel',
  'SYNTHETIC Welcome Wagon',
  'SYNTHETIC Whirling Rogue',
  'SYNTHETIC Zombie Pact',
  'SYNTHETIC Zombie Tithe',
] as const;

/**
 * SYNTHETIC cards of the Artifacts slice (D-139): mass effects over a filter and the Kindred type, counting colors, the greatest
 * of a stat, living weapon, abilities that cost less for each of something, put counters or return a permanent as a cost, state
 * triggers, "lords" for a creature type and blocking restrictions, flash Auras and linked exile, discarding unless an artifact
 * card, looking at the top cards and taking some, triggered mana abilities, combat damage to a player by one or more creatures,
 * "once each turn", "mana value X" of a player that was hit, tapping a chosen number of creatures and reselecting what an attacker
 * attacks. Used by the 'artifacts' deck style and kept out of every other pool.
 */
export const ARTIFACT_NAMES = [
  'SYNTHETIC Reading Lamp',
  'SYNTHETIC Zombie Furnace',
  'SYNTHETIC Grave Lamp',
  'SYNTHETIC Reading Tome',
  'SYNTHETIC Lore Idol',
  'SYNTHETIC Ember Urn',
  'SYNTHETIC Pride Statue',
  'SYNTHETIC Ferry Mage',
  'SYNTHETIC Swap Lodge',
  'SYNTHETIC Tide Shrine',
  'SYNTHETIC Fleeting Lens',
  'SYNTHETIC Spy Ring',
  'SYNTHETIC Raid Flag',
  'SYNTHETIC Mob Banner',
  'SYNTHETIC Artifact Keeper',
  'SYNTHETIC Power Keeper',
  'SYNTHETIC Toughness Keeper',
  'SYNTHETIC Goblin Keeper',
  'SYNTHETIC Trinket 1',
  'SYNTHETIC Trinket 2',
  'SYNTHETIC Trinket 4',
  'SYNTHETIC Goblin 1/1',
  'SYNTHETIC Goblin 2/5',
  'SYNTHETIC Goblin 4/1',
  'SYNTHETIC Elf 3/3',
  'SYNTHETIC Elf 5/2',
  'SYNTHETIC Study Rite',
  'SYNTHETIC Beast Rite',
  'SYNTHETIC Artifact Sketch',
  'SYNTHETIC Beast Sketch',
  'SYNTHETIC Land Sketch',
  'SYNTHETIC Scout Gear',
  'SYNTHETIC Germ Blade',
  'SYNTHETIC Count Blade',
  'SYNTHETIC Husk Blade',
  'SYNTHETIC Echo Monument',
  'SYNTHETIC Green Cairn',
  'SYNTHETIC Spark Totem',
  'SYNTHETIC Recoil Wave',
  'SYNTHETIC Wipe Disk',
  'SYNTHETIC Rust Disk',
  'SYNTHETIC Quiet Lantern',
  'SYNTHETIC Hollow Lantern',
  'SYNTHETIC Prism Purge',
  'SYNTHETIC Mono Purge',
  'SYNTHETIC Hue Purge',
  'SYNTHETIC Grey Idol',
  'SYNTHETIC Red Idol',
  'SYNTHETIC Dual Idol',
  'SYNTHETIC Colorless Drone',
  'SYNTHETIC Red Cub',
  'SYNTHETIC Gruul Cub',
  'SYNTHETIC Dull Ward',
  'SYNTHETIC Crooked Signpost',
  'SYNTHETIC Dawn Banner',
  'SYNTHETIC Juggernaut Lord',
  'SYNTHETIC Elf Banner',
  'SYNTHETIC Ground Standard',
  'SYNTHETIC Bully Brute',
  'SYNTHETIC Dust Juggernaut',
  'SYNTHETIC Brick Wall',
  'SYNTHETIC Chill Chains',
  'SYNTHETIC Monarch Leash',
  'SYNTHETIC Swift Artisan',
  'SYNTHETIC Swift Summoner',
  'SYNTHETIC Swift Cheapskate',
  'SYNTHETIC Shape Twin',
  'SYNTHETIC Grave Mimic',
  'SYNTHETIC Copper Myr',
  'SYNTHETIC Iron Mite',
  'SYNTHETIC Swarm Sphere',
  'SYNTHETIC Goblin Warband',
  'SYNTHETIC Weary Drover',
  'SYNTHETIC Brand Hellkite',
  'SYNTHETIC Reprisal Wyrm',
  'SYNTHETIC Daily Well',
  'SYNTHETIC Pain Stone',
  'SYNTHETIC Twin Well',
  'SYNTHETIC Idle Scribe',
  'SYNTHETIC Chilling Rune',
] as const;

/**
 * SYNTHETIC cards of the recursion slice (D-135): returning a creature card from the graveyard with a follow-up that reads it,
 * "you may ... if you do", reflexive triggers, any number of sacrifices, a library move after a death, Gift, a permission to
 * cast a creature card from the graveyard, abilities that work from the graveyard, "enters untapped" and life paid by an
 * amount. Used by the 'recursion' deck style and kept out of every other pool.
 */
export const RECURSION_NAMES = [
  'SYNTHETIC Recall Zombie',
  'SYNTHETIC Recall Goblin',
  'SYNTHETIC Recall Angel',
  'SYNTHETIC Recall Non-Zombie',
  'SYNTHETIC Reanimate Angel',
  'SYNTHETIC Reanimate Zombie',
  'SYNTHETIC Pitch Reunion',
  'SYNTHETIC Pitch Monument',
  'SYNTHETIC Mill For Life',
  'SYNTHETIC Draw For Life',
  'SYNTHETIC Double Discard',
  'SYNTHETIC Keen Butler',
  'SYNTHETIC Heart Striker',
  'SYNTHETIC Greedy God',
  'SYNTHETIC Gifted Ranger',
  'SYNTHETIC Greedy Reaper',
  'SYNTHETIC Gift Study',
  'SYNTHETIC Edict of the Mighty',
  'SYNTHETIC Grave Chanter Zombie',
  'SYNTHETIC Grave Chanter Goblin',
  'SYNTHETIC Grave Chanter Angel',
  'SYNTHETIC Revenant Zombie',
  'SYNTHETIC Revenant Dinosaur',
  'SYNTHETIC Eager Gardener',
] as const;

/** The lands of the recursion slice: a land that enters untapped or tapped with a trigger, and life paid by an amount. */
export const RECURSION_LAND_NAMES = [
  'SYNTHETIC Haunted Cottage',
  'SYNTHETIC Sulking Tarn',
  'SYNTHETIC Tithe Well',
  'SYNTHETIC Blood Well',
] as const;

/** The Artifacts slice cards twice each, with real bodies and cheap removal to make the mass effects and the combat triggers matter. */
export const ARTIFACT_SPELLS = [
  ...supported(ARTIFACT_NAMES),
  ...supported(ARTIFACT_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Serra Angel', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** The recursion cards twice each, with creatures to die and come back and cheap removal to make them die. */
export const RECURSION_SPELLS = [
  ...supported(RECURSION_NAMES),
  ...supported(RECURSION_NAMES),
  ...supported(['SYNTHETIC Plain Zombie', 'SYNTHETIC Plain Zombie', 'SYNTHETIC Costly Angel']),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Serra Angel', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** Basic lands and the recursion lands (the Cottages count as Swamps for each other). */
export const RECURSION_LANDS = [
  ...supported(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']),
  ...supported(['Swamp', 'Swamp', 'Mountain']),
  ...supported(RECURSION_LAND_NAMES),
];

/** The subjects cards twice each, with Zombies to count, real bodies and cheap removal. */
export const SUBJECT_SPELLS = [
  ...supported(SUBJECT_NAMES),
  ...supported(SUBJECT_NAMES),
  ...supported(['SYNTHETIC Plain Zombie', 'SYNTHETIC Plain Zombie', 'SYNTHETIC Plain Zombie']),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Serra Angel', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * SYNTHETIC cards of the Dinosaurs slice (D-145): commanders as a filter and an amount, stun counters, "can't attack or block unless", mana
 * "instead" and of any color, a static "loses all abilities" and colors, doubling power or toughness, prevention by the creatures that
 * deal it, a bite with trample excess, escalate, creature spells that cost much less, revealing until a land, fight, casting or playing a
 * card for free, Hideaway, and damage divided as the spell is cast. Used by the 'dinosaurs' deck style and kept out of every other pool.
 */
export const DINOSAUR_NAMES = [
  'SYNTHETIC Commander Clinic',
  'SYNTHETIC Commander Blade',
  'SYNTHETIC Counter Lord',
  'SYNTHETIC Growth Lord',
  'SYNTHETIC Freeze Bolt',
  'SYNTHETIC Rouse',
  'SYNTHETIC Slow Raptor',
  'SYNTHETIC Careful Raptor',
  'SYNTHETIC Little Dinosaur',
  'SYNTHETIC Flash Dinosaur',
  'SYNTHETIC Shy Colossus',
  'SYNTHETIC Landbound Guard',
  'SYNTHETIC Healthy Charger',
  'SYNTHETIC Grounding Aura',
  'SYNTHETIC Calm Down',
  'SYNTHETIC Doubling Mystic',
  'SYNTHETIC Rich Rock',
  'SYNTHETIC Chameleon Rock',
  'SYNTHETIC Twin Spring',
  'SYNTHETIC Elk Aura',
  'SYNTHETIC Elk Blade',
  'SYNTHETIC Blue Wizard Aura',
  'SYNTHETIC Clockwork Bear',
  'SYNTHETIC Surge Field',
  'SYNTHETIC Might Doubler',
  'SYNTHETIC Hide Doubler',
  'SYNTHETIC Spider Fog',
  'SYNTHETIC Big Fog',
  'SYNTHETIC Their Fog',
  'SYNTHETIC Trample Bite Either',
  'SYNTHETIC Trample Bite',
  'SYNTHETIC Plain Bite',
  'SYNTHETIC Escalating Charm',
  'SYNTHETIC Costly Both',
  'SYNTHETIC Escalating Kicker Charm',
  'SYNTHETIC Fixed Pair',
  'SYNTHETIC Titan Tamer',
  'SYNTHETIC Small Thrift Ring',
  'SYNTHETIC Land Digger',
  'SYNTHETIC Lucky Dig',
  'SYNTHETIC Big Seeker',
  'SYNTHETIC Land Scout',
  'SYNTHETIC Tapped Scout',
  'SYNTHETIC Duel',
  'SYNTHETIC Swarm Predation',
  'SYNTHETIC Twin Brawl',
  'SYNTHETIC Free Cast Rite',
  'SYNTHETIC Small Free Rite',
  'SYNTHETIC Quick Free Rite',
  'SYNTHETIC Quick Free Play Rite',
  'SYNTHETIC Free Spell Rite',
  'SYNTHETIC Free Play Rite',
  'SYNTHETIC Hidden Cache',
  'SYNTHETIC Cache Smasher',
  'SYNTHETIC Divided Rampage',
  'SYNTHETIC Measured Volley',
  'SYNTHETIC Arc Volley',
  'SYNTHETIC Graveyard Scavenger',
  'SYNTHETIC Thicket Growth',
  'SYNTHETIC Trampling Sage',
  'SYNTHETIC Counter Mentor',
  'SYNTHETIC Surging Brute',
] as const;

/** The land of the Dinosaurs slice: Hideaway 4, enters tapped. */
export const DINOSAUR_LAND_NAMES = ['SYNTHETIC Hidden Vault'] as const;

/** The Dinosaurs slice cards twice each, with real bodies and cheap removal for the fights and the divided damage. */
export const DINOSAUR_SPELLS = [
  ...supported(DINOSAUR_NAMES),
  ...supported(DINOSAUR_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Serra Angel', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** Basic lands and the Hideaway land, which is played twice as often as each basic land. */
export const DINOSAUR_LANDS = [
  ...supported(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']),
  ...supported(DINOSAUR_LAND_NAMES),
  ...supported(DINOSAUR_LAND_NAMES),
];

/**
 * SYNTHETIC cards of the Angels slice (D-149): life gain with a bonus and "whenever you gain life", counters added to a permanent,
 * several creatures attacking, creatures that enter with counters, commanders entering or attacking, proliferate, a creature that can't be
 * cast early or lose, hexproof for the player, prevention to the creature itself, a tax on blocking, mana to spend only on some spells
 * or of the chosen color, an exile that ends when the source leaves with a slot for each opponent, an Aura that enters by an effect, a
 * keyword granted to Clues, a grant to creatures with flying, and an alternative cost that taps four creatures with flying. Used by the
 * 'angels' deck style and kept out of every other pool.
 */
export const ANGEL_NAMES = [
  'SYNTHETIC Quiet Shrine',
  'SYNTHETIC Banishing Light Sorcery',
  'SYNTHETIC Ruin Angel',
  'SYNTHETIC Angelic Mantle',
  'SYNTHETIC Counter Sleuth',
  'SYNTHETIC Warded Angel',
  'SYNTHETIC Undying Herald',
  'SYNTHETIC Shielded Seraph',
  'SYNTHETIC Stone Seraph',
  'SYNTHETIC Late Avenger',
  'SYNTHETIC Quick Avenger',
  'SYNTHETIC Land Atlas',
  'SYNTHETIC Truth Merchant',
  'SYNTHETIC Exalted Lord',
  'SYNTHETIC Tithe Angel',
  'SYNTHETIC Toll Bridge',
  'SYNTHETIC Vital Angel',
  'SYNTHETIC Radiant Angel',
  'SYNTHETIC Seer Seraph',
  'SYNTHETIC Dawn Pinger',
  'SYNTHETIC Envious Angel',
  'SYNTHETIC Watchful Angel',
  'SYNTHETIC Growing Light',
  'SYNTHETIC Counter Admirer',
  'SYNTHETIC Counter Collector',
  'SYNTHETIC Mend',
  'SYNTHETIC Mend Twice',
  'SYNTHETIC Mend Nothing',
  'SYNTHETIC Mend Them',
  'SYNTHETIC Counter Boon',
  'SYNTHETIC Rot Boon',
  'SYNTHETIC Raid Marshal',
  'SYNTHETIC Choir Captain',
  'SYNTHETIC Batch Sentinel',
  'SYNTHETIC Chief Angel',
  'SYNTHETIC Type Mimic',
  'SYNTHETIC Growth Banner',
  'SYNTHETIC Withering Shrine',
  'SYNTHETIC Angel Summons',
  'SYNTHETIC Chronicle Book',
  'SYNTHETIC Command Admirer',
  'SYNTHETIC Choirmaster',
  'SYNTHETIC Spreading Growth',
  'SYNTHETIC Font Angel',
  'SYNTHETIC Builder Rock',
  'SYNTHETIC Elf Shrine',
  'SYNTHETIC Mana Sink',
  'SYNTHETIC Colored Banner',
  'SYNTHETIC Colorless Tonic',
  'SYNTHETIC Grasp of Law',
  'SYNTHETIC Banishing Warden',
  'SYNTHETIC Dispel Enchantment',
  'SYNTHETIC Mighty Aura',
  'SYNTHETIC Guardian Aura',
  'SYNTHETIC Rise Again',
  'SYNTHETIC Dawn Shepherd',
  'SYNTHETIC Sky Blade Angel',
  'SYNTHETIC Mana Bird',
  'SYNTHETIC Wind Caller',
] as const;

/**
 * SYNTHETIC cards of the Dragons slice (D-151): cards played from exile and from the top of the library, abilities that work from the graveyard,
 * conditions on what happened this turn, mana to spend only on Dragons (with a haste rider and unspent mana that stays), a choice among named
 * options, an artifact that enters as a copy of a creature, a Saga with read ahead and "discard any number of cards", an additional combat phase,
 * Dethrone, entering attacking, other targets, once-per-turn modes, revealing and exiling from the library (Discover), beholding, paying any
 * amount of mana, and a Lieutenant. Used by the 'dragons' deck style and kept out of every other pool. The lands are `DRAGON_LAND_NAMES`.
 */
export const DRAGON_NAMES = [
  'SYNTHETIC Artifact Oracle',
  'SYNTHETIC Big Plain Drake',
  'SYNTHETIC Breaching Hoard',
  'SYNTHETIC Charge Wyrm',
  'SYNTHETIC Creature Geyser',
  'SYNTHETIC Cursed Looking Glass',
  'SYNTHETIC Discovery Rite',
  'SYNTHETIC Dragon Orb',
  'SYNTHETIC Dragon Scout',
  'SYNTHETIC Dragon Seeker',
  'SYNTHETIC Dying Dragon',
  'SYNTHETIC Echo Drake',
  'SYNTHETIC Ember Return',
  'SYNTHETIC Ember Tyrant',
  'SYNTHETIC Festive Chief',
  'SYNTHETIC Firebreather Drake',
  'SYNTHETIC Gleeful Ogre',
  'SYNTHETIC Grave Chorus',
  'SYNTHETIC Grave Echo',
  'SYNTHETIC Grave Spark',
  'SYNTHETIC Hasty Artifact Oracle',
  'SYNTHETIC Hasty Orb',
  'SYNTHETIC Hawk of Fortune',
  'SYNTHETIC Herald Trumpet',
  'SYNTHETIC Impulse Rite',
  'SYNTHETIC Lieutenant Wyrm',
  'SYNTHETIC Long Impulse Rite',
  'SYNTHETIC Luck Altar',
  'SYNTHETIC Mana Keeper Drake',
  'SYNTHETIC Maw Dragon',
  'SYNTHETIC Pack Kobold',
  'SYNTHETIC Plain Drake',
  'SYNTHETIC Reading Rite',
  'SYNTHETIC Reveal Probe',
  'SYNTHETIC Rolling Ignition',
  'SYNTHETIC Seer Drake',
  'SYNTHETIC Siege of Choices',
  'SYNTHETIC Storm Globe',
  'SYNTHETIC Tap Geyser',
  'SYNTHETIC Thrashing Wyrm',
  'SYNTHETIC Token Cheerer',
  'SYNTHETIC Usurper Wyrm',
  'SYNTHETIC Warp Bolt',
] as const;

/**
 * The cards of the Korvold slice 6 (D-185): Encore, Devour on a card and on a token, Riot of its own and given to a group, and a group that cannot be
 * countered. Used by the 'korvoldKeywords' deck style and kept out of every other pool, because they ask the questions of devour and riot (chooseOption and
 * choosePermanent as a permanent enters), which the seeded games of the other styles do not.
 */
export const KORVOLD_KEYWORD_NAMES = [
  'SYNTHETIC Devouring Brute',
  'SYNTHETIC Dragon Broodmother',
  'SYNTHETIC Encore Bear',
  'SYNTHETIC Encore Pilferer',
  'SYNTHETIC Encore Rioter',
  'SYNTHETIC Plain Ogre',
  'SYNTHETIC Rhythm of the Wild',
  'SYNTHETIC Riot Goblin',
  'SYNTHETIC Riot Token Maker',
  'SYNTHETIC Riotous Devourer',
] as const;

/**
 * The cards of the Korvold slice 7a (D-187): the sacrifice of one or more Treasures with "up to that many" targets, +1/+0 for each time a creature
 * attacked and an additional combat phase after a main phase, and an Adventure that exiles the top two cards of an opponent's library face down. Used by the
 * 'korvoldSingles' deck style and kept out of every other pool, because they ask the questions of the sacrifice (choosePermanent with a minimum of one,
 * targets with a number fixed as the ability is put on the stack) and play cards another player owns, which the seeded games of the other styles do not.
 * The legendary creature is listed once, so no deck has two of it.
 */
export const KORVOLD_SINGLE_NAMES = [
  'SYNTHETIC Feast Dragon // Taste of Riches',
  'SYNTHETIC Treasure Raider',
] as const;

/**
 * The cards of the Vraska deck program (D-208 to D-210): a creature that asks each player whether to discard their hand, energy with a random discard unless it
 * is paid, connive, a land that asks for a card to reveal and a mana source that mills a card. Used by the 'vraska' deck style and kept out of every other pool,
 * because they ask questions of other players in the middle of a resolution and a payment of energy, which the seeded games of the other styles do not.
 */
export const VRASKA_NAMES = [
  'SYNTHETIC Ruin Walker',
  'SYNTHETIC Energy Cantrip',
  'SYNTHETIC Conniver',
  'SYNTHETIC Mill Stone',
  'SYNTHETIC Copy Mirror',
  'SYNTHETIC Prepared Scout // Scout Tidings',
] as const;

/**
 * The cards of the Vraska EDHREC deck program (D-216 to D-220): lands to untap, the piles of the top cards, how many cards to draw for another player, a delayed
 * mana, a batch trigger of tokens, magecraft, a sacrifice mana ability, the replacements of the creation of artifact tokens, doubled triggers, an Equipment with
 * a restricted equip and a mayPay trigger of the attackers of the opponents. Used by the 'edhrec' deck style and kept out of every other pool, because they ask
 * questions of other players in the middle of a resolution and change what other cards do.
 */
export const EDHREC_NAMES = [
  'SYNTHETIC Untap Cantrip',
  'SYNTHETIC Top Sorter',
  'SYNTHETIC Delayed Denial',
  'SYNTHETIC Mana Echo',
  'SYNTHETIC Token Watcher',
  'SYNTHETIC Spell Echoer',
  'SYNTHETIC Blood Altar',
  'SYNTHETIC Dragon Maker',
  'SYNTHETIC Thopter Automaton',
  'SYNTHETIC Twice Wizard',
  'SYNTHETIC Echo Wizard',
  'SYNTHETIC Wizard Staff',
  'SYNTHETIC Attack Roar',
  'SYNTHETIC Treasure Pair',
] as const;

/** The land of the Vraska style: a land that asks for a card of the hand to reveal as it enters. */
export const VRASKA_LAND_NAMES = ['SYNTHETIC Reveal Land'] as const;

/** The legendary one of them, once in the pool. */
export const KORVOLD_SINGLE_LEGENDS = ['SYNTHETIC Furious Minotaur'] as const;

/** The land of the Korvold slice 6: a land that is a creature, with riot. */
export const KORVOLD_KEYWORD_LAND_NAMES = ['SYNTHETIC Riot Grove'] as const;

/** The lands of the Dragons slice: mana for Dragons only, a land that returns a Dragon, and a Hideaway land. */
export const DRAGON_LAND_NAMES = [
  'SYNTHETIC Dragon Haven',
  'SYNTHETIC Dragon Sanctum',
  'SYNTHETIC Scorched Hideaway',
] as const;

/** The Dragons slice cards three times each (the pool is big), with real bodies and cheap removal. */
export const DRAGON_SPELLS = [
  ...supported(DRAGON_NAMES),
  ...supported(DRAGON_NAMES),
  ...supported(DRAGON_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Serra Angel', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** Basic lands, mostly Mountains, and the lands of the slice. */
export const DRAGON_LANDS = [
  ...supported(['Mountain', 'Mountain', 'Mountain', 'Plains', 'Island', 'Swamp', 'Forest']),
  ...supported(DRAGON_LAND_NAMES),
];

/** The cards of the Korvold slice 6 three times each, with bodies and cheap removal. */
export const KORVOLD_KEYWORD_SPELLS = [
  ...supported(KORVOLD_KEYWORD_NAMES),
  ...supported(KORVOLD_KEYWORD_NAMES),
  ...supported(KORVOLD_KEYWORD_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * The cards of the Korvold slice 8a (D-189): control-changing effects (until end of turn, until the end of the controller's next turn, for as long as the
 * controller controls the permanent with the ability, and with no duration) and "whenever an opponent taps an artifact for mana". Used by the
 * 'korvoldControl' style and kept out of every other pool: a permanent that is on the other side of the table for a while is a state the seeded games of the
 * other styles do not reach.
 */
export const KORVOLD_CONTROL_NAMES = [
  'SYNTHETIC Treasure Nabber',
  'SYNTHETIC Snatch Creature',
  'SYNTHETIC Borrow Creature',
  'SYNTHETIC Lasting Theft',
  'SYNTHETIC Artifact Loan',
  'SYNTHETIC Mind Leash',
] as const;

/** The cards of the Korvold slice 8a, with the artifacts they take (mana rocks and Treasures), bodies and cheap removal. */
export const KORVOLD_CONTROL_SPELLS = [
  ...supported(KORVOLD_CONTROL_NAMES),
  ...supported(KORVOLD_CONTROL_NAMES),
  ...supported(['Sol Ring', 'Sol Ring', 'SYNTHETIC Make Treasures', 'SYNTHETIC Make Treasures']),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** Mountains and Islands (the cards cost red and blue), a Swamp for the removal and a Forest for the bodies. */
export const KORVOLD_CONTROL_LANDS = supported([
  'Mountain',
  'Mountain',
  'Mountain',
  'Island',
  'Island',
  'Swamp',
  'Forest',
]);

/**
 * The card of the damage redirection slice (D-192): the SYNTHETIC Ancient Adamantoise, which redirects all damage to its controller and their other
 * permanents to itself and keeps its damage through cleanup steps. Used by the 'adamantoise' style and kept out of every other pool: a creature that
 * takes the damage of a whole table (and that asks its controller which of several effects applies first) is a state the seeded games of the other
 * styles do not reach.
 */
export const ADAMANTOISE_NAMES = ['SYNTHETIC Ancient Adamantoise'] as const;

/** The Adamantoise three times, with the shields and the damage that meet it, attackers with infect, wither, deathtouch and trample, and removal. */
export const ADAMANTOISE_SPELLS = [
  ...supported(ADAMANTOISE_NAMES),
  ...supported(ADAMANTOISE_NAMES),
  ...supported(ADAMANTOISE_NAMES),
  ...supported([
    'SYNTHETIC Brace Three',
    'SYNTHETIC Brace Five',
    'SYNTHETIC Shield Two',
    'SYNTHETIC Shield Five',
    'SYNTHETIC Backdraft',
    'SYNTHETIC Order Blast',
    'SYNTHETIC Lifelink Bolt',
  ]),
  ...supported([
    'SYNTHETIC Infect Bear',
    'SYNTHETIC Wither Imp',
    'SYNTHETIC Deathtouch Trampler 4/4',
    'SYNTHETIC Vanilla 3/3',
    'SYNTHETIC Vanilla 5/5',
    'Grizzly Bears',
  ]),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** Forests for the Adamantoise, Plains for the shields, Mountains for the burn, a Swamp and an Island for the removal. */
export const ADAMANTOISE_LANDS = supported([
  'Forest',
  'Forest',
  'Forest',
  'Forest',
  'Plains',
  'Plains',
  'Mountain',
  'Mountain',
  'Swamp',
  'Island',
]);

/**
 * The cards of the voting slice (D-194): the SYNTHETIC Emissary Green (a vote for profit or security whenever it attacks) and the three-option Ballot Rite.
 * Used by the 'vote' style and kept out of every other pool: a vote asks each player a question in the middle of a resolution, which the seeded games of the
 * other styles do not reach.
 */
export const VOTE_NAMES = ['SYNTHETIC Emissary Green', 'SYNTHETIC Ballot Rite'] as const;

/**
 * The cards of the meld slice (D-277 to D-282): the SYNTHETIC meld pairs, the two spells that exile or tuck a melded permanent, the watcher of the second card, the
 * restriction by mana value and an X spell. Kept out of every pool: a pair melds into one permanent that leaves as two cards and asks its owner an order (a
 * chooseOption), and a restriction changes which spells the opponents can cast, which the seeded games of the other styles do not reach. `meld-games.test.ts`
 * builds its own states with them.
 */
export const MELD_NAMES = [
  'SYNTHETIC Dusk Squire',
  'SYNTHETIC Dawn Squire',
  'SYNTHETIC Ember Squire',
  'SYNTHETIC Ash Squire',
  'SYNTHETIC Stray Squire',
  'SYNTHETIC Meld Exile',
  'SYNTHETIC Meld Tuck',
  'SYNTHETIC Meld Watcher',
  'SYNTHETIC Gatekeeper',
  'SYNTHETIC X Surge',
] as const;

/** Emissary Green three times and the rite twice, with bodies to carry the counters and cheap removal. */
export const VOTE_SPELLS = [
  ...supported(['SYNTHETIC Emissary Green']),
  ...supported(['SYNTHETIC Emissary Green']),
  ...supported(['SYNTHETIC Emissary Green']),
  ...supported(['SYNTHETIC Ballot Rite']),
  ...supported(['SYNTHETIC Ballot Rite']),
  ...supported([
    'SYNTHETIC Vanilla 3/3',
    'SYNTHETIC Vanilla 2/2',
    'SYNTHETIC Vanilla 5/5',
    'Grizzly Bears',
  ]),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon']),
];

/** Forests for Emissary Green, Islands for the rite, a Mountain and a Swamp for the removal. */
export const VOTE_LANDS = supported([
  'Forest',
  'Forest',
  'Forest',
  'Forest',
  'Forest',
  'Island',
  'Island',
  'Island',
  'Mountain',
  'Swamp',
]);

/**
 * The cards of the Ring slice (D-196): the SYNTHETIC There and Back Again (the real wording of the Saga), the Ring on its own, the watcher of "whenever
 * the Ring tempts you" and the Ring-bearer condition. Used by the 'ring' style and kept out of every other pool: the Ring asks its player which creature
 * becomes the Ring-bearer in the middle of a resolution and adds legendary, evasion and three triggered abilities to a creature, which the seeded games of
 * the other styles do not reach.
 */
export const RING_NAMES = [
  'SYNTHETIC There and Back Again',
  'SYNTHETIC Ring Rite',
  'SYNTHETIC Ring Watcher',
  'SYNTHETIC Bearer Oath',
] as const;

/**
 * The cards of the soulbond slices (D-284, D-286): the SYNTHETIC creatures whose dies ability returns them at the beginning of the next upkeep, and the SYNTHETIC
 * soulbond creatures. Used by the 'soulbond' style and kept out of every other pool: soulbond asks its controller which creature to pair with in the middle of a
 * resolution, and the returning creatures ask a "you may" and create a delayed ability, which the seeded games of the other styles do not reach.
 */
export const SOULBOND_NAMES = [
  'SYNTHETIC Ember Cub',
  'SYNTHETIC Grave Thief',
  'SYNTHETIC Soulbound Squire',
  'SYNTHETIC Soulbound Seraph',
  'SYNTHETIC Soulbound Giant',
  'SYNTHETIC Soulbound Glider',
  'SYNTHETIC Bonded Hound',
] as const;

/**
 * The cards of the piles slice (D-971): the SYNTHETIC spells that reveal the top cards of the library and have a player separate them into two piles. Used by the 'piles' style and
 * kept out of every other pool: they ask the other player which cards form a pile, and then which pile goes where, in the middle of a resolution.
 */
export const PILES_NAMES = [
  'SYNTHETIC Pile Reading',
  'SYNTHETIC Pile Offering',
  'SYNTHETIC Pile Tithe',
] as const;

/** The piles style: the three pile spells several times (the controller or an opponent separates, the pile goes to the hand or the graveyard), bodies and a little removal. */
export const PILES_SPELLS = [
  ...supported(['SYNTHETIC Pile Reading']),
  ...supported(['SYNTHETIC Pile Reading']),
  ...supported(['SYNTHETIC Pile Reading']),
  ...supported(['SYNTHETIC Pile Offering']),
  ...supported(['SYNTHETIC Pile Offering']),
  ...supported(['SYNTHETIC Pile Tithe']),
  ...supported(['SYNTHETIC Pile Tithe']),
  ...supported([
    'SYNTHETIC Vanilla 3/3',
    'SYNTHETIC Vanilla 2/2',
    'SYNTHETIC Vanilla 5/5',
    'Grizzly Bears',
    'Grizzly Bears',
    'Wall of Stone',
    'Serra Angel',
    'Giant Spider',
  ]),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon']),
];

/** Blue for the pile spells, the others for the bodies and the removal. */
export const PILES_LANDS = supported([
  'Island',
  'Island',
  'Island',
  'Island',
  'Island',
  'Plains',
  'Forest',
  'Swamp',
  'Mountain',
]);

/**
 * The soulbond style: the soulbond creatures (the keyword alone, with the Seraph's grant, with +2/+2 and with flying for the pair) several times, the creatures that
 * return when they die, a creature that is paired by another's soulbond, bodies, and removal that ends a pair (death, bounce, a type change, a change of control).
 */
export const SOULBOND_SPELLS = [
  ...supported(['SYNTHETIC Soulbound Squire']),
  ...supported(['SYNTHETIC Soulbound Squire']),
  ...supported(['SYNTHETIC Soulbound Squire']),
  ...supported(['SYNTHETIC Soulbound Seraph']),
  ...supported(['SYNTHETIC Soulbound Seraph']),
  ...supported(['SYNTHETIC Soulbound Giant']),
  ...supported(['SYNTHETIC Soulbound Giant']),
  ...supported(['SYNTHETIC Soulbound Glider']),
  ...supported(['SYNTHETIC Soulbound Glider']),
  ...supported(['SYNTHETIC Bonded Hound']),
  ...supported(['SYNTHETIC Ember Cub']),
  ...supported(['SYNTHETIC Ember Cub']),
  ...supported(['SYNTHETIC Grave Thief']),
  ...supported([
    'SYNTHETIC Vanilla 3/3',
    'SYNTHETIC Vanilla 2/2',
    'SYNTHETIC Vanilla 5/5',
    'Grizzly Bears',
    'Grizzly Bears',
    'Wall of Stone',
    'Serra Angel',
  ]),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon']),
  ...supported(['SYNTHETIC Rust Touch', 'SYNTHETIC Flicker Spell', 'SYNTHETIC Borrow Creature']),
];

/** White for the soulbond creatures, the others for the bodies and the removal. */
export const SOULBOND_LANDS = supported([
  'Plains',
  'Plains',
  'Plains',
  'Plains',
  'Forest',
  'Forest',
  'Swamp',
  'Mountain',
  'Island',
  'Island',
]);

/** The Saga three times, the Ring's rite five times (the later levels of the Ring need many temptations) and its other cards once, with bodies to carry the designation, a Wall to block it and removal that also takes the designation away. */
export const RING_SPELLS = [
  ...supported(['SYNTHETIC There and Back Again']),
  ...supported(['SYNTHETIC There and Back Again']),
  ...supported(['SYNTHETIC There and Back Again']),
  ...supported(['SYNTHETIC Ring Rite']),
  ...supported(['SYNTHETIC Ring Rite']),
  ...supported(['SYNTHETIC Ring Rite']),
  ...supported(['SYNTHETIC Ring Rite']),
  ...supported(['SYNTHETIC Ring Rite']),
  ...supported(['SYNTHETIC Ring Watcher']),
  ...supported(['SYNTHETIC Bearer Oath']),
  ...supported([
    'SYNTHETIC Vanilla 3/3',
    'SYNTHETIC Vanilla 2/2',
    'SYNTHETIC Vanilla 5/5',
    'Grizzly Bears',
    'Grizzly Bears',
    'Wall of Stone',
    'Serra Angel',
  ]),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon']),
  ...supported(['SYNTHETIC Borrow Creature']),
];

/** Mountains for the Saga, Swamps for the rite and the removal, a Plains and an Island for the rest. */
export const RING_LANDS = supported([
  'Mountain',
  'Mountain',
  'Mountain',
  'Mountain',
  'Mountain',
  'Swamp',
  'Swamp',
  'Swamp',
  'Plains',
  'Island',
]);

/**
 * The cards of the planeswalker slice (D-200 to D-203): the SYNTHETIC planeswalkers of the engine (loyalty abilities of every shape, a [-X], an ultimate, statics and
 * triggers, one that becomes a creature, one that adds mana), the Jace token makers (Empower Jace), the emblem rites, the life setter and the spells that
 * take a planeswalker or its types away. Used by the 'planeswalkers' style and kept out of every other pool: a planeswalker asks for loyalty abilities at
 * sorcery timing, is attacked and defended, and an emblem lives in the command zone, which the seeded games of the other styles do not reach.
 */
export const PLANESWALKER_NAMES = [
  'SYNTHETIC Loyalty Walker',
  'SYNTHETIC X Walker',
  'SYNTHETIC Ultimate Walker',
  'SYNTHETIC Static Walker',
  'SYNTHETIC Animate Walker',
  'SYNTHETIC Mana Walker',
  'SYNTHETIC Walker Maker',
  'SYNTHETIC Walker Twin',
  'SYNTHETIC Walker Burn',
  'SYNTHETIC Empower Rite',
  'SYNTHETIC Empower Keeper',
  'SYNTHETIC Double Jace Rite',
  'SYNTHETIC Anthem Emblem Rite',
  'SYNTHETIC Burn Emblem Rite',
  'SYNTHETIC Life Setter',
  'SYNTHETIC Life Raiser',
  'SYNTHETIC Walker Theft',
  'SYNTHETIC Type Wipe',
  'SYNTHETIC Walker Commander',
] as const;

/** The planeswalkers three times each, the rest once, with bodies to attack and defend them and removal that also hits a planeswalker. */
export const PLANESWALKER_SPELLS = [
  ...supported(PLANESWALKER_NAMES.slice(0, 6)),
  ...supported(PLANESWALKER_NAMES.slice(0, 6)),
  ...supported(PLANESWALKER_NAMES.slice(0, 6)),
  ...supported(PLANESWALKER_NAMES.slice(6)),
  ...supported([
    'SYNTHETIC Vanilla 3/3',
    'SYNTHETIC Vanilla 2/2',
    'SYNTHETIC Vanilla 5/5',
    'Grizzly Bears',
    'Grizzly Bears',
    'Wall of Stone',
    'Serra Angel',
    'Giant Spider',
  ]),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon']),
];

/** Every color the planeswalkers cost, with Islands first. */
export const PLANESWALKER_LANDS = supported([
  'Island',
  'Island',
  'Island',
  'Island',
  'Mountain',
  'Mountain',
  'Swamp',
  'Swamp',
  'Forest',
  'Plains',
  'Plains',
]);

/**
 * The SYNTHETIC cards of the Hofri Ghostforge program (D-229 to D-235): the permanents each player keeps and the rest sacrificed, exile from the graveyard as a cost,
 * a creature that becomes a copy of a card that left a graveyard, phasing, the once-a-turn play from the graveyard, exile until an opponent becomes the monarch and each
 * player exiling a card of their graveyard. Used by the 'hofri' style and kept out of every other pool: these cards ask questions of other players in the middle of a
 * resolution (which permanents to keep, which exiled card goes to the library), and move permanents out of the game's view while they are phased out, which the seeded
 * games of the other styles do not reach.
 */
export const HOFRI_NAMES = [
  'SYNTHETIC Keep Rite',
  'SYNTHETIC Split Coin',
  'SYNTHETIC Yard Echo',
  'SYNTHETIC Phase Guard',
  'SYNTHETIC Yard Paragon',
  'SYNTHETIC Crown Jailer',
  'SYNTHETIC Grave Herald',
] as const;

/** Each card three times, with bodies, removal that fills the graveyards and a way to return a creature card from the graveyard. */
export const HOFRI_SPELLS = [
  ...supported(HOFRI_NAMES),
  ...supported(HOFRI_NAMES),
  ...supported(HOFRI_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Divination']),
];

/** White for most of the cards, a Mountain for the Echo and a Swamp for the removal. */
export const HOFRI_LANDS = supported([
  'Plains',
  'Plains',
  'Plains',
  'Plains',
  'Plains',
  'Plains',
  'Mountain',
  'Mountain',
  'Swamp',
  'Forest',
]);

/** The cards of the Vraska program, each several times, with bodies to connive and removal to make the Ruin Walker die. */
export const VRASKA_SPELLS = [
  ...supported(VRASKA_NAMES),
  ...supported(VRASKA_NAMES),
  ...supported(VRASKA_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** The cards of the Vraska EDHREC program, each several times, with bodies and a counterspell. */
export const EDHREC_SPELLS = [
  ...supported(EDHREC_NAMES),
  ...supported(EDHREC_NAMES),
  ...supported(EDHREC_NAMES),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** Islands, Mountains and a few other basic lands for the colors of the program's cards. */
export const EDHREC_LANDS = supported([
  'Island',
  'Island',
  'Island',
  'Island',
  'Mountain',
  'Mountain',
  'Mountain',
  'Swamp',
  'Forest',
]);

/** Islands for the energy and the connive, Mountains for the Ruin Walker, the land that reveals, and Swamps for the removal. */
export const VRASKA_LANDS = supported([
  'Island',
  'Island',
  'Island',
  'Mountain',
  'Mountain',
  'Swamp',
  'Swamp',
  'Forest',
  ...VRASKA_LAND_NAMES,
]);

/** The cards of the Korvold slice 7a, with Treasure makers, bodies and cheap removal. */
export const KORVOLD_SINGLE_SPELLS = [
  ...supported(KORVOLD_SINGLE_NAMES),
  ...supported(KORVOLD_SINGLE_NAMES),
  ...supported(KORVOLD_SINGLE_NAMES),
  ...supported(KORVOLD_SINGLE_LEGENDS),
  ...supported(['SYNTHETIC Make Treasures', 'SYNTHETIC Make Treasures']),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/** Mountains and Swamps (the Adventure costs black, the creatures red), a Forest and an Island for the others. */
export const KORVOLD_SINGLE_LANDS = supported([
  'Mountain',
  'Mountain',
  'Mountain',
  'Swamp',
  'Swamp',
  'Forest',
  'Island',
]);

/** Mountains and Forests (the cards cost red and green), a Swamp and an Island for the removal, and the land creature. */
export const KORVOLD_KEYWORD_LANDS = [
  ...supported(['Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest', 'Swamp', 'Island']),
  ...supported(KORVOLD_KEYWORD_LAND_NAMES),
];

/** The Angels slice cards twice each, with fliers for the alternative cost that taps four of them, bodies, and removal. */
export const ANGEL_SPELLS = [
  ...supported(ANGEL_NAMES),
  ...supported(ANGEL_NAMES),
  ...supported([
    "Healer's Hawk",
    "Healer's Hawk",
    'SYNTHETIC Mana Bird',
    'SYNTHETIC Sky Blade Angel',
  ]),
  ...supported(['Grizzly Bears', 'Llanowar Elves', 'Serra Angel', 'Giant Spider', 'Typhoid Rats']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * Creature and permanent pools for the combat-heavy deck mix. They are read from the engine's
 * exported fixtures instead of being listed by name, so every supported creature fixture (the
 * combat keywords, vanilla bodies, a planeswalker, a battle) joins the games as soon as it exists.
 * Legendary creatures are left out because the commanders are fixed (see COMMANDERS).
 */
const FIXTURES: readonly CardDefinition[] = [
  ...Object.values(FIXTURE_CARDS),
  ...Object.values(SYNTHETIC_CARDS),
]
  // The attachment cards have their own deck style; keeping them out leaves the other mixes (and
  // the seeded games the older tests rely on) exactly as they were.
  .filter((card) => !(ATTACHMENT_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(KICKER_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(ALT_COST_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(PLAY_RULE_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(UPKEEP_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(LATER_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(MIRACLE_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(COPY_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(AMOUNT_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(SUBJECT_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(RECURSION_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(ARTIFACT_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(DINOSAUR_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(DINOSAUR_LAND_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(ANGEL_NAMES as readonly string[]).includes(card.name))
  // The Dragons slice has its own style (its comment says "kept out of every other pool"). Without this its creatures
  // joined the generic pools, and a seeded game could ask chooseModes (Thrashing Wyrm's modal trigger), which games-100 expects
  // only from the modal style.
  .filter((card) => !(DRAGON_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(DRAGON_LAND_NAMES as readonly string[]).includes(card.name))
  // The Korvold slice 6 has its own style: its cards ask the questions of devour and riot as a permanent enters.
  .filter((card) => !(KORVOLD_KEYWORD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(KORVOLD_KEYWORD_LAND_NAMES as readonly string[]).includes(card.name))
  // The Korvold slice 7a has its own style: its cards ask the sacrifice and the number of targets of the reflexive ability, and play another player's cards.
  .filter((card) => !(KORVOLD_SINGLE_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(KORVOLD_SINGLE_LEGENDS as readonly string[]).includes(card.name))
  // The Korvold slice 8a has its own style: its cards put permanents on the other side of the table for a while.
  .filter((card) => !(KORVOLD_CONTROL_NAMES as readonly string[]).includes(card.name))
  // The damage redirection slice has its own style: its creature takes the damage of its whole table and asks the order of the effects that apply.
  .filter((card) => !(ADAMANTOISE_NAMES as readonly string[]).includes(card.name))
  // The voting slice has its own style: its cards ask each player a vote in the middle of a resolution.
  .filter((card) => !(VOTE_NAMES as readonly string[]).includes(card.name))
  // The meld slice has its own soak test: a pair melds and leaves as two cards, and its owner is asked their order.
  .filter((card) => !(MELD_NAMES as readonly string[]).includes(card.name))
  // The Ring slice has its own style: its cards ask which creature is the Ring-bearer and give a creature three triggered abilities.
  .filter((card) => !(RING_NAMES as readonly string[]).includes(card.name))
  // The soulbond slices have their own tests: a pairing asks which creature to pair with, and a dies ability asks "you may" and creates a delayed ability.
  .filter((card) => !(SOULBOND_NAMES as readonly string[]).includes(card.name))
  // The piles slice has its own style: its cards ask the other player to separate revealed cards into two piles, then ask which pile goes where.
  .filter((card) => !(PILES_NAMES as readonly string[]).includes(card.name))
  // The Vraska program has its own style: its cards ask other players questions in the middle of a resolution, and a payment of energy.
  .filter((card) => !(VRASKA_NAMES as readonly string[]).includes(card.name))
  // The Vraska EDHREC program has its own style: its cards ask other players questions in the middle of a resolution and change token creation and triggers.
  .filter((card) => !(EDHREC_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(VRASKA_LAND_NAMES as readonly string[]).includes(card.name))
  // The planeswalker slice has its own style: planeswalkers are attacked and defended, ask for loyalty abilities at sorcery timing, and an emblem lives in the command zone.
  .filter((card) => !(PLANESWALKER_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(RECURSION_LAND_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(FOOD_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(LAYER_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(WARD_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(LAYOUT_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(SAGA_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(TRIGGER_TARGET_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(LIBRARY_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(REFERENCE_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(REFERENCE_LAND_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(RESTRICTION_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(RESTRICTION_LAND_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(COST_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(MANA_PLUS_LAND_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(MANA_PLUS_SPELL_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(CHOSEN_LAND_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(CHOSEN_SPELL_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(X_SPELL_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(X_FIXTURE_ONLY_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(MODAL_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(PT_CARD_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(KEYWORD_BATCH_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(KEYWORD_BATCH_LAND_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(KEYWORD2_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(TRIGGER_SLICE_NAMES as readonly string[]).includes(card.name))
  .filter((card) => !(TRIGGER_SLICE_UNUSED_NAMES as readonly string[]).includes(card.name))
  .filter((card) => validateCard(card).length === 0);
const frontTypes = (card: CardDefinition): readonly string[] => card.faces[0]?.types ?? [];
const isLegendary = (card: CardDefinition) =>
  card.faces[0]?.supertypes.includes('legendary') ?? false;

export const CREATURES = FIXTURES.filter(
  (card) => frontTypes(card).includes('creature') && !isLegendary(card),
).map((card) => card.name);

/** Planeswalkers and battles: attack targets other than players (CR 506.3). */
export const ATTACKABLE_PERMANENTS = FIXTURES.filter(
  (card) => frontTypes(card).includes('planeswalker') || frontTypes(card).includes('battle'),
).map((card) => card.name);

/** Every keyword kind that at least one creature in the pool has, e.g. 'menace', 'trample'. */
export const POOL_KEYWORDS: ReadonlySet<string> = new Set(
  FIXTURES.filter((card) => CREATURES.includes(card.name)).flatMap((card) =>
    (card.faces[0]?.abilities ?? []).flatMap((a) => (a.kind === 'keyword' ? [a.keyword.kind] : [])),
  ),
);

/** Combat keywords (CR 702) that change who blocks or how damage is dealt. */
const COMBAT_KEYWORDS = [
  'flying',
  'reach',
  'firstStrike',
  'doubleStrike',
  'deathtouch',
  'trample',
  'menace',
  'indestructible',
] as const;

/** Creatures with at least one combat keyword. */
export const KEYWORD_CREATURES = FIXTURES.filter(
  (card) =>
    CREATURES.includes(card.name) &&
    (card.faces[0]?.abilities ?? []).some(
      (a) =>
        a.kind === 'keyword' && (COMBAT_KEYWORDS as readonly string[]).includes(a.keyword.kind),
    ),
).map((card) => card.name);

/**
 * The combat keywords whose use in an attack or a block the soak tests assert (games-100). The
 * generic pools grow with every slice of creature fixtures, so a seeded draw of the 'creatures' and
 * 'brawl' styles stopped drawing, casting and attacking with the only two tramplers (the pool has
 * 50 and more creatures); the 'combat' deck style guarantees them by construction instead.
 */
export const COVERAGE_KEYWORDS = ['trample', 'menace', 'firstStrike', 'doubleStrike'] as const;

/** The non-legendary creatures that have at least one of `COVERAGE_KEYWORDS`, read from the fixtures. */
export const COVERAGE_CREATURES = FIXTURES.filter(
  (card) =>
    CREATURES.includes(card.name) &&
    (card.faces[0]?.abilities ?? []).some(
      (a) =>
        a.kind === 'keyword' && (COVERAGE_KEYWORDS as readonly string[]).includes(a.keyword.kind),
    ),
).map((card) => card.name);

/**
 * The spell slots of a creature-heavy deck: each creature twice, one copy of every planeswalker
 * and battle, and a little removal and mana so the games still hold other decision kinds.
 */
export const CREATURE_MIX_SPELLS: readonly string[] = [
  ...CREATURES,
  ...CREATURES,
  ...ATTACKABLE_PERMANENTS,
  ...supported(['Lightning Bolt', 'Murder', 'Sol Ring', 'Unsummon']),
];

/** A tiny deterministic generator for building test inputs (not the engine's or the agents'). */
export function lcg(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s >>> 8) % n;
  };
}

/**
 * The old spell mix (`spells`), the creature-heavy mix of combat fixtures (`creatures`), a mix
 * that is nearly all keyword creatures plus a planeswalker or battle (`brawl`), which makes
 * trample, menace, first strike and deathtouch combats frequent. `triggers` is the trigger, sacrifice
 * and token pool; `keywords` is the flash, hexproof and shroud pool with targeted spells; `mana` is
 * the mana-and-lands pool (dual, pain, check and shock lands, Signets) on mana lands.
 */
export type DeckStyle =
  | 'spells'
  | 'creatures'
  | 'brawl'
  | 'triggers'
  | 'keywords'
  | 'mana'
  | 'search'
  | 'activated'
  | 'attachments'
  | 'kicker'
  | 'food'
  | 'layers'
  | 'ward'
  | 'vehicles'
  | 'prevention'
  | 'layouts'
  | 'sagas'
  | 'triggerTargets'
  | 'library'
  | 'references'
  | 'restrictions'
  | 'costs'
  | 'manaPlus'
  | 'chosen'
  | 'x'
  | 'keywordBatch'
  | 'keywordBatch2'
  | 'triggerSlice'
  | 'modal'
  | 'pt'
  | 'altCosts'
  | 'playRules'
  | 'upkeep'
  | 'later'
  | 'miracle'
  | 'copies'
  | 'amounts'
  | 'subjects'
  | 'recursion'
  | 'artifacts'
  | 'dinosaurs'
  | 'angels'
  | 'dragons'
  | 'korvoldKeywords'
  | 'korvoldSingles'
  | 'korvoldControl'
  | 'adamantoise'
  | 'vote'
  | 'ring'
  | 'planeswalkers'
  | 'vraska'
  | 'edhrec'
  | 'hofri'
  | 'soulbond'
  | 'piles'
  | 'combat';

/** The spell slots of a style. A style whose pool is empty falls back to the old spell mix. */
export function spellSlots(style: DeckStyle): readonly string[] {
  // D-229 to D-235: the Hofri Ghostforge mechanics (a style of its own, kept out of every other pool).
  if (style === 'hofri' && HOFRI_SPELLS.length > 0) return HOFRI_SPELLS;
  if (style === 'soulbond' && SOULBOND_SPELLS.length > 0) return SOULBOND_SPELLS;
  if (style === 'piles' && PILES_SPELLS.length > 0) return PILES_SPELLS;
  if (style === 'vraska') return VRASKA_SPELLS;
  if (style === 'edhrec') return EDHREC_SPELLS;
  // Only the creatures with a coverage keyword, so every deck of the style draws them (see COVERAGE_KEYWORDS).
  if (style === 'combat' && COVERAGE_CREATURES.length > 0) return COVERAGE_CREATURES;
  const pool =
    style === 'creatures'
      ? CREATURE_MIX_SPELLS
      : style === 'brawl'
        ? [...KEYWORD_CREATURES, ...KEYWORD_CREATURES, ...CREATURES, ...ATTACKABLE_PERMANENTS]
        : style === 'triggers'
          ? TRIGGER_SPELLS
          : style === 'keywords'
            ? KEYWORD_TARGET_SPELLS
            : style === 'mana'
              ? MANA_SPELLS
              : style === 'search'
                ? SEARCH_SPELLS
                : style === 'activated'
                  ? ACTIVATED_SPELLS
                  : style === 'attachments'
                    ? ATTACHMENT_SPELLS
                    : style === 'kicker'
                      ? KICKER_SPELLS
                      : style === 'food'
                        ? FOOD_SPELLS
                        : style === 'layers'
                          ? LAYER_SPELLS
                          : style === 'ward'
                            ? WARD_SPELLS
                            : style === 'vehicles'
                              ? VEHICLE_SPELLS
                              : style === 'prevention'
                                ? PREVENTION_SPELLS
                                : style === 'layouts'
                                  ? LAYOUT_SPELLS
                                  : style === 'sagas'
                                    ? SAGA_SPELLS
                                    : style === 'triggerTargets'
                                      ? TRIGGER_TARGET_SPELLS
                                      : style === 'library'
                                        ? LIBRARY_SPELLS
                                        : style === 'references'
                                          ? REFERENCE_SPELLS
                                          : style === 'restrictions'
                                            ? RESTRICTION_SPELLS
                                            : style === 'costs'
                                              ? COST_SPELLS
                                              : style === 'manaPlus'
                                                ? MANA_PLUS_SPELLS
                                                : style === 'chosen'
                                                  ? CHOSEN_SPELLS
                                                  : style === 'x'
                                                    ? X_SPELLS
                                                    : style === 'keywordBatch'
                                                      ? KEYWORD_BATCH_SPELLS
                                                      : style === 'keywordBatch2'
                                                        ? KEYWORD2_SPELLS
                                                        : style === 'triggerSlice'
                                                          ? TRIGGER_SLICE_SPELLS
                                                          : style === 'modal'
                                                            ? MODAL_SPELLS
                                                            : style === 'pt'
                                                              ? PT_SPELLS
                                                              : style === 'altCosts'
                                                                ? ALT_COST_SPELLS
                                                                : style === 'playRules'
                                                                  ? PLAY_RULE_SPELLS
                                                                  : style === 'upkeep'
                                                                    ? UPKEEP_SPELLS
                                                                    : style === 'later'
                                                                      ? LATER_SPELLS
                                                                      : style === 'miracle'
                                                                        ? MIRACLE_SPELLS
                                                                        : style === 'copies'
                                                                          ? COPY_SPELLS
                                                                          : style === 'amounts'
                                                                            ? AMOUNT_SPELLS
                                                                            : style === 'subjects'
                                                                              ? SUBJECT_SPELLS
                                                                              : style ===
                                                                                  'recursion'
                                                                                ? RECURSION_SPELLS
                                                                                : style ===
                                                                                    'artifacts'
                                                                                  ? ARTIFACT_SPELLS
                                                                                  : style ===
                                                                                      'dinosaurs'
                                                                                    ? DINOSAUR_SPELLS
                                                                                    : style ===
                                                                                        'angels'
                                                                                      ? ANGEL_SPELLS
                                                                                      : style ===
                                                                                          'dragons'
                                                                                        ? DRAGON_SPELLS
                                                                                        : style ===
                                                                                            'korvoldKeywords'
                                                                                          ? KORVOLD_KEYWORD_SPELLS
                                                                                          : style ===
                                                                                              'korvoldSingles'
                                                                                            ? KORVOLD_SINGLE_SPELLS
                                                                                            : style ===
                                                                                                'korvoldControl'
                                                                                              ? KORVOLD_CONTROL_SPELLS
                                                                                              : style ===
                                                                                                  'adamantoise'
                                                                                                ? ADAMANTOISE_SPELLS
                                                                                                : style ===
                                                                                                    'vote'
                                                                                                  ? VOTE_SPELLS
                                                                                                  : style ===
                                                                                                      'ring'
                                                                                                    ? RING_SPELLS
                                                                                                    : style ===
                                                                                                        'planeswalkers'
                                                                                                      ? PLANESWALKER_SPELLS
                                                                                                      : SPELLS;
  return pool.length > 0 ? pool : SPELLS;
}

/** The land slots of a style: the mana style plays on mana lands, every other on the old pool. */
export function landSlots(style: DeckStyle): readonly string[] {
  // Basic lands of every color: the coverage creatures need green, black and others.
  if (style === 'combat' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'search' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'activated' && ACTIVATED_LANDS.length > 0) return ACTIVATED_LANDS;
  if (style === 'attachments' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'kicker' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'food' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'layers' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'ward' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'vehicles' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'prevention' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'layouts' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'sagas' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'triggerTargets' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'library' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'references' && BASIC_LANDS.length > 0) return REFERENCE_LANDS;
  if (style === 'restrictions' && BASIC_LANDS.length > 0) return RESTRICTION_LANDS;
  if (style === 'costs' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'manaPlus' && BASIC_LANDS.length > 0) return MANA_PLUS_LANDS;
  if (style === 'chosen' && BASIC_LANDS.length > 0) return CHOSEN_LANDS;
  if (style === 'x' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'keywordBatch' && BASIC_LANDS.length > 0) return KEYWORD_BATCH_LANDS;
  if (style === 'keywordBatch2' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'triggerSlice' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'modal' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'pt' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'altCosts' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'playRules' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'upkeep' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'later' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'miracle' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'copies' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'amounts' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'subjects' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'recursion' && BASIC_LANDS.length > 0) return RECURSION_LANDS;
  if (style === 'artifacts' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'dinosaurs' && BASIC_LANDS.length > 0) return DINOSAUR_LANDS;
  if (style === 'angels' && BASIC_LANDS.length > 0) return BASIC_LANDS;
  if (style === 'dragons' && BASIC_LANDS.length > 0) return DRAGON_LANDS;
  if (style === 'korvoldKeywords' && BASIC_LANDS.length > 0) return KORVOLD_KEYWORD_LANDS;
  if (style === 'korvoldSingles' && BASIC_LANDS.length > 0) return KORVOLD_SINGLE_LANDS;
  if (style === 'korvoldControl' && BASIC_LANDS.length > 0) return KORVOLD_CONTROL_LANDS;
  if (style === 'adamantoise' && BASIC_LANDS.length > 0) return ADAMANTOISE_LANDS;
  if (style === 'vote' && BASIC_LANDS.length > 0) return VOTE_LANDS;
  if (style === 'ring' && BASIC_LANDS.length > 0) return RING_LANDS;
  if (style === 'planeswalkers' && BASIC_LANDS.length > 0) return PLANESWALKER_LANDS;
  if (style === 'vraska' && BASIC_LANDS.length > 0) return VRASKA_LANDS;
  if (style === 'edhrec' && BASIC_LANDS.length > 0) return EDHREC_LANDS;
  if (style === 'hofri' && BASIC_LANDS.length > 0) return HOFRI_LANDS;
  if (style === 'soulbond' && BASIC_LANDS.length > 0) return SOULBOND_LANDS;
  if (style === 'piles' && BASIC_LANDS.length > 0) return PILES_LANDS;
  return style === 'mana' && MANA_LANDS.length > 0 ? MANA_LANDS : LANDS;
}

/** Style pairs the multi-game tests rotate through: mirror matches and both mixed ways. */
export const STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['spells', 'spells'],
  ['creatures', 'creatures'],
  ['creatures', 'spells'],
  ['spells', 'creatures'],
  ['brawl', 'brawl'],
  ['triggers', 'triggers'],
  ['mana', 'mana'],
  ['mana', 'spells'],
  ['library', 'spells'],
];

/**
 * Style pairs of the search soak test: a mirror match and both mixed ways, so that searches and
 * discards are made by both seats, against decks that do and do not play searches themselves.
 */
export const SEARCH_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['search', 'search'],
  ['search', 'spells'],
  ['spells', 'search'],
];

/**
 * Style pairs of the activated-ability soak test: a mirror match and both mixed ways, so that
 * activations, cycling and pumps are made by both seats against decks that do and do not have them.
 */
export const ACTIVATED_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['activated', 'activated'],
  ['activated', 'spells'],
  ['spells', 'activated'],
];

/**
 * Style pairs of the attachment soak test: a mirror match and both mixed ways, so that Auras and
 * Equipment are played by both seats against decks that do and do not have them.
 */
export const ATTACHMENT_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['attachments', 'attachments'],
  ['attachments', 'spells'],
  ['spells', 'attachments'],
];

/**
 * Style pairs of the kicker and flashback soak test: a mirror match and both mixed ways, so that
 * kicked casts and flashback are made by both seats against decks that do and do not have them.
 */
export const KICKER_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['kicker', 'kicker'],
  ['kicker', 'spells'],
  ['spells', 'kicker'],
];

/**
 * Style pairs of the Food and Clue soak test: a mirror match and both mixed ways, so that tokens
 * are made, eaten and cracked by both seats against decks that do and do not make them.
 */
export const FOOD_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['food', 'food'],
  ['food', 'spells'],
  ['spells', 'food'],
];

/**
 * The layer cards twice (the spells need a creature to target, so creatures, some with abilities
 * to lose, and removal and burn that make the targets come and go).
 */
export const LAYER_SPELLS = [
  ...supported(LAYER_CARD_NAMES),
  ...supported(LAYER_CARD_NAMES),
  ...supported(['SYNTHETIC Prowess Adept', 'SYNTHETIC Prowess Adept']),
  ...supported(['Grizzly Bears', 'Grizzly Bears', 'Llanowar Elves', 'Giant Spider']),
  ...supported(['Lightning Bolt', 'Murder', 'Unsummon', 'Counterspell']),
];

/**
 * Style pairs of the layers soak test: a mirror match and both mixed ways, so that the effects are
 * cast on and against both seats' creatures.
 */
export const LAYER_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['layers', 'layers'],
  ['layers', 'spells'],
  ['spells', 'layers'],
];

/**
 * Style pairs of the ward soak test: a mirror match and both mixed ways, so that spells and abilities
 * aimed at warded creatures are paid for, or countered, by both seats.
 */
export const WARD_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['ward', 'ward'],
  ['ward', 'spells'],
  ['spells', 'ward'],
];

/**
 * Style pairs of the Vehicle soak test: a mirror match and both mixed ways, so that Vehicles are
 * crewed, attacked with and blocked with by both seats, against decks that do and do not have them.
 */
export const VEHICLE_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['vehicles', 'vehicles'],
  ['vehicles', 'spells'],
  ['spells', 'vehicles'],
];

/**
 * Style pairs of the prevention soak test: a mirror match and both mixed ways, so that shields are
 * made by both seats and by a deck that has none against one that does.
 */
export const PREVENTION_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['prevention', 'prevention'],
  ['prevention', 'prevention'],
  ['prevention', 'creatures'],
  ['creatures', 'prevention'],
  ['prevention', 'spells'],
];

/**
 * Style pairs of the layouts soak test: a mirror match and both mixed ways, so that split cards,
 * Adventures and double-faced cards are played by both seats against decks that do and do not have
 * them.
 */
export const LAYOUT_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['layouts', 'layouts'],
  ['layouts', 'spells'],
  ['spells', 'layouts'],
];

/**
 * Style pairs of the Saga soak test: a mirror match and both mixed ways, so that Sagas run through
 * their chapters for both seats, against decks that do and do not have them.
 */
export const SAGA_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['sagas', 'sagas'],
  ['sagas', 'spells'],
  ['spells', 'sagas'],
];

/**
 * Style pairs of the targeted-trigger soak test: a mirror match and both mixed ways, so that
 * triggers choose targets for both seats, against decks that do and do not have them.
 */
export const TRIGGER_TARGET_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['triggerTargets', 'triggerTargets'],
  ['triggerTargets', 'spells'],
  ['spells', 'triggerTargets'],
];

/**
 * Style pairs of the library-arranging soak test: a mirror match and both mixed ways, so that scrys,
 * surveils, reorderings and puts on top are made by both seats, against decks that do and do not
 * play them.
 */
export const LIBRARY_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['library', 'library'],
  ['library', 'spells'],
  ['spells', 'library'],
];

/**
 * Style pairs of the references soak test: a mirror match and both mixed ways, so that another
 * seat's search and a payment to keep a spell are asked of both seats.
 */
export const REFERENCE_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['references', 'references'],
  ['references', 'spells'],
  ['spells', 'references'],
];

/**
 * Style pairs of the restrictions soak test: a mirror match and both mixed ways, so that required
 * attackers, evasion, "can't block" and spells that can't be countered are met by both seats.
 */
export const RESTRICTION_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['restrictions', 'restrictions'],
  ['restrictions', 'spells'],
  ['spells', 'restrictions'],
];

/**
 * Style pairs of the costs soak test: a mirror match and both mixed ways, so that additional costs,
 * reductions and free casts are paid by both seats, against decks that do and do not have them.
 */
export const COST_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['costs', 'costs'],
  ['costs', 'spells'],
  ['spells', 'costs'],
];

/**
 * Style pairs of the more-mana soak test (D-099): a mirror match and both mixed ways, so that "could
 * produce" lands see lands of other styles and the filter, life and gated lands are used by both seats.
 */
export const MANA_PLUS_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['manaPlus', 'manaPlus'],
  ['manaPlus', 'spells'],
  ['spells', 'manaPlus'],
];

/**
 * Style pairs of the chosen-type soak test (D-100): a mirror match and both mixed ways, so that the
 * questions are asked of both seats and the lords of one seat meet the creatures of the other.
 */
export const CHOSEN_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['chosen', 'chosen'],
  ['chosen', 'spells'],
  ['spells', 'chosen'],
];

/** Style pairs of the X soak test (D-103): a mirror match and both mixed ways. */
export const X_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['x', 'x'],
  ['x', 'spells'],
  ['spells', 'x'],
];

/** Style pairs of the keyword batch soak test (D-110): a mirror match and both mixed ways. */
export const KEYWORD_BATCH_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['keywordBatch', 'keywordBatch'],
  ['keywordBatch', 'spells'],
  ['spells', 'keywordBatch'],
];

/** Style pairs of the keyword batch 2 soak test (D-120): a mirror match and both mixed ways. */
export const KEYWORD2_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['keywordBatch2', 'keywordBatch2'],
  ['keywordBatch2', 'spells'],
  ['spells', 'keywordBatch2'],
];

/** Style pairs of the trigger slice soak test (D-111): a mirror match and both mixed ways. */
export const TRIGGER_SLICE_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['triggerSlice', 'triggerSlice'],
  ['triggerSlice', 'spells'],
  ['spells', 'triggerSlice'],
];

/**
 * Style pairs of the counted power and toughness soak test (D-115): a mirror match and both mixed ways, so
 * that the counted bodies and pumps meet decks that have them and decks that do not.
 */
export const PT_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['pt', 'pt'],
  ['pt', 'spells'],
  ['spells', 'pt'],
];

/** Style pairs of the modal soak test (D-114): a mirror match and both mixed ways. */
export const MODAL_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['modal', 'modal'],
  ['modal', 'spells'],
  ['spells', 'modal'],
];

/**
 * Style pairs of the alternative-cost soak test (D-121): a mirror match and both mixed ways, so that the
 * alternatives are chosen by both seats against decks that do and do not have them.
 */
export const ALT_COST_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['altCosts', 'altCosts'],
  ['altCosts', 'spells'],
  ['spells', 'altCosts'],
];

/** Style pairs of the play-rule soak test (D-125): a mirror match and both mixed ways. */
export const PLAY_RULE_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['playRules', 'playRules'],
  ['playRules', 'spells'],
  ['spells', 'playRules'],
];

/** Style pairs of the upkeep soak test (D-127): a mirror match and both mixed ways. */
export const UPKEEP_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['upkeep', 'upkeep'],
  ['upkeep', 'spells'],
  ['spells', 'upkeep'],
];

/** Style pairs of the cast-later soak test (D-128): a mirror match and both mixed ways. */
export const LATER_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['later', 'later'],
  ['later', 'spells'],
  ['spells', 'later'],
];

/** Style pairs of the miracle soak test (D-274): a mirror match and both mixed ways. */
export const MIRACLE_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['miracle', 'miracle'],
  ['miracle', 'spells'],
  ['spells', 'miracle'],
];

/** Style pairs of the copies soak test (D-129): a mirror match and both mixed ways. */
export const COPY_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['copies', 'copies'],
  ['copies', 'spells'],
  ['spells', 'copies'],
];

/** Style pairs of the subjects soak test (D-133): a mirror match and both mixed ways. */
export const SUBJECT_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['subjects', 'subjects'],
  ['subjects', 'spells'],
  ['spells', 'subjects'],
];

/** Style pairs of the recursion soak test (D-135): a mirror match and both mixed ways. */
export const RECURSION_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['recursion', 'recursion'],
  ['recursion', 'spells'],
  ['spells', 'recursion'],
];

/** Style pairs of the Artifacts slice soak test (D-139): a mirror match and both mixed ways. */
export const ARTIFACT_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['artifacts', 'artifacts'],
  ['artifacts', 'spells'],
  ['spells', 'artifacts'],
];

/** Style pairs of the Dinosaurs slice soak test (D-145): a mirror match and both mixed ways. */
export const DINOSAUR_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['dinosaurs', 'dinosaurs'],
  ['dinosaurs', 'spells'],
  ['spells', 'dinosaurs'],
];

/** Style pairs of the Angels slice soak test (D-149): a mirror match and both mixed ways. */
export const ANGEL_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['angels', 'angels'],
  ['angels', 'spells'],
  ['spells', 'angels'],
];

/** Style pairs of the Dragons slice soak test (D-151): a mirror match and both mixed ways. */
export const DRAGON_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['dragons', 'dragons'],
  ['dragons', 'spells'],
  ['spells', 'dragons'],
];

/** Style pairs of the Korvold slice 6 soak test (D-185): a mirror match and both mixed ways. */
export const KORVOLD_KEYWORD_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['korvoldKeywords', 'korvoldKeywords'],
  ['korvoldKeywords', 'spells'],
  ['spells', 'korvoldKeywords'],
];

/** Style pairs of the Vraska program soak test (D-210): a mirror match and both mixed ways. */
export const VRASKA_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['vraska', 'vraska'],
  ['vraska', 'spells'],
  ['spells', 'vraska'],
];

/** Style pairs of the Vraska EDHREC program soak test (D-216 to D-220): a mirror match and both mixed ways. */
export const EDHREC_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['edhrec', 'edhrec'],
  ['edhrec', 'spells'],
  ['spells', 'edhrec'],
];

/** Style pairs of the Korvold slice 7a soak test (D-187): a mirror match and both mixed ways. */
export const KORVOLD_SINGLE_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['korvoldSingles', 'korvoldSingles'],
  ['korvoldSingles', 'spells'],
  ['spells', 'korvoldSingles'],
];

/** Style pairs of the Korvold slice 8a soak test (D-189): a mirror match and both mixed ways. */
export const KORVOLD_CONTROL_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['korvoldControl', 'korvoldControl'],
  ['korvoldControl', 'spells'],
  ['spells', 'korvoldControl'],
];

/** Style pairs of the damage redirection soak test (D-192): a mirror match and both mixed ways. */
export const ADAMANTOISE_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['adamantoise', 'adamantoise'],
  ['adamantoise', 'spells'],
  ['spells', 'adamantoise'],
];

/** Style pairs of the voting soak test (D-194): a mirror match and both mixed ways. */
export const VOTE_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['vote', 'vote'],
  ['vote', 'spells'],
  ['spells', 'vote'],
];

/** Style pairs of the Ring soak test (D-196): a mirror match and both mixed ways. */
export const RING_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['ring', 'ring'],
  ['ring', 'spells'],
  ['spells', 'ring'],
];

/** Style pairs of the soulbond soak test (D-286): a mirror match and both mixed ways. */
export const SOULBOND_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['soulbond', 'soulbond'],
  ['soulbond', 'spells'],
  ['spells', 'soulbond'],
];

/** Style pairs of the piles soak test (D-971): a mirror match and both mixed ways. */
export const PILES_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['piles', 'piles'],
  ['piles', 'spells'],
  ['spells', 'piles'],
];

/** Style pairs of the Hofri soak test (D-229 to D-235): a mirror match and both mixed ways. */
export const HOFRI_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['hofri', 'hofri'],
  ['hofri', 'spells'],
  ['spells', 'hofri'],
];

/** Style pairs of the planeswalker soak test (D-203): a mirror match and both mixed ways. */
export const PLANESWALKER_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['planeswalkers', 'planeswalkers'],
  ['planeswalkers', 'spells'],
  ['spells', 'planeswalkers'],
];

/** Style pairs of the amounts soak test (D-131): a mirror match and both mixed ways. */
export const AMOUNT_STYLE_PAIRS: readonly (readonly [DeckStyle, DeckStyle])[] = [
  ['amounts', 'amounts'],
  ['amounts', 'spells'],
  ['spells', 'amounts'],
];

export const stylesFor = (game: number): readonly [DeckStyle, DeckStyle] =>
  STYLE_PAIRS[game % STYLE_PAIRS.length] ?? ['spells', 'spells'];

/** Commander plus 20 to 24 other cards: 8 to 11 lands, the rest spells, repeated freely. */
export function smallDeck(deckSeed: number, style: DeckStyle = 'spells'): DeckConfig {
  const roll = lcg(deckSeed * 2654435761 + 12345);
  const commander = COMMANDERS[roll(COMMANDERS.length)] ?? COMMANDERS[0];
  const total = 20 + roll(5);
  const landCount = 8 + roll(4);
  const counts = new Map<string, number>();
  const add = (name: string) => counts.set(name, (counts.get(name) ?? 0) + 1);
  const lands = landSlots(style);
  for (let i = 0; i < landCount; i += 1) add(lands[roll(lands.length)] ?? 'Plains');
  const slots = spellSlots(style);
  for (let i = landCount; i < total; i += 1) add(slots[roll(slots.length)] ?? 'Divination');
  const entries: [string, number][] = [[commander, 1], ...counts];
  return { cards: deckOf(entries), commanders: [0] };
}

export function smallGameConfig(
  seed: number,
  styles: readonly [DeckStyle, DeckStyle] = ['spells', 'spells'],
): GameConfig {
  return { seed, decks: [smallDeck(seed * 2 + 1, styles[0]), smallDeck(seed * 2 + 2, styles[1])] };
}

export const CTX: DecideContext = { budgetMs: 1000, now: () => 0 };

export interface StepInfo {
  readonly index: number;
  readonly before: GameState;
  readonly seat: number;
  readonly action: Action;
  readonly after: GameState;
  /** The events the engine emitted for this action. */
  readonly events: readonly GameEvent[];
}

/**
 * Plays a game with the agents one action at a time, calling `onStep` after every applied action.
 * Throws on an engine rejection (the property tests expect none). Returns the final state.
 */
export async function stepGame(
  config: GameConfig,
  agents: readonly [Agent, Agent],
  limits: { maxTurns: number; maxActions: number },
  onStep?: (step: StepInfo) => void,
  start?: GameState,
): Promise<{ state: GameState; actions: number; capped: boolean }> {
  let state = start ?? createGame(config).state;
  let actions = 0;
  while (state.result === null) {
    if (state.turn.number > limits.maxTurns || actions >= limits.maxActions) {
      return { state, actions, capped: true };
    }
    const pending = state.pending;
    if (pending === null) throw new Error('a running game has no pending decision');
    const view = getView(state, pending.seat);
    if (view.pending === null) throw new Error('the deciding seat does not see its decision');
    const agent = agents[pending.seat];
    if (agent === undefined) throw new Error(`no agent for seat ${pending.seat}`);
    const action = await agent.decide(view, view.pending, CTX);
    const r = applyAction(state, pending.seat, action);
    if (!r.ok) {
      throw new Error(
        `rejected ${JSON.stringify(action)}: ${r.error} (asked ${JSON.stringify(view.pending)})`,
      );
    }
    onStep?.({
      index: actions,
      before: state,
      seat: pending.seat,
      action,
      after: r.state,
      events: r.events,
    });
    state = r.state;
    actions += 1;
  }
  return { state, actions, capped: false };
}

/** A deck described as plain lists, the shape the fast-check arbitraries generate and shrink. */
export interface DeckMix {
  readonly commander: string;
  readonly lands: readonly string[];
  readonly spells: readonly string[];
}

export function deckFromMix(mix: DeckMix): DeckConfig {
  const counts = new Map<string, number>();
  for (const name of [...mix.lands, ...mix.spells]) counts.set(name, (counts.get(name) ?? 0) + 1);
  return { cards: deckOf([[mix.commander, 1], ...counts]), commanders: [0] };
}

// ---- Independent checks of combat answers (not the engine's own validators)

const sameRecipient = (a: DamageRecipient, b: DamageRecipient) =>
  a.kind === 'player'
    ? b.kind === 'player' && a.seat === b.seat
    : b.kind === 'object' && a.id === b.id;

/**
 * Why `action` is not a legal answer to a combat `decision`, written from CR 508.1, 509.1b,
 * 702.111b (menace), 510.1 and 702.19b (trample) and the decision's own data. An empty list means
 * the answer is legal. Used on hand-built decisions and on decisions from real games alike.
 */
export function combatAnswerErrors(decision: PendingDecision, action: Action): string[] {
  const errors: string[] = [];
  if (decision.kind === 'declareAttackers') {
    if (action.kind !== 'declareAttackers') return [`answered with ${action.kind}`];
    const seen = new Set<string>();
    for (const { attacker, target } of action.attacks) {
      const candidate = decision.candidates.find((c) => c.attacker === attacker);
      if (candidate === undefined) errors.push(`${attacker} is not a candidate attacker`);
      else if (!candidate.targets.some((t) => JSON.stringify(t) === JSON.stringify(target)))
        errors.push(`${attacker} cannot attack ${JSON.stringify(target)}`);
      if (seen.has(attacker)) errors.push(`${attacker} attacks twice`);
      seen.add(attacker);
    }
    // CR 508.1d: "attacks each combat if able": the decision lists the creatures that must be declared (`mustAttack`); a declaration that leaves one out is not legal.
    for (const required of decision.mustAttack) {
      if (!seen.has(required)) errors.push(`${required} must attack`);
    }
  } else if (decision.kind === 'declareBlockers') {
    if (action.kind !== 'declareBlockers') return [`answered with ${action.kind}`];
    const seen = new Set<string>();
    const per = new Map<string, number>();
    for (const { blocker, attacker } of action.blocks) {
      const candidate = decision.candidates.find((c) => c.blocker === blocker);
      if (candidate === undefined) errors.push(`${blocker} is not a candidate blocker`);
      else if (!candidate.canBlock.includes(attacker))
        errors.push(`${blocker} cannot block ${attacker}`);
      if (seen.has(blocker)) errors.push(`${blocker} blocks twice`);
      seen.add(blocker);
      per.set(attacker, (per.get(attacker) ?? 0) + 1);
    }
    for (const [attacker, count] of per) {
      const need = decision.attackers.find((a) => a.attacker === attacker)?.minBlockers;
      if (need === undefined) errors.push(`${attacker} is not attacking`);
      else if (count < need) errors.push(`${attacker} needs ${need} blockers, got ${count}`);
    }
  } else if (decision.kind === 'assignDamage') {
    if (action.kind !== 'assignDamage') return [`answered with ${action.kind}`];
    for (const a of action.assignments) {
      if (!decision.choices.some((c) => c.source === a.source))
        errors.push(`${a.source} has no damage choice`);
      if (!Number.isInteger(a.amount) || a.amount < 0) errors.push(`amount ${a.amount}`);
    }
    for (const choice of decision.choices) {
      const mine = action.assignments.filter((a) => a.source === choice.source);
      const total = mine.reduce((sum, a) => sum + a.amount, 0);
      if (total !== choice.power)
        errors.push(`${choice.source}: ${total} assigned of ${choice.power}`);
      const toBlocker = new Map<string, number>();
      let excess = 0;
      for (const a of mine) {
        const to = a.to;
        const isBlocker = to.kind === 'object' && choice.blockers.some((b) => b.object === to.id);
        if (to.kind === 'object' && isBlocker) {
          toBlocker.set(to.id, (toBlocker.get(to.id) ?? 0) + a.amount);
        } else if (
          choice.trample &&
          choice.tramplesOver !== null &&
          sameRecipient(a.to, choice.tramplesOver)
        ) {
          excess += a.amount;
        } else if (a.amount > 0) {
          errors.push(
            `${choice.source} sends ${a.amount} to ${JSON.stringify(a.to)}, not a blocker`,
          );
        }
      }
      // CR 702.19b: lethal damage to every blocker before any goes past them.
      if (excess > 0 && !choice.blockers.every((b) => (toBlocker.get(b.object) ?? 0) >= b.lethal))
        errors.push(`${choice.source} tramples over before every blocker has lethal damage`);
    }
  } else {
    errors.push(`${decision.kind} is not a combat decision`);
  }
  return errors;
}

// ---- Combat tally: what combat a game actually contained

/** Counts of combat events in one game, noted from the decisions agents answered. */
export interface CombatTally {
  /** declareAttackers answers that declared at least one attacker. */
  attacks: number;
  /** declareBlockers answers that declared at least one block. */
  blocks: number;
  assignDamageDecisions: number;
  /** assignDamage decisions in the first-strike damage step (CR 510.4). */
  firstStrikeDamageDecisions: number;
  /** Decisions made while the turn was in the first-strike combat damage step. */
  firstStrikeSteps: number;
  /** assignDamage choices where the attacker has trample, deathtouch, or several blockers. */
  trampleChoices: number;
  deathtouchChoices: number;
  multiBlockChoices: number;
  /** declareAttackers answers with an attacker that has the keyword (from the view). */
  trampleAttackers: number;
  firstStrikeAttackers: number;
  flyingAttackers: number;
  /** declareBlockers decisions that offered an attacker needing two blockers (menace). */
  menaceBlockDecisions: number;
  /** Attacks aimed at a planeswalker or battle. */
  permanentAttacks: number;
  /** Combat answers that were a concession. */
  concedes: number;
}

export const newTally = (): CombatTally => ({
  attacks: 0,
  blocks: 0,
  assignDamageDecisions: 0,
  firstStrikeDamageDecisions: 0,
  firstStrikeSteps: 0,
  trampleChoices: 0,
  deathtouchChoices: 0,
  multiBlockChoices: 0,
  trampleAttackers: 0,
  firstStrikeAttackers: 0,
  flyingAttackers: 0,
  menaceBlockDecisions: 0,
  permanentAttacks: 0,
  concedes: 0,
});

/** Notes one answered decision in `tally`. `view` is what the deciding seat saw. */
export function noteDecision(
  tally: CombatTally,
  view: GameView,
  decision: PendingDecision,
  action: Action,
): void {
  if (view.step === 'firstStrikeDamage') tally.firstStrikeSteps += 1;
  const keywordsOf = (id: string) => view.battlefield.find((o) => o.id === id)?.keywords ?? [];
  if (decision.kind === 'declareAttackers' && action.kind === 'declareAttackers') {
    if (action.attacks.length > 0) tally.attacks += 1;
    for (const { attacker, target } of action.attacks) {
      const keywords = keywordsOf(attacker);
      if (keywords.includes('trample')) tally.trampleAttackers += 1;
      if (keywords.includes('firstStrike') || keywords.includes('doubleStrike'))
        tally.firstStrikeAttackers += 1;
      if (keywords.includes('flying')) tally.flyingAttackers += 1;
      if (target.kind === 'permanent') tally.permanentAttacks += 1;
    }
  } else if (decision.kind === 'declareBlockers' && action.kind === 'declareBlockers') {
    if (action.blocks.length > 0) tally.blocks += 1;
    if (decision.attackers.some((a) => a.minBlockers > 1)) tally.menaceBlockDecisions += 1;
  } else if (decision.kind === 'assignDamage') {
    tally.assignDamageDecisions += 1;
    if (decision.step === 'firstStrike') tally.firstStrikeDamageDecisions += 1;
    for (const c of decision.choices) {
      if (c.trample) tally.trampleChoices += 1;
      if (c.deathtouch) tally.deathtouchChoices += 1;
      if (c.blockers.length > 1) tally.multiBlockChoices += 1;
    }
  }
  const combatKind = ['declareAttackers', 'declareBlockers', 'assignDamage'].includes(
    decision.kind,
  );
  if (combatKind && action.kind === 'concede') tally.concedes += 1;
}

/** Sums tallies, for a whole test. */
export function addTally(total: CombatTally, part: CombatTally): void {
  for (const key of Object.keys(total) as (keyof CombatTally)[]) total[key] += part[key];
}
