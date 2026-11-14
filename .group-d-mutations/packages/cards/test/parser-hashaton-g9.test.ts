// The Hashaton deck (issue 31), group 9 (D-390 to D-395): Rona, Herald of Invasion // Rona, Tolarian Obliterator. The cost "{5}{B/P}: Transform ~. Activate
// only as a sorcery." (CR 107.4f, 602.5d, 701.27a) and the trigger "Whenever a source deals damage to ~, that source's controller exiles a card from their hand at random. If it's a
// land card, you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost." (CR 603.2, 120.1, 406.3, 701.13, 305.1, 601.2).
// The first line of each is the real Oracle text of the acceptance card of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the
// near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-hashaton-g9.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const TRANSFORM = {
  kind: 'activated',
  cost: [{ kind: 'mana', symbols: ['5', 'B/P'] }],
  timing: 'sorcery',
  effect: { kind: 'transform', objects: { kind: 'this' } },
};

const SUBTYPES = ['Phyrexian', 'Wizard'];
const TRIGGER_PLAYER = { kind: 'triggerPlayer' } as const;
const MOVED = { kind: 'moved' } as const;
const THIS = { kind: 'this' } as const;
const EXILE = { kind: 'exileRandomFromHand', player: TRIGGER_PLAYER };
const IS_A_LAND = { kind: 'objectMatches', of: MOVED, filter: { types: ['land'] } };
const PUT = { kind: 'moveToZone', objects: MOVED, to: 'battlefield', controller: 'you' };
const CAST = { kind: 'castFree', objects: MOVED };

const LEAD =
  "Whenever a source deals damage to ~, that source's controller exiles a card from their hand at random.";
const REAL = `${LEAD} If it's a land card, you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost.`;

describe('Rona, Herald of Invasion: "{5}{B/P}: Transform ~. Activate only as a sorcery." (CR 107.4f, 602.5d, 701.27a)', () => {
  test('the real text: a mana cost with a Phyrexian symbol, the transform, at sorcery timing', () => {
    const parsed = readAll('{5}{B/P}: Transform ~. Activate only as a sorcery.', 'creature', [
      'Human',
      'Wizard',
    ]);
    expect(parsed.abilities).toEqual([TRANSFORM]);
  });

  test('the reminder text of the real card does not stop the line', () => {
    const parsed = readAll(
      '{5}{B/P}: Transform ~. Activate only as a sorcery. ({B/P} can be paid with either {B} or 2 life.)',
      'creature',
      ['Human', 'Wizard'],
    );
    expect(parsed.abilities).toEqual([TRANSFORM]);
  });

  test('another Phyrexian cost and another effect (SYNTHETIC)', () => {
    expect(readAll('{B/P}: Draw a card.', 'creature').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['B/P'] }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
    expect(readAll('{1}{U/P}{U/P}, {T}: Draw a card.', 'creature').abilities).toMatchObject([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['1', 'U/P', 'U/P'] }, { kind: 'tap' }],
      },
    ]);
  });

  test.each([
    // a mana ability's cost has no Phyrexian symbol the engine runs
    '{B/P}, {T}: Add {G}.',
    // a Phyrexian symbol with a hybrid, X or snow symbol; hybrid Phyrexian; no color
    '{B/P}{R/W}: Draw a card.',
    '{B/P}{X}: Draw X cards.',
    '{W/U/P}: Draw a card.',
    '{P}: Draw a card.',
    '{2/P}: Draw a card.',
    // not a cost of its own: the symbols are separated by a space
    '{B/P} {B/P}: Draw a card.',
  ])('another cost is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test.each([
    // a keyword's cost: Cycling, Equip and Ward have no Phyrexian symbol the engine runs
    'Cycling {B/P}',
    'Equip {1}{B/P}',
    'Ward {B/P}',
  ])('a keyword with a Phyrexian cost stays unparsed (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities).toEqual([]);
  });

  test('a Phyrexian symbol is an ordinary activation only: the lowering names the engine feature it needs', () => {
    const missing = withoutFeature('cost:mana', '{5}{B/P}: Transform ~.', 'creature', SUBTYPES);
    expect(missing.needs).toContain('cost:mana');
  });
});

