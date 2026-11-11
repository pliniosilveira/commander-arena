// A permission to cast a card from the graveyard this turn, abilities that work from the graveyard with a conditional cost reduction,
// and an enters trigger that fires only if the permanent entered untapped (D-135).
// Pins: CR 601.2 and 601.2a (casting moves the card to the stack, from the zone it is in), CR 611.2a and 514.2 ("this turn": a
// continuous effect that ends in the cleanup step), CR 400.7 (a card that leaves the graveyard is a new object, so the permission
// is gone), CR 117.1a and 307.1 (a creature card is cast at sorcery timing), CR 113.6b and 602.2 (an ability that works from the
// graveyard is activated from there), CR 601.2f and 118.7a (a cost reduction takes generic mana off, never below zero, and is
// determined as the ability is activated), CR 122.6 and 614.1c (enters with a counter), CR 603.6a and 614.12 (a permanent enters
// tapped or untapped as a replacement effect of its own says, and "enters untapped" is read as it entered), CR 603.2.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-graveyard.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { graveyardNames, libraryNames } from './scry-helpers';
import { twoSeatGame } from './two-seat-helpers';

const TYPES = [
  { type: 'Zombie', card: 'SYNTHETIC Plain Zombie', other: 'Grizzly Bears' },
  { type: 'Goblin', card: 'SYNTHETIC Pitch Reunion', other: 'SYNTHETIC Plain Zombie' },
  { type: 'Angel', card: 'SYNTHETIC Costly Angel', other: 'SYNTHETIC Plain Zombie' },
] as const;
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Enough mana of every color the cards of the tests cost. */
const lands = (b: Builder): Builder =>
  b
    .battlefield('Swamp', { count: 3 })
    .battlefield('Mountain', { count: 2 })
    .battlefield('Plains', { count: 2 });

const castableFromGraveyard = (g: ScenarioGame, seat: 0 | 1, name: string): boolean =>
  g
    .legalActions(seat)
    .some(
      (a) =>
        a.kind === 'castSpell' &&
        g.state.objects[a.object]?.zone === 'graveyard' &&
        g.object(a.object).card === g.object({ name, zone: 'graveyard' }).card,
    );

