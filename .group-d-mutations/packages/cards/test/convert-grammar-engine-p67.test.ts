// The Vraska EDHREC deck, group 5 (stage P67, D-220): Harmonic Prodigy and Wizard's Staff, the REAL cards of the owner's golden corpus read through the grammar
// only and played through applyAction: a triggered ability that triggers an additional time (CR 603.2d) and "Equip Wizard {1}" (CR 702.6c). Stand-ins are
// SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, getView } from '@commander-arena/engine';
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
const PRODIGY = real('Harmonic Prodigy');
const STAFF = real("Wizard's Staff");

const SMALL = { manaCost: '{1}', power: '1', toughness: '1' } as const;
const WIZARD = parsed(
  'SYNTHETIC Wizard',
  'Creature — Human Wizard',
  'When ~ enters, you gain 1 life.',
  SMALL,
);
const SHAMAN = parsed(
  'SYNTHETIC Shaman',
  'Creature — Human Shaman',
  'When ~ enters, you gain 1 life.',
  SMALL,
);
const WARRIOR = parsed(
  'SYNTHETIC Warrior',
  'Creature — Human Warrior',
  'When ~ enters, you gain 1 life.',
  SMALL,
);
const SPARK = parsed('SYNTHETIC Spark', 'Instant', '~ deals 1 damage to any target.', {
  manaCost: '{R}',
});

