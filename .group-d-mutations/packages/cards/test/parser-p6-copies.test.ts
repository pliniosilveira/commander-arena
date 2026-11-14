// Stage P6 (D-063, D-084, D-085), part 2: token copies (CR 707.2, 111.4) and the additive type
// change (CR 205.1b). Each line is read through the whole pipeline and compared with the AST of the
// engine's SYNTHETIC fixtures (cards/fixtures/synthetic-ward.ts) or with a node written out here.
// No line of the backlog has the plain "Create a token that's a copy of target creature." shape in
// its first thousand shapes (the real copy lines all carry an "except", a condition, a quoted
// ability or a graveyard card), so these lines are SYNTHETIC unless a note names the backlog; the
// engine's own note names Spitting Image for it, which was not checked against Oracle text and no
// real card is marked supported here.
import { describe, expect, test } from 'vitest';
import { parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import {
  CREATURE_TARGET,
  dropped,
  END,
  fixture,
  readAll,
  spellEffect,
  T1,
  THIS,
} from './parser-p5-helpers';

const copyOf = (object: object, count = 1) => ({
  kind: 'createToken',
  token: { kind: 'copyOf', object },
  count,
});
const TRIGGER_SUBJECT = { kind: 'triggerSubject' } as const;

describe('a token that is a copy of a target (CR 707.2)', () => {
  const ECHO = "Create a token that's a copy of target creature.";

  test('equals SYNTHETIC Echo Image: one target creature, one token', () => {
    expect(readAll(ECHO, 'sorcery').spell).toEqual(fixture('SYNTHETIC Echo Image').spell);
    expect(readAll(ECHO, 'sorcery').spell).toEqual({
      targets: [CREATURE_TARGET],
      effect: copyOf(T1),
    });
  });

  test('a target you control equals SYNTHETIC Twin Image', () => {
    expect(
      readAll("Create a token that's a copy of target creature you control.", 'instant').spell,
    ).toEqual(fixture('SYNTHETIC Twin Image').spell);
  });

  test('the typographic apostrophe reads the same', () => {
    expect(readAll(ECHO.replace("'", '’'), 'sorcery').spell).toEqual(
      readAll(ECHO, 'sorcery').spell,
    );
  });

  test('"two tokens that are copies" is count 2 of one target; "three" is 3', () => {
    const two = readAll('Create two tokens that are copies of target creature.', 'sorcery');
    expect(two.spell).toEqual({ targets: [CREATURE_TARGET], effect: copyOf(T1, 2) });
    expect(
      spellEffect('Create three tokens that are copies of target creature you control.', 'sorcery'),
    ).toEqual(copyOf(T1, 3));
  });

  test('the filter is the creature filter the target phrase gives; the engine decides what it refuses', () => {
    // The parser writes what the text says; `validateCard` refuses a copy of anything that could be
    // an Aura or a land (CR 303.4f, 614.12), so those cards read fully and are unsupported.
    const targets = (text: string) => readAll(text, 'sorcery').spell?.targets;
    expect(targets("Create a token that's a copy of target nonland permanent.")).toEqual([
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', notTypes: ['land'] } } },
    ]);
    expect(targets("Create a token that's a copy of target artifact.")).toEqual([
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } } },
    ]);
  });

  const reasonOf = (text: string) => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Copier',
        manaCost: '{1}{U}',
        typeLine: 'Sorcery',
        oracleText: text,
      }),
    );
    expect(imported.support.unparsed, text).toEqual([]);
    return { status: imported.support.status, reasons: imported.support.reasons.join('\n') };
  };

  test('the engine accepts a creature or an artifact and says why it refuses the rest', () => {
    expect(reasonOf(ECHO)).toEqual({ status: 'supported', reasons: '' });
    expect(reasonOf("Create a token that's a copy of target artifact.").status).toBe('supported');
    const permanent = reasonOf("Create a token that's a copy of target permanent.");
    expect(permanent.status).toBe('unsupported');
    expect(permanent.reasons).toContain('could be an Aura is not implemented by the engine yet');
    expect(permanent.reasons).not.toContain('could be a land');
    const nonland = reasonOf("Create a token that's a copy of target nonland permanent.");
    expect(nonland.reasons).toContain('could be an Aura');
    expect(nonland.reasons).not.toContain('could be a land');
    // Stage P52 (D-211): a token copy of a land asks what the land asks as it enters.
    expect(reasonOf("Create a token that's a copy of target land.").status).toBe('supported');
    expect(reasonOf("Create a token that's a copy of target enchantment.").reasons).toContain(
      'could be an Aura',
    );
  });

  test('"a copy of ~" in an instant or sorcery is a copy of the spell, which the engine refuses', () => {
    expect(readAll("Create a token that's a copy of ~.", 'sorcery').spell?.effect).toEqual(
      copyOf({ kind: 'thisSpell' }),
    );
    const refused = reasonOf("Create a token that's a copy of ~.");
    expect(refused.status).toBe('unsupported');
    expect(refused.reasons).toContain(
      'a copy is made from this permanent, a target or the triggering permanent',
    );
  });

  test('after another target, "it" is that target', () => {
    expect(
      readAll("Destroy target creature. Create a token that's a copy of it.", 'sorcery').spell,
    ).toEqual({
      targets: [CREATURE_TARGET],
      effect: { kind: 'sequence', effects: [{ kind: 'destroy', objects: T1 }, copyOf(T1)] },
    });
  });

  test('"it" with nothing before it is an unbound reference', () => {
    expect(dropped("Create a token that's a copy of it.", 'sorcery')).toMatchObject({
      reason: 'unboundReference',
    });
  });
});

