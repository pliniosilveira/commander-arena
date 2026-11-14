// Stage P21 (M6): the engine's keyword batch 2 (D-116, D-120; ENGINE_VERSION 21). Each line is read through the
// whole pipeline and compared with the engine AST it must produce; each near miss says where it stops or why
// it is dropped. The lines of reports/template-replay.md (the owner's run) are the real ones: "Convoke",
// "Affinity for artifacts", "{1}{B}: Regenerate ~.", "Extort", "Delve", "Cascade", "Evolve", "Improvise",
// "Mentor", "Skulk", "Bushido 2", "Battle cry", "Destroy target creature. It can't be regenerated.", "Destroy
// all creatures. They can't be regenerated.", "Destroy target creature. It can't be regenerated. Its controller
// creates a 3/3 green Ape creature token.", "At the beginning of your upkeep, you may pay {4}. If you do,
// untap ~.", "Whenever another creature you control with power 2 or less enters, you may pay {1}. If you do,
// draw a card." and "Each opponent loses X life. You gain life equal to the life lost this way."; every other
// line is SYNTHETIC, and no real card is claimed supported here (the replay has no "blocks" or "attacks alone"
// line). That the engine runs what is lowered is in convert-grammar-engine-p21.test.ts; that a missing engine
// feature is named is in parser-p21-needs.test.ts.
import type { Ability, Effect } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const THIS = { kind: 'this' } as const;
const END = 'untilEndOfTurn' as const;
const keyword = (kind: string, more: object = {}): Ability =>
  ({ kind: 'keyword', keyword: { kind, ...more } }) as Ability;
const abilities = (text: string, type: FaceType = 'creature', subtypes: readonly string[] = []) =>
  readAll(text, type, subtypes).abilities;
const spellOf = (text: string, type: FaceType = 'sorcery') => readAll(text, type).spell;
const effectOf = (text: string, type: FaceType = 'sorcery'): Effect | undefined =>
  spellOf(text, type)?.effect;

