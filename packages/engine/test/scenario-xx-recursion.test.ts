// Returning cards from the graveyard with a follow-up that reads the card, "you may ... if you do", reflexive triggers, sacrificing any
// number of permanents, an "Nth from the top" library move after a death or an exile, and paying life equal to a count (D-135).
// Pins: CR 608.2c (an instruction is carried out as it comes up), CR 113.7a and 608.2h (last-known information of an object that
// left), CR 400.7 (a card that changed zones is a new object), CR 603.12 (a reflexive triggered ability triggers on what happened
// earlier in the resolution of the ability that created it and chooses its targets when it goes on the stack, CR 603.3d),
// CR 701.21 (sacrifice), CR 401.7 (a card put into a library Nth from the top with fewer than N cards goes on the bottom),
// CR 119.4 and 118.3 (a player can pay life only if their life total is at least that much), CR 903.4 (color identity).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-recursion.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { graveyardNames, handNames, libraryNames } from './scry-helpers';
import { twoSeatGame } from './two-seat-helpers';

const ZOMBIE = 'SYNTHETIC Plain Zombie';
const GOBLIN = 'SYNTHETIC Pitch Reunion'; // 1/1 Goblin
const ANGEL = 'SYNTHETIC Costly Angel'; // 4/4 Angel
const BEARS = 'Grizzly Bears';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

// ---- "Return target creature card from your graveyard ... If it's a [type] card, ..." (CR 608.2c, 113.7a)

const TYPES = [
  { type: 'Zombie', card: ZOMBIE, other: BEARS },
  { type: 'Goblin', card: GOBLIN, other: BEARS },
  { type: 'Angel', card: ANGEL, other: ZOMBIE },
] as const;

describe('a condition on the card that was moved, for any creature type', () => {
  for (const { type, card, other } of TYPES) {
    test(`${type}: a ${type} card returned to the hand draws a card`, () => {
      const g = twoSeatGame((b) =>
        b.hand(`SYNTHETIC Recall ${type}`).graveyard(card).battlefield('Swamp', { count: 2 }),
      );
      g.act(0).cast(`SYNTHETIC Recall ${type}`, { targets: [card], pay: true });
      g.passAll();
      expect(handNames(g)).toContain(card);
      g.expect.handSize(0, 2); // the creature card and the card drawn
      g.expect.invariants();
    });

    test(`${type}: a creature card of another type returns and draws nothing`, () => {
      const g = twoSeatGame((b) =>
        b.hand(`SYNTHETIC Recall ${type}`).graveyard(other).battlefield('Swamp', { count: 2 }),
      );
      g.act(0).cast(`SYNTHETIC Recall ${type}`, { targets: [other], pay: true });
      g.passAll();
      expect(handNames(g)).toEqual([other]);
    });
  }

  test('the answer is read from the card as it was, so the new object in the hand does not matter (CR 400.7, 113.7a)', () => {
    const g = twoSeatGame((b) =>
      b.hand('SYNTHETIC Recall Zombie').graveyard(ZOMBIE).battlefield('Swamp', { count: 2 }),
    );
    g.act(0).cast('SYNTHETIC Recall Zombie', { targets: [ZOMBIE], pay: true });
    g.passAll();
    // The Zombie card is in the hand now, a different object from the one targeted.
    g.expect.noObject(ZOMBIE, { zone: 'graveyard' });
    g.expect.zone(ZOMBIE, 'hand', { seat: 0 });
  });

  test('a negated condition: "unless it is a Zombie card"', () => {
    const g = twoSeatGame((b) =>
      b.hand('SYNTHETIC Recall Non-Zombie').graveyard(BEARS).battlefield('Swamp', { count: 2 }),
    );
    g.act(0).cast('SYNTHETIC Recall Non-Zombie', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 23);
    const z = twoSeatGame((b) =>
      b.hand('SYNTHETIC Recall Non-Zombie').graveyard(ZOMBIE).battlefield('Swamp', { count: 2 }),
    );
    z.act(0).cast('SYNTHETIC Recall Non-Zombie', { targets: [ZOMBIE], pay: true });
    z.passAll();
    z.expect.life(0, 20);
  });

  test('a target that is gone when the spell resolves does nothing and draws nothing', () => {
    const g = twoSeatGame(
      (b) => b.hand('SYNTHETIC Recall Zombie').graveyard(ZOMBIE).battlefield('Swamp', { count: 2 }),
      (b) => b.hand('SYNTHETIC Graveyard Wipe').battlefield('Swamp', { count: 2 }),
    );
    g.act(0).cast('SYNTHETIC Recall Zombie', { targets: [ZOMBIE], pay: true });
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Graveyard Wipe', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    expect(handNames(g)).toEqual([]);
    g.expect.handSize(0, 0);
  });
});

