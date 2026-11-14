/**
 * SYNTHETIC CARDS FOR FILTERED SUBJECTS, LORDS, CREATURE COSTS AND ZOMBIE-STYLE REPLACEMENTS. NOT REAL MAGIC CARDS.
 *
 * Invented for the tests and the soak games of D-133: static "lord" abilities over a filter ("Other Zombie creatures
 * get +1/+1", "Skeletons you control and other Zombies you control get +1/+1 and have deathtouch"), grants until end
 * of turn to a filter ("All Zombies gain menace until end of turn"), triggers whose subject is a filtered creature
 * (nontoken, subtype, controller, "another"), conditional statics, costs that tap or sacrifice other permanents, a
 * replacement for dying and casting a card from the graveyard. Names start with "SYNTHETIC "; oracleId is null. The
 * text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type {
  Ability,
  Condition,
  Cost,
  Effect,
  ObjectFilter,
  TargetSpec,
  Trigger,
} from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';
import { ZOMBIE_TOKEN } from './synthetic-amounts';

const END = 'untilEndOfTurn' as const;
const THIS = { kind: 'this' } as const;

const ZOMBIES: ObjectFilter = { types: ['creature'], subtypes: ['Zombie'] };

const mana = (...symbols: string[]): Cost => ({ kind: 'mana', symbols });

const spell = (
  name: string,
  manaCost: string[],
  oracleText: string,
  effect: Effect,
  type: 'instant' | 'sorcery' = 'sorcery',
): CardDefinition =>
  singleFace({
    name,
    manaCost,
    types: [type],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText,
    spell: { effect },
  });

/** A creature with the given subtype and no text of its own beyond `abilities`. */
function creature(
  name: string,
  subtypes: string[],
  power: number,
  toughness: number,
  oracleText: string,
  abilities: Ability[] = [],
): CardDefinition {
  return singleFace({
    name,
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes,
    colors: ['B'],
    colorIdentity: ['B'],
    power,
    toughness,
    oracleText,
    abilities,
  });
}

const YOU = { kind: 'you' } as const;
const TRIGGER_PLAYER = { kind: 'triggerPlayer' } as const;
const SUBJECT = { kind: 'triggerSubject' } as const;
const ZOMBIE_YOU_NONTOKEN: ObjectFilter = {
  types: ['creature'],
  subtypes: ['Zombie'],
  controller: 'you',
  token: false,
};