describe('keyword.line: the keywords of batch 2 (CR 702.118, 702.91, 702.134, 702.100, 702.101, 702.51, 702.126, 702.66, 702.85)', () => {
  test.each([
    ['Skulk', 'skulk'],
    ['Battle cry', 'battleCry'],
    ['battle cry', 'battleCry'],
    ['Mentor', 'mentor'],
    ['Evolve', 'evolve'],
    ['Extort', 'extort'],
    ['Convoke', 'convoke'],
    ['Improvise', 'improvise'],
    ['Delve', 'delve'],
    ['Cascade', 'cascade'],
  ])('%s', (text, kind) => {
    expect(abilities(text)).toEqual([keyword(kind)]);
  });

  test('"Bushido N" carries its number, a whole number of at least one (replay: "Bushido 2", 35 cards)', () => {
    expect(abilities('Bushido 2')).toEqual([keyword('bushido', { count: 2 })]);
    expect(abilities('Bushido 1')).toEqual([keyword('bushido', { count: 1 })]);
    expect(abilities('Bushido 12')).toEqual([keyword('bushido', { count: 12 })]);
  });

  test('a keyword line may list them, with commas or semicolons, and end with a ward', () => {
    expect(abilities('Flying, skulk')).toEqual([keyword('flying'), keyword('skulk')]);
    expect(abilities('Haste; battle cry')).toEqual([keyword('haste'), keyword('battleCry')]);
    expect(abilities('Cascade, cascade')).toEqual([keyword('cascade'), keyword('cascade')]);
    expect(abilities('Convoke, improvise, delve')).toEqual([
      keyword('convoke'),
      keyword('improvise'),
      keyword('delve'),
    ]);
    expect(abilities('Vigilance, mentor, bushido 1, ward {2}')).toEqual([
      keyword('vigilance'),
      keyword('mentor'),
      keyword('bushido', { count: 1 }),
      { kind: 'keyword', keyword: { kind: 'ward', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ]);
  });

  test('the reminder text in parentheses is dropped before the line is read (SYNTHETIC wording)', () => {
    expect(abilities('Skulk (SYNTHETIC reminder.)')).toEqual([keyword('skulk')]);
    expect(abilities('Battle cry (SYNTHETIC reminder.)\nBushido 1 (SYNTHETIC reminder.)')).toEqual([
      keyword('battleCry'),
      keyword('bushido', { count: 1 }),
    ]);
  });

  test('a spell with a cost-payment or cast keyword reads the same keyword', () => {
    expect(abilities('Convoke', 'sorcery')).toEqual([keyword('convoke')]);
    expect(abilities('Delve', 'instant')).toEqual([keyword('delve')]);
    expect(abilities('Improvise', 'artifact')).toEqual([keyword('improvise')]);
    expect(abilities('Cascade', 'sorcery')).toEqual([keyword('cascade')]);
  });

  test.each([
    ['Ninjutsu {1}{U}', 'D-117'],
    ['Morph {3}', 'D-117'],
    ['Flying, storm', 'one unread keyword leaves the whole line'],
    ['Skulk, storm', 'the same after a keyword of batch 2'],
  ])('"%s" stays unread (%s)', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test.each([
    'Skulkx',
    'Skulk.',
    'Evolved',
    'Mentor {1}',
    'Cascade {2}',
    'Convoke {C}',
    'Convoke {S}',
    'Delve {1}',
    'Improvise.',
    'Battlecry',
    'Extort {1}',
    'Bushido',
    'Bushido 0',
    'Bushido X',
    'Bushido one',
    'Bushido 1.',
    'Bushido 1 2',
  ])('"%s" is not a keyword line', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('keyword.line: "Affinity for [permanents]" (CR 702.41a; replay: "Affinity for artifacts", 37 cards)', () => {
  test.each([
    ['Affinity for artifacts', 'artifact', [], { types: ['artifact'] }],
    ['Affinity for artifact creatures', 'creature', [], { types: ['artifact', 'creature'] }],
    ['Affinity for Plains', 'creature', [], { subtypes: ['Plains'] }],
    ['Affinity for Islands', 'creature', [], { subtypes: ['Island'] }],
    ['Affinity for Swamps', 'creature', [], { subtypes: ['Swamp'] }],
    ['Affinity for Mountains', 'creature', [], { subtypes: ['Mountain'] }],
    ['Affinity for Forests', 'creature', [], { subtypes: ['Forest'] }],
    ['Affinity for Equipment', 'artifact', ['Equipment'], { subtypes: ['Equipment'] }],
    ['Affinity for creatures', 'creature', [], { types: ['creature'] }],
    ['Affinity for enchantments', 'creature', [], { types: ['enchantment'] }],
    ['Affinity for lands', 'creature', [], { types: ['land'] }],
  ] as const)('%s', (text, type, subtypes, filter) => {
    expect(abilities(text, type, subtypes)).toEqual([keyword('affinity', { filter })]);
  });

  test('it ends or starts a keyword list', () => {
    expect(abilities('Flying, affinity for artifacts')).toEqual([
      keyword('flying'),
      keyword('affinity', { filter: { types: ['artifact'] } }),
    ]);
    expect(abilities('Affinity for artifacts, flying')).toEqual([
      keyword('affinity', { filter: { types: ['artifact'] } }),
      keyword('flying'),
    ]);
  });

  test.each([
    'Affinity',
    'Affinity for',
    'Affinity for artifact',
    'Affinity for artifacts you control',
    'Affinity for each artifact',
    'Affinity for artifacts.',
    'Affinity for nonland permanents',
    'Affinity for red permanents',
    'Affinity for tapped artifacts',
    'Affinity for creatures with power 4 or greater',
    'Affinity for artifacts and Equipment',
    'Affinity for the number of artifacts',
    'Affinity for cards in your graveyard',
  ])(
    '"%s" is not read (the engine counts what the caster controls, by type or subtype only)',
    (text) => {
      expect(dropped(text, 'artifact')).toMatchObject({ reason: 'unrecognised' });
    },
  );
});

describe("only skulk is grantable of the keywords of batch 2 (the engine's GRANTABLE_KEYWORDS)", () => {
  test('"gains skulk until end of turn" and "have skulk" read', () => {
    expect(effectOf('Target creature gains skulk until end of turn.', 'instant')).toEqual({
      kind: 'grantKeyword',
      objects: { kind: 'target', id: 't1' },
      keyword: { kind: 'skulk' },
      duration: END,
    });
    expect(abilities('Creatures you control have skulk.', 'enchantment')).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'skulk' },
        },
      },
    ]);
  });

  test.each([
    ['Target creature gains battle cry until end of turn.', 'battle cry until end of turn.'],
    ['Target creature gains mentor until end of turn.', 'mentor until end of turn.'],
    ['Target creature gains evolve until end of turn.', 'evolve until end of turn.'],
    ['Target creature gains extort until end of turn.', 'extort until end of turn.'],
    ['Target creature gains convoke until end of turn.', 'convoke until end of turn.'],
    ['Target creature gains cascade until end of turn.', 'cascade until end of turn.'],
    ['Target creature gains storm until end of turn.', 'storm until end of turn.'],
  ])('"%s" is not read', (text, stoppedAt) => {
    expect(dropped(text, 'instant')).toMatchObject({ reason: 'unrecognised', stoppedAt });
  });

  test('a token may have skulk, and no other keyword of the batch', () => {
    const token = effectOf('Create a 1/1 black Rogue creature token with skulk.');
    expect(token).toMatchObject({
      kind: 'createToken',
      token: { kind: 'custom', definition: { abilities: [keyword('skulk')] } },
    });
    expect(
      dropped('Create a 1/1 black Rogue creature token with battle cry.', 'sorcery'),
    ).toMatchObject({
      reason: 'unrecognised',
    });
  });
});

describe('effect.regenerate: "Regenerate ..." (CR 701.19a)', () => {
  const regenerate = (objects: object) => ({ kind: 'regenerate', objects, duration: END });

  test('the activated ability of the replay: "{1}{B}: Regenerate ~." (118 cards)', () => {
    expect(abilities('{1}{B}: Regenerate ~.')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1', 'B'] }],
        effect: regenerate(THIS),
      },
    ]);
  });

  test('with another cost the grammar reads, and beside another instruction', () => {
    expect(abilities('{T}: Regenerate ~.')).toEqual([
      { kind: 'activated', cost: [{ kind: 'tap' }], effect: regenerate(THIS) },
    ]);
    expect(abilities('{G}, Pay 2 life: Regenerate ~.')).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['G'] },
          { kind: 'payLife', amount: 2 },
        ],
        effect: regenerate(THIS),
      },
    ]);
    expect(abilities('{R/W}: Regenerate ~.')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['R/W'] }],
        effect: regenerate(THIS),
      },
    ]);
    expect(abilities('{2}: Regenerate ~. Draw a card.')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['2'] }],
        effect: {
          kind: 'sequence',
          effects: [regenerate(THIS), { kind: 'draw', player: { kind: 'you' }, count: 1 }],
        },
      },
    ]);
  });

  test('a target, from an ability and from a spell', () => {
    expect(abilities('{T}: Regenerate target creature.')).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: regenerate({ kind: 'target', id: 't1' }),
      },
    ]);
    expect(spellOf('Regenerate target creature.', 'instant')).toEqual({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: regenerate({ kind: 'target', id: 't1' }),
    });
  });

  test('a group: "each creature you control", "all creatures" and "all Elves"', () => {
    expect(effectOf('Regenerate each creature you control.', 'instant')).toEqual(
      regenerate({
        kind: 'each',
        filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
      }),
    );
    expect(effectOf('Regenerate all creatures.', 'instant')).toEqual(
      regenerate({ kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } }),
    );
    expect(effectOf('Regenerate all Elves.', 'instant')).toEqual(
      regenerate({ kind: 'each', filter: { zone: 'battlefield', subtypes: ['Elf'] } }),
    );
  });

  test('in a triggered ability about ~ it is the permanent, and it is a creature of the trigger', () => {
    expect(abilities('Whenever ~ attacks, regenerate ~.')).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS },
        effect: regenerate(THIS),
      },
    ]);
  });

  test.each([
    ['Regenerate ~.', 'instant', 'a spell is not a permanent: it cannot regenerate itself'],
    ['Regenerate ~.', 'sorcery', 'the same'],
    [
      'Whenever ~ dies, regenerate ~.',
      'creature',
      'a permanent that is gone cannot be regenerated',
    ],
    ['{T}, Sacrifice ~: Regenerate ~.', 'creature', 'a sacrificed permanent is gone'],
  ] as const)('"%s" is read and not run (%s)', (text, type, _why) => {
    expect(dropped(text, type)).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'effect.regenerate',
    });
  });

  test.each([
    'Regenerate',
    'Regenerate it.',
    'Regenerate target creature until end of turn.',
    'Regenerate target creature this turn.',
    'Regenerate target spell.',
    'Regenerate target player.',
    'Creatures can’t be regenerated.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'instant')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('effect.cant-be-regenerated: the flag of the destroy before it (CR 701.19c, 608.2c)', () => {
  const MURDER_TARGET = {
    id: 't1',
    what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
  };

  test('"Destroy target creature. It can\'t be regenerated." (replay: 2 cards)', () => {
    expect(spellOf("Destroy target creature. It can't be regenerated.")).toEqual({
      targets: [MURDER_TARGET],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' }, cantBeRegenerated: true },
    });
    expect(effectOf('Destroy target creature. It can’t be regenerated.')).toMatchObject({
      cantBeRegenerated: true,
    });
  });

  test('"Destroy all creatures. They can\'t be regenerated." (replay: 4 cards)', () => {
    expect(spellOf("Destroy all creatures. They can't be regenerated.")).toEqual({
      effect: {
        kind: 'destroy',
        objects: { kind: 'each', filter: { zone: 'battlefield', types: ['creature'] } },
        cantBeRegenerated: true,
      },
    });
  });

  test('a choice of types (replay: "Destroy target artifact or creature. It can\'t be regenerated.")', () => {
    expect(effectOf("Destroy target artifact or creature. It can't be regenerated.")).toMatchObject(
      {
        kind: 'destroy',
        cantBeRegenerated: true,
      },
    );
  });

  test('the other wordings of the same sentence', () => {
    for (const text of [
      "Destroy target creature. That creature can't be regenerated.",
      "Destroy target creature. A creature destroyed this way can't be regenerated.",
    ]) {
      expect(effectOf(text), text).toMatchObject({ kind: 'destroy', cantBeRegenerated: true });
    }
    for (const text of [
      "Destroy two target creatures. They can't be regenerated.",
      "Destroy two target creatures. Those creatures can't be regenerated.",
      "Destroy all creatures. Creatures destroyed this way can't be regenerated.",
    ]) {
      expect(effectOf(text), text).toMatchObject({ kind: 'destroy', cantBeRegenerated: true });
    }
  });

  test('the sentences after it are read as before (replay: "... Its controller creates a 3/3 green Ape creature token.")', () => {
    const spell = spellOf(
      "Destroy target creature. It can't be regenerated. Its controller creates a 3/3 green Ape creature token.",
      'instant',
    );
    expect(spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', cantBeRegenerated: true },
        {
          kind: 'createToken',
          controller: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
        },
      ],
    });
  });

  test('without the sentence the destroy has no flag', () => {
    expect(effectOf('Destroy target creature.')).toEqual({
      kind: 'destroy',
      objects: { kind: 'target', id: 't1' },
    });
  });

  test.each([
    ["Destroy target creature. They can't be regenerated.", 'one object is "it"'],
    ["Destroy all creatures. It can't be regenerated.", 'several objects are "they"'],
    ["Draw a card. It can't be regenerated.", 'nothing is destroyed'],
    ["Regenerate target creature. It can't be regenerated.", 'a shield is not a destruction'],
    ["Destroy target creature. Draw a card. It can't be regenerated.", 'not the sentence before'],
    ["Destroy target creature and target artifact. They can't be regenerated.", 'two destroys'],
    ["Exile target creature. It can't be regenerated.", 'an exile'],
    ["Destroy target creature. It can't be regenerated, and you gain 2 life.", 'two clauses'],
  ])('"%s" is read and not run (%s)', (text, _why) => {
    expect(dropped(text, 'sorcery')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'effect.cant-be-regenerated',
    });
  });

  test.each([
    "Destroy target creature. It can't be regenerated this turn.",
    "Destroy target creature. Creatures can't be regenerated.",
    'Destroy target creature. It can regenerate.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });

  test('on a permanent it stands in the body of an ability, after the destroy', () => {
    expect(abilities("When ~ enters, destroy target creature. It can't be regenerated.")).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [MURDER_TARGET],
        effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' }, cantBeRegenerated: true },
      },
    ]);
  });
});

