// The golden corpus (D-066): real Oracle text, committed, parsed in CI without network access.
// `golden.expected.json` records what the parser does with each card (support status, the
// diagnostics, a hash of the AST). A test fails when a card's status changes, and another when its
// diagnostics or AST change, so a parser change shows up as a reviewed diff of that file:
//
//   UPDATE_GOLDEN=1 pnpm exec vitest run packages/cards/test/golden.test.ts
//
// rewrites it. 75% of the cards are training and 25% hold-out, split by the last hex digit of the
// oracle id; the hold-out coverage is reported next to the training coverage so rules written to
// examples rather than to templates show up as a gap between the two.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  fromGoldenCard,
  type GoldenCard,
  type GoldenGroup,
  goldenGroup,
  goldenKey,
  importCard,
  PARSER_VERSION,
  parseGolden,
} from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const CORPUS = new URL('./fixtures/corpus/golden.jsonl', import.meta.url);
const EXPECTED = new URL('./fixtures/corpus/golden.expected.json', import.meta.url);

const cards: readonly GoldenCard[] = parseGolden(readFileSync(CORPUS, 'utf8'));

/**
 * The other cards of the corpus, by name, for a meld card's melded face (D-280): a record marked `related` is the combined face of a meld pair, which the app fetches
 * with the pair. A corpus that does not hold it leaves the meld card unsupported with the reason "was not available", which is the truth about that corpus.
 */
const byName = new Map(cards.map((c) => [c.name.toLowerCase(), fromGoldenCard(c)] as const));
const related = (name: string) => byName.get(name.toLowerCase());

/** The real parser, with no hand-written override (a fixture would hide what the grammar does). */
function analyse(card: GoldenCard) {
  const imported = importCard(
    fromGoldenCard(card),
    undefined,
    NO_OVERRIDES,
    undefined,
    undefined,
    related,
  );
  const { status, unparsed, reasons } = imported.support;
  return {
    name: card.name,
    group: goldenGroup(card),
    status,
    unparsed: unparsed.map((u) => ({
      face: u.face,
      ability: u.ability,
      text: u.text,
      reason: u.reason,
      slot: u.slot,
      closestRule: u.closestRule,
      needs: u.needs,
    })),
    reasons,
    ast: hash(imported.definition.faces),
  };
}

