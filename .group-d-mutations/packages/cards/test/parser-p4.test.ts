// Stage P4 (D-063, D-079): Kicker, Flashback, "if ~ was kicked", the intervening "if" of a
// triggered ability (CR 603.4), the host type of an attached subject, and Food and Clue. Each line
// is read through the whole pipeline and compared with the AST of the engine's SYNTHETIC fixtures
// (synthetic-kicker.ts, synthetic-followups.ts) or with a node written out here. Lines come from
// the backlog (reports/backlog.md, numbers as printed) or say SYNTHETIC. Nothing here is a real
// card.
import {
  type Ability,
  type Cost,
  syntheticCard as engineSynthetic,
  isFeatureSupported,
  type SpellText,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  ALL_RULES,
  buildRuleSet,
  compileLine,
  DECLARED_NEEDS,
  DEFAULT_RULES,
  DEFAULT_SPELL_RULES,
  parseFaceText,
  segment,
} from '../src/convert/parser/index';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { mana } from './parser-p3-helpers';

const OPTS = { name: 'SYNTHETIC Card', legendary: false };
const SET = buildRuleSet(ALL_RULES);

type FaceType = 'instant' | 'sorcery' | 'creature' | 'enchantment';

/** One face of the given type through the grammar, with the spell rules on an instant or sorcery. */
function read(text: string, type: FaceType = 'sorcery', subtypes: readonly string[] = []) {
  const isSpell = type === 'instant' || type === 'sorcery';
  return parseFaceText(
    text,
    OPTS,
    0,
    DEFAULT_RULES,
    isSpell ? DEFAULT_SPELL_RULES : [],
    [type],
    subtypes,
  );
}

/** The face read completely: no ability left over. */
function readAll(text: string, type: FaceType = 'sorcery', subtypes: readonly string[] = []) {
  const parsed = read(text, type, subtypes);
  expect(parsed.unparsed, `"${text}"`).toEqual([]);
  return parsed;
}

/** The first dropped ability of a face that did not read. */
function dropped(text: string, type: FaceType = 'sorcery', subtypes: readonly string[] = []) {
  const parsed = read(text, type, subtypes);
  const [first] = parsed.unparsed;
  if (first === undefined) throw new Error(`"${text}" was read`);
  return first;
}

const fixture = (name: string) => {
  const face = engineSynthetic(name).faces[0];
  if (face === undefined) throw new Error(`no fixture ${name}`);
  return face;
};

const kicker = (...cost: Cost[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'kicker', cost },
});
const flashback = (...cost: Cost[]): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'flashback', cost },
});

describe('keyword.kicker: "Kicker {M}" and "Kicker—Pay N life" (CR 702.33a)', () => {
  test.each([
    ['Kicker {2}', kicker(mana('2'))],
    ['Kicker {G}', kicker(mana('G'))],
    ['Kicker {1}{B}', kicker(mana('1', 'B'))],
    ['Kicker—Pay 3 life', kicker({ kind: 'payLife', amount: 3 })],
    ['Kicker—Pay 3 life.', kicker({ kind: 'payLife', amount: 3 })],
  ] as const)('%s', (text, expected) => {
    expect(readAll(text).abilities).toEqual([expected]);
  });

  test('the reminder text is stripped before reading', () => {
    const parsed = readAll(
      'Kicker {1}{B} (You may pay an additional {1}{B} as you cast this spell.)',
    );
    expect(parsed.lines).toEqual(['Kicker {1}{B}']);
    expect(parsed.abilities).toEqual([kicker(mana('1', 'B'))]);
  });

  test('lowers with the keyword and its cost as the features it needs', () => {
    const result = compileLine('Kicker {1}{B}', { rules: SET, face: 'spell' });
    expect(result).toMatchObject({ ok: true, kind: 'abilities', ruleId: 'keyword.kicker' });
    // A life cost names its own feature.
    const life = compileLine('Kicker—Pay 3 life', { rules: SET, face: 'spell' });
    expect(life).toMatchObject({ ok: true, kind: 'abilities', ruleId: 'keyword.kicker' });
  });

  test('Multikicker (CR 702.33c) is a keyword the engine runs since D-110 (stage P17)', () => {
    expect(readAll('Multikicker {2}').abilities).toEqual([
      {
        kind: 'keyword',
        keyword: { kind: 'multikicker', cost: [{ kind: 'mana', symbols: ['2'] }] },
      },
    ]);
  });

  test('"Kicker {A} and/or {B}" (CR 702.33b: two kicker costs) is read and refused', () => {
    expect(dropped('Kicker {W} and/or {B}')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'keyword.kicker-and-or',
      stoppedAt: 'Kicker {W} and/or {B}',
    });
  });

  test('a cost the engine does not pay for kicker is read and refused, naming the rule', () => {
    expect(dropped('Kicker—Sacrifice a creature')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'keyword.kicker',
      recognised: expect.arrayContaining(['keyword.kicker', 'cost.sacrifice']),
    });
  });

  test('X and hybrid costs are not read', () => {
    expect(dropped('Kicker {X}')).toMatchObject({ reason: 'unrecognised', stoppedAt: '{X}' });
    expect(dropped('Kicker {W/U}')).toMatchObject({ reason: 'unrecognised', stoppedAt: '{W/U}' });
  });

  test('the segmenter keeps it a plain line', () => {
    expect(segment('Kicker {2}', 'spell').head).toBe('other');
    expect(segment('Kicker—Pay 3 life', 'spell').head).toBe('other');
  });
});

