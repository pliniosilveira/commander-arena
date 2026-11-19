// "Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}." (Channel, the second face of Yavimaya Bloomsage, the Quandrix
// Unlimited deck), read by the grammar and run by the engine. The first block parses the REAL Oracle text from the golden corpus, whole; the rest are SYNTHETIC cards whose only
// ability is the real line, run through `applyAction` with the scenario DSL, plus the near misses the grammar must not read. Every synthetic name starts with "SYNTHETIC".
import { readFileSync } from 'node:fs';
import { getLegalActions } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const GOLDEN: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));
const LINE =
  'Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}.';

const real = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
};

const LIB = Array.from({ length: 12 }, () => 'Plains');
const base = () =>
  scenario()
    .seat(0)
    .library(...LIB)
    .seat(1)
    .library(...LIB)
    .seat(0);

const grantOptions = (state: Parameters<typeof getLegalActions>[0]) =>
  getLegalActions(state, 0).filter((a) => a.kind === 'activateAbility' && a.abilityIndex <= -1000);

describe('the real card, whole', () => {
  test('Yavimaya Bloomsage // Channel is supported and Channel lowers to the player mana ability', () => {
    const imported = real('Yavimaya Bloomsage // Channel');
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[1]?.spell?.effect).toEqual({
      kind: 'grantPlayerManaAbility',
      player: { kind: 'you' },
      life: 1,
      mana: 'C',
      duration: 'untilEndOfTurn',
    });
  });
});

describe('lines that are not read', () => {
  const spell = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Refused',
        typeLine: 'Sorcery',
        manaCost: '{G}{G}',
        oracleText: text,
      }),
    ).support.status;

  test('the same shape with the real words is supported, and the general forms too', () => {
    expect(spell(LINE)).toBe('supported');
    expect(
      spell(
        'Until end of turn, any time you could activate a mana ability, you may pay 2 life. If you do, add {G}.',
      ),
    ).toBe('supported');
  });

  test.each([
    'Until end of turn, any time you could activate a mana ability, you may pay 0 life. If you do, add {C}.',
    'Until your next turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}.',
    'Until end of turn, you may pay 1 life. If you do, add {C}.',
    'Until end of turn, any time you could cast an instant, you may pay 1 life. If you do, add {C}.',
    'Until end of turn, any time you could activate a mana ability, pay 1 life. If you do, add {C}.',
    'Until end of turn, any time you could activate a mana ability, you may pay 1 life. Add {C}.',
    'Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}{C}.',
    'Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add one mana of any color.',
  ])('is not supported: %s', (text) => {
    expect(spell(text)).not.toBe('supported');
  });
});

describe('the engine runs what the grammar lowered', () => {
  // Channel is the prepare spell of Yavimaya Bloomsage (CR 722): it is cast as a copy while the creature is prepared. The creature has 4 +1/+1 counters, so its end step
  // trigger makes it 7/7 and prepared; the copy is cast in the controller's next turn (it is a sorcery).
  const prepared = (extra: { hand?: string[]; life?: number } = {}) => {
    const bloomsage = real('Yavimaya Bloomsage // Channel').definition;
    const three = parsed('SYNTHETIC Parsed Three', 'Sorcery', 'You gain 3 life.', {
      manaCost: '{3}',
    });
    const b = scenario()
      .define(bloomsage)
      .define(three);
    b.seat(0)
      .library(...LIB)
      .hand(...(extra.hand ?? []))
      .battlefield('Yavimaya Bloomsage // Channel', { counters: { '+1/+1': 4 }, label: 'bloom' })
      .battlefield('Forest')
      .battlefield('Forest')
      .battlefield('Forest');
    b.seat(1).library(...LIB);
    const g = b.at('postcombatMain', { active: 0, priority: 0 }).build();
    g.passAll();
    g.passAll();
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 2 });
    const copy = Object.values(g.state.objects).find((o) => o.prepareOf !== undefined);
    if (copy === undefined) throw new Error('the creature is not prepared');
    return { g, copy: copy.id, three };
  };

  test('the real Channel: cast for {G}{G}, then pay a {C} cost with life, several times in one payment', () => {
    const { g, copy, three } = prepared({ hand: ['SYNTHETIC Parsed Three'] });
    g.act(0).cast(copy, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
    const [use] = grantOptions(g.state);
    expect(use).toBeDefined();
    // By hand first: one use is one life and one {C} in the pool.
    if (use !== undefined) g.choose(0, use);
    g.expect.pool(0, 'C');
    g.expect.life(0, 39);
    // Then the rest in the middle of paying for a spell that costs {3}: one Forest, the {C} of the pool and one more use of the ability.
    g.act(0).cast(three.name, { pay: true });
    g.passAll();
    g.expect.life(0, 39 - 1 + 3);
    g.expect.pool(0, '');
  });

  test('the ability is gone in the next turn', () => {
    const { g, copy } = prepared();
    g.act(0).cast(copy, { pay: true });
    g.passAll();
    expect(grantOptions(g.state)).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    expect(grantOptions(g.state)).toEqual([]);
  });
});
