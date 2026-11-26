// The "can the engine run it" gate of validateCard (SPEC 17.2 A7, D-007).
import { describe, expect, test } from 'vitest';
import { SUPPORTED_FEATURES } from '../src/ast/features';
import type { Keyword } from '../src/ast/types';
import { validateCard, validateCardStructure } from '../src/ast/validate';
import type { CardDefinition } from '../src/cards/definition';
import { FIXTURE_CARDS, fixtureCard, syntheticCard } from '../src/cards/fixtures/index';

/** The executable keywords (CR 702), each proven by a scenario test (see the list below). */
const EXECUTABLE_KEYWORDS = [
  'crew', // scenario-xx-crew
  'station', // scenario-xx-station
  'deathtouch', // scenario-05, scenario-xx-combat-deathtouch
  'defender', // scenario-xx-combat-attack-restrictions
  'doubleStrike', // scenario-06
  'enchant', // scenario-xx-auras
  'equip', // scenario-xx-equipment
  'escalate', // scenario-xx-escalate
  'firstStrike', // scenario-06
  'flash', // scenario-xx-flash
  'flashback', // scenario-xx-flashback
  'flying', // scenario-07
  'cycling', // scenario-xx-cycling
  'haste', // scenario-xx-combat-attack-restrictions
  'hexproof', // scenario-xx-hexproof-shroud
  'hideaway', // scenario-xx-hideaway
  'indestructible', // scenario-xx-combat-deathtouch
  'kicker', // scenario-xx-kicker
  'lifelink', // scenario-xx-combat-lifelink
  'menace', // scenario-07
  'prowess', // scenario-20
  'protection', // convert-grammar-engine-p68 (D-229)
  'reach', // scenario-07
  'shroud', // scenario-xx-hexproof-shroud
  'trample', // scenario-05
  'vigilance', // scenario-xx-combat-attack-restrictions
  'ward', // scenario-19-ward
  'landwalk', // scenario-xx-landwalk
  'fear', // scenario-xx-fear-intimidate
  'intimidate', // scenario-xx-fear-intimidate
  'shadow', // scenario-xx-shadow
  'changeling', // scenario-xx-changeling-devoid
  'devoid', // scenario-xx-changeling-devoid
  'partner', // scenario-xx-changeling-devoid
  'partnerWith', // scenario-xx-gisa-g3-sacrifice-x
  'deckLimit', // convert-grammar-engine-witch-king (a deck-construction line, no effect in a game)
  'chooseBackground', // scenario-xx-choose-background
  'companion', // parser-companion (CR 702.139a: functions outside the game, no effect in a game)
  'canBeCommander', // scenario-xx-planeswalker-commander
  'ascend', // scenario-xx-ascend
  'soulbond', // scenario-xx-soulbond (D-286)
  'daybound', // scenario-xx-day-night
  'nightbound', // scenario-xx-day-night
  'exalted', // scenario-xx-exalted-annihilator
  'annihilator', // scenario-xx-exalted-annihilator
  'firebending', // scenario-xx-firebending (CR 702.189a)
  'afflict', // scenario-xx-gisa-g1-afflict (D-472)
  'dredge', // convert-grammar-engine-sultai-arisen (issue 102, Dredge 3)
  'mobilize', // convert-grammar-engine-mardu-surge (issue 101, on the real cards)
  'fabricate', // convert-grammar-engine-mardu-surge (issue 101, on the real card)
  'backup', // convert-grammar-engine-p69 (Guardian Scalelord, on the real card)
  'persist', // scenario-xx-persist-undying
  'undying', // scenario-xx-persist-undying
  'infect', // scenario-xx-infect-toxic
  'wither', // scenario-xx-infect-toxic
  'toxic', // scenario-xx-infect-toxic
  'splitSecond', // scenario-xx-split-second
  'startYourEngines', // scenario-xx-speed-s144
  'typecycling', // scenario-xx-typecycling
  'ninjutsu', // scenario-xx-ninjutsu (CR 702.49a, unverified)
  'multikicker', // scenario-xx-multikicker
  'buyback', // scenario-xx-galadriel-g3-spells
  'skulk', // scenario-xx-keywords2-combat
  'battleCry', // scenario-xx-keywords2-combat
  'mentor', // scenario-xx-keywords2-combat
  'evolve', // scenario-xx-keywords2-combat
  'bushido', // scenario-xx-keywords2-combat
  'flanking', // ast-abzan-armor-validate
  'extort', // scenario-xx-keywords2-extort
  'affinity', // scenario-xx-keywords2-affinity
  'convoke', // scenario-xx-pay-options
  'improvise', // scenario-xx-pay-options
  'delve', // scenario-xx-pay-options
  'cascade', // scenario-xx-cascade
  'demonstrate', // scenario-xx-prismari-g3-demonstrate (D-665)
  'retrace', // scenario-xx-prismari-g3-retrace (D-667)
  'jumpStart', // scenario-xx-jump-start
  'plot', // scenario-xx-plot
  'compleated', // convert-grammar-engine-blight-curse-oneoffs-b
  'aftermath', // scenario-xx-aftermath
  'unearth', // scenario-xx-unearth
  'encore', // scenario-xx-encore
  'eternalize', // scenario-xx-hashaton-g5
  'embalm', // scenario-xx-embalm
  'devour', // scenario-xx-devour-riot
  'riot', // scenario-xx-devour-riot
  'echo', // scenario-xx-echo
  'suspend', // scenario-xx-suspend
  'cumulativeUpkeep', // scenario-xx-cumulative-upkeep
  'storm', // scenario-xx-storm
  'gravestorm', // convert-grammar-engine-issue58-d
  'replicate', // scenario-xx-replicate
  'gift', // scenario-xx-gift
  'livingWeapon', // scenario-xx-living-weapon
  'jobSelect', // convert-grammar-engine-p49 (Job select, D-206)
  'readAhead', // scenario-xx-read-ahead
  'rebound', // convert-grammar-engine-scions-e
  'reconfigure', // scenario-xx-reconfigure
  'dethrone', // scenario-xx-extra-combat
  'melee', // convert-grammar-engine-limit-break-g4 (Tifa, Martial Artist)
  'myriad', // scenario-xx-extra-combat
  'decayed', // scenario-xx-gisa-g5-decayed (D-478)
];

