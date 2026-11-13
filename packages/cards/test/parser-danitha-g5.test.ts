// The Danitha deck (issue 26), group 5 (D-1250 to D-1253, provisional): the lines of Sterling Grove, Shielded by Faith, Spiral into Solitude and Timely Ward. The first lines of each
// block are the real Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar
// must not read. The engine runs what is lowered in convert-grammar-engine-danitha-g5.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const THIS = { kind: 'this' } as const;

describe('Sterling Grove: "then shuffle and put that card on top" (CR 701.23, 701.24b)', () => {
  const LINE =
    '{1}, Sacrifice ~: Search your library for an enchantment card, reveal it, then shuffle and put that card on top.';

  test('the real line: the sacrifice, and a search whose card goes to the top of the library after the shuffle', () => {
    const parsed = readAll(LINE, 'enchantment');
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1'] },
          { kind: 'sacrifice', what: THIS },
        ],
        effect: {
          kind: 'search',
          player: { kind: 'you' },
          filter: { types: ['enchantment'] },
          max: 1,
          destinations: [{ zone: 'library', count: 1 }],
          reveal: true,
          shuffle: true,
        },
      },
    ]);
  });

  test('the other line of the card: other enchantments you control have shroud', () => {
    const parsed = readAll('Other enchantments you control have shroud.', 'enchantment');
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { types: ['enchantment'], controller: 'you' },
            other: true,
          },
          keyword: { kind: 'shroud' },
        },
      },
    ]);
  });

  test.each([
    ['Search your library for a card, then shuffle and put that card on top.', {}, false],
    [
      'Search your library for an instant or sorcery card, reveal it, then shuffle and put it on top of your library.',
      {},
      true,
    ],
    [
      'Search your library for a creature card, reveal that card, then shuffle and put the card on top.',
      {},
      true,
    ],
  ])('the same ending after other searches (SYNTHETIC): %s', (text, _o, reveal) => {
    const parsed = readAll(text, 'sorcery');
    expect(parsed.spell).toMatchObject({
      effect: {
        kind: 'search',
        max: 1,
        destinations: [{ zone: 'library', count: 1 }],
        reveal,
        shuffle: true,
      },
    });
  });

  test.each([
    // the order: the card is put on top and then shuffled in (a different instruction)
    'Search your library for a card, put it on top of your library, then shuffle.',
    // several cards: an order would be needed
    'Search your library for up to two cards, reveal them, then shuffle and put them on top.',
    'Search your library for a card, reveal it, then shuffle and put those cards on top.',
    // another place
    'Search your library for a card, reveal it, then shuffle and put it on the bottom.',
    'Search your library for a card, reveal it, then shuffle and put it into your hand.',
    // the words around
    'Search your library for a card, reveal it, then shuffle it and put that card on top.',
    'Search target opponent’s library for a card, then shuffle and put that card on top.',
    'Search your library for a card, then shuffle and put that card on top of target player’s library.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'sorcery');
    expect(parsed.unparsed.length).toBeGreaterThan(0);
    expect(parsed.spell ?? null).toBeNull();
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('searchDestination:library', LINE, 'enchantment');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('searchDestination:library');
    expect(DECLARED_NEEDS).toContain('searchDestination:library');
  });
});

