// Evoke given to a spell by a static ability as it is cast (`grantAlternativeCostToSpells`): "Elemental permanent spells you cast from your hand gain evoke {4} as you cast them." and the
// trigger of the card that has it: "Whenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your
// next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}." Pins: CR 702.74a (Evoke: the alternative cost, and the sacrifice of the permanent when it enters), CR 118.9 (an alternative
// cost), CR 601.2b (the cost is chosen as the spell is cast), CR 613.1f (a static ability of a permanent gives an ability), CR 707.10 (a copy of a spell is not cast), CR 400.7 (a new
// object after a zone change), CR 701.21a (Sacrifice), CR 603.7 and 603.7c (a delayed triggered ability, about the objects an effect made), CR 118.12a ("unless a player pays"),
// CR 707.2 (a token that is a copy copies what the object was printed as). Cards are SYNTHETIC (src/cards/fixtures/synthetic-evoke-grant.ts), plus the real Murder and Lightning Bolt.
import { describe, expect, test } from 'vitest';
import { getLegalActions, getView, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const GRANTER = 'SYNTHETIC Evoke Granter';
const COPIER = 'SYNTHETIC Evoke Copier';
const ECHO = 'SYNTHETIC Elemental Echo';
const HEAVY = 'SYNTHETIC Heavy Elemental';
const BEAST = 'SYNTHETIC Heavy Beast';
const CHEAP = 'SYNTHETIC Cheap Evoker';

const evokeOptions = (g: ScenarioGame, seat: 0 | 1 = 0) =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'castSpell' && a.alternative === 'evoke');

test('the synthetic cards are supported', () => {
  for (const name of [GRANTER, COPIER, ECHO, HEAVY, BEAST, CHEAP]) {
    const card = syntheticCard(name);
    expect(validateCard(card), name).toEqual([]);
    expect(card.support, name).toBe('supported');
  }
});

describe('the spell is offered the evoke cost as it is cast (CR 702.74a, 118.9, 601.2b)', () => {
  const build = (hand: string, lands = 4) =>
    scenario()
      .seat(0)
      .hand(hand)
      .battlefield(GRANTER)
      .battlefield('Forest', { count: lands })
      .seat(1)
      .build();

  test('an Elemental permanent spell from the hand can be cast for {4}, and the view lists it', () => {
    const g = build(HEAVY);
    g.expect.illegal(0, { cast: HEAVY });
    g.expect.legal(0, { cast: HEAVY, alternative: 'evoke' });
    expect(evokeOptions(g)).toHaveLength(1);
    const card = getView(g.state, 0).seats[0]?.hand?.[0];
    expect(card?.alternativeCosts).toEqual([{ kind: 'evoke', cost: ['4'] }]);
  });

  test('with less than {4} nothing is offered', () => {
    const g = build(HEAVY, 3);
    expect(evokeOptions(g)).toEqual([]);
  });

  test('a spell that is not an Elemental gets no evoke', () => {
    const g = build(BEAST);
    expect(evokeOptions(g)).toEqual([]);
    expect(getView(g.state, 0).seats[0]?.hand?.[0]?.alternativeCosts).toBeUndefined();
  });

  test('without the permanent there is no evoke', () => {
    const g = scenario().seat(0).hand(HEAVY).battlefield('Forest', { count: 4 }).seat(1).build();
    expect(evokeOptions(g)).toEqual([]);
  });

  test('only from the hand: the card in a graveyard or in exile is not offered it', () => {
    const g = scenario()
      .seat(0)
      .graveyard(HEAVY)
      .exile(HEAVY)
      .battlefield(GRANTER)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    expect(evokeOptions(g)).toEqual([]);
  });

  test('the permanent of the opponent gives nothing to the spells of this player', () => {
    const g = scenario()
      .seat(0)
      .hand(HEAVY)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .battlefield(GRANTER)
      .build();
    expect(evokeOptions(g)).toEqual([]);
  });

  test('a card with an evoke cost of its own is cast for that one, not the granted one', () => {
    const g = build(CHEAP, 1);
    g.expect.legal(0, { cast: CHEAP, alternative: 'evoke' });
    const card = getView(g.state, 0).seats[0]?.hand?.[0];
    expect(card?.alternativeCosts).toEqual([{ kind: 'evoke', cost: ['1'] }]);
  });

  test('cancelling the cast restores everything (CR 733)', () => {
    const g = build(HEAVY);
    const before = g.positionHash();
    g.act(0).cast(HEAVY, { alternative: 'evoke' }).cancel();
    g.expect.position(before);
  });
});

