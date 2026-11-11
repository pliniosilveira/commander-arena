// Stage P5 (D-063, D-083), part 2: the Prowess keyword line, the pronoun "it" in triggers and in
// spells, and the dash forms of Cycling and Equip with a final period. Lines come from the
// backlog (reports/backlog.md and templates.json, counts as printed, parser version 4) or say
// SYNTHETIC; nothing here is a real card's text except where a note says so.
import { GRANTABLE_KEYWORDS as ENGINE_GRANTABLE } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { bind, compileLine, readLine } from '../src/convert/parser/index';
import {
  GRANTABLE_KEYWORDS,
  isGrantable,
  keywordKind,
  SIMPLE_KEYWORDS,
} from '../src/convert/parser/rules/keyword/vocabulary';
import {
  CREATURE_TARGET,
  dropped,
  END,
  fixture,
  grant,
  pump,
  read,
  readAll,
  SET,
  T1,
  THIS,
} from './parser-p5-helpers';

const prowess = { kind: 'keyword', keyword: { kind: 'prowess' } } as const;

describe('keyword.line reads Prowess (CR 702.108a)', () => {
  test('equals SYNTHETIC Prowess Adept', () => {
    expect(readAll('Prowess', 'creature').abilities).toEqual(
      fixture('SYNTHETIC Prowess Adept').abilities,
    );
  });

  test('the reminder text is stripped before reading', () => {
    const parsed = readAll(
      'Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)',
      'creature',
    );
    expect(parsed.lines).toEqual(['Prowess']);
    expect(parsed.abilities).toEqual([prowess]);
  });

  test('with other keywords, and twice (each instance triggers separately, CR 702.108b)', () => {
    expect(readAll('Flying, prowess', 'creature').abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      prowess,
    ]);
    expect(readAll('Prowess, prowess', 'creature').abilities).toEqual([prowess, prowess]);
  });

  test('lowers through keyword.line with the keyword feature the engine runs', () => {
    expect(compileLine('Prowess', { rules: SET, face: 'permanent' })).toMatchObject({
      ok: true,
      kind: 'abilities',
      ruleId: 'keyword.line',
    });
  });

  test('a word that only starts like it is not read', () => {
    expect(dropped('Prowessx', 'creature').reason).toBe('unrecognised');
  });

  test('"Equipped creature has prowess." is read since D-149: a granted prowess is expanded by the engine', () => {
    expect(read('Equipped creature has prowess.', 'artifact', ['Equipment']).unparsed).toEqual([]);
  });
});

describe('the vocabulary and the engine agree on what can be granted', () => {
  test('prowess is a keyword the grammar knows and can grant since D-149', () => {
    expect(keywordKind('prowess')).toBe('prowess');
    expect(SIMPLE_KEYWORDS.map(([word]) => word)).toContain('prowess');
    expect(isGrantable('prowess')).toBe(true);
    expect(GRANTABLE_KEYWORDS.map(([word]) => word)).toContain('prowess');
  });

  test('the grantable words are exactly the engine list (no copy kept here)', () => {
    expect(GRANTABLE_KEYWORDS.map(([, kind]) => kind).sort()).toEqual([...ENGINE_GRANTABLE].sort());
    for (const [, kind] of SIMPLE_KEYWORDS) {
      expect(isGrantable(kind), kind).toBe(ENGINE_GRANTABLE.includes(kind));
    }
  });

  test('flash, the keyword with no grant, is not a word of "gains"', () => {
    expect(dropped('Target creature gains flash until end of turn.').reason).toBe('unrecognised');
  });
});

