// Issue 144: the engine runs what the grammar reads for Den of the Bugbear ("If you control two or more other lands, ~ enters tapped", a land that becomes a creature
// with an attack trigger that makes a token tapped and attacking), Fountainport's "Sacrifice a token" cost, Arena of Glory (exert, mana spent on a creature spell
// gives it haste) and Throne of Eldraine (mana of the chosen color, restricted). The texts are the real wording under SYNTHETIC names.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const DEN = parsed(
  'SYNTHETIC Den',
  'Land',
  'If you control two or more other lands, ~ enters tapped.\n{T}: Add {R}.\n{3}{R}: Until end of turn, ~ becomes a 3/2 red Goblin creature with "Whenever ~ attacks, create a 1/1 red Goblin creature token that\'s tapped and attacking." It\'s still a land.',
);

describe('a land that enters tapped if you control two or more other lands (CR 614.1c, 614.12)', () => {
  const play = (others: number) => {
    const g = scenario()
      .define(DEN)
      .seat(0)
      .life(20)
      .hand(DEN.name)
      .battlefield(...Array.from({ length: others }, () => 'Mountain'))
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).playLand(DEN.name);
    return g;
  };

  test('with two other lands it enters tapped', () => {
    play(2).expect.tapped(DEN.name, true);
  });

  test('with three other lands it enters tapped', () => {
    play(3).expect.tapped(DEN.name, true);
  });

  test('with one other land it enters untapped', () => {
    play(1).expect.tapped(DEN.name, false);
  });

  test('with no other land it enters untapped', () => {
    play(0).expect.tapped(DEN.name, false);
  });
});

describe('a land that becomes a creature with an attack trigger that makes a token tapped and attacking (CR 508.4, 613.1d)', () => {
  const ready = () =>
    scenario()
      .define(DEN)
      .seat(0)
      .life(20)
      .battlefield(DEN.name)
      .battlefield('Mountain', { count: 4 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  // The land must not pay for its own ability (it would be tapped and could not attack): the four Mountains do.
  const becomeCreature = (g: ReturnType<typeof ready>) => {
    g.act(0)
      .activate(DEN.name)
      .payManual(['Mountain[0]', 'Mountain[1]', 'Mountain[2]', 'Mountain[3]']);
    g.passAll();
  };

  test('until end of turn it is a 3/2 red Goblin creature that is still a land', () => {
    const g = ready();
    becomeCreature(g);
    g.expect.pt(DEN.name, 3, 2);
    g.expect.derived(DEN.name, {
      types: ['land', 'creature'],
      subtypes: ['Goblin'],
      colors: ['R'],
    });
  });

  test('attacking with it creates a 1/1 Goblin token tapped and attacking, never declared as an attacker', () => {
    const g = ready();
    becomeCreature(g);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: DEN.name, target: { player: 1 } }]);
    g.passAll();
    const token = Object.values(g.state.objects).find(
      (o) => o.token !== undefined && o.zone === 'battlefield',
    );
    expect(token).toBeDefined();
    if (token === undefined) return;
    expect(token.tapped).toBe(true);
    expect(g.state.combat?.attackers.map((a) => a.object)).toContain(token.id);
    expect(g.state.combat?.attackers).toHaveLength(2);
    const attack = g.state.combat?.attackers.find((a) => a.object === token.id);
    expect(attack?.target).toEqual({ kind: 'player', seat: 1 });
    g.expect.invariants();
  });

  test('the token deals combat damage, so the opponent takes 4', () => {
    const g = ready();
    becomeCreature(g);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: DEN.name, target: { player: 1 } }]);
    g.passAll();
    g.advanceTo('endOfCombat', { block: false });
    g.expect.life(1, 16);
  });
});

const FOUNTAINPORT = parsed('SYNTHETIC Port', 'Land', '{2}, {T}, Sacrifice a token: Draw a card.');
const TOKEN_MAKER = parsed('SYNTHETIC Token Maker', 'Artifact', '{T}: Create a Treasure token.');

describe('"{2}, {T}, Sacrifice a token: Draw a card." (CR 602.2, 701.21a, 111.1)', () => {
  const ready = () =>
    scenario()
      .define(FOUNTAINPORT)
      .define(TOKEN_MAKER)
      .seat(0)
      .life(20)
      .battlefield(FOUNTAINPORT.name, TOKEN_MAKER.name)
      .battlefield('Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('is not offered while the only permanents to give up are not tokens', () => {
    ready().expect.illegal(0, { activate: FOUNTAINPORT.name });
  });

  test('sacrifices a token, and only a token, to draw a card', () => {
    const g = ready();
    g.act(0).activate(TOKEN_MAKER.name);
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.expect.legal(0, { activate: FOUNTAINPORT.name });
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.act(0).activate(FOUNTAINPORT.name, { pay: true });
    g.passAll();
    g.expect.noObject('Treasure', { zone: 'battlefield' });
    g.expect.handSize(0, hand + 1);
    g.expect.zone(TOKEN_MAKER.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });
});
