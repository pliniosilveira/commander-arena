// Strago and Relm (deck support issue 97): "Target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card. You may cast that card
// without paying its mana cost. If you cast a creature spell this way, it gains haste and "At the beginning of the end step, sacrifice this creature."", read through the whole
// grammar. The first test is the real Oracle text of the acceptance card of the golden corpus (names replaced by ~); the others are SYNTHETIC siblings and near misses. The engine runs
// what is lowered in convert-grammar-engine-strago.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const EXILE =
  'Target opponent exiles cards from the top of their library until they exile an instant, sorcery, or creature card.';
const CAST = 'You may cast that card without paying its mana cost.';
const RIDER =
  'If you cast a creature spell this way, it gains haste and "At the beginning of the end step, sacrifice ~."';
const ANY_OF = {
  anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }, { types: ['creature'] }],
};

describe('Sketch and Lore: exile until a card is found, cast it for free (CR 701.13, 608.2g, 118.9, 613.1f)', () => {
  test('the real text: the exile of the target opponent, the free cast and what a creature spell gains', () => {
    const parsed = readAll(
      `Sketch and Lore — {2}{R}, {T}: ${EXILE} ${CAST} ${RIDER} Activate only as a sorcery.`,
      'creature',
      ['Human', 'Wizard'],
    );
    expect(parsed.abilities).toMatchObject([
      {
        kind: 'activated',
        timing: 'sorcery',
        targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileUntilFound', players: { kind: 'target', id: 't1' }, filter: ANY_OF },
            {
              kind: 'castFree',
              objects: { kind: 'moved' },
              filter: ANY_OF,
              creatureGains: [
                { kind: 'keyword', keyword: { kind: 'haste' } },
                {
                  kind: 'triggered',
                  trigger: { kind: 'endStep' },
                  effect: { kind: 'sacrifice', objects: { kind: 'this' } },
                },
              ],
            },
          ],
        },
      },
    ]);
  });

  test('without the rider the cast gives nothing (SYNTHETIC)', () => {
    const parsed = readAll(
      `{2}{R}, {T}: Target player exiles cards from the top of their library until they exile a nonland card. ${CAST}`,
      'creature',
    );
    const [ability] = parsed.abilities ?? [];
    expect(ability).toMatchObject({
      kind: 'activated',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'exileUntilFound', filter: { notTypes: ['land'] } },
          { kind: 'castFree', objects: { kind: 'moved' }, filter: { notTypes: ['land'] } },
        ],
      },
    });
    expect(JSON.stringify(ability)).not.toContain('creatureGains');
  });

  test.each([
    // The cast must be an offer without a cost: no "you may", a cost paid, or no cast at all.
    `{T}: ${EXILE}`,
    `{T}: ${EXILE} You may cast that card.`,
    `{T}: ${EXILE} Cast that card without paying its mana cost.`,
    // Another player, another library.
    `{T}: Each opponent exiles cards from the top of their library until they exile a creature card. ${CAST}`,
    `{T}: Target opponent exiles cards from their graveyard until they exile a creature card. ${CAST}`,
    // A rider the engine does not read: no ability in quotes, another keyword.
    `{T}: ${EXILE} ${CAST} If you cast a creature spell this way, it gains haste.`,
    `{T}: ${EXILE} ${CAST} If you cast a creature spell this way, it gains flying and "At the beginning of the end step, sacrifice ~."`,
  ])('not read: %s', (text) => {
    expect(dropped(text, 'artifact').reason).toBeDefined();
  });
});