describe('the features stage P4 names', () => {
  test('are declared by a lowering and run by the engine', () => {
    for (const ref of [
      'keyword:kicker',
      'keyword:flashback',
      'cost:mana',
      'cost:payLife',
      'condition:kicked',
      'effect:conditional',
      'trigger:interveningIf',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
      expect(isFeatureSupported(ref), ref).toBe(true);
    }
  });
});

describe('keyword.flashback: "Flashback {M}" (CR 702.34a)', () => {
  test('the reminder text is stripped before reading', () => {
    const parsed = readAll(
      'Flashback {2}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)',
      'instant',
    );
    expect(parsed.lines).toEqual(['Flashback {2}{B}']);
    expect(parsed.abilities).toEqual([flashback(mana('2', 'B'))]);
  });

  test.each([
    ['Flashback {2}{B}', flashback(mana('2', 'B'))],
    ['Flashback {4}{U}', flashback(mana('4', 'U'))],
    ['Flashback {W}', flashback(mana('W'))],
  ] as const)('%s', (text, expected) => {
    expect(readAll(text, 'instant').abilities).toEqual([expected]);
  });

  test('on the instants and sorceries of the fixtures', () => {
    const slay = readAll('Destroy target creature.\nFlashback {2}{B}', 'instant');
    expect(slay.abilities).toEqual(fixture('SYNTHETIC Flash Slay').abilities);
    expect(slay.spell).toEqual(fixture('SYNTHETIC Flash Slay').spell);
    const study = readAll('Draw a card.\nFlashback {4}{U}');
    expect(study.abilities).toEqual(fixture('SYNTHETIC Flash Study').abilities);
    expect(study.spell).toEqual(fixture('SYNTHETIC Flash Study').spell);
  });

  test('a flashback cost that is not mana is read and refused, naming the rule', () => {
    expect(dropped('Flashback—Pay 3 life', 'instant')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'keyword.flashback',
      recognised: expect.arrayContaining(['keyword.flashback', 'cost.pay-life']),
    });
    expect(dropped('Flashback—{1}{U}, Pay 3 life.', 'sorcery')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'keyword.flashback',
    });
    // The backlog's real text: the dash form ends with a period.
    expect(dropped('Flashback—Sacrifice three creatures.', 'sorcery')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'keyword.flashback',
      stoppedAt: 'Flashback—Sacrifice three creatures.',
    });
    expect(dropped('Flashback—Sacrifice a creature', 'sorcery')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'keyword.flashback',
    });
  });

  test('X and hybrid costs are not read', () => {
    expect(dropped('Flashback {X}{R}', 'sorcery')).toMatchObject({ reason: 'unrecognised' });
    expect(dropped('Flashback {W/U}', 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });

  test('on a permanent it lowers and the engine says why it cannot be (CR 702.34a)', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Flash Bear',
        manaCost: '{1}{G}',
        typeLine: 'Creature — Bear',
        oracleText: 'Flashback {2}{G}',
        power: '2',
        toughness: '2',
        colors: ['G'],
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain(
      'flashback is on an instant or a sorcery (CR 702.34a)',
    );
  });
});

