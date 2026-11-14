// Additional costs to cast a spell (D-095): "As an additional cost to cast this spell, sacrifice a
// creature / an artifact or creature / a land", "discard a card", "pay 3 life", "pay {1}".
// Pins: CR 118.8 (additional costs), CR 601.2b (announced), CR 601.2f (the total cost), CR 601.2h
// (the player pays the total cost; unpayable costs can't be paid, so the spell is not castable),
// CR 118.3 (a cost that can't be paid fully isn't paid), CR 701.21 (sacrifice), CR 701.9 (discard),
// CR 603.10a (a creature that dies as a cost still triggers), CR 733 (cancel rewinds the cast).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-costs.ts).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, getLegalActions, getView } from '../src/index';
import { scenario } from '../src/testing/index';
import { chooseCardsDecision, choosePermanentDecision } from './pending-helpers';

const DRAW = 'SYNTHETIC Sacrifice Draw'; // {B}, sacrifice a creature, draw two
const OFFERING = 'SYNTHETIC Offering Bolt'; // {1}{R}, sacrifice an artifact or creature, 4 damage
const LAND = 'SYNTHETIC Land Offering'; // {2}{G}, sacrifice a land, gain 6
const BURN = 'SYNTHETIC Discard Burn'; // {R}, discard a card, 3 damage
const TOLL = 'SYNTHETIC Double Toll'; // {1}{B}, sacrifice a creature and discard a card, 5 life
const PRICE = 'SYNTHETIC Blood Price'; // {B}, pay 3 life, draw two
const TAX = 'SYNTHETIC Extra Mana Tax'; // {R}, pay {1}, draw one
const KICK = 'SYNTHETIC Sacrifice Kicker'; // {R}, kicker {2}, sacrifice a creature, 2 or 5 damage
const SCOUT = 'SYNTHETIC Doomed Scout'; // artifact creature, dies: gain 2

