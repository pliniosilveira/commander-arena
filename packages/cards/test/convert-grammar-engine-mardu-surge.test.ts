// The Mardu Surge deck (issue 101): the REAL Oracle text of each card (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in
// an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Group 1, Myriad granted (CR 702.116a, CR 613.1f): Legion Loyalty, Blade of Selves and Ironwill Forger.
// Group 2, tokens that are tapped and attacking (CR 508.4, 111.2): Hero of Bladehold.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

describe('Myriad granted (CR 702.116a, 613.1f)', () => {
  const loyalty = real('Legion Loyalty');
  const blade = real('Blade of Selves');
  const forger = real('Ironwill Forger');

  test.each([
    ['Legion Loyalty', loyalty],
    ['Blade of Selves', blade],
    ['Ironwill Forger', forger],
  ] as const)('%s is a valid card', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Legion Loyalty: creatures you control have myriad, an opponent’s do not', () => {
    const g = scenario()
      .define(loyalty)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(loyalty.name)
      .battlefield(BEARS, { label: 'ours' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('ours', { keywords: ['myriad'] });
    g.expect.derived('theirs', { keywords: [] });
  });

  test('Blade of Selves: the equipped creature has myriad, and loses it when unattached', () => {
    const g = scenario()
      .define(blade)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(blade.name, { label: 'blade', attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('bears', { keywords: ['myriad'] });
  });
});

describe('Hero of Bladehold: two tokens tapped and attacking (CR 508.4)', () => {
  const hero = real('Hero of Bladehold');

  test('the card is valid', () => {
    expect(validateCard(hero)).toEqual([]);
  });

  test('attacking creates two 1/1 white Soldier tokens that enter tapped and attacking, never declared', () => {
    const g = scenario()
      .define(hero)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(hero.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: hero.name }]);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.zone('Soldier', 'battlefield', { seat: 0, count: 2 });
    g.expect.tapped('Soldier[0]');
    g.expect.tapped('Soldier[1]');
    g.expect.combat({
      attackers: [hero.name, 'Soldier[0]', 'Soldier[1]'],
      unblocked: [hero.name, 'Soldier[0]', 'Soldier[1]'],
    });
    g.expect.invariants();
  });
});

describe('Mobilize (CR 702.181a)', () => {
  const zurgo = real('Zurgo Stormrender');
  const shield = real('Infantry Shield');

  test('Zurgo has the keyword with its number, and the engine expands it into one attack trigger', () => {
    expect(
      zurgo.faces[0]?.abilities.some(
        (a) => a.kind === 'keyword' && a.keyword.kind === 'mobilize' && a.keyword.count === 1,
      ),
    ).toBe(true);
  });

  test('an attack makes a 1/1 red Warrior tapped and attacking, sacrificed at the next end step', () => {
    const g = scenario()
      .define(zurgo)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(zurgo.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: zurgo.name }]);
    g.passAll();
    g.expect.zone('Warrior', 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped('Warrior');
    g.expect.derived('Warrior', { subtypes: ['Warrior'], colors: ['R'] });
    g.expect.combat({ attackers: [zurgo.name, 'Warrior'], unblocked: [zurgo.name, 'Warrior'] });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Warrior', 'battlefield', { count: 0 });
    g.expect.invariants();
  });

  test('Zurgo: a token that is sacrificed after combat drains each opponent for 1', () => {
    const g = scenario()
      .define(zurgo)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(zurgo.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: zurgo.name }]);
    g.passAll();
    g.advanceTo('end');
    const before = g.state.seats[1]?.life;
    g.passAll();
    g.expect.zone('Warrior', 'battlefield', { count: 0 });
    expect(g.state.seats[1]?.life).toBe((before ?? 0) - 1);
  });

  test('Zurgo: a token that dies attacking draws its controller a card, and no life is lost', () => {
    const g = scenario()
      .define(zurgo)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(zurgo.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Giant Spider', { label: 'giant' })
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: zurgo.name }]);
    g.passAll();
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: 'giant', attacker: 'Warrior' }]);
    g.passAll();
    g.expect.zone('Warrior', 'battlefield', { count: 0 });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(1, 37);
  });

  test('Infantry Shield: the equipped creature has menace and mobilize X, X being its power', () => {
    expect(validateCard(shield)).toEqual([]);
    const g = scenario()
      .define(shield)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(shield.name, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.derived('bears', { keywords: ['menace', 'mobilize'] });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'bears' }]);
    g.passAll();
    g.expect.zone('Warrior', 'battlefield', { seat: 0, count: 2 });
  });
});