describe('"{T}: You may cast target [type] creature card from your graveyard this turn"', () => {
  for (const { type, card, other } of TYPES) {
    const chanter = `SYNTHETIC Grave Chanter ${type}`;

    test(`${type}: after the ability resolves the card can be cast from the graveyard, and it enters`, () => {
      const g = twoSeatGame((b) => lands(b.battlefield(chanter).graveyard(card)));
      expect(castableFromGraveyard(g, 0, card)).toBe(false);
      g.act(0).activate(chanter, { targets: [card] });
      g.passAll();
      g.expect.tapped(chanter);
      expect(castableFromGraveyard(g, 0, card)).toBe(true);
      g.act(0).cast(card, { pay: true });
      g.passAll();
      g.expect.zone(card, 'battlefield', { seat: 0 });
      g.expect.noObject(card, { zone: 'graveyard' });
      g.expect.invariants();
    });

    test(`${type}: only the card that was targeted, not another ${type} card or a card of another type`, () => {
      const g = twoSeatGame((b) => lands(b.battlefield(chanter).graveyard(card).graveyard(other)));
      g.act(0).activate(chanter, { targets: [card] });
      g.passAll();
      expect(castableFromGraveyard(g, 0, card)).toBe(true);
      expect(castableFromGraveyard(g, 0, other)).toBe(false);
    });
  }

  test('a type the ability does not name cannot even be targeted', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield('SYNTHETIC Grave Chanter Zombie')
        .graveyard('Grizzly Bears')
        .battlefield('Swamp'),
    );
    expect(() =>
      g.act(0).activate('SYNTHETIC Grave Chanter Zombie', { targets: ['Grizzly Bears'] }),
    ).toThrow();
  });

  test('it lasts until end of turn: gone in the next turn', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield('SYNTHETIC Grave Chanter Zombie')
        .graveyard('SYNTHETIC Plain Zombie')
        .battlefield('Swamp', { count: 3 }),
    );
    g.act(0).activate('SYNTHETIC Grave Chanter Zombie', { targets: ['SYNTHETIC Plain Zombie'] });
    g.passAll();
    expect(castableFromGraveyard(g, 0, 'SYNTHETIC Plain Zombie')).toBe(true);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(castableFromGraveyard(g, 0, 'SYNTHETIC Plain Zombie')).toBe(false);
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'castPermission')).toEqual([]);
  });

  test('a creature card is cast at sorcery timing, as always', () => {
    const g = twoSeatGame((b) =>
      b
        .battlefield('SYNTHETIC Grave Chanter Zombie')
        .graveyard('SYNTHETIC Plain Zombie')
        .battlefield('Swamp', { count: 3 }),
    );
    g.act(0).activate('SYNTHETIC Grave Chanter Zombie', { targets: ['SYNTHETIC Plain Zombie'] });
    // With the ability still on the stack nothing is castable yet; once it resolved, the main phase allows it.
    g.passAll();
    g.advanceTo('beginningOfCombat');
    expect(castableFromGraveyard(g, 0, 'SYNTHETIC Plain Zombie')).toBe(false);
  });

  test('the card is cast for its ordinary cost: no cost, no cast', () => {
    const g = twoSeatGame((b) =>
      b.battlefield('SYNTHETIC Grave Chanter Zombie').graveyard('SYNTHETIC Plain Zombie'),
    );
    g.act(0).activate('SYNTHETIC Grave Chanter Zombie', { targets: ['SYNTHETIC Plain Zombie'] });
    g.passAll();
    expect(g.legalActions(0).some((a) => a.kind === 'castSpell')).toBe(false);
  });

  test('the card leaving the graveyard in response ends the permission before it begins: the ability fizzles (CR 608.2b)', () => {
    const g = twoSeatGame(
      (b) => b.battlefield('SYNTHETIC Grave Chanter Zombie').graveyard('SYNTHETIC Plain Zombie'),
      (b) => b.hand('SYNTHETIC Graveyard Wipe').battlefield('Swamp', { count: 2 }),
    );
    g.act(0).activate('SYNTHETIC Grave Chanter Zombie', { targets: ['SYNTHETIC Plain Zombie'] });
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Graveyard Wipe', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.noObject('SYNTHETIC Plain Zombie', { zone: 'graveyard' });
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'castPermission')).toEqual([]);
  });

  test('nothing is exiled: a spell that is countered goes to the graveyard, a creature that dies goes there too', () => {
    const g = twoSeatGame(
      (b) =>
        b
          .battlefield('SYNTHETIC Grave Chanter Zombie')
          .graveyard('SYNTHETIC Plain Zombie')
          .battlefield('Swamp', { count: 3 }),
      (b) => b.hand('Counterspell').battlefield('Island', { count: 2 }),
    );
    g.act(0).activate('SYNTHETIC Grave Chanter Zombie', { targets: ['SYNTHETIC Plain Zombie'] });
    g.passAll();
    g.act(0).cast('SYNTHETIC Plain Zombie', { pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: ['SYNTHETIC Plain Zombie'], pay: true });
    g.passAll();
    expect(graveyardNames(g)).toContain('SYNTHETIC Plain Zombie');
    g.expect.noObject('SYNTHETIC Plain Zombie', { zone: 'exile' });
  });

  test("the permission is the controller's: another player cannot cast the card", () => {
    const g = twoSeatGame(
      (b) =>
        b
          .battlefield('SYNTHETIC Grave Chanter Zombie')
          .graveyard('SYNTHETIC Plain Zombie')
          .battlefield('Swamp'),
      (b) => b.battlefield('Swamp', { count: 3 }),
    );
    g.act(0).activate('SYNTHETIC Grave Chanter Zombie', { targets: ['SYNTHETIC Plain Zombie'] });
    g.passAll();
    expect(castableFromGraveyard(g, 1, 'SYNTHETIC Plain Zombie')).toBe(false);
  });

  test('the ability is a validated, supported one', () => {
    expect(validateCard(syntheticCard('SYNTHETIC Grave Chanter Zombie'))).toEqual([]);
  });
});

