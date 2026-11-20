// Lathiel, the Bounteous Dawn (the REAL card of the golden corpus, read through the grammar only): "At the beginning of each end step, if you gained life this turn,
// distribute up to that many +1/+1 counters among any number of other target creatures." Pins CR 603.3d (the division and the targets are chosen as the trigger goes on
// the stack), CR 601.2d (each target gets at least 1; "up to" gives out at most the total), CR 603.4 (intervening "if"), CR 119.3 (life gained this turn), CR 122.6.
import { readFileSync } from 'node:fs';
import type { CardDefinition, ChosenTarget } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function withText(name: string, text: string) {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const [face] = card.faces;
  if (face === undefined) throw new Error(`${name} has no face`);
  return importCard(
    fromGoldenCard({ ...card, faces: [{ ...face, oracleText: text }] }),
    undefined,
    NO_OVERRIDES,
  );
}

function real(name: string): CardDefinition {
  const card = GOLDEN.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const LATHIEL = real('Lathiel, the Bounteous Dawn');
const MEND = parsed('SYNTHETIC Mend', 'Instant', 'You gain 3 life.', { manaCost: '{W}' });
const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const LIBRARY = Array.from({ length: 10 }, () => 'Forest');

const game = (hand: readonly string[] = [MEND.name]) =>
  scenario()
    .define(LATHIEL)
    .define(MEND)
    .define(BEAR)
    .seat(0)
    .battlefield(LATHIEL.name, { label: 'lathiel' })
    .battlefield(BEAR.name, { label: 'mine' })
    .battlefield('Plains')
    .hand(...hand)
    .library(...LIBRARY)
    .seat(1)
    .battlefield(BEAR.name, { label: 'theirs' })
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();

type Game = ReturnType<typeof game>;

/** Gains 3 life with the instant, then walks to the end step, where the trigger asks for its targets. */
function toEndStep(g: Game): void {
  g.act(0).cast(MEND.name, { pay: true });
  g.passAll();
  g.advanceTo('end');
}

const pending = (g: Game) => {
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error(`pending is ${d?.kind}`);
  return d;
};

const pick = (g: Game, picks: readonly (readonly [string, number])[]) =>
  g.act(0).try.action({
    kind: 'chooseTargets',
    targets: picks.map(
      ([label, share]): ChosenTarget => ({
        kind: 'object',
        id: g.id(label),
        specId: 't1',
        share,
      }),
    ),
  });

describe('Lathiel, the Bounteous Dawn', () => {
  test('reads as a divided, up to, end step trigger with the intervening if', () => {
    const ability = LATHIEL.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(ability).toMatchObject({
      trigger: { kind: 'endStep', whose: 'each' },
      interveningIf: { kind: 'lifeGainedThisTurn', atLeast: 1 },
      effect: { kind: 'distributeCounters', counter: '+1/+1' },
    });
    expect(ability?.targets).toEqual([
      {
        id: 't1',
        what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'], other: true } },
        divide: { total: { kind: 'lifeGainedThisTurn' }, upTo: true },
      },
    ]);
  });

  test('the decision offers the life gained as the total, none to as many as it, never Lathiel', () => {
    const g = game();
    toEndStep(g);
    const spec = pending(g).specs[0];
    expect(spec?.divide).toBe(3);
    expect(spec?.divideUpTo).toBe(true);
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(3);
    const ids = (spec?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : -1)).sort();
    expect(ids).toEqual([g.id('mine'), g.id('theirs')].sort());
  });

  test('dividing all of it: each target gets its share', () => {
    const g = game();
    toEndStep(g);
    expect(
      pick(g, [
        ['mine', 2],
        ['theirs', 1],
      ]).ok,
    ).toBe(true);
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 2 });
    g.expect.counters('theirs', { '+1/+1': 1 });
    g.expect.counters(LATHIEL.name, {});
    g.expect.invariants();
  });

  test('"up to": fewer than the life gained is allowed, and so is no target', () => {
    const g = game();
    toEndStep(g);
    expect(pick(g, [['mine', 1]]).ok).toBe(true);
    g.passAll();
    g.expect.counters('mine', { '+1/+1': 1 });
    const g2 = game();
    toEndStep(g2);
    expect(g2.act(0).try.action({ kind: 'chooseTargets', targets: [] }).ok).toBe(true);
  });

  test('more than the life gained, or a share below 1, is refused', () => {
    const g = game();
    toEndStep(g);
    expect(
      pick(g, [
        ['mine', 3],
        ['theirs', 1],
      ]).ok,
    ).toBe(false);
    expect(pick(g, [['mine', 0]]).ok).toBe(false);
    expect(pick(g, [['lathiel', 1]]).ok).toBe(false);
  });

  test('without life gained this turn the trigger does not go on the stack (CR 603.4)', () => {
    const g = game([]);
    g.advanceTo('end');
    expect(g.state.pending?.kind).not.toBe('targets');
    expect(g.state.stack.length).toBe(0);
  });

  test('the legal actions list divisions that give out less than the total', () => {
    const g = game();
    toEndStep(g);
    const actions = g.legalActions(0);
    const sums = actions.flatMap((a) =>
      a.kind === 'chooseTargets' ? [a.targets.reduce((n, t) => n + (t.share ?? 0), 0)] : [],
    );
    expect(sums).toContain(0);
    expect(sums).toContain(2); // one share each on two targets
    expect(sums).toContain(3);
    expect(Math.max(...sums)).toBe(3);
  });
});

describe('the wording stays narrow (SYNTHETIC texts)', () => {
  const unsupported = (text: string) =>
    expect(withText('Lathiel, the Bounteous Dawn', text).support.status).toBe('unsupported');

  test('"that many" outside the life gained intervening if is not read', () => {
    unsupported(
      'At the beginning of each end step, distribute up to that many +1/+1 counters among any number of other target creatures.',
    );
    unsupported(
      'At the beginning of each end step, if you gained 3 or more life this turn, distribute up to that many +1/+1 counters among any number of other target creatures.',
    );
  });

  test('a spell has no "that many" to divide', () => {
    const spell = withText(
      'Lathiel, the Bounteous Dawn',
      'Distribute up to that many +1/+1 counters among any number of other target creatures.',
    );
    expect(spell.support.status).toBe('unsupported');
  });

  test('other near misses are not read', () => {
    unsupported(
      'At the beginning of each end step, if you gained life this turn, distribute that many +1/+1 counters among any number of other target creatures.',
    );
    unsupported(
      'At the beginning of each end step, if you gained life this turn, distribute up to that many +1/+1 counters among other target creatures.',
    );
  });
});
