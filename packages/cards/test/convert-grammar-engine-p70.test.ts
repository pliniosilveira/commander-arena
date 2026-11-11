// The Hofri Ghostforge deck, group 3 (stage P70, D-231). The REAL cards of the owner's golden corpus, read through the grammar only and played through applyAction. Stand-ins are
// SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import type { Action, CardDefinition, GameState } from '@commander-arena/engine';
import { getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const onBattlefield = (state: GameState, seat: 0 | 1): string[] =>
  getView(state, seat).battlefield.map((o) => o.name);

function settle(
  g: {
    state: GameState;
    passAll(): unknown;
    legalActions(seat: 0 | 1): readonly Action[];
    choose(seat: 0 | 1, action: Action): unknown;
    act(seat: 0 | 1): { chooseTargets(...names: string[]): unknown };
  },
  target?: string,
) {
  for (let i = 0; i < 20; i += 1) {
    const d = g.state.pending;
    if (d !== null && d.kind === 'targets' && target !== undefined) {
      g.act(d.seat as 0 | 1).chooseTargets(target);
    } else if (d !== null && d.kind === 'orderTriggers') {
      g.choose(d.seat as 0 | 1, g.legalActions(d.seat as 0 | 1)[0] as Action);
    } else if (g.state.stack.length > 0) g.passAll();
    else break;
  }
}

const creature = (name: string, cost: string, power: string, toughness: string, text = '') =>
  parsed(`SYNTHETIC ${name}`, 'Creature — Bear', text, { manaCost: cost, power, toughness });
const FOUR = creature('Four', '{3}{1}', '4', '4');

describe('Palace Jailer (you become the monarch; exile a creature of an opponent until an opponent becomes the monarch)', () => {
  const JAILER = real('Palace Jailer');
  const THIEF = creature('Thief', '{1}', '1', '1');
  const USURP = parsed('SYNTHETIC Usurp', 'Instant', 'You become the monarch.', {
    manaCost: '{1}',
  });
  const game = () =>
    scenario()
      .define(JAILER)
      .define(FOUR)
      .define(THIEF)
      .define(USURP)
      .seat(0)
      .hand(JAILER.name)
      .battlefield('Plains', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .hand(USURP.name)
      .battlefield(FOUR.name)
      .battlefield(THIEF.name)
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the creature is exiled and comes back under its owner when an opponent becomes the monarch', () => {
    const g = game();
    g.act(0).cast(JAILER.name, { pay: true });
    settle(g, FOUR.name);
    expect(g.state.monarch).toBe(0);
    g.expect.zone(FOUR.name, 'exile');
    // An opponent becomes the monarch: the creature returns at once (CR 610.3, 725.3).
    g.act(0).pass();
    g.act(1).cast(USURP.name, { pay: true });
    settle(g);
    expect(g.state.monarch).toBe(1);
    expect(onBattlefield(g.state, 1)).toContain(FOUR.name);
    g.expect.invariants();
  });

  test('the creature stays exiled while no opponent becomes the monarch', () => {
    const g = game();
    g.act(0).cast(JAILER.name, { pay: true });
    settle(g, FOUR.name);
    g.expect.zone(FOUR.name, 'exile');
    g.expect.zone(JAILER.name, 'battlefield');
    g.expect.invariants();
  });

  test('an opponent who became the monarch after the trigger keeps the creature on the battlefield (CR 610.3b)', () => {
    const g = game();
    g.act(0).cast(JAILER.name, { pay: true });
    g.act(0).pass();
    g.act(1).pass();
    // Targets and the order of the two triggers; then both are on the stack and the opponent becomes the monarch in response.
    for (let i = 0; i < 5; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'targets') g.act(0).chooseTargets(FOUR.name);
      else if (d?.kind === 'orderTriggers') {
        g.choose(d.seat as 0 | 1, g.legalActions(d.seat as 0 | 1)[0] as Action);
      } else break;
    }
    expect(g.state.stack.length).toBe(2);
    g.act(0).pass();
    g.act(1).cast(USURP.name, { pay: true });
    settle(g);
    expect(g.state.monarch).toBe(0);
    expect(onBattlefield(g.state, 1)).toContain(FOUR.name);
    g.expect.invariants();
  });
});