describe('"If ~ was kicked, ..." in the text of a spell (CR 702.33d, 608.2c)', () => {
  test('a second sentence the kicked spell adds: SYNTHETIC Kicker Gain', () => {
    const parsed = readAll('Kicker {1}\nYou gain 2 life. If ~ was kicked, draw a card.', 'instant');
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Kicker Gain').abilities);
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Kicker Gain').spell);
  });

  test('a life cost for kicker: SYNTHETIC Life Kicker', () => {
    const parsed = readAll('Kicker—Pay 3 life\nDraw a card. If ~ was kicked, draw two cards.');
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Life Kicker').abilities);
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Life Kicker').spell);
  });

  test('"it deals N damage instead" merges the pair into one conditional: SYNTHETIC Kicker Bolt', () => {
    const parsed = readAll(
      'Kicker {2}\n~ deals 2 damage to target creature. If ~ was kicked, it deals 4 damage instead.',
    );
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Kicker Bolt').abilities);
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Kicker Bolt').spell);
  });

  test('the same with another recipient and with flashback: SYNTHETIC Kick Flash', () => {
    const parsed = readAll(
      'Kicker {1}\n~ deals 1 damage to each opponent. If ~ was kicked, it deals 3 damage instead.\nFlashback {2}{R}',
    );
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Kick Flash').abilities);
    expect(parsed.spell).toEqual(fixture('SYNTHETIC Kick Flash').spell);
  });

  test('a full sentence with "instead" replaces the single instruction before it', () => {
    const parsed = readAll(
      'Kicker {3}\nDraw a card. If ~ was kicked, you gain 4 life instead.',
      'sorcery',
    );
    const expected: SpellText = {
      effect: {
        kind: 'conditional',
        condition: { kind: 'kicked' },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 4 },
        else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    };
    expect(parsed.spell).toEqual(expected);
  });

  test('only the sentence directly before is replaced: an earlier one stays unconditional', () => {
    const parsed = readAll(
      'Kicker {3}\nYou gain 1 life. Draw a card. If ~ was kicked, draw three cards instead.',
    );
    const effect = parsed.spell?.effect;
    expect(effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
        {
          kind: 'conditional',
          condition: { kind: 'kicked' },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 3 },
          else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    });
  });

  test('a condition that holds back several clauses of one sentence', () => {
    const parsed = readAll(
      'Kicker {2}\nDraw a card. If ~ was kicked, you gain 2 life and draw a card.',
    );
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
        {
          kind: 'conditional',
          condition: { kind: 'kicked' },
          effect: {
            kind: 'sequence',
            effects: [
              { kind: 'gainLife', player: { kind: 'you' }, amount: 2 },
              { kind: 'draw', player: { kind: 'you' }, count: 1 },
            ],
          },
        },
      ],
    });
  });

  test('"instead" with nothing to replace is refused at the sentence', () => {
    expect(dropped('Kicker {2}\nIf ~ was kicked, draw a card instead.')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'effect.draw',
    });
  });

  test('"instead" after a sentence with two instructions is refused: it would drop one of them', () => {
    const first = read(
      'Kicker {2}\nYou gain 2 life and draw a card. If ~ was kicked, draw three cards instead.',
    ).unparsed.find((u) => u.text.startsWith('You gain'));
    expect(first).toMatchObject({ reason: 'notRunnable', closestRule: 'effect.draw' });
  });

  test('"it deals N damage" is read only as the instead of a damage sentence', () => {
    expect(dropped('It deals 2 damage.')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'effect.damage-it',
    });
    const afterDraw = read('Kicker {2}\nDraw a card. If ~ was kicked, it deals 4 damage instead.');
    expect(afterDraw.unparsed[0]).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'effect.damage-it',
    });
  });

  test('"instead" without a condition is not read', () => {
    expect(dropped('Draw a card instead.')).toMatchObject({
      reason: 'unrecognised',
      stoppedAt: 'instead.',
    });
  });

  test('conditions other than kicked are read at the start of a sentence only when they are tests of the game (stage P32)', () => {
    // A count of permanents is (D-147: the engine's `controlsAtLeast`); a test the grammar has no rule for is not.
    expect(readAll('If you control two or more creatures, draw a card.').spell?.effect).toEqual({
      kind: 'conditional',
      condition: { kind: 'controlsAtLeast', filter: { types: ['creature'] }, count: 2 },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    });
    expect(dropped('If you control a banana, draw a card.')).toMatchObject({
      reason: 'unrecognised',
    });
  });

  test("a target used only in the kicked sentence is the kicked spell's own slot (CR 702.33g, stage P38)", () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Kicked Target',
        manaCost: '{1}{B}',
        typeLine: 'Sorcery',
        oracleText: 'Kicker {2}\nDraw a card. If ~ was kicked, destroy target creature.',
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.spell?.targets).toMatchObject([
      { id: 't1', ifKicked: true },
    ]);
  });

  test('targets in different branches of an "instead" pair: each is chosen only in its own case (CR 702.33g, 601.2c)', () => {
    // t1 is only in the else branch (unkicked), t2 only in the then branch (kicked).
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Two Targets',
        manaCost: '{1}{R}',
        typeLine: 'Sorcery',
        oracleText:
          'Kicker {2}\n~ deals 2 damage to target creature. If ~ was kicked, ~ deals 4 damage to target player instead.',
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[0]?.spell?.targets).toMatchObject([
      { id: 't1', unlessKicked: true },
      { id: 't2', ifKicked: true },
    ]);
  });

  test('a target used only in the kicked sentence of a card with Multikicker is not run: the engine runs Kicker only', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Multi Target',
        manaCost: '{1}{B}',
        typeLine: 'Sorcery',
        oracleText: 'Multikicker {1}\nDraw a card. If ~ was kicked, destroy target creature.',
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain('not Multikicker (CR 702.33c, 702.33g)');
  });

  test('a kicked card without a kicker line is refused by the engine (CR 702.33d)', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC No Kicker',
        manaCost: '{1}{B}',
        typeLine: 'Sorcery',
        oracleText: 'Draw a card. If ~ was kicked, draw a card.',
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain('needs a kicker ability');
  });
});

