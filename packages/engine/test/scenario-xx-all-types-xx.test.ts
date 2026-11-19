// "{X}: Until end of turn, creatures you control have base power and toughness X/X and gain all creature types."
// Pins: CR 613.4b (a set base P/T is layer 7b; counters and +N/+N effects apply on top, 613.4c), CR 613.1d (layer 4: types), CR 611.2c (the creatures affected are
// fixed as the effect resolves), CR 107.3a (X is announced as the ability is activated). The card is SYNTHETIC (src/cards/fixtures/synthetic-all-types-xx.ts).
import { describe, expect, test } from 'vitest';
import { CREATURE_TYPES, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const CHOIR = 'SYNTHETIC Shapeshifter Choir'; // 1/1
const BEARS = 'Grizzly Bears'; // 2/2
const ANGEL = 'Serra Angel'; // 4/4
const HOUND = 'Isamaru, Hound of Konda'; // {W} 2/2

const game = () =>
  scenario()
    .seat(0)
    .battlefield(CHOIR, BEARS, 'Plains', 'Plains', 'Plains')
    .seat(1)
    .battlefield(ANGEL)
    .build();

describe('the card is valid', () => {
  test(CHOIR, () => {
    expect(validateCard(syntheticCard(CHOIR))).toEqual([]);
  });
});

describe('creatures you control have base power and toughness X/X (CR 613.4b)', () => {
  test('X = 3: every creature I control is 3/3, the opponent’s is not touched', () => {
    const g = game();
    g.act(0).activate(CHOIR, { x: 3, pay: true });
    g.passAll();
    g.expect.pt(CHOIR, 3, 3);
    g.expect.pt(BEARS, 3, 3);
    g.expect.pt(ANGEL, 4, 4);
  });

  test('counters apply on top of the base (layer 7c)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CHOIR, 'Plains', 'Plains')
      .battlefield(BEARS, { counters: { '+1/+1': 2 } })
      .build();
    g.act(0).activate(CHOIR, { x: 2, pay: true });
    g.passAll();
    g.expect.pt(BEARS, 4, 4);
    g.expect.pt(CHOIR, 2, 2);
  });

  test('X = 0 makes them 0/0, and a creature with toughness 0 is put into its owner’s graveyard (CR 704.5f)', () => {
    const g = game();
    g.act(0).activate(CHOIR, { x: 0, pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(CHOIR, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });

  test('a creature that arrives later is not affected (CR 611.2c)', () => {
    const g = scenario()
      .seat(0)
      .hand(HOUND)
      .battlefield(CHOIR, 'Plains', 'Plains', 'Plains', 'Plains')
      .build();
    g.act(0).activate(CHOIR, { x: 3, pay: true });
    g.passAll();
    g.act(0).cast(HOUND, { pay: true });
    g.passAll();
    g.expect.pt(CHOIR, 3, 3);
    g.expect.pt(HOUND, 2, 2);
  });
});

describe('and they gain all creature types (CR 613.1d)', () => {
  test('every creature I control has every creature type, and keeps its card types', () => {
    const g = game();
    g.act(0).activate(CHOIR, { x: 1, pay: true });
    g.passAll();
    g.expect.derived(BEARS, {
      types: ['creature'],
      subtypes: [...new Set([...CREATURE_TYPES, 'Bear'])],
    });
    g.expect.derived(ANGEL, { subtypes: ['Angel'] });
  });
});

describe('the validator reads allCreatureTypes alone', () => {
  const card = (change: Record<string, unknown>) => {
    const base = syntheticCard(CHOIR);
    const ability = base.faces[0]?.abilities?.[0];
    if (ability?.kind !== 'activated' || ability.effect.kind !== 'sequence')
      throw new Error('shape');
    const effects = ability.effect.effects.map((e) =>
      e.kind === 'setTypes' ? { ...e, ...change } : e,
    );
    return {
      ...base,
      faces: [
        {
          ...base.faces[0],
          abilities: [{ ...ability, effect: { ...ability.effect, effects } }],
        },
      ],
    } as typeof base;
  };

  test('with subtypes, additive or false it is refused', () => {
    expect(validateCard(card({ subtypes: ['Elf'] })).length).toBeGreaterThan(0);
    expect(validateCard(card({ additive: true })).length).toBeGreaterThan(0);
    expect(validateCard(card({ allCreatureTypes: false })).length).toBeGreaterThan(0);
  });
});
