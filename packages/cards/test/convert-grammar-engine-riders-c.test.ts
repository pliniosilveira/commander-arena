// The combat cards of the Riders of Rohan deck (group C), run as written: each imports a SYNTHETIC card through the grammar (never through a fixture), defines it in an engine
// scenario and plays it through applyAction, with three seats where "your opponents" is more than one player. Every card name starts with "SYNTHETIC"; the wording of each text is
// that of the real card the deck names. No real card's text is claimed beyond that.
import { getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';

const keywordsOf = (g: ScenarioGame, label: string, seat: 0 | 1 | 2 = 0): readonly string[] => {
  const id = g.id(label);
  return getView(g.state, seat).battlefield.find((o) => o.id === id)?.keywords ?? [];
};

// ---- Frontier Warmonger: "one or more creatures attack one of your opponents or a planeswalker they control" (CR 508.1b, 506.3, 603.2c).

const WARMONGER = parsed(
  'SYNTHETIC Parsed Warmonger',
  'Creature — Human Warrior',
  'Whenever one or more creatures attack one of your opponents or a planeswalker they control, those creatures gain menace until end of turn.',
  { manaCost: '{3}{R}', colors: ['R'], power: '4', toughness: '4' },
);

describe('Frontier Warmonger as written (CR 508.1b, 603.2c)', () => {
  const table = (activeSeat: 0 | 1 | 2) =>
    scenario({ seats: 3 })
      .define(WARMONGER)
      .seat(0)
      .battlefield(WARMONGER.name, { label: 'warmonger' })
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(WALKER, { label: 'walker0' })
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { label: 'a1' })
      .battlefield('Llanowar Elves', { label: 'b1' })
      .library(...FILLER)
      .seat(2)
      .battlefield(BEARS, { label: 'a2' })
      .battlefield(WALKER, { label: 'walker2' })
      .library(...FILLER)
      .at('precombatMain', { active: activeSeat, turn: 3 })
      .build();

  test('my creatures attacking one opponent gain menace', () => {
    const g = table(0);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['mine'], { player: 1 });
    g.passAll();
    expect(keywordsOf(g, 'mine')).toContain('menace');
    expect(keywordsOf(g, 'warmonger')).not.toContain('menace');
    g.expect.invariants();
  });

  test('a creature of an opponent attacking another opponent of mine makes it trigger (the ruling)', () => {
    const g = table(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack(['a1'], { player: 2 });
    g.passAll();
    expect(keywordsOf(g, 'a1', 1)).toContain('menace');
    g.expect.invariants();
  });

  test('an opponent attacking a planeswalker an opponent of mine controls triggers it too', () => {
    const g = table(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack(['a1'], 'walker2');
    g.passAll();
    expect(keywordsOf(g, 'a1', 1)).toContain('menace');
  });

  test('creatures attacking me, or my planeswalker, do not trigger it', () => {
    const me = table(1);
    me.advanceTo('declareAttackers', { attack: false });
    me.act(1).attack(['a1'], { player: 0 });
    me.passAll();
    expect(keywordsOf(me, 'a1', 1)).not.toContain('menace');
    const walker = table(1);
    walker.advanceTo('declareAttackers', { attack: false });
    walker.act(1).attack(['a1'], 'walker0');
    walker.passAll();
    expect(keywordsOf(walker, 'a1', 1)).not.toContain('menace');
  });

  test('only the creatures that attacked one of my opponents are "those creatures"', () => {
    const g = table(1);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([
      { attacker: 'a1', target: { player: 0 } },
      { attacker: 'b1', target: { player: 2 } },
    ]);
    g.passAll();
    expect(keywordsOf(g, 'a1', 1)).not.toContain('menace');
    expect(keywordsOf(g, 'b1', 1)).toContain('menace');
  });

  test('it triggers once for the declaration: two attackers, one trigger, both gain menace', () => {
    const g = table(0);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['mine', 'warmonger'], { player: 2 });
    g.passAll();
    expect(keywordsOf(g, 'mine')).toContain('menace');
    expect(keywordsOf(g, 'warmonger')).toContain('menace');
    g.expect.invariants();
  });
});
