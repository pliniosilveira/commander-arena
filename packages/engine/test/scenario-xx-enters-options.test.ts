// "As this enchantment enters, choose Khans or Dragons. Khans - At the beginning of your upkeep, ... Dragons - Whenever a creature you control leaves the
// battlefield, ..." (D-151): a choice among names the card gives (`asEntersChoose` of `option`) and the linked abilities that read it (the condition
// `chosenOption`).
// Pins: CR 614.12 and 614.12a (a choice made as the permanent enters, before it is on the battlefield), CR 607.2d (linked abilities: each reads only the choice
// the same permanent made), CR 400.7 (the choice is gone with the permanent), CR 603.10a (a leaves-the-battlefield trigger looks back). Cards are
// SYNTHETIC (src/cards/fixtures/synthetic-dragons-enters.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SIEGE = 'SYNTHETIC Siege of Choices';
const GOBLIN = 'Raging Goblin';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 8 }, () => 'Mountain');

describe('the card is valid', () => {
  test('the Siege', () => {
    expect(validateCard(syntheticCard(SIEGE))).toEqual([]);
  });

  test('the shapes that are refused', () => {
    const card = syntheticCard(SIEGE);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const withAbilities = (abilities: unknown[]) =>
      ({ ...card, faces: [{ ...face, abilities }] }) as never;
    const choose = (options: unknown) => ({
      kind: 'replacement',
      replacement: { kind: 'asEntersChoose', what: 'option', options },
    });
    const reads = (option: string) => ({
      kind: 'triggered',
      trigger: { kind: 'upkeep', whose: 'you' },
      triggerCondition: { kind: 'chosenOption', option },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });
    // two different options at least
    expect(validateCard(withAbilities([choose(['Khans'])])).length).toBeGreaterThan(0);
    expect(validateCard(withAbilities([choose(['Khans', 'Khans'])])).length).toBeGreaterThan(0);
    expect(validateCard(withAbilities([choose(['Khans', 'Dragons'])]))).toEqual([]);
    // a reference needs the choice, and one of its options
    expect(JSON.stringify(validateCard(withAbilities([reads('Khans')])))).toContain(
      'does not choose one',
    );
    expect(
      JSON.stringify(validateCard(withAbilities([choose(['Khans', 'Dragons']), reads('Sultai')]))),
    ).toContain('does not offer');
    // a list of options belongs to a choice among options
    expect(
      validateCard(
        withAbilities([
          {
            kind: 'replacement',
            replacement: { kind: 'asEntersChoose', what: 'color', options: ['A', 'B'] },
          },
        ]),
      ).length,
    ).toBeGreaterThan(0);
  });
});

const game = (build: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
  build(
    scenario()
      .seat(0)
      .library(...LIBRARY),
  )
    .seat(1)
    .library(...LIBRARY)
    .build();

describe('the choice as it enters', () => {
  test('the controller is asked, with the two options, before it enters', () => {
    const g = game((b) =>
      b.hand(SIEGE).battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain'),
    );
    g.act(0).cast(SIEGE, { pay: true });
    g.passAll();
    const d = g.state.pending;
    expect(d?.kind).toBe('chooseOption');
    if (d?.kind !== 'chooseOption') return;
    expect(d.purpose).toBe('option');
    expect(d.options).toEqual(['Khans', 'Dragons']);
    g.act(0).chooseOption('Dragons');
    g.expect.chosen(SIEGE, { option: 'Dragons' });
  });

  test('an answer that is not an option is refused', () => {
    const g = game((b) =>
      b.hand(SIEGE).battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain'),
    );
    g.act(0).cast(SIEGE, { pay: true });
    g.passAll();
    expect(() => g.act(0).chooseOption('Sultai')).toThrow();
    g.expect.pending('chooseOption', 0);
  });

  test('a permanent put on the battlefield by the scenario can carry the choice', () => {
    const g = game((b) => b.battlefield(SIEGE, { chosen: { option: 'Khans' } }));
    g.expect.chosen(SIEGE, { option: 'Khans' });
    expect(() => game((b) => b.battlefield(SIEGE, { chosen: { option: 'Sultai' } }))).toThrow();
    g.expect.invariants();
  });
});

describe('Khans: at the beginning of your upkeep, exile the top card; you may play it this turn', () => {
  test('the Khans ability works and the Dragons ability does not', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SIEGE, { chosen: { option: 'Khans' } })
      .battlefield(GOBLIN)
      .library('Forest', 'Swamp', 'Plains', ...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.zone('Forest', 'exile', { seat: 0 });
    g.advanceTo('precombatMain');
    g.expect.legal(0, { playLand: 'Forest' });
  });

  test('a creature of mine leaving the battlefield does nothing', () => {
    const g = game((b) =>
      b
        .battlefield(SIEGE, { chosen: { option: 'Khans' } })
        .battlefield(GOBLIN, 'Mountain')
        .hand(BOLT),
    );
    g.act(0).cast(BOLT, { targets: [{ name: GOBLIN, seat: 0 }], pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'graveyard', { seat: 0 });
    g.expect.pending('priority', 0);
    g.expect.life(1, 40);
  });
});

describe('Dragons: whenever a creature you control leaves the battlefield, 1 damage to any target', () => {
  test('the Dragons ability works: my Goblin dies and the opponent takes 1', () => {
    const g = game((b) =>
      b
        .battlefield(SIEGE, { chosen: { option: 'Dragons' } })
        .battlefield(GOBLIN, 'Mountain')
        .hand(BOLT),
    );
    g.act(0).cast(BOLT, { targets: [{ name: GOBLIN, seat: 0 }], pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 39);
  });

  test('and the Khans ability does not: nothing is exiled at my upkeep', () => {
    const g = scenario()
      .seat(0)
      .battlefield(SIEGE, { chosen: { option: 'Dragons' } })
      .library('Forest', ...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    expect(g.find({ name: 'Forest', zone: 'exile' })).toHaveLength(0);
  });

  test('a creature of the opponent leaving does not trigger it', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SIEGE, { chosen: { option: 'Dragons' } })
      .hand(BOLT)
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(GOBLIN)
      .build();
    g.act(0).cast(BOLT, { targets: [{ name: GOBLIN, seat: 1 }], pay: true });
    g.passAll();
    g.expect.zone(GOBLIN, 'graveyard', { seat: 1 });
    g.expect.pending('priority', 0);
    g.expect.life(1, 40);
  });

  test('the choice is read as the Siege last was: the trigger of a creature that left together with it still reads it (CR 603.10a)', () => {
    const g = game((b) =>
      b
        .battlefield(SIEGE, { chosen: { option: 'Dragons' } })
        .battlefield(GOBLIN)
        .hand('SYNTHETIC Wrath')
        .battlefield('Plains', 'Plains', 'Plains', 'Plains'),
    );
    g.act(0).cast('SYNTHETIC Wrath', { pay: true });
    g.passAll();
    // the Wrath destroys the creature only: the Siege stays and triggers for the Goblin
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 39);
  });
});

describe('two Sieges choose on their own', () => {
  test('each reads only its own choice', () => {
    const g = game((b) =>
      b
        .battlefield(SIEGE, { chosen: { option: 'Dragons' }, label: 'dragons' })
        .battlefield(SIEGE, { chosen: { option: 'Khans' }, label: 'khans' })
        .battlefield(GOBLIN, 'Mountain')
        .hand(BOLT),
    );
    g.act(0).cast(BOLT, { targets: [{ name: GOBLIN, seat: 0 }], pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 39); // one trigger only: the Dragons Siege's
  });
});
