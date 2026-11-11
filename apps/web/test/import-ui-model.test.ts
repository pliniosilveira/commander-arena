import { describe, expect, test } from 'vitest';
import { formatFeature, reasonDetails, reasonStatement } from '../src/ui/import/diagnostics';
import { highlightFace } from '../src/ui/import/highlight';
import {
  blockSplit,
  blockSplitLine,
  coverageDetails,
  coverageHeadline,
  filterEntries,
  groupIssues,
  looksOffline,
  phaseLabel,
  playBlockers,
  progressFraction,
  sampleOf,
  splitNameProblems,
  validationSummary,
} from '../src/ui/import/model';
import {
  BEAR,
  BOTH_GAPS,
  COMMANDER,
  ENGINE_GAP,
  emptyReport,
  entry,
  LEGACY,
  playableReport,
  SEER,
  stored,
  UNBOUND,
} from './import-ui-fixtures';

describe('progress', () => {
  test('labels each phase and fills the bar from done and total', () => {
    expect(phaseLabel({ phase: 'resolving', done: 12, total: 99 })).toBe(
      'Resolving cards (12 of 99)',
    );
    expect(phaseLabel({ phase: 'parsing', done: 0, total: 0 })).toBe('Reading your list');
    expect(progressFraction({ phase: 'resolving', done: 25, total: 100 })).toBe(0.25);
    expect(progressFraction({ phase: 'resolving', done: 0, total: 0 })).toBe(0);
    expect(progressFraction({ phase: 'done', done: 0, total: 0 })).toBe(1);
  });
});

describe('coverage', () => {
  test('the headline counts copies and the details give distinct and nonbasic numbers', () => {
    const report = playableReport();
    // Commander, 2 bears and 36 plains are supported; the seer is not.
    expect(coverageHeadline(report.coverage)).toBe('39 of 40 cards supported');
    const details = coverageDetails(report.coverage);
    expect(details[0]).toBe('3 of 4 distinct cards supported');
    expect(details[2]).toContain(`${report.coverage.percentNonbasic}%`);
    expect(coverageHeadline(emptyReport().coverage)).toBe('0 of 0 cards supported');
  });

  test('the filter keeps unsupported cards only, commanders first, sorted by name', () => {
    const report = playableReport();
    const all = filterEntries(report.entries, 'all').map((e) => e.card.stored.name);
    expect(all).toEqual([
      'SYNTHETIC Leader, the Test',
      'SYNTHETIC Bear',
      'SYNTHETIC Plains',
      'SYNTHETIC Seer',
    ]);
    expect(filterEntries(report.entries, 'unsupported').map((e) => e.card.stored.name)).toEqual([
      'SYNTHETIC Seer',
    ]);
    // The input is not reordered.
    expect(report.entries[0]?.card.stored.name).toBe('SYNTHETIC Leader, the Test');
  });
});