describe('the evoked permanent is sacrificed when it enters (CR 702.74a)', () => {
  test('it enters, both triggers happen and it is sacrificed', () => {
    const g = scenario()
      .seat(0)
      .hand(HEAVY)
      .battlefield(GRANTER)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(HEAVY, { alternative: 'evoke', pay: true });
    expect(getView(g.state, 1).stack[0]?.alternative).toBe('evoke');
    g.pass(0);
    g.pass(1);
    g.expect.zone(HEAVY, 'battlefield', { seat: 0 });
    expect(getView(g.state, 1).battlefield.find((o) => o.name === HEAVY)?.alternative).toBe(
      'evoke',
    );
    g.expect.pending('orderTriggers', 0); // the enters trigger and the sacrifice of the evoke cost
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.zone(HEAVY, 'graveyard', { seat: 0 });
    g.expect.life(0, 42);
    g.expect.invariants();
  });

  test('the granter leaves before the spell resolves: it still has evoke and is sacrificed', () => {
    const g = scenario()
      .seat(0)
      .hand(HEAVY)
      .battlefield(GRANTER)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .build();
    g.act(0).cast(HEAVY, { alternative: 'evoke', pay: true });
    g.pass(0);
    g.act(1).cast('Murder', { targets: [GRANTER], pay: true });
    g.passAll(); // Murder resolves, the granter dies
    g.expect.zone(GRANTER, 'graveyard', { seat: 0 });
    g.passAll(); // the Elemental spell resolves
    g.expect.zone(HEAVY, 'battlefield', { seat: 0 });
    g.act(0).orderTriggers(0, 1); // its enters trigger and the sacrifice
    g.passAll();
    g.expect.zone(HEAVY, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('an ordinary cast of the same card is not evoked', () => {
    const g = scenario()
      .seat(0)
      .hand(HEAVY)
      .battlefield(GRANTER)
      .battlefield('Forest', { count: 6 })
      .seat(1)
      .build();
    g.act(0).cast(HEAVY, { pay: true });
    g.passAll();
    g.expect.zone(HEAVY, 'battlefield', { seat: 0 });
    g.passAll();
    g.expect.zone(HEAVY, 'battlefield', { seat: 0 });
  });

  test('the permanent that came from the evoked spell remembers it, and a new object after a zone change does not (CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .hand(HEAVY)
      .battlefield(GRANTER)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(HEAVY, { alternative: 'evoke', pay: true });
    const spell = g.find({ name: HEAVY, zone: 'stack' })[0];
    expect(spell?.stack?.evokeGrant).toEqual({ cost: [{ kind: 'mana', symbols: ['4'] }] });
    g.pass(0);
    g.pass(1);
    const entered = g.state.objects[g.id({ name: HEAVY, zone: 'battlefield', seat: 0 })];
    expect(entered?.alt).toBe('evoke');
    expect(entered?.evokeGranted).toBe(true);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    // A zone change makes a new object that was not evoked.
    const gone = g.state.objects[g.id({ name: HEAVY, zone: 'graveyard', seat: 0 })];
    expect(gone?.alt).toBeUndefined();
    expect(gone?.evokeGranted).toBeUndefined();
  });
});

describe('the copy trigger of a card that has both (CR 603.7, 118.12a, 707.2)', () => {
  const mana = () => [
    ...['Forest', 'Forest', 'Forest', 'Forest'].map((name) => name),
    'Plains',
    'Island',
    'Swamp',
    'Mountain',
    'Forest',
  ];
  const build = () =>
    scenario()
      .seat(0)
      .hand(HEAVY)
      .battlefield(ECHO)
      .battlefield(GRANTER)
      .battlefield(...mana())
      .seat(1)
      .build();

  test('the evoked Elemental is sacrificed, a hasty token copy of it is made and it stays when its controller pays', () => {
    const g = build();
    g.act(0).cast(HEAVY, { alternative: 'evoke' });
    // Pay the {4} from the four Forests so that the five colors are left for the delayed trigger.
    const forests = g
      .find({ name: 'Forest', zone: 'battlefield' })
      .slice(0, 4)
      .map((o) => ({ object: o.id, abilityIndex: 0 }));
    g.act(0).choose({ kind: 'payManual', taps: forests });
    g.pass(0);
    g.pass(1);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.zone(HEAVY, 'graveyard', { seat: 0 });
    const token = g.find({ name: HEAVY, zone: 'battlefield', seat: 0 });
    expect(token).toHaveLength(1);
    expect(token[0]?.token).not.toBeNull();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === HEAVY)?.keywords).toContain(
      'haste',
    );
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('end');
    g.passAll();
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    expect(g.find({ name: HEAVY, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    g.expect.invariants();
  });

  const evokeFromForests = (g: ScenarioGame) => {
    g.act(0).cast(HEAVY, { alternative: 'evoke' });
    const forests = g
      .find({ name: 'Forest', zone: 'battlefield' })
      .slice(0, 4)
      .map((o) => ({ object: o.id, abilityIndex: 0 }));
    g.act(0).choose({ kind: 'payManual', taps: forests });
    g.pass(0);
    g.pass(1);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
  };

  test('the controller does not pay: the token is sacrificed, and the token does not make another copy (it is not a nontoken Elemental)', () => {
    const g = build();
    evokeFromForests(g);
    g.advanceTo('end');
    g.passAll();
    g.act(0).decline();
    g.passAll();
    expect(g.find({ name: HEAVY, zone: 'battlefield' })).toHaveLength(0);
    expect(g.find({ name: HEAVY, zone: 'graveyard' })).toHaveLength(1);
    expect(g.state.delayedTriggers).toEqual([]);
    g.expect.invariants();
  });

  test('the copy is a token that is not evoked: it is still there after the evoke trigger window', () => {
    const g = build();
    evokeFromForests(g);
    const token = g.find({ name: HEAVY, zone: 'battlefield', seat: 0 })[0];
    expect(token?.alt).toBeUndefined();
    expect(token?.evokeGranted).toBeUndefined();
    expect(g.state.stack).toEqual([]);
  });

  test('a controller who cannot pay is not asked: the token is sacrificed', () => {
    const g = scenario()
      .seat(0)
      .hand(HEAVY)
      .battlefield(ECHO)
      .battlefield(GRANTER)
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    evokeFromForests(g);
    g.advanceTo('end');
    g.passAll();
    expect(g.find({ name: HEAVY, zone: 'battlefield' })).toHaveLength(0);
    g.expect.invariants();
  });

  test('a sacrifice with no evoke makes a copy too: the trigger is about the sacrificed nontoken Elemental', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ECHO)
      .battlefield(HEAVY)
      .battlefield('SYNTHETIC Altar')
      .seat(1)
      .build();
    g.act(0).activate('SYNTHETIC Altar');
    g.act(0).choosePermanents(HEAVY);
    g.passAll();
    expect(g.find({ name: HEAVY, zone: 'battlefield', seat: 0 })).toHaveLength(1);
    expect(g.find({ name: HEAVY, zone: 'graveyard', seat: 0 })).toHaveLength(1);
  });
});
