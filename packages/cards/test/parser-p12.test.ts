// Stage P12 (M6): the restrictions and evasion the engine runs since D-094 and D-098: "~ can't
// block", "~ can't be blocked", "~ attacks each combat if able", "~ doesn't untap during your untap
// step", "This spell can't be countered", the same for the permanent an Aura or Equipment is
// attached to and for a group, "target creature can't be blocked this turn" as an effect, and the
// landwalk keywords. Each line is read through the whole pipeline and compared with the engine AST
// written out here (the shapes `docs/MECHANICS.md` lists under "What the parser must produce"), and
// each near miss says where it stops. The lines are the real example lines of
// reports/template-replay.md (the owner's run) unless a note says SYNTHETIC; no real card is
// marked supported here. That the engine runs what is lowered is in
// convert-grammar-engine-p12.test.ts.
import type { Ability, Effect, StaticSubject } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { compileLine, DECLARED_NEEDS } from '../src/convert/parser/index';
import { dropped, readAll, SET, T1, THIS } from './parser-p5-helpers';

type Restriction =
  | 'cantBlock'
  | 'cantBeBlocked'
  | 'attacksEachCombat'
  | 'doesntUntap'
  | 'cantBeCountered';

const restriction = (subject: StaticSubject, kind: Restriction): Ability => ({
  kind: 'static',
  static: { kind: 'restriction', subject, restriction: kind },
});
const HOST = { kind: 'attached', types: ['creature'] } as const;
const OPPONENTS_CREATURES = {
  kind: 'filter',
  filter: { types: ['creature'], controller: 'opponent' },
} as const;
const keyword = (kind: 'shroud' | 'flying' | 'trample'): Ability => ({
  kind: 'static',
  static: { kind: 'grantKeyword', subject: HOST, keyword: { kind } },
});
const landwalk = (landType: string): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'landwalk', landType },
});
const kw = (kind: 'flying' | 'first strike' | 'haste' | 'trample'): Ability => ({
  kind: 'keyword',
  keyword: { kind: kind === 'first strike' ? 'firstStrike' : kind },
});

describe("static.self: what ~ can't do or must do (CR 509.1b, 508.1d, 502.3)", () => {
  test.each([
    ["~ can't block.", 'cantBlock'],
    ["~ can't be blocked.", 'cantBeBlocked'],
    ['~ attacks each combat if able.', 'attacksEachCombat'],
    ["~ doesn't untap during your untap step.", 'doesntUntap'],
    ["~ can't be countered.", 'cantBeCountered'],
  ] as const)('%s', (text, kind) => {
    expect(readAll(text, 'creature').abilities).toEqual([restriction(THIS, kind)]);
  });

  test('the card named in the text, and "this creature", are the same `~`', () => {
    expect(readAll("This creature can't be blocked.", 'creature').abilities).toEqual([
      restriction(THIS, 'cantBeBlocked'),
    ]);
  });

  test('"~ can\'t block and can\'t be blocked." is two static abilities in text order', () => {
    expect(readAll("~ can't block and can't be blocked.", 'creature').abilities).toEqual([
      restriction(THIS, 'cantBlock'),
      restriction(THIS, 'cantBeBlocked'),
    ]);
  });

  test('a restriction beside a requirement (SYNTHETIC)', () => {
    expect(readAll("~ attacks each combat if able and can't block.", 'creature').abilities).toEqual(
      [restriction(THIS, 'attacksEachCombat'), restriction(THIS, 'cantBlock')],
    );
  });

  test('the curly apostrophe of Oracle text reads like the straight one', () => {
    expect(readAll('~ can’t block.', 'creature').abilities).toEqual([
      restriction(THIS, 'cantBlock'),
    ]);
  });
});