describe('Skyclave Apparition (exile a nonland, nontoken permanent with mana value 4 or less; when it leaves, the owner gets an X/X Illusion)', () => {
  const APPARITION = real('Skyclave Apparition');
  const THREE = creature('Three', '{2}{1}', '2', '2');
  const FIVE = creature('Five', '{4}{1}', '5', '5');
  const DOOM = parsed('SYNTHETIC Doom', 'Instant', 'Destroy target creature.', { manaCost: '{1}' });
  const game = () =>
    scenario()
      .define(APPARITION)
      .define(THREE)
      .define(FIVE)
      .define(DOOM)
      .seat(0)
      .hand(APPARITION.name, DOOM.name)
      .battlefield('Plains', { count: 6 })
      .library(...FILLER)
      .seat(1)
      .battlefield(THREE.name)
      .battlefield(FIVE.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('only a permanent with mana value 4 or less can be the target', () => {
    const g = game();
    g.act(0).cast(APPARITION.name, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : '')) ?? [];
    expect(legal).toContain(g.id(THREE.name));
    expect(legal).not.toContain(g.id(FIVE.name));
    g.act(0).chooseTargets(THREE.name);
    settle(g);
    g.expect.zone(THREE.name, 'exile');
    g.expect.zone(FIVE.name, 'battlefield');
  });

  test('when it leaves the battlefield the owner creates a token with power and toughness equal to the mana value', () => {
    const g = game();
    g.act(0).cast(APPARITION.name, { pay: true });
    settle(g, THREE.name);
    g.expect.zone(THREE.name, 'exile');
    g.act(0).cast(DOOM.name, { pay: true, targets: [APPARITION.name] });
    settle(g);
    g.expect.zone(APPARITION.name, 'graveyard');
    g.expect.zone(THREE.name, 'exile');
    const illusion = getView(g.state, 1).battlefield.find((o) => o.name === 'Illusion');
    expect(illusion).toBeDefined();
    expect(illusion?.power).toBe(3);
    expect(illusion?.toughness).toBe(3);
    g.expect.invariants();
  });
});

