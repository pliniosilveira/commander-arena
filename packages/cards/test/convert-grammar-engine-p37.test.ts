// Parsed text is only worth something if the engine runs it as written (stage P37). These tests import SYNTHETIC cards through the grammar (never
// through a fixture), define them in an engine scenario and play them through applyAction: the Korvold deck's triggers and small statics slice of
// D-179 and D-180 (ENGINE_VERSION 38). A trigger for a card that was cycled, the mana value of the spell that caused a cast trigger, damage to a
// player and each creature that player controls, a card put into a graveyard from the battlefield this turn, a land put onto the battlefield and
// lands that enter untapped, a requirement on the creatures of the opponents until the next turn, and an Equipment with a count of colors and a
// restriction on casting. Every card name starts with "SYNTHETIC"; the wording of each text is that of the real cards of the slice (the owner's
// request file of 2026-10-29, names replaced by ~). No real card's text is claimed.
import { validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';
const FILLER = Array.from({ length: 12 }, () => 'Mountain');

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};
const treasures = (g: ScenarioGame): number =>
  g.events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Treasure').length;

// ---- When you cycle this card (CR 702.29c)

describe('"Cycling {1}. When you cycle this card, create two Treasure tokens."', () => {
  const cycler = parsed(
    'SYNTHETIC Parsed Cycler',
    'Creature — Demon',
    'Cycling {1}\nWhen you cycle this card, create two Treasure tokens.',
    { manaCost: '{4}{B}', colors: ['B'], power: '3', toughness: '3' },
  );

  test('the card is valid', () => {
    expect(validateCard(cycler)).toEqual([]);
  });

  test('cycling it makes two Treasures, and the card it draws comes too', () => {
    const g = scenario()
      .seat(0)
      .define(cycler)
      .hand(cycler.name)
      .battlefield('Mountain')
      .library('Plains', 'Island')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).activate(cycler.name, { pay: true });
    g.passAll();
    expect(treasures(g)).toBe(2);
    g.expect.handSize(0, 1);
    g.expect.zone(cycler.name, 'graveyard', { seat: 0 });
  });

  test('putting it into the graveyard any other way (it dies) is not cycling', () => {
    const g = scenario()
      .seat(0)
      .define(cycler)
      .battlefield(cycler.name, 'Mountain')
      .hand(BOLT)
      .library('Plains', 'Island')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(BOLT, { targets: [cycler.name], pay: true });
    resolveTop(g);
    g.expect.zone(cycler.name, 'graveyard', { seat: 0 });
    expect(treasures(g)).toBe(0);
  });
});

// ---- The mana value of the spell that caused the trigger (CR 202.3, 601.2i)

describe('"Whenever an opponent casts a spell, ~ deals damage equal to that spell\'s mana value to any target."', () => {
  const echo = parsed(
    'SYNTHETIC Parsed Echo',
    'Legendary Creature — Human Shaman',
    "Whenever an opponent casts a spell, ~ deals damage equal to that spell's mana value to any target.",
    { manaCost: '{5}{B}{R}', colors: ['B', 'R'], power: '5', toughness: '5' },
  );
  const play = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(echo)
      .battlefield(echo.name)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .hand(ANGEL, BOLT)
      .battlefield('Mountain', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(echo)).toEqual([]);
  });

  test('a spell of mana value 5 is 5 damage, to the target chosen for the trigger', () => {
    const g = play();
    g.act(1).cast(ANGEL, { pay: true });
    g.act(0).chooseTargets({ player: 1 });
    resolveTop(g);
    g.expect.life(1, 15);
  });

  test('a spell of mana value 1 is 1 damage', () => {
    const g = play();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.act(0).chooseTargets({ player: 1 });
    resolveTop(g);
    g.expect.life(1, 19);
  });
});

// ---- X damage to a player and each creature that player controls (CR 109.4, 120.2)

