// Triggers and small statics of the Korvold slice 4 (D-179). Pins: CR 202.3 and 601.2i (the mana value of the spell that caused a cast trigger),
// CR 702.29c (a trigger for a card that was cycled), CR 105.2 (the colors among permanents), CR 101.2 and 604.1 (a restriction on casting that holds
// while a condition does), CR 614.12 (lands entering untapped), CR 508.1d and 611.2a (a requirement on creatures until the controller's next turn),
// CR 700.4 (put into a graveyard from the battlefield). Cards are SYNTHETIC (src/cards/fixtures/synthetic-korvold-triggers.ts), the real
// fixtures named, or the cards of other synthetic files.
import { describe, expect, test } from 'vitest';
import { type Action, getLegalActions, syntheticCard, validateCard } from '../src/index';
import { attackCandidates } from '../src/rules/combat-legality';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const ECHO = 'SYNTHETIC Spell Echo';
const PRISM = 'SYNTHETIC Prism Blade';
const SEAL = 'SYNTHETIC Tide Seal';
const BLAST = 'SYNTHETIC Rolling Blast';
const SKIMMER = 'SYNTHETIC Grave Skimmer';
const HALL = 'SYNTHETIC Daylight Hall';
const SLOW = 'SYNTHETIC Slow Land';
const SHOCK = 'SYNTHETIC Shock Land';
const GATE = 'SYNTHETIC Fetch Gate';
const HORROR = 'SYNTHETIC Herding Horror';
const CRY = 'SYNTHETIC Forced March';
const FLASH_BEAR = 'SYNTHETIC Flash Bear';
const CYCLER = 'SYNTHETIC Treasure Cycler';
const SEER = 'SYNTHETIC Landcycler Seer';
const BANE = 'SYNTHETIC Attack Bane';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const ANGEL = 'Serra Angel';

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

describe('the cards are valid', () => {
  test.each([ECHO, PRISM, SEAL, BLAST, SKIMMER, HALL, SLOW, HORROR, CRY, CYCLER, SEER, BANE])(
    '%s',
    (name) => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    },
  );
});

// ---- The mana value of the spell that caused the trigger (CR 202.3, 601.2i)

