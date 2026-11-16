// The Hylda deck (issue 42), group 3: the SYNTHETIC cards of `synthetic-hylda-g3.ts` played through applyAction.
// Pins: CR 109.4 and 608.2c (a count of the permanents a targeted player controls is made as the spell resolves), CR 107.3m ("When this creature enters, draw X cards" reads the X
// of the spell it came from), CR 603.4 (an intervening "if" is checked as the event happens and as the ability resolves), CR 701.24 and 108.3 (shuffling into the owners'
// libraries), CR 115.1 and 601.2c ("any number of target ... with different controllers"), CR 702.183a and 700.2h (Tiered), CR 700.2 (modes of a triggered ability),
// CR 701.26 (tap or untap), CR 702.11b (hexproof of a player), CR 615 and 609.7a (prevention of the damage of sources of a color), CR 611.2c (what an effect affects is set as it begins).
import { describe, expect, test } from 'vitest';
import { isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseOptionDecision, targetsDecision } from './pending-helpers';

const RAIDER = 'SYNTHETIC Dream Raider';
const SCHOLAR = 'SYNTHETIC Mana Scholar';
const HOUND = 'SYNTHETIC Landless Hound';
const SHUFFLER = 'SYNTHETIC Tide Shuffler';
const SMITER = 'SYNTHETIC Tiered Smiter';
const MONK = 'SYNTHETIC Spellcast Monk';
const KEEPER = 'SYNTHETIC Tide Keeper';
const SLIP = 'SYNTHETIC Sentry Slip';
const PRAYER = 'SYNTHETIC Warding Prayer';
const ALL = [RAIDER, SCHOLAR, HOUND, SHUFFLER, SMITER, MONK, KEEPER, SLIP, PRAYER];
const BEARS = 'Grizzly Bears';
const RATS = 'Typhoid Rats';
const ISAMARU = 'Isamaru, Hound of Konda';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Forest');

describe('the cards are valid and their features are claimed', () => {
  test.each(ALL)('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the features', () => {
    for (const feature of [
      'effect:grantPlayerHexproof',
      'amount:enteredX',
      'selector:differentControllers',
      'selector:controllerRef',
    ] as const) {
      expect(isFeatureSupported(feature), feature).toBe(true);
    }
  });
});

