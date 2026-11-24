// validateCard for the nodes of group B of the Riders of Rohan deck: `restrict` of `cantBlock` until your next turn, `youCantAttackPlayers` and `youCantSacrifice`, and the `moved` that follows a
// `gainControl`. Cards are SYNTHETIC and defined here.
import { describe, expect, test } from 'vitest';
import type { Effect, SpellText } from '../src/ast/types';
import { validateCard } from '../src/ast/validate';
import { singleFace } from '../src/cards/fixtures/helpers';

const sorcery = (spell: SpellText) =>
  singleFace({
    name: 'SYNTHETIC Test Sorcery',
    manaCost: ['U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'test',
    spell,
  });

const issues = (effect: Effect, targets: SpellText['targets'] = []) =>
  validateCard(sorcery({ effect, ...(targets === undefined ? {} : { targets }) })).map(
    (i) => `${i.path}: ${i.message}`,
  );

const EACH = { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } } as const;

describe('restrict until your next turn', () => {
  test('cantBlock may last until your next turn', () => {
    const effect: Effect = {
      kind: 'restrict',
      objects: EACH,
      restriction: 'cantBlock',
      duration: 'untilYourNextTurn',
    };
    expect(issues(effect)).toEqual([]);
  });

  test('another restriction may not', () => {
    const effect: Effect = {
      kind: 'restrict',
      objects: EACH,
      restriction: 'cantBeBlocked',
      duration: 'untilYourNextTurn',
    };
    expect(issues(effect).join('|')).toContain('duration of cantBlock only');
  });
});

describe('the player bans of Call for Aid', () => {
  test('youCantAttackPlayers and youCantSacrifice validate after a gainControl', () => {
    const effect: Effect = {
      kind: 'sequence',
      effects: [
        { kind: 'gainControl', objects: EACH, duration: 'untilEndOfTurn' },
        { kind: 'untap', objects: { kind: 'moved' } },
        {
          kind: 'youCantAttackPlayers',
          players: { kind: 'eachOpponent' },
          duration: 'untilEndOfTurn',
        },
        { kind: 'youCantSacrifice', objects: { kind: 'moved' }, duration: 'untilEndOfTurn' },
      ],
    };
    expect(issues(effect)).toEqual([]);
  });

  test('moved without an effect before it that moves objects is refused', () => {
    const effect: Effect = {
      kind: 'youCantSacrifice',
      objects: { kind: 'moved' },
      duration: 'untilEndOfTurn',
    };
    expect(issues(effect).join('|')).toContain("'moved' needs");
  });

  test('another duration is refused', () => {
    const effect = {
      kind: 'youCantAttackPlayers',
      players: { kind: 'eachOpponent' },
      duration: 'permanent',
    } as unknown as Effect;
    expect(issues(effect).join('|')).toContain('lasts until end of turn');
  });
});