/** Canonical JSON (sorted keys) hashed with 32-bit FNV-1a: enough to notice an AST change. */
function hash(value: unknown): string {
  const text = JSON.stringify(value, (_key, v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

type Result = ReturnType<typeof analyse>;

interface Expected {
  readonly parserVersion: number;
  readonly cards: Readonly<Record<string, Result>>;
  readonly summary: Readonly<Record<GoldenGroup, { supported: number; total: number }>>;
}

function summarise(results: readonly Result[]): Expected['summary'] {
  const out: Record<GoldenGroup, { supported: number; total: number }> = {
    training: { supported: 0, total: 0 },
    holdout: { supported: 0, total: 0 },
    acceptance: { supported: 0, total: 0 },
  };
  for (const r of results) {
    out[r.group].total += 1;
    if (r.status === 'supported') out[r.group].supported += 1;
  }
  return out;
}

// A card kept only as the melded face of a pair is no card of the corpus: it is not counted in any group (D-280).
const counted = cards.filter((card) => card.related !== true);
const results = new Map(counted.map((card) => [goldenKey(card), analyse(card)] as const));

function build(): Expected {
  return {
    parserVersion: PARSER_VERSION,
    cards: Object.fromEntries([...results.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
    summary: summarise([...results.values()]),
  };
}

if (process.env.UPDATE_GOLDEN === '1') {
  writeFileSync(EXPECTED, `${JSON.stringify(build(), null, 2)}\n`);
}

const expected: Expected = JSON.parse(readFileSync(EXPECTED, 'utf8'));
const REGENERATE = 'run UPDATE_GOLDEN=1 pnpm exec vitest run packages/cards/test/golden.test.ts';

describe('the golden file', () => {
  test('has real cards, one per line, each with a source, and no duplicates', () => {
    expect(cards.length).toBeGreaterThanOrEqual(20);
    expect(new Set(cards.map(goldenKey)).size).toBe(cards.length);
    for (const card of cards) {
      expect(card.source, card.name).not.toBe('');
      expect(card.faces.length, card.name).toBeGreaterThan(0);
      expect(card.name, 'no SYNTHETIC text in the real corpus').not.toMatch(/SYNTHETIC/);
    }
  });

  test('every card with a known oracle id has a well-formed one', () => {
    for (const card of cards) {
      if (card.oracleId !== null) expect(card.oracleId, card.name).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  test('a card without an oracle id says where its text came from instead', () => {
    for (const card of cards.filter((c) => c.oracleId === null)) {
      expect(card.source, card.name).toMatch(/engine-fixture/);
    }
  });
});

describe('the snapshot gate', () => {
  test('is for this parser version (regenerate the snapshot with the version bump)', () => {
    expect(expected.parserVersion, REGENERATE).toBe(PARSER_VERSION);
  });

  test('lists exactly the cards of the corpus', () => {
    expect(Object.keys(expected.cards).sort(), REGENERATE).toEqual([...results.keys()].sort());
  });

  test('no golden card changed support status', () => {
    const changed = [...results.entries()]
      .filter(([key, r]) => expected.cards[key]?.status !== r.status)
      .map(([key, r]) => `${r.name}: ${expected.cards[key]?.status} -> ${r.status}`);
    expect(
      changed,
      `a support status changed; ${REGENERATE} after checking it is intended`,
    ).toEqual([]);
  });

  test('no golden card changed what is reported about it, or the AST it parses to', () => {
    const changed = [...results.entries()]
      .filter(([key, r]) => JSON.stringify(expected.cards[key]) !== JSON.stringify(r))
      .map(([, r]) => r.name);
    expect(changed, `the diagnostics or the AST of these cards changed; ${REGENERATE}`).toEqual([]);
  });
});

describe('training and hold-out coverage (D-066)', () => {
  const summary = summarise([...results.values()]);

  test('is reported, and recorded in the snapshot so a change shows in review', () => {
    const share = (g: GoldenGroup) =>
      summary[g].total === 0 ? 'n/a' : `${summary[g].supported}/${summary[g].total}`;
    console.info(
      `golden coverage: training ${share('training')}, hold-out ${share('holdout')}, acceptance ${share('acceptance')}`,
    );
    expect(summary, REGENERATE).toEqual(expected.summary);
  });

  test('the split is deterministic: the last hex digit 0 to b is training, c to f hold-out', () => {
    const plain = cards.find((c) => c.acceptance !== true) as GoldenCard;
    const at = (oracleId: string): GoldenGroup => goldenGroup({ ...plain, oracleId });
    const digits = [...'0123456789abcdef'];
    expect(digits.map((d) => at(`00000000-0000-0000-0000-00000000000${d}`))).toEqual([
      ...Array(12).fill('training'),
      ...Array(4).fill('holdout'),
    ]);
    expect(at('00000000-0000-0000-0000-00000000000C')).toBe('holdout');
  });

  test('an acceptance card is outside the split, and a card with no id is split by its name', () => {
    expect(goldenGroup({ ...(cards[0] as GoldenCard), acceptance: true })).toBe('acceptance');
    const named = (name: string) =>
      goldenGroup({ ...(cards[0] as GoldenCard), oracleId: null, name });
    expect(named('Plains')).toBe(named('Plains'));
    const groups = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(named));
    expect(groups.has('training')).toBe(true);
    expect(groups.has('holdout')).toBe(true);
  });

  test('the owner’s acceptance cards are in the corpus and are reported apart', () => {
    expect(summary.acceptance.total).toBeGreaterThanOrEqual(1);
    expect(cards.some((c) => c.acceptance === true && c.name.startsWith('Korvold'))).toBe(true);
  });
});

describe('budget', () => {
  // Per card and after one warm-up pass, so the guard does not tighten as the corpus grows and a
  // cold start does not count; still loose enough to catch only a pathological rule.
  test('after a warm-up pass, the corpus parses 20 times in under 1.5 ms per card on average', () => {
    for (const card of cards) analyse(card);
    const start = performance.now();
    for (let i = 0; i < 20; i++) for (const card of cards) analyse(card);
    const perCard = (performance.now() - start) / (20 * cards.length);
    expect(perCard).toBeLessThan(1.5);
    // The 20 passes over a corpus that grows with every stage outgrew the 5 s default of a test; the guard is the average per card.
  }, 60_000);
});