describe('Dream Raider: a count of the tapped creatures a target opponent controls (CR 109.4, 608.2c)', () => {
  const board = (tappedTheirs: number, untappedTheirs: number) => {
    const b = scenario();
    b.define(syntheticCard(RAIDER));
    b.seat(0)
      .library(...LIBRARY)
      .hand(RAIDER)
      .battlefield('Island', 'Island', 'Island')
      .battlefield(BEARS, { tapped: true, label: 'mine' });
    const theirs = b.seat(1).library(...LIBRARY);
    if (tappedTheirs > 0) theirs.battlefield(BEARS, { tapped: true, count: tappedTheirs });
    if (untappedTheirs > 0) theirs.battlefield(RATS, { count: untappedTheirs });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('draws one card for each tapped creature of that opponent, not for untapped ones or their own', () => {
    const g = board(2, 1);
    g.act(0).cast(RAIDER, { targets: [{ player: 1 }] }).pay();
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.librarySize(0, 6);
    g.expect.invariants();
  });

  test('no tapped creature of theirs: nothing is drawn', () => {
    const g = board(0, 2);
    g.act(0).cast(RAIDER, { targets: [{ player: 1 }] }).pay();
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('the player is a target of the spell', () => {
    const g = board(1, 0);
    g.act(0).cast(RAIDER);
    const slot = targetsDecision(g).specs[0];
    expect(slot?.legal).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
  });
});

describe('Mana Scholar: "When this creature enters, draw X cards" reads the X of the spell (CR 107.3m)', () => {
  const board = (lands: number) => {
    const b = scenario();
    b.define(syntheticCard(SCHOLAR));
    b.seat(0)
      .library(...LIBRARY)
      .hand(SCHOLAR)
      .battlefield(...Array.from({ length: lands }, () => 'Island'));
    b.seat(1).library(...LIBRARY);
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('cast with X = 3: the trigger draws three cards', () => {
    const g = board(6);
    g.act(0).cast(SCHOLAR).x(3).pay();
    g.passAll();
    g.expect.zone(SCHOLAR, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 3);
    g.expect.librarySize(0, 5);
    g.expect.invariants();
  });

  test('cast with X = 0: nothing is drawn', () => {
    const g = board(4);
    g.act(0).cast(SCHOLAR).x(0).pay();
    g.passAll();
    g.expect.zone(SCHOLAR, 'battlefield', { seat: 0 });
    g.expect.handSize(0, 0);
  });

  test('the permanent itself has no X: a copy put onto the battlefield by an effect is not a spell', () => {
    // The permanent placed by the scenario was never cast: its castX is absent.
    const b = scenario();
    b.define(syntheticCard(SCHOLAR));
    b.seat(0).library(...LIBRARY).battlefield(SCHOLAR, { label: 'scholar' });
    b.seat(1).library(...LIBRARY);
    const g = b.at('precombatMain', { active: 0 }).build();
    expect(g.object('scholar').castX).toBeUndefined();
  });
});

describe('Landless Hound: an intervening "if" about the lands (CR 603.4)', () => {
  const board = (mine: number, theirs: number) => {
    const b = scenario();
    b.define(syntheticCard(HOUND));
    b.seat(0)
      .library('Plains', 'Forest', 'Forest', 'Forest')
      .hand(HOUND)
      .battlefield(...Array.from({ length: mine }, () => 'Plains'));
    b.seat(1)
      .library(...LIBRARY)
      .battlefield(...Array.from({ length: theirs }, () => 'Forest'));
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('an opponent controls more lands: a basic Plains comes onto the battlefield tapped', () => {
    const g = board(2, 4);
    g.act(0).cast(HOUND).pay();
    g.passAll();
    g.act(0).chooseCards({ name: 'Plains', zone: 'library' });
    g.passAll();
    const found = g.find({ name: 'Plains', zone: 'battlefield', seat: 0 });
    expect(found).toHaveLength(3);
    expect(found.filter((o) => o.tapped).length).toBeGreaterThanOrEqual(3);
    g.expect.librarySize(0, 3);
    g.expect.invariants();
  });

  test('as many lands: the ability does not trigger', () => {
    const g = board(2, 2);
    g.act(0).cast(HOUND).pay();
    g.passAll();
    expect(g.find({ name: 'Plains', zone: 'battlefield', seat: 0 })).toHaveLength(2);
    g.expect.librarySize(0, 4);
  });

  test('fewer lands than you: the ability does not trigger', () => {
    const g = board(3, 1);
    g.act(0).cast(HOUND).pay();
    g.passAll();
    expect(g.find({ name: 'Plains', zone: 'battlefield', seat: 0 })).toHaveLength(3);
  });
});

describe('Tide Shuffler: shuffle itself and a creature with a stun counter into their owners\' libraries (CR 701.24, 108.3)', () => {
  const board = () => {
    const b = scenario();
    b.define(syntheticCard(SHUFFLER));
    b.seat(0)
      .library(...LIBRARY)
      .battlefield(SHUFFLER, { label: 'shuffler' })
      .battlefield('Island', 'Island');
    b.seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'stunned', counters: { stun: 1 } })
      .battlefield(RATS, { label: 'plain' });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('only a creature with a stun counter can be the target', () => {
    const g = board();
    g.act(0).activate(SHUFFLER);
    expect(targetsDecision(g).specs[0]?.legal).toEqual([
      { kind: 'object', id: g.id('stunned'), specId: 't1' },
    ]);
  });

  test('both go into their owners\' libraries', () => {
    const g = board();
    g.act(0).activate(SHUFFLER).targets(['stunned']).pay();
    g.passAll();
    g.expect.noObject(SHUFFLER, { zone: 'battlefield' });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    g.expect.zone(SHUFFLER, 'library', { seat: 0 });
    g.expect.zone(BEARS, 'library', { seat: 1 });
    g.expect.librarySize(0, 9);
    g.expect.librarySize(1, 9);
    g.expect.zone(RATS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});

describe('Tiered Smiter: any number of target tapped creatures with different controllers (CR 115.1, 601.2c, 702.183a)', () => {
  const board = () => {
    const b = scenario();
    b.define(syntheticCard(SMITER));
    b.seat(0)
      .library(...LIBRARY)
      .hand(SMITER)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS, { label: 'mine', tapped: true })
      .battlefield(ISAMARU, { label: 'myUntapped' });
    b.seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirA', tapped: true })
      .battlefield(RATS, { label: 'theirB', tapped: true })
      .battlefield(ISAMARU, { label: 'theirUntapped' });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('Cross-Slash: destroys one target tapped creature', () => {
    const g = board();
    g.act(0).cast(SMITER).modes(0).targets(['theirA']).pay();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(RATS, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('Blade Beam: one tapped creature of each controller', () => {
    const g = board();
    g.act(0).cast(SMITER).modes(1).targets(['theirA', 'mine']).pay();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(RATS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('Blade Beam: two targets with the same controller are refused', () => {
    const g = board();
    g.act(0).cast(SMITER).modes(1);
    const r = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [
        { kind: 'object', id: g.id('theirA'), specId: 't2' },
        { kind: 'object', id: g.id('theirB'), specId: 't2' },
      ],
    });
    expect(r.ok).toBe(false);
  });

  test('the slot says whose each target is and takes at most one for each player', () => {
    const g = board();
    g.act(0).cast(SMITER).modes(1);
    const slot = targetsDecision(g).specs[0];
    expect(slot?.onePerGroup).toBe(true);
    expect(slot?.eachController).toBe(true);
    expect(slot?.min).toBe(0);
    expect(slot?.max).toBe(2);
    // The untapped creatures are not legal targets.
    expect(slot?.legal).toHaveLength(3);
  });

  test('Blade Beam: no target at all is allowed', () => {
    const g = board();
    g.act(0).cast(SMITER).modes(1).targets([]).pay();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('Omnislash: destroys all tapped creatures and no untapped one', () => {
    const g = board();
    g.act(0).cast(SMITER).modes(2).pay();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(RATS, 'graveyard', { seat: 1 });
    g.expect.zone(ISAMARU, 'battlefield', { seat: 0 });
    g.expect.zone(ISAMARU, 'battlefield', { seat: 1 });
  });
});

describe('Spellcast Monk: a modal trigger of noncreature spells (CR 700.2, 603.3c)', () => {
  const board = () => {
    const b = scenario();
    b.define(syntheticCard(MONK));
    b.seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(MONK, { label: 'monk' });
    b.seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('tap target creature', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }] }).pay();
    g.act(0).chooseModes(0);
    g.act(0).chooseTargets('theirs');
    g.passAll();
    g.expect.tapped('theirs');
    g.expect.life(1, 37);
  });

  test('first strike and lifelink until end of turn', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }] }).pay();
    g.act(0).chooseModes(1);
    g.passAll();
    g.expect.derived('monk', { keywords: ['firstStrike', 'lifelink'] });
  });

  test('exile it, then return it to the battlefield tapped under its owner\'s control', () => {
    const g = board();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }] }).pay();
    g.act(0).chooseModes(2);
    g.passAll();
    g.expect.zone(MONK, 'battlefield', { seat: 0 });
    g.expect.tapped(MONK);
    g.expect.invariants();
  });
});