describe('highlightFace', () => {
  const seerFace = SEER.stored.faces[0];

  test('the seer really is unsupported with its second ability unparsed', () => {
    expect(SEER.support.status).toBe('unsupported');
    expect(SEER.support.unparsed.map((u) => u.ability)).toEqual([1]);
  });

  test('marks the unparsed ability line and leaves understood lines alone', () => {
    if (seerFace === undefined) throw new Error('no face');
    const out = highlightFace(seerFace, 0, SEER.support.unparsed);
    expect(out.notLocated).toEqual([]);
    expect(out.lines.map((l) => [l.text, l.understood])).toEqual([
      ['Flying (This creature can only be blocked by creatures with flying.)', true],
      ['When SYNTHETIC Seer enters, venture into the dungeon.', false],
    ]);
  });

  test('a diagnostic whose text is not in the card is listed, not guessed at', () => {
    if (seerFace === undefined) throw new Error('no face');
    const bogus = [
      { face: 0, ability: 1, text: 'Something else entirely', stoppedAt: '', closestRule: 'x' },
    ];
    const out = highlightFace(seerFace, 0, bogus);
    expect(out.notLocated).toHaveLength(1);
    expect(out.lines.every((l) => l.understood)).toBe(true);
  });

  test('bullet lines belong to the ability above them and a face filter applies', () => {
    const modal = stored({
      name: 'SYNTHETIC Charm',
      typeLine: 'Instant',
      oracleText: 'Choose one —\n• Draw a card.\n• Gain 3 life.\nFlash',
    });
    const f = modal.faces[0];
    if (f === undefined) throw new Error('no face');
    const unparsed = [
      {
        face: 0,
        ability: 0,
        text: 'Choose one —\n• Draw a card.\n• Gain 3 life.',
        stoppedAt: 'Choose',
        closestRule: 'x',
      },
      { face: 1, ability: 0, text: 'Other face', stoppedAt: '', closestRule: 'x' },
    ];
    const out = highlightFace(f, 0, unparsed);
    expect(out.lines.map((l) => l.understood)).toEqual([false, false, false, true]);
    expect(out.notLocated).toEqual([]);
  });

  test('self references written with the name or "this creature" still line up', () => {
    const card = stored({
      name: 'SYNTHETIC Hound, Loyal',
      typeLine: 'Legendary Creature — Dog',
      oracleText: 'Whenever SYNTHETIC Hound attacks, this creature gets +1/+1.',
    });
    const f = card.faces[0];
    if (f === undefined) throw new Error('no face');
    const unparsed = [
      {
        face: 0,
        ability: 0,
        text: 'Whenever ~ attacks, ~ gets +1/+1.',
        stoppedAt: 'Whenever',
        closestRule: 'x',
      },
    ];
    expect(highlightFace(f, 0, unparsed).lines[0]?.understood).toBe(false);
  });
});

describe('validation', () => {
  const validation = {
    ok: false,
    issues: [
      { severity: 'info' as const, code: 'i', message: 'Info one', cards: [] },
      { severity: 'error' as const, code: 'e', message: 'Error one', cards: ['A'] },
      { severity: 'warning' as const, code: 'w', message: 'Warn one', cards: [] },
      { severity: 'error' as const, code: 'e2', message: 'Error two', cards: [] },
    ],
  };

  test('groups by severity, errors first, and skips empty groups', () => {
    const groups = groupIssues(validation);
    expect(groups.map((g) => [g.severity, g.issues.length])).toEqual([
      ['error', 2],
      ['warning', 1],
      ['info', 1],
    ]);
    expect(groupIssues({ ok: true, issues: [] })).toEqual([]);
  });

  test('says the state in words', () => {
    expect(validationSummary(validation)).toBe('Deck is not valid: 2 errors.');
    expect(validationSummary({ ok: true, issues: [] })).toBe(
      'Deck is valid: no errors, no warnings.',
    );
    expect(
      validationSummary({
        ok: true,
        issues: [{ severity: 'warning', code: 'w', message: '', cards: [] }],
      }),
    ).toBe('Deck is valid, with 1 warning.');
  });
});

describe('name problems and play blockers', () => {
  const problems = [
    { name: 'A', count: 1, line: 3, reason: 'not-found' },
    { name: 'B', count: 1, line: 4, reason: 'network down' },
  ];

  test('separates not-found names from failures and detects an offline import', () => {
    const split = splitNameProblems(problems);
    expect(split.notFound.map((p) => p.name)).toEqual(['A']);
    expect(split.failures.map((p) => p.name)).toEqual(['B']);
    expect(looksOffline(emptyReport({ notFound: problems }))).toBe(true);
    expect(looksOffline(playableReport({ notFound: problems }))).toBe(false);
  });

  test('a playable report has no blockers; others say why in words', () => {
    expect(playBlockers(playableReport())).toEqual([]);
    const blocked = emptyReport({
      notFound: problems,
      fuzzy: [{ requested: 'x', candidate: BEAR.stored, count: 1 }],
    });
    const lines = playBlockers(blocked);
    expect(lines).toContain('2 names could not be resolved.');
    expect(lines).toContain('1 close match still need your answer.');
    expect(lines).toContain('No commander is chosen yet.');
  });
});