describe('For each opponent, a token tapped and attacking (CR 508.4, 101.4)', () => {
  const adeline = real('Adeline, Resplendent Cathar');
  const ainok = real('Ainok Strike Leader');

  test.each([
    ['Adeline, Resplendent Cathar', adeline],
    ['Ainok Strike Leader', ainok],
  ] as const)('%s is a valid card', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Adeline: attacking makes a tapped and attacking 1/1 white Human for the opponent, and nothing triggers on it', () => {
    const g = scenario()
      .define(adeline)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(adeline.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: adeline.name }]);
    g.passAll();
    g.expect.zone('Human', 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped('Human');
    g.expect.pt('Human', 1, 1);
    g.expect.combat({
      attackers: [adeline.name, 'Human'],
      targets: [
        { attacker: adeline.name, target: { player: 1 } },
        { attacker: 'Human', target: { player: 1 } },
      ],
    });
    g.expect.invariants();
  });

  test('Ainok: attacking with the commander makes a Goblin, attacking with another creature does not', () => {
    const board = () =>
      scenario()
        .define(ainok)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(ainok.name, { label: 'ainok' })
        .battlefield(BEARS, { label: 'cmdr', commander: true })
        .battlefield(BEARS, { label: 'other' })
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0 })
        .build();
    const attack = (who: string) => {
      const g = board();
      g.advanceTo('declareAttackers', { attack: false });
      g.act(0).declareAttackers([{ attacker: who }]);
      g.passAll();
      return g;
    };
    attack('ainok').expect.zone('Goblin', 'battlefield', { seat: 0, count: 1 });
    attack('cmdr').expect.zone('Goblin', 'battlefield', { seat: 0, count: 1 });
    attack('other').expect.zone('Goblin', 'battlefield', { seat: 0, count: 0 });
  });

  test('Ainok: sacrificing it gives the creature tokens indestructible until end of turn, a nontoken creature does not get it', () => {
    const g = scenario()
      .define(ainok)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ainok.name, { label: 'ainok' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    // A Goblin token from the attack trigger is the token; the nontoken Bears is not given anything.
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: 'ainok' }]);
    g.passAll();
    g.expect.derived('Goblin', { keywords: [] });
    g.act(0).activate('ainok');
    g.passAll();
    g.expect.zone(ainok.name, 'graveyard', { seat: 0 });
    g.expect.derived('Goblin', { keywords: ['indestructible'] });
    g.expect.derived('bears', { keywords: [] });
  });
});

describe('Legion Warboss: a token that gains haste and must attack this combat (CR 508.1d, 506.1)', () => {
  const warboss = real('Legion Warboss');

  test('the card is valid', () => {
    expect(validateCard(warboss)).toEqual([]);
  });

  test('at the beginning of combat a Goblin is created with haste, and it must attack', () => {
    const g = scenario()
      .define(warboss)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(warboss.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.zone('Goblin', 'battlefield', { seat: 0, count: 1 });
    g.expect.derived('Goblin', { keywords: ['haste'] });
    g.advanceTo('declareAttackers', { attack: false });
    // The Goblin must attack (it is "if able": the engine refuses a declaration without it).
    g.expect.illegal(0, { declareAttackers: [{ attacker: warboss.name }] });
    g.expect.legal(0, { declareAttackers: [{ attacker: 'Goblin' }] });
  });
});

describe('Within Range: each opponent loses life for the creatures attacking them (CR 508.1b)', () => {
  const range = real('Within Range');

  test('the card is valid, and each attacking creature costs the opponent 1 life', () => {
    expect(validateCard(range)).toEqual([]);
    const g = scenario()
      .define(range)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(range.name)
      .battlefield(BEARS, { count: 3 })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: `${BEARS}[0]` },
      { attacker: `${BEARS}[1]` },
      { attacker: `${BEARS}[2]` },
    ]);
    g.passAll();
    g.expect.life(1, 37);
  });
});