describe('Shielded by Faith: "Whenever a creature enters, you may attach this Aura to that creature." (CR 701.3, 303.4j)', () => {
  const LINE = 'Whenever a creature enters, you may attach ~ to that creature.';
  const AURA = ['Aura'];

  test('the real line: an optional trigger that attaches the Aura to the permanent the trigger is about', () => {
    const parsed = readAll(LINE, 'enchantment', AURA);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { types: ['creature'] } },
        effect: { kind: 'attach', object: THIS, to: { kind: 'triggerSubject' } },
        optional: true,
      },
    ]);
  });

  test('a creature you control enters, and an Equipment attaches the same way (SYNTHETIC)', () => {
    const own = readAll(
      'Whenever a creature you control enters, you may attach ~ to that creature.',
      'enchantment',
      AURA,
    );
    expect(own.abilities[0]).toMatchObject({
      trigger: { kind: 'entersBattlefield', what: { types: ['creature'], controller: 'you' } },
      effect: { kind: 'attach', to: { kind: 'triggerSubject' } },
      optional: true,
    });
    const equipment = readAll(
      'Whenever a creature enters, you may attach ~ to that creature.',
      'artifact',
      ['Equipment'],
    );
    expect(equipment.abilities[0]).toMatchObject({
      effect: { kind: 'attach', object: THIS, to: { kind: 'triggerSubject' } },
    });
  });

  test('the Aura named in the sentence is not "that creature": the pronoun is the trigger’s', () => {
    const parsed = readAll(LINE, 'enchantment', AURA);
    const [ability] = parsed.abilities;
    if (ability?.kind !== 'triggered') throw new Error('triggered ability expected');
    expect(ability.effect).toMatchObject({ kind: 'attach', object: THIS });
    expect(ability.effect).not.toMatchObject({ to: THIS });
  });

  test.each([
    // "that creature" with no creature the text names
    'Whenever you gain life, you may attach ~ to that creature.',
    'At the beginning of your upkeep, you may attach ~ to that creature.',
    // not one object
    'Whenever a creature enters, you may attach ~ to those creatures.',
    'Whenever a creature enters, you may attach ~ to each creature.',
    'Whenever a creature enters, you may attach ~ to that creature card.',
    // an Aura attached to itself or to a player
    'Whenever a creature enters, you may attach ~ to ~.',
    'Whenever a creature enters, you may attach ~ to that player.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'enchantment', AURA);
    expect(parsed.unparsed.length).toBeGreaterThan(0);
    expect(parsed.abilities.filter((a) => a.kind === 'triggered')).toEqual([]);
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('selector:triggerSubject', LINE, 'enchantment', AURA);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:triggerSubject');
    expect(DECLARED_NEEDS).toContain('selector:triggerSubject');
    expect(DECLARED_NEEDS).toContain('effect:attach');
  });
});

describe('Spiral into Solitude: "can’t attack or block" and "Blight 1" (CR 508.1a, 509.1a, 701.68)', () => {
  const STATIC = "Enchanted creature can't attack or block.";
  const ACTIVATED = '{1}{W}, Blight 1, Sacrifice ~: Exile enchanted creature.';
  const AURA = ['Aura'];
  const ATTACHED = { kind: 'attached', types: ['creature'] } as const;

  test('the real static line: two restrictions of the enchanted creature, each its own static ability', () => {
    const parsed = readAll(STATIC, 'enchantment', AURA);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'restriction', subject: ATTACHED, restriction: 'cantAttack' },
      },
      {
        kind: 'static',
        static: { kind: 'restriction', subject: ATTACHED, restriction: 'cantBlock' },
      },
    ]);
  });

  test('the real activated line: mana, a blight, the sacrifice of the Aura; the effect exiles the enchanted creature', () => {
    const parsed = readAll(ACTIVATED, 'enchantment', AURA);
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1', 'W'] },
          { kind: 'blight', count: 1 },
          { kind: 'sacrifice', what: THIS },
        ],
        effect: { kind: 'exile', objects: { kind: 'attached' } },
      },
    ]);
  });

  test('"can’t attack" alone, and "can’t attack" joined to a grant (SYNTHETIC)', () => {
    expect(readAll("Enchanted creature can't attack.", 'enchantment', AURA).abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'restriction', subject: ATTACHED, restriction: 'cantAttack' },
      },
    ]);
    const both = readAll("Enchanted creature has flying and can't attack.", 'enchantment', AURA);
    expect(both.abilities.map((a) => (a.kind === 'static' ? a.static.kind : a.kind))).toEqual([
      'grantKeyword',
      'restriction',
    ]);
  });

  test('a blight of another number, and other things Aura abilities exile (SYNTHETIC)', () => {
    const two = readAll('{T}, Blight 2: Draw a card.', 'creature');
    expect(two.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }, { kind: 'blight', count: 2 }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
    const equipment = readAll('{2}, Sacrifice ~: Exile equipped creature.', 'artifact', [
      'Equipment',
    ]);
    expect(equipment.abilities[0]).toMatchObject({
      effect: { kind: 'exile', objects: { kind: 'attached' } },
    });
  });

  test.each([
    // the restriction is said of the enchanted permanent only
    "Creatures you control can't attack.",
    "~ can't attack or block.",
    "Enchanted creature can't attack or block alone.",
    "Enchanted creature can't attack you or planeswalkers you control.",
    "Enchanted creature can't attack or",
    // the blight
    '{1}{W}, Blight X, Sacrifice ~: Exile enchanted creature.',
    '{1}{W}, Blight one, Sacrifice ~: Exile enchanted creature.',
    '{1}{W}, Blight 0, Sacrifice ~: Exile enchanted creature.',
    '{1}{W}, Blight, Sacrifice ~: Exile enchanted creature.',
    // a blight is the cost of an ordinary activated ability, not of a mana ability or a spell
    '{T}, Blight 1: Add {G}.',
    'As an additional cost to cast this spell, blight 1.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'enchantment', AURA);
    expect(parsed.unparsed.length).toBeGreaterThan(0);
  });

  test('the lines name the features the engine lacks (D-068)', () => {
    const missing = withoutFeature('cost:blight', ACTIVATED, 'enchantment', AURA);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('cost:blight');
    expect(DECLARED_NEEDS).toContain('cost:blight');
    const restriction = withoutFeature('static:restriction', STATIC, 'enchantment', AURA);
    expect(restriction).toMatchObject({ reason: 'notRunnable' });
    expect(restriction.needs).toContain('static:restriction');
  });

  test('a blocked line leaves the face with no half of the card (never half-executed)', () => {
    BLOCKED.clear();
    BLOCKED.add('cost:blight');
    try {
      const parsed = read(ACTIVATED, 'enchantment', AURA);
      expect(parsed.abilities).toEqual([]);
      expect(parsed.unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });
});