describe('a token that is a copy, from an ability on the permanent or a trigger (CR 603.2, 707.2)', () => {
  test('{3}: a copy of this creature equals SYNTHETIC Cloner Imp', () => {
    const parsed = readAll("{3}: Create a token that's a copy of this creature.", 'creature');
    expect(parsed.abilities).toEqual(fixture('SYNTHETIC Cloner Imp').abilities);
    expect(parsed.abilities).toEqual([
      { kind: 'activated', cost: [{ kind: 'mana', symbols: ['3'] }], effect: copyOf(THIS) },
    ]);
  });

  test('"a copy of ~" and "a copy of it" in a trigger about ~ are both this', () => {
    for (const text of [
      "When ~ enters, create a token that's a copy of ~.",
      "When ~ enters, create a token that's a copy of it.",
    ]) {
      expect(readAll(text, 'creature').abilities, text).toEqual([
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: THIS },
          effect: copyOf(THIS),
        },
      ]);
    }
    expect(
      readAll("Whenever ~ attacks, create a token that's a copy of it.", 'creature').abilities,
    ).toEqual([
      { kind: 'triggered', trigger: { kind: 'attacks', what: THIS }, effect: copyOf(THIS) },
    ]);
  });

  test('"a copy of it" in a trigger about another permanent is the triggering permanent', () => {
    const what = { types: ['creature'], other: true, controller: 'you' };
    for (const [event, kind] of [
      ['enters', 'entersBattlefield'],
      ['dies', 'dies'],
    ] as const) {
      expect(
        readAll(
          `Whenever another creature you control ${event}, create a token that's a copy of it.`,
          'enchantment',
        ).abilities,
        event,
      ).toEqual([{ kind: 'triggered', trigger: { kind, what }, effect: copyOf(TRIGGER_SUBJECT) }]);
    }
    expect(
      readAll(
        "Whenever a creature you control attacks, create a token that's a copy of it.",
        'enchantment',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { types: ['creature'], controller: 'you' } },
        effect: copyOf(TRIGGER_SUBJECT),
      },
    ]);
  });

  test('after "dies", "it" is the trigger subject, not ~: a copy of a card in a graveyard is refused', () => {
    // A trigger about ~ itself has no filter for the engine to check the copy against.
    expect(
      readAll("When ~ dies, create a token that's a copy of it.", 'creature').abilities,
    ).toEqual([
      { kind: 'triggered', trigger: { kind: 'dies', what: THIS }, effect: copyOf(TRIGGER_SUBJECT) },
    ]);
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Echoing Bear',
        manaCost: '{1}{G}',
        typeLine: 'Creature — Bear',
        oracleText: "When ~ dies, create a token that's a copy of it.",
        power: '2',
        toughness: '2',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain('cannot tell the type of');
  });

  test('the triggering object of a "whenever you cast" trigger is a spell: read (stage P9), and refused as a copy source', () => {
    const text = "Whenever you cast a creature spell, create a token that's a copy of it.";
    expect(readAll(text, 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { types: ['creature'], stackKind: 'spell' },
          by: 'you',
        },
        effect: copyOf(TRIGGER_SUBJECT),
      },
    ]);
    // The engine copies permanents: a spell on the stack is not one (CR 707.2), so the card is not
    // supported and says why.
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Echoing Mage',
        manaCost: '{1}{U}',
        typeLine: 'Creature — Wizard',
        oracleText: text.replace('~', 'SYNTHETIC Echoing Mage'),
        power: '2',
        toughness: '2',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toContain('cannot tell the type of');
  });
});