describe('"This spell can\'t be countered." (CR 101.2, 113.6g)', () => {
  test('on an instant it is a static ability of the face, and the rest is the spell', () => {
    const parsed = readAll("This spell can't be countered.\nDestroy target creature.", 'instant');
    expect(parsed.abilities).toEqual([restriction(THIS, 'cantBeCountered')]);
    expect(parsed.spell?.effect).toEqual({ kind: 'destroy', objects: T1 });
  });

  test('on a sorcery, whichever line comes first', () => {
    const parsed = readAll("Destroy target creature.\nThis spell can't be countered.", 'sorcery');
    expect(parsed.abilities).toEqual([restriction(THIS, 'cantBeCountered')]);
    expect(parsed.spell?.effect).toEqual({ kind: 'destroy', objects: T1 });
  });

  test('on a creature spell it is "~ can\'t be countered." (the line of the replay)', () => {
    expect(readAll("~ can't be countered.", 'creature').abilities).toEqual([
      restriction(THIS, 'cantBeCountered'),
    ]);
  });

  test('an instant with no other line keeps no spell text', () => {
    const parsed = readAll("This spell can't be countered.", 'instant');
    expect(parsed.abilities).toEqual([restriction(THIS, 'cantBeCountered')]);
    expect(parsed.spell).toBeNull();
  });

  test('another spell line keeps the diagnostic it had', () => {
    // "It can't be regenerated" is the flag of the destroy before it since stage P21 (D-120); "this turn"
    // would say more than the flag does.
    expect(
      dropped("Destroy target creature. It can't be regenerated this turn.", 'instant'),
    ).toMatchObject({ reason: 'unrecognised', stoppedAt: 'this turn.' });
  });
});

describe('static.attached: what an Aura or Equipment says of its host (CR 604.4, 509.1b, 502.3)', () => {
  test.each([
    ["Equipped creature can't be blocked.", 'artifact', 'Equipment', [HOST, 'cantBeBlocked']],
    ["Enchanted creature can't be blocked.", 'enchantment', 'Aura', [HOST, 'cantBeBlocked']],
    ["Enchanted creature can't block.", 'enchantment', 'Aura', [HOST, 'cantBlock']],
    [
      'Enchanted creature attacks each combat if able.',
      'enchantment',
      'Aura',
      [HOST, 'attacksEachCombat'],
    ],
    [
      "Enchanted creature doesn't untap during its controller's untap step.",
      'enchantment',
      'Aura',
      [HOST, 'doesntUntap'],
    ],
  ] as const)('%s', (text, type, subtype, [subject, kind]) => {
    expect(readAll(text, type, [subtype]).abilities).toEqual([restriction(subject, kind)]);
  });

  test('a restriction and a grant, in either order (the line of the replay: 1 card)', () => {
    expect(
      readAll("Equipped creature can't be blocked and has shroud.", 'artifact', ['Equipment'])
        .abilities,
    ).toEqual([restriction(HOST, 'cantBeBlocked'), keyword('shroud')]);
    expect(
      readAll("Equipped creature has flying and can't be blocked.", 'artifact', ['Equipment'])
        .abilities,
    ).toEqual([keyword('flying'), restriction(HOST, 'cantBeBlocked')]);
  });

  test('a pump, a grant and a restriction: one engine ability each (SYNTHETIC)', () => {
    expect(
      readAll("Equipped creature gets +1/+0 and has trample and can't be blocked.", 'artifact', [
        'Equipment',
      ]).abilities,
    ).toEqual([
      { kind: 'static', static: { kind: 'modifyPt', subject: HOST, power: 1, toughness: 0 } },
      keyword('trample'),
      restriction(HOST, 'cantBeBlocked'),
    ]);
  });

  test('an Aura says "enchanted" and an Equipment "equipped": any other face is not lowered', () => {
    expect(dropped("Equipped creature can't be blocked.", 'creature')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'noun.attached-permanent',
      stoppedAt: "Equipped creature can't be blocked.",
    });
    expect(dropped("Enchanted creature can't block.", 'artifact', ['Equipment'])).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'noun.attached-permanent',
    });
  });

  test('a land host: "Enchanted land can\'t block" has no meaning, the word is the host type', () => {
    expect(readAll("Enchanted land can't be blocked.", 'enchantment', ['Aura']).abilities).toEqual([
      restriction({ kind: 'attached', types: ['land'] }, 'cantBeBlocked'),
    ]);
  });
});