/** An enchantment with one triggered ability. */
function watcher(
  name: string,
  oracleText: string,
  trigger: Trigger,
  effect: Effect,
  targets?: TargetSpec[],
  interveningIf?: Extract<Ability, { kind: 'triggered' }>['interveningIf'],
): CardDefinition {
  return singleFace({
    name,
    manaCost: ['2', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText,
    abilities: [
      {
        kind: 'triggered',
        trigger,
        effect,
        ...(targets === undefined ? {} : { targets }),
        ...(interveningIf === undefined ? {} : { interveningIf }),
      },
    ],
  });
}

const YOUR_COMMANDER: Condition = { kind: 'controlCommander', yours: true };
const THIS_SUBJECT = { kind: 'this' } as const;

const zombieToken = (tapped = false): Effect => ({
  kind: 'createToken',
  token: { kind: 'custom', definition: ZOMBIE_TOKEN },
  count: 1,
  ...(tapped ? { tapped: true as const } : {}),
});

export const SYNTHETIC_SUBJECT_LIST: readonly CardDefinition[] = [
  // ---- Triggers whose subject is a filtered creature (D-133)
  // "Whenever a creature attacks you or a planeswalker you control, that creature's controller loses 1 life."
  watcher(
    'SYNTHETIC Decree Stone',
    "Whenever a creature attacks you or a planeswalker you control, that creature's controller loses 1 life.",
    { kind: 'attacks', what: { types: ['creature'] }, at: 'youOrPlaneswalkers' },
    { kind: 'loseLife', player: { kind: 'controllerOf', of: SUBJECT }, amount: 1 },
  ),
  // "Whenever a creature attacks you, you gain 1 life."
  watcher(
    'SYNTHETIC Wary Sentinel',
    'Whenever a creature attacks you, you gain 1 life.',
    { kind: 'attacks', what: { types: ['creature'] }, at: 'you' },
    { kind: 'gainLife', player: YOU, amount: 1 },
  ),
  // "Whenever a nontoken creature you control dies, create a 2/2 black Zombie creature token."
  watcher(
    'SYNTHETIC Open Graves',
    'Whenever a nontoken creature you control dies, create a 2/2 black Zombie creature token.',
    { kind: 'dies', what: { types: ['creature'], controller: 'you', token: false } },
    zombieToken(),
  ),
  // "Whenever a nontoken creature you control dies, ~ deals 1 damage to you and you draw a card."
  watcher(
    'SYNTHETIC Midnight Cousin',
    'Whenever a nontoken creature you control dies, ~ deals 1 damage to you and you draw a card.',
    { kind: 'dies', what: { types: ['creature'], controller: 'you', token: false } },
    {
      kind: 'sequence',
      effects: [
        { kind: 'dealDamage', amount: 1, to: YOU },
        { kind: 'draw', player: YOU, count: 1 },
      ],
    },
  ),
  // "Whenever ~ or another nontoken Zombie you control dies, create a 2/2 black Zombie creature token."
  creature(
    'SYNTHETIC Grave Rider',
    ['Zombie', 'Knight'],
    3,
    3,
    'Whenever ~ or another nontoken Zombie you control dies, create a 2/2 black Zombie creature token.',
    [
      { kind: 'triggered', trigger: { kind: 'dies', what: THIS }, effect: zombieToken() },
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { ...ZOMBIE_YOU_NONTOKEN, other: true } },
        effect: zombieToken(),
      },
    ],
  ),
  // "Whenever another nontoken Zombie you control enters, you gain 1 life."
  watcher(
    'SYNTHETIC Welcome Wagon',
    'Whenever another nontoken Zombie you control enters, you gain 1 life.',
    { kind: 'entersBattlefield', what: ZOMBIE_YOU_NONTOKEN },
    { kind: 'gainLife', player: YOU, amount: 1 },
  ),
  // "Whenever another nontoken creature you control enters, put a +1/+1 counter on it. It gains haste until end of turn."
  creature(
    'SYNTHETIC Goreclaw Cousin',
    ['Beast'],
    3,
    3,
    'Whenever another nontoken creature you control enters, put a +1/+1 counter on it. It gains haste until end of turn.',
    [
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { types: ['creature'], controller: 'you', token: false, other: true },
        },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'addCounters', objects: SUBJECT, counter: '+1/+1', count: 1 },
            { kind: 'grantKeyword', objects: SUBJECT, keyword: { kind: 'haste' }, duration: END },
          ],
        },
      },
    ],
  ),
  // "Whenever a creature you control with flying enters, it gains haste until end of turn."
  watcher(
    'SYNTHETIC Gale Tempest',
    'Whenever a creature you control with flying enters, it gains haste until end of turn.',
    {
      kind: 'entersBattlefield',
      what: { types: ['creature'], controller: 'you', keywords: ['flying'] },
    },
    { kind: 'grantKeyword', objects: SUBJECT, keyword: { kind: 'haste' }, duration: END },
  ),
  // "Whenever a nontoken creature you control blocks, you gain 1 life."
  watcher(
    'SYNTHETIC Sentry Chant',
    'Whenever a nontoken creature you control blocks, you gain 1 life.',
    { kind: 'blocks', what: { types: ['creature'], controller: 'you', token: false } },
    { kind: 'gainLife', player: YOU, amount: 1 },
  ),
  // "Whenever a nontoken creature you control leaves the battlefield, you gain 1 life."
  watcher(
    'SYNTHETIC Farewell Bell',
    'Whenever a nontoken creature you control leaves the battlefield, you gain 1 life.',
    { kind: 'leavesBattlefield', what: { types: ['creature'], controller: 'you', token: false } },
    { kind: 'gainLife', player: YOU, amount: 1 },
  ),
  // "Whenever you cast a noncreature or Zombie spell, ~ deals 1 damage to each opponent."
  watcher(
    'SYNTHETIC Spitfire Whelp',
    'Whenever you cast a noncreature or Zombie spell, ~ deals 1 damage to each opponent.',
    {
      kind: 'castSpell',
      by: 'you',
      filter: { stackKind: 'spell', anyOf: [{ notTypes: ['creature'] }, { subtypes: ['Zombie'] }] },
    },
    { kind: 'dealDamage', amount: 1, to: { kind: 'eachOpponent' } },
  ),
  // "Whenever a nontoken Zombie deals combat damage to a player, you draw a card."
  watcher(
    'SYNTHETIC Zombie Tithe',
    'Whenever a nontoken Zombie deals combat damage to a player, you draw a card.',
    {
      kind: 'dealsCombatDamage',
      what: { types: ['creature'], subtypes: ['Zombie'], token: false },
      to: 'player',
    },
    { kind: 'draw', player: YOU, count: 1 },
  ),
  // "Whenever ~ deals combat damage to a player, that player discards a card and you create a tapped 2/2 black Zombie creature token."
  creature(
    'SYNTHETIC Reaver Cousin',
    ['Zombie'],
    3,
    3,
    'Whenever ~ deals combat damage to a player, that player discards a card and you create a tapped 2/2 black Zombie creature token.',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'dealsCombatDamage', what: THIS, to: 'player' },
        effect: {
          kind: 'sequence',
          effects: [{ kind: 'discard', player: TRIGGER_PLAYER, count: 1 }, zombieToken(true)],
        },
      },
    ],
  ),
  // "Whenever an opponent draws a card, that player loses 1 life."
  watcher(
    'SYNTHETIC Crawler Cousin',
    'Whenever an opponent draws a card, that player loses 1 life.',
    { kind: 'drawn', who: 'opponent' },
    { kind: 'loseLife', player: TRIGGER_PLAYER, amount: 1 },
  ),
  // "Whenever an opponent casts a spell, that player loses 1 life."
  watcher(
    'SYNTHETIC Toll Totem',
    'Whenever an opponent casts a spell, that player loses 1 life.',
    { kind: 'castSpell', by: 'opponent', filter: { stackKind: 'spell' } },
    { kind: 'loseLife', player: TRIGGER_PLAYER, amount: 1 },
  ),
  // "Whenever a Zombie you control becomes the target of a spell or ability an opponent controls, ~ deals 3 damage to that player."
  watcher(
    'SYNTHETIC Regent Cousin',
    'Whenever a Zombie you control becomes the target of a spell or ability an opponent controls, ~ deals 3 damage to that player.',
    {
      kind: 'becomesTarget',
      what: { types: ['creature'], subtypes: ['Zombie'], controller: 'you' },
      by: 'opponent',
    },
    { kind: 'dealDamage', amount: 3, to: TRIGGER_PLAYER },
  ),
  // "Whenever ~ is dealt damage, draw a card."
  creature(
    'SYNTHETIC Spiteful Raptor',
    ['Dinosaur'],
    3,
    3,
    'Whenever ~ is dealt damage, draw a card.',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'dealtDamage', what: THIS },
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  ),
  // "Whenever ~ is dealt damage, you gain that much life."
  creature(
    'SYNTHETIC Soulful Seraph',
    ['Angel'],
    3,
    6,
    'Whenever ~ is dealt damage, you gain that much life.',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'dealtDamage', what: THIS },
        effect: { kind: 'gainLife', player: YOU, amount: { kind: 'triggerDamage' } },
      },
    ],
  ),
  // "Whenever a creature you control is dealt combat damage, you gain 1 life."
  watcher(
    'SYNTHETIC Scar Ledger',
    'Whenever a creature you control is dealt combat damage, you gain 1 life.',
    { kind: 'dealtDamage', what: { types: ['creature'], controller: 'you' }, combat: true },
    { kind: 'gainLife', player: YOU, amount: 1 },
  ),
  // ---- Filter parts: nontoken, token, "non-Zombie", colorless, with and without a keyword (D-133)
  // "Nontoken creatures you control get +1/+1 and have vigilance."
  creature(
    'SYNTHETIC Vigil Captain',
    ['Human'],
    2,
    2,
    'Nontoken creatures you control get +1/+1 and have vigilance.',
    [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', token: false },
          },
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', token: false },
          },
          keyword: { kind: 'vigilance' },
        },
      },
    ],
  ),
  // "Other nontoken creatures you control get +1/+1."
  creature(
    'SYNTHETIC Muster Sergeant',
    ['Human'],
    2,
    2,
    'Other nontoken creatures you control get +1/+1.',
    [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', token: false, other: true },
          },
          power: 1,
          toughness: 1,
        },
      },
    ],
  ),
  // "Creature tokens you control get +1/+1."
  creature('SYNTHETIC Token Herald', ['Human'], 1, 1, 'Creature tokens you control get +1/+1.', [
    {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: {
          kind: 'filter',
          filter: { types: ['creature'], controller: 'you', token: true },
        },
        power: 1,
        toughness: 1,
      },
    },
  ]),
  // "Create a 2/2 black Zombie creature token."
  spell('SYNTHETIC Raise Zombie', ['1', 'B'], 'Create a 2/2 black Zombie creature token.', {
    kind: 'createToken',
    token: { kind: 'custom', definition: ZOMBIE_TOKEN },
    count: 1,
  }),
  // "All non-Zombie creatures get -1/-1 until end of turn."
  spell(
    'SYNTHETIC Mass Decay',
    ['1', 'B'],
    'All non-Zombie creatures get -1/-1 until end of turn.',
    {
      kind: 'modifyPt',
      objects: { kind: 'each', filter: { types: ['creature'], notSubtypes: ['Zombie'] } },
      power: -1,
      toughness: -1,
      duration: END,
    },
  ),
  singleFace({
    name: 'SYNTHETIC Plain Golem',
    manaCost: ['2'],
    types: ['artifact', 'creature'],
    subtypes: ['Golem'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
  // "Colorless creatures you control get +1/+1."
  creature(
    'SYNTHETIC Colorless Banner',
    ['Human'],
    1,
    1,
    'Colorless creatures you control get +1/+1.',
    [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', colorless: true },
          },
          power: 1,
          toughness: 1,
        },
      },
    ],
  ),
  // "Creatures with flying get -2/-0 until end of turn." and "Creatures without flying get +1/+1 until end of turn."
  spell('SYNTHETIC Clip Wings', ['1', 'B'], 'Creatures with flying get -2/-0 until end of turn.', {
    kind: 'modifyPt',
    objects: { kind: 'each', filter: { types: ['creature'], keywords: ['flying'] } },
    power: -2,
    toughness: 0,
    duration: END,
  }),
  spell(
    'SYNTHETIC Pin Sentinels',
    ['1', 'B'],
    'Creatures with flying and vigilance get -2/-0 until end of turn.',
    {
      kind: 'modifyPt',
      objects: {
        kind: 'each',
        filter: { types: ['creature'], keywords: ['flying', 'vigilance'] },
      },
      power: -2,
      toughness: 0,
      duration: END,
    },
  ),
  spell(
    'SYNTHETIC Ground Pound',
    ['1', 'B'],
    'Creatures without flying get +1/+1 until end of turn.',
    {
      kind: 'modifyPt',
      objects: { kind: 'each', filter: { types: ['creature'], notKeywords: ['flying'] } },
      power: 1,
      toughness: 1,
      duration: END,
    },
  ),
  // ---- Conditional statics: "as long as ..." (D-133)
  // "As long as you control your commander, ~ gets +2/+2 and creatures you control have vigilance."
  creature(
    'SYNTHETIC Field Marshal',
    ['Angel'],
    4,
    4,
    'As long as you control your commander, ~ gets +2/+2 and creatures you control have vigilance.',
    [
      {
        kind: 'static',
        condition: YOUR_COMMANDER,
        static: { kind: 'modifyPt', subject: THIS_SUBJECT, power: 2, toughness: 2 },
      },
      {
        kind: 'static',
        condition: YOUR_COMMANDER,
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'vigilance' },
        },
      },
    ],
  ),
  // "As long as you have at least 7 life more than your starting life total, creatures you control get +2/+2."
  creature(
    'SYNTHETIC Prime Valkyrie',
    ['Angel'],
    2,
    2,
    'As long as you have at least 7 life more than your starting life total, creatures you control get +2/+2.',
    [
      {
        kind: 'static',
        condition: {
          kind: 'lifeTotal',
          compare: { cmp: 'atLeast', value: 7 },
          aboveStarting: true,
        },
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          power: 2,
          toughness: 2,
        },
      },
    ],
  ),
  // "~ gets +3/+3 as long as you have 30 or more life."
  creature(
    'SYNTHETIC Hale Brute',
    ['Human'],
    2,
    2,
    '~ gets +3/+3 as long as you have 30 or more life.',
    [
      {
        kind: 'static',
        condition: { kind: 'lifeTotal', compare: { cmp: 'atLeast', value: 30 } },
        static: { kind: 'modifyPt', subject: THIS_SUBJECT, power: 3, toughness: 3 },
      },
    ],
  ),
  // "{T}: Add {G}." and "~ has hexproof as long as it's untapped."
  singleFace({
    name: 'SYNTHETIC Shade Druid',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Elf', 'Druid'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 1,
    toughness: 1,
    oracleText: "{T}: Add {G}. ~ has hexproof as long as it's untapped.",
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['G'] } },
      {
        kind: 'static',
        condition: { kind: 'thisMatches', filter: { tapped: false } },
        static: { kind: 'grantKeyword', subject: THIS_SUBJECT, keyword: { kind: 'hexproof' } },
      },
    ],
  }),
  // "As long as you control three or more artifacts, ~ has hexproof."
  creature(
    'SYNTHETIC Artifact Adept',
    ['Artificer'],
    2,
    2,
    'As long as you control three or more artifacts, ~ has hexproof.',
    [
      {
        kind: 'static',
        condition: { kind: 'controlsAtLeast', filter: { types: ['artifact'] }, count: 3 },
        static: { kind: 'grantKeyword', subject: THIS_SUBJECT, keyword: { kind: 'hexproof' } },
      },
    ],
  ),
  // "As long as you control another Zombie, ~ gets +1/+1." (it counts Zombies, itself a Zombie)
  creature(
    'SYNTHETIC Zombie Pact',
    ['Zombie'],
    2,
    2,
    'As long as you control another Zombie, ~ gets +1/+1.',
    [
      {
        kind: 'static',
        condition: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], subtypes: ['Zombie'], other: true },
          count: 1,
        },
        static: { kind: 'modifyPt', subject: THIS_SUBJECT, power: 1, toughness: 1 },
      },
    ],
  ),
  // "~ can't block unless you control another creature."
  creature(
    'SYNTHETIC Lone Guard',
    ['Human'],
    3,
    3,
    "~ can't block unless you control another creature.",
    [
      {
        kind: 'static',
        condition: {
          kind: 'not',
          term: { kind: 'controlsAtLeast', filter: { types: ['creature'], other: true }, count: 1 },
        },
        static: { kind: 'restriction', subject: THIS_SUBJECT, restriction: 'cantBlock' },
      },
    ],
  ),
  // "As long as you're the monarch, creatures you control get +1/+1."
  creature(
    'SYNTHETIC Crown Banner',
    ['Human'],
    1,
    1,
    "As long as you're the monarch, creatures you control get +1/+1.",
    [
      {
        kind: 'static',
        condition: { kind: 'playerHasDesignation', player: YOU, designation: 'monarch' },
        static: {
          kind: 'modifyPt',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          power: 1,
          toughness: 1,
        },
      },
    ],
  ),
  // "{T}: Create a 2/2 black Zombie creature token. Activate only if you have at least 7 life more than your
  // starting life total and only as a sorcery."
  creature(
    'SYNTHETIC Radiant Tapper',
    ['Angel'],
    2,
    2,
    '{T}: Create a 2/2 black Zombie creature token. Activate only if you have at least 7 life more than your starting life total and only as a sorcery.',
    [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: zombieToken(),
        timing: 'sorcery',
        activateOnlyIf: {
          kind: 'lifeTotal',
          compare: { cmp: 'atLeast', value: 7 },
          aboveStarting: true,
        },
      },
    ],
  ),
  // ---- Costs that tap or sacrifice other permanents (D-133)
  // "Tap three untapped Zombies you control: You draw a card and lose 1 life."
  creature(
    'SYNTHETIC Grave Whisperer',
    ['Zombie'],
    1,
    1,
    'Tap three untapped Zombies you control: You draw a card and lose 1 life.',
    [
      {
        kind: 'activated',
        cost: [{ kind: 'tapPermanents', filter: ZOMBIES, count: 3 }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: YOU, count: 1 },
            { kind: 'loseLife', player: YOU, amount: 1 },
          ],
        },
      },
    ],
  ),
  // "Tap two untapped artifacts you control: Target creature can't be blocked this turn."
  singleFace({
    name: 'SYNTHETIC Whirling Rogue',
    manaCost: ['3'],
    types: ['artifact', 'creature'],
    subtypes: ['Human', 'Rogue'],
    colors: [],
    colorIdentity: [],
    power: 2,
    toughness: 2,
    oracleText:
      "Tap two untapped artifacts you control: Target creature can't be blocked this turn.",
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tapPermanents', filter: { types: ['artifact'] }, count: 2 }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'restrict',
          objects: { kind: 'target', id: 't1' },
          restriction: 'cantBeBlocked',
          duration: END,
        },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Brass Trinket',
    manaCost: ['1'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: '',
  }),
  // "Tap two untapped artifacts you control: Draw a card."
  singleFace({
    name: 'SYNTHETIC Clockwork Ledger',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Tap two untapped artifacts you control: Draw a card.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tapPermanents', filter: { types: ['artifact'] }, count: 2 }],
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "Tap another untapped creature you control, {T}: You gain 2 life." (the other creature, not this one)
  creature(
    'SYNTHETIC Shield Mentor',
    ['Human'],
    1,
    1,
    'Tap another untapped creature you control, {T}: You gain 2 life.',
    [
      {
        kind: 'activated',
        cost: [
          { kind: 'tapPermanents', filter: { types: ['creature'], other: true }, count: 1 },
          { kind: 'tap' },
        ],
        effect: { kind: 'gainLife', player: YOU, amount: 2 },
      },
    ],
  ),
  // "{1}, Sacrifice two artifacts: Draw a card."
  singleFace({
    name: 'SYNTHETIC Thopter Weaver',
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Artificer'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText: '{1}, Sacrifice two artifacts: Draw a card.',
    abilities: [
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1'] },
          { kind: 'sacrifice', what: { types: ['artifact'] }, count: 2 },
        ],
        effect: { kind: 'draw', player: YOU, count: 1 },
      },
    ],
  }),
  // "{1}{B}, {T}, Sacrifice another creature: Create X 2/2 black Zombie creature tokens, where X is the sacrificed
  // creature's power."
  creature(
    'SYNTHETIC Ghoul Summoner',
    ['Zombie', 'Warlock'],
    2,
    2,
    "{1}{B}, {T}, Sacrifice another creature: Create X 2/2 black Zombie creature tokens, where X is the sacrificed creature's power.",
    [
      {
        kind: 'activated',
        cost: [
          mana('1', 'B'),
          { kind: 'tap' },
          { kind: 'sacrifice', what: { types: ['creature'], other: true } },
        ],
        effect: {
          kind: 'createToken',
          token: { kind: 'custom', definition: ZOMBIE_TOKEN },
          count: { kind: 'powerOf', of: { kind: 'sacrificedCost' } },
        },
      },
    ],
  ),
  // "Sacrifice a creature: You gain life equal to its toughness and draw cards equal to its mana value." (a sacrifice
  // outlet; "its" is the sacrificed creature)
  singleFace({
    name: 'SYNTHETIC Altar Scholar',
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      'Sacrifice a creature: You gain life equal to its toughness and draw cards equal to its mana value.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'gainLife',
              player: YOU,
              amount: { kind: 'toughnessOf', of: { kind: 'sacrificedCost' } },
            },
            {
              kind: 'draw',
              player: YOU,
              count: { kind: 'manaValueOf', of: { kind: 'sacrificedCost' } },
            },
          ],
        },
      },
    ],
  }),
  // "Sacrifice this creature: It deals damage equal to its power to any target." (the source is sacrificed)
  creature(
    'SYNTHETIC Volatile Imp',
    ['Imp'],
    3,
    1,
    'Sacrifice ~: ~ deals damage equal to its power to target player.',
    [
      {
        kind: 'activated',
        cost: [{ kind: 'sacrifice', what: THIS }],
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
        effect: {
          kind: 'dealDamage',
          amount: { kind: 'powerOf', of: { kind: 'sacrificedCost' } },
          to: { kind: 'target', id: 't1' },
        },
      },
    ],
  ),
  // ---- Casting a card from the graveyard "as long as" (D-133)
  // "~ can't block. You may cast this card from your graveyard as long as you control a Zombie."
  singleFace({
    name: 'SYNTHETIC Restless Corpse',
    manaCost: ['B'],
    types: ['creature'],
    subtypes: ['Zombie'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 2,
    toughness: 1,
    oracleText:
      "~ can't block. You may cast this card from your graveyard as long as you control a Zombie.",
    abilities: [
      {
        kind: 'static',
        static: { kind: 'restriction', subject: THIS_SUBJECT, restriction: 'cantBlock' },
      },
      {
        kind: 'static',
        condition: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], subtypes: ['Zombie'] },
          count: 1,
        },
        static: { kind: 'castFromGraveyard' },
      },
    ],
  }),
  // "You may cast this card from your graveyard." (no condition)
  singleFace({
    name: 'SYNTHETIC Stubborn Shade',
    manaCost: ['1', 'B'],
    types: ['sorcery'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'You may cast this card from your graveyard. Each opponent loses 1 life.',
    abilities: [{ kind: 'static', static: { kind: 'castFromGraveyard' } }],
    spell: { effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 } },
  }),
  // ---- Replacing a death (D-133)
  // "If a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie
  // creature token."
  creature(
    'SYNTHETIC Soul Collector',
    ['Vampire', 'Demon'],
    3,
    4,
    'If a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie creature token.',
    [
      {
        kind: 'replacement',
        replacement: {
          kind: 'wouldDie',
          what: { types: ['creature'], controller: 'opponent', token: false },
          instead: 'exile',
          alsoCreate: { token: { kind: 'custom', definition: ZOMBIE_TOKEN }, count: 1 },
        },
      },
    ],
  ),
  // "If a creature would die, exile it instead."
  singleFace({
    name: 'SYNTHETIC Quiet Shroud',
    manaCost: ['1', 'B'],
    types: ['enchantment'],
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText: 'If a creature would die, exile it instead.',
    abilities: [
      {
        kind: 'replacement',
        replacement: { kind: 'wouldDie', what: { types: ['creature'] }, instead: 'exile' },
      },
    ],
  }),
  // "As long as ~ is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for
  // each of those creatures."
  singleFace({
    name: 'SYNTHETIC Standing Sentinel',
    manaCost: ['1', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Guard'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 1,
    toughness: 3,
    oracleText:
      "As long as ~ is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.",
    abilities: [
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['W'] } },
      {
        kind: 'static',
        condition: { kind: 'thisMatches', filter: { tapped: false } },
        static: { kind: 'attackTax', cost: [mana('1')], planeswalkers: true },
      },
    ],
  }),
  // ---- A limit on blockers (D-133)
  // "Each creature you control with power 4 or greater can't be blocked by more than one creature."
  singleFace({
    name: 'SYNTHETIC Banner of the Lone Duel',
    manaCost: ['2', 'R'],
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText:
      "Each creature you control with power 4 or greater can't be blocked by more than one creature.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'restriction',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', power: { cmp: 'atLeast', value: 4 } },
          },
          restriction: 'cantBeBlockedByMoreThanOne',
        },
      },
    ],
  }),
  // "{R}: ~ gets +2/+0 until end of turn." (a creature that grows past the threshold)
  singleFace({
    name: 'SYNTHETIC Firebreathing Brute',
    manaCost: ['2', 'R'],
    types: ['creature'],
    subtypes: ['Ogre'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 3,
    toughness: 3,
    oracleText: '{R}: ~ gets +2/+0 until end of turn.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['R'] }],
        effect: { kind: 'modifyPt', objects: THIS, power: 2, toughness: 0, duration: END },
      },
    ],
  }),
  singleFace({
    name: 'SYNTHETIC Menacing Titan',
    manaCost: ['4', 'R'],
    types: ['creature'],
    subtypes: ['Giant'],
    colors: ['R'],
    colorIdentity: ['R'],
    power: 5,
    toughness: 5,
    oracleText: 'Menace',
    abilities: [{ kind: 'keyword', keyword: { kind: 'menace' } }],
  }),
  // ---- Lords and grants to a filter (the engine already ran these; D-133 class a)
  creature('SYNTHETIC Plain Skeleton', ['Skeleton'], 1, 1, ''),
  // "Other Zombie creatures get +1/+1." (every controller)
  creature('SYNTHETIC Undead Lord', ['Zombie'], 2, 2, 'Other Zombie creatures get +1/+1.', [
    {
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: { kind: 'filter', filter: { ...ZOMBIES, other: true } },
        power: 1,
        toughness: 1,
      },
    },
  ]),
  // "Skeletons you control and other Zombies you control get +1/+1 and have deathtouch."
  creature(
    'SYNTHETIC Bone Baron',
    ['Zombie'],
    2,
    2,
    'Skeletons you control and other Zombies you control get +1/+1 and have deathtouch.',
    [
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: {
              types: ['creature'],
              controller: 'you',
              anyOf: [{ subtypes: ['Skeleton'] }, { subtypes: ['Zombie'], other: true }],
            },
          },
          power: 1,
          toughness: 1,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: {
              types: ['creature'],
              controller: 'you',
              anyOf: [{ subtypes: ['Skeleton'] }, { subtypes: ['Zombie'], other: true }],
            },
          },
          keyword: { kind: 'deathtouch' },
        },
      },
    ],
  ),
  // "{1}{B}, {T}: All Zombies gain menace until end of turn."
  creature(
    'SYNTHETIC Accursed Lord',
    ['Zombie'],
    2,
    2,
    '{1}{B}, {T}: All Zombies gain menace until end of turn.',
    [
      {
        kind: 'activated',
        cost: [mana('1', 'B'), { kind: 'tap' }],
        effect: {
          kind: 'grantKeyword',
          objects: { kind: 'each', filter: ZOMBIES },
          keyword: { kind: 'menace' },
          duration: END,
        },
      },
    ],
  ),
  // "Whenever ~ attacks, each creature you control with power 3 or greater gets +1/+1 and gains trample until
  // end of turn." (a comparison on power in an `each` selector)
  creature(
    'SYNTHETIC Big Rallier',
    ['Zombie'],
    3,
    3,
    'Whenever ~ attacks, each creature you control with power 3 or greater gets +1/+1 and gains trample until end of turn.',
    [
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            {
              kind: 'modifyPt',
              objects: {
                kind: 'each',
                filter: {
                  types: ['creature'],
                  controller: 'you',
                  power: { cmp: 'atLeast', value: 3 },
                },
              },
              power: 1,
              toughness: 1,
              duration: END,
            },
            {
              kind: 'grantKeyword',
              objects: {
                kind: 'each',
                filter: {
                  types: ['creature'],
                  controller: 'you',
                  power: { cmp: 'atLeast', value: 3 },
                },
              },
              keyword: { kind: 'trample' },
              duration: END,
            },
          ],
        },
      },
    ],
  ),
];
