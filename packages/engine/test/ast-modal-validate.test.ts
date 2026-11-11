// What validateCard accepts and refuses about modal spells and abilities (D-114, CR 700.2).
// Pins: CR 700.2 (two or more modes and a number to choose), CR 700.2c (each mode has its own targets, and
// the targets of the modes chosen are asked together, so ids are unique across modes), CR 107.3j (a modal
// ability reads an X only where its own cost has one), CR 700.2d (the same mode is not chosen twice, so the
// number to choose is at most the number of modes).
// Cards are SYNTHETIC probes built here and in src/cards/fixtures/synthetic-modal.ts.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import {
  type Ability,
  type CardDefinition,
  type Effect,
  FEATURE_VALUES,
  isFeatureSupported,
  type ModeChoice,
  type SpellMode,
  SYNTHETIC_CARDS,
  validateCard,
} from '../src/index';

const YOU = { kind: 'you' } as const;
const DRAW: Effect = { kind: 'draw', player: YOU, count: 1 };
const GAIN: Effect = { kind: 'gainLife', player: YOU, amount: 1 };
const NONE: Effect = { kind: 'sequence', effects: [] };
const HIT = (id: string): SpellMode => ({
  text: `Deal 1 damage to target creature (${id}).`,
  targets: [{ id, what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } }],
  effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id } },
});
const TWO: readonly SpellMode[] = [
  { text: 'Draw a card.', effect: DRAW },
  { text: 'You gain 1 life.', effect: GAIN },
];
const ONE: ModeChoice = { min: 1, max: 1 };

const issues = (card: CardDefinition): string[] =>
  validateCard(card).map((i) => `${i.path}: ${i.message}`);

const spell = (
  modes: readonly SpellMode[] | undefined,
  chooseModes: ModeChoice | undefined,
  more: { effect?: Effect; x?: boolean } = {},
): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Modal Probe',
    manaCost: ['1', 'R'],
    types: ['sorcery'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'SYNTHETIC probe',
    spell: {
      ...(modes === undefined ? {} : { modes }),
      ...(chooseModes === undefined ? {} : { chooseModes }),
      ...(more.effect === undefined ? { effect: undefined } : { effect: more.effect }),
      ...(more.x === true ? { x: true } : {}),
    } as never,
  });

const permanent = (abilities: readonly Ability[]): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Modal Permanent',
    manaCost: ['2'],
    types: ['artifact'],
    colors: [],
    colorIdentity: [],
    oracleText: 'SYNTHETIC probe',
    abilities,
  });

const triggered = (extra: Record<string, unknown>): Ability =>
  ({
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    effect: NONE,
    ...extra,
  }) as Ability;
const activated = (extra: Record<string, unknown>): Ability =>
  ({ kind: 'activated', cost: [{ kind: 'tap' }], effect: NONE, ...extra }) as Ability;

describe('modal spells', () => {
  test('the shapes the engine runs are accepted', () => {
    expect(issues(spell(TWO, ONE))).toEqual([]);
    expect(issues(spell(TWO, { min: 2, max: 2 }))).toEqual([]);
    expect(issues(spell(TWO, { min: 1, max: 2 }))).toEqual([]);
    expect(issues(spell([...TWO, HIT('a')], { min: 1, max: 3 }))).toEqual([]);
    expect(
      issues(
        spell(TWO, { min: 1, max: 1, maxIf: { condition: { kind: 'controlCommander' }, max: 2 } }),
      ),
    ).toEqual([]);
  });

  test('every modal fixture is valid', () => {
    const modal = Object.values(SYNTHETIC_CARDS).filter(
      (c) => c.name.startsWith('SYNTHETIC ') && JSON.stringify(c).includes('chooseModes'),
    );
    expect(modal.length).toBeGreaterThan(10);
    for (const card of modal) expect(validateCard(card), card.name).toEqual([]);
  });

  test('one mode is not a modal spell, and nine are too many', () => {
    expect(issues(spell([TWO[0] as SpellMode], ONE))[0]).toContain('at least two modes');
    const nine = Array.from({ length: 9 }, (_, i) => HIT(`t${i}`));
    expect(issues(spell(nine, ONE)).join('\n')).toContain('at most 8 modes');
  });

  test('how many to choose must be said, and must fit the modes', () => {
    expect(issues(spell(TWO, undefined)).join('\n')).toContain('must say how many modes');
    for (const bad of [
      { min: 0, max: 1 },
      { min: 2, max: 1 },
      { min: 1, max: 3 },
      { min: 1.5, max: 2 },
    ]) {
      expect(issues(spell(TWO, bad)).join('\n'), JSON.stringify(bad)).toContain(
        'chooseModes needs',
      );
    }
  });

  test('the commander widening must raise the number, within the modes', () => {
    const widen = (max: number) =>
      spell(TWO, { min: 1, max: 1, maxIf: { condition: { kind: 'controlCommander' }, max } });
    expect(issues(widen(1)).join('\n')).toContain('maxIf.max');
    expect(issues(widen(3)).join('\n')).toContain('maxIf.max');
    expect(issues(widen(2))).toEqual([]);
  });

  test('the effects live in the modes, not beside them', () => {
    expect(issues(spell(TWO, ONE, { effect: DRAW })).join('\n')).toContain('not in effect');
  });

  test('target ids are unique across the modes (the targets are asked together, CR 601.2c)', () => {
    expect(issues(spell([HIT('t'), HIT('t')], ONE)).join('\n')).toContain('used by another mode');
    expect(issues(spell([HIT('a'), HIT('b')], ONE))).toEqual([]);
  });

  test('a mode may only use its own targets', () => {
    const wrong: SpellMode = {
      text: 'x',
      effect: { kind: 'destroy', objects: { kind: 'target', id: 'a' } },
    };
    expect(issues(spell([HIT('a'), wrong], ONE)).join('\n')).toContain('a');
  });

  test('a mode with X needs the spell to have X', () => {
    const drawX: SpellMode = {
      text: 'Draw X cards.',
      effect: { kind: 'draw', player: YOU, count: { kind: 'x' } },
    };
    expect(issues(spell([drawX, TWO[1] as SpellMode], ONE)).length).toBeGreaterThan(0);
    const withX = singleFace({
      name: 'SYNTHETIC Modal X Probe',
      manaCost: ['X', 'R'],
      types: ['sorcery'],
      colors: ['R'],
      colorIdentity: ['R'],
      oracleText: 'SYNTHETIC probe',
      spell: { x: true, chooseModes: ONE, modes: [drawX, TWO[1] as SpellMode] },
    });
    expect(issues(withX)).toEqual([]);
  });
});