describe('Augusta, Order Returned (attacks: each player exiles a card from their graveyard; that many +1/+1 counters for the nonland cards)', () => {
  const AUGUSTA = real('Augusta, Order Returned');
  const THREE = creature('Three', '{2}{1}', '2', '2');
  const RELIC = parsed('SYNTHETIC Relic', 'Artifact', '', { manaCost: '{2}' });
  const LAND = parsed('SYNTHETIC Wild', 'Land', '', {});
  const game = (mine: string[], theirs: string[]) =>
    scenario()
      .define(AUGUSTA)
      .define(THREE)
      .define(RELIC)
      .define(LAND)
      .seat(0)
      .battlefield(AUGUSTA.name)
      .graveyard(...mine)
      .library(...FILLER)
      .seat(1)
      .graveyard(...theirs)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('two nonland cards: two counters on the attacking creature', () => {
    const g = game([THREE.name], [RELIC.name]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(AUGUSTA.name);
    settle(g, AUGUSTA.name);
    g.expect.zone(THREE.name, 'exile');
    g.expect.zone(RELIC.name, 'exile');
    g.expect.counters(AUGUSTA.name, { '+1/+1': 2 });
    g.expect.invariants();
  });

  test('a land among them is exiled but not counted', () => {
    const g = game([THREE.name], [LAND.name]);
    g.advanceTo('declareAttackers');
    g.act(0).attack(AUGUSTA.name);
    settle(g, AUGUSTA.name);
    g.expect.zone(LAND.name, 'exile');
    g.expect.counters(AUGUSTA.name, { '+1/+1': 1 });
  });

  test('only lands: no reflexive ability, no counters', () => {
    const g = game([LAND.name], []);
    g.advanceTo('declareAttackers');
    g.act(0).attack(AUGUSTA.name);
    settle(g, AUGUSTA.name);
    g.expect.zone(LAND.name, 'exile');
    g.expect.counters(AUGUSTA.name, {});
  });

  test('with several cards the player chooses which one to exile', () => {
    const g = game([THREE.name, LAND.name], []);
    g.advanceTo('declareAttackers');
    g.act(0).attack(AUGUSTA.name);
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseCards');
    if (d?.kind !== 'chooseCards') return;
    expect(d.seat).toBe(0);
    expect(d.legal).toHaveLength(2);
    g.act(0).chooseCards(LAND.name);
    settle(g, AUGUSTA.name);
    g.expect.zone(LAND.name, 'exile');
    g.expect.zone(THREE.name, 'graveyard');
    g.expect.counters(AUGUSTA.name, {});
  });
});

describe('Tragic Arrogance (you choose a permanent of each type for each player; the rest of the nonland permanents are sacrificed)', () => {
  const ARROGANCE = real('Tragic Arrogance');
  const ONE = creature('One', '{1}', '1', '1');
  const THREE = creature('Three', '{2}{1}', '2', '2');
  const FOUR = creature('Four', '{3}{1}', '4', '4');
  const RELIC = parsed('SYNTHETIC Relic', 'Artifact', '', { manaCost: '{2}' });
  const SPARE_RELIC = parsed('SYNTHETIC Spare Relic', 'Artifact', '', { manaCost: '{2}' });
  const AURA = parsed('SYNTHETIC Ward', 'Enchantment', '', { manaCost: '{2}' });
  const ARTIFACT_CREATURE = parsed('SYNTHETIC Golem', 'Artifact Creature — Golem', '', {
    manaCost: '{3}',
    power: '3',
    toughness: '3',
  });
  const game = () =>
    scenario()
      .define(ARROGANCE)
      .define(ONE)
      .define(THREE)
      .define(FOUR)
      .define(RELIC)
      .define(SPARE_RELIC)
      .define(AURA)
      .define(ARTIFACT_CREATURE)
      .seat(0)
      .hand(ARROGANCE.name)
      .battlefield('Plains', { count: 5 })
      .battlefield(FOUR.name)
      .battlefield(RELIC.name)
      .battlefield(SPARE_RELIC.name)
      .battlefield(AURA.name)
      .library(...FILLER)
      .seat(1)
      .battlefield(ONE.name)
      .battlefield(THREE.name)
      .battlefield(ARTIFACT_CREATURE.name)
      .battlefield('Island')
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the controller chooses for each player; what is not chosen is sacrificed, lands stay', () => {
    const g = game();
    g.act(0).cast(ARROGANCE.name, { pay: true });
    g.passAll();
    // Seat 0's artifacts (two): chosen first.
    let d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('spare');
    expect(d.spare).toEqual({ player: 0, type: 'artifact' });
    expect(d.seat).toBe(0);
    g.act(0).choosePermanents(RELIC.name);
    // Seat 1's artifact is the Golem alone (chosen without asking); its creatures: the Golem, One and Three.
    d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.spare).toEqual({ player: 1, type: 'creature' });
    expect(d.seat).toBe(0);
    g.act(0).choosePermanents({ name: THREE.name, seat: 1 });
    settle(g);
    expect(onBattlefield(g.state, 0).sort()).toEqual(
      [
        ...Array.from({ length: 5 }, () => 'Plains'),
        'Island',
        FOUR.name,
        RELIC.name,
        AURA.name,
        THREE.name,
        ARTIFACT_CREATURE.name,
      ].sort(),
    );
    g.expect.zone(SPARE_RELIC.name, 'graveyard');
    g.expect.zone(ONE.name, 'graveyard');
    g.expect.invariants();
  });
});