describe('static.permanents: a group (CR 611.3a)', () => {
  test.each([
    ["Creatures your opponents control can't block.", OPPONENTS_CREATURES, 'cantBlock'],
    ["Creatures your opponents control can't be blocked.", OPPONENTS_CREATURES, 'cantBeBlocked'],
    [
      'Creatures your opponents control attack each combat if able.',
      OPPONENTS_CREATURES,
      'attacksEachCombat',
    ],
    [
      "Other creatures you control can't be blocked.",
      { kind: 'filter', filter: { types: ['creature'], controller: 'you' }, other: true },
      'cantBeBlocked',
    ],
  ] as const)('%s (SYNTHETIC)', (text, subject, kind) => {
    expect(readAll(text, 'enchantment').abilities).toEqual([restriction(subject, kind)]);
  });
});

describe('effect.restrict: "target creature can\'t be blocked this turn" (CR 509.1b, 611.2a, 613.11)', () => {
  const target = {
    id: 't1',
    what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
  } as const;
  const restrict = (kind: Restriction): Effect =>
    ({ kind: 'restrict', objects: T1, restriction: kind, duration: 'untilEndOfTurn' }) as Effect;

  test.each([
    ["Target creature can't be blocked this turn.", 'cantBeBlocked'],
    ["Target creature can't block this turn.", 'cantBlock'],
    ['Target creature attacks this turn if able.', 'attacksEachCombat'],
  ] as const)('as a spell: %s', (text, kind) => {
    const parsed = readAll(text, 'instant');
    expect(parsed.spell).toEqual({ targets: [target], effect: restrict(kind) });
    expect(parsed.abilities).toEqual([]);
  });

  test("Rogue's Passage: {4}, {T}: Target creature can't be blocked this turn. (replay: 6 cards)", () => {
    expect(
      readAll("{4}, {T}: Target creature can't be blocked this turn.", 'creature').abilities,
    ).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['4'] }, { kind: 'tap' }],
        targets: [target],
        effect: restrict('cantBeBlocked'),
      },
    ]);
  });

  test('as the effect of a trigger (SYNTHETIC)', () => {
    expect(
      readAll("Whenever ~ attacks, target creature can't block this turn.", 'creature').abilities,
    ).toMatchObject([{ kind: 'triggered', targets: [target], effect: restrict('cantBlock') }]);
  });

  test('"target creature you don\'t control" keeps its controller in the target (SYNTHETIC)', () => {
    expect(
      readAll("Target creature you don't control can't block this turn.", 'instant').spell,
    ).toMatchObject({
      targets: [{ what: { filter: { types: ['creature'], controller: 'opponent' } } }],
    });
  });

  test('joined to another instruction, each keeps its own target numbering (SYNTHETIC)', () => {
    const parsed = readAll("Target creature can't block this turn and draw a card.", 'instant');
    expect(parsed.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [restrict('cantBlock'), { kind: 'draw' }],
    });
  });
});

describe('landwalk (CR 702.14): a keyword with a land type', () => {
  test.each([
    ['Plainswalk', 'Plains'],
    ['Islandwalk', 'Island'],
    ['Swampwalk', 'Swamp'],
    ['Mountainwalk', 'Mountain'],
    ['Forestwalk', 'Forest'],
    ['Nonbasic landwalk', 'nonbasic'],
  ] as const)('%s', (text, landType) => {
    expect(readAll(text, 'creature').abilities).toEqual([landwalk(landType)]);
  });

  test('in a keyword line with other keywords, in text order', () => {
    expect(readAll('Flying, islandwalk', 'creature').abilities).toEqual([
      kw('flying'),
      landwalk('Island'),
    ]);
    expect(readAll('Swampwalk; first strike', 'creature').abilities).toEqual([
      landwalk('Swamp'),
      kw('first strike'),
    ]);
    expect(readAll('Haste, nonbasic landwalk, trample', 'creature').abilities).toEqual([
      kw('haste'),
      landwalk('nonbasic'),
      kw('trample'),
    ]);
  });

  test('a landwalk can be granted since D-1401 (CR 702.14a, 613.1f): the words are in the grant lists, by a static ability and by an effect', () => {
    const grant = (landType: string): Ability => ({
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: HOST,
        keyword: { kind: 'landwalk', landType },
      },
    });
    expect(
      readAll('Equipped creature has islandwalk.', 'artifact', ['Equipment']).abilities,
    ).toEqual([grant('Island')]);
    expect(
      readAll('Equipped creature has nonbasic landwalk.', 'artifact', ['Equipment']).abilities,
    ).toEqual([grant('nonbasic')]);
    expect(
      readAll('Target creature gains swampwalk until end of turn.', 'instant').spell?.effect,
    ).toMatchObject({
      kind: 'grantKeyword',
      keyword: { kind: 'landwalk', landType: 'Swamp' },
      duration: 'untilEndOfTurn',
    });
  });

  test('a landwalk that is not one of the six the engine knows is still not granted', () => {
    expect(
      dropped('Equipped creature has snow landwalk.', 'artifact', ['Equipment']),
    ).toMatchObject({
      reason: 'unrecognised',
      closestRule: 'static.attached',
    });
    expect(dropped('Equipped creature has desertwalk.', 'artifact', ['Equipment'])).toMatchObject({
      reason: 'unrecognised',
    });
  });

  test('snow, legendary and artifact landwalk, and a land type that is not a basic one, stay unread', () => {
    for (const text of ['Snow landwalk', 'Legendary landwalk', 'Artifact landwalk', 'Landwalk']) {
      expect(dropped(text, 'creature'), text).toMatchObject({ reason: 'unrecognised' });
    }
  });
});