describe('the intervening "if" of a triggered ability (CR 603.4)', () => {
  test('"When ~ enters, if it was kicked, ..." is an intervening if, not a conditional effect', () => {
    const parsed = readAll(
      'Kicker {2}\nWhen ~ enters, if it was kicked, put two +1/+1 counters on ~.',
      'creature',
    );
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Kicker Warden').abilities);
    // The effect is not wrapped: an unkicked creature must not trigger at all.
    expect(JSON.stringify(parsed.abilities)).not.toContain('conditional');
  });

  test('"if ~ was kicked" says the same', () => {
    const parsed = readAll(
      'Kicker {2}\nWhen ~ enters, if ~ was kicked, put two +1/+1 counters on ~.',
      'creature',
    );
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Kicker Warden').abilities);
  });

  test('the needs of the trigger, the condition and the effect are all declared', () => {
    const result = compileLine('When ~ enters, if it was kicked, put two +1/+1 counters on ~.', {
      rules: SET,
      face: 'permanent',
      faceTypes: ['creature'],
    });
    expect(result).toMatchObject({ ok: true, kind: 'abilities', ruleId: 'trigger.enters' });
    expect(result.ok && result.recognised).toEqual(
      expect.arrayContaining(['trigger.enters', 'condition.kicked', 'effect.add-counters']),
    );
  });

  test('"it was kicked" about another creature is refused: only ~ has a kicked status here', () => {
    expect(
      dropped(
        'Kicker {2}\nWhenever another creature you control enters, if it was kicked, you gain 1 life.',
        'creature',
      ),
    ).toMatchObject({ reason: 'notRunnable', closestRule: 'condition.kicked' });
  });

  test('a count of permanents: "if you control three or more artifacts" (backlog: 1 card)', () => {
    const parsed = readAll(
      'At the beginning of your upkeep, if you control three or more artifacts, you gain 1 life.',
      'enchantment',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        interveningIf: {
          kind: 'controlsAtLeast',
          filter: { types: ['artifact'] },
          count: 3,
        },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ]);
  });

  test('"if you have two or more opponents": SYNTHETIC Table Talker', () => {
    const parsed = readAll(
      'When ~ enters, if you have two or more opponents, draw a card.',
      'creature',
    );
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Table Talker').abilities);
  });

  test('"if you control no other creatures": SYNTHETIC Lone Wolf', () => {
    const parsed = readAll(
      'When ~ enters, if you control no other creatures, put a +1/+1 counter on ~.',
      'creature',
    );
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Lone Wolf').abilities);
  });

  test('on an attack trigger', () => {
    const parsed = readAll(
      'Whenever ~ attacks, if you control two or more other creatures, draw a card.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        interveningIf: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], other: true },
          count: 2,
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
  });

  test('"or" gives one ability per event, each with the condition', () => {
    const parsed = readAll(
      'Whenever ~ enters or attacks, if you control three or more artifacts, you gain 1 life.',
      'creature',
    );
    expect(parsed.abilities).toHaveLength(2);
    for (const ability of parsed.abilities) {
      expect(ability).toMatchObject({
        kind: 'triggered',
        interveningIf: { kind: 'controlsAtLeast' },
      });
    }
  });

  test('a condition that counts permanents on a dies trigger lowers; the engine names CR 603.10a', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Dying Counter',
        manaCost: '{1}{B}',
        typeLine: 'Creature — Zombie',
        oracleText: 'When ~ dies, if you control two or more creatures, draw a card.',
        power: '1',
        toughness: '1',
        colors: ['B'],
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain('CR 603.10a');
  });

  test('a condition that does not count permanents is fine on a dies trigger', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Dying Talker',
        manaCost: '{1}{B}',
        typeLine: 'Creature — Zombie',
        oracleText: 'When ~ dies, if you have two or more opponents, draw a card.',
        power: '1',
        toughness: '1',
        colors: ['B'],
      }),
    );
    expect(imported.support).toMatchObject({ status: 'supported', unparsed: [], reasons: [] });
  });

  test('conditions the grammar has no rule for stay unparsed at the condition', () => {
    expect(
      dropped(
        'When ~ enters, if you control a creature with power greater than 3, draw a card.',
        'creature',
      ),
    ).toMatchObject({ reason: 'unrecognised' });
    expect(dropped('When ~ enters, if you cast it, you gain 1 life.', 'creature')).toMatchObject({
      reason: 'unrecognised',
    });
  });

  test('a trigger with no condition after "if" is not an intervening if', () => {
    expect(dropped('When ~ enters, if able, you gain 1 life.', 'creature')).toMatchObject({
      reason: 'unrecognised',
    });
  });

  test('the intervening if does not leak into a body sentence: only kicked is read there', () => {
    const parsed = readAll(
      'Kicker {2}\nWhen ~ enters, draw a card. If ~ was kicked, draw three cards instead.',
      'creature',
    );
    expect(parsed.abilities[1]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: {
        kind: 'conditional',
        condition: { kind: 'kicked' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 3 },
        else: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    });
  });

  test('"you may" together with a kicked sentence is not lowered: the engine asks the whole effect', () => {
    expect(
      dropped(
        'Kicker {2}\nWhen ~ enters, if ~ was kicked, you may draw a card. If ~ was kicked, you may draw a card.',
        'creature',
      ),
    ).toMatchObject({ reason: 'notRunnable' });
  });
});