describe('Serra Paragon and Edgar (once during each of your turns, play or cast from your graveyard)', () => {
  const PARAGON = real('Serra Paragon');
  const EDGAR = real('Edgar, Master Machinist');
  const TWO = creature('Two', '{2}', '2', '2');
  const FOUR = creature('Four', '{3}{1}', '4', '4');
  const RELIC = parsed('SYNTHETIC Relic', 'Artifact', '', { manaCost: '{1}' });
  const OTHER_RELIC = parsed('SYNTHETIC Other Relic', 'Artifact', '', { manaCost: '{1}' });
  const LAND = parsed('SYNTHETIC Wild', 'Land', '', {});
  const DOOM = parsed('SYNTHETIC Doom', 'Instant', 'Destroy target permanent.', {
    manaCost: '{1}',
  });
  const paragon = () =>
    scenario()
      .define(PARAGON)
      .define(TWO)
      .define(FOUR)
      .define(RELIC)
      .define(LAND)
      .define(DOOM)
      .seat(0)
      .battlefield(PARAGON.name)
      .battlefield('Plains', { count: 6 })
      .graveyard(TWO.name, FOUR.name, RELIC.name, LAND.name)
      .hand(DOOM.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a permanent spell of mana value 3 or less is cast from the graveyard and gains the exile-and-gain-life ability', () => {
    const g = paragon();
    expect(g.act(0).try.cast(FOUR.name).ok).toBe(false);
    g.act(0).cast(TWO.name, { pay: true });
    settle(g);
    g.expect.zone(TWO.name, 'battlefield');
    // Once each turn: neither the artifact nor the land is available any more.
    expect(g.act(0).try.cast(RELIC.name).ok).toBe(false);
    expect(g.act(0).try.playLand(LAND.name).ok).toBe(false);
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).cast(DOOM.name, { pay: true, targets: [TWO.name] });
    settle(g);
    // "When this permanent is put into a graveyard from the battlefield, exile it and you gain 2 life."
    g.expect.zone(TWO.name, 'exile');
    expect(g.state.seats[0]?.life).toBe(before + 2);
    g.expect.invariants();
  });

  test('a land from the graveyard uses the one permission too, and gains the ability', () => {
    const g = paragon();
    g.act(0).playLand(LAND.name);
    settle(g);
    g.expect.zone(LAND.name, 'battlefield');
    expect(g.act(0).try.cast(TWO.name).ok).toBe(false);
    g.expect.invariants();
  });

  test('on the turn of another player nothing can be cast from the graveyard, even a spell with flash', () => {
    const FLASH = parsed('SYNTHETIC Flash Relic', 'Artifact', 'Flash', { manaCost: '{1}' });
    const g = scenario()
      .define(EDGAR)
      .define(FLASH)
      .seat(0)
      .battlefield(EDGAR.name)
      .battlefield('Plains', { count: 4 })
      .graveyard(FLASH.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    // Seat 0 receives priority in the turn of seat 1, and still may not cast from the graveyard.
    g.act(1).pass();
    expect(g.state.turn.prioritySeat).toBe(0);
    expect(g.act(0).try.cast(FLASH.name).ok).toBe(false);
  });

  test('Edgar: an artifact spell from the graveyard enters tapped; other cards and a second spell are not allowed', () => {
    const g = scenario()
      .define(EDGAR)
      .define(RELIC)
      .define(OTHER_RELIC)
      .define(TWO)
      .seat(0)
      .battlefield(EDGAR.name)
      .battlefield('Plains', { count: 4 })
      .graveyard(RELIC.name, OTHER_RELIC.name, TWO.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(g.act(0).try.cast(TWO.name).ok).toBe(false);
    g.act(0).cast(RELIC.name, { pay: true });
    settle(g);
    g.expect.zone(RELIC.name, 'battlefield');
    expect(getView(g.state, 0).battlefield.find((o) => o.name === RELIC.name)?.tapped).toBe(true);
    expect(g.act(0).try.cast(OTHER_RELIC.name).ok).toBe(false);
    g.expect.invariants();
  });
});

