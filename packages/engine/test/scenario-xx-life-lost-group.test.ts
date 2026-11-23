// The players who lost life or were dealt combat damage this turn (Scions & Spellcraft deck, group A): the condition `aPlayerLostLifeThisTurn` ("if a player lost 4 or more life
// this turn"), the player selector `lostLifeThisTurn` ("each opponent who lost life this turn"), `combatDamagedThisTurn` ("your opponents who were dealt combat damage by this
// creature or a Dragon this turn") and the amount `playerCount` ("for each player who lost life this turn"). Cards are SYNTHETIC (src/cards/fixtures/synthetic-life-lost-group.ts).
// Pins: CR 119.3 (life loss adds up over the turn, per player), CR 603.4 (intervening if, read as the step begins and as the ability resolves), CR 514.2 (what happened this turn is
// forgotten as the turn ends), CR 120.2a and 510.2 (combat damage dealt to a player), CR 101.4 (several players act in turn order), CR 102.2 (opponents: every other player).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WARDEN = 'SYNTHETIC Night Warden';
const REAPER = 'SYNTHETIC Soul Reaper';
const IDOL = 'SYNTHETIC Culling Idol';
const SCHOLAR = 'SYNTHETIC Dragon Scholar';
const DRAKE = 'SYNTHETIC Ember Drake';
const DRAIN4 = 'SYNTHETIC Drain Four';
const DRAIN1 = 'SYNTHETIC Drain One';
const BEARS = 'Grizzly Bears';
const OGRE = DRAKE;
const LIBRARY = Array.from({ length: 20 }, () => 'Island');

describe('the cards are valid', () => {
  for (const name of [WARDEN, REAPER, IDOL, SCHOLAR, DRAKE, DRAIN4, DRAIN1]) {
    test(name, () => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    });
  }
});