describe('Tide Keeper: "You may tap or untap target creature" (CR 701.26, 608.2d)', () => {
  const board = () => {
    const b = scenario();
    b.define(syntheticCard(KEEPER));
    b.seat(0)
      .library(...LIBRARY)
      .hand('Forest')
      .battlefield(KEEPER)
      .battlefield(BEARS, { label: 'mine' });
    b.seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs', tapped: true });
    return b.at('precombatMain', { active: 0 }).build();
  };

  const toTheChoice = () => {
    const g = board();
    g.act(0).playLand('Forest');
    g.act(0).chooseModes(0);
    g.act(0).chooseTargets('theirs');
    g.passAll();
    return g;
  };

  test('the controller is asked tap, untap or neither', () => {
    const g = toTheChoice();
    expect(chooseOptionDecision(g).options).toEqual(['Tap it', 'Untap it', 'Do nothing']);
  });

  test('untap it', () => {
    const g = toTheChoice();
    g.act(0).chooseOption('Untap it');
    g.expect.tapped('theirs', false);
  });

  test('tap it (already tapped: nothing changes)', () => {
    const g = toTheChoice();
    g.act(0).chooseOption('Tap it');
    g.expect.tapped('theirs', true);
  });

  test('do nothing', () => {
    const g = toTheChoice();
    g.act(0).chooseOption('Do nothing');
    g.expect.tapped('theirs', true);
    g.expect.invariants();
  });

  test('the other mode scries', () => {
    const g = board();
    g.act(0).playLand('Forest');
    g.act(0).chooseModes(1);
    g.passAll();
    g.expect.pending('arrangeCards', 0);
  });
});

