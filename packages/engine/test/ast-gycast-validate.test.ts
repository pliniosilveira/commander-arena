// Validation of the graveyard casts of the Revenant Recon deck: `mayCast` of a `choose` selector (Mission Briefing, CR 608.2d, 601.2) and `castFree` of a graveyard `choose` whose
// `manaValueAtMost` is the mana value of a target (Counterpoint, CR 608.2g, 202.3, 608.2h): what is accepted, and what is refused with a message, never half run. SYNTHETIC cards.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { validateCard } from '../src/index';

function withSpell(name: string, spell: unknown) {
  return singleFace({
    name,
    manaCost: ['1'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Test.',
    types: ['instant'],
    spell,
  } as never);
}

const messages = (card: Parameters<typeof validateCard>[0]) =>
  validateCard(card).map((i) => i.message);

const spells = { anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] };

const briefing = (permission: Record<string, unknown>, filter: object = {}) =>
  withSpell('SYNTHETIC Briefing', {
    effect: {
      kind: 'mayCast',
      objects: { kind: 'choose', filter: { zone: 'graveyard', ...spells, ...filter } },
      duration: 'untilEndOfTurn',
      ...permission,
    },
  });

describe('mayCast of a card chosen from the graveyard', () => {
  test.each([[{}], [{ exileInstead: true }]])('%o is valid', (permission) => {
    expect(messages(briefing(permission))).toEqual([]);
  });

  test('a card of another zone is refused', () => {
    expect(messages(briefing({}, { zone: 'hand' })).join('\n')).toContain('graveyard');
  });

  test('a count is refused: one card is chosen', () => {
    const card = withSpell('SYNTHETIC Briefing Many', {
      effect: {
        kind: 'mayCast',
        objects: { kind: 'choose', count: 2, filter: { zone: 'graveyard', ...spells } },
        duration: 'untilEndOfTurn',
      },
    });
    expect(messages(card).join('\n')).toContain('one card is chosen');
  });

  test('another player graveyard (anyGraveyard) is refused', () => {
    expect(messages(briefing({ anyGraveyard: true })).join('\n')).toContain('graveyard');
  });
});

const counterpoint = (filter: Record<string, unknown>) =>
  withSpell('SYNTHETIC Counterpoint', {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { stackKind: 'spell', zone: 'stack' } } },
    ],
    effect: {
      kind: 'sequence',
      effects: [
        { kind: 'counter', objects: { kind: 'target', id: 't1' } },
        {
          kind: 'castFree',
          objects: { kind: 'choose', filter: { zone: 'graveyard', ...spells, ...filter } },
        },
      ],
    },
  });

const valueOfTarget = { kind: 'manaValueOf', of: { kind: 'target', id: 't1' } };

describe('castFree of a graveyard card with the mana value of a target as the limit', () => {
  test('is valid', () => {
    expect(messages(counterpoint({ manaValueAtMost: valueOfTarget }))).toEqual([]);
  });

  test('a limit that reads a target no slot declares is refused', () => {
    const lost = { kind: 'manaValueOf', of: { kind: 'target', id: 'nope' } };
    expect(messages(counterpoint({ manaValueAtMost: lost })).length).toBeGreaterThan(0);
  });

  test('a card chosen from the hand with that limit is refused', () => {
    expect(
      messages(counterpoint({ zone: 'hand', manaValueAtMost: valueOfTarget })).join('\n'),
    ).toContain('graveyard');
  });
});