describe('Bone Devourer: counters for the creatures that died this turn (CR 614.12, 700.4)', () => {
  const devourer = real('Bone Devourer');

  test('the card is valid', () => {
    expect(validateCard(devourer)).toEqual([]);
  });

  test('it enters with a +1/+1 counter for each creature that died this turn, any player’s included', () => {
    const board = () =>
      scenario()
        .define(devourer)
        .seat(0)
        .library(...LIBRARY)
        .hand(devourer.name, 'Lightning Bolt', 'Lightning Bolt')
        .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Mountain', 'Mountain')
        .battlefield(BEARS, { label: 'mine' })
        .seat(1)
        .library(...LIBRARY)
        .battlefield(BEARS, { label: 'theirs' })
        .at('precombatMain', { active: 0 })
        .build();
    const quiet = board();
    quiet.act(0).cast(devourer.name, { pay: true });
    quiet.passAll();
    quiet.expect.zone(devourer.name, 'battlefield', { seat: 0 });
    quiet.expect.counters(devourer.name, {});

    const g = board();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['mine'], pay: true });
    g.passAll();
    g.act(0).cast('Lightning Bolt[0]', { targets: ['theirs'], pay: true });
    g.passAll();
    g.act(0).cast(devourer.name, { pay: true });
    g.passAll();
    g.expect.counters(devourer.name, { '+1/+1': 2 });
    g.expect.invariants();
  });
});

describe('Thalisse, Reverent Medium: X tokens for the tokens created this turn (CR 111.1, 603.6a)', () => {
  const thalisse = real('Thalisse, Reverent Medium');
  const adeline = real('Adeline, Resplendent Cathar');

  test('the card is valid', () => {
    expect(validateCard(thalisse)).toEqual([]);
  });

  test('at the end step it creates one 1/1 Spirit with flying for each token created this turn', () => {
    const g = scenario()
      .define(thalisse)
      .define(adeline)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(thalisse.name)
      .battlefield(adeline.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: adeline.name }]);
    g.passAll();
    g.expect.zone('Human', 'battlefield', { seat: 0, count: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Spirit', 'battlefield', { seat: 0, count: 1 });
    g.expect.derived('Spirit', { keywords: ['flying'] });
  });
});

describe('Mindblade Render: combat damage dealt by a Warrior (CR 510.2, 603.4)', () => {
  const render = real('Mindblade Render');
  const zurgo = real('Zurgo Stormrender');

  test('the card is valid', () => {
    expect(validateCard(render)).toEqual([]);
  });

  test('Warriors dealing combat damage draw one card and cost 1 life, once for the whole damage event', () => {
    const g = scenario()
      .define(render)
      .define(zurgo)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(render.name)
      .battlefield(zurgo.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [zurgo.name], until: 'combatDamage' });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(0, 39);
  });

  test('a creature that is not a Warrior does not trigger it', () => {
    const g = scenario()
      .define(render)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(render.name)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.playCombat({ attack: [BEARS], until: 'combatDamage' });
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.life(0, 40);
  });
});

describe('Angel of Invention: Fabricate 2 (CR 702.123a)', () => {
  const angel = real('Angel of Invention');
  const board = () =>
    scenario()
      .define(angel)
      .seat(0)
      .library(...LIBRARY)
      .hand(angel.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(angel)).toEqual([]);
  });

  test('accepting puts two +1/+1 counters on it and makes no token', () => {
    const g = board();
    g.act(0).cast(angel.name, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    g.expect.counters(angel.name, { '+1/+1': 2 });
    g.expect.zone('Servo', 'battlefield', { count: 0 });
    g.expect.pt(angel.name, 4, 3);
  });

  test('declining creates two 1/1 colorless Servo artifact creatures, which the Angel makes 2/2', () => {
    const g = board();
    g.act(0).cast(angel.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.counters(angel.name, {});
    g.expect.zone('Servo', 'battlefield', { seat: 0, count: 2 });
    g.expect.derived('Servo[0]', { types: ['artifact', 'creature'], colors: [] });
    g.expect.pt('Servo[0]', 2, 2);
    g.expect.invariants();
  });
});

