// The Hashaton deck program, group 2 (D-1110 to D-1112, provisional): "Your opponents can't gain life." (`cantGainLife`), "each opponent loses life equal to
// the life that player lost this turn" (`lifeLostThisTurn`) and "if you gained life this turn" at each end step (`lifeGainedThisTurn`).
// Pins: CR 119.7 (a player who can't gain life gains none, and a replacement effect of a life gain does nothing), CR 119.3 (life lost or gained), CR 603.4
// (the intervening "if" is checked when the step begins and as the ability resolves), CR 702.15b (lifelink is a life gain), CR 604.1 (a static ability).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g2.ts, synthetic-life-gain.ts).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const IDOL = 'SYNTHETIC Joyless Idol'; // your opponents can't gain life
const GRUDGE = 'SYNTHETIC Grudge Demon'; // each end step: each opponent loses the life they lost this turn
const HOLLOW = 'SYNTHETIC Hollow Demon'; // both
const SERAPH = 'SYNTHETIC Dusk Seraph'; // each end step, if I gained life this turn: a 4/4 Angel
const MEND = 'SYNTHETIC Mend'; // gain 3 life
const VITAL = 'SYNTHETIC Vital Angel'; // my gains are 1 more
const HAWK = "Healer's Hawk"; // flying, lifelink 1/1
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  for (const name of [IDOL, GRUDGE, HOLLOW, SERAPH]) {
    test(name, () => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    });
  }

  const withStatic = (who: string) => {
    const card = syntheticCard(IDOL);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return {
      ...card,
      faces: [{ ...face, abilities: [{ kind: 'static', static: { kind: 'cantGainLife', who } }] }],
    } as never;
  };

  test('only the opponents of the controller are a group the engine reads', () => {
    expect(validateCard(withStatic('opponents'))).toEqual([]);
    expect(validateCard(withStatic('you')).length).toBeGreaterThan(0);
    expect(validateCard(withStatic('each')).length).toBeGreaterThan(0);
  });

  const withAmount = (patch: Record<string, unknown>) => {
    const card = syntheticCard(GRUDGE);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    return {
      ...card,
      faces: [{ ...face, abilities: [{ ...ability, effect: { ...ability.effect, ...patch } }] }],
    } as never;
  };

  test('the life that player lost this turn is the whole amount of a loseLife, nothing else', () => {
    expect(validateCard(withAmount({}))).toEqual([]);
    // a gain of life, a part of another amount
    expect(validateCard(withAmount({ kind: 'gainLife' })).length).toBeGreaterThan(0);
    expect(
      validateCard(
        withAmount({ amount: { kind: 'half', of: { kind: 'lifeLostThisTurn' }, round: 'down' } }),
      ).length,
    ).toBeGreaterThan(0);
    // a draw of that many cards
    expect(
      validateCard(
        withAmount({
          kind: 'draw',
          player: { kind: 'you' },
          count: { kind: 'lifeLostThisTurn' },
        }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('"Your opponents can\'t gain life" (CR 119.7)', () => {
  const opponentTurn = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(IDOL)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield('Plains')
      .at('precombatMain', { active: 1 });

  test("an opponent's gain of life does not happen: no change, no event", () => {
    const g = opponentTurn().build();
    g.act(1).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(1, 20);
    expect(g.events.filter((e) => e.kind === 'lifeGained')).toEqual([]);
    expect(g.events.filter((e) => e.kind === 'lifeChanged')).toEqual([]);
  });

  test('the controller of the permanent gains life as ever', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield(IDOL, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
  });

  test('without the permanent the opponent gains life', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield('Plains')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(1, 23);
  });

  test('lifelink damage is a life gain, so it gains nothing for the opponent', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .battlefield(IDOL)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .battlefield(HAWK)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(1).attack(HAWK);
    g.advanceTo('endOfCombat');
    g.expect.life(0, 19);
    g.expect.life(1, 20);
  });

  test("a replacement of the opponent's life gain does nothing (CR 119.7)", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(IDOL)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield('Plains', VITAL)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(1, 20);
  });

  test('a gain that did not happen is not "life gained this turn"', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(IDOL)
      .seat(1)
      .library(...LIBRARY)
      .hand(MEND)
      .battlefield('Plains', SERAPH)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MEND, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Angel');
  });

  test('two of them: each player controls one, so neither player gains life', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield(IDOL, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .battlefield(IDOL)
      .build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.expect.life(0, 20);
    g.expect.life(1, 20);
  });
});

describe('"each opponent loses life equal to the life that player lost this turn" (CR 119.3)', () => {
  const base = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .battlefield(GRUDGE)
      .seat(1)
      .library(...LIBRARY)
      .life(20);

  test('3 damage to an opponent this turn: they lose 3 more at the end step', () => {
    const g = base().seat(0).hand(BOLT).battlefield('Mountain').build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 14);
    g.expect.life(0, 20);
  });

  test('no life lost this turn: they lose nothing', () => {
    const g = base().build();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 20);
  });

  test('my own loss of life is not what opponents lose', () => {
    const g = base()
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    // the opponent burns me: I lost 3 this turn, and it is their end step: I am not the opponent of my own Demon
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 17);
    g.expect.life(1, 20);
  });

  test('it triggers at the end step of any player: life lost on their own turn counts', () => {
    const g = base()
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    // the opponent casts a Bolt at their own face this turn: 3 life lost by them
    g.act(1).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17);
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 14);
  });

  test("each opponent loses their own life lost, not the controller's: 3 against my 6", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .battlefield(GRUDGE)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .hand(BOLT, BOLT, BOLT)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.act(1).cast(`${BOLT}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 14);
    g.expect.life(1, 17);
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 14);
    g.expect.life(0, 14);
  });

  test('two of them: the second reads what the first made the opponent lose', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .battlefield(GRUDGE, GRUDGE)
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .life(30)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    // 30 - 3 = 27, the first loses 3 (24), the second reads 6 and loses 6 (18)
    g.expect.life(1, 18);
  });
});

describe('Archfiend of Despair, as a whole (the Hollow Demon)', () => {
  test('life the opponent pays or loses counts, and no life gained can make up for it', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .battlefield(HOLLOW)
      .seat(1)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND, BOLT)
      .battlefield('Plains', 'Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MEND, { pay: true });
    g.passAll();
    g.act(1).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 17); // the Mend gained nothing, the Bolt took 3
    g.advanceTo('end');
    g.passAll();
    g.expect.life(1, 14);
  });
});

describe('"At the beginning of each end step, if you gained life this turn" (CR 603.4)', () => {
  const base = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield(SERAPH, 'Plains')
      .seat(1)
      .library(...LIBRARY);

  test('a life gain this turn: a 4/4 Angel with flying at the end step', () => {
    const g = base().build();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Angel', 'battlefield');
    g.expect.pt('Angel', 4, 4);
    g.expect.derived('Angel', { keywords: ['flying'] });
  });

  test('no life gained: no Angel', () => {
    const g = base().build();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Angel');
  });

  test('life gained on an opponent turn counts at that end step too', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .hand(MEND)
      .battlefield(SERAPH, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).pass();
    g.act(0).cast(MEND, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('Angel', 'battlefield');
  });

  test("an opponent's gain of life is not mine", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SERAPH)
      .seat(1)
      .library(...LIBRARY)
      .hand(MEND)
      .battlefield('Plains')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MEND, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.noObject('Angel');
  });

  test('lifelink damage of my creature is the life gained: the Angel comes', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .battlefield(SERAPH, HAWK)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(HAWK);
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 21);
    g.expect.zone('Angel', 'battlefield');
  });

  test('lifelink damage that an opponent with Archfiend prevents gains nothing: no Angel', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .life(20)
      .battlefield(SERAPH, HAWK)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(IDOL)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(HAWK);
    g.advanceTo('end');
    g.passAll();
    g.expect.life(0, 20);
    g.expect.noObject('Angel');
  });
});
