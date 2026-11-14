import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
const NAMES = [
  'Culling Ritual',
  'Deadly Brew',
  'Final Act',
  'Witch of the Moors',
  'Witherbloom Charm',
  'Witherbloom Command',
];

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`Missing corpus card ${name}`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BEAR = parsed('SYNTHETIC Bear C', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const IMMORTAL = parsed('SYNTHETIC Immortal C', 'Creature — Bear', 'Indestructible', {
  manaCost: '{G}',
  power: '2',
  toughness: '2',
});
const FILLER = Array.from({ length: 12 }, () => 'Plains');

function game(
  name: string,
  mine: readonly string[] = [],
  theirs: readonly string[] = [],
  graveyard: readonly string[] = [],
) {
  const card = real(name);
  return scenario()
    .define(card)
    .define(BEAR)
    .define(IMMORTAL)
    .seat(0)
    .hand(name)
    .battlefield('Swamp', 'Swamp', 'Forest', 'Forest', 'Plains', 'Plains', ...mine)
    .graveyard(...graveyard)
    .library(...FILLER)
    .seat(1)
    .battlefield(...theirs)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();
}

describe('issue58 group C real imports', () => {
  test.each(NAMES)('%s reads entirely and validates', (name) => {
    expect(validateCard(real(name))).toEqual([]);
  });

  test('Culling Ritual counts destruction, not indestructible permanents, and chooses each mana separately', () => {
    const ritual = real('Culling Ritual');
    const g = scenario()
      .define(ritual)
      .define(BEAR)
      .define(IMMORTAL)
      .seat(0)
      .hand(ritual.name)
      .battlefield('Swamp', 'Forest', 'Plains', 'Plains', BEAR.name, IMMORTAL.name)
      .seat(1)
      .battlefield(BEAR.name)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(ritual.name, { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'chooseOption', options: ['{B}', '{G}'] });
    g.act(0).chooseOption('{B}');
    g.act(0).chooseOption('{G}');
    expect(g.state.seats[0]?.manaPool.map((m) => m.color)).toEqual(['B', 'G']);
    g.expect.zone(IMMORTAL.name, 'battlefield');
    g.expect.invariants();
  });

  test('Culling Ritual excludes regeneration but still counts destruction whose death is replaced by exile', () => {
    const ritual = real('Culling Ritual');
    const g = scenario()
      .define(ritual)
      .define(BEAR)
      .seat(0)
      .hand(ritual.name, 'SYNTHETIC Regrowth Charm')
      .battlefield('Swamp', 'Swamp', 'Forest', 'Forest', 'Plains', BEAR.name)
      .battlefield('SYNTHETIC Quiet Shroud')
      .seat(1)
      .battlefield(BEAR.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('SYNTHETIC Regrowth Charm', {
      targets: [{ name: BEAR.name, seat: 0 }],
      pay: true,
    });
    g.passAll();
    g.act(0).cast(ritual.name, { pay: true });
    g.passAll();
    g.act(0).chooseOption('{B}');
    g.act(0).chooseOption('{G}');
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.seats[0]?.manaPool).toHaveLength(2);
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    g.expect.zone(BEAR.name, 'exile', { seat: 1 });
    g.expect.zone('SYNTHETIC Quiet Shroud', 'graveyard');
    g.expect.invariants();
  });

  test('Culling Ritual does not offer a mana choice when it destroyed nothing', () => {
    const g = game('Culling Ritual', [IMMORTAL.name]);
    g.act(0).cast('Culling Ritual', { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.seats[0]?.manaPool).toHaveLength(0);
  });

  test.each(['{G}', '{3}{G}'])(
    'Culling Ritual counts a replaced Umbra destruction exactly once (cost %s)',
    (manaCost) => {
      const ritual = real('Culling Ritual');
      const aura = parsed(
        'SYNTHETIC Expensive Umbra C',
        'Enchantment — Aura',
        'Enchant creature\nUmbra armor',
        { manaCost },
      );
      const g = scenario()
        .define(ritual)
        .define(aura)
        .define(BEAR)
        .seat(0)
        .hand(ritual.name)
        .battlefield('Swamp', 'Forest', 'Plains', 'Plains', BEAR.name)
        .battlefield(aura.name, { attachedTo: BEAR.name })
        .seat(1)
        .at('precombatMain', { active: 0 })
        .build();
      g.act(0).cast(ritual.name, { pay: true });
      g.passAll();
      g.expect.zone(BEAR.name, 'battlefield');
      g.expect.zone(aura.name, 'graveyard');
      expect(g.state.pending).toMatchObject({ kind: 'chooseOption' });
      g.act(0).chooseOption('{G}');
      expect(g.state.pending?.kind).toBe('priority');
      expect(g.state.seats[0]?.manaPool).toHaveLength(1);
      g.expect.invariants();
    },
  );

  test('Deadly Brew excludes the new graveyard object of the sacrifice and offers an older permanent', () => {
    const g = game('Deadly Brew', [BEAR.name], [BEAR.name], [IMMORTAL.name]);
    g.act(0).cast('Deadly Brew', { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'chooseCards', min: 0, max: 1 });
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('Expected optional return');
    expect(d.legal).toEqual([g.id({ name: IMMORTAL.name, zone: 'graveyard' })]);
    g.act(0).chooseCards(IMMORTAL.name);
    g.expect.zone(IMMORTAL.name, 'hand');
    g.expect.zone(BEAR.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEAR.name, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('Deadly Brew does not offer a return when only an opponent sacrificed', () => {
    const g = game('Deadly Brew', [], [BEAR.name], [IMMORTAL.name]);
    g.act(0).cast('Deadly Brew', { pay: true });
    g.passAll();
    g.expect.zone(IMMORTAL.name, 'graveyard');
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('Deadly Brew can return your card that an opponent sacrificed, but not the one you sacrificed', () => {
    const brew = real('Deadly Brew');
    const g = scenario()
      .define(brew)
      .define(BEAR)
      .define(IMMORTAL)
      .seat(0)
      .hand(brew.name)
      .battlefield('Swamp', 'Forest', BEAR.name)
      .battlefield(IMMORTAL.name, { controller: 1 })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(brew.name, { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'chooseCards' });
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('Expected optional return');
    expect(d.legal).toEqual([g.id({ name: IMMORTAL.name, zone: 'graveyard' })]);
    g.act(0).chooseCards(IMMORTAL.name);
    g.expect.zone(IMMORTAL.name, 'hand', { seat: 0 });
  });

  test('Deadly Brew lets the active player choose first, but sacrifices neither before both choose', () => {
    const g = game('Deadly Brew', [BEAR.name, IMMORTAL.name], [BEAR.name, IMMORTAL.name]);
    g.act(0).cast('Deadly Brew', { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 0 });
    g.act(0).choosePermanents(BEAR.name);
    g.expect.zone(BEAR.name, 'battlefield', { seat: 0 });
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 1 });
    g.act(1).choosePermanents(IMMORTAL.name);
    g.expect.zone(BEAR.name, 'graveyard', { seat: 0 });
    g.expect.zone(IMMORTAL.name, 'graveyard', { seat: 1 });
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.invariants();
  });

  test('Witherbloom Charm sacrifices optionally and draws only if it actually sacrificed', () => {
    const yes = game('Witherbloom Charm', [BEAR.name]);
    yes.act(0).cast('Witherbloom Charm', { modes: [0], pay: true });
    yes.passAll();
    yes.act(0).accept();
    yes.act(0).choosePermanents(BEAR.name);
    yes.expect.zone(BEAR.name, 'graveyard');
    yes.expect.handSize(0, 2);
    const no = game('Witherbloom Charm', [BEAR.name]);
    no.act(0).cast('Witherbloom Charm', { modes: [0], pay: true });
    no.passAll();
    no.act(0).decline();
    no.expect.handSize(0, 0);
    no.expect.zone(BEAR.name, 'battlefield');
  });

  test('Witherbloom Charm gains five life or destroys a cheap nonland permanent', () => {
    const heal = game('Witherbloom Charm');
    heal.act(0).cast('Witherbloom Charm', { modes: [1], pay: true });
    heal.passAll();
    heal.expect.life(0, 45);
    const destroy = game('Witherbloom Charm', [], [BEAR.name]);
    destroy.act(0).cast('Witherbloom Charm', { modes: [2], targets: [BEAR.name], pay: true });
    destroy.passAll();
    destroy.expect.zone(BEAR.name, 'graveyard');
  });

  test('Witherbloom Command mills its target before choosing a land from your own graveyard', () => {
    const g = game('Witherbloom Command');
    g.act(0).cast('Witherbloom Command', {
      modes: [0, 3],
      targets: [{ player: 0 }, { player: 1 }],
      pay: true,
    });

    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'chooseCards', seat: 0 });
    g.act(0).chooseCards({ name: 'Plains', zone: 'graveyard', nth: 0 });
    g.expect.handSize(0, 1);
    g.expect.life(0, 42);
    g.expect.life(1, 38);
    g.expect.invariants();
  });

  test('Witherbloom Command destroys a cheap noncreature and gives its other target -3/-1', () => {
    const g = game('Witherbloom Command', [], ['Sol Ring', BEAR.name]);
    g.act(0).cast('Witherbloom Command', {
      modes: [1, 2],
      targets: ['Sol Ring', BEAR.name],
      pay: true,
    });
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    g.expect.pt(BEAR.name, -1, 1);
    g.expect.invariants();
  });

  test.each([
    { available: false, returnCard: false },
    { available: true, returnCard: false },
    { available: true, returnCard: true },
  ])(
    'Witch sacrifices independently of optional return ($available, $returnCard)',
    ({ available, returnCard }) => {
      const witch = real('Witch of the Moors');
      const heal = parsed('SYNTHETIC Healing C', 'Instant', 'You gain 1 life.', {
        manaCost: '{G}',
      });
      const g = scenario()
        .define(witch)
        .define(heal)
        .define(BEAR)
        .seat(0)
        .battlefield(witch.name, 'Forest')
        .hand(heal.name)
        .graveyard(...(available ? [BEAR.name] : []))
        .library(...FILLER)
        .seat(1)
        .battlefield(BEAR.name)
        .library(...FILLER)
        .at('postcombatMain', { active: 0, turn: 1 })
        .build();
      g.act(0).cast(heal.name, { pay: true });
      g.passAll();
      g.advanceTo('end');
      if (g.state.pending?.kind === 'targets') {
        if (returnCard) g.act(0).chooseTargets({ name: BEAR.name, seat: 0, zone: 'graveyard' });
        else g.act(0).chooseTargets();
      }
      g.passAll();
      g.expect.zone(BEAR.name, 'graveyard', { seat: 1 });
      if (returnCard) g.expect.zone(BEAR.name, 'hand', { seat: 0 });
      g.expect.invariants();
    },
  );

  test('Final Act removes an opponent’s poison and energy, not life or your counters', () => {
    const act = real('Final Act');
    const energy = parsed('SYNTHETIC Energy C', 'Instant', 'You get {E}{E}.', { manaCost: '{G}' });
    const g = scenario()
      .define(act)
      .define(energy)
      .seat(0)
      .battlefield('Swamp', { count: 6 })
      .hand(act.name)
      .poison(2)
      .library(...FILLER)
      .seat(1)
      .battlefield('Forest')
      .hand(energy.name)
      .poison(3)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).pass();
    g.act(1).cast(energy.name, { pay: true });
    g.passAll();
    expect(g.state.seats[1]?.energy).toBe(2);
    g.act(0).cast(act.name, { modes: [4], pay: true });
    g.passAll();
    expect(g.state.seats[1]).toMatchObject({ poison: 0, energy: 0, life: 40 });
    expect(g.state.seats[0]?.poison).toBe(2);
    g.expect.invariants();
  });

  test('Final Act resolves any number of selected modes in order, exiling the destroyed cards too', () => {
    const g = game(
      'Final Act',
      [IMMORTAL.name],
      [BEAR.name, 'SYNTHETIC Vanilla Planeswalker', 'SYNTHETIC Vanilla Battle'],
      ['Forest'],
    );
    g.act(0).cast('Final Act', { modes: [0, 1, 2, 3, 4], pay: true });
    g.passAll();
    for (const name of [BEAR.name, 'SYNTHETIC Vanilla Planeswalker', 'SYNTHETIC Vanilla Battle']) {
      g.expect.zone(name, 'exile', { seat: 1 });
    }
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.expect.zone(IMMORTAL.name, 'battlefield');
    g.expect.invariants();
  });
});