describe('what stays unread, and where it stops', () => {
  test.each([
    // [text, type, subtypes, where it stops, the rule that was being read]
    [
      "~ can't be blocked except by creatures with flying.",
      'creature',
      [],
      'except by creatures with flying.',
      'static.self',
    ],
    [
      "~ can't be blocked by more than two creatures.",
      'creature',
      [],
      'by more than two creatures.',
      'static.self',
    ],
    [
      "~ can't block unless you control a Plains.",
      'creature',
      [],
      'unless you control a Plains.',
      'static.self',
    ],
    ["~ can't attack.", 'creature', [], "can't attack.", 'static.self'],
    [
      "Equipped creature can't be blocked except by creatures with flying.",
      'artifact',
      ['Equipment'],
      'except by creatures with flying.',
      'static.attached',
    ],
    [
      "Enchanted creature can't attack or block alone.",
      'enchantment',
      ['Aura'],
      'alone.',
      'static.attached',
    ],
    // Stage P40 (D-186): "Spells you control can't be countered." and "Creature spells you control can't be countered." are read by
    // `static.spells-cant-be-countered`; what stays unread is the spell's own words with another subject.
    [
      "Spells your opponents control can't be countered.",
      'enchantment',
      [],
      "Spells your opponents control can't be countered.",
      'none',
    ],
    [
      "Target creature can't be blocked this turn except by creatures with flying.",
      'instant',
      [],
      'except by creatures with flying.',
      'effect.restrict',
    ],
  ] as const)('%s', (text, type, subtypes, stoppedAt, closestRule) => {
    expect(dropped(text, type, subtypes)).toMatchObject({
      reason: 'unrecognised',
      stoppedAt,
      closestRule,
    });
  });
});

describe('what the lowerings declare they need', () => {
  test('the restriction features are declared, so the dimension test and the diagnostics know them', () => {
    for (const ref of [
      'static:restriction',
      'staticSubject:this',
      'staticSubject:attached',
      'staticSubject:filter',
      'effect:restrict',
      'duration:untilEndOfTurn',
      'keyword:landwalk',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });

  test('the old `static:cantBeBlocked` is gone: the engine runs `restriction` instead', () => {
    expect(DECLARED_NEEDS).not.toContain('static:cantBeBlocked');
  });

  test('every rule of this stage is recognised through the whole pipeline', () => {
    for (const [text, rule] of [
      ["~ can't block.", 'static.self'],
      ["Equipped creature can't be blocked.", 'static.attached'],
      ["Creatures your opponents control can't block.", 'static.permanents'],
      ["Target creature can't block this turn.", 'effect.restrict'],
      ['Islandwalk', 'keyword.line'],
    ] as const) {
      const result = compileLine(text, {
        rules: SET,
        face: text.startsWith('Target') ? 'spell' : 'permanent',
      });
      const recognised = result.ok ? result.recognised : result.failure.recognised;
      expect(recognised, text).toContain(rule);
    }
  });
});
