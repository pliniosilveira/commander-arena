// The verb "manifest" (CR 701.40a, D-967): the actor forms of `effect.player` ("its controller manifests the top card of their library", "you manifest ...", "target player
// manifests ...") and the imperative `effect.manifest` ("Manifest the top card of your library."), read and lowered to the engine's `manifest` effect; and what stays unread:
// manifest dread, cloak, several cards, another player's library. The wordings are the real one of Reality Shift (the golden corpus, issue 25) and SYNTHETIC variants.
import { validateCard } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { dropped, read, readAll, spellEffect, T1 } from './parser-p5-helpers';

const YOU = { kind: 'you' } as const;

describe('what the lowering builds', () => {
  test('"Manifest the top card of your library." is the effect for you', () => {
    expect(spellEffect('Manifest the top card of your library.', 'sorcery')).toEqual({
      kind: 'manifest',
      player: YOU,
    });
  });

  test('the same, as the effect of an enters trigger', () => {
    const face = readAll('When ~ enters, manifest the top card of your library.', 'creature');
    expect(face.abilities).toMatchObject([
      { kind: 'triggered', effect: { kind: 'manifest', player: YOU } },
    ]);
  });

  test('"Its controller manifests the top card of their library." after an exile is the controller of the exiled creature (Reality Shift)', () => {
    expect(
      spellEffect(
        'Exile target creature. Its controller manifests the top card of their library.',
        'instant',
      ),
    ).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'exile', objects: T1 },
        { kind: 'manifest', player: { kind: 'controllerOf', of: T1 } },
      ],
    });
  });

  test('"Target player manifests ...", "each player manifests ..." and "you manifest ..." name their player', () => {
    expect(
      spellEffect('Target player manifests the top card of their library.', 'sorcery'),
    ).toMatchObject({ kind: 'manifest', player: { kind: 'target' } });
    expect(spellEffect('Each player manifests the top card of their library.', 'sorcery')).toEqual({
      kind: 'manifest',
      player: { kind: 'eachPlayer' },
    });
    expect(spellEffect('You manifest the top card of your library.', 'sorcery')).toEqual({
      kind: 'manifest',
      player: YOU,
    });
  });

  test('the reminder text in parentheses is dropped like every reminder text', () => {
    const text =
      "Exile target creature. Its controller manifests the top card of their library. (That player puts the top card of their library onto the battlefield face down as a 2/2 creature. If it's a creature card, it can be turned face up any time for its mana cost.)";
    const face = readAll(text, 'instant');
    expect(face.spell?.effect).toMatchObject({ kind: 'sequence' });
    expect(face.unparsed).toEqual([]);
  });

  test('a manifest with another instruction in the same sentence is read too', () => {
    expect(
      spellEffect('Manifest the top card of your library and you gain 2 life.', 'sorcery'),
    ).toMatchObject({
      kind: 'sequence',
      effects: [{ kind: 'manifest', player: YOU }, { kind: 'gainLife' }],
    });
  });

  test('what it builds is a valid card', () => {
    const effect = spellEffect('Manifest the top card of your library.', 'sorcery');
    const def = {
      oracleId: null,
      name: 'SYNTHETIC Parsed Manifest',
      layout: 'normal' as const,
      faces: [
        {
          name: 'SYNTHETIC Parsed Manifest',
          manaCost: ['2', 'G'],
          supertypes: [],
          types: ['sorcery' as const],
          subtypes: [],
          colors: ['G' as const],
          power: null,
          toughness: null,
          loyalty: null,
          defense: null,
          oracleText: 'Manifest the top card of your library.',
          abilities: [],
          spell: { effect },
        },
      ],
      colorIdentity: ['G' as const],
      support: 'supported' as const,
    };
    expect(validateCard(def as never)).toEqual([]);
  });
});

describe('what stays unread (never guessed)', () => {
  const unread = (text: string, type: 'instant' | 'sorcery' | 'creature' = 'sorcery') => {
    const parsed = read(text, type);
    expect(parsed.unparsed.length, text).toBeGreaterThan(0);
    expect(parsed.spell?.effect ?? null, text).toBeNull();
  };

  test('manifest dread (CR 701.62) and cloak (CR 701.58) are other instructions', () => {
    unread('Manifest dread.');
    unread('Cloak the top card of your library.');
  });

  test('several cards, another library, face up, a bare verb', () => {
    unread('Manifest the top two cards of your library.');
    unread("Manifest the top card of target opponent's library.");
    unread('Its controller manifests the top two cards of their library.');
    unread('Manifest the top card.');
    unread('Manifest.');
  });

  test('a wrong person is not read: "its controller manifests ... your library"', () => {
    expect(
      dropped('Its controller manifests the top card of your library.', 'sorcery'),
    ).toBeDefined();
    expect(dropped('You manifests the top card of your library.', 'sorcery')).toBeDefined();
  });
});

describe('the engine feature is declared and checked', () => {
  test('without the feature the line is recognised but not runnable, naming it', () => {
    BLOCKED.clear();
    BLOCKED.add('effect:manifest');
    try {
      const parsed = read('Manifest the top card of your library.', 'sorcery');
      expect(parsed.unparsed).toHaveLength(1);
      expect(parsed.unparsed[0]).toMatchObject({
        reason: 'notRunnable',
        needs: ['effect:manifest'],
      });
      expect(parsed.spell).toBeNull();
      const actor = read(
        'Exile target creature. Its controller manifests the top card of their library.',
        'instant',
      );
      expect(actor.unparsed[0]).toMatchObject({
        reason: 'notRunnable',
        needs: ['effect:manifest'],
      });
    } finally {
      BLOCKED.clear();
    }
  });
});
