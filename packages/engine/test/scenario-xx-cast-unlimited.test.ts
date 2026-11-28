// "You may cast spells from your hand without paying their mana costs." (the emblem of Tamiyo, Field Researcher; Omniscience on a permanent): the static ability `castOnceEachTurn`
// with `unlimited`. Pins: CR 118.9 (an alternative cost an effect applies), CR 601.2b and 601.2f (announced as the spell is cast), CR 114.4 (an emblem's abilities work from the command
// zone), CR 601.3 (no timing exception). The permanent is SYNTHETIC; the spells are SYNTHETIC fixtures or basic real fixtures.
import { describe, expect, test } from 'vitest';
import type { Ability } from '../src/ast/types';
import { singleFace } from '../src/cards/fixtures/helpers';
import { getLegalActions, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const free = (
  extra: Partial<{ alternative: 'free' | 'lifeForMana'; from: ('hand' | 'libraryTop')[] }> = {},
): Ability => ({
  kind: 'static',
  static: {
    kind: 'castOnceEachTurn',
    spells: {},
    from: extra.from ?? ['hand'],
    alternative: extra.alternative ?? 'free',
    unlimited: true,
  },
});

const SCIENCE = 'SYNTHETIC Free Science';
const science = singleFace({
  name: SCIENCE,
  manaCost: ['7', 'U', 'U', 'U'],
  types: ['enchantment'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'You may cast spells from your hand without paying their mana costs.',
  abilities: [free()],
});
const ONCE = 'SYNTHETIC Once Science';
const once = singleFace({
  name: ONCE,
  manaCost: ['3', 'U'],
  types: ['enchantment'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    'Once during each of your turns, you may cast a spell from your hand without paying its mana cost.',
  abilities: [
    {
      kind: 'static',
      static: { kind: 'castOnceEachTurn', spells: {}, from: ['hand'], alternative: 'free' },
    },
  ],
});
const SHRINE = 'SYNTHETIC Plain Shrine'; // {2}{W} enchantment
const INSTANT = 'SYNTHETIC Plot Gain'; // {1}{U} instant, gain 2 life
const FILLER = ['Island', 'Island', 'Island', 'Island'] as const;

const game = (hand: readonly string[], active: 0 | 1 = 0, extra: readonly string[] = []) =>
  scenario()
    .define(science)
    .define(once)
    .seat(0)
    .life(20)
    .battlefield(...extra, SCIENCE)
    .hand(...hand)
    .library(...FILLER)
    .seat(1)
    .hand(...hand)
    .library(...FILLER)
    .at('precombatMain', { active, turn: 3 })
    .build();

const freeCasts = (g: ScenarioGame, seat: 0 | 1, name: string) =>
  getLegalActions(g.state, seat).filter(
    (a) =>
      a.kind === 'castSpell' &&
      a.alternative === 'free' &&
      g.state.objects[a.object]?.zone === 'hand' &&
      g.find({ name, zone: 'hand', seat }).some((o) => o.id === a.object),
  );

describe('validateCard', () => {
  test('the permission with no limit is free and from the hand only', () => {
    expect(validateCard(science)).toEqual([]);
    for (const bad of [
      free({ alternative: 'lifeForMana' }),
      free({ from: ['hand', 'libraryTop'] }),
    ]) {
      const card = singleFace({
        name: 'SYNTHETIC Bad Science',
        manaCost: ['1'],
        types: ['enchantment'],
        colors: [],
        colorIdentity: [],
        oracleText: 'SYNTHETIC fixture.',
        abilities: [bad],
      });
      expect(validateCard(card).length).toBeGreaterThan(0);
    }
  });
});

describe('spells from the hand without paying their mana costs, with no limit', () => {
  test('several spells in one turn, with no mana, and no use is recorded (CR 118.9)', () => {
    const g = game([SHRINE, SHRINE]);
    expect(freeCasts(g, 0, SHRINE)).toHaveLength(2);
    g.act(0).cast(`${SHRINE}[0]`, { alternative: 'free' });
    g.passAll();
    g.act(0).cast(SHRINE, { alternative: 'free' });
    g.passAll();
    expect(g.find({ name: SHRINE, zone: 'battlefield', seat: 0 })).toHaveLength(2);
    expect(g.state.turnLog.oncePerTurnGrants ?? []).toEqual([]);
    g.expect.invariants();
  });

  test("in an opponent's turn an instant is free; the opponent's own spells are not (CR 601.3)", () => {
    const g = game([INSTANT, SHRINE], 1);
    expect(freeCasts(g, 1, INSTANT)).toHaveLength(0);
    g.act(1).pass();
    expect(freeCasts(g, 0, INSTANT)).toHaveLength(1);
    expect(freeCasts(g, 0, SHRINE)).toHaveLength(0);
    g.act(0).cast(INSTANT, { alternative: 'free' });
    g.passAll();
    g.expect.life(0, 22);
  });

  test('beside a once-a-turn permission, the one with no limit is used first and leaves the other unused', () => {
    const g = game([SHRINE], 0, [ONCE]);
    g.act(0).cast(SHRINE, { alternative: 'free' });
    g.passAll();
    g.expect.life(0, 20);
    expect(g.state.turnLog.oncePerTurnGrants ?? []).toEqual([]);
  });
});