describe('modal abilities', () => {
  test('a modal triggered ability and a modal activated ability are accepted', () => {
    expect(issues(permanent([triggered({ modes: TWO, chooseModes: ONE })]))).toEqual([]);
    expect(issues(permanent([activated({ modes: TWO, chooseModes: ONE })]))).toEqual([]);
  });

  test('the effect of a modal ability is the empty sequence, and it has no targets of its own', () => {
    expect(
      issues(permanent([triggered({ modes: TWO, chooseModes: ONE, effect: DRAW })])).join('\n'),
    ).toContain('empty sequence');
    expect(
      issues(
        permanent([
          activated({
            modes: TWO,
            chooseModes: ONE,
            targets: HIT('a').targets,
          }),
        ]),
      ).join('\n'),
    ).toContain('declares targets on each mode');
  });

  test('chooseModes without modes and modes without chooseModes are refused', () => {
    expect(issues(permanent([triggered({ chooseModes: ONE })])).length).toBeGreaterThan(0);
    expect(issues(permanent([triggered({ modes: TWO })])).join('\n')).toContain(
      'must say how many',
    );
  });

  test('a mode of a triggered ability may read the triggering object, and one of an activated ability may not', () => {
    const readsSubject: SpellMode = {
      text: 'x',
      effect: {
        kind: 'loseLife',
        player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
        amount: 1,
      } as Effect,
    };
    const dies = triggered({
      trigger: { kind: 'dies', what: { zone: 'battlefield', types: ['creature'] } },
      modes: [readsSubject, TWO[0] as SpellMode],
      chooseModes: ONE,
    });
    expect(issues(permanent([dies]))).toEqual([]);
    expect(
      issues(
        permanent([activated({ modes: [readsSubject, TWO[0] as SpellMode], chooseModes: ONE })]),
      ).length,
    ).toBeGreaterThan(0);
  });

  test('an X in a mode of an activated ability needs an {X} in its own cost', () => {
    const drawX: SpellMode = {
      text: 'Draw X.',
      effect: { kind: 'draw', player: YOU, count: { kind: 'x' } },
    };
    const modes = [drawX, TWO[1] as SpellMode];
    expect(issues(permanent([activated({ modes, chooseModes: ONE })])).length).toBeGreaterThan(0);
    expect(
      issues(
        permanent([
          activated({ cost: [{ kind: 'mana', symbols: ['X'] }], modes, chooseModes: ONE }),
        ]),
      ),
    ).toEqual([]);
    // A triggered ability never has an X of its own (CR 107.3j).
    expect(issues(permanent([triggered({ modes, chooseModes: ONE })])).length).toBeGreaterThan(0);
  });
});

describe('features', () => {
  test('ability:modal is a known, supported feature', () => {
    expect(FEATURE_VALUES.ability).toContain('modal');
    expect(isFeatureSupported('ability:modal')).toBe(true);
  });
});