describe('Sentry Slip: modes with a name before the dash (CR 207.2d)', () => {
  const board = () => {
    const b = scenario();
    b.define(syntheticCard(SLIP));
    b.seat(0)
      .library(...LIBRARY)
      .hand(SLIP)
      .battlefield('Island')
      .battlefield(BEARS, { label: 'mine' });
    b.seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'theirs' });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('Distract the Guard taps a creature', () => {
    const g = board();
    g.act(0).cast(SLIP).modes(0).targets(['theirs']).pay();
    g.passAll();
    g.expect.tapped('theirs');
  });

  test('Hide gives a creature you control hexproof', () => {
    const g = board();
    g.act(0).cast(SLIP).modes(1).targets(['mine']).pay();
    g.passAll();
    g.expect.derived('mine', { keywords: ['hexproof'] });
  });
});

describe('Warding Prayer: hexproof for a player and their permanents, and the damage of black and red sources (CR 702.11b, 615, 609.7a, 611.2c)', () => {
  const board = (active: 0 | 1) => {
    const b = scenario();
    for (const name of [PRAYER, SHUFFLER]) b.define(syntheticCard(name));
    b.seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(PRAYER, SHUFFLER, BOLT)
      .battlefield('Plains', 'Island', 'Island', 'Mountain')
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(BEARS, { label: 'mine2' });
    b.seat(1)
      .life(20)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(RATS, { label: 'rats' })
      .battlefield(ISAMARU, { label: 'isamaru' });
    return b.at('precombatMain', { active, priority: 0 }).build();
  };
  const bearsOf0 = (g: ReturnType<typeof board>) =>
    g.find({ name: BEARS, zone: 'battlefield', seat: 0 }).length;

  test('the opponent can no longer target the player or their permanents, but still its own', () => {
    const g = board(0);
    g.act(0).cast(PRAYER).pay();
    g.passAll();
    g.pass(0);
    g.act(1).cast(BOLT);
    const legal = targetsDecision(g).specs[0]?.legal ?? [];
    expect(legal).toHaveLength(3);
    expect(legal).toContainEqual({ kind: 'player', seat: 1, specId: 't1' });
    expect(legal).toContainEqual({ kind: 'object', id: g.id('rats'), specId: 't1' });
    expect(legal).toContainEqual({ kind: 'object', id: g.id('isamaru'), specId: 't1' });
    g.expect.invariants();
  });

  test('the player may still target themselves and their own permanents', () => {
    const g = board(0);
    g.act(0).cast(PRAYER).pay();
    g.passAll();
    g.act(0).cast(BOLT);
    const legal = targetsDecision(g).specs[0]?.legal ?? [];
    expect(legal).toContainEqual({ kind: 'player', seat: 0, specId: 't1' });
    expect(legal).toContainEqual({ kind: 'object', id: g.id('mine'), specId: 't1' });
  });

  test('a permanent that enters later has no hexproof, but its damage is prevented all the same', () => {
    const g = board(0);
    g.act(0).cast(PRAYER).pay();
    g.passAll();
    g.act(0).cast(SHUFFLER).pay();
    g.passAll();
    g.act(0).chooseTargets('rats');
    g.passAll();
    g.pass(0);
    g.act(1)
      .cast(BOLT, { targets: [g.id({ name: SHUFFLER, zone: 'battlefield' })] })
      .pay();
    g.passAll();
    g.expect.zone(SHUFFLER, 'battlefield', { seat: 0 });
    g.expect.damage(SHUFFLER, 0);
  });

  test('damage to the player itself is not prevented (only creatures are covered)', () => {
    const g = board(1);
    g.act(0).cast(PRAYER).pay();
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(1).attack(['rats', 'isamaru']);
    g.passAll();
    g.act(0).noBlocks();
    g.passAll();
    g.expect.life(0, 17);
  });

  test('combat: the damage of a black source to the creatures is prevented, a white source is not', () => {
    const g = board(1);
    g.act(0).cast(PRAYER).pay();
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(1).attack(['rats', 'isamaru']);
    g.passAll();
    g.act(0).declareBlockers([
      { blocker: g.id('mine'), attacker: 'rats' },
      { blocker: g.id('mine2'), attacker: 'isamaru' },
    ]);
    g.passAll();
    // The Rats' deathtouch damage was prevented: one Bears survives; the white Isamaru's was not: the Bears blocking it died.
    expect(bearsOf0(g)).toBe(1);
  });

  test('the hexproof ends with the turn', () => {
    const g = board(0);
    g.act(0).cast(PRAYER).pay();
    g.passAll();
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'playerHexproof')).toHaveLength(1);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'playerHexproof')).toHaveLength(0);
  });
});