describe('sample', () => {
  test('is the real list of the first installed precon, and nothing when none is installed', () => {
    expect(sampleOf([])).toBeNull();
    const first = { name: 'SYNTHETIC one', decklist: 'Commander\n1 X\n' };
    expect(sampleOf([first, { name: 'SYNTHETIC two', decklist: 'y' }])).toEqual({
      name: 'SYNTHETIC one',
      text: 'Commander\n1 X\n',
    });
  });
});

describe('entries', () => {
  test('entry helper keeps counts', () => {
    expect(entry(BEAR, 3).count).toBe(3);
  });
});

describe('diagnostics v2 in words', () => {
  const first = (card: typeof SEER) => {
    const u = card.support.unparsed[0];
    if (u === undefined) throw new Error('no unparsed ability');
    return u;
  };

  test('the fixtures carry the reasons they are named for', () => {
    expect(first(SEER).reason).toBe('unrecognised');
    expect(first(ENGINE_GAP).reason).toBe('notRunnable');
    expect(first(UNBOUND).reason).toBe('unboundReference');
    expect(BOTH_GAPS.support.unparsed.map((u) => u.reason)).toEqual([
      'notRunnable',
      'unrecognised',
    ]);
  });

  test('each reason has its own plain statement', () => {
    expect(reasonStatement(first(SEER))).toBe('The grammar does not read this wording yet.');
    expect(reasonStatement(first(ENGINE_GAP))).toMatch(
      /^The grammar reads this, but the engine cannot run it yet: needs token: Blood\.$/,
    );
    expect(reasonStatement(first(UNBOUND))).toBe(
      "The grammar could not tell what 'those cards' refers to.",
    );
    expect(reasonStatement(first(LEGACY))).toBeNull();
  });

  test('features read "<dimension>: <value>" and the secondary detail names slot and rules', () => {
    expect(formatFeature('effect:createToken')).toBe('effect: createToken');
    // Since parser stage P1 the trigger is read and the effect ("venture into the dungeon") is what stops it.
    expect(reasonDetails(first(SEER))).toEqual([
      'Kind of phrase being read: effect.',
      'Rules that matched before it stopped: trigger.enters.',
    ]);
    expect(reasonDetails(first(UNBOUND))).toEqual([
      'Rules that matched before it stopped: effect.exile, noun.target-permanent.',
    ]);
  });
});

describe('blockSplit', () => {
  const e = (card: typeof SEER) => entry(card);

  test('grammar-only, engine-only and both are told apart by the reason of each ability', () => {
    // SEER: unrecognised. UNBOUND: unboundReference (also the grammar). ENGINE_GAP: notRunnable.
    expect(blockSplit([e(SEER), e(UNBOUND), e(ENGINE_GAP), e(BOTH_GAPS)])).toEqual({
      grammarOnly: 2,
      engineOnly: 1,
      both: 1,
      other: 0,
    });
  });

  test('supported cards are ignored; a card with no classifiable ability is "other"', () => {
    const layout = {
      ...SEER,
      support: { ...SEER.support, unparsed: [], reasons: ['layout saga is not supported'] },
    };
    expect(blockSplit([e(BEAR), e(COMMANDER), e(layout), e(LEGACY)])).toEqual({
      grammarOnly: 0,
      engineOnly: 0,
      both: 0,
      other: 2,
    });
    expect(blockSplit([])).toEqual({ grammarOnly: 0, engineOnly: 0, both: 0, other: 0 });
  });

  test('the sentence adds up to the unsupported cards and is null when there are none', () => {
    expect(blockSplitLine(blockSplit([e(SEER), e(ENGINE_GAP), e(BOTH_GAPS)]))).toBe(
      'Of 3 unsupported cards: 1 blocked only by the grammar, 1 blocked only by the engine, 1 blocked by both.',
    );
    expect(blockSplitLine(blockSplit([e(LEGACY)]))).toBe(
      'Of 1 unsupported card: 0 blocked only by the grammar, 0 blocked only by the engine, 0 blocked by both, 1 for another reason.',
    );
    expect(blockSplitLine(blockSplit([e(BEAR)]))).toBeNull();
  });
});
