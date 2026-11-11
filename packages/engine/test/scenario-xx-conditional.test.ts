// The `conditional` effect: "If [condition], [effect]. Otherwise, [else]." (CR 608.2c).
// Pins: CR 608.2c (instructions are followed in the order written, so a condition is read when its
// instruction comes up, after the instructions before it), CR 603.4 (the intervening "if" of a
// triggered ability is another thing and is not built; docs/ROADMAP.md), CR 702.33d (the `kicked`
// condition, covered in scenario-xx-kicker.test.ts). Cards are SYNTHETIC (src/cards/fixtures or
// defined here).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { CardDefinition, Condition, Effect } from '../src/index';
import { validateAbility, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const RALLY = 'SYNTHETIC Rally Cry';
const YOU = { kind: 'you' } as const;
const draw = (count: number): Effect => ({ kind: 'draw', player: YOU, count });
const gain = (amount: number): Effect => ({ kind: 'gainLife', player: YOU, amount });
const CREATURE = { types: ['creature'] } as const;

/** A sorcery with this text and effect, for the scenarios below. */
const sorcery = (name: string, text: string, effect: Effect): CardDefinition =>
  singleFace({
    name,
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: text,
    spell: { effect },
  });

describe('the condition is true, false, or false with an else (CR 608.2c)', () => {
  const build = (creatures: readonly string[]) =>
    scenario()
      .seat(0)
      .hand(RALLY)
      .battlefield('Forest', ...creatures)
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();

  test('two creatures: the first branch runs and the else does not', () => {
    const g = build(['Grizzly Bears', 'Grizzly Bears']);
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    g.expect.handSize(0, 2);
    g.expect.life(0, 40);
  });

  test('one creature: the condition is false and the else branch runs', () => {
    const g = build(['Grizzly Bears']);
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.life(0, 42);
  });

  test('no creatures: the same else branch', () => {
    const g = build([]);
    g.act(0).cast(RALLY, { pay: true });
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.life(0, 42);
  });

  test('without an else, a false condition does nothing and the rest of the spell goes on', () => {
    const noElse = sorcery(
      'SYNTHETIC Test Maybe Draw',
      'You gain 1 life. If you control a creature, draw a card.',
      {
        kind: 'sequence',
        effects: [
          gain(1),
          {
            kind: 'conditional',
            condition: { kind: 'controlsAtLeast', filter: CREATURE, count: 1 },
            effect: draw(1),
          },
          gain(1),
        ],
      },
    );
    const g = scenario()
      .define(noElse)
      .seat(0)
      .hand(noElse.name)
      .battlefield('Forest')
      .library('Plains')
      .seat(1)
      .build();
    g.act(0).cast(noElse.name, { pay: true });
    g.passAll();
    g.expect.life(0, 42);
    g.expect.handSize(0, 0);
  });
});

describe('the condition is read when its instruction runs, not before (CR 608.2c)', () => {
  test('an earlier instruction can make a true condition false', () => {
    // "Destroy all creatures you control. Then if you control a creature, draw a card; otherwise
    // you gain 2 life." Read at the start, the condition would hold and the player would draw.
    const wipeThenCheck = sorcery(
      'SYNTHETIC Test Wipe Then Check',
      'Destroy all creatures you control. Then if you control a creature, draw a card. Otherwise, you gain 2 life.',
      {
        kind: 'sequence',
        effects: [
          {
            kind: 'destroy',
            objects: {
              kind: 'each',
              filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
            },
          },
          {
            kind: 'conditional',
            condition: { kind: 'controlsAtLeast', filter: CREATURE, count: 1 },
            effect: draw(1),
            else: gain(2),
          },
        ],
      },
    );
    const g = scenario()
      .define(wipeThenCheck)
      .seat(0)
      .hand(wipeThenCheck.name)
      .battlefield('Forest', 'Grizzly Bears')
      .library('Plains')
      .seat(1)
      .build();
    g.act(0).cast(wipeThenCheck.name, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.life(0, 42);
    g.expect.handSize(0, 0);
  });

  test('an earlier instruction can make a false condition true', () => {
    const makeThenCheck = sorcery(
      'SYNTHETIC Test Make Then Check',
      'Create a Treasure token. If you control an artifact, draw a card.',
      {
        kind: 'sequence',
        effects: [
          { kind: 'createToken', token: { kind: 'preset', preset: 'Treasure' }, count: 1 },
          {
            kind: 'conditional',
            condition: { kind: 'controlsAtLeast', filter: { types: ['artifact'] }, count: 1 },
            effect: draw(1),
          },
        ],
      },
    );
    const g = scenario()
      .define(makeThenCheck)
      .seat(0)
      .hand(makeThenCheck.name)
      .battlefield('Forest')
      .library('Plains')
      .seat(1)
      .build();
    g.act(0).cast(makeThenCheck.name, { pay: true });
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('and, or and not combine as they do in a replacement condition', () => {
    const cond: Condition = {
      kind: 'and',
      terms: [
        { kind: 'controlsAtLeast', filter: CREATURE, count: 1 },
        { kind: 'not', term: { kind: 'controlsAtLeast', filter: CREATURE, count: 3 } },
      ],
    };
    const combined = sorcery(
      'SYNTHETIC Test Combined',
      'If you control one or two creatures, you gain 5 life.',
      { kind: 'conditional', condition: cond, effect: gain(5) },
    );
    const lifeAfter = (creatures: number): number => {
      const g = scenario()
        .define(combined)
        .seat(0)
        .hand(combined.name)
        .battlefield('Forest', ...Array.from({ length: creatures }, () => 'Grizzly Bears'))
        .seat(1)
        .build();
      g.act(0).cast(combined.name, { pay: true });
      g.passAll();
      return g.state.seats[0]?.life ?? -1;
    };
    expect([0, 1, 2, 3].map(lifeAfter)).toEqual([40, 45, 45, 40]);
  });
});

describe('validation of the conditional effect', () => {
  const wrap = (effect: Effect): CardDefinition => sorcery('SYNTHETIC Test Wrap', 'text', effect);

  test('a well-formed conditional is valid and runnable', () => {
    expect(
      validateCard(
        wrap({
          kind: 'conditional',
          condition: { kind: 'opponentsAtLeast', count: 1 },
          effect: gain(1),
          else: gain(2),
        }),
      ),
    ).toEqual([]);
  });

  test('both branches and the condition are checked, with their paths', () => {
    const bad = wrap({
      kind: 'conditional',
      condition: { kind: 'controlsAtLeast', filter: CREATURE, count: 0 },
      effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 'nope' } },
      else: { kind: 'draw', player: { kind: 'target', id: 'nope' }, count: 1 },
    });
    const paths = validateCard(bad).map((i) => i.path);
    expect(paths).toContain('faces[0].spell.effect.condition.count');
    expect(paths).toContain('faces[0].spell.effect.effect.to');
    expect(paths).toContain('faces[0].spell.effect.else.player');
  });

  test('the engine limits of an effect hold inside a branch, the else included', () => {
    const inElse = wrap({
      kind: 'conditional',
      condition: { kind: 'opponentsAtLeast', count: 1 },
      effect: gain(1),
      else: { kind: 'addMana', mana: { kind: 'anyColor' } },
    });
    const issues = validateCard(inElse);
    expect(issues.map((i) => i.path)).toEqual(['faces[0].spell.effect.else.mana']);
    // Marked unsupported the card is not run, so the same card is fine structurally.
    expect(validateCard({ ...inElse, support: 'unsupported' })).toEqual([]);
  });

  test('an unknown condition kind inside a conditional is rejected', () => {
    const bad = {
      kind: 'conditional',
      condition: { kind: 'nonsense' },
      effect: gain(1),
    } as unknown as Effect;
    const issues = validateAbility({
      kind: 'triggered',
      trigger: { kind: 'landfall' },
      effect: bad,
    });
    expect(issues.map((i) => i.message)).toEqual(['unknown condition nonsense']);
  });
});