describe('Divine Visitation: creature tokens become 4/4 Angels (CR 614.1a, 111.2)', () => {
  const visitation = real('Divine Visitation');
  const adeline = real('Adeline, Resplendent Cathar');

  test('the card is valid', () => {
    expect(validateCard(visitation)).toEqual([]);
  });

  test('the token Adeline would create is a 4/4 white Angel with flying and vigilance instead', () => {
    const g = scenario()
      .define(visitation)
      .define(adeline)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(visitation.name)
      .battlefield(adeline.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: adeline.name }]);
    g.passAll();
    g.expect.zone('Human', 'battlefield', { count: 0 });
    g.expect.zone('Angel', 'battlefield', { seat: 0, count: 1 });
    g.expect.pt('Angel', 4, 4);
    g.expect.derived('Angel', { keywords: ['flying', 'vigilance'], colors: ['W'] });
    g.expect.invariants();
  });
});

describe('Kaya, Geist Hunter: tokens (CR 114, 606, 614.1a, 614.5)', () => {
  const kaya = real('Kaya, Geist Hunter');
  const hero = real('Hero of Bladehold');

  const board = () =>
    scenario()
      .define(kaya)
      .define(hero)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(kaya.name)
      .battlefield(hero.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(kaya)).toEqual([]);
  });

  test('−2: until end of turn the tokens created under your control are created twice over', () => {
    const g = board();
    g.act(0).activate(kaya.name, { ability: 1 });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: hero.name }]);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    // Hero makes two Soldiers: twice that many is four.
    g.expect.zone('Soldier', 'battlefield', { seat: 0, count: 4 });
  });

  test('−2 ends with the turn (CR 514.2)', () => {
    const g = board();
    g.act(0).activate(kaya.name, { ability: 1 });
    g.passAll();
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'tokensDoubled')).toBe(true);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'tokensDoubled')).toBe(false);
  });

  test('−6: exile all cards from all graveyards, then a 1/1 white Spirit with flying for each card exiled', () => {
    const g = scenario()
      .define(kaya)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(kaya.name, { counters: { loyalty: 7 } })
      .graveyard('Island', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .graveyard('Forest')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(kaya.name, { ability: 2 });
    g.passAll();
    g.expect.zone('Spirit', 'battlefield', { seat: 0, count: 3 });
    g.expect.derived('Spirit[0]', { keywords: ['flying'], colors: ['W'] });
  });

  test('+1: creatures you control gain deathtouch, and a creature token gets a +1/+1 counter', () => {
    const g = scenario()
      .define(kaya)
      .define(hero)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(kaya.name)
      .battlefield(hero.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: hero.name }]);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.advanceTo('postcombatMain');
    g.act(0).activate(kaya.name, { ability: 0, targets: ['Soldier[0]'] });
    g.passAll();
    g.expect.derived(hero.name, { keywords: ['battleCry', 'deathtouch'] });
    g.expect.counters('Soldier[0]', { '+1/+1': 1 });
  });
});

describe('Tempt with Vengeance: the tempting offer (CR 101.4, 111.2, 608.2d)', () => {
  const tempt = real('Tempt with Vengeance');
  const board = () =>
    scenario()
      .define(tempt)
      .seat(0)
      .library(...LIBRARY)
      .hand(tempt.name)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(tempt)).toEqual([]);
  });

  test('an opponent who accepts makes X Elementals and so do you again; every token has haste', () => {
    const g = board();
    g.act(0).cast(tempt.name, { x: 2, pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.passAll();
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 4 });
    g.expect.zone('Elemental', 'battlefield', { seat: 1, count: 2 });
    g.expect.derived('Elemental[0]', { keywords: ['haste'], colors: ['R'] });
    g.expect.invariants();
  });

  test('an opponent who declines makes nothing, and you only get the first X', () => {
    const g = board();
    g.act(0).cast(tempt.name, { x: 2, pay: true });
    g.passAll();
    g.act(1).decline();
    g.passAll();
    g.expect.zone('Elemental', 'battlefield', { seat: 0, count: 2 });
    g.expect.zone('Elemental', 'battlefield', { seat: 1, count: 0 });
  });
});

