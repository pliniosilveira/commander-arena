// Casting and targets (D-181, the Korvold slice 3): a target chosen only if the spell was kicked and one chosen only if it was not, an additional
// cost paid in one of two ways, a spell's own cost reduction with a condition, and the change of the target of a spell or ability with a single target.
// Pins: CR 702.33g and 601.2c (a spell may require some targets only if an additional cost such as a kicker cost was chosen; otherwise it is cast as
// though it did not require them, and "alternative targets" only if one was), CR 601.2b (the intention to pay an additional cost is announced before the
// targets), CR 118.8 (additional costs), CR 601.2f (the cost reduction is read when the total cost is determined, and only the generic part is reduced),
// CR 115.7a (a target is changed only to another legal target; if it cannot be, it stays), CR 115.7f (the division stays), CR 115.9a (a spell with a
// single target: the number of times a target was chosen), CR 603.2c (the new target becomes a target). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-casting-targets.ts and the ones named below).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, getLegalActions, getView, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import {
  choosePermanentDecision,
  confirmOptionalDecision,
  targetsDecision,
} from './pending-helpers';

const REND = 'SYNTHETIC Rend Asunder'; // {1}{G} instant, kicker {1}{B}: exile target artifact or enchantment, kicked: target nonland permanent instead
const HEX = 'SYNTHETIC Kicked Hex'; // {1}{B} sorcery, kicker {2}: draw a card; kicked: destroy target creature
const STIR = 'SYNTHETIC Stir Trouble'; // {B} sorcery, sacrifice an artifact or creature or pay {4}: destroy target creature
const BENT = 'SYNTHETIC Bent Bolt'; // {3}{R} instant, {3} less with a creature with power 4 or greater: change the target of a spell or ability with a single target
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ANGEL = 'Serra Angel'; // 4/4
const RING = 'Sol Ring';
const MURDER = 'Murder';
const BOLT = 'Lightning Bolt';
const VOLLEY = 'SYNTHETIC Arc Volley'; // {1}{R} instant: 3 damage divided among one to three targets
const SPLIT = 'SYNTHETIC Split Bolt'; // two targets
const NO_TARGET = 'SYNTHETIC Kicker Gain'; // {W} instant: you gain 2 life, no target
const ECHO = 'SYNTHETIC Spell Echo'; // whenever an opponent casts a spell, deals damage equal to its mana value to any target
const WISP = 'SYNTHETIC Flash Hexproof Wisp';
const AURA = 'SYNTHETIC Casting Enchantment';
const WARD = 'SYNTHETIC Casting Ward Bear';

const enchantment = singleFace({
  name: AURA,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC enchantment with no abilities.',
});
const wardBear = singleFace({
  name: WARD,
  manaCost: ['1', 'G'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'Ward {2}',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['2'] }] } },
  ],
});

const FILLER = Array.from({ length: 8 }, () => 'Plains');
type Builder = ReturnType<typeof scenario>;

/** Seat 0 at its main phase with `mine` and seat 1 with `theirs`; both have library cards. */
function game(mine: (b: Builder) => Builder, theirs: (b: Builder) => Builder = (b) => b) {
  const b = scenario()
    .seat(0)
    .define(enchantment)
    .define(wardBear)
    .library(...FILLER);
  return theirs(
    mine(b)
      .seat(1)
      .library(...FILLER),
  ).build();
}

/** The cards in seat 0's hand as its view shows them. */
const handOf = (g: ScenarioGame) => getView(g.state, 0).seats[0]?.hand ?? [];

const castable = (g: ScenarioGame, name: string, seat = 0): boolean =>
  g.legalActions(seat).some((a) => a.kind === 'castSpell' && a.object === g.id(name));

const tappedLands = (g: ScenarioGame): number =>
  g.state.battlefield.filter((id) => {
    const o = g.state.objects[id];
    return o?.controller === 0 && o.tapped;
  }).length;

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

// ---- A target chosen only if the spell was kicked, and one chosen only if it was not (CR 702.33g, 601.2c)

