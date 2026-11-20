// Agatha deck (issue 345), group 6: Thousand-Year Elixir, "You may activate abilities of creatures you control as though those creatures had haste." and
// "{1}, {T}: Untap target creature."
// Pins: CR 302.6 (a creature's {T} ability needs it under control since the turn began), CR 702.10b (haste lifts that), CR 605 (a mana ability is an activation),
// CR 508.1a (attacking is not an activation: the creature still cannot attack).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed } from './convert-grammar-helpers';

const ELIXIR = real('Thousand-Year Elixir');
const TAPPER = parsed('SYNTHETIC Tapper', 'Creature — Human', '{T}: You gain 1 life.', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const ELF = parsed('SYNTHETIC Elf', 'Creature — Elf', '{T}: Add {G}.', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});

const game = (withElixir: boolean, controller: 0 | 1 = 0) => {
  const b = scenario().define(ELIXIR).define(TAPPER).define(ELF).seat(0);
  if (withElixir) b.battlefield(ELIXIR.name);
  b.battlefield('Forest', 'Forest');
  b.battlefield(TAPPER.name, controller === 0 ? { fresh: true } : {});
  b.battlefield(ELF.name, { fresh: true });
  b.seat(1);
  if (controller === 1) b.battlefield(TAPPER.name, { fresh: true });
  return b.library('Forest').build();
};

describe('Thousand-Year Elixir', () => {
  test('without it a summoning-sick creature cannot use its {T} ability', () => {
    const g = game(false);
    expect(g.act(0).try.activate(TAPPER.name).ok).toBe(false);
    expect(g.act(0).try.tapForMana(ELF.name).ok).toBe(false);
  });

  test('with it a summoning-sick creature may use a {T} ability and tap for mana', () => {
    const g = game(true);
    g.act(0).activate(TAPPER.name);
    g.passAll();
    g.expect.life(0, 41);
    g.expect.tapped(TAPPER.name);
    expect(g.act(0).try.tapForMana(ELF.name).ok).toBe(true);
    g.expect.invariants();
  });

  test('it does not let the creature attack', () => {
    const g = game(true);
    g.advanceTo('declareAttackers');
    g.expect.canAttack(TAPPER.name, false);
  });

  test('the creatures of another player are not helped', () => {
    const g = scenario()
      .define(ELIXIR)
      .define(TAPPER)
      .seat(0)
      .battlefield(ELIXIR.name)
      .seat(1)
      .battlefield(TAPPER.name, { fresh: true })
      .library('Forest')
      .at('precombatMain', { active: 1, priority: 1 })
      .build();
    expect(g.act(1).try.activate(TAPPER.name).ok).toBe(false);
  });

  test('"{1}, {T}: Untap target creature" untaps it', () => {
    const g = scenario()
      .define(ELIXIR)
      .define(TAPPER)
      .seat(0)
      .battlefield(ELIXIR.name)
      .battlefield('Forest')
      .battlefield(TAPPER.name, { tapped: true })
      .seat(1)
      .library('Forest')
      .build();
    g.act(0).activate(ELIXIR.name).targets([TAPPER.name]).pay();
    g.passAll();
    g.expect.tapped(TAPPER.name, false);
    expect(g.state.pending?.kind).toBe('priority');
  });
});