describe('"~ deals X damage to target player or planeswalker and each creature that player or that planeswalker\'s controller controls."', () => {
  const blast = parsed(
    'SYNTHETIC Parsed Blast',
    'Sorcery',
    "~ deals X damage to target player or planeswalker and each creature that player or that planeswalker's controller controls.",
    { manaCost: '{X}{B}{R}{G}', colors: ['B', 'R', 'G'] },
  );
  const cast = (target: 0 | 1) => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(blast)
      .hand(blast.name)
      .battlefield('Swamp', 'Mountain', 'Forest', 'Forest', 'Forest', 'Forest', BEARS)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(ANGEL, 'Typhoid Rats')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(blast.name, { targets: [{ player: target }], x: 2, pay: true });
    resolveTop(g);
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(blast)).toEqual([]);
  });

  test('the opponent, and the creatures of the opponent only', () => {
    const g = cast(1);
    g.expect.life(1, 18);
    g.expect.life(0, 20);
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1 });
    g.expect.damage(ANGEL, 2);
    g.expect.damage(BEARS, 0);
  });

  test('aimed at yourself it is your own creatures that are dealt it', () => {
    const g = cast(0);
    g.expect.life(0, 18);
    g.expect.life(1, 20);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.damage(ANGEL, 0);
  });
});

// ---- A card put into a graveyard from the battlefield this turn (CR 700.4)

describe('"When ~ enters, exile target creature card from an opponent\'s graveyard that was put there from the battlefield this turn, then create X Treasure tokens, where X is the exiled card\'s power."', () => {
  const skimmer = parsed(
    'SYNTHETIC Parsed Skimmer',
    'Legendary Creature — Halfling Citizen',
    "When ~ enters, exile target creature card from an opponent's graveyard that was put there from the battlefield this turn, then create X Treasure tokens, where X is the exiled card's power.",
    { manaCost: '{2}{B}', colors: ['B'], power: '2', toughness: '2' },
  );
  const base = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(skimmer)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Mountain')
      .hand(skimmer.name, BOLT)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER);

  test('the card is valid', () => {
    expect(validateCard(skimmer)).toEqual([]);
  });

  test('a creature of the opponent that died this turn is exiled and its power is the number of Treasures: the Bears are 2', () => {
    const g = base().seat(1).battlefield(BEARS).at('precombatMain').build();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.act(0).cast(skimmer.name, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.expect.zone(BEARS, 'exile');
    expect(treasures(g)).toBe(2);
  });

  test('a creature that was already in the graveyard is not a target: nothing happens', () => {
    const g = base().seat(1).graveyard(BEARS).at('precombatMain').build();
    g.act(0).cast(skimmer.name, { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(treasures(g)).toBe(0);
  });
});

// ---- A land put onto the battlefield, and lands that enter untapped (CR 614.12)

describe('"When ~ enters, draw a card, then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way, you gain 4 life. Lands you control enter untapped."', () => {
  const spelunking = parsed(
    'SYNTHETIC Parsed Spelunking',
    'Enchantment',
    'When ~ enters, draw a card, then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way, you gain 4 life.\nLands you control enter untapped.',
    { manaCost: '{2}{G}', colors: ['G'] },
  );
  const cave = parsed('SYNTHETIC Parsed Cave', 'Land — Cave', '~ enters tapped.\n{T}: Add {C}.');
  const play = (library: string[], hand: string[]) => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(spelunking)
      .define(cave)
      .hand(spelunking.name, ...hand)
      .battlefield('Forest', 'Forest', 'Forest')
      .library(...library)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(spelunking.name, { pay: true });
    resolveTop(g);
    return g;
  };

  test('the cards are valid', () => {
    expect(validateCard(spelunking)).toEqual([]);
    expect(validateCard(cave)).toEqual([]);
  });

  test('a Cave put onto the battlefield gains 4 life, and it enters untapped though it says it enters tapped', () => {
    const g = play(['Plains', 'Island'], [cave.name]);
    g.passAll(); // the enters trigger: a card is drawn, then the land is asked about
    g.expect.handSize(0, 2); // the Plains drawn and the Cave
    g.act(0).chooseCards(cave.name);
    g.expect.zone(cave.name, 'battlefield', { seat: 0 });
    g.expect.tapped(cave.name, false);
    g.expect.life(0, 24);
  });

  test('another land put onto the battlefield gains nothing, and enters untapped', () => {
    const g = play(['Plains', 'Island'], ['Mountain']);
    g.passAll();
    g.act(0).chooseCards('Mountain');
    g.expect.zone('Mountain', 'battlefield', { seat: 0 });
    g.expect.life(0, 20);
  });

  test('putting no land onto the battlefield gains nothing', () => {
    const g = play(['Plains', 'Island'], [cave.name]);
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone(cave.name, 'hand', { seat: 0 });
    g.expect.life(0, 20);
  });

  test('a land played from the hand enters untapped while it is out', () => {
    const g = play(['Plains', 'Island'], [cave.name, 'Mountain']);
    g.passAll();
    g.act(0).chooseCards();
    g.act(0).playLand(cave.name);
    g.expect.tapped(cave.name, false);
  });
});

// ---- Creatures must attack until the controller's next turn (CR 508.1d, 611.2a)

describe('"When ~ enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able. Whenever an attacking creature dies, each opponent loses 1 life and you gain 1 life."', () => {
  const kardur = parsed(
    'SYNTHETIC Parsed Doomscourge',
    'Legendary Creature — Demon Berserker',
    'When ~ enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able.\nWhenever an attacking creature dies, each opponent loses 1 life and you gain 1 life.',
    { manaCost: '{2}{B}{R}', colors: ['B', 'R'], power: '3', toughness: '3' },
  );
  const cast = () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(kardur)
      .hand(kardur.name)
      .battlefield('Swamp', 'Swamp', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(ANGEL, 'Typhoid Rats')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(kardur.name, { pay: true });
    resolveTop(g);
    resolveTop(g);
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(kardur)).toEqual([]);
  });

  test("on the opponent's turn every creature that can attack must, and the declaration without them is refused", () => {
    const g = cast();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect([...d.mustAttack].sort()).toEqual([g.id(ANGEL), g.id('Typhoid Rats')].sort());
    expect(g.act(1).try.declareAttackers([]).ok).toBe(false);
  });

  test("it is over when the controller's next turn begins", () => {
    const g = cast();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(0);
    expect(g.state.continuousEffects).toEqual([]);
  });

  test('an attacking creature that dies makes each opponent lose 1 life and its controller gain 1', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(kardur)
      .battlefield(kardur.name, BEARS)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(ANGEL)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.pass();
    g.pass();
    g.act(1).declareBlockers([{ blocker: ANGEL, attacker: BEARS }]);
    g.passAll();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.life(1, 19);
    g.expect.life(0, 21);
  });

  test('a creature that dies without attacking does not', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .define(kardur)
      .battlefield(kardur.name, 'Mountain')
      .hand(BOLT)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Typhoid Rats')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(BOLT, { targets: ['Typhoid Rats'], pay: true });
    resolveTop(g);
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1 });
    g.expect.life(1, 20);
    g.expect.life(0, 20);
  });
});