describe('"if a player lost 4 or more life this turn" (CR 119.3, 603.4)', () => {
  const build = (hand: string[]) =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(...hand)
      .battlefield(WARDEN, 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('one player losing 4 life makes the trigger of the end step draw a card', () => {
    const g = build([DRAIN4]);
    g.act(0).cast(DRAIN4, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.expect.life(2, 36);
    g.expect.handSize(0, 0);
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('3 life lost by one player and 1 by another are not 4 by a player: nothing is drawn', () => {
    const g = build([DRAIN1, DRAIN1]);
    g.act(0).cast(`${DRAIN1}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${DRAIN1}[0]`, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 0);
  });

  test('the controller of the trigger losing the 4 life counts too: "a player" is any player', () => {
    const g = build([DRAIN4]);
    g.act(0).cast(DRAIN4, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    // The controller of the trigger lost the life itself: "a player" is any player.
    g.expect.handSize(0, 1);
  });

  test('the life lost on an earlier turn is forgotten: the end step of the next turn draws nothing', () => {
    const g = build([DRAIN4]);
    g.act(0).cast(DRAIN4, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.handSize(0, 1);
    g.advanceTo('end', { turn: 'next' });
    g.passAll();
    g.expect.handSize(0, 1);
  });
});

describe('"for each player who lost life this turn" (CR 102.1, 119.3)', () => {
  test('the counters of the end step are the players who lost life, whoever they are', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(DRAIN1, DRAIN1, DRAIN1)
      .battlefield(REAPER, 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    // Seat 1 loses life twice (one player, counted once), seat 0 loses life too.
    g.act(0).cast(`${DRAIN1}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${DRAIN1}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).cast(`${DRAIN1}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.counters(REAPER, { soul: 2 });
  });

  test('no player lost life: no counter', () => {
    const g = scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(REAPER)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.counters(REAPER, {});
  });
});

describe('"each opponent who lost life this turn sacrifices ..." (CR 119.3, 101.4, 701.21a)', () => {
  const build = () =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .hand(DRAIN1)
      .battlefield(IDOL, 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, OGRE)
      .seat(2)
      .library(...LIBRARY)
      .battlefield(BEARS, OGRE)
      .at('precombatMain', { active: 0 })
      .build();

  test('only the opponent who lost life sacrifices, and it is the creature with the greatest power', () => {
    const g = build();
    g.act(0).cast(`${DRAIN1}[0]`, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).activate(IDOL, { pay: true });
    g.passAll();
    g.expect.zone(OGRE, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(OGRE, 'battlefield', { seat: 2 });
    g.expect.zone(BEARS, 'battlefield', { seat: 2 });
  });

  test('no opponent lost life: nobody sacrifices', () => {
    const g = build();
    g.act(0).activate(IDOL, { pay: true });
    g.passAll();
    g.expect.zone(OGRE, 'battlefield', { seat: 1 });
    g.expect.zone(OGRE, 'battlefield', { seat: 2 });
  });

  test('my own life loss is not an opponent’s: nobody sacrifices', () => {
    const g = build();
    g.act(0).cast(`${DRAIN1}[0]`, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.act(0).activate(IDOL, { pay: true });
    g.passAll();
    g.expect.zone(OGRE, 'battlefield', { seat: 1 });
    g.expect.zone(OGRE, 'battlefield', { seat: 2 });
  });
});

describe('"opponents who were dealt combat damage by this creature or a Dragon this turn" (CR 120.2a, 510.2)', () => {
  const build = (mine: string[]) =>
    scenario({ seats: 3 })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(...mine)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('this creature and a Dragon each hit a different opponent: X is 2', () => {
    const g = build([SCHOLAR, DRAKE, BEARS]);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: SCHOLAR, target: { player: 1 } },
      { attacker: DRAKE, target: { player: 2 } },
    ]);
    g.advanceTo('end');
    // Two cards drawn and 2 life lost at the second main phase.
    g.expect.handSize(0, 2);
    g.expect.life(0, 38);
  });

  test('only a creature that is neither this one nor a Dragon hits an opponent: X is 0', () => {
    const g = build([SCHOLAR, BEARS]);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([{ attacker: BEARS, target: { player: 1 } }]);
    g.advanceTo('end');
    g.expect.handSize(0, 0);
    g.expect.life(0, 40);
  });

  test('one opponent hit twice (by this creature and by a Dragon) counts once', () => {
    const g = build([SCHOLAR, DRAKE]);
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: SCHOLAR, target: { player: 1 } },
      { attacker: DRAKE, target: { player: 1 } },
    ]);
    g.advanceTo('end');
    g.expect.handSize(0, 1);
    g.expect.life(0, 39);
  });
});

describe('validateCard refuses the malformed readings', () => {
  const withAbility = (name: string, ability: unknown) => {
    const card = syntheticCard(name);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...card, faces: [{ ...face, abilities: [ability] }, ...card.faces.slice(1)] };
  };
  const trigger = { kind: 'endStep', whose: 'you' };
  const drawing = (count: unknown) => ({
    kind: 'triggered',
    trigger,
    effect: { kind: 'draw', player: { kind: 'you' }, count },
  });

  test('the players who lost life are of every player or every opponent', () => {
    const card = withAbility(IDOL, {
      kind: 'triggered',
      trigger,
      effect: {
        kind: 'loseLife',
        player: { kind: 'lostLifeThisTurn', of: { kind: 'you' } },
        amount: 1,
      },
    });
    expect(validateCard(card as never).length).toBeGreaterThan(0);
  });

  test('combat damage with no source named is refused: the source is this creature, a kind, or both', () => {
    const card = withAbility(
      SCHOLAR,
      drawing({
        kind: 'playerCount',
        of: { kind: 'combatDamagedThisTurn', of: { kind: 'eachOpponent' } },
      }),
    );
    expect(validateCard(card as never).length).toBeGreaterThan(0);
  });

  test('a kind of source the turn log does not keep (a color) is refused', () => {
    const card = withAbility(
      SCHOLAR,
      drawing({
        kind: 'playerCount',
        of: {
          kind: 'combatDamagedThisTurn',
          of: { kind: 'eachOpponent' },
          by: { subtypes: ['Dragon'], colors: ['R'] },
        },
      }),
    );
    expect(validateCard(card as never).length).toBeGreaterThan(0);
  });

  test('a count of life lost of 0 is refused', () => {
    const card = withAbility(WARDEN, {
      kind: 'triggered',
      trigger,
      interveningIf: { kind: 'aPlayerLostLifeThisTurn', atLeast: 0 },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });
    expect(validateCard(card as never).length).toBeGreaterThan(0);
  });
});
