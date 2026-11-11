// Parsed text is only worth something if the engine runs it as written (stage P38). These tests import SYNTHETIC cards through the grammar (never
// through a fixture), define them in an engine scenario and play them through applyAction: the Korvold deck's casting and targets slice of D-181 and
// D-182 (ENGINE_VERSION 39). A target that only a kicked spell has and one that only an unkicked spell has, an additional cost paid in one of two ways,
// a spell's own cost reduction with a condition, and the change of the target of a spell with a single target. Every card name starts with
// "SYNTHETIC"; the wording of each text is that of the real cards of the slice (the owner's request file of 2026-10-29, names replaced by ~). No real
// card's text is claimed.
import { getView, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ANGEL = 'Serra Angel';
const RING = 'Sol Ring';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const tapped = (g: ScenarioGame): number =>
  g.state.battlefield.filter(
    (id) => g.state.objects[id]?.controller === 0 && g.state.objects[id]?.tapped,
  ).length;

// ---- Kicked and unkicked targets (CR 702.33g, 601.2c)

describe('"Kicker {1}{B}. Exile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead."', () => {
  const rend = parsed(
    'SYNTHETIC Parsed Rend',
    'Instant',
    'Kicker {1}{B} (You may pay an additional {1}{B} as you cast this spell.)\nExile target artifact or enchantment. If this spell was kicked, exile target nonland permanent instead.',
    { manaCost: '{1}{G}', colors: ['G'] },
  );
  const play = () =>
    scenario()
      .seat(0)
      .define(rend)
      .hand(rend.name)
      .battlefield('Forest', { count: 2 })
      .battlefield('Swamp', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .battlefield(RING, SPIDER)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card is valid', () => {
    expect(validateCard(rend)).toEqual([]);
  });

  test('unkicked it exiles the artifact for {1}{G}, and the creature stays', () => {
    const g = play();
    g.act(0).cast(rend.name, { kicked: false, targets: [RING], pay: true });
    expect(tapped(g)).toBe(2);
    resolveTop(g);
    g.expect.zone(RING, 'exile', { seat: 1 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('kicked it asks for one target only, a nonland permanent, for {1}{G}{1}{B}', () => {
    const g = play();
    g.act(0).cast(rend.name, { kicked: true });
    const d = g.state.pending;
    expect(d?.kind === 'targets' ? d.specs.map((s) => s.specId) : []).toEqual(['t2']);
    g.act(0).chooseTargets(SPIDER);
    g.act(0).payAuto();
    expect(tapped(g)).toBe(4);
    resolveTop(g);
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.zone(RING, 'battlefield', { seat: 1 });
  });
});

describe('"Draw a card. If this spell was kicked, destroy target creature." (the kicked target only)', () => {
  const hex = parsed(
    'SYNTHETIC Parsed Hex',
    'Sorcery',
    'Kicker {2}\nDraw a card. If this spell was kicked, destroy target creature.',
    { manaCost: '{1}{B}', colors: ['B'] },
  );
  const play = (theirs: readonly string[]) => {
    const b = scenario()
      .seat(0)
      .define(hex)
      .hand(hex.name)
      .battlefield('Swamp', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER);
    return (theirs.length === 0 ? b : b.battlefield(...theirs)).at('precombatMain').build();
  };

  test('is valid', () => {
    expect(validateCard(hex)).toEqual([]);
  });

  test('unkicked it draws and asks no target; kicked it destroys', () => {
    const plain = play([SPIDER]);
    plain.act(0).cast(hex.name, { kicked: false, pay: true });
    resolveTop(plain);
    plain.expect.handSize(0, 1);
    plain.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    const kicked = play([SPIDER]);
    kicked.act(0).cast(hex.name, { kicked: true, targets: [SPIDER], pay: true });
    resolveTop(kicked);
    kicked.expect.zone(SPIDER, 'graveyard', { seat: 1 });
  });

  test('with no creature to destroy the kicker is not asked', () => {
    const g = play([]);
    g.act(0).cast(hex.name);
    expect(g.state.pending?.kind).toBe('payMana');
  });
});

// ---- A choice of additional costs (CR 118.8, 601.2b)

describe('"As an additional cost to cast this spell, sacrifice an artifact or creature or pay {4}."', () => {
  const stir = parsed(
    'SYNTHETIC Parsed Stir',
    'Sorcery',
    'As an additional cost to cast ~, sacrifice an artifact or creature or pay {4}.\nDestroy target creature.',
    { manaCost: '{B}', colors: ['B'] },
  );
  const play = (lands: number, mine: readonly string[]) => {
    const b = scenario()
      .seat(0)
      .define(stir)
      .hand(stir.name)
      .battlefield('Swamp', { count: lands })
      .library(...FILLER);
    return (mine.length === 0 ? b : b.battlefield(...mine))
      .seat(1)
      .battlefield(SPIDER)
      .library(...FILLER)
      .at('precombatMain')
      .build();
  };

  test('is valid', () => {
    expect(validateCard(stir)).toEqual([]);
  });

  test('sacrificing: {B} and a creature', () => {
    const g = play(5, [BEARS]);
    g.act(0).cast(stir.name, { additionalCost: true, targets: [SPIDER], pay: true });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(tapped(g)).toBe(1);
    resolveTop(g);
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
  });

  test('paying: {4}{B} and nothing sacrificed', () => {
    const g = play(5, [BEARS]);
    g.act(0).cast(stir.name, { additionalCost: false, targets: [SPIDER], pay: true });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(tapped(g)).toBe(5);
    resolveTop(g);
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
  });

  test('the view shows both ways', () => {
    const g = play(5, [BEARS]);
    const card = (getView(g.state, 0).seats[0]?.hand ?? []).find((o) => o.name === stir.name);
    expect(card?.additionalCostChoice).toHaveLength(2);
  });
});

// ---- A conditional reduction and the change of a target (CR 601.2f, 115.7a)

describe('"This spell costs {3} less to cast if you control a creature with power 4 or greater. Change the target of target spell or ability with a single target."', () => {
  const bent = parsed(
    'SYNTHETIC Parsed Bend',
    'Instant',
    '~ costs {3} less to cast if you control a creature with power 4 or greater.\nChange the target of target spell or ability with a single target.',
    { manaCost: '{3}{R}', colors: ['R'] },
  );
  const play = (mine: readonly string[]) => {
    const b = scenario()
      .seat(0)
      .define(bent)
      .hand(bent.name, BOLT, MURDER)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Swamp', { count: 3 })
      .library(...FILLER);
    return (mine.length === 0 ? b : b.battlefield(...mine))
      .seat(1)
      .battlefield(BEARS, SPIDER)
      .library(...FILLER)
      .at('precombatMain')
      .build();
  };

  test('is valid', () => {
    expect(validateCard(bent)).toEqual([]);
  });

  test('with a creature with power 4 it costs {R}; without it {3}{R}', () => {
    const cost = (g: ScenarioGame) =>
      (getView(g.state, 0).seats[0]?.hand ?? []).find((o) => o.name === bent.name)?.castCost;
    expect(cost(play([ANGEL]))).toEqual(['R']);
    expect(cost(play([]))).toEqual(['3', 'R']);
  });

  test('it changes the target of Murder to the other creature', () => {
    const g = play([ANGEL]);
    g.act(0).cast(MURDER, { targets: [BEARS], pay: true });
    g.act(0).cast(bent.name, { targets: [{ name: MURDER, zone: 'stack' }], pay: true });
    resolveTop(g);
    // The legal targets are the other creatures (Giant Spider and Serra Angel): the controller of Bend chooses.
    expect(g.state.pending?.kind).toBe('targets');
    g.act(0).chooseTargets(SPIDER);
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});
