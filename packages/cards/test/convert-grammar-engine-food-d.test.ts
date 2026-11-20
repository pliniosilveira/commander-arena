// Food and Fellowship, group D: the engine plays what the grammar reads for Shire Shirriff (an optional sacrifice of a token, then a reflexive
// ability that exiles until the creature leaves). The texts are the real wording under SYNTHETIC names.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const ANGEL = 'SYNTHETIC Costly Angel'; // 4/4 Angel of the engine's test cards

const SHIRRIFF = parsed(
  'SYNTHETIC Shirriff',
  'Creature — Halfling Soldier',
  'Vigilance\nWhen this creature enters, you may sacrifice a token. When you do, exile target creature an opponent controls until this creature leaves the battlefield.',
  { manaCost: '{1}{W}', power: '2', toughness: '2', colors: ['W'] },
);
const TOKEN_MAKER = parsed('SYNTHETIC Token Maker', 'Artifact', '{T}: Create a Treasure token.');

describe('"When this creature enters, you may sacrifice a token. When you do, exile target creature an opponent controls until this creature leaves the battlefield." (CR 603.12, 610.3)', () => {
  const ready = () =>
    scenario()
      .define(SHIRRIFF)
      .define(TOKEN_MAKER)
      .seat(0)
      .life(20)
      .hand(SHIRRIFF.name)
      .battlefield(TOKEN_MAKER.name, 'Plains', 'Plains')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(ANGEL)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('sacrificing a token exiles the creature, which returns when the Shirriff leaves', () => {
    const g = ready();
    g.act(0).activate(TOKEN_MAKER.name);
    g.passAll();
    g.act(0).cast(SHIRRIFF.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.noObject('Treasure', { zone: 'battlefield' });
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.expect.zone(SHIRRIFF.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declining the sacrifice exiles nothing', () => {
    const g = ready();
    g.act(0).activate(TOKEN_MAKER.name);
    g.passAll();
    g.act(0).cast(SHIRRIFF.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });
});

const LOBELIA = parsed(
  'SYNTHETIC Lobelia',
  'Legendary Creature — Halfling Citizen',
  "Haste\nWhen ~ enters, look at the top card of each opponent's library and exile those cards face down.\n{T}, Sacrifice an artifact: Choose one —\n• Until end of turn, you may play a card exiled with ~ without paying its mana cost.\n• Each opponent loses 2 life and you gain 2 life.",
  { manaCost: '{2}{B}', power: '2', toughness: '2', colors: ['B'] },
);

describe('Lobelia: the top cards of each opponent’s library exiled face down, and the free play of one of them (CR 607.2a, 406.3, 118.9)', () => {
  const ready = (top: readonly string[] = ['Grizzly Bears']) =>
    scenario()
      .define(LOBELIA)
      .seat(0)
      .life(20)
      .hand(LOBELIA.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Sol Ring')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...top, ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  const enter = (top?: readonly string[]) => {
    const g = ready(top);
    g.act(0).cast(LOBELIA.name, { pay: true });
    g.passAll();
    return g;
  };

  test('entering exiles the top card of the opponent’s library face down, and only its controller sees it', () => {
    const g = enter();
    g.expect.zone('Grizzly Bears', 'exile', { seat: 1 });
    const bears = Object.values(g.state.objects).find(
      (o) => o.zone === 'exile' && o.exiledFaceDown === true,
    );
    expect(bears?.lookers).toEqual([0]);
    expect(g.state.seats[1]?.library.length).toBe(FILLER.length);
    g.expect.invariants();
  });

  test('the first mode lets its controller cast the exiled card for no mana until end of turn', () => {
    const g = enter();
    g.act(0).activate(LOBELIA.name, { modes: [0] });
    g.passAll();
    g.act(0).cast({ name: 'Grizzly Bears', seat: 1 }, { alternative: 'free' });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.noObject('Sol Ring', { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('a land card exiled this way is played as a land drop', () => {
    const g = enter(['Forest']);
    g.act(0).activate(LOBELIA.name, { modes: [0] });
    g.passAll();
    g.act(0).playLand({ name: 'Forest', seat: 1 });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
  });

  test('the permission is not there before the ability resolves', () => {
    const g = enter();
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'playPermission')).toBe(false);
  });

  test('the second mode drains each opponent for 2', () => {
    const g = enter();
    g.act(0).activate(LOBELIA.name, { modes: [1] });
    g.passAll();
    g.expect.life(0, 22);
    g.expect.life(1, 18);
  });
});