describe('trigger.blocks and trigger.becomes-blocked (CR 509.3a, 509.3c; D-120)', () => {
  const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 };

  test('"Whenever ~ blocks" and "Whenever ~ becomes blocked"', () => {
    expect(abilities('Whenever ~ blocks, draw a card.')).toEqual([
      { kind: 'triggered', trigger: { kind: 'blocks', what: THIS }, effect: draw },
    ]);
    expect(abilities('Whenever ~ becomes blocked, draw a card.')).toEqual([
      { kind: 'triggered', trigger: { kind: 'becomesBlocked', what: THIS }, effect: draw },
    ]);
  });

  test('"Whenever ~ blocks or becomes blocked" is one ability for each event (CR 603.2c)', () => {
    expect(abilities('Whenever ~ blocks or becomes blocked, draw a card.')).toEqual([
      { kind: 'triggered', trigger: { kind: 'blocks', what: THIS }, effect: draw },
      { kind: 'triggered', trigger: { kind: 'becomesBlocked', what: THIS }, effect: draw },
    ]);
    expect(abilities('Whenever ~ attacks or blocks, draw a card.')).toEqual([
      { kind: 'triggered', trigger: { kind: 'attacks', what: THIS }, effect: draw },
      { kind: 'triggered', trigger: { kind: 'blocks', what: THIS }, effect: draw },
    ]);
  });

  test('"it" in the body of a trigger about ~ is ~ (the spelled-out Bushido of CR 702.45a)', () => {
    const pump = (n: number) => ({
      kind: 'modifyPt',
      objects: THIS,
      power: n,
      toughness: n,
      duration: END,
    });
    expect(
      abilities('Whenever ~ blocks or becomes blocked, it gets +1/+1 until end of turn.'),
    ).toEqual([
      { kind: 'triggered', trigger: { kind: 'blocks', what: THIS }, effect: pump(1) },
      { kind: 'triggered', trigger: { kind: 'becomesBlocked', what: THIS }, effect: pump(1) },
    ]);
  });

  test('a target in the body, and a group as the subject', () => {
    expect(abilities('Whenever ~ becomes blocked, destroy target creature.')).toMatchObject([
      { trigger: { kind: 'becomesBlocked', what: THIS }, effect: { kind: 'destroy' } },
    ]);
    expect(
      abilities('Whenever a creature you control blocks, you gain 1 life.', 'enchantment'),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'blocks', what: { types: ['creature'], controller: 'you' } },
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ]);
    expect(abilities('Whenever another creature becomes blocked, you gain 1 life.')).toMatchObject([
      {
        trigger: { kind: 'becomesBlocked', what: { types: ['creature'], other: true } },
      },
    ]);
  });

  test('the creature an Equipment or an Aura is attached to', () => {
    expect(
      abilities('Whenever equipped creature blocks, draw a card.', 'artifact', ['Equipment']),
    ).toEqual([
      { kind: 'triggered', trigger: { kind: 'blocks', what: { kind: 'attached' } }, effect: draw },
    ]);
    expect(
      abilities('Whenever enchanted creature becomes blocked, draw a card.', 'enchantment', [
        'Aura',
      ]),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'becomesBlocked', what: { kind: 'attached' } },
        effect: draw,
      },
    ]);
  });

  test.each([
    'Whenever ~ blocks a creature, draw a card.',
    'Whenever ~ becomes blocked by a creature, draw a card.',
    'Whenever ~ becomes blocked by a creature with flying, draw a card.',
    'Whenever ~ blocks or becomes blocked by a creature, draw a card.',
    'Whenever ~ is blocked, draw a card.',
    'Whenever ~ becomes unblocked, draw a card.',
    'Whenever ~ blocked, draw a card.',
    'Whenever you block, draw a card.',
    'At the beginning of combat, ~ blocks, draw a card.',
  ])('"%s" is not read (another event: CR 509.3b, 509.3d)', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });

  test('"enchanted creature" blocks only where it names a creature, and "becomes blocked" needs an Aura', () => {
    expect(dropped('Whenever enchanted creature blocks, draw a card.', 'creature')).toMatchObject({
      reason: 'notRunnable',
    });
  });
});