describe('Coin of Fate (exile two creature cards from your graveyard; an opponent chooses which goes to the library and which returns tapped)', () => {
  const COIN = real('Coin of Fate');
  const TWO = creature('Two', '{2}', '2', '2');
  const THREE = creature('Three', '{2}{1}', '2', '2');
  const FOUR = creature('Four', '{3}{1}', '4', '4');
  const RELIC = parsed('SYNTHETIC Relic', 'Artifact', '', { manaCost: '{1}' });
  const game = (yard: string[]) =>
    scenario()
      .define(COIN)
      .define(TWO)
      .define(THREE)
      .define(FOUR)
      .define(RELIC)
      .seat(0)
      .battlefield(COIN.name)
      .battlefield('Plains', { count: 4 })
      .graveyard(...yard)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('with exactly two creature cards they are exiled; the opponent chooses, the controller becomes the monarch', () => {
    const g = game([TWO.name, FOUR.name, RELIC.name]);
    g.act(0).activate(COIN.name, { ability: 1, pay: true });
    // Three cards in the graveyard, two of them creatures: the cost takes exactly those two.
    settle(g);
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.purpose).toBe('split');
    expect(d.seat).toBe(1);
    expect(d.legal).toHaveLength(2);
    g.act(1).chooseCards({ name: FOUR.name, zone: 'exile', seat: 0 });
    settle(g);
    // The chosen card is on the bottom of the library; the other one returns tapped.
    g.expect.zone(TWO.name, 'battlefield');
    expect(getView(g.state, 0).battlefield.find((o) => o.name === TWO.name)?.tapped).toBe(true);
    g.expect.zone(FOUR.name, 'library');
    g.expect.zone(RELIC.name, 'graveyard');
    g.expect.zone(COIN.name, 'graveyard');
    expect(g.state.monarch).toBe(0);
    g.expect.invariants();
  });

  test('with three creature cards the activating player chooses the two to exile', () => {
    const g = game([TWO.name, THREE.name, FOUR.name]);
    g.act(0).activate(COIN.name, { ability: 1, pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.purpose).toBe('exile');
    expect(d.seat).toBe(0);
    expect(d.forCost).toBe(true);
    g.act(0).chooseCards(TWO.name, FOUR.name);
    settle(g);
    g.act(1).chooseCards({ name: TWO.name, zone: 'exile', seat: 0 });
    settle(g);
    g.expect.zone(THREE.name, 'graveyard');
    g.expect.zone(FOUR.name, 'battlefield');
    g.expect.invariants();
  });

  test('with fewer than two creature cards the ability cannot be activated', () => {
    const g = game([TWO.name, RELIC.name]);
    expect(g.act(0).try.activate(COIN.name, { ability: 1 }).ok).toBe(false);
  });
});

describe('Spirit of Resilience (cards leave your graveyard: a +1/+1 counter, then it may become a copy of an artifact or creature card of those)', () => {
  const SPIRIT = real('Spirit of Resilience');
  const FOUR = creature('Four', '{3}{1}', '4', '4', 'Flying');
  const SIX = creature('Six', '{5}{1}', '6', '6');
  const LAND = parsed('SYNTHETIC Wild', 'Land', '', {});
  const RAISE = parsed(
    'SYNTHETIC Raise',
    'Sorcery',
    'Return up to two target cards from your graveyard to your hand.',
    { manaCost: '{1}' },
  );
  const game = (yard: string[]) =>
    scenario()
      .define(SPIRIT)
      .define(FOUR)
      .define(SIX)
      .define(LAND)
      .define(RAISE)
      .seat(0)
      .battlefield(SPIRIT.name)
      .battlefield('Mountain', { count: 3 })
      .hand(RAISE.name)
      .graveyard(...yard)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('one creature card left: the counter, then it becomes a copy of it until end of turn', () => {
    const g = game([FOUR.name]);
    g.act(0).cast(RAISE.name, { pay: true, targets: [FOUR.name] });
    g.passAll();
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    settle(g);
    g.expect.counters(SPIRIT.name, { '+1/+1': 1 });
    g.expect.derived(SPIRIT.name, { keywords: ['flying'] });
    g.expect.pt(SPIRIT.name, 5, 5);
    g.expect.invariants();
  });

  test('a land that left: the counter only, nothing to copy', () => {
    const g = game([LAND.name]);
    g.act(0).cast(RAISE.name, { pay: true, targets: [LAND.name] });
    g.passAll();
    // The offer is made, and accepting it copies nothing: a land is neither an artifact nor a creature card.
    expect(g.state.pending?.kind).toBe('confirmOptional');
    g.act(0).accept();
    settle(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.counters(SPIRIT.name, { '+1/+1': 1 });
    g.expect.pt(SPIRIT.name, 3, 3);
  });

  test('two cards left: the controller chooses which one to copy', () => {
    const g = game([FOUR.name, SIX.name]);
    g.act(0).cast(RAISE.name, { pay: true, targets: [FOUR.name, SIX.name] });
    g.passAll();
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.purpose).toBe('copy');
    expect(d.legal).toHaveLength(2);
    g.act(0).chooseCards({ name: FOUR.name, zone: 'hand' });
    settle(g);
    g.expect.pt(SPIRIT.name, 5, 5);
    g.expect.invariants();
  });
});