/** Keyword abilities that exist in the AST but that the engine does not execute yet. */
// Empty since D-229: protection from a color is executed.
const NOT_EXECUTABLE_KEYWORDS: readonly string[] = [];

function cardWithKeyword(keyword: Keyword): CardDefinition {
  const base = syntheticCard('SYNTHETIC Vanilla 2/2');
  const face = base.faces[0];
  if (!face) throw new Error('no face');
  return {
    ...base,
    faces: [{ ...face, abilities: [{ kind: 'keyword', keyword }] }],
  };
}

/** CR 702.88a: rebound is on an instant or a sorcery, so its sample is a sorcery with a spell. */
function sorceryWithKeyword(keyword: Keyword): CardDefinition {
  const base = fixtureCard('Divination');
  const face = base.faces[0];
  if (!face) throw new Error('no face');
  return { ...base, faces: [{ ...face, abilities: [{ kind: 'keyword', keyword }] }] };
}

const KEYWORD_SAMPLES: Record<string, Keyword> = {
  flying: { kind: 'flying' },
  firstStrike: { kind: 'firstStrike' },
  doubleStrike: { kind: 'doubleStrike' },
  deathtouch: { kind: 'deathtouch' },
  defender: { kind: 'defender' },
  haste: { kind: 'haste' },
  hexproof: { kind: 'hexproof' },
  shroud: { kind: 'shroud' },
  indestructible: { kind: 'indestructible' },
  lifelink: { kind: 'lifelink' },
  menace: { kind: 'menace' },
  reach: { kind: 'reach' },
  trample: { kind: 'trample' },
  vigilance: { kind: 'vigilance' },
  flash: { kind: 'flash' },
  cycling: { kind: 'cycling', cost: [{ kind: 'mana', symbols: ['2'] }] },
  enchant: { kind: 'enchant', filter: { types: ['creature'] } },
  equip: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['1'] }] },
  kicker: { kind: 'kicker', cost: [{ kind: 'mana', symbols: ['2'] }] },
  prowess: { kind: 'prowess' },
  flashback: { kind: 'flashback', cost: [{ kind: 'mana', symbols: ['2'] }] },
  ward: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['2'] }] },
  crew: { kind: 'crew', power: 2 },
  station: { kind: 'station' },
  landwalk: { kind: 'landwalk', landType: 'Island' },
  fear: { kind: 'fear' },
  intimidate: { kind: 'intimidate' },
  shadow: { kind: 'shadow' },
  changeling: { kind: 'changeling' },
  devoid: { kind: 'devoid' },
  partner: { kind: 'partner' },
  partnerWith: { kind: 'partnerWith', name: 'SYNTHETIC Partner Quarry' },
  deckLimit: { kind: 'deckLimit', limit: 9 },
  chooseBackground: { kind: 'chooseBackground' },
  companion: { kind: 'companion', condition: { kind: 'noRepeatedManaSymbol' } },
  canBeCommander: { kind: 'canBeCommander' },
  ascend: { kind: 'ascend' },
  soulbond: { kind: 'soulbond' },
  daybound: { kind: 'daybound' },
  nightbound: { kind: 'nightbound' },
  exalted: { kind: 'exalted' },
  annihilator: { kind: 'annihilator', count: 2 },
  firebending: { kind: 'firebending', count: 2 },
  afflict: { kind: 'afflict', count: 3 },
  dredge: { kind: 'dredge', count: 3 },
  mobilize: { kind: 'mobilize', count: 1 },
  fabricate: { kind: 'fabricate', count: 2 },
  backup: { kind: 'backup', count: 1 },
  persist: { kind: 'persist' },
  undying: { kind: 'undying' },
  infect: { kind: 'infect' },
  wither: { kind: 'wither' },
  toxic: { kind: 'toxic', count: 1 },
  splitSecond: { kind: 'splitSecond' },
  startYourEngines: { kind: 'startYourEngines' },
  typecycling: {
    kind: 'typecycling',
    filter: { subtypes: ['Island'] },
    cost: [{ kind: 'mana', symbols: ['2'] }],
  },
  ninjutsu: { kind: 'ninjutsu', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
  multikicker: { kind: 'multikicker', cost: [{ kind: 'mana', symbols: ['2'] }] },
  buyback: { kind: 'buyback', cost: [{ kind: 'mana', symbols: ['2'] }] },
  skulk: { kind: 'skulk' },
  battleCry: { kind: 'battleCry' },
  mentor: { kind: 'mentor' },
  evolve: { kind: 'evolve' },
  bushido: { kind: 'bushido', count: 1 },
  flanking: { kind: 'flanking' },
  extort: { kind: 'extort' },
  affinity: { kind: 'affinity', filter: { types: ['artifact'] } },
  convoke: { kind: 'convoke' },
  improvise: { kind: 'improvise' },
  delve: { kind: 'delve' },
  cascade: { kind: 'cascade' },
  demonstrate: { kind: 'demonstrate' },
  retrace: { kind: 'retrace' },
  jumpStart: { kind: 'jumpStart' },
  plot: { kind: 'plot', cost: [{ kind: 'mana', symbols: ['2', 'U'] }] },
  compleated: { kind: 'compleated' },
  aftermath: { kind: 'aftermath' },
  unearth: { kind: 'unearth', cost: [{ kind: 'mana', symbols: ['R'] }] },
  encore: { kind: 'encore', cost: [{ kind: 'mana', symbols: ['3', 'R'] }] },
  eternalize: { kind: 'eternalize', cost: [{ kind: 'mana', symbols: ['5', 'U', 'U'] }] },
  embalm: { kind: 'embalm', cost: [{ kind: 'mana', symbols: ['5', 'W'] }] },
  devour: { kind: 'devour', count: 2 },
  riot: { kind: 'riot' },
  echo: { kind: 'echo', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
  suspend: { kind: 'suspend', count: 2, cost: [{ kind: 'mana', symbols: ['R'] }] },
  cumulativeUpkeep: { kind: 'cumulativeUpkeep', cost: [{ kind: 'mana', symbols: ['1'] }] },
  storm: { kind: 'storm' },
  gravestorm: { kind: 'gravestorm' },
  replicate: { kind: 'replicate', cost: [{ kind: 'mana', symbols: ['R'] }] },
  gift: { kind: 'gift', gift: 'card' },
  livingWeapon: { kind: 'livingWeapon' },
  jobSelect: { kind: 'jobSelect' },
  escalate: { kind: 'escalate', cost: [{ kind: 'mana', symbols: ['1'] }] },
  hideaway: { kind: 'hideaway', count: 3 },
  dethrone: { kind: 'dethrone' },
  melee: { kind: 'melee' },
  readAhead: { kind: 'readAhead' },
  rebound: { kind: 'rebound' },
  reconfigure: { kind: 'reconfigure', cost: [{ kind: 'mana', symbols: ['2', 'U'] }] },
  myriad: { kind: 'myriad' },
  decayed: { kind: 'decayed' },
  protection: { kind: 'protection', from: 'color', colors: ['R'] },
};

function asUnsupported(card: CardDefinition): CardDefinition {
  return { ...card, support: 'unsupported' };
}

describe('supported feature gate', () => {
  test('every real fixture is executable', () => {
    for (const card of Object.values(FIXTURE_CARDS)) {
      expect(validateCard(card), card.name).toEqual([]);
    }
  });

  test('triggered abilities the engine runs are accepted', () => {
    for (const name of [
      'SYNTHETIC Welcome Gain Three',
      'SYNTHETIC Sacrifice Dragon',
      'SYNTHETIC Dies Treasure Creature',
      'SYNTHETIC Landfall Tokenmaker',
    ]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('cards creating a Food or a Clue token are executable', () => {
    for (const name of ['SYNTHETIC Food Maker', 'SYNTHETIC Clue Maker', 'SYNTHETIC Feast Scout']) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('an X spell and a modal spell are executable (D-103, D-114)', () => {
    expect(validateCard(syntheticCard('SYNTHETIC X Draw'))).toEqual([]);
    expect(validateCard(syntheticCard('SYNTHETIC Modal Choice'))).toEqual([]);
  });

  test('keyword abilities the engine executes are accepted; the others are rejected', () => {
    // SYNTHETIC Flying Lifelinker uses only flying and lifelink, which combat executes now.
    expect(validateCard(syntheticCard('SYNTHETIC Flying Lifelinker'))).toEqual([]);
    // Its activated ability ({T}: 1 damage to any target) runs since slice S3.
    expect(validateCard(syntheticCard('SYNTHETIC Pinger'))).toEqual([]);
    for (const kind of EXECUTABLE_KEYWORDS) {
      // Only an Aura has an enchant ability (CR 702.5a), so its sample is checked on one.
      // Only an instant or a sorcery has flashback (CR 702.34a).
      const card =
        kind === 'enchant'
          ? syntheticCard('SYNTHETIC Wings Aura')
          : kind === 'flashback'
            ? syntheticCard('SYNTHETIC Flash Gain')
            : // Only an instant or a sorcery has buyback (CR 702.27a).
              kind === 'buyback'
              ? syntheticCard('SYNTHETIC Buyback Peek')
              : // Only an Equipment has living weapon (CR 702.92a).
                kind === 'livingWeapon'
                ? syntheticCard('SYNTHETIC Husk Blade')
                : // Job select (CR 702.182a) is an Equipment's too.
                  kind === 'jobSelect'
                  ? syntheticCard('SYNTHETIC Job Blade')
                  : // D-145: escalate belongs to a modal spell, Hideaway to a permanent (CR 702.120a, 702.75a).
                    kind === 'escalate'
                    ? syntheticCard('SYNTHETIC Escalating Charm')
                    : kind === 'hideaway'
                      ? syntheticCard('SYNTHETIC Hidden Cache')
                      : // CR 702.145: daybound and nightbound belong to the faces of a transforming card.
                        kind === 'daybound' || kind === 'nightbound'
                        ? syntheticCard('SYNTHETIC Dayfang Cub // Nightfang Wolf')
                        : // D-151: read ahead belongs to a Saga with chapter abilities (CR 702.155b).
                          kind === 'aftermath'
                          ? syntheticCard('SYNTHETIC Rite // Toll')
                          : kind === 'readAhead'
                            ? syntheticCard('SYNTHETIC Reading Rite')
                            : kind === 'reconfigure'
                              ? // CR 702.151: an Equipment creature.
                                syntheticCard('SYNTHETIC Reconfigure Blade')
                              : kind === 'rebound'
                                ? sorceryWithKeyword(KEYWORD_SAMPLES[kind] as Keyword)
                                : cardWithKeyword(KEYWORD_SAMPLES[kind] as Keyword);
      expect(validateCard(card), kind).toEqual([]);
    }
    for (const kind of NOT_EXECUTABLE_KEYWORDS) {
      const issues = validateCard(cardWithKeyword(KEYWORD_SAMPLES[kind] as Keyword));
      expect(
        issues.map((i) => i.message),
        kind,
      ).toEqual([expect.stringContaining(`keyword "${kind}" is not implemented`)]);
      expect(issues[0]?.path, kind).toBe('faces[0].abilities[0].keyword');
    }
  });

  test('a keyword is flagged unsupported honestly: marked unsupported, the same card has no feature issues', () => {
    const card = asUnsupported(
      cardWithKeyword({ kind: 'protection', from: 'color', colors: ['R'] }),
    );
    expect(validateCard(card)).toEqual(validateCardStructure(card));
  });

  test('the planeswalker and battle card types are executable', () => {
    expect(validateCard(syntheticCard('SYNTHETIC Vanilla Planeswalker'))).toEqual([]);
    expect(validateCard(syntheticCard('SYNTHETIC Vanilla Battle'))).toEqual([]);
  });

  test('the same cards are honest when marked unsupported: no feature issues, structure still checked', () => {
    for (const name of ['SYNTHETIC Food Maker', 'SYNTHETIC Pinger']) {
      const card = asUnsupported(syntheticCard(name));
      expect(validateCard(card)).toEqual(validateCardStructure(card));
    }
  });

  test('the registry matches what the engine implements today', () => {
    expect([...SUPPORTED_FEATURES.triggerKinds].sort()).toEqual(
      [
        'activatesAbility',
        'attackBatch',
        'attacks',
        'becomesBlocked',
        'becomesBlockedBy',
        'becomesMonstrous',
        'becomesTapped',
        'becomesUntapped',
        'becomesTarget',
        'blocks',
        'castSpell',
        'cycled',
        'chapter',
        // D-596: "When this Class becomes level N".
        'classLevel',
        'dealsCombatDamage',
        'dealsDamage',
        'dealtDamage',
        'combatDamageBatch',
        'damageBatch',
        'countersAdded',
        'crimeCommitted',
        'dies',
        'diesBatch',
        'discarded',
        // CR 709.5h: "When you unlock this door".
        'doorUnlocked',
        'drawn',
        'endStep',
        'entersBatch',
        'entersBattlefield',
        // Glorybringer: "When you do" after exerting.
        'exerted',
        'exiledFromLibraryOrGraveyard',
        'landfall',
        'leavesBattlefield',
        'leftGraveyard',
        'lifeGained',
        'lifeLost',
        'noncombatDamageDealt',
        'dealtDamageToPlayer',
        'permanentSacrificed',
        'putIntoGraveyard',
        // D-648: "Whenever a player attacks one of your opponents".
        'playerAttacksOpponent',
        // Watcher of Hours: "Whenever you remove a time counter from this card while it's exiled".
        'removesCounterWhileExiled',
        'ringTempted',
        // Galadriel group 3: "Whenever you roll a die's highest natural result".
        'rollsHighest',
        // D-513: "Whenever you scry".
        'scries',
        'state',
        'step',
        // Galadriel group 1: "Whenever you surveil".
        'surveils',
        'tappedForMana',
        'tapsForMana',
        'tokenCreated',
        'playsCard',
        'unblockedAttackBatch',
        'upkeep',
        'winsCoinFlip',
      ].sort(),
    );
    expect(SUPPORTED_FEATURES.abilityKinds).toContain('triggered');
    expect(SUPPORTED_FEATURES.abilityKinds).toContain('activated');
    expect(SUPPORTED_FEATURES.effectKinds).toContain('createToken');
    expect(SUPPORTED_FEATURES.sacrificeSelectors).toEqual([
      'this',
      'choose',
      'each',
      'moved',
      'putWithThis',
    ]);
    expect(SUPPORTED_FEATURES.tokenPresets).toEqual([
      'Treasure',
      'Food',
      'Clue',
      'Gold',
      'Map',
      'Gingerbrute',
      'Incubator',
      'Lander',
      'Wicked Role',
      'Junk',
    ]);
    expect(SUPPORTED_FEATURES.triggerFeatures).toEqual([
      'interveningIf',
      'alone',
      'attacksAt',
      // D-135: "enters untapped" and "dies or is put into exile".
      'entersUntapped',
      'leavesToAnyOf',
      // D-145: "attacks while you don't control another Dinosaur".
      'triggerCondition',
      // D-177: "becomes the target of a spell".
      'becomesTargetSpell',
      // Professor Hojo: "one or more creatures you control become the target of an activated ability".
      'becomesTargetActivated',
      'castNth',
      // Issue 100: "whenever you cast your first instant or sorcery spell each turn".
      'castFirstOfKind',
      'castDuringOpponentTurn',
      'castDuringYourTurn',
      // Issue 102: "enters from a graveyard" and "leaves your graveyard during your turn".
      'entersBattlefieldFromGraveyard',
      'entersBattlefieldFromYourGraveyard',
      'leftGraveyardDuringYourTurn',
      // D-510: "Whenever you tap an untapped creature an opponent controls", "if it isn't being declared as an attacker", "one or more".
      'tappedBy',
      'notAsAttacker',
      'tapBatch',
      'entersFromGraveyard',
      // Unbound Flourishing: "activate an ability, if that ability's activation cost contains {X}".
      'activatesAbilityX',
      // Avalanche of Sector 7: "an opponent activates an ability of an artifact they control".
      'activatesAbilityOfSource',
      // Flourishing Defenses: "Whenever a -1/-1 counter is put on a creature".
      'countersAddedEach',
      // "Whenever one or more opponents lose life".
      'lifeLostBatch',
      // Whispering Snitch: "Whenever you surveil for the first time each turn".
      'surveilsFirstEachTurn',
    ]);
    expect(SUPPORTED_FEATURES.manaAbilityCostKinds).toEqual([
      'tap',
      'sacrifice',
      'mana',
      'payLife',
      // Group 4 of the Vraska deck: "{T}, Mill a card" (Millikin).
      'mill',
      // D-625: "{T}, Tap an untapped creature you control: Add one mana of any color" (Jaspera Sentinel, Holdout Settlement).
      'tapPermanents',
      // Issue 105: "{T}, Pay {E}: Add one mana of any color" (Aether Hub).
      'energy',
      // Issue 245 (PR #280): "{T}, Remove a charge counter from this land: Add one mana of any color" (Vivid Grove).
      'removeCounters',
      // Issue 144: "{R}, {T}, Exert this land: Add {R}{R}" (Arena of Glory).
      'exert',
      // "Put a -0/-1 counter on this creature: Add {G}" (CR 118.3, 122.1).
      'putCounters',
    ]);
    expect([...SUPPORTED_FEATURES.keywordKinds].sort()).toEqual([...EXECUTABLE_KEYWORDS].sort());
    for (const kind of NOT_EXECUTABLE_KEYWORDS) {
      expect(SUPPORTED_FEATURES.keywordKinds).not.toContain(kind);
    }
    // Every keyword the AST knows is in exactly one of the two lists.
    expect([...EXECUTABLE_KEYWORDS, ...NOT_EXECUTABLE_KEYWORDS].sort()).toEqual(
      Object.keys(KEYWORD_SAMPLES).sort(),
    );
    expect(SUPPORTED_FEATURES.cardTypes).toEqual(
      expect.arrayContaining(['planeswalker', 'battle']),
    );
    expect(SUPPORTED_FEATURES.layouts).toEqual([
      'normal',
      'split',
      'adventure',
      'modal_dfc',
      'transform',
      'saga',
      // D-235: a Class (CR 716).
      'class',
      // D-214: a preparation card (CR 722).
      'prepare',
      // D-277: a meld card (CR 701.42, 712.4).
      'meld',
    ]);
    expect(SUPPORTED_FEATURES.effectKinds).toEqual(expect.arrayContaining(['discard', 'search']));
    expect(SUPPORTED_FEATURES.effectKinds).toContain('modifyPt');
    expect(fixtureCard('Lightning Bolt').support).toBe('supported');
  });
});
