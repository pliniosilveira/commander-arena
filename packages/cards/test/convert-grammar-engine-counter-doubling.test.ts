// "Double the number of +1/+1 counters on ..." (CR 701.10, 122.6) and "Proliferate X times" (CR 701.34a) read by the grammar and run by the engine.
// The ability lines are the real Oracle wordings of the cards of the Quandrix Unlimited deck (names replaced by ~); each card is a SYNTHETIC
// card whose only ability is that line, so what is tested is the line and not the rest of the real card (whose other abilities are other groups).
// Every card name starts with "SYNTHETIC".
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly, spellCard } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const DOUBLE = { kind: 'doubleCounters', counter: '+1/+1' } as const;

describe('the lines read to doubleCounters', () => {
  test('Tanazir Quandrix: when ~ enters, target creature you control', () => {
    const card = parsed(
      'SYNTHETIC Parsed Doubler',
      'Legendary Creature — Elf Druid',
      'When ~ enters, double the number of +1/+1 counters on target creature you control.',
      { manaCost: '{3}{G}{G}', power: '4', toughness: '4', colors: ['G'] },
    );
    expect(card.faces[0]?.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield' },
        effect: { ...DOUBLE, objects: { kind: 'target' } },
      },
    ]);
  });

  test('Primordial Hydra: at the beginning of your upkeep, on ~', () => {
    const card = parsed(
      'SYNTHETIC Parsed Hydra',
      'Creature — Hydra',
      'At the beginning of your upkeep, double the number of +1/+1 counters on ~.',
      { manaCost: '{X}{G}{G}', power: '0', toughness: '0', colors: ['G'] },
    );
    expect(card.faces[0]?.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep' },
        effect: { ...DOUBLE, objects: { kind: 'this' } },
      },
    ]);
  });

  test('Fractal Harness: whenever equipped creature attacks, on it', () => {
    const card = parsed(
      'SYNTHETIC Parsed Harness',
      'Artifact — Equipment',
      'Whenever equipped creature attacks, double the number of +1/+1 counters on it.',
      { manaCost: '{2}{G}{U}' },
    );
    expect(card.faces[0]?.abilities).toMatchObject([
      { kind: 'triggered', trigger: { kind: 'attacks' }, effect: { ...DOUBLE } },
    ]);
  });

  test('Proliferate X times', () => {
    const card = spellCard('SYNTHETIC Parsed Algorithm', 'Proliferate X times.', {
      type: 'Sorcery',
      manaCost: '{X}{G}{U}',
    });
    const imported = parseOnly(card);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.spell?.effect).toEqual({
      kind: 'proliferate',
      times: { kind: 'x' },
    });
  });

  test.each(['Double the number of counters on target creature you control.', 'Proliferate X.'])(
    'is not supported: %s',
    (text) => {
      const imported = parseOnly(spellCard('SYNTHETIC Parsed Refused', text, { type: 'Sorcery' }));
      expect(imported.support.status).not.toBe('supported');
    },
  );
});

describe('the engine runs what the grammar lowered', () => {
  test('the enters trigger doubles the counters of the target creature', () => {
    const card = parsed(
      'SYNTHETIC Parsed Doubler',
      'Creature — Elf Druid',
      'When ~ enters, double the number of +1/+1 counters on target creature you control.',
      { manaCost: '{G}', power: '1', toughness: '1', colors: ['G'] },
    );
    const g = scenario()
      .define(card)
      .seat(0)
      .library(...FILLER)
      .hand(card.name)
      .battlefield('Forest')
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 2 } })
      .at('precombatMain')
      .build();
    g.act(0).cast(card.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('mine');
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 4 });
  });

  test('Proliferate X times: X = 2 asks twice', () => {
    const spell = parsed('SYNTHETIC Parsed Algorithm', 'Sorcery', 'Proliferate X times.', {
      manaCost: '{X}{G}',
      colors: ['G'],
    });
    const g = scenario()
      .define(spell)
      .seat(0)
      .library(...FILLER)
      .hand(spell.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(BEARS, { label: 'mine', counters: { '+1/+1': 1 } })
      .at('precombatMain')
      .build();
    g.act(0).cast(spell.name).x(2).pay();
    g.passAll();
    for (let i = 0; i < 2; i++) {
      g.choose({ kind: 'choosePermanents', objects: [g.id('mine')], players: [] });
    }
    g.expect.counters('mine', { '+1/+1': 3 });
  });
});
