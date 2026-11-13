// The Danitha deck program (issue 26), group 1A (D-396, D-397): "Reveal the top five cards of your library. You may put a creature or enchantment card from among them into
// your hand. Put the rest into your graveyard." (Commune with the Gods, Satyr Wayfinder, Vessel of Nascency, Malevolent Rumble). The lines are the real Oracle text of the
// acceptance cards of the golden corpus, read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs
// what is lowered in convert-grammar-engine-danitha-g1a.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS, splitSentences } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { dropped, read, readAll, spellEffect, withoutFeature } from './parser-p5-helpers';

const PERMANENT = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'].map(
  (t) => ({ types: [t] }),
);

const reveal = (count: number, filter: object) => ({
  kind: 'lookAtTop',
  count,
  revealAll: true,
  take: { filter, max: 1 },
  rest: 'graveyard',
});

const COMMUNE =
  'Reveal the top five cards of your library. You may put a creature or enchantment card from among them into your hand. Put the rest into your graveyard.';

describe('the three sentences are one instruction', () => {
  test('kept together by the sentence splitter, and no more', () => {
    expect(splitSentences(COMMUNE, 0, COMMUNE.length)).toEqual([{ start: 0, end: COMMUNE.length }]);
    const spawn = `${COMMUNE} Create a 0/1 colorless Eldrazi Spawn creature token.`;
    expect(splitSentences(spawn, 0, spawn.length)).toEqual([
      { start: 0, end: COMMUNE.length },
      { start: COMMUNE.length + 1, end: spawn.length },
    ]);
  });

  test('two of the three are not joined', () => {
    const two =
      'Reveal the top five cards of your library. You may put a creature card from among them into your hand.';
    expect(splitSentences(two, 0, two.length)).toHaveLength(2);
  });
});

describe('the real lines', () => {
  test('Commune with the Gods: a creature or enchantment card', () => {
    expect(spellEffect(COMMUNE, 'sorcery')).toEqual(
      reveal(5, { anyOf: [{ types: ['creature'] }, { types: ['enchantment'] }] }),
    );
  });

  test('Satyr Wayfinder: an enters trigger and a land card', () => {
    const parsed = readAll(
      'When this creature enters, reveal the top four cards of your library. You may put a land card from among them into your hand. Put the rest into your graveyard.',
      'creature',
      ['Satyr'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: reveal(4, { types: ['land'] }),
      },
    ]);
  });

  test('Vessel of Nascency: after a cost with a sacrifice, a list of five types', () => {
    const parsed = readAll(
      '{1}{G}, Sacrifice this enchantment: Reveal the top four cards of your library. You may put an artifact, creature, enchantment, land, or planeswalker card from among them into your hand. Put the rest into your graveyard.',
      'enchantment',
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['1', 'G'] },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: reveal(4, {
          anyOf: ['artifact', 'creature', 'enchantment', 'land', 'planeswalker'].map((t) => ({
            types: [t],
          })),
        }),
      },
    ]);
  });

  test('Malevolent Rumble: a permanent card, then the token sentence on its own', () => {
    const effect = spellEffect(
      'Reveal the top four cards of your library. You may put a permanent card from among them into your hand. Put the rest into your graveyard. Create a 0/1 colorless Eldrazi Spawn creature token with "Sacrifice this token: Add {C}."',
      'sorcery',
    );
    expect(effect).toMatchObject({
      kind: 'sequence',
      effects: [reveal(4, { anyOf: PERMANENT }), { kind: 'createToken', count: 1 }],
    });
  });
});

describe('other kinds and counts (SYNTHETIC)', () => {
  test('a card of any kind, and an instant or sorcery card', () => {
    expect(
      spellEffect(
        'Reveal the top three cards of your library. You may put a card from among them into your hand. Put the rest into your graveyard.',
        'sorcery',
      ),
    ).toMatchObject({ kind: 'lookAtTop', count: 3, revealAll: true, take: { max: 1 } });
    expect(
      spellEffect(
        'Reveal the top six cards of your library. You may put an instant or sorcery card from among them into your hand. Put the rest into your graveyard.',
        'sorcery',
      ),
    ).toEqual(
      reveal(6, {
        anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
      }),
    );
  });

  test('"a permanent card" is also read where the cards are only looked at (the same card phrase)', () => {
    expect(
      spellEffect(
        'Look at the top four cards of your library. You may reveal a permanent card from among them and put it into your hand. Put the rest into your graveyard.',
        'sorcery',
      ),
    ).toEqual({
      kind: 'lookAtTop',
      count: 4,
      take: { filter: { anyOf: PERMANENT }, max: 1 },
      rest: 'graveyard',
    });
  });

  test('a creature subtype and a mixed list of types and subtypes', () => {
    expect(
      spellEffect(
        'Reveal the top five cards of your library. You may put a Dragon card from among them into your hand. Put the rest into your graveyard.',
        'sorcery',
      ),
    ).toMatchObject({
      kind: 'lookAtTop',
      revealAll: true,
      take: { filter: { subtypes: ['Dragon'] } },
    });
  });
});

describe('what is not read stays unsupported (a card is supported or unsupported, never partly)', () => {
  test.each([
    // The rest anywhere but the graveyard (another rule would have to say where, and when).
    'Reveal the top five cards of your library. You may put a creature card from among them into your hand. Put the rest on the bottom of your library in a random order.',
    'Reveal the top five cards of your library. You may put a creature card from among them into your hand. Put the rest into your hand.',
    // The card anywhere but the hand.
    'Reveal the top five cards of your library. You may put a creature card from among them onto the battlefield. Put the rest into your graveyard.',
    // More than one card.
    'Reveal the top five cards of your library. You may put two creature cards from among them into your hand. Put the rest into your graveyard.',
    // A count that is not a number of two or more, or another library.
    'Reveal the top card of your library. You may put a creature card from among them into your hand. Put the rest into your graveyard.',
    'Reveal the top X cards of your library. You may put a creature card from among them into your hand. Put the rest into your graveyard.',
    'Reveal the top five cards of target player’s library. You may put a creature card from among them into your hand. Put the rest into your graveyard.',
    // A sentence missing.
    'Reveal the top five cards of your library. Put the rest into your graveyard.',
    'Reveal the top five cards of your library. You may put a creature card from among them into your hand.',
    // A list that is not English.
    'Reveal the top five cards of your library. You may put a creature, enchantment card from among them into your hand. Put the rest into your graveyard.',
    // The cards are looked at, which is another rule: "reveal" after "you may" is where it belongs.
    'Reveal the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest into your graveyard.',
  ])('%s', (text) => {
    const parsed = read(text, 'sorcery');
    expect(parsed.spell ?? null, text).toBeNull();
    expect(parsed.unparsed.length, text).toBeGreaterThan(0);
  });

  test('a dropped line says it was not recognised', () => {
    expect(
      dropped(
        'Reveal the top five cards of your library. You may put a creature card from among them into your hand. Put the rest into exile.',
        'sorcery',
      ),
    ).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('the line names the feature the engine lacks (D-068)', () => {
  test('without effect:lookAtTop', () => {
    const missing = withoutFeature('effect:lookAtTop', COMMUNE, 'sorcery');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:lookAtTop');
  });

  test('a blocked line leaves the face with no spell (never half-executed)', () => {
    BLOCKED.clear();
    BLOCKED.add('effect:lookAtTop');
    try {
      expect(read(COMMUNE, 'sorcery').spell ?? null).toBeNull();
    } finally {
      BLOCKED.clear();
    }
  });

  test('the feature is declared', () => {
    expect(DECLARED_NEEDS).toContain('effect:lookAtTop');
  });
});
