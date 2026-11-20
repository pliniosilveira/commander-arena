// "Whenever another creature you control dies, you get an experience counter. At the beginning of your end step, choose target creature card in your graveyard. If that card's
// mana value is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand." (CR 122.1, 202.3, 608.2c): the
// grammar reads both abilities, the lowering produces the engine's `gainExperience`, `experienceCounters` and `manaValueAtMostAmount` inside a `conditional` with an `else`, and the
// engine runs what the lowering produced. The two lines are the Oracle text of Meren of Clan Nel Toth (the card is in the golden corpus); the other lines are SYNTHETIC siblings
// and the near misses the grammar must not read.
import { applyAction, syntheticCard, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const DIES = 'Whenever another creature you control dies, you get an experience counter.';
const END_STEP =
  'At the beginning of your end step, choose target creature card in your graveyard. If that card’s mana value is less than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand.';

describe('you get an experience counter', () => {
  test('lowers to gainExperience in a dies trigger of another creature you control', () => {
    const face = readAll(DIES, 'creature', ['Human', 'Shaman']);
    expect(face.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: {
          kind: 'dies',
          what: { types: ['creature'], controller: 'you', other: true },
        },
        effect: { kind: 'gainExperience', player: { kind: 'you' }, amount: 1 },
      },
    ]);
  });

  test('a number of counters and another player (SYNTHETIC)', () => {
    const face = readAll('When this creature enters, you get two experience counters.', 'creature');
    expect(face.abilities).toMatchObject([
      { effect: { kind: 'gainExperience', player: { kind: 'you' }, amount: 2 } },
    ]);
    const target = readAll('Target player gets an experience counter.', 'sorcery');
    expect(target.spell?.effect).toMatchObject({ kind: 'gainExperience', amount: 1 });
  });

  test('is not read: a wrong count or noun, another counter or another verb', () => {
    for (const text of [
      'Whenever another creature you control dies, you get an experience counters.',
      'Whenever another creature you control dies, you get 1 experience counters.',
      'Whenever another creature you control dies, you get an energy counter.',
      'Whenever another creature you control dies, you get a experience counter.',
      'Whenever another creature you control dies, you gets an experience counter.',
      'Whenever another creature you control dies, you get an experience.',
    ]) {
      expect(dropped(text, 'creature').reason, text).toBeDefined();
    }
  });
});

describe('the end step ability', () => {
  test('lowers to a conditional on the mana value of the target against the experience counters, with an else', () => {
    const face = readAll(END_STEP, 'creature', ['Human', 'Shaman']);
    expect(face.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
            },
          },
        ],
        effect: {
          kind: 'conditional',
          condition: {
            kind: 'manaValueAtMostAmount',
            of: { kind: 'target', id: 't1' },
            amount: { kind: 'experienceCounters' },
          },
          effect: {
            kind: 'moveToZone',
            objects: { kind: 'target', id: 't1' },
            to: 'battlefield',
            controller: 'you',
          },
          else: { kind: 'moveToZone', objects: { kind: 'target', id: 't1' }, to: 'hand' },
        },
      },
    ]);
  });

  test('is not read with another comparison, another amount word, or no otherwise to say where the card goes', () => {
    for (const text of [
      'At the beginning of your end step, choose target creature card in your graveyard. If that card’s mana value is greater than or equal to the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand.',
      'At the beginning of your end step, choose target creature card in your graveyard. If that card’s mana value is less than the number of experience counters you have, return it to the battlefield. Otherwise, put it into your hand.',
      'At the beginning of your end step, choose target creature card in your graveyard. If that card’s mana value is less than or equal to the number of poison counters you have, return it to the battlefield. Otherwise, put it into your hand.',
      'At the beginning of your end step, choose target creature card in your graveyard. If that card’s mana value is less than or equal to the number of experience counters an opponent has, return it to the battlefield. Otherwise, put it into your hand.',
      'At the beginning of your end step, choose target creature card in your graveyard. If it’s mana value is less than or equal to the number of experience counters you have, return it to the battlefield.',
    ]) {
      expect(dropped(text, 'creature').reason, text).toBeDefined();
    }
  });
});

describe('the engine runs what the lowering produced', () => {
  const lowered = () => {
    const dies = readAll(DIES, 'creature', ['Human', 'Shaman']).abilities[0];
    const end = readAll(END_STEP, 'creature', ['Human', 'Shaman']).abilities[0];
    if (dies === undefined || end === undefined) throw new Error('no ability');
    const base = syntheticCard('SYNTHETIC Experienced Shaman');
    const [baseFace] = base.faces;
    if (baseFace === undefined) throw new Error('no face');
    return {
      ...base,
      name: 'SYNTHETIC Lowered Shaman',
      faces: [{ ...baseFace, name: 'SYNTHETIC Lowered Shaman', abilities: [dies, end] }],
    };
  };

  test('the lowered card is valid', () => {
    expect(validateCard(lowered())).toEqual([]);
  });

  test('a card whose mana value is at most the counters returns; a dearer card goes to the hand', () => {
    const g = scenario()
      .seat(0)
      .define(lowered())
      .battlefield('SYNTHETIC Lowered Shaman', 'Mountain', 'Mountain', 'Mountain')
      .battlefield('SYNTHETIC Experience Free Beast', { label: 'dying' })
      .graveyard('SYNTHETIC Experience Two Beast', { label: 'two' })
      .hand('Lightning Bolt')
      .seat(1)
      .library('Island', { count: 4 })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast('Lightning Bolt', { targets: ['dying'], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.experience).toBe(1);
    // One counter, a card of mana value 2 (and the Beast that died, of mana value 0, is in the graveyard too): the Two Beast goes to the hand.
    g.advanceTo('end');
    g.act(0).chooseTargets('two');
    g.passAll();
    g.expect.zone('SYNTHETIC Experience Two Beast', 'hand', { seat: 0 });
    expect(applyAction(g.state, 0, { kind: 'pass' }).ok).toBe(true);
  });

  test('a card whose mana value is at most the counters returns to the battlefield', () => {
    const g = scenario()
      .seat(0)
      .define(lowered())
      .battlefield('SYNTHETIC Lowered Shaman', 'Mountain')
      .graveyard('SYNTHETIC Experience Free Beast', { label: 'free' })
      .seat(1)
      .library('Island', { count: 4 })
      .at('postcombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone('SYNTHETIC Experience Free Beast', 'battlefield', { seat: 0 });
  });
});