describe('Harmonic Prodigy (a triggered ability of a Shaman or another Wizard you control triggers an additional time)', () => {
  test('reads as a static ability over a Shaman or another Wizard of the controller (CR 603.2d)', () => {
    expect(PRODIGY.faces[0]?.abilities.find((a) => a.kind === 'static')).toMatchObject({
      static: {
        kind: 'doubleTriggers',
        subject: {
          kind: 'filter',
          filter: {
            controller: 'you',
            anyOf: [{ subtypes: ['Shaman'] }, { subtypes: ['Wizard'], other: true }],
          },
        },
      },
    });
  });

  const game = (hand: readonly string[]) =>
    scenario()
      .define(PRODIGY)
      .define(WIZARD)
      .define(SHAMAN)
      .define(WARRIOR)
      .seat(0)
      .hand(...hand)
      .battlefield(PRODIGY.name)
      .battlefield('Mountain', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  const lifeAfter = (name: string) => {
    const g = game([name]);
    g.act(0).cast(name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.invariants();
    return g.state.seats[0]?.life;
  };

  test('another Wizard: its enters trigger happens twice', () => {
    expect(lifeAfter(WIZARD.name)).toBe(42);
  });

  test('a Shaman: its enters trigger happens twice', () => {
    expect(lifeAfter(SHAMAN.name)).toBe(42);
  });

  test('a creature that is neither: once', () => {
    expect(lifeAfter(WARRIOR.name)).toBe(41);
  });

  test('the Prodigy\'s own triggered ability is not doubled ("another Wizard")', () => {
    const g = scenario()
      .define(PRODIGY)
      .define(SPARK)
      .seat(0)
      .hand(SPARK.name)
      .battlefield(PRODIGY.name)
      .battlefield('Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(SPARK.name, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    // Prowess (its own ability) gave +1/+1 once: 2/4.
    const prodigy = getView(g.state, 0).battlefield.find((o) => o.name === PRODIGY.name);
    expect([prodigy?.power, prodigy?.toughness]).toEqual([2, 4]);
  });

  test('a Wizard the opponent controls is not doubled', () => {
    const g = scenario()
      .define(PRODIGY)
      .define(WIZARD)
      .seat(0)
      .battlefield(PRODIGY.name)
      .library(...FILLER)
      .seat(1)
      .hand(WIZARD.name)
      .battlefield('Island')
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(WIZARD.name, { pay: true });
    g.passAll();
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(41);
  });
});

describe("Wizard's Staff (Equip Wizard {1}, Equip {3}; a triggered ability of the equipped creature triggers an additional time)", () => {
  test('reads two equip abilities, one limited to Wizards (CR 702.6c)', () => {
    const equips = (STAFF.faces[0]?.abilities ?? []).filter(
      (a) => a.kind === 'keyword' && a.keyword.kind === 'equip',
    );
    expect(equips).toMatchObject([
      { keyword: { kind: 'equip', restriction: { subtypes: ['Wizard'] } } },
      { keyword: { kind: 'equip' } },
    ]);
  });

  const game = () =>
    scenario()
      .define(STAFF)
      .define(WIZARD)
      .define(WARRIOR)
      .define(SPARK)
      .seat(0)
      .hand(SPARK.name)
      .battlefield(STAFF.name)
      .battlefield(WIZARD.name)
      .battlefield(WARRIOR.name)
      .battlefield('Mountain', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  /** The indices of the two equip abilities among the derived abilities of the Staff, in order: the {1} one limited to Wizards, then the {3} one. */
  const equipIndices = (g: ReturnType<typeof game>) => {
    const staff = g.state.battlefield.find(
      (id) =>
        g.state.objects[id] !== undefined &&
        getView(g.state, 0).battlefield.find((o) => o.id === id)?.name === STAFF.name,
    );
    return [
      ...new Set(
        getLegalActions(g.state, 0).flatMap((a) =>
          a.kind === 'activate' && a.object === staff ? [a.abilityIndex] : [],
        ),
      ),
    ].sort((a, b) => a - b);
  };

  test('the {1} equip is refused for a creature that is not a Wizard; the {3} equip takes either', () => {
    const g = game();
    const [wizardsOnly, any] = equipIndices(g);
    if (wizardsOnly === undefined || any === undefined) throw new Error('two equip abilities');
    // The Warrior is not a legal target of the first: the engine refuses the target (CR 702.6c, 601.2c).
    const other = game();
    expect(() =>
      other.act(0).activate(STAFF.name, { ability: wizardsOnly, targets: [WARRIOR.name] }),
    ).toThrow();
    g.act(0)
      .activate(STAFF.name, { ability: any, targets: [WARRIOR.name] })
      .payManual(['Mountain[0]', 'Mountain[1]', 'Mountain[2]']);
    g.passAll();
    g.expect.attached(STAFF.name, WARRIOR.name);
    g.expect.invariants();
  });

  test('equipped to a Wizard, its enters-type trigger is doubled; prowess from the Staff counts twice', () => {
    const g = game();
    const [wizardsOnly] = equipIndices(g);
    g.act(0)
      .activate(STAFF.name, { ability: wizardsOnly ?? 0, targets: [WIZARD.name] })
      .payManual(['Mountain[0]']);
    g.passAll();
    g.expect.attached(STAFF.name, WIZARD.name);
    g.act(0).cast(SPARK.name, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    const wizard = getView(g.state, 0).battlefield.find((o) => o.name === WIZARD.name);
    // The Staff gives prowess; the trigger happens twice: +2/+2 on the 1/1.
    expect([wizard?.power, wizard?.toughness]).toEqual([3, 3]);
    g.expect.invariants();
  });
});

// CR 603.10a, 603.2d (D-225): a "leaves the battlefield" or "dies" ability looks back in time, and so does the doubling of it: a Wizard that dies together with
// Harmonic Prodigy still has its ability triggered twice, because the Prodigy was on the battlefield as the event happened.
describe('a doubler that leaves together with the creature whose ability it doubles (CR 603.10a)', () => {
  const MARTYR = parsed(
    'SYNTHETIC Martyr Wizard',
    'Creature \u2014 Human Wizard',
    'When ~ dies, you gain 1 life.',
    SMALL,
  );
  const WIPE = parsed('SYNTHETIC Wipe', 'Sorcery', 'Destroy all creatures.', {
    manaCost: '{1}{R}',
  });
  const game = (battlefield: readonly string[]) => {
    let b = scenario()
      .define(PRODIGY)
      .define(MARTYR)
      .define(WIPE)
      .seat(0)
      .hand(WIPE.name)
      .battlefield('Mountain', { count: 2 });
    for (const name of battlefield) b = b.battlefield(name);
    return b
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };
  const lifeAfterWipe = (g: ReturnType<typeof game>): number => {
    g.act(0).cast(WIPE.name, { pay: true });
    g.passAll();
    // The two triggers of the Wizard (one for the Prodigy's doubling) go on the stack and resolve.
    for (let i = 0; i < 4 && g.state.stack.length > 0; i += 1) g.passAll();
    return g.state.seats[0]?.life ?? 0;
  };

  test("the Prodigy and the Wizard die together: the Wizard's ability triggers twice", () => {
    expect(lifeAfterWipe(game([PRODIGY.name, MARTYR.name]))).toBe(42);
  });

  test('the Wizard dies alone with the Prodigy staying on the battlefield: twice', () => {
    const SNIPE = parsed('SYNTHETIC Snipe', 'Instant', 'Destroy target creature.', {
      manaCost: '{R}',
    });
    const g = scenario()
      .define(PRODIGY)
      .define(MARTYR)
      .define(SNIPE)
      .seat(0)
      .hand(SNIPE.name)
      .battlefield('Mountain')
      .battlefield(PRODIGY.name)
      .battlefield(MARTYR.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(SNIPE.name, { targets: [MARTYR.name], pay: true });
    g.passAll();
    for (let i = 0; i < 4 && g.state.stack.length > 0; i += 1) g.passAll();
    expect(g.state.seats[0]?.life).toBe(42);
  });

  test('with no Prodigy there is one trigger', () => {
    expect(lifeAfterWipe(game([MARTYR.name]))).toBe(41);
  });
});
