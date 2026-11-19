// Troyan deck, group 1 (issue 337): "add four mana in any combination of colors" as the effect of a trigger, "you may copy it" for the spell of a cast
// trigger with "Do this only once each turn", and "Creatures with flying can't attack you or planeswalkers you control." The lines are the real wordings of
// two cards of the deck; the cards defined here are SYNTHETIC copies of them (a SYNTHETIC name, the words the grammar reads). The engine runs what is
// lowered, through applyAction.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const CRUCIBLE_TEXT =
  'At the beginning of your first main phase, add four mana in any combination of colors.';
const COPY_TEXT =
  'Whenever you cast a noncreature spell, you may copy it. You may choose new targets for the copy. Do this only once each turn.';
const WARD_TEXT = "Creatures with flying can't attack you or planeswalkers you control.";

describe('add N mana in any combination of colors as the effect of a trigger (CR 106.1b, 608.2d)', () => {
  test('is a counted choice of the five colors, each option adding one mana of its color', () => {
    const [ability] = readAll(CRUCIBLE_TEXT, 'enchantment').abilities ?? [];
    expect(ability).toEqual({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'main1', whose: 'you' },
      effect: {
        kind: 'chooseOne',
        times: 4,
        options: ['W', 'U', 'B', 'R', 'G'].map((color) => ({
          label: `{${color}}`,
          effect: { kind: 'addMana', mana: { kind: 'fixed', mana: [color] } },
        })),
      },
    });
  });

  test('"different colors" is not read this way: the choices would not exclude one another', () => {
    expect(
      dropped(
        'At the beginning of your first main phase, add four mana of different colors.',
        'enchantment',
      ),
    ).toMatchObject({ reason: 'unrecognised' });
  });

  test('the trigger asks four times as the first main phase begins, and the mana is in the pool for that phase', () => {
    const crucible = parsed('SYNTHETIC Parsed Crucible', 'Enchantment', CRUCIBLE_TEXT, {
      manaCost: '{4}{G}{U}',
      colors: ['G', 'U'],
    });
    const g = scenario()
      .define(crucible)
      .seat(0)
      .library('Island', { count: 4 })
      .battlefield(crucible.name)
      .seat(1)
      .library('Island', { count: 4 })
      .at('upkeep', { active: 0 })
      .build();
    g.advanceTo('precombatMain', { attack: false });
    g.passAll();
    for (const color of ['{W}', '{U}', '{U}', '{G}']) g.act(0).chooseOption(color);
    expect(g.state.seats[0]?.manaPool.map((m) => m.color).sort()).toEqual(['G', 'U', 'U', 'W']);
    // The mana stays while the phase lasts (CR 106.4: it empties as the step or phase ends).
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.turn.step).toBe('precombatMain');
    g.expect.invariants();
  });
});

describe('"you may copy it ... Do this only once each turn" on a cast trigger (CR 707.10, 603.2h)', () => {
  test('reads as the optional copy of the spell that was cast, once each turn', () => {
    const [ability] = readAll(COPY_TEXT, 'enchantment').abilities ?? [];
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        filter: { notTypes: ['creature'], stackKind: 'spell' },
        by: 'you',
      },
      effect: { kind: 'copySpell', spell: { kind: 'triggerSubject' }, newTargets: 'may' },
      optional: true,
      doOnlyOnceEachTurn: true,
    });
  });

  test('"it" is only the spell of a cast trigger: after another instruction it is not read', () => {
    expect(
      dropped('When ~ enters, exile target card from a graveyard. Copy it.', 'enchantment'),
    ).toBeDefined();
  });
});

describe('creatures with flying can not attack you or planeswalkers you control (CR 508.1a, 506.3)', () => {
  test('reads as the engine static ability over the creatures with flying', () => {
    expect(readAll(WARD_TEXT, 'enchantment').abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'cantAttackYou',
          creatures: { types: ['creature'], keywords: ['flying'] },
          planeswalkers: true,
        },
      },
    ]);
  });

  test('a condition or a second subject is not read', () => {
    expect(
      dropped("As long as ~ is untapped, creatures with flying can't attack you.", 'creature'),
    ).toBeDefined();
  });

  test('the engine refuses the flyer and lets the ground creature attack', () => {
    const ward = parsed('SYNTHETIC Parsed Skyward Ward', 'Enchantment', WARD_TEXT, {
      manaCost: '{6}{G}{G}',
      colors: ['G'],
    });
    const g = scenario()
      .define(ward)
      .seat(0)
      .library('Island', { count: 4 })
      .battlefield('Serra Angel', 'Grizzly Bears')
      .seat(1)
      .library('Island', { count: 4 })
      .battlefield(ward.name)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(0).try.declareAttackers([{ attacker: 'Serra Angel' }]).ok).toBe(false);
    g.act(0).attack('Grizzly Bears');
    g.expect.combat({ attackers: ['Grizzly Bears'] });
  });
});