// ---- Colors among permanents, and opponents that can't cast spells during your turn (CR 105.2, 101.2)

describe('"Equipped creature gets +1/+1 for each color among permanents you control. As long as ~ is attached to a creature, your opponents can\'t cast spells during your turn. Equip {2}"', () => {
  const flail = parsed(
    'SYNTHETIC Parsed Flail',
    'Artifact — Equipment',
    "Equipped creature gets +1/+1 for each color among permanents you control.\nAs long as ~ is attached to a creature, your opponents can't cast spells during your turn.\nEquip {2}",
    { manaCost: '{2}' },
  );
  const board = () =>
    scenario()
      .seat(0)
      .life(20)
      .define(flail)
      .battlefield(flail.name, BEARS, 'Mountain', 'Mountain', 'Mountain')
      .hand(BOLT)
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Mountain')
      .hand(BOLT)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card is valid', () => {
    expect(validateCard(flail)).toEqual([]);
  });

  test('the creature gets +1/+1 for each color the permanents have between them', () => {
    const g = board();
    g.act(0).activate(flail.name, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.attached(flail.name, BEARS);
    // Only green (the Bears): the Equipment and the lands are colorless.
    g.expect.pt(BEARS, 3, 3);
  });

  test('while it is attached an opponent cannot cast a spell during my turn, and I can', () => {
    const g = board();
    g.act(0).activate(flail.name, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    expect(g.state.pending).toMatchObject({ kind: 'priority', seat: 1 });
    expect(g.act(1).try.cast(BOLT).ok).toBe(false);
  });

  test('unattached it stops nothing', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    expect(g.state.pending).toMatchObject({ kind: 'priority', seat: 1 });
    expect(g.act(1).try.cast(BOLT).ok).toBe(true);
  });
});