describe('the pronoun "it" in a trigger about ~ is ~ (D-082 follow-up)', () => {
  const counters = (count: number) => ({
    kind: 'addCounters',
    objects: THIS,
    counter: '+1/+1',
    count,
  });

  test('"When ~ enters, put two +1/+1 counters on it." is the same as naming ~', () => {
    const viaIt = readAll('When ~ enters, put two +1/+1 counters on it.', 'creature').abilities;
    const viaName = readAll('When ~ enters, put two +1/+1 counters on ~.', 'creature').abilities;
    expect(viaIt).toEqual(viaName);
    expect(viaIt).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: counters(2),
      },
    ]);
  });

  test('"Whenever ~ attacks, it gets +1/+0 until end of turn." is the same as naming ~', () => {
    const viaIt = readAll('Whenever ~ attacks, it gets +1/+0 until end of turn.', 'creature');
    const viaName = readAll('Whenever ~ attacks, ~ gets +1/+0 until end of turn.', 'creature');
    expect(viaIt.abilities).toEqual(viaName.abilities);
    expect(viaIt.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: pump(1, 0, THIS),
      },
    ]);
  });

  test('"it gains haste" and "it gains first strike" in the same way', () => {
    expect(
      readAll('When ~ enters, it gains haste until end of turn.', 'creature').abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: grant('haste', THIS),
      },
    ]);
  });

  test('every event of "A or B" must be about ~', () => {
    const abilities = readAll(
      'Whenever ~ enters or attacks, put a +1/+1 counter on it.',
      'creature',
    ).abilities;
    expect(abilities).toHaveLength(2);
    for (const a of abilities) expect(a).toMatchObject({ kind: 'triggered', effect: counters(1) });
  });

  test('"becomes tapped" is about ~ too', () => {
    expect(
      readAll('Whenever ~ becomes tapped, it gets +1/+1 until end of turn.', 'creature').abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'becomesTapped', what: { kind: 'this' } },
        effect: pump(1, 1, THIS),
      },
    ]);
  });

  const SUBJECT = { kind: 'triggerSubject' } as const;
  const counterOn = (objects: object) => ({
    kind: 'addCounters',
    objects,
    counter: '+1/+1',
    count: 1,
  });

  test('after a non-self subject "it" is the trigger subject: the engine\'s `triggerSubject` (D-133)', () => {
    expect(
      readAll(
        'Whenever another creature you control enters, put a +1/+1 counter on it.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: { types: ['creature'], other: true, controller: 'you' },
        },
        effect: counterOn(SUBJECT),
      },
    ]);
    expect(
      readAll(
        'Whenever a creature you control attacks, it gets +1/+0 until end of turn.',
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { types: ['creature'], controller: 'you' } },
        effect: pump(1, 0, SUBJECT),
      },
    ]);
  });

  test('a mixed "A or B" with another subject is not about ~', () => {
    // Two subjects (trigger.or-subjects, stage P9): "it" is whichever one entered, the trigger's
    // subject, never ~: the same permanent for both abilities of the pair.
    const abilities = readAll(
      'Whenever ~ or another creature you control enters, put a +1/+1 counter on it.',
      'creature',
    ).abilities;
    expect(abilities).toHaveLength(2);
    for (const a of abilities) {
      expect(a).toMatchObject({ kind: 'triggered', effect: counterOn(SUBJECT) });
    }
  });

  test('"dies" is about ~ but "it" is then a card in the graveyard: not bound to ~', () => {
    // The permanent is gone when the ability resolves (CR 400.7): the engine finds nothing to put the counter on.
    expect(readAll('When ~ dies, put a +1/+1 counter on it.', 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'this' } },
        effect: counterOn(SUBJECT),
      },
    ]);
  });

  test('"that creature" is not read as a noun: after ~ or after another subject', () => {
    expect(
      dropped('When ~ enters, put a +1/+1 counter on that creature.', 'creature'),
    ).toMatchObject({
      reason: 'unrecognised',
      stoppedAt: 'that creature.',
    });
    expect(
      dropped(
        'Whenever another creature you control enters, put a +1/+1 counter on that creature.',
        'creature',
      ),
    ).toMatchObject({ reason: 'unrecognised', stoppedAt: 'that creature.' });
  });

  test('"it" with nothing before it is an unbound reference', () => {
    expect(dropped('It gains hexproof until end of turn.')).toMatchObject({
      reason: 'unboundReference',
    });
    expect(dropped('{T}: Put a +1/+1 counter on it.', 'creature')).toMatchObject({
      reason: 'unboundReference',
    });
  });
});

describe('"it" after a target or ~ in a spell or an activated ability', () => {
  test('the backlog shape of Snakeskin Veil: counter on a target, then "It gains hexproof"', () => {
    const parsed = readAll(
      'Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn.',
    );
    expect(parsed.spell?.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
        },
      },
    ]);
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'addCounters', objects: T1, counter: '+1/+1', count: 1 },
        grant('hexproof'),
      ],
    });
  });

  test('"it" is the most recent target, so one target is the same object throughout', () => {
    expect(
      readAll('Put a +1/+1 counter on target creature. It gets +2/+2 until end of turn.').spell
        ?.targets,
    ).toEqual([CREATURE_TARGET]);
  });

  test('"it" after ~ in an activated ability is ~', () => {
    expect(
      readAll('{T}: Put a +1/+1 counter on ~. It gains flying until end of turn.', 'creature')
        .abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'addCounters', objects: THIS, counter: '+1/+1', count: 1 },
            grant('flying', THIS),
          ],
        },
      },
    ]);
  });

  test('after "each creature" the pronoun means one of them, which the engine cannot name back', () => {
    // "each" is read as one mention (m1) that "it" follows; the engine has no reference to it.
    expect(
      dropped(
        'Put a +1/+1 counter on each creature you control. It gains flying until end of turn.',
      ),
    ).toMatchObject({ reason: 'notRunnable', needs: ['selector:bound'] });
  });

  test('"it" is not a damage recipient or a destroy operand (no rule reads it there)', () => {
    expect(dropped('Destroy target creature. Destroy it.').reason).toBe('unrecognised');
    expect(dropped('~ deals 2 damage to target creature. ~ deals 1 damage to it.').reason).toBe(
      'unrecognised',
    );
  });

  test('"it deals 4 damage" keeps its own rule (effect.damage-it)', () => {
    expect(
      read(
        'Kicker {2}\n~ deals 2 damage to target creature. If ~ was kicked, it deals 4 damage instead.',
      ).unparsed,
    ).toEqual([]);
  });
});

