// "As this enchantment enters, choose a planeswalker type.", "Planeswalkers you control of the chosen type have hexproof." and the replacement "As long as you
// control a creature, if damage dealt to a planeswalker you control of the chosen type would result in all loyalty counters on it being removed, instead all but one
// of those counters are removed." (the shape of Deification; the cards are SYNTHETIC, src/cards/fixtures/synthetic-chosen-walker.ts).
// Pins (numbers as the code and docs already cite them; docs/rules/comprehensive-rules.txt was not available, so these are unchecked against the text): CR 205.3j
// (planeswalker types), CR 614.12a (the choice is made as the permanent enters), CR 607.2d (what reads the choice), CR 614.1a (a replacement effect),
// CR 120.3c (damage to a planeswalker removes that many loyalty counters), CR 704.5i (a planeswalker with no loyalty counters is put into the graveyard),
// CR 702.11b (hexproof), CR 400.7 (a new object has made no choice).
import { describe, expect, test } from 'vitest';
import type { ObjectId } from '../src/ids';
import {
  type ChooseOptionDecision,
  PLANESWALKER_TYPES,
  syntheticCard,
  validateCard,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WARD = 'SYNTHETIC Walker Ward';
const DACK = 'SYNTHETIC Dack Walker';
const AJANI = 'SYNTHETIC Ajani Walker';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const BURN = 'SYNTHETIC Slow Burn'; // sorcery: 3 damage to any target
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const question = (g: ScenarioGame): ChooseOptionDecision => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error(`expected chooseOption, got ${d?.kind}`);
  return d;
};

describe('the cards are valid', () => {
  test(WARD, () => {
    expect(validateCard(syntheticCard(WARD))).toEqual([]);
  });

  const withAbilities = (abilities: unknown[]) => {
    const card = syntheticCard(WARD);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...card, faces: [{ ...face, abilities }] } as never;
  };
  const choose = {
    kind: 'replacement',
    replacement: { kind: 'asEntersChoose', what: 'planeswalkerType' },
  };
  const hexproof = (filter: unknown) => ({
    kind: 'static',
    static: {
      kind: 'grantKeyword',
      subject: { kind: 'filter', filter },
      keyword: { kind: 'hexproof' },
    },
  });
  const floor = (planeswalkers: unknown, when?: unknown) => ({
    kind: 'replacement',
    replacement: {
      kind: 'keepOneLoyalty',
      planeswalkers,
      ...(when === undefined ? {} : { while: when }),
    },
  });
  const mine = { types: ['planeswalker'], controller: 'you', chosenPlaneswalkerType: true };

  test('the chosen planeswalker type needs the card to choose one (CR 607.2d)', () => {
    expect(validateCard(withAbilities([choose, hexproof(mine)]))).toEqual([]);
    expect(validateCard(withAbilities([hexproof(mine)])).length).toBeGreaterThan(0);
    const creatureType = {
      kind: 'replacement',
      replacement: { kind: 'asEntersChoose', what: 'creatureType' },
    };
    expect(validateCard(withAbilities([creatureType, hexproof(mine)])).length).toBeGreaterThan(0);
  });

  test('keepOneLoyalty: planeswalkers of the controller, and a condition the engine reads', () => {
    const creature = { kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: 1 };
    expect(validateCard(withAbilities([choose, floor(mine)]))).toEqual([]);
    expect(validateCard(withAbilities([choose, floor(mine, creature)]))).toEqual([]);
    expect(
      validateCard(withAbilities([choose, floor({ types: ['planeswalker'] }, creature)])).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withAbilities([choose, floor(mine, { kind: 'kicked' })])).length,
    ).toBeGreaterThan(0);
  });
});

describe('"As this enchantment enters, choose a planeswalker type" (CR 614.12a, 205.3j)', () => {
  const cast = () => {
    const g = scenario()
      .seat(0)
      .hand(WARD)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(WARD, { pay: true });
    g.passAll();
    return g;
  };

  test('the controller is asked as the spell resolves, with the planeswalker types', () => {
    const g = cast();
    const d = question(g);
    expect(d.seat).toBe(0);
    expect(d.purpose).toBe('planeswalkerType');
    expect(d.options).toEqual(PLANESWALKER_TYPES);
    expect(d.options).toContain('Elminster');
    g.expect.zone(WARD, 'stack');
    g.expect.invariants();
  });

  test('the answer is stored on the permanent, which then enters', () => {
    const g = cast();
    g.act(0).chooseOption('Dack');
    g.expect.zone(WARD, 'battlefield', { seat: 0 });
    g.expect.chosen(WARD, { planeswalkerType: 'Dack' });
    g.expect.invariants();
  });

  test('only a planeswalker type is accepted', () => {
    const g = cast();
    for (const bad of ['Elf', 'W', 'creature', 'dack', '', 'Planeswalker']) {
      expect(g.act(0).try.action({ kind: 'chooseOption', option: bad }).ok, bad).toBe(false);
    }
    expect(g.act(1).try.action({ kind: 'chooseOption', option: 'Dack' }).ok).toBe(false);
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('Ajani');
    g.expect.chosen(WARD, { planeswalkerType: 'Ajani' });
  });

  test('the scenario builder takes a chosen planeswalker type and refuses a creature type for it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WARD, { chosen: { planeswalkerType: 'Dack' } })
      .seat(1)
      .build();
    g.expect.chosen(WARD, { planeswalkerType: 'Dack' });
    expect(() =>
      scenario()
        .seat(0)
        .battlefield(WARD, { chosen: { creatureType: 'Elf' } })
        .seat(1)
        .build(),
    ).toThrow(/chooses a planeswalkerType/);
  });
});