describe('Timely Ward: "You may cast this spell as though it had flash if it targets a commander." (CR 601.3b, 601.3d)', () => {
  const LINE = 'You may cast ~ as though it had flash if it targets a commander.';
  const AURA = ['Aura'];

  test('the real line: the spell’s own permission, with the condition on what it targets', () => {
    const parsed = readAll(LINE, 'enchantment', AURA);
    expect(parsed.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'castAsThoughFlash', spells: THIS },
        condition: { kind: 'spellTargets', filter: { commander: true } },
      },
    ]);
  });

  test('another kind of object it targets (SYNTHETIC)', () => {
    const creature = readAll(
      'You may cast ~ as though it had flash if it targets a creature.',
      'enchantment',
      AURA,
    );
    expect(creature.abilities[0]).toMatchObject({
      condition: { kind: 'spellTargets', filter: { types: ['creature'] } },
    });
    const commander = readAll(
      'You may cast ~ as though it had flash if it targets a creature commander.',
      'enchantment',
      AURA,
    );
    expect(commander.abilities[0]).toMatchObject({
      condition: { kind: 'spellTargets', filter: { types: ['creature'], commander: true } },
    });
  });

  test('the permission of permanents is the other rule, and the two do not read each other', () => {
    const permanents = readAll(
      'You may cast artifact spells as though they had flash.',
      'artifact',
    );
    expect(permanents.abilities[0]).toMatchObject({
      static: { kind: 'castAsThoughFlash', spells: { types: ['artifact'], controller: 'you' } },
    });
    expect(
      read(
        'You may cast artifact spells as though they had flash if it targets a commander.',
        'artifact',
      ).unparsed.length,
    ).toBeGreaterThan(0);
  });

  test.each([
    'You may cast ~ as though it had flash if it targets a commander',
    'You may cast ~ as though it had flash.',
    'You may cast ~ as though it had flash if it targets commanders.',
    'You may cast ~ as though it had flash if it targets a player.',
    'You may cast ~ as though it had flash if it targets a commander you control.',
    'You may cast ~ as though it had flash if you control a Dragon.',
    'You may cast ~ as though it had haste if it targets a commander.',
    'You may cast ~ from your graveyard as though it had flash if it targets a commander.',
    'You may cast ~ as though it had flash if it doesn’t target a commander.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'enchantment', AURA);
    expect(parsed.unparsed.length).toBeGreaterThan(0);
    expect(parsed.abilities.filter((a) => a.kind === 'static')).toEqual([]);
  });

  test('the line names the features the engine lacks (D-068)', () => {
    for (const ref of [
      'condition:spellTargets',
      'static:castAsThoughFlash',
      'selector:commander',
    ] as const) {
      const missing = withoutFeature(ref, LINE, 'enchantment', AURA);
      expect(missing, ref).toMatchObject({ reason: 'notRunnable' });
      expect(missing.needs, ref).toContain(ref);
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