describe('the dash forms of Cycling and Equip end with a period (F)', () => {
  const cycling = (cost: object) => ({ kind: 'keyword', keyword: { kind: 'cycling', cost } });
  const equip = (cost: object) => ({ kind: 'keyword', keyword: { kind: 'equip', cost } });
  const life = [{ kind: 'payLife', amount: 2 }];

  test.each([
    ['Cycling—Pay 2 life.', cycling(life)],
    ['Cycling—Pay 2 life', cycling(life)],
  ] as const)('%s', (text, expected) => {
    expect(readAll(text, 'creature').abilities).toEqual([expected]);
  });

  test.each([
    ['Equip—Pay 2 life.', equip(life)],
    ['Equip—Pay 2 life', equip(life)],
  ] as const)('%s', (text, expected) => {
    expect(readAll(text, 'artifact', ['Equipment']).abilities).toEqual([expected]);
  });

  test('the plain form takes no period, as before', () => {
    expect(dropped('Cycling {2}.', 'creature').reason).toBe('unrecognised');
    expect(dropped('Equip {2}.', 'artifact', ['Equipment']).reason).toBe('unrecognised');
  });

  test('a second period and a zero payment are still unread', () => {
    expect(dropped('Cycling—Pay 2 life..', 'creature').reason).toBe('unrecognised');
    expect(dropped('Equip—Pay 0 life.', 'artifact', ['Equipment']).reason).toBe('unrecognised');
  });

  test('the same words as the Kicker and Flashback dash forms (keyword.kicker keeps its period)', () => {
    expect(readAll('Kicker—Pay 3 life.', 'sorcery').abilities).toEqual(
      readAll('Kicker—Pay 3 life', 'sorcery').abilities,
    );
  });
});

describe('the pump and gain rules do not step on each other', () => {
  test('the plain pump is still read by effect.pump alone', () => {
    const r = compileLine('Target creature gets +1/+1 until end of turn.', {
      rules: SET,
      face: 'spell',
    });
    expect(r).toMatchObject({ ok: true, kind: 'spell' });
    if (r.ok) expect(r.recognised).toContain('effect.pump');
  });

  test('a pump with a keyword is read by the gain rule', () => {
    const r = compileLine('Target creature gets +1/+1 and gains flying until end of turn.', {
      rules: SET,
      face: 'spell',
    });
    expect(r).toMatchObject({ ok: true, kind: 'spell' });
    if (r.ok) {
      expect(r.recognised).toContain('effect.gain-keyword');
      expect(r.recognised).not.toContain('effect.pump');
    }
  });

  test('the duration of a keyword gain is the one the engine runs', () => {
    expect(END).toBe('untilEndOfTurn');
  });
});

describe('the binding pass: what "it" means in a trigger body (ir/bind.ts)', () => {
  /** The object of the first clause of a triggered ability's body, after binding. */
  function objectOf(text: string) {
    const read = readLine(text, 'permanent', SET);
    if (!read.ok) throw new Error(`"${text}" was not read`);
    const [ability] = read.abilities;
    if (ability === undefined) throw new Error('no ability');
    const result = bind(ability);
    if (!result.ok || result.ability.kind !== 'triggered') throw new Error('not bound');
    const clause = result.ability.body.sentences[0]?.clauses[0];
    return clause?.args.objects;
  }

  test('a trigger about ~ alone: "it" is ~ (ref self)', () => {
    expect(objectOf('When ~ enters, put a +1/+1 counter on it.')).toMatchObject({
      det: 'anaphor',
      ref: 'self',
    });
    expect(objectOf('Whenever ~ enters or attacks, put a +1/+1 counter on it.')).toMatchObject({
      det: 'anaphor',
      ref: 'self',
    });
    expect(objectOf('Whenever ~ becomes tapped, put a +1/+1 counter on it.')).toMatchObject({
      ref: 'self',
    });
  });

  test('a trigger about another object: "it" is the trigger subject (ref trig)', () => {
    expect(
      objectOf('Whenever another creature you control enters, put a +1/+1 counter on it.'),
    ).toMatchObject({ det: 'triggerSubject', ref: 'trig' });
  });

  test('"dies": ~ is a new object in a graveyard, so "it" stays the trigger subject', () => {
    expect(objectOf('When ~ dies, put a +1/+1 counter on it.')).toMatchObject({
      det: 'triggerSubject',
      ref: 'trig',
    });
  });
});