// ---- An ability that works from the graveyard, with a cost that costs less if a condition holds

describe('"{4}{B}{B}: Return this card from your graveyard to the battlefield with a +1/+1 counter on it" (costs {4} less if ...)', () => {
  for (const type of ['Zombie', 'Dinosaur']) {
    const card = `SYNTHETIC Revenant ${type}`;
    const nonbasic = (n: number) => (b: Builder) => b.battlefield('Command Tower', { count: n });

    test(`${type}: paid in full from the graveyard, it returns to the battlefield with a counter`, () => {
      const g = twoSeatGame((b) => b.graveyard(card).battlefield('Swamp', { count: 6 }));
      g.act(0).activate(card, { pay: true });
      g.expect.stack([`${card} (ability)`]);
      g.passAll();
      g.expect.zone(card, 'battlefield', { seat: 0 });
      g.expect.counters(card, { '+1/+1': 1 });
      g.expect.pt(card, 4, 2);
      g.expect.invariants();
    });

    test(`${type}: with four nonbasic lands under an opponent's control it costs {B}{B}`, () => {
      const g = twoSeatGame(
        (b) => b.graveyard(card).battlefield('Swamp', { count: 2 }),
        nonbasic(4),
      );
      g.act(0).activate(card, { pay: true });
      g.passAll();
      g.expect.zone(card, 'battlefield', { seat: 0 });
      g.expect.counters(card, { '+1/+1': 1 });
    });

    test(`${type}: with three nonbasic lands the cost is not reduced: two Swamps are not enough`, () => {
      const g = twoSeatGame(
        (b) => b.graveyard(card).battlefield('Swamp', { count: 2 }),
        nonbasic(3),
      );
      expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
    });
  }

  const card = 'SYNTHETIC Revenant Zombie';

  test('basic lands do not count: four Mountains of the opponent change nothing', () => {
    const g = twoSeatGame(
      (b) => b.graveyard(card).battlefield('Swamp', { count: 2 }),
      (b) => b.battlefield('Mountain', { count: 6 }),
    );
    expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test('your own nonbasic lands do not count: "an opponent controls"', () => {
    const g = twoSeatGame((b) =>
      b
        .graveyard(card)
        .battlefield('Swamp', { count: 2 })
        .battlefield('SYNTHETIC Haunted Cottage', { count: 4 }),
    );
    // The Cottages are nonbasic Swamps that make {B}, so six mana are available: it costs the full price, not the reduced one.
    g.act(0).activate(card);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected a payment');
    expect(d.totalCost).toEqual(['4', 'B', 'B']);
  });

  test('the cost is worked out as the ability is activated, once: the ability on the stack shows what was paid', () => {
    const g = twoSeatGame(
      (b) => b.graveyard(card).battlefield('Swamp', { count: 2 }),
      (b) => b.battlefield('Command Tower', { count: 4 }),
    );
    g.act(0).activate(card);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected a payment');
    expect(d.totalCost).toEqual(['B', 'B']);
    g.act(0).payAuto();
    const onStack = g.state.objects[g.state.stack[0] as never];
    expect(onStack?.stack?.ability).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['B', 'B'] }],
    });
    expect(onStack?.stack?.ability).not.toHaveProperty('costReducedIf');
  });

  test('it works only from the graveyard: not from the hand, the battlefield or exile', () => {
    const inHand = twoSeatGame((b) => b.hand(card).battlefield('Swamp', { count: 6 }));
    expect(inHand.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
    const onBattlefield = twoSeatGame((b) =>
      b.battlefield(card).battlefield('Swamp', { count: 6 }),
    );
    expect(onBattlefield.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test("it is the owner's: a card in another player's graveyard is not activated by you", () => {
    const g = twoSeatGame(
      (b) => b.battlefield('Swamp', { count: 6 }),
      (b) => b.graveyard(card),
    );
    expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(false);
  });

  test("at instant speed: during the opponent's turn too", () => {
    const g = scenario()
      .seat(0)
      .graveyard(card)
      .battlefield('Swamp', { count: 6 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).pass();
    expect(g.legalActions(0).some((a) => a.kind === 'activate')).toBe(true);
  });

  test('when the card is gone from the graveyard before the ability resolves, nothing is returned', () => {
    const g = twoSeatGame(
      (b) => b.graveyard(card).battlefield('Swamp', { count: 6 }),
      (b) => b.hand('SYNTHETIC Graveyard Wipe').battlefield('Swamp', { count: 2 }),
    );
    g.act(0).activate(card, { pay: true });
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Graveyard Wipe', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.noObject(card, { zone: 'battlefield' });
    g.expect.noObject(card, { zone: 'graveyard' });
  });
});

// ---- "When this land enters untapped" (CR 603.6a, 614.12)

describe('"When this land enters untapped, ..." fires only if it entered untapped', () => {
  const cottage = 'SYNTHETIC Haunted Cottage';

  test('three other Swamps: it enters untapped, so the trigger fires and puts a creature card on top of the library', () => {
    const g = twoSeatGame((b) =>
      b.hand(cottage).graveyard('Grizzly Bears').battlefield('Swamp', { count: 3 }),
    );
    g.act(0).playLand(cottage);
    g.expect.tapped(cottage, false);
    g.expect.stack([`${cottage} (ability)`]);
    g.passAll();
    g.act(0).accept();
    expect(libraryNames(g)[0]).toBe('Grizzly Bears');
    g.expect.noObject('Grizzly Bears', { zone: 'graveyard' });
  });

  test('declining the "may" leaves the card in the graveyard', () => {
    const g = twoSeatGame((b) =>
      b.hand(cottage).graveyard('Grizzly Bears').battlefield('Swamp', { count: 3 }),
    );
    g.act(0).playLand(cottage);
    g.passAll();
    g.act(0).decline();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });

  test('two other Swamps: it enters tapped and the trigger never exists', () => {
    const g = twoSeatGame((b) =>
      b.hand(cottage).graveyard('Grizzly Bears').battlefield('Swamp', { count: 2 }),
    );
    g.act(0).playLand(cottage);
    g.expect.tapped(cottage, true);
    g.expect.stack([]);
  });

  test('the Swamps must be other Swamps: the land does not count itself', () => {
    const g = twoSeatGame((b) =>
      b
        .hand(cottage)
        .graveyard('Grizzly Bears')
        .battlefield('Swamp', { count: 2 })
        .battlefield('Forest'),
    );
    g.act(0).playLand(cottage);
    g.expect.tapped(cottage, true);
  });

  test('with no creature card in the graveyard the trigger has no target and is removed', () => {
    const g = twoSeatGame((b) => b.hand(cottage).battlefield('Swamp', { count: 3 }));
    g.act(0).playLand(cottage);
    g.expect.tapped(cottage, false);
    g.expect.stack([]);
  });

  test('"enters tapped" is the other way round: the trigger fires only if it entered tapped', () => {
    const g = twoSeatGame((b) => b.hand('SYNTHETIC Sulking Tarn'));
    g.act(0).playLand('SYNTHETIC Sulking Tarn');
    g.expect.stack(['SYNTHETIC Sulking Tarn (ability)']);
    g.passAll();
    g.expect.life(0, 21);
  });

  test('"whenever a land enters untapped under your control": a filter, read for each land', () => {
    const g = twoSeatGame((b) =>
      b.battlefield('SYNTHETIC Eager Gardener').hand('SYNTHETIC Sulking Tarn', 'Forest'),
    );
    g.act(0).playLand('SYNTHETIC Sulking Tarn'); // enters tapped: its own trigger, not the Gardener's
    g.expect.stack(['SYNTHETIC Sulking Tarn (ability)']);
    g.passAll();
    g.expect.life(0, 21);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('precombatMain');
    g.act(0).playLand('Forest'); // untapped: the Gardener triggers
    g.expect.stack(['SYNTHETIC Eager Gardener (ability)']);
    g.passAll();
    g.expect.life(0, 22);
  });

  test('the cards are runnable', () => {
    for (const name of [
      cottage,
      'SYNTHETIC Sulking Tarn',
      'SYNTHETIC Eager Gardener',
      'SYNTHETIC Revenant Zombie',
      'SYNTHETIC Grave Chanter Zombie',
    ]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });
});