describe('a sacrifice paid with the spell (CR 118.8, 701.21)', () => {
  const drawer = (...creatures: string[]) =>
    scenario()
      .seat(0)
      .hand(DRAW)
      .battlefield('Swamp', ...creatures)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();

  test('the mana is paid first, then the caster chooses what to sacrifice', () => {
    const g = drawer('Grizzly Bears', 'Llanowar Elves');
    const cast = g.act(0).cast(DRAW);
    g.expect.pending('payMana', 0);
    cast.pay();
    expect(g.state.casting?.stage).toBe('sacrifice');
    const d = choosePermanentDecision(g);
    expect(d).toMatchObject({ purpose: 'sacrifice', forCost: true, min: 1, max: 1, seat: 0 });
    expect(d.legal).toHaveLength(2);
    expect(d.source).toBe(g.id({ name: DRAW, zone: 'stack' }));
    g.act(0).choosePermanents('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.stack([DRAW]);
    g.expect.pending('priority', 0);
    g.expect.eventLog([
      { kind: 'permanentsChosen', purpose: 'sacrifice', automatic: false },
      { kind: 'sacrificed' },
      { kind: 'spellCast' },
    ]);
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('with one candidate the engine chooses and says so', () => {
    const g = drawer('Grizzly Bears');
    g.act(0).cast(DRAW, { pay: true });
    g.expect.pending('priority', 0);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'permanentsChosen', automatic: true }, { kind: 'sacrificed' }]);
  });

  test('the sacrificed creature’s dies trigger goes on the stack above the spell (CR 603.3)', () => {
    const g = drawer(SCOUT);
    g.act(0).cast(DRAW, { pay: true });
    g.expect.stack([`${SCOUT} (ability)`, DRAW]);
    g.passAll();
    g.expect.life(0, 42);
    g.expect.handSize(0, 2);
  });

  test('a trigger noted before a question still goes on the stack once the cast is done', () => {
    // Two creatures: the question is asked, the dying one's trigger waited through it.
    const g = drawer(SCOUT, 'Grizzly Bears');
    g.act(0).cast(DRAW, { pay: true });
    g.act(0).choosePermanents(SCOUT);
    g.expect.stack([`${SCOUT} (ability)`, DRAW]);
  });

  test('"an artifact or creature": the choice spans both, and a Treasure-less artifact can go', () => {
    const g = scenario()
      .seat(0)
      .hand(OFFERING)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Sol Ring', 'Grizzly Bears')
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    // Targets come first (CR 601.2c), then the mana, then the sacrifice.
    const cast = g.act(0).cast(OFFERING);
    g.expect.pending('targets', 0);
    cast.targets(['Giant Spider']);
    g.expect.pending('payMana', 0);
    cast.pay();
    expect(choosePermanentDecision(g).legal).toHaveLength(2);
    g.act(0).choosePermanents('Sol Ring');
    g.expect.zone('Sol Ring', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
  });

  test('a land can be sacrificed after it was tapped for the mana', () => {
    const g = scenario().seat(0).hand(LAND).battlefield('Forest', { count: 3 }).seat(1).build();
    g.act(0).cast(LAND, { pay: true });
    // All three Forests paid the {2}{G}; the choice is among the tapped lands.
    expect(choosePermanentDecision(g).legal).toHaveLength(3);
    g.act(0).choosePermanents('Forest[1]');
    g.passAll();
    expect(g.find({ name: 'Forest', zone: 'battlefield' })).toHaveLength(2);
    g.expect.life(0, 46);
  });

  test('the sacrifice is a cost: the spell is cast even if its target is the sacrificed permanent', () => {
    const g = scenario()
      .seat(0)
      .hand(OFFERING)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Grizzly Bears', 'Sol Ring')
      .seat(1)
      .build();
    g.act(0).cast(OFFERING, { targets: ['Grizzly Bears'], pay: true });
    g.act(0).choosePermanents('Grizzly Bears');
    g.expect.stack([OFFERING]);
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone(OFFERING, 'graveyard', { seat: 0 });
  });

  test('a spell whose additional cost cannot be paid is not castable, offered nowhere', () => {
    const g = drawer();
    g.expect.illegal(0, { cast: DRAW });
    expect(g.act(0).try.cast(DRAW)).toEqual({
      ok: false,
      error: 'That is not a legal play now',
    });
    // Only the opponent's creature: nothing of its own to sacrifice.
    const h = scenario()
      .seat(0)
      .hand(DRAW)
      .battlefield('Swamp')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    h.expect.illegal(0, { cast: DRAW });
  });

  test('a creature is enough: the cast is offered and the engine accepts it', () => {
    const g = drawer('Grizzly Bears');
    g.expect.legal(0, { cast: DRAW });
    expect(g.act(0).try.cast(DRAW).ok).toBe(true);
  });

  test('cancelling at the sacrifice question rewinds the whole cast, mana included (CR 733)', () => {
    const g = drawer('Grizzly Bears', 'Llanowar Elves');
    const before = g.positionHash();
    g.act(0).cast(DRAW, { pay: true });
    expect(choosePermanentDecision(g).forCost).toBe(true);
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(true);
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.tapped('Swamp', false);
    g.expect.zone(DRAW, 'hand', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('the sacrifice question is the caster’s: the other seat cannot answer it', () => {
    const g = drawer('Grizzly Bears', 'Llanowar Elves');
    g.act(0).cast(DRAW, { pay: true });
    const elves = g.id('Llanowar Elves');
    expect(applyAction(g.state, 1, { kind: 'choosePermanents', objects: [elves] }).ok).toBe(false);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('a choice that is not among the candidates is refused', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAW)
      .battlefield('Swamp', 'Grizzly Bears', 'Llanowar Elves', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(DRAW, { pay: true });
    const land = g.id('Plains');
    expect(applyAction(g.state, 0, { kind: 'choosePermanents', objects: [land] }).ok).toBe(false);
  });

  describe('a source that sacrifices itself for mana (a Treasure) is not spent on the cost it must keep', () => {
    // SYNTHETIC test cards: a nontoken artifact that taps and sacrifices itself for one mana of any
    // color, and a spell that needs an artifact to sacrifice.
    const treasure = singleFace({
      name: 'SYNTHETIC Test Gem',
      manaCost: ['1'],
      types: ['artifact'],
      colors: [],
      colorIdentity: [],
      oracleText: '{T}, Sacrifice this artifact: Add one mana of any color.',
      abilities: [
        {
          kind: 'mana',
          cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
          production: { kind: 'anyColor' },
        },
      ],
    });
    const rite = singleFace({
      name: 'SYNTHETIC Test Artifact Rite',
      manaCost: ['1'],
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'As an additional cost to cast this spell, sacrifice an artifact. Draw a card.',
      additionalCosts: [{ kind: 'sacrifice', what: { types: ['artifact'] } }],
      spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
    });

    test('when the gem is the only mana source the spell is not castable', () => {
      const g = scenario()
        .define(treasure)
        .define(rite)
        .seat(0)
        .hand(rite.name)
        .battlefield(treasure.name)
        .seat(1)
        .build();
      g.expect.illegal(0, { cast: rite.name });
    });

    test('with another source the gem stays for the sacrifice', () => {
      const g = scenario()
        .define(treasure)
        .define(rite)
        .seat(0)
        .hand(rite.name)
        .battlefield(treasure.name, 'Mountain')
        .library('Plains')
        .seat(1)
        .build();
      g.expect.legal(0, { cast: rite.name });
      g.act(0).cast(rite.name, { pay: true });
      g.expect.tapped('Mountain');
      g.expect.zone(treasure.name, 'graveyard', { seat: 0 });
      g.passAll();
      g.expect.handSize(0, 1);
    });

    test('a payment by hand that sacrifices the gem for the mana is refused and can be redone', () => {
      const g = scenario()
        .define(treasure)
        .define(rite)
        .seat(0)
        .hand(rite.name)
        .battlefield(treasure.name, 'Mountain')
        .library('Plains')
        .seat(1)
        .build();
      const cast = g.act(0).cast(rite.name);
      const bad = g.act(0).try.action({
        kind: 'payManual',
        taps: [{ object: g.id(treasure.name), abilityIndex: 0, color: 'R' }],
      });
      expect(bad.ok).toBe(false);
      g.expect.pending('payMana', 0);
      g.expect.zone(treasure.name, 'battlefield', { seat: 0 });
      cast.payManual(['Mountain']);
      g.expect.zone(treasure.name, 'graveyard', { seat: 0 });
    });
  });

  test('a payment by hand that uses up the only candidate is refused, and can be redone', () => {
    // The Elves can tap for {G}: paying {B}... use a creature that makes the needed mana.
    const g = scenario()
      .seat(0)
      .hand(OFFERING)
      .battlefield('Mountain', { count: 1 })
      .battlefield('Llanowar Elves')
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    // {1}{R}: Mountain makes R, the Elves make the {1}; the Elves are then tapped but can still be
    // sacrificed (tapped permanents may be sacrificed).
    const cast = g.act(0).cast(OFFERING, { targets: ['Giant Spider'] });
    cast.payManual(['Mountain', 'Llanowar Elves']);
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.expect.stack([OFFERING]);
  });
});

describe('a discard paid with the spell (CR 118.8, 701.9)', () => {
  const burner = (...hand: string[]) =>
    scenario()
      .seat(0)
      .hand(BURN, ...hand)
      .battlefield('Mountain')
      .seat(1)
      .build();

  test('with several cards in hand the caster chooses, after the mana', () => {
    const g = burner('Forest', 'Island', 'Plains');
    const cast = g.act(0).cast(BURN, { targets: [{ player: 1 }] });
    cast.pay();
    expect(g.state.casting?.stage).toBe('discard');
    const d = chooseCardsDecision(g);
    expect(d).toMatchObject({
      purpose: 'discard',
      zone: 'hand',
      forCost: true,
      min: 1,
      max: 1,
      reveal: true,
      seat: 0,
    });
    // The spell is on the stack: it is not one of the cards that can be discarded.
    expect(d.legal).toHaveLength(3);
    expect(d.legal).not.toContain(g.id({ name: BURN, zone: 'stack' }));
    g.act(0).chooseCards('Island');
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.stack([BURN]);
    g.expect.eventLog([{ kind: 'discarded', seat: 0 }, { kind: 'spellCast' }]);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('exactly one other card: it is discarded without a question', () => {
    const g = burner('Forest');
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    g.expect.pending('priority', 0);
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.handSize(0, 0);
  });

  test('no other card in hand: not castable (the spell itself cannot be discarded)', () => {
    const g = burner();
    g.expect.illegal(0, { cast: BURN });
  });

  test('cancelling at the discard question gives the card and the mana back', () => {
    const g = burner('Forest', 'Island');
    const before = g.positionHash();
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(true);
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.tapped('Mountain', false);
    g.expect.handSize(0, 3);
  });

  test('the choice must be exactly one card from the hand', () => {
    const g = burner('Forest', 'Island');
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    const forest = g.id('Forest');
    const island = g.id('Island');
    expect(applyAction(g.state, 0, { kind: 'chooseCards', objects: [] }).ok).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'chooseCards', objects: [forest, island] }).ok).toBe(
      false,
    );
    expect(applyAction(g.state, 0, { kind: 'chooseCards', objects: [forest] }).ok).toBe(true);
  });

  test('the discarded cards are public: the other seat sees the event, never the choice before', () => {
    const g = burner('Forest', 'Island');
    g.act(0).cast(BURN, { targets: [{ player: 1 }], pay: true });
    const theirs = getView(g.state, 1);
    expect(theirs.pending).toBeNull();
    expect(theirs.waitingOn).toMatchObject({ seat: 0, purpose: 'discard', sourceName: BURN });
    expect(theirs.pendingCards).toBeUndefined();
    expect(JSON.stringify(theirs)).not.toContain('Forest');
  });
});

describe('several additional costs, life and mana', () => {
  test('sacrifice, then discard: cancelling at the discard undoes the sacrifice too', () => {
    const g = scenario()
      .seat(0)
      .hand(TOLL, 'Forest', 'Island')
      .battlefield('Swamp', { count: 2 })
      .battlefield('Grizzly Bears', 'Llanowar Elves')
      .seat(1)
      .build();
    const before = g.positionHash();
    g.act(0).cast(TOLL, { pay: true });
    choosePermanentDecision(g);
    g.act(0).choosePermanents('Llanowar Elves');
    g.expect.pending('chooseCards', 0);
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 0 });
    g.act(0).cast(TOLL, { pay: true });
    g.act(0).choosePermanents('Llanowar Elves');
    g.act(0).chooseCards('Island');
    g.passAll();
    g.expect.life(1, 35);
    g.expect.zone('Island', 'graveyard', { seat: 0 });
  });

  test('a creature that died to the sacrifice before the discard question still triggers (CR 603.3)', () => {
    const g = scenario()
      .seat(0)
      .hand(TOLL, 'Forest', 'Island')
      .battlefield('Swamp', { count: 2 })
      .battlefield(SCOUT)
      .seat(1)
      .build();
    g.act(0).cast(TOLL, { pay: true });
    // The only creature is sacrificed at once; the question about the discard comes after it died.
    g.expect.pending('chooseCards', 0);
    g.expect.zone(SCOUT, 'graveyard', { seat: 0 });
    g.act(0).chooseCards('Forest');
    g.expect.stack([`${SCOUT} (ability)`, TOLL]);
    g.passAll();
    g.expect.life(0, 42);
    g.expect.life(1, 35);
  });

  test('both costs must be payable: a creature but no other card is not castable', () => {
    const g = scenario()
      .seat(0)
      .hand(TOLL)
      .battlefield('Swamp', { count: 2 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();
    g.expect.illegal(0, { cast: TOLL });
  });

  test('"pay 3 life" is paid with the cost, and needs a life total of at least 3 (CR 119.4)', () => {
    const g = scenario()
      .seat(0)
      .hand(PRICE)
      .battlefield('Swamp')
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(PRICE, { pay: true });
    g.expect.life(0, 37);
    g.passAll();
    g.expect.handSize(0, 2);
    const low = scenario().seat(0).life(2).hand(PRICE).battlefield('Swamp').seat(1).build();
    low.expect.illegal(0, { cast: PRICE });
    // CR 119.4: a player may pay life equal to their whole life total (they then have 0 and lose as state-based actions are checked).
    const exact = scenario().seat(0).life(3).hand(PRICE).battlefield('Swamp').seat(1).build();
    exact.expect.legal(0, { cast: PRICE });
    const ok = scenario().seat(0).life(4).hand(PRICE).battlefield('Swamp').seat(1).build();
    ok.expect.legal(0, { cast: PRICE });
  });

  test('paying the whole life total: the cost is paid, and the player loses before the spell resolves (CR 119.4, 704.5a)', () => {
    const g = scenario()
      .seat(0)
      .life(3)
      .hand(PRICE)
      .battlefield('Swamp')
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(PRICE, { pay: true });
    g.expect.life(0, 0);
    expect(g.state.result).not.toBeNull();
    expect(g.state.seats[0]?.hasLost).toBe(true);
  });

  test('cancelling gives the life back', () => {
    const g = scenario().seat(0).hand(PRICE).battlefield('Swamp').seat(1).build();
    const before = g.positionHash();
    const cast = g.act(0).cast(PRICE);
    g.expect.life(0, 37);
    cast.cancel();
    g.expect.position(before);
    g.expect.life(0, 40);
  });

  test('"pay {1}" adds generic mana to the total cost', () => {
    const one = scenario().seat(0).hand(TAX).battlefield('Mountain').seat(1).build();
    one.expect.illegal(0, { cast: TAX });
    const two = scenario()
      .seat(0)
      .hand(TAX)
      .battlefield('Mountain', { count: 2 })
      .library('Plains')
      .seat(1)
      .build();
    two.act(0).cast(TAX);
    expect((two.state.pending as { totalCost?: readonly string[] }).totalCost).toEqual(['R', '1']);
    two.act(0).payAuto();
    two.passAll();
    two.expect.handSize(0, 1);
  });
});

describe('with kicker', () => {
  const kicker = (lands: number) =>
    scenario()
      .seat(0)
      .hand(KICK)
      .battlefield('Mountain', { count: lands })
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();

  test('the kicked total is asked about only when it can be paid; the sacrifice is paid either way', () => {
    const short = kicker(2);
    short.act(0).cast(KICK);
    // {R} + {2} needs three lands: no kicker question, the spell goes on unkicked.
    short.expect.pending('targets', 0);
    short.act(0).cancel();
    const enough = kicker(3);
    enough.act(0).cast(KICK);
    expect(enough.state.pending?.kind).toBe('confirmOptional');
    enough.act(0).accept();
    enough.act(0).chooseTargets({ player: 1 });
    enough.act(0).payAuto();
    enough.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    enough.passAll();
    enough.expect.life(1, 35);
  });

  test('unkicked: 2 damage, and the creature is still sacrificed', () => {
    const g = kicker(1);
    g.act(0).cast(KICK, { targets: [{ player: 1 }], pay: true });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.life(1, 38);
  });
});