describe('"If ~ was kicked, it enters with ... counters" (a replacement, CR 614.1c)', () => {
  test('is read and refused: the engine has no conditional replacement', () => {
    expect(
      dropped('Kicker {2}\nIf ~ was kicked, it enters with two +1/+1 counters on it.', 'creature'),
    ).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'replacement.enters-with-counters-kicked',
      recognised: expect.arrayContaining(['condition.kicked']),
    });
  });

  test('the segmenter calls it a replacement', () => {
    expect(
      segment('If ~ was kicked, it enters with two +1/+1 counters on it.', 'permanent').head,
    ).toBe('replacement');
    expect(segment('If ~ was kicked, draw a card.', 'spell').head).toBe('other');
  });
});

describe('"if ~ was kicked" in a replacement that has a condition already', () => {
  test('"~ enters tapped unless ~ was kicked." is the engine\'s `entersTapped.unless` with `kicked`', () => {
    expect(readAll('~ enters tapped unless ~ was kicked.', 'creature').abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'entersTapped', unless: { kind: 'kicked' } } },
    ]);
  });
});

describe('the host type of an attached subject (CR 303.4m, 301.5a)', () => {
  const stat = (subject: object, effect: object): Ability =>
    ({ kind: 'static', static: { ...effect, subject } }) as Ability;
  const pt = (subject: object, power: number, toughness: number): Ability =>
    stat(subject, { kind: 'modifyPt', power, toughness });

  test.each([
    ['Enchanted creature gets +1/+1.', 'Aura', { kind: 'attached', types: ['creature'] }],
    ['Enchanted land gets +1/+1.', 'Aura', { kind: 'attached', types: ['land'] }],
    [
      'Enchanted legendary creature gets +1/+1.',
      'Aura',
      { kind: 'attached', types: ['creature'], supertypes: ['legendary'] },
    ],
    ['Enchanted permanent gets +1/+1.', 'Aura', { kind: 'attached' }],
    ['Equipped creature gets +1/+1.', 'Equipment', { kind: 'attached', types: ['creature'] }],
    [
      'Equipped legendary creature gets +1/+1.',
      'Equipment',
      { kind: 'attached', types: ['creature'], supertypes: ['legendary'] },
    ],
  ] as const)('%s', (text, subtype, subject) => {
    const parsed = readAll(text, 'enchantment', [subtype]);
    expect(parsed.abilities).toEqual([pt(subject, 1, 1)]);
  });

  test('the Auras of the engine fixtures, exactly', () => {
    const growth = readAll('Enchant permanent\nEnchanted creature gets +1/+1.', 'enchantment', [
      'Aura',
    ]);
    expect(growth.abilities).toEqual(fixture('SYNTHETIC Growth Aura').abilities);
    const ward = readAll(
      'Enchant permanent\nEnchanted land has hexproof.\nEnchanted creature gets +0/+1.',
      'enchantment',
      ['Aura'],
    );
    expect(ward.abilities).toEqual(fixture('SYNTHETIC Land Ward Aura').abilities);
    const legend = readAll(
      'Enchant permanent\nEnchanted legendary creature gets +2/+2.',
      'enchantment',
      ['Aura'],
    );
    expect(legend.abilities).toEqual(fixture('SYNTHETIC Legend Aura').abilities);
  });

  test('a grant carries the host type too', () => {
    const parsed = readAll('Enchanted land has hexproof.', 'enchantment', ['Aura']);
    expect(parsed.abilities).toEqual([
      stat(
        { kind: 'attached', types: ['land'] },
        { kind: 'grantKeyword', keyword: { kind: 'hexproof' } },
      ),
    ]);
  });

  test('a supertype with nothing to attach it to is not read', () => {
    expect(dropped('Enchanted legendary gets +1/+1.', 'enchantment', ['Aura'])).toMatchObject({
      reason: 'unrecognised',
    });
    expect(
      dropped('Equipped legendary land gets +1/+1.', 'enchantment', ['Equipment']),
    ).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('Food and Clue lower (CR 111.10b, 111.10f)', () => {
  test.each([
    ['Create a Food token.', 'Food'],
    ['Create a Clue token.', 'Clue'],
  ] as const)('%s', (text, preset) => {
    const parsed = readAll(text);
    expect(parsed.spell).toEqual({
      effect: { kind: 'createToken', token: { kind: 'preset', preset }, count: 1 },
    });
  });

  test('two of them, and in a trigger', () => {
    expect(readAll('Create two Clue tokens.').spell?.effect).toEqual({
      kind: 'createToken',
      token: { kind: 'preset', preset: 'Clue' },
      count: 2,
    });
    expect(readAll('When ~ enters, create a Food token.', 'creature').abilities).toEqual(
      fixture('SYNTHETIC Feast Scout').abilities,
    );
    expect(readAll('When ~ enters, create a Clue token.', 'creature').abilities).toEqual(
      fixture('SYNTHETIC Clue Scout').abilities,
    );
  });

  test('Map and Blood still need what the engine lacks', () => {
    expect(dropped('Create a Map token.')).toMatchObject({
      reason: 'notRunnable',
      needs: ['token:Map'],
    });
    expect(dropped('Create a Blood token.')).toMatchObject({
      reason: 'notRunnable',
      needs: ['token:Blood'],
    });
  });
});