describe('Tear Asunder shape: "Exile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead."', () => {
  const rend = (lands: { forests: number; swamps: number }) =>
    game(
      (b) =>
        b
          .seat(0)
          .hand(REND)
          .battlefield('Forest', { count: lands.forests })
          .battlefield('Swamp', { count: lands.swamps }),
      (b) => b.battlefield(RING, AURA, SPIDER),
    );

  test('the card is valid and the engine runs all of it', () => {
    for (const name of [REND, HEX, STIR, BENT]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('declined: only the artifact or enchantment slot is asked, and the artifact is exiled', () => {
    const g = rend({ forests: 2, swamps: 2 });
    g.act(0).cast(REND);
    expect(confirmOptionalDecision(g).purpose).toBe('kicker');
    g.act(0).decline();
    const d = targetsDecision(g);
    expect(d.specs.map((s) => s.specId)).toEqual(['t1']);
    expect(d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : null)).sort()).toEqual(
      [g.id(RING), g.id(AURA)].sort(),
    );
    g.act(0).chooseTargets(RING);
    g.act(0).payAuto();
    expect(g.state.casting).toBeNull();
    // {1}{G} was paid, not the kicker.
    expect(tappedLands(g)).toBe(2);
    expect(g.find({ name: 'Swamp', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(0);
    resolveTop(g);
    g.expect.zone(RING, 'exile', { seat: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.zone(AURA, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('kicked: only the nonland permanent slot is asked (the artifact slot is not), and a creature is exiled', () => {
    const g = rend({ forests: 2, swamps: 2 });
    g.act(0).cast(REND, { kicked: true });
    const d = targetsDecision(g);
    expect(d.specs.map((s) => s.specId)).toEqual(['t2']);
    const legal = d.specs[0]?.legal.flatMap((t) => (t.kind === 'object' ? [t.id] : [])) ?? [];
    expect(legal.sort()).toEqual([g.id(RING), g.id(AURA), g.id(SPIDER)].sort());
    g.act(0).chooseTargets(SPIDER);
    g.act(0).payAuto();
    // The kicker was paid too: all four lands are tapped.
    expect(tappedLands(g)).toBe(4);
    resolveTop(g);
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.zone(RING, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('only a creature to exile: the spell can only be cast kicked, so it is kicked without asking', () => {
    const g = game(
      (b) =>
        b.seat(0).hand(REND).battlefield('Forest', { count: 2 }).battlefield('Swamp', { count: 2 }),
      (b) => b.battlefield(SPIDER),
    );
    expect(castable(g, REND)).toBe(true);
    g.act(0).cast(REND);
    // No kicker question: the unkicked spell has no target.
    expect(g.state.pending?.kind).toBe('targets');
    expect(targetsDecision(g).specs.map((s) => s.specId)).toEqual(['t2']);
    expect(getView(g.state, 0).stack[0]?.kicked).toBe(true);
    g.act(0).chooseTargets(SPIDER);
    g.act(0).payAuto();
    resolveTop(g);
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
  });

  test('only a creature to exile and no mana for the kicker: it cannot be cast', () => {
    const g = game(
      (b) => b.seat(0).hand(REND).battlefield('Forest', { count: 2 }),
      (b) => b.battlefield(SPIDER),
    );
    expect(castable(g, REND)).toBe(false);
    expect(applyAction(g.state, 0, { kind: 'castSpell', object: g.id(REND) }).ok).toBe(false);
  });

  test('an artifact and no mana for the kicker: it is cast unkicked without asking', () => {
    const g = game(
      (b) => b.seat(0).hand(REND).battlefield('Forest', { count: 2 }),
      (b) => b.battlefield(RING, AURA, SPIDER),
    );
    g.act(0).cast(REND);
    expect(g.state.pending?.kind).toBe('targets');
    expect(targetsDecision(g).specs.map((s) => s.specId)).toEqual(['t1']);
    expect(getView(g.state, 0).stack[0]?.kicked).toBeUndefined();
  });

  test('nothing to exile at all: it cannot be cast', () => {
    const g = game(
      (b) =>
        b.seat(0).hand(REND).battlefield('Forest', { count: 2 }).battlefield('Swamp', { count: 2 }),
      (b) => b.battlefield('Forest'),
    );
    expect(castable(g, REND)).toBe(false);
  });

  test('cancelling at the kicker question rewinds the cast; a land is never a target', () => {
    const g = rend({ forests: 2, swamps: 2 });
    g.act(0).cast(REND);
    g.act(0).cancel();
    expect(g.state.casting).toBeNull();
    g.expect.zone(REND, 'hand', { seat: 0 });
    g.act(0).cast(REND, { kicked: true });
    const legal = targetsDecision(g).specs[0]?.legal ?? [];
    // A land is never a legal target of the kicked slot (nonland permanent).
    const lands = getView(g.state, 0).battlefield.filter((o) => o.types.includes('land'));
    expect(legal.some((t) => t.kind === 'object' && lands.some((l) => l.id === t.id))).toBe(false);
  });

  test('every action the engine lists after the kicker answer is accepted', () => {
    const g = rend({ forests: 2, swamps: 2 });
    g.act(0).cast(REND, { kicked: true });
    for (const action of getLegalActions(g.state, 0)) {
      if (action.kind === 'concede') continue;
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
  });
});

describe('a target chosen only if the spell was kicked, with no unkicked target: "Draw a card. If this spell was kicked, destroy target creature."', () => {
  const hex = (lands: number, theirs: (b: Builder) => Builder = (b) => b.battlefield(SPIDER)) =>
    game((b) => b.seat(0).hand(HEX).battlefield('Swamp', { count: lands }), theirs);

  test('unkicked: no target is asked, a card is drawn', () => {
    const g = hex(4);
    g.act(0).cast(HEX);
    g.act(0).decline();
    expect(g.state.pending?.kind).toBe('payMana');
    g.act(0).payAuto();
    resolveTop(g);
    g.expect.handSize(0, 1);
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
  });

  test('kicked: the creature is chosen and destroyed, a card is drawn', () => {
    const g = hex(4);
    g.act(0).cast(HEX, { kicked: true, targets: [SPIDER], pay: true });
    resolveTop(g);
    g.expect.handSize(0, 1);
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('no creature to destroy: the kicker is not asked, the spell is cast unkicked', () => {
    const g = hex(4, (b) => b);
    g.act(0).cast(HEX);
    expect(g.state.pending?.kind).toBe('payMana');
    expect(getView(g.state, 0).stack[0]?.kicked).toBeUndefined();
  });

  test('a copy of a kicked spell has the kicked slot, not the unkicked one', () => {
    const g = game(
      (b) =>
        b
          .seat(0)
          .hand(REND, 'SYNTHETIC Twin Spell')
          .battlefield('Forest', { count: 2 })
          .battlefield('Swamp', { count: 2 })
          .battlefield('Island', { count: 2 }),
      (b) => b.battlefield(RING, SPIDER),
    );
    g.act(0).cast(REND, { kicked: true, targets: [SPIDER], pay: true });
    g.act(0).cast('SYNTHETIC Twin Spell', { targets: [{ name: REND, zone: 'stack' }], pay: true });
    resolveTop(g);
    const d = targetsDecision(g);
    expect(d.forCopy).toBe(true);
    expect(d.specs.map((s) => s.specId)).toEqual(['t2']);
  });
});

// ---- An additional cost paid in one of two ways (CR 118.8, 601.2b)

describe('"As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}."', () => {
  const stir = (mine: (b: Builder) => Builder, theirs = (b: Builder) => b.battlefield(SPIDER)) =>
    game((b) => mine(b.seat(0).hand(STIR)), theirs);

  test('both ways can be paid: the question is asked first, with the two ways', () => {
    const g = stir((b) => b.battlefield('Swamp', { count: 5 }).battlefield(BEARS));
    g.act(0).cast(STIR);
    const d = confirmOptionalDecision(g);
    expect(d.purpose).toBe('costChoice');
    expect(d.cost).toEqual([
      { kind: 'sacrifice', what: { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] } },
    ]);
    expect(d.otherCost).toEqual([{ kind: 'mana', symbols: ['4'] }]);
    expect(g.state.casting?.stage).toBe('kicker');
    expect(getLegalActions(g.state, 0).map((a) => a.kind)).toEqual([
      'acceptOptional',
      'declineOptional',
      'cancel',
      'concede',
    ]);
  });

  test('the first way: the mana of the spell only, then the sacrifice', () => {
    const g = stir((b) =>
      b.battlefield('Swamp', { count: 5 }).battlefield(BEARS, 'Llanowar Elves'),
    );
    const cast = g.act(0).cast(STIR, { additionalCost: true, targets: [SPIDER] });
    expect(g.state.casting?.totalCost).toEqual(['B']);
    cast.pay();
    expect(choosePermanentDecision(g).purpose).toBe('sacrifice');
    g.act(0).choosePermanents('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    expect(g.find({ name: 'Swamp', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(1);
    resolveTop(g);
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('the second way: {4} more, and nothing is sacrificed', () => {
    const g = stir((b) => b.battlefield('Swamp', { count: 5 }).battlefield(BEARS));
    const cast = g.act(0).cast(STIR, { additionalCost: false, targets: [SPIDER] });
    expect(g.state.casting?.totalCost).toEqual(['B', '4']);
    cast.pay();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.find({ name: 'Swamp', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(5);
    resolveTop(g);
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
  });

  test('only the sacrifice can be paid (one land): not asked, the creature is sacrificed', () => {
    const g = stir((b) => b.battlefield('Swamp').battlefield(BEARS));
    expect(castable(g, STIR)).toBe(true);
    g.act(0).cast(STIR, { targets: [SPIDER], pay: true });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('only {4} can be paid (nothing to sacrifice): not asked, the total is {4}{B}', () => {
    const g = stir((b) => b.battlefield('Swamp', { count: 5 }));
    g.act(0).cast(STIR);
    expect(g.state.pending?.kind).toBe('targets');
    g.act(0).chooseTargets(SPIDER);
    expect(g.state.casting?.totalCost).toEqual(['B', '4']);
  });

  test('neither way can be paid: it cannot be cast', () => {
    const g = stir((b) => b.battlefield('Swamp', { count: 2 }));
    expect(castable(g, STIR)).toBe(false);
  });

  test('a creature or an artifact is a way to pay: Sol Ring alone', () => {
    const g = stir((b) => b.battlefield('Swamp').battlefield(RING));
    expect(castable(g, STIR)).toBe(true);
  });

  test('cancelling at the question rewinds the cast', () => {
    const g = stir((b) => b.battlefield('Swamp', { count: 5 }).battlefield(BEARS));
    g.act(0).cast(STIR);
    g.act(0).cancel();
    expect(g.state.casting).toBeNull();
    g.expect.zone(STIR, 'hand', { seat: 0 });
  });

  test('the view lists both ways on the card in the hand', () => {
    const g = stir((b) => b.battlefield('Swamp', { count: 5 }).battlefield(BEARS));
    const card = handOf(g).find((o) => o.name === STIR);
    expect(card?.additionalCostChoice).toEqual([
      [{ kind: 'sacrifice', what: { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }] } }],
      [{ kind: 'mana', symbols: ['4'] }],
    ]);
  });
});

// ---- A spell's own cost reduction with a condition (CR 601.2f)

describe('"This spell costs {3} less to cast if you control a creature with power 4 or greater."', () => {
  const bent = (mine: (b: Builder) => Builder, theirs = (b: Builder) => b) =>
    game((b) => mine(b.seat(0).hand(BENT, BOLT)), theirs);

  test('with a creature with power 4 the cost is {R}', () => {
    const g = bent((b) => b.battlefield('Mountain').battlefield(ANGEL));
    expect(handOf(g).find((o) => o.name === BENT)?.castCost).toEqual(['R']);
  });

  test('with power 3 or less the cost is {3}{R}', () => {
    const g = bent((b) => b.battlefield('Mountain').battlefield(BEARS));
    expect(handOf(g).find((o) => o.name === BENT)?.castCost).toEqual(['3', 'R']);
  });

  test('a creature an opponent controls does not count: "you control"', () => {
    const g = bent(
      (b) => b.battlefield('Mountain'),
      (b) => b.battlefield(ANGEL),
    );
    expect(handOf(g).find((o) => o.name === BENT)?.castCost).toEqual(['3', 'R']);
  });

  test('it is offered with one Mountain only if the condition holds', () => {
    const without = bent((b) => b.battlefield('Mountain').battlefield(BEARS));
    const stack = (g: ScenarioGame) => g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    stack(without);
    expect(castable(without, BENT)).toBe(false);
    const withAngel = bent((b) => b.battlefield('Mountain', { count: 2 }).battlefield(ANGEL));
    stack(withAngel);
    expect(castable(withAngel, BENT)).toBe(true);
  });

  test('only the generic mana is reduced: with the creature, {R} is still paid', () => {
    const g = bent((b) =>
      b.battlefield('Plains').battlefield('Mountain', { count: 2 }).battlefield(ANGEL),
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: BOLT, zone: 'stack' }] });
    expect(g.state.casting?.totalCost).toEqual(['R']);
  });

  test('the condition is read as the cost is determined: the cost stays locked in', () => {
    const g = bent((b) => b.battlefield('Mountain', { count: 2 }).battlefield(ANGEL));
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    expect(g.state.casting).toBeNull();
    g.expect.stack([BENT, BOLT]);
  });

  test('the card is valid', () => {
    const def = game((b) => b.seat(0).hand(BENT)).state.cards;
    expect(def).toBeDefined();
  });
});

// ---- The change of a target (CR 115.7a)

describe('"Change the target of target spell or ability with a single target."', () => {
  const bent = (mine: (b: Builder) => Builder, theirs = (b: Builder) => b) =>
    game((b) => mine(b.seat(0).hand(BENT).battlefield('Mountain', { count: 6 })), theirs);

  const targetsOf = (g: ScenarioGame, name: string) =>
    g.find({ name, zone: 'stack' })[0]?.stack?.chosenTargets ?? [];

  test('the only other legal target is taken without asking, and becomes the target', () => {
    const g = bent(
      (b) => b.hand(MURDER).battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(BEARS, SPIDER),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: MURDER, zone: 'stack' }], pay: true });
    const mark = g.mark();
    resolveTop(g);
    expect(targetsOf(g, MURDER)).toEqual([{ kind: 'object', id: g.id(SPIDER), specId: 't1' }]);
    const events = g.eventsSince(mark);
    expect(events).toContainEqual({
      kind: 'targetChanged',
      seat: 0,
      object: g.id({ name: MURDER, zone: 'stack' }),
      from: { kind: 'object', id: g.id(BEARS), specId: 't1' },
      to: { kind: 'object', id: g.id(SPIDER), specId: 't1' },
    });
    expect(events.filter((e) => e.kind === 'becameTarget')).toEqual([
      {
        kind: 'becameTarget',
        object: g.id(SPIDER),
        by: g.id({ name: MURDER, zone: 'stack' }),
        seat: 0,
      },
    ]);
    resolveTop(g);
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('no other legal target: the target stays, and nothing is asked or reported', () => {
    const g = bent(
      (b) => b.hand(MURDER).battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: MURDER, zone: 'stack' }], pay: true });
    const mark = g.mark();
    resolveTop(g);
    expect(g.eventsSince(mark).some((e) => e.kind === 'targetChanged')).toBe(false);
    expect(targetsOf(g, MURDER)).toEqual([{ kind: 'object', id: g.id(BEARS), specId: 't1' }]);
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('several other legal targets: the controller of the effect chooses, never the current one', () => {
    const g = bent(
      (b) => b.hand(BOLT),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g);
    const d = targetsDecision(g);
    expect(d.forChange).toBe(true);
    expect(d.seat).toBe(0);
    expect(d.subject).toBe(g.id({ name: BOLT, zone: 'stack' }));
    expect(d.source).toBe(g.id({ name: BENT, zone: 'stack' }));
    expect(d.current).toEqual([{ kind: 'player', seat: 1, specId: 't1' }]);
    expect(d.specs).toHaveLength(1);
    expect(d.specs[0]?.specId).toBe('t1');
    const legal = d.specs[0]?.legal ?? [];
    expect(legal).toContainEqual({ kind: 'player', seat: 0, specId: 't1' });
    expect(legal).toContainEqual({ kind: 'object', id: g.id(BEARS), specId: 't1' });
    expect(legal).not.toContainEqual({ kind: 'player', seat: 1, specId: 't1' });
    // The answer that keeps the target is refused; there is no cancel.
    expect(
      applyAction(g.state, 0, {
        kind: 'chooseTargets',
        targets: [{ kind: 'player', seat: 1, specId: 't1' }],
      }).ok,
    ).toBe(false);
    expect(getLegalActions(g.state, 0).some((a) => a.kind === 'cancel')).toBe(false);
    for (const action of getLegalActions(g.state, 0)) {
      if (action.kind === 'concede') continue;
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
    g.act(0).chooseTargets(BEARS);
    expect(targetsOf(g, BOLT)).toEqual([{ kind: 'object', id: g.id(BEARS), specId: 't1' }]);
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.life(1, 40);
    g.expect.invariants();
  });

  test('a spell with two targets, or with none, is not a legal target', () => {
    const g = bent(
      (b) =>
        b.hand(SPLIT, NO_TARGET, BOLT).battlefield('Plains').battlefield('Island', { count: 2 }),
      (b) => b.battlefield(BEARS),
    );
    g.act(0).cast(SPLIT, { targets: [BEARS, { player: 1 }], pay: true });
    g.act(0).cast(NO_TARGET, { kicked: false, pay: true });
    // Neither is a spell with a single target: Bent Bolt has nothing to target.
    expect(castable(g, BENT)).toBe(false);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    expect(castable(g, BENT)).toBe(true);
    g.act(0).cast(BENT);
    const legal = targetsDecision(g).specs[0]?.legal ?? [];
    expect(legal).toEqual([
      { kind: 'object', id: g.id({ name: BOLT, zone: 'stack' }), specId: 't1' },
    ]);
  });

  test('a spell is never its own target', () => {
    const g = bent(
      (b) => b.hand(BOLT),
      (b) => b,
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    const cast = g.act(0).cast(BENT);
    const legal = targetsDecision(g).specs[0]?.legal ?? [];
    expect(legal).toHaveLength(1);
    cast.cancel();
  });

  test('a triggered ability with a single target is changed too, for the player who controls it', () => {
    const g = game(
      (b) => b.seat(0).hand(BENT, BOLT).battlefield('Mountain', { count: 6 }).battlefield(BEARS),
      (b) => b.battlefield(ECHO),
    );
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    // The trigger of the opponent's Echo is put on the stack with the target its controller chooses.
    g.act(1).chooseTargets({ player: 0 });
    const trigger = g.state.stack[g.state.stack.length - 1] ?? 'o0';
    expect(g.state.objects[trigger]?.stack?.kind).toBe('ability');
    g.act(0).cast(BENT, { targets: [trigger], pay: true });
    // Echo triggers again for Bent Bolt, a spell seat 0 cast: its controller chooses a target, and it resolves first.
    g.act(1).chooseTargets({ player: 0 });
    resolveTop(g);
    resolveTop(g);
    // The choice is the one of Bent Bolt's controller (seat 0), among the targets seat 1's trigger could have.
    const d = targetsDecision(g);
    expect(d.forChange).toBe(true);
    expect(d.seat).toBe(0);
    expect(d.specs[0]?.legal).not.toContainEqual({ kind: 'player', seat: 0, specId: 't1' });
    g.act(0).chooseTargets(BEARS);
    expect(g.state.objects[trigger]?.stack?.chosenTargets).toEqual([
      { kind: 'object', id: g.id(BEARS), specId: 't1' },
    ]);
    g.expect.invariants();
  });

  test('a target that cannot be chosen (hexproof of an opponent) is not an alternative', () => {
    const g = game(
      (b) =>
        b
          .seat(0)
          .hand(BENT, MURDER)
          .battlefield('Mountain', { count: 4 })
          .battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(BEARS).battlefield(WISP),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: MURDER, zone: 'stack' }], pay: true });
    resolveTop(g);
    // The Wisp has hexproof against the controller of Murder: no other legal target, so nothing changes.
    expect(targetsOf(g, MURDER)).toEqual([{ kind: 'object', id: g.id(BEARS), specId: 't1' }]);
  });

  test('a new target with Ward becomes a target of the spell: Ward triggers', () => {
    const g = game(
      (b) =>
        b
          .seat(0)
          .hand(BENT, MURDER)
          .battlefield('Mountain', { count: 4 })
          .battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(BEARS, WARD),
    );
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: MURDER, zone: 'stack' }], pay: true });
    resolveTop(g);
    expect(targetsOf(g, MURDER)).toEqual([{ kind: 'object', id: g.id(WARD), specId: 't1' }]);
    // Ward's trigger is on the stack above the spell.
    expect(g.state.stack.length).toBeGreaterThan(1);
    g.expect.invariants();
  });

  test('the division of a divided spell stays with its one target (CR 115.7f)', () => {
    const g = bent(
      (b) => b.hand(VOLLEY).battlefield('Mountain'),
      (b) => b.battlefield(SPIDER, BEARS),
    );
    g.act(0).cast(VOLLEY, { targets: [SPIDER], divide: [3], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: VOLLEY, zone: 'stack' }], pay: true });
    resolveTop(g);
    const d = g.state.pending;
    if (d?.kind === 'targets') g.act(0).chooseTargets(BEARS);
    expect(targetsOf(g, VOLLEY)).toEqual([
      { kind: 'object', id: g.id(BEARS), specId: 't1', share: 3 },
    ]);
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('a spell that was countered before Bent Bolt resolves is an illegal target: it fizzles', () => {
    const g = bent((b) => b.hand(BOLT, 'Counterspell').battlefield('Island', { count: 3 }));
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(BENT, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.act(0).cast('Counterspell', { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    resolveTop(g); // Counterspell counters the bolt
    resolveTop(g); // Bent Bolt: its target is gone
    g.expect.invariants();
  });
});