describe('"Whenever an opponent casts a spell, ~ deals damage equal to that spell\'s mana value to any target."', () => {
  const setup = () =>
    scenario()
      .seat(0)
      .life(20)
      .battlefield(ECHO)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .hand(BOLT, ANGEL)
      .battlefield('Mountain', 'Plains', 'Plains', 'Plains', 'Plains')
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 1 })
      .build();

  test('a spell of mana value 1 makes it deal 1; of mana value 5 makes it deal 5', () => {
    const g = setup();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    // The trigger asks for a target as it goes on the stack: any target, here seat 1.
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected a target, got ${d?.kind}`);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.stack([`${ECHO} (ability)`, BOLT]);
    resolveTop(g);
    g.expect.life(1, 19);
    resolveTop(g);
    g.expect.life(0, 17);
  });

  test('the mana value is read from the spell: the Angel (mana value 5) makes it deal 5', () => {
    const g = setup();
    g.act(1).cast(ANGEL, { pay: true });
    g.act(0).chooseTargets({ player: 1 });
    resolveTop(g);
    g.expect.life(1, 15);
  });

  test('a spell its controller casts does not trigger it', () => {
    const g = twoSeatGame((b) => b.battlefield(ECHO).hand(BOLT).battlefield('Mountain'));
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
  });
});

// ---- The colors among permanents (CR 105.2) as the amount of a static +N/+N

describe('"Equipped creature gets +1/+1 for each color among permanents you control."', () => {
  const equipped = (extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) => {
    const g = twoSeatGame((b) =>
      extra(b.battlefield(PRISM, BEARS, 'Mountain', 'Mountain'))
        .hand()
        .battlefield('Plains'),
    );
    g.act(0).activate(PRISM, { targets: [BEARS], pay: true });
    resolveTop(g);
    return g;
  };

  test('a green creature alone makes it +1/+1: one color among the permanents', () => {
    const g = equipped((b) => b);
    g.expect.attached(PRISM, BEARS);
    g.expect.pt(BEARS, 3, 3);
  });

  test('each color counts once however many permanents have it, and colorless adds none', () => {
    const g = equipped((b) => b.battlefield(ANGEL, 'Llanowar Elves'));
    // Green (Bears, Elves), white (Angel): two colors.
    g.expect.pt(BEARS, 4, 4);
  });

  test("the colors of the opponent's permanents are not counted", () => {
    const g = twoSeatGame(
      (b) => b.battlefield(PRISM, BEARS, 'Mountain'),
      (b) => b.battlefield(ANGEL),
    );
    g.act(0).activate(PRISM, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.pt(BEARS, 3, 3);
  });
});

// ---- Opponents can't cast spells during your turn, while attached (CR 101.2, 604.1)

describe('"As long as this Equipment is attached to a creature, your opponents can\'t cast spells during your turn."', () => {
  const castable = (g: ScenarioGame, seat: 0 | 1, name: string) => {
    const id = g.id({ name, zone: 'hand', seat });
    return getLegalActions(g.state, seat).some(
      (a: Action) => a.kind === 'castSpell' && a.object === id,
    );
  };
  const board = (attach: boolean) => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(SEAL, BEARS, 'Mountain', 'Mountain')
      .hand(BOLT)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Mountain')
      .hand(BOLT)
      .library('Plains', 'Plains')
      .at('precombatMain')
      .build();
    if (attach) {
      g.act(0).activate(SEAL, { targets: [BEARS], pay: true });
      resolveTop(g);
    }
    return g;
  };

  test('unattached, the opponent can cast an instant during my turn', () => {
    const g = board(false);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    expect(g.state.pending).toMatchObject({ kind: 'priority', seat: 1 });
    expect(castable(g, 1, BOLT)).toBe(true);
  });

  test('attached to a creature, the opponent cannot cast during my turn, and I still can', () => {
    const g = board(true);
    g.expect.attached(SEAL, BEARS);
    expect(castable(g, 0, BOLT)).toBe(true);
    // A spell on the stack gives seat 1 priority during seat 0's turn.
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    expect(g.state.pending?.kind).toBe('priority');
    g.act(0).pass();
    expect(g.state.pending).toMatchObject({ kind: 'priority', seat: 1 });
    expect(castable(g, 1, BOLT)).toBe(false);
    expect(g.act(1).try.cast(BOLT).ok).toBe(false);
  });

  test("the same Equipment does not stop the opponent during the opponent's own turn", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(SEAL, BEARS)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Mountain')
      .hand(BOLT)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 1 })
      .build();
    expect(castable(g, 1, BOLT)).toBe(true);
  });
});

// ---- Each creature that player controls, the player being a target (CR 109.4)

describe('"~ deals X damage to target player and each creature that player controls."', () => {
  const blast = (target: 0 | 1) => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Mountain', 'Forest', 'Mountain', 'Forest', BEARS, 'Llanowar Elves')
      .hand(BLAST)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield(ANGEL, 'Typhoid Rats')
      .library('Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast(BLAST, { targets: [{ player: target }], x: 2, pay: true });
    resolveTop(g);
    return g;
  };

  test('the opponent and only the creatures the opponent controls are dealt the damage', () => {
    const g = blast(1);
    g.expect.life(1, 18);
    g.expect.life(0, 20);
    g.expect.damage(BEARS, 0);
    g.expect.damage('Llanowar Elves', 0);
    g.expect.damage(ANGEL, 2);
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1 });
  });

  test('aimed at yourself, it is your creatures that take it', () => {
    const g = blast(0);
    g.expect.life(0, 18);
    g.expect.life(1, 20);
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.damage(ANGEL, 0);
  });
});

// ---- A card put into a graveyard from the battlefield this turn (CR 700.4)

describe('"... exile target creature card from an opponent\'s graveyard that was put there from the battlefield this turn, then create X Treasure tokens, where X is the exiled card\'s power."', () => {
  const treasures = (g: ScenarioGame) =>
    g.events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Treasure').length;
  const base = () =>
    scenario()
      .seat(0)
      .life(20)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Mountain')
      .hand(SKIMMER, BOLT)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains');

  test('a creature that died this turn is the target: its power is the number of Treasures, and it is exiled', () => {
    const g = base().seat(1).battlefield(BEARS).at('precombatMain').build();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.act(0).cast(SKIMMER, { pay: true });
    resolveTop(g); // the creature
    resolveTop(g); // its trigger, if it has a target
    g.expect.zone(BEARS, 'exile');
    expect(treasures(g)).toBe(2);
  });

  test('a creature that was already in the graveyard when the turn began is not a target: nothing happens', () => {
    const g = base().seat(1).graveyard(BEARS).at('precombatMain').build();
    g.act(0).cast(SKIMMER, { pay: true });
    resolveTop(g); // the creature
    resolveTop(g); // its trigger, if it has a target
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(treasures(g)).toBe(0);
  });

  test("a creature of mine that died this turn is not in an opponent's graveyard", () => {
    const g = base().seat(0).battlefield(BEARS).at('precombatMain').build();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.act(0).cast(SKIMMER, { pay: true });
    resolveTop(g); // the creature
    resolveTop(g); // its trigger, if it has a target
    expect(treasures(g)).toBe(0);
  });

  test('the record is for one turn: it is empty again when the next turn begins', () => {
    const g = base().seat(1).battlefield(BEARS).at('precombatMain').build();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    resolveTop(g);
    expect(g.state.turnLog.graveyarded).toHaveLength(1);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.turnLog.graveyarded).toEqual([]);
  });
});

// ---- Lands you control enter untapped (CR 614.1c, 614.12)

describe('"Lands you control enter untapped."', () => {
  const play = (land: string, withHall: boolean) => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(...(withHall ? [HALL] : []))
      .hand(land)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.act(0).playLand(land);
    return g;
  };
  const tapped = (g: ScenarioGame, name: string) => g.state.objects[g.id(name)]?.tapped;

  test('a land that enters tapped on its own enters untapped', () => {
    expect(tapped(play(SLOW, true), SLOW)).toBe(false);
  });

  test('without the permanent it enters tapped', () => {
    expect(tapped(play(SLOW, false), SLOW)).toBe(true);
  });

  test('a land that is not tapped to begin with is untapped, of course', () => {
    expect(tapped(play('Forest', true), 'Forest')).toBe(false);
  });

  test('a land with "you may pay 2 life, if you don\'t it enters tapped" enters untapped and is not asked', () => {
    const g = play(SHOCK, true);
    expect(g.state.pending?.kind).toBe('priority');
    expect(tapped(g, SHOCK)).toBe(false);
    g.expect.life(0, 20);
  });

  test('without the permanent that land asks about the 2 life', () => {
    const g = play(SHOCK, false);
    expect(g.state.pending?.kind).toBe('confirmOptional');
  });

  test('a land an effect puts onto the battlefield tapped enters untapped too', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(HALL, GATE, 'Forest')
      .library('Island', { label: 'island' })
      .seat(1)
      .library('Plains')
      .at('precombatMain')
      .build();
    g.act(0).activate(GATE);
    g.passAll();
    g.act(0).chooseCards('island');
    // Two lands after the fetch: the Gate's own "if you control four or more lands, untap" does not apply, so only the permanent untaps it.
    expect(tapped(g, 'Island')).toBe(false);
  });

  test('the opponent\'s lands are not affected: it is "lands you control"', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(HALL)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .hand(SLOW)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).playLand(SLOW);
    expect(tapped(g, SLOW)).toBe(true);
  });
});

// ---- Creatures must attack until the controller's next turn (CR 508.1d, 611.2a)

describe('"When ~ enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able."', () => {
  const cast = () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Swamp', 'Swamp', 'Mountain', 'Mountain', BEARS)
      .hand(HORROR)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Mountain', 'Forest', 'Mountain', ANGEL, 'Typhoid Rats')
      .hand(FLASH_BEAR)
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast(HORROR, { pay: true });
    resolveTop(g);
    resolveTop(g); // the enters trigger
    return g;
  };
  const toOpponentsAttack = (g: ScenarioGame) => {
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    return d;
  };

  test("on the opponent's next turn every creature that can attack must, and only they", () => {
    const g = cast();
    const d = toOpponentsAttack(g);
    expect([...d.mustAttack].sort()).toEqual([g.id(ANGEL), g.id('Typhoid Rats')].sort());
    expect(g.act(1).try.declareAttackers([]).ok).toBe(false);
    expect(g.act(1).try.declareAttackers([{ attacker: ANGEL }]).ok).toBe(false);
    expect(
      g.act(1).try.declareAttackers([{ attacker: ANGEL }, { attacker: 'Typhoid Rats' }]).ok,
    ).toBe(true);
  });

  test('a creature that entered after the effect began is required too: the effect is about the rules, not a set fixed at resolution (CR 611.2c)', () => {
    const g = cast();
    // The opponent flashes a creature in at the end of the turn: it is under their control by their next turn.
    g.advanceTo('endOfCombat');
    g.act(0).pass();
    g.act(1).cast(FLASH_BEAR, { pay: true });
    resolveTop(g);
    const d = toOpponentsAttack(g);
    expect(d.mustAttack).toContain(g.id(FLASH_BEAR));
  });

  test('my own creatures are not required to attack this turn: "creatures your opponents control"', () => {
    const g = cast();
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect(d.mustAttack).toEqual([]);
    expect(g.act(0).try.declareAttackers([]).ok).toBe(true);
  });

  test('it ends as my next turn begins', () => {
    const g = cast();
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.continuousEffects).toHaveLength(1);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.turn.activeSeat).toBe(0);
    expect(g.state.continuousEffects).toHaveLength(0);
  });

  test('"a player other than you": with a third player, the required attackers must attack that player', () => {
    const g = cast();
    const with3 = {
      ...g.state,
      seats: [...g.state.seats, { ...g.state.seats[1], id: 2 }] as typeof g.state.seats,
    };
    const angel = g.id(ANGEL);
    const candidates = attackCandidates({ ...with3, turn: { ...with3.turn, activeSeat: 1 } }, 1);
    const targets = candidates.find((c) => c.attacker === angel)?.targets ?? [];
    expect(targets).toEqual([{ kind: 'player', seat: 2 }]);
  });
});

describe('"Creatures your opponents control attack this turn if able."', () => {
  test('cast before their attackers are declared, it makes them attack, and it ends with the turn', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield('Mountain', 'Mountain')
      .hand(CRY)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield(ANGEL)
      .library('Plains', 'Plains', 'Plains')
      .at('beginningOfCombat', { active: 1, priority: 0 })
      .build();
    g.act(0).cast(CRY, { pay: true });
    resolveTop(g);
    g.expect.stack([]);
    expect(g.state.continuousEffects).toHaveLength(1);
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect(d.mustAttack).toEqual([g.id(ANGEL)]);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.continuousEffects).toHaveLength(0);
  });
});

// ---- When you cycle this card (CR 702.29c, 702.29f)

describe('"Cycling {1}. When you cycle this card, create two Treasure tokens."', () => {
  const treasures = (g: ScenarioGame) =>
    g.events.filter((e) => e.kind === 'tokenCreated' && e.name === 'Treasure').length;
  const build = (hand: string[] = [CYCLER]) =>
    scenario()
      .seat(0)
      .life(20)
      .hand(...hand)
      .battlefield('Mountain', 'Mountain')
      .library('Plains', 'Island', 'Swamp')
      .seat(1)
      .library('Plains', 'Plains')
      .at('precombatMain')
      .build();

  test('paying the cycling cost triggers it from the graveyard: the ability goes above the cycling ability and makes two Treasures', () => {
    const g = build();
    g.act(0).activate(CYCLER, { pay: true });
    g.expect.zone(CYCLER, 'graveyard', { seat: 0 });
    g.expect.stack([`${CYCLER} (ability)`, `${CYCLER} (ability)`]);
    expect(g.events.some((e) => e.kind === 'cycled' && e.seat === 0)).toBe(true);
    g.passAll();
    expect(treasures(g)).toBe(2);
    g.expect.handSize(0, 1); // and the card that cycling draws
  });

  test('discarding it any other way (the cleanup step) is not cycling: nothing triggers', () => {
    const g = scenario()
      .seat(0)
      .hand(CYCLER, 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .library('Plains', 'Island')
      .seat(1)
      .library('Plains', 'Plains')
      .at('end')
      .build();
    g.advanceTo('cleanup');
    g.act(0).chooseCards(CYCLER);
    g.expect.zone(CYCLER, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'cycled' });
    expect(g.state.pendingTriggers).toEqual([]);
    expect(treasures(g)).toBe(0);
  });
});

describe('"Basic landcycling {1}. When you cycle this card, you gain 2 life." (CR 702.29f: a typecycling cost is a cycling cost)', () => {
  test('discarding the card for its typecycling cost triggers it too', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(SEER)
      .battlefield('Forest')
      .library('Swamp', 'Plains')
      .seat(1)
      .library('Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.act(0).activate(SEER, { pay: true });
    g.passAll();
    g.expect.life(0, 22);
  });
});

// ---- A creature that was attacking when it died (CR 603.10a, 506.4)

describe('"Whenever an attacking creature dies, each opponent loses 1 life and you gain 1 life."', () => {
  const combat = () =>
    scenario()
      .seat(0)
      .life(20)
      .battlefield(BANE, BEARS)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield(ANGEL, 'Typhoid Rats')
      .library('Plains', 'Plains')
      .at('precombatMain')
      .build();

  test('an attacker that is killed by its blocker: the trigger looks back and finds that it was attacking', () => {
    const g = combat();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.act(0).pass();
    g.act(1).pass();
    g.act(1).declareBlockers([{ blocker: ANGEL, attacker: BEARS }]);
    g.passAll();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.life(1, 19);
    g.expect.life(0, 21);
  });

  test('a blocker that dies was not attacking: nothing happens', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(BANE, 'Giant Spider')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield(BEARS)
      .library('Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['Giant Spider']);
    g.act(0).pass();
    g.act(1).pass();
    g.act(1).declareBlockers([{ blocker: BEARS, attacker: 'Giant Spider' }]);
    g.passAll();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(1, 20);
    g.expect.life(0, 20);
  });

  test('a creature that dies outside combat was not attacking', () => {
    const g = twoSeatGame((b) => b.battlefield(BANE, BEARS, 'Mountain').hand(BOLT));
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.life(1, 20);
  });
});