describe('Guardian of Faith (flash, vigilance; enters: any number of other target creatures you control phase out)', () => {
  const GUARDIAN = real('Guardian of Faith');
  const BEAR = creature('Bear', '{1}', '2', '2');
  const OTHER = creature('Other', '{1}', '3', '3');
  const ZAP = parsed('SYNTHETIC Zap', 'Instant', '~ deals 3 damage to target creature.', {
    manaCost: '{R}',
  });
  const game = () =>
    scenario()
      .define(GUARDIAN)
      .define(BEAR)
      .define(OTHER)
      .define(ZAP)
      .seat(0)
      .hand(GUARDIAN.name)
      .battlefield(BEAR.name)
      .battlefield(OTHER.name)
      .battlefield('Plains', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .hand(ZAP.name)
      .battlefield('Mountain', { count: 2 })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the creatures phase out: they do not exist for the game, keep their place, and phase in as the controller’s untap step begins', () => {
    const g = game();
    g.act(0).cast(GUARDIAN.name, { pay: true });
    g.passAll();
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets(BEAR.name);
    settle(g);
    // The Bear is phased out: not on the battlefield of the view, but listed as phased out; the Guardian and the other creature are not.
    expect(onBattlefield(g.state, 0)).not.toContain(BEAR.name);
    expect(onBattlefield(g.state, 0)).toContain(OTHER.name);
    expect((getView(g.state, 0).phasedOut ?? []).map((o) => o.name)).toEqual([BEAR.name]);
    g.expect.invariants();
    // It can't be targeted (CR 702.26b).
    g.act(0).pass();
    g.act(1).cast(ZAP.name);
    const asking = g.state.pending;
    if (asking?.kind !== 'targets') throw new Error(`expected targets, got ${asking?.kind}`);
    const legal = (asking.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : ''));
    expect(legal).toContain(g.id(OTHER.name));
    expect(legal).not.toContain(g.id(BEAR.name));
    g.act(1).cancel();
    // The opponent's turn passes, then the untap step of the controller brings it back (CR 702.26a).
    g.advanceTo('upkeep');
    for (let i = 0; i < 30 && g.state.turn.activeSeat !== 0; i += 1) g.passAll();
    g.advanceTo('upkeep');
    expect(onBattlefield(g.state, 0)).toContain(BEAR.name);
    expect(g.state.phased ?? []).toEqual([]);
    g.expect.invariants();
  });
});

describe('Phasing of a creature with an Aura and in combat (CR 702.26b, 702.26g, 506.4)', () => {
  const GUARDIAN = real('Guardian of Faith');
  const BEAR = creature('Bear', '{1}', '2', '2');
  const BOON = parsed(
    'SYNTHETIC Boon',
    'Enchantment — Aura',
    'Enchant creature\nEnchanted creature gets +1/+1.',
    {
      manaCost: '{1}',
    },
  );
  test('the Aura phases out with the creature and both phase in together; a creature that phased out leaves combat', () => {
    const g = scenario()
      .define(GUARDIAN)
      .define(BEAR)
      .define(BOON)
      .seat(0)
      .hand(GUARDIAN.name)
      .battlefield(BEAR.name)
      .battlefield(BOON.name, { attachedTo: BEAR.name })
      .battlefield('Plains', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(BEAR.name);
    expect((g.state.combat?.attackers ?? []).length).toBe(1);
    // Flash: cast in the combat, after attackers; the Bear phases out and leaves combat.
    g.act(0).cast(GUARDIAN.name, { pay: true });
    g.passAll();
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets(BEAR.name);
    settle(g);
    expect((g.state.combat?.attackers ?? []).length).toBe(0);
    expect((getView(g.state, 0).phasedOut ?? []).map((o) => o.name).sort()).toEqual(
      [BEAR.name, BOON.name].sort(),
    );
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.attachedTo !== null)).toEqual(
      [],
    );
    g.expect.invariants();
  });
});