describe('Rona, Tolarian Obliterator: "Whenever a source deals damage to ~, that source\'s controller exiles a card from their hand at random." (CR 603.2, 120.3, 701.13)', () => {
  test('the trigger and the exile: the player is the controller of the source (the trigger player)', () => {
    expect(readAll(LEAD, 'creature', SUBTYPES).abilities).toEqual([
      { kind: 'triggered', trigger: { kind: 'dealtDamage', what: THIS }, effect: EXILE },
    ]);
  });

  test('the real text, whole: the exile, then the land offer or the free cast', () => {
    expect(readAll(REAL, 'creature', SUBTYPES).abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dealtDamage', what: THIS },
        effect: {
          kind: 'sequence',
          effects: [
            EXILE,
            {
              kind: 'conditional',
              condition: IS_A_LAND,
              effect: { kind: 'may', effect: PUT },
              else: CAST,
            },
          ],
        },
      },
    ]);
  });

  test('combat damage only, and another subject of the damage (SYNTHETIC)', () => {
    expect(
      readAll(
        "Whenever a source deals combat damage to ~, that source's controller exiles a card from their hand at random.",
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dealtDamage', what: THIS, combat: true },
        effect: EXILE,
      },
    ]);
    expect(
      readAll(
        "Whenever a source deals damage to a creature you control, that source's controller exiles a card from their hand at random.",
        'enchantment',
      ).abilities,
    ).toMatchObject([
      {
        trigger: { kind: 'dealtDamage', what: { types: ['creature'], controller: 'you' } },
        effect: EXILE,
      },
    ]);
  });

  test('the same phrases with the player of another trigger: "that player" (SYNTHETIC)', () => {
    expect(
      readAll(
        'Whenever ~ deals combat damage to a player, that player exiles a card from their hand at random.',
        'creature',
      ).abilities,
    ).toMatchObject([{ effect: EXILE }]);
  });

  test('the two offers without the other branch, and mandatory forms (SYNTHETIC)', () => {
    // each alone: the land with no "otherwise", the cast with no test
    expect(
      readAll(`${LEAD} If it's a land card, you may put it onto the battlefield.`, 'creature')
        .abilities,
    ).toMatchObject([
      {
        effect: {
          effects: [
            EXILE,
            { kind: 'conditional', condition: IS_A_LAND, effect: { kind: 'may', effect: PUT } },
          ],
        },
      },
    ]);
    expect(
      readAll(`${LEAD} You may cast it without paying its mana cost.`, 'creature').abilities,
    ).toMatchObject([{ effect: { effects: [EXILE, CAST] } }]);
    // a land that is put with no choice
    expect(
      readAll(`${LEAD} If it's a land card, put it onto the battlefield.`, 'creature').abilities,
    ).toMatchObject([
      { effect: { effects: [EXILE, { kind: 'conditional', condition: IS_A_LAND, effect: PUT }] } },
    ]);
    // another card type as the test
    expect(
      readAll(
        `${LEAD} If it's a creature card, put it onto the battlefield. Otherwise, you may cast it without paying its mana cost.`,
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        effect: {
          effects: [
            EXILE,
            {
              condition: { kind: 'objectMatches', filter: { types: ['creature'] } },
              effect: PUT,
              else: CAST,
            },
          ],
        },
      },
    ]);
  });

  test.each([
    // the exile: another number, hand, player or way
    "Whenever a source deals damage to ~, that source's controller exiles two cards from their hand at random.",
    "Whenever a source deals damage to ~, that source's controller exiles a card from their hand.",
    "Whenever a source deals damage to ~, that source's controller exiles a card from their graveyard at random.",
    "Whenever a source deals damage to ~, that source's controller discards a card at random and draws a card.",
    "Whenever a source deals damage to ~, that source's owner exiles a card from their hand at random.",
    'Whenever a source deals damage to ~, each opponent exiles a card from their hand at random.',
    // the trigger: a source of a kind, damage to a player, another event
    "Whenever a source you control deals damage to ~, that source's controller exiles a card from their hand at random.",
    "Whenever a creature deals damage to ~, that source's controller exiles a card from their hand at random.",
    "Whenever a source deals damage to you, that source's controller exiles a card from their hand at random.",
    "Whenever a source deals noncombat damage to ~, that source's controller exiles a card from their hand at random.",
    // "that source's controller" with no source to name: the trigger is about something else
    "Whenever ~ attacks, that source's controller exiles a card from their hand at random.",
    "Whenever ~ is dealt damage, that source's controller exiles a card from their hand at random.",
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test.each([
    // the land offer: tapped, attacking, owner's control, another test, it is not the exiled card
    `${LEAD} If it's a land card, you may put it onto the battlefield tapped.`,
    `${LEAD} If it's a land card, you may put it onto the battlefield under its owner's control.`,
    `${LEAD} If it's a land card, you may put it into your hand.`,
    `${LEAD} If it's a land card, you may put them onto the battlefield.`,
    // the cast: no "you may" (the engine's question is a choice), another cost, another duration
    `${LEAD} If it's a land card, you may put it onto the battlefield. Otherwise, cast it without paying its mana cost.`,
    `${LEAD} Cast it without paying its mana cost.`,
    `${LEAD} You may cast it by paying {2} rather than its mana cost.`,
    `${LEAD} You may cast it without paying its mana cost this turn.`,
    // the other branch is an instruction that is not a question of its own
    `${LEAD} If it's a land card, you may put it onto the battlefield. Otherwise, you may draw a card.`,
    // "it" with no exiled card before it
    "Whenever a source deals damage to ~, if it's a land card, you may put it onto the battlefield.",
    'Whenever ~ attacks, you may cast it without paying its mana cost.',
    'Whenever ~ attacks, put it onto the battlefield under your control.',
  ])('the offers read only after the exile (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature');
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('"it" after another instruction is not the exiled card: a pronoun for something else stays unbound', () => {
    const parsed = read(
      "Whenever a source deals damage to ~, that source's controller draws a card. You may cast it without paying its mana cost.",
      'creature',
    );
    expect(parsed.abilities).toEqual([]);
  });
});

describe('a line whose engine feature is not listed names it (D-068)', () => {
  const CASES = [
    ['effect:exileRandomFromHand', LEAD],
    ['effect:castFree', `${LEAD} You may cast it without paying its mana cost.`],
    ['selector:moved', `${LEAD} You may cast it without paying its mana cost.`],
    ['selector:triggerPlayer', LEAD],
    ['effect:may', `${LEAD} If it's a land card, you may put it onto the battlefield.`],
    ['condition:objectMatches', REAL],
    ['effect:moveToZone', `${LEAD} If it's a land card, put it onto the battlefield.`],
  ] as const;

  test.each(CASES)('without %s', (ref, text) => {
    const missing = withoutFeature(ref, text, 'creature', SUBTYPES);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, 'creature', SUBTYPES);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowering of this slice names is declared', () => {
    for (const ref of [
      'effect:exileRandomFromHand',
      'effect:castFree',
      'selector:moved',
      'effect:moveToZone',
      'selector:triggerPlayer',
      'cost:mana',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
