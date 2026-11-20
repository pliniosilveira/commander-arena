// Howlsquad Heavy (issue 144, speed subsystem): the Oracle text of the issue, read through the grammar only and played through applyAction. The text is the real one of the issue
// ("Start your engines!", a haste grant, a beginning-of-combat token that must attack that combat, and "Max speed — {T}: Add {R} for each Goblin you control."); the stored card
// around it is SYNTHETIC (name, mana cost, type line, power and toughness are stand-ins, since the golden corpus has no copy of the card yet).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const ORACLE =
  'Start your engines!\nOther Goblins you control have haste.\nAt the beginning of combat on your turn, create a 1/1 red Goblin creature token. That token attacks this combat if able.\nMax speed — {T}: Add {R} for each Goblin you control.';

const imported = importCard(
  syntheticCard(
    {
      name: 'SYNTHETIC Howlsquad Heavy',
      manaCost: '{2}{R}',
      typeLine: 'Creature — Goblin Mercenary',
      oracleText: ORACLE,
      power: '2',
      toughness: '2',
      colors: ['R'],
    },
    { colorIdentity: ['R'] },
  ),
  undefined,
  NO_OVERRIDES,
);
const HEAVY = imported.definition;
const FILLER = Array.from({ length: 30 }, () => 'Island');

const game = (speed: number | null) => {
  const b = scenario()
    .define(HEAVY)
    .seat(0)
    .battlefield(HEAVY.name)
    .library(...FILLER);
  return (speed === null ? b : b.speed(speed))
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
};

describe('Howlsquad Heavy (issue 144)', () => {
  test('the whole text reads: it is supported, with nothing dropped', () => {
    expect(imported.support.status).toBe('supported');
    expect(imported.support.unparsed).toEqual([]);
    const kinds = (HEAVY.faces[0]?.abilities ?? []).map((a) => a.kind);
    expect(kinds).toEqual(['keyword', 'static', 'triggered', 'mana']);
  });

  test('Start your engines! gives its controller speed 1 and nobody else', () => {
    const g = game(null);
    g.act(0).pass();
    g.expect.speed(0, 1);
    g.expect.speed(1, null);
  });

  test('the beginning of combat makes a Goblin token with haste that must attack that combat', () => {
    const g = game(1);
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.expect.derived('Goblin', { subtypes: ['Goblin'], keywords: ['haste'] });
    const decision = (() => {
      g.advanceTo('declareAttackers', { attack: false });
      return g.state.pending;
    })();
    if (decision?.kind !== 'declareAttackers') throw new Error('expected declareAttackers');
    // The token is summoning sick but has haste (the Heavy grants it to other Goblins), so it must attack; the Heavy, which is not required, may stay home.
    expect(decision.mustAttack).toHaveLength(1);
    expect(g.act(0).try.declareAttackers([]).ok).toBe(false);
    g.act(0).attack(['Goblin']);
    g.advanceTo('postcombatMain');
    expect(g.state.continuousEffects.some((e) => e.until === 'endOfCombat')).toBe(false);
  });

  test('its mana ability makes {R} for each Goblin only at max speed', () => {
    const slow = game(3);
    expect(slow.act(0).try.tapForMana(HEAVY.name).ok).toBe(false);

    const fast = game(4);
    fast.advanceTo('beginningOfCombat');
    fast.passAll();
    // The Heavy and the token it made are both Goblins.
    fast.act(0).tapForMana(HEAVY.name);
    fast.expect.pool(0, 'RR');
  });
});