describe('what a copy can still not say (CR 707.9 "except", others stay unread)', () => {
  test.each([
    ["Create a token that's a copy of target creature, except it's a 1/1.", ', except'],
    [
      "Create a token that's a copy of target creature, except it's an artifact in addition to its other types.",
      ', except',
    ],
    [
      "Create a token that's a copy of target creature, except the token isn't legendary.",
      ', except',
    ],
    ["Create a token that's a copy of target token you control.", 'token you control'],
    [
      "Create a token that's a copy of target creature card in your graveyard.",
      'card in your graveyard',
    ],
    ["Create a token that's a copy of equipped creature.", 'equipped creature'],
    ["Create a token that's a copy of target creatures.", 'creatures'],
    ["Create a token that's a copy of two target creatures.", '.'],
    ["Create one token that's a copy of target creature.", "token that's a copy"],
    ["Create two tokens that's a copy of target creature.", 'tokens that'],
    ['Create a token that are copies of target creature.', 'token that are'],
    ['Create X tokens that are copies of target creature.', 'tokens that'],
    ["Create a token that's a copy of target creature", ''],
    ["Create a token that's a copy of that creature.", 'that creature'],
    ["Create a token that's a copy of target spell.", 'spell'],
  ] as const)('stays unread: %s', (text, part) => {
    const d = dropped(text, 'sorcery');
    expect(d.reason).toBe('unrecognised');
    expect(d.stoppedAt).toContain(part);
  });

  test('"That token" after a copy is not read (stage P48, D-205): only a token the text describes is "that token", a copy has its exceptions to say first', () => {
    const d = dropped(
      "Create a token that's a copy of target creature. That token gains haste until end of turn.",
      'sorcery',
    );
    expect(d.reason).toBe('unboundReference');
    expect(d.stoppedAt).toContain('That token gains haste');
  });

  test('"becomes a copy" has no backlog line of the plain shape: it is still not read', () => {
    // Shifting Woodland's shape copies a card in a graveyard, which the engine's becomeCopy does
    // not take, and the other lines carry an "except". The engine node exists; the rule does not.
    for (const text of [
      'Target creature becomes a copy of target creature until end of turn.',
      '{2}{G}{G}: ~ becomes a copy of target permanent card in your graveyard until end of turn.',
      '{2}, {T}: ~ becomes a copy of target land, except it has this ability.',
    ]) {
      expect(dropped(text, 'creature').reason, text).toBe('unrecognised');
    }
  });
});