describe('a condition on the permanent that was put onto the battlefield (counters if it is an Angel)', () => {
  test('an Angel returned by "Reanimate Angel" enters, then gets two +1/+1 counters', () => {
    const g = twoSeatGame((b) =>
      b.hand('SYNTHETIC Reanimate Angel').graveyard(ANGEL).battlefield('Swamp', { count: 3 }),
    );
    g.act(0).cast('SYNTHETIC Reanimate Angel', { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.counters(ANGEL, { '+1/+1': 2 });
    g.expect.pt(ANGEL, 6, 6);
  });

  test('a creature of another type returns with no counters', () => {
    const g = twoSeatGame((b) =>
      b.hand('SYNTHETIC Reanimate Angel').graveyard(ZOMBIE).battlefield('Swamp', { count: 3 }),
    );
    g.act(0).cast('SYNTHETIC Reanimate Angel', { targets: [ZOMBIE], pay: true });
    g.passAll();
    g.expect.zone(ZOMBIE, 'battlefield', { seat: 0 });
    g.expect.counters(ZOMBIE, {});
  });

  test('the same shape for another type: a Zombie gets the counters from "Reanimate Zombie"', () => {
    const g = twoSeatGame((b) =>
      b.hand('SYNTHETIC Reanimate Zombie').graveyard(ZOMBIE).battlefield('Swamp', { count: 3 }),
    );
    g.act(0).cast('SYNTHETIC Reanimate Zombie', { targets: [ZOMBIE], pay: true });
    g.passAll();
    g.expect.counters(ZOMBIE, { '+1/+1': 2 });
  });
});

// ---- "You may discard a card. If you do, draw a card" (CR 608.2c, 603.12)

describe('"you may [do something]. If you do, ..."', () => {
  test('a creature enters, the player discards, and draws two cards', () => {
    const g = twoSeatGame((b) =>
      b
        .hand('SYNTHETIC Pitch Reunion', BEARS, 'Llanowar Elves')
        .battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast('SYNTHETIC Pitch Reunion', { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(BEARS);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 3); // Llanowar Elves and the two cards drawn
    g.expect.invariants();
  });

  test('with one card in hand there is nothing to choose: it is discarded, then the cards are drawn', () => {
    const g = twoSeatGame((b) =>
      b.hand('SYNTHETIC Pitch Reunion', BEARS).battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast('SYNTHETIC Pitch Reunion', { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
  });

  test('declining discards nothing and draws nothing', () => {
    const g = twoSeatGame((b) =>
      b.hand('SYNTHETIC Pitch Reunion', BEARS).battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast('SYNTHETIC Pitch Reunion', { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.handSize(0, 1);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('with an empty hand the player may say yes, but nothing was discarded: no cards drawn', () => {
    const g = twoSeatGame((b) =>
      b.hand('SYNTHETIC Pitch Reunion').battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast('SYNTHETIC Pitch Reunion', { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.handSize(0, 0);
    g.expect.pending('priority', 0);
  });

  test('what an earlier instruction did does not count: "if you do" is about the nearest "may"', () => {
    // "Discard a card. Then you may discard a card. If you do, draw two cards." The first discard is not the may effect.
    const g = twoSeatGame((b) =>
      b
        .hand('SYNTHETIC Double Discard', BEARS, 'Llanowar Elves', 'Island')
        .battlefield('Mountain', { count: 2 }),
    );
    g.act(0).cast('SYNTHETIC Double Discard', { pay: true });
    g.passAll();
    g.act(0).chooseCards(BEARS);
    g.act(0).decline();
    g.expect.handSize(0, 2);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    const yes = twoSeatGame((b) =>
      b
        .hand('SYNTHETIC Double Discard', BEARS, 'Llanowar Elves', 'Island')
        .battlefield('Mountain', { count: 2 }),
    );
    yes.act(0).cast('SYNTHETIC Double Discard', { pay: true });
    yes.passAll();
    yes.act(0).chooseCards(BEARS);
    yes.act(0).accept();
    yes.act(0).chooseCards('Llanowar Elves');
    yes.expect.handSize(0, 3); // the Island and the two cards drawn
  });

  test('the cards of one "may" count together: a second draw that finds an empty library leaves the first one done', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand('SYNTHETIC Draw For Life')
      .battlefield('Island')
      .library('Plains')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast('SYNTHETIC Draw For Life', { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.life(0, 22);
  });

  test('a trigger of a cast: discard a card, then draw a card', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(BEARS, 'Llanowar Elves', 'Island')
        .battlefield('SYNTHETIC Pitch Monument')
        .battlefield('Forest', { count: 3 }),
    );
    g.act(0).cast(BEARS, { pay: true });
    // The trigger goes on the stack above the spell and is answered first (CR 603.3).
    g.expect.stack(['SYNTHETIC Pitch Monument (ability)', BEARS]);
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2); // the Island and the card drawn
  });

  test('"you may mill two cards. If you do, you gain 2 life": the cards actually milled count', () => {
    const g = twoSeatGame((b) => b.hand('SYNTHETIC Mill For Life').battlefield('Island'));
    g.act(0).cast('SYNTHETIC Mill For Life', { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.life(0, 22);
    g.expect.librarySize(0, 4);
    const empty = scenario()
      .seat(0)
      .life(20)
      .hand('SYNTHETIC Mill For Life')
      .battlefield('Island')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    empty.act(0).cast('SYNTHETIC Mill For Life', { pay: true });
    empty.passAll();
    empty.act(0).accept();
    // Nothing to mill: it was not done, so "if you do" does not apply (it is not a loss to draw nothing: CR 121.4 is about drawing).
    empty.expect.life(0, 20);
  });
});

// ---- Reflexive triggers (CR 603.12)

describe('"you may exile it. When you do, return target creature card from your graveyard to your hand"', () => {
  const butlerDies = (extra: (b: Builder) => Builder = (b) => b) =>
    twoSeatGame((b) =>
      extra(
        b.battlefield('SYNTHETIC Keen Butler').hand('Murder').battlefield('Swamp', { count: 3 }),
      ),
    );

  test('the creature dies, is exiled, and the reflexive trigger returns a creature card', () => {
    const g = butlerDies((b) => b.graveyard(BEARS));
    g.act(0).cast('Murder', { targets: ['SYNTHETIC Keen Butler'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone('SYNTHETIC Keen Butler', 'exile', { seat: 0 });
    // The reflexive ability is its own object on the stack, with its target chosen as it went there (CR 603.3d): the only
    // creature card in the graveyard.
    g.expect.stack(['SYNTHETIC Keen Butler (ability)']);
    expect(handNames(g)).toEqual([]);
    resolveTop(g);
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('declining: nothing is exiled and no reflexive trigger is created', () => {
    const g = butlerDies((b) => b.graveyard(BEARS));
    g.act(0).cast('Murder', { targets: ['SYNTHETIC Keen Butler'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.zone('SYNTHETIC Keen Butler', 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('the exiled creature cannot be the target (it is not in the graveyard): with no other creature card the trigger is removed', () => {
    const g = butlerDies();
    g.act(0).cast('Murder', { targets: ['SYNTHETIC Keen Butler'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone('SYNTHETIC Keen Butler', 'exile', { seat: 0 });
    g.expect.stack([]);
    expect(handNames(g)).toEqual([]);
  });

  test('with several creature cards the controller chooses the target as the reflexive ability goes on the stack', () => {
    const g = butlerDies((b) => b.graveyard(BEARS, ZOMBIE));
    g.act(0).cast('Murder', { targets: ['SYNTHETIC Keen Butler'], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(ZOMBIE);
    resolveTop(g);
    g.expect.zone(ZOMBIE, 'hand', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('"you may sacrifice another creature. When you do, this deals 3 damage to any target"', () => {
  const striker = (extra: (b: Builder) => Builder) =>
    twoSeatGame((b) =>
      extra(b.hand('SYNTHETIC Heart Striker').battlefield('Mountain', { count: 3 })),
    );

  test('sacrificing starts the reflexive trigger, whose target is chosen then', () => {
    const g = striker((b) => b.battlefield(BEARS));
    g.act(0).cast('SYNTHETIC Heart Striker', { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    resolveTop(g);
    g.expect.life(1, 17);
  });

  test('with no other creature nothing is sacrificed, so there is no reflexive trigger', () => {
    const g = striker((b) => b);
    g.act(0).cast('SYNTHETIC Heart Striker', { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.stack([]);
    g.expect.life(1, 20);
  });

  test('the creature sacrificed for any other reason does not trigger it (CR 603.12)', () => {
    const g = striker((b) => b.battlefield(BEARS));
    g.act(0).cast('SYNTHETIC Heart Striker', { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.life(1, 20);
  });
});

// ---- Any number of permanents, then that many cards (CR 701.21)

describe('"sacrifice any number of other permanents, then draw that many cards"', () => {
  const god = (extra: (b: Builder) => Builder) =>
    twoSeatGame((b) => extra(b.hand('SYNTHETIC Greedy God').battlefield('Swamp', { count: 5 })));

  test('the player chooses which and how many; the draw counts them', () => {
    const g = god((b) => b.battlefield(BEARS).battlefield('Llanowar Elves'));
    g.act(0).cast('SYNTHETIC Greedy God', { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(BEARS, 'Llanowar Elves', 'Swamp[0]');
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 3);
    g.expect.zone('SYNTHETIC Greedy God', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('none is a legal choice, and draws nothing', () => {
    const g = god((b) => b.battlefield(BEARS));
    g.act(0).cast('SYNTHETIC Greedy God', { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.handSize(0, 0);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('with exactly one candidate the player is still asked: sacrificing is a choice of none or it', () => {
    // The mana is in the pool, so the one other permanent is the Bears.
    const g = twoSeatGame((b) => b.hand('SYNTHETIC Greedy God').pool('BBBBB').battlefield(BEARS));
    g.act(0).cast('SYNTHETIC Greedy God', { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect([d.min, d.max, d.legal.length]).toEqual([0, 1, 1]);
    g.act(0).choosePermanents();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('the permanent itself is not among the choices: "other"', () => {
    const g = god((b) => b);
    g.act(0).cast('SYNTHETIC Greedy God', { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect(d.min).toBe(0);
    expect(d.max).toBe(5);
    expect(d.legal).not.toContain(g.id('SYNTHETIC Greedy God'));
  });

  test('with no other permanent there is nothing to choose and nothing is drawn', () => {
    const g = twoSeatGame((b) => b.hand('SYNTHETIC Greedy God').battlefield('Swamp', { count: 5 }));
    // Pay with the five Swamps, which are then tapped but still permanents: sacrifice them all.
    g.act(0).cast('SYNTHETIC Greedy God', { pay: true });
    g.passAll();
    g.act(0).choosePermanents('Swamp[0]', 'Swamp[1]', 'Swamp[2]', 'Swamp[3]', 'Swamp[4]');
    g.expect.handSize(0, 5);
  });
});

describe('"when this dies or is put into exile from the battlefield, you may put it into its owner\'s library third from the top"', () => {
  const dies = (library: readonly string[] = ['Island', 'Forest', 'Plains', 'Swamp']) => {
    let b = scenario()
      .seat(0)
      .life(20)
      .battlefield('SYNTHETIC Greedy God')
      .hand('Murder', 'SYNTHETIC Exile Gain Power')
      .battlefield('Swamp', { count: 3 })
      .battlefield('Plains', { count: 2 });
    b = b.library(...library);
    return b
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
  };

  test('it dies and is put third from the top', () => {
    const g = dies();
    g.act(0).cast('Murder', { targets: ['SYNTHETIC Greedy God'], pay: true });
    g.passAll();
    g.act(0).accept();
    expect(libraryNames(g)).toEqual([
      'Island',
      'Forest',
      'SYNTHETIC Greedy God',
      'Plains',
      'Swamp',
    ]);
    g.expect.noObject('SYNTHETIC Greedy God', { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('it is exiled instead of dying: the same trigger, the card comes from exile', () => {
    const g = dies();
    g.act(0).cast('SYNTHETIC Exile Gain Power', { targets: ['SYNTHETIC Greedy God'], pay: true });
    g.passAll();
    g.act(0).accept();
    expect(libraryNames(g)[2]).toBe('SYNTHETIC Greedy God');
    g.expect.noObject('SYNTHETIC Greedy God', { zone: 'exile' });
  });

  test('declining leaves it in the graveyard', () => {
    const g = dies();
    g.act(0).cast('Murder', { targets: ['SYNTHETIC Greedy God'], pay: true });
    g.passAll();
    g.act(0).decline();
    expect(graveyardNames(g)).toContain('SYNTHETIC Greedy God');
    expect(libraryNames(g)).toEqual(['Island', 'Forest', 'Plains', 'Swamp']);
  });

  test('a library of fewer than three cards: the card goes on the bottom (CR 401.7)', () => {
    const g = dies(['Island']);
    g.act(0).cast('Murder', { targets: ['SYNTHETIC Greedy God'], pay: true });
    g.passAll();
    g.act(0).accept();
    expect(libraryNames(g)).toEqual(['Island', 'SYNTHETIC Greedy God']);
  });

  test('a library of exactly two cards: "third from the top" is the bottom too', () => {
    const g = dies(['Island', 'Forest']);
    g.act(0).cast('Murder', { targets: ['SYNTHETIC Greedy God'], pay: true });
    g.passAll();
    g.act(0).accept();
    expect(libraryNames(g)).toEqual(['Island', 'Forest', 'SYNTHETIC Greedy God']);
  });
});

// ---- Life paid equal to a count, as a cost (CR 118.3, 119.4)

describe('"pay life equal to the number of ..." as the cost of an activated ability', () => {
  test("the number of colors in the commanders' color identity", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .commander('SYNTHETIC Czar of Two Colors')
      .battlefield('SYNTHETIC Tithe Well')
      .battlefield('Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).activate('SYNTHETIC Tithe Well', { pay: true });
    g.passAll();
    g.expect.life(0, 18);
    g.expect.handSize(0, 1);
    g.expect.tapped('SYNTHETIC Tithe Well');
  });

  test('no commander: 0 life, the ability still works', () => {
    const g = twoSeatGame((b) => b.battlefield('SYNTHETIC Tithe Well').battlefield('Plains'));
    g.act(0).activate('SYNTHETIC Tithe Well', { pay: true });
    g.passAll();
    g.expect.life(0, 20);
    g.expect.handSize(0, 1);
  });

  test('another count: one life for each creature, read as the ability is activated', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield('SYNTHETIC Blood Well')
        .battlefield(BEARS)
        .battlefield(ZOMBIE)
        .battlefield(GOBLIN),
    );
    g.act(0).activate('SYNTHETIC Blood Well', { pay: true });
    g.expect.life(0, 17);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('the cost is paid once: a creature leaving in response changes nothing', () => {
    const g = twoSeatGame(
      (b) => b.battlefield('SYNTHETIC Blood Well').battlefield(BEARS).battlefield(ZOMBIE),
      (b) => b.hand('Lightning Bolt').battlefield('Mountain'),
    );
    g.act(0).activate('SYNTHETIC Blood Well', { pay: true });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(0, 18);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('a player with less life than the cost cannot activate it (CR 119.4)', () => {
    const g = scenario()
      .seat(0)
      .life(1)
      .commander('SYNTHETIC Czar of Two Colors')
      .battlefield('SYNTHETIC Tithe Well')
      .battlefield('Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
  });
});