describe('trigger.attacks-alone: "attacks alone" (CR 506.5; D-110)', () => {
  test('~, a group and the attached creature', () => {
    expect(abilities('Whenever ~ attacks alone, draw a card.')).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS, alone: true },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
    expect(
      abilities('Whenever a creature you control attacks alone, you gain 1 life.', 'enchantment'),
    ).toMatchObject([
      {
        trigger: { kind: 'attacks', what: { types: ['creature'], controller: 'you' }, alone: true },
      },
    ]);
    expect(
      abilities('Whenever equipped creature attacks alone, draw a card.', 'artifact', [
        'Equipment',
      ]),
    ).toMatchObject([{ trigger: { kind: 'attacks', what: { kind: 'attached' }, alone: true } }]);
  });

  test('"it" is ~ in a trigger about ~', () => {
    expect(abilities('Whenever ~ attacks alone, it gets +2/+0 until end of turn.')).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: THIS, alone: true },
        effect: { kind: 'modifyPt', objects: THIS, power: 2, toughness: 0, duration: END },
      },
    ]);
  });

  test.each([
    'Whenever ~ attacks alone or dies, draw a card.',
    'Whenever ~ attack alone, draw a card.',
    'Whenever ~ attacks with another creature, draw a card.',
    'Whenever you attack alone, draw a card.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('effect.pay and condition.if-you-do: "You may pay [cost]. If you do, ..." (CR 118.3, 608.2c; the engine\'s mayPay)', () => {
  const mayPay = (cost: object[], effect: Effect) => ({ kind: 'mayPay', cost, effect });
  const mana = (...symbols: string[]) => ({ kind: 'mana', symbols });
  const draw = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;

  test('replay: "At the beginning of your upkeep, you may pay {4}. If you do, untap ~." (6 cards)', () => {
    expect(
      abilities('At the beginning of your upkeep, you may pay {4}. If you do, untap ~.'),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: mayPay([mana('4')], { kind: 'untap', objects: THIS }),
      },
    ]);
  });

  test('replay: "Whenever another creature you control with power 2 or less enters, you may pay {1}. If you do, draw a card."', () => {
    expect(
      abilities(
        'Whenever another creature you control with power 2 or less enters, you may pay {1}. If you do, draw a card.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'entersBattlefield',
          what: {
            types: ['creature'],
            other: true,
            controller: 'you',
            power: { cmp: 'atMost', value: 2 },
          },
        },
        effect: mayPay([mana('1')], draw),
      },
    ]);
  });

  test('a hybrid symbol and a payment of life are the costs the engine pays for it', () => {
    expect(
      abilities('At the beginning of your upkeep, you may pay {R/W}. If you do, draw a card.'),
    ).toMatchObject([{ effect: mayPay([mana('R/W')], draw) }]);
    expect(
      abilities('At the beginning of your upkeep, you may pay {1}{G}. If you do, draw a card.'),
    ).toMatchObject([{ effect: mayPay([mana('1', 'G')], draw) }]);
    expect(
      abilities('At the beginning of your upkeep, you may pay 2 life. If you do, draw a card.'),
    ).toMatchObject([{ effect: mayPay([{ kind: 'payLife', amount: 2 }], draw) }]);
  });

  test('what the payment buys may be several instructions, a target among them, and an intervening "if" stays', () => {
    expect(
      abilities('When ~ enters, you may pay {2}. If you do, destroy target creature.'),
    ).toMatchObject([
      {
        trigger: { kind: 'entersBattlefield', what: THIS },
        targets: [{ id: 't1' }],
        effect: mayPay([mana('2')], { kind: 'destroy', objects: { kind: 'target', id: 't1' } }),
      },
    ]);
    expect(
      abilities(
        'At the beginning of your upkeep, you may pay {1}. If you do, draw a card and gain 2 life.',
      ),
    ).toMatchObject([
      {
        effect: mayPay([mana('1')], {
          kind: 'sequence',
          effects: [draw, { kind: 'gainLife', player: { kind: 'you' }, amount: 2 }],
        }),
      },
    ]);
    expect(
      abilities(
        'At the beginning of your upkeep, if you control a Swamp, you may pay {1}. If you do, draw a card.',
      ),
    ).toMatchObject([
      {
        interveningIf: { kind: 'controlsAtLeast' },
        effect: mayPay([mana('1')], draw),
      },
    ]);
  });

  test('another instruction may come before it, and one after it is a sentence of its own', () => {
    expect(
      abilities(
        'At the beginning of your upkeep, gain 1 life. You may pay {1}. If you do, draw a card.',
      ),
    ).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [{ kind: 'gainLife', amount: 1 }, mayPay([mana('1')], draw)],
        },
      },
    ]);
    expect(
      abilities(
        'At the beginning of your upkeep, you may pay {1}. If you do, draw a card. Gain 1 life.',
      ),
    ).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [mayPay([mana('1')], draw), { kind: 'gainLife', amount: 1 }],
        },
      },
    ]);
  });

  test("replay: Extort spelled out (CR 702.101a), the engine's own expansion", () => {
    expect(
      abilities(
        'Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain life equal to the total life lost this way.',
      ),
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'you' },
        effect: mayPay([mana('W/B')], {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
            { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'lifeLostThisWay' } },
          ],
        }),
      },
    ]);
  });

  test.each([
    [
      'At the beginning of your upkeep, you may pay {1}. Draw a card.',
      'an offer with no "If you do"',
    ],
    ['At the beginning of your upkeep, you may pay {1}.', 'an offer and nothing it buys'],
    [
      'At the beginning of your upkeep, you may pay {1}. If you do, you may draw a card.',
      'two questions for one payment',
    ],
    [
      'At the beginning of your upkeep, you may draw a card. You may pay {1}. If you do, gain 2 life.',
      'a "you may" of the whole ability beside an offer',
    ],
    [
      'At the beginning of your upkeep, you may pay {1}. If you do, draw a card. If you do, gain 2 life.',
      'a second "If you do" after the first',
    ],
    ['Pay {1}. Draw a card.', 'a payment nobody offered'],
  ])('"%s" is read and not run (%s)', (text, _why) => {
    const first = dropped(text, text.startsWith('Pay') ? 'sorcery' : 'creature');
    expect(first).toMatchObject({ reason: 'notRunnable' });
  });

  test.each([
    'At the beginning of your upkeep, you may pay {X}. If you do, draw a card.',
    'At the beginning of your upkeep, you may pay {G/P}. If you do, draw a card.',
    'At the beginning of your upkeep, you may pay {1} and 2 life. If you do, draw a card.',
    'At the beginning of your upkeep, you may pay {T}. If you do, draw a card.',
    'At the beginning of your upkeep, you may pay 0 life. If you do, draw a card.',
    'At the beginning of your upkeep, you may pay X life. If you do, draw a card.',
    '{T}: You may pay {1}. If you do, draw a card.',
    'You may pay {1}. If you do, draw a card.',
  ])(
    '"%s" is not read (the engine\'s "you may" is for triggered abilities, and its cost has no X)',
    (text) => {
      expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
    },
  );
});