describe('"Planeswalkers you control of the chosen type have hexproof" (CR 702.11b, 607.2d)', () => {
  const game = (chosen: string) =>
    scenario()
      .at('precombatMain', { active: 1, turn: 2 })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WARD, { chosen: { planeswalkerType: chosen } })
      .battlefield(DACK, AJANI)
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();

  const targetsOf = (g: ScenarioGame, seat: 0 | 1): ObjectId[] => {
    g.act(seat).cast(BOLT);
    const d = g.state.pending;
    if (d?.kind !== 'targets') return [];
    return (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
  };

  test('only the planeswalkers of the chosen type are protected from an opponent', () => {
    const g = game('Dack');
    const legal = targetsOf(g, 1);
    expect(legal).toContain(g.id(AJANI));
    expect(legal).not.toContain(g.id(DACK));
    const h = game('Ajani');
    const other = targetsOf(h, 1);
    expect(other).toContain(h.id(DACK));
    expect(other).not.toContain(h.id(AJANI));
  });

  test('hexproof stops only the opponents: the controller can still target their own planeswalker', () => {
    const mine = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain', DACK)
      .battlefield(WARD, { chosen: { planeswalkerType: 'Dack' } })
      .seat(1)
      .library(...LIBRARY)
      .build();
    expect(targetsOf(mine, 0)).toContain(mine.id(DACK));
  });
});

describe('the damage replacement (CR 614.1a, 120.3c, 704.5i)', () => {
  // Seat 0 is the active player and burns their own walkers: hexproof only stops their opponents.
  const game = (chosen: string, creature = true, walker = DACK, loyalty = 3) => {
    const b = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, BURN)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .battlefield(WARD, { chosen: { planeswalkerType: chosen } })
      .battlefield(walker, { counters: { loyalty } });
    return (creature ? b.battlefield(BEARS) : b)
      .seat(1)
      .library(...LIBRARY)
      .build();
  };
  const hit = (g: ScenarioGame, spell: string, name: string) =>
    g.act(0).cast(spell, { targets: [{ name, seat: 0 }], pay: true });

  test('damage that would remove every loyalty counter removes all but one; the walker stays', () => {
    const g = game('Dack');
    hit(g, BOLT, DACK);
    g.passAll();
    g.expect.counters(DACK, { loyalty: 1 });
    g.expect.zone(DACK, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('damage beyond the loyalty is replaced the same way', () => {
    const g = game('Dack', true, DACK, 2);
    hit(g, BOLT, DACK);
    g.passAll();
    g.expect.counters(DACK, { loyalty: 1 });
    g.expect.zone(DACK, 'battlefield', { seat: 0 });
  });

  test('a planeswalker of another type loses all its loyalty and dies (CR 704.5i)', () => {
    const g = game('Dack', true, AJANI);
    hit(g, BOLT, AJANI);
    g.passAll();
    g.expect.zone(AJANI, 'graveyard', { seat: 0 });
  });

  test('without a creature the replacement does not apply', () => {
    const g = game('Dack', false);
    hit(g, BOLT, DACK);
    g.passAll();
    g.expect.zone(DACK, 'graveyard', { seat: 0 });
  });

  test('damage that leaves loyalty counters is not replaced', () => {
    const g = game('Dack', true, DACK, 5);
    hit(g, BOLT, DACK);
    g.passAll();
    g.expect.counters(DACK, { loyalty: 2 });
  });

  test('a walker with one counter left keeps it when more damage comes', () => {
    const g = game('Dack');
    hit(g, BOLT, DACK);
    g.passAll();
    hit(g, BURN, DACK);
    g.passAll();
    g.expect.counters(DACK, { loyalty: 1 });
    g.expect.zone(DACK, 'battlefield', { seat: 0 });
  });

  test('it protects the planeswalkers of the controller of the enchantment only', () => {
    const g = scenario()
      .at('precombatMain', { active: 1, turn: 2 })
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WARD, { chosen: { planeswalkerType: 'Dack' } })
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain', DACK)
      .build();
    g.act(1).cast(BOLT, { targets: [{ name: DACK, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(DACK, 'graveyard', { seat: 1 });
  });
});