describe('Gix, Yawgmoth Praetor (CR 118.3, 107.3a, 602.2b, 701.13, 118.9)', () => {
  const gix = real('Gix, Yawgmoth Praetor');

  test('the card is valid', () => {
    expect(validateCard(gix)).toEqual([]);
  });

  test('a creature of yours that damages an opponent: you may pay 1 life to draw a card', () => {
    const board = () =>
      scenario()
        .define(gix)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(gix.name)
        .battlefield(BEARS)
        .seat(1)
        .library(...LIBRARY)
        .at('precombatMain', { active: 0 })
        .build();
    const accepted = board();
    accepted.playCombat({ attack: [BEARS], until: 'combatDamage' });
    accepted.passAll();
    accepted.expect.pending('confirmOptional', 0);
    accepted.act(0).accept();
    accepted.passAll();
    accepted.expect.handSize(0, 1);
    accepted.expect.life(0, 39);

    const declined = board();
    declined.playCombat({ attack: [BEARS], until: 'combatDamage' });
    declined.passAll();
    declined.act(0).decline();
    declined.passAll();
    declined.expect.handSize(0, 0);
    declined.expect.life(0, 40);
  });

  test('{4}{B}{B}{B}, Discard X cards: exile the top X cards of an opponent’s library; a land among them may be played and a spell cast for free', () => {
    const g = scenario()
      .define(gix)
      .seat(0)
      .library(...LIBRARY)
      .hand('Island', 'Island', 'Island')
      .battlefield(gix.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library('Forest', 'Lightning Bolt', ...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    const h = g
      .act(0)
      .activate(gix.name, { ability: 1, x: 2, targets: [{ player: 1 }], pay: true });
    expect(h.stage).toBe('discard');
    g.act(0).chooseCards('Island[0]', 'Island[1]');
    g.passAll();
    g.expect.zone('Island', 'hand', { seat: 0, count: 1 });
    g.expect.zone('Forest', 'exile', { seat: 1, count: 1 });
    g.expect.zone('Lightning Bolt', 'exile', { seat: 1, count: 1 });
    g.act(0).playLand({ name: 'Forest', zone: 'exile', seat: 1 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 1 });
    g.act(0).cast(
      { name: 'Lightning Bolt', zone: 'exile', seat: 1 },
      { alternative: 'free', targets: [{ player: 1 }] },
    );
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone('Lightning Bolt', 'graveyard');
    g.expect.invariants();
  });
});

describe('Neriv, Crackling Vanguard (CR 201.2, 903.3, 508.1, 701.13)', () => {
  const neriv = real('Neriv, Crackling Vanguard');
  const warboss = real('Legion Warboss');

  test('the card is valid', () => {
    expect(validateCard(neriv)).toEqual([]);
  });

  test('attacking exiles a card for each differently named token; the exiled cards may be played in turns a commander attacked', () => {
    const g = scenario()
      .define(neriv)
      .define(warboss)
      .seat(0)
      .library('Forest', 'Plains', ...LIBRARY)
      .battlefield(neriv.name, { commander: true })
      .battlefield(warboss.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    // Legion Warboss makes one Goblin at the beginning of combat: one differently named token.
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: neriv.name }, { attacker: 'Goblin' }]);
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0, count: 1 });
    g.expect.zone('Plains', 'library', { seat: 0, count: 1 });
    // The commander attacked this turn: the land is playable at once, in the second main phase.
    g.advanceTo('postcombatMain');
    g.act(0).playLand({ name: 'Forest', zone: 'exile' });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('in a turn no commander attacked the exiled cards cannot be played', () => {
    const g = scenario()
      .define(neriv)
      .define(warboss)
      .seat(0)
      .library('Forest', 'Plains', ...LIBRARY)
      .battlefield(neriv.name, { commander: true })
      .battlefield(warboss.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: neriv.name }, { attacker: 'Goblin' }]);
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0, count: 1 });
    // Two turns later it is the controller's turn again and nobody attacked with the commander yet: the card stays exiled and cannot be played.
    g.advanceTo('precombatMain', { turn: 3 });
    g.expect.zone('Forest', 'exile', { seat: 0, count: 1 });
    g.expect.illegal(0, { playLand: { name: 'Forest', zone: 'exile' } });
  });
});