describe('becomes an artifact creature, with or without "in addition to its other types" (CR 205.1b)', () => {
  const additive = (objects: object, types: string[]) => ({
    kind: 'setTypes',
    objects,
    types,
    additive: true,
    duration: END,
  });

  test('in addition to its other types, on a target', () => {
    const parsed = readAll(
      'Target creature becomes an artifact creature in addition to its other types until end of turn.',
    );
    expect(parsed.spell).toEqual({
      targets: [CREATURE_TARGET],
      effect: additive(T1, ['artifact', 'creature']),
    });
  });

  test('the shorter form is the same node: CR 205.1b keeps the prior types either way', () => {
    expect(
      readAll('Target creature becomes an artifact creature until end of turn.').spell,
    ).toEqual(
      readAll(
        'Target creature becomes an artifact creature in addition to its other types until end of turn.',
      ).spell,
    );
  });

  test('on ~, in an activated ability: this', () => {
    for (const text of [
      '{1}: ~ becomes an artifact creature in addition to its other types until end of turn.',
      '{1}: ~ becomes an artifact creature until end of turn.',
    ]) {
      expect(readAll(text, 'artifact', ['Vehicle']).abilities, text).toEqual([
        {
          kind: 'activated',
          cost: [{ kind: 'mana', symbols: ['1'] }],
          effect: additive(THIS, ['artifact', 'creature']),
        },
      ]);
    }
  });

  test('"it" after a target, and the backlog line: a nonland permanent becomes an artifact too', () => {
    expect(
      readAll(
        'Put a +1/+1 counter on target creature you control. It becomes an artifact creature until end of turn.',
      ).spell?.effect,
    ).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'addCounters' }, additive(T1, ['artifact', 'creature'])],
    });
    // backlog: 1 card, `{T}: Target nonland permanent becomes an artifact in addition to its other
    // types until end of turn.`
    const line =
      '{T}: Target nonland permanent becomes an artifact in addition to its other types until end of turn.';
    expect(readAll(line, 'artifact').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', notTypes: ['land'] } },
          },
        ],
        effect: additive(T1, ['artifact']),
      },
    ]);
  });

  test('the engine accepts the nodes (validateCard is the last gate)', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Awakener',
        manaCost: '{1}',
        typeLine: 'Sorcery',
        oracleText:
          'Target creature becomes an artifact creature in addition to its other types until end of turn.',
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  test.each([
    // CR 205.1b: "a [creature type] artifact creature" replaces the creature types and keeps the
    // rest; there is no node for it (D-085), so the line is not read.
    ['Target creature becomes a Golem artifact creature until end of turn.', 'artifact creature'],
    [
      'Target creature becomes a Golem artifact creature in addition to its other types until end of turn.',
      'artifact creature in addition',
    ],
    // Without "in addition" and without "creature", an artifact type replaces the card types
    // (CR 205.1a): a different effect, not read.
    ['Target creature becomes an artifact until end of turn.', 'artifact until'],
    ['Target creature becomes a 3/3 artifact creature until end of turn.', '3/3'],
    ['Target creature becomes an artifact creature.', '.'],
    ['Target creature becomes an artifact creature until your next turn.', 'until your next turn'],
    ['Target creature becomes an artifact creature in addition to its other types.', '.'],
    ['Target creature becomes artifact creature until end of turn.', 'artifact creature'],
    ['Target creature becomes a artifact creature until end of turn.', 'artifact creature'],
    ['Target creature becomes an artifact creatures until end of turn.', 'creatures'],
    [
      'Target creature loses all abilities and becomes an artifact creature until end of turn.',
      'artifact creature until',
    ],
  ] as const)('stays unread: %s', (text, part) => {
    const d = dropped(text);
    expect(d.reason).toBe('unrecognised');
    expect(d.stoppedAt).toContain(part);
  });
});