describe('amount.life-lost-this-way: "equal to the life lost this way" (CR 702.101a, 119.3)', () => {
  const lose = (amount: unknown) => ({
    kind: 'loseLife',
    player: { kind: 'eachOpponent' },
    amount,
  });
  const gain = { kind: 'gainLife', player: { kind: 'you' }, amount: { kind: 'lifeLostThisWay' } };

  test('replay: "Each opponent loses X life. You gain life equal to the life lost this way."', () => {
    expect(
      spellOf('Each opponent loses X life. You gain life equal to the life lost this way.'),
    ).toEqual({
      effect: { kind: 'sequence', effects: [lose({ kind: 'x' }), gain] },
      x: true,
    });
  });

  test('"the total life lost this way", in one sentence and after another instruction', () => {
    expect(
      effectOf(
        'Each opponent loses 2 life and you gain life equal to the total life lost this way.',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [lose(2), gain],
    });
    expect(
      effectOf(
        'Draw a card. Each opponent loses 2 life. You gain life equal to the life lost this way.',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [{ kind: 'draw', player: { kind: 'you' }, count: 1 }, lose(2), gain],
    });
  });

  test.each([
    ['You gain life equal to the life lost this way.', 'nothing lost it'],
    [
      'You gain life equal to the life lost this way. Each opponent loses 1 life.',
      'the loss comes after',
    ],
    ['Draw a card. You gain life equal to the life lost this way.', 'no loss before it'],
  ])('"%s" is read and not run (%s)', (text, _why) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'notRunnable' });
  });

  test.each([
    'You lose life equal to the life lost this way.',
    'Each opponent loses 1 life. You gain life equal to the life lost.',
    'Each opponent loses 1 life. You gain life equal to life lost this way.',
    'Each opponent loses 1 life. You gain life equal to the life lost this turn.',
    'Each opponent loses 1 life. You gain life equal to the damage dealt this way.',
    'Each opponent loses 1 life. You gain life equal to the life lost this way plus 1.',
  ])('"%s" is not read', (text) => {
    expect(dropped(text, 'sorcery')).toMatchObject({ reason: 'unrecognised' });
  });
});
