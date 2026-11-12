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
  'chooseBackground', // scenario-xx-choose-background
  'canBeCommander', // scenario-xx-planeswalker-commander
  'ascend', // scenario-xx-ascend
  'exalted', // scenario-xx-exalted-annihilator
  'annihilator', // scenario-xx-exalted-annihilator
  'backup', // convert-grammar-engine-p69 (Guardian Scalelord, on the real card)
  'persist', // scenario-xx-persist-undying
  'undying', // scenario-xx-persist-undying
  'infect', // scenario-xx-infect-toxic
  'wither', // scenario-xx-infect-toxic
  'toxic', // scenario-xx-infect-toxic
  'splitSecond', // scenario-xx-split-second
  'typecycling', // scenario-xx-typecycling
  'multikicker', // scenario-xx-multikicker
  'skulk', // scenario-xx-keywords2-combat
  'battleCry', // scenario-xx-keywords2-combat
  'mentor', // scenario-xx-keywords2-combat
  'evolve', // scenario-xx-keywords2-combat
  'bushido', // scenario-xx-keywords2-combat
  'extort', // scenario-xx-keywords2-extort
  'affinity', // scenario-xx-keywords2-affinity
  'convoke', // scenario-xx-pay-options
  'improvise', // scenario-xx-pay-options
  'delve', // scenario-xx-pay-options
  'cascade', // scenario-xx-cascade
  'unearth', // scenario-xx-unearth
  'encore', // scenario-xx-encore
  'devour', // scenario-xx-devour-riot
  'riot', // scenario-xx-devour-riot
  'echo', // scenario-xx-echo
  'suspend', // scenario-xx-suspend
  'cumulativeUpkeep', // scenario-xx-cumulative-upkeep
  'storm', // scenario-xx-storm
  'replicate', // scenario-xx-replicate
  'gift', // scenario-xx-gift
  'livingWeapon', // scenario-xx-living-weapon
  'jobSelect', // convert-grammar-engine-p49 (Job select, D-206)
  'readAhead', // scenario-xx-read-ahead
  'dethrone', // scenario-xx-extra-combat
  'myriad', // scenario-xx-extra-combat
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
  landwalk: { kind: 'landwalk', landType: 'Island' },
  fear: { kind: 'fear' },
  intimidate: { kind: 'intimidate' },
  shadow: { kind: 'shadow' },
  changeling: { kind: 'changeling' },
  devoid: { kind: 'devoid' },
  partner: { kind: 'partner' },
  chooseBackground: { kind: 'chooseBackground' },
  canBeCommander: { kind: 'canBeCommander' },
  ascend: { kind: 'ascend' },
  exalted: { kind: 'exalted' },
  annihilator: { kind: 'annihilator', count: 2 },
  backup: { kind: 'backup', count: 1 },
  persist: { kind: 'persist' },
  undying: { kind: 'undying' },
  infect: { kind: 'infect' },
  wither: { kind: 'wither' },
  toxic: { kind: 'toxic', count: 1 },
  splitSecond: { kind: 'splitSecond' },
  typecycling: {
    kind: 'typecycling',
    filter: { subtypes: ['Island'] },
    cost: [{ kind: 'mana', symbols: ['2'] }],
  },
  multikicker: { kind: 'multikicker', cost: [{ kind: 'mana', symbols: ['2'] }] },
  skulk: { kind: 'skulk' },
  battleCry: { kind: 'battleCry' },
  mentor: { kind: 'mentor' },
  evolve: { kind: 'evolve' },
  bushido: { kind: 'bushido', count: 1 },
  extort: { kind: 'extort' },
  affinity: { kind: 'affinity', filter: { types: ['artifact'] } },
  convoke: { kind: 'convoke' },
  improvise: { kind: 'improvise' },
  delve: { kind: 'delve' },
  cascade: { kind: 'cascade' },
  unearth: { kind: 'unearth', cost: [{ kind: 'mana', symbols: ['R'] }] },
  encore: { kind: 'encore', cost: [{ kind: 'mana', symbols: ['3', 'R'] }] },
  devour: { kind: 'devour', count: 2 },
  riot: { kind: 'riot' },
  echo: { kind: 'echo', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
  suspend: { kind: 'suspend', count: 2, cost: [{ kind: 'mana', symbols: ['R'] }] },
  cumulativeUpkeep: { kind: 'cumulativeUpkeep', cost: [{ kind: 'mana', symbols: ['1'] }] },
  storm: { kind: 'storm' },
  replicate: { kind: 'replicate', cost: [{ kind: 'mana', symbols: ['R'] }] },
  gift: { kind: 'gift', gift: 'card' },
  livingWeapon: { kind: 'livingWeapon' },
  jobSelect: { kind: 'jobSelect' },
  escalate: { kind: 'escalate', cost: [{ kind: 'mana', symbols: ['1'] }] },
  hideaway: { kind: 'hideaway', count: 3 },
  dethrone: { kind: 'dethrone' },
  readAhead: { kind: 'readAhead' },
  myriad: { kind: 'myriad' },
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
                    : // D-151: read ahead belongs to a Saga with chapter abilities (CR 702.155b).
                      kind === 'readAhead'
                      ? syntheticCard('SYNTHETIC Reading Rite')
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
        'attackBatch',
        'attacks',
        'becomesBlocked',
        'becomesTapped',
        'becomesUntapped',
        'becomesTarget',
        'blocks',
        'castSpell',
        'cycled',
        'chapter',
        'dealsCombatDamage',
        'dealtDamage',
        'combatDamageBatch',
        'countersAdded',
        'dies',
        'diesBatch',
        'discarded',
        'drawn',
        'endStep',
        'entersBatch',
        'entersBattlefield',
        'exiledFromLibraryOrGraveyard',
        'landfall',
        'leavesBattlefield',
        'leftGraveyard',
        'lifeGained',
        'permanentSacrificed',
        'ringTempted',
        'state',
        'step',
        'tappedForMana',
        'tapsForMana',
        'upkeep',
      ].sort(),
    );
    expect(SUPPORTED_FEATURES.abilityKinds).toContain('triggered');
    expect(SUPPORTED_FEATURES.abilityKinds).toContain('activated');
    expect(SUPPORTED_FEATURES.effectKinds).toContain('createToken');
    expect(SUPPORTED_FEATURES.sacrificeSelectors).toEqual(['this', 'choose', 'each']);
    expect(SUPPORTED_FEATURES.tokenPresets).toEqual(['Treasure', 'Food', 'Clue']);
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
      'castNth',
    ]);
    expect(SUPPORTED_FEATURES.manaAbilityCostKinds).toEqual([
      'tap',
      'sacrifice',
      'mana',
      'payLife',
      // Group 4 of the Vraska deck: "{T}, Mill a card" (Millikin).
      'mill',
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
      // D-991: a meld card (CR 701.42, 712.4).
      'meld',
    ]);
    expect(SUPPORTED_FEATURES.effectKinds).toEqual(expect.arrayContaining(['discard', 'search']));
    expect(SUPPORTED_FEATURES.effectKinds).toContain('modifyPt');
    expect(fixtureCard('Lightning Bolt').support).toBe('supported');
  });
});