describe('Advanced Reconstruction (a Class: the level bars, the first main phase trigger, the damage and the cost reduction)', () => {
  const CLASS = real('Advanced Reconstruction');
  const BEAR = creature('Bear', '{1}', '2', '2');
  const BIG = creature('Big', '{4}{1}', '5', '5');
  const RAISE = parsed(
    'SYNTHETIC Raise',
    'Sorcery',
    'Return target creature card from your graveyard to your hand.',
    { manaCost: '{1}' },
  );
  const game = (yard: string[] = [], hand: string[] = []) =>
    scenario()
      .define(CLASS)
      .define(BEAR)
      .define(BIG)
      .define(RAISE)
      .seat(0)
      .battlefield(CLASS.name)
      .battlefield('Mountain', { count: 4 })
      .graveyard(...yard)
      .hand(...hand)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('upkeep', { active: 0, turn: 3 })
      .build();

  test('level 1: at the beginning of the first main phase it mills, exiles a card of the graveyard at random and lets it be played', () => {
    const g = game([BEAR.name]);
    g.advanceTo('precombatMain');
    settle(g);
    // The graveyard held the Bear and a milled Island: one of them is exiled, and may be played this turn.
    expect(g.state.exile.length).toBe(1);
    expect(g.state.seats[0]?.graveyard.length).toBe(1);
    g.expect.invariants();
  });

  test('the level bars: level 2 only from level 1, level 3 only from level 2, both at sorcery speed', () => {
    const g = game();
    g.advanceTo('precombatMain');
    settle(g);
    // At level 1 the abilities are the trigger, the bar of level 2 and the bar of level 3: level 3 is not offered yet.
    expect(g.act(0).try.activate(CLASS.name, { ability: 2 }).ok).toBe(false);
    g.act(0).activate(CLASS.name, { ability: 1, pay: true });
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === CLASS.name)?.level).toBe(2);
    // Level 2 again is no longer possible; level 3 is.
    expect(g.act(0).try.activate(CLASS.name, { ability: 1 }).ok).toBe(false);
    g.expect.invariants();
  });

  test('level 2: cards that leave the graveyard deal 2 damage to each opponent; level 1 does not', () => {
    const play = (levelUp: boolean) => {
      const g = scenario()
        .define(CLASS)
        .define(BEAR)
        .define(RAISE)
        .seat(0)
        .battlefield(CLASS.name)
        .battlefield('Mountain', { count: 4 })
        .graveyard(BEAR.name)
        .hand(RAISE.name)
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      if (levelUp) {
        g.act(0).activate(CLASS.name, { ability: 1, pay: true });
        g.passAll();
        expect(getView(g.state, 0).battlefield.find((o) => o.name === CLASS.name)?.level).toBe(2);
      }
      g.act(0).cast(RAISE.name, { pay: true, targets: [BEAR.name] });
      settle(g);
      g.expect.invariants();
      return g.state.seats[1]?.life;
    };
    expect(play(true)).toBe(38);
    expect(play(false)).toBe(40);
  });

  test('level 3: spells cast from anywhere other than the hand cost {2} less', () => {
    const castable = (level: number) => {
      const g = scenario()
        .define(CLASS)
        .define(BIG)
        .seat(0)
        .battlefield(CLASS.name, { level })
        .battlefield('Mountain', { count: 3 })
        .commander(BIG.name)
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      return g.act(0).try.cast(BIG.name).ok;
    };
    // The commander costs five mana from the command zone; three Mountains pay it only with the reduction of level 3.
    expect(castable(3)).toBe(true);
    expect(castable(2)).toBe(false);
  });
});
