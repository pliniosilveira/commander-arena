/**
 * Blitz (CR 702.152a, Sabin, Master Monk) as pure models: the cast labels (from the hand and from the graveyard), the badges, the log line. Fake views, no DOM.
 */
import type { ObjectView, PriorityDecision } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { alternativeBadge, alternativeLogWords, isNamedAlternative } from '../src/game/alt-cost';
import { alternativeLabel } from '../src/ui/decisions/alt-cost';
import { graveyardLabels } from '../src/ui/decisions/flashback';

const card = (patch: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: 'o1',
    name: 'Sabin, Master Monk',
    controller: 0,
    owner: 0,
    zone: 'hand',
    types: ['creature'],
    manaCost: ['4', 'R'],
    castCost: ['4', 'R'],
    oracleText: '',
    keywords: [],
    targets: [],
    alternativeCosts: [{ kind: 'blitz', cost: ['2', 'R', 'R'], discard: 1 }],
    ...patch,
  }) as ObjectView;

describe('blitz in the interface', () => {
  test('the cast button names the cost and the discard', () => {
    expect(alternativeLabel('blitz', card())).toBe('Blitz {2}{R}{R}, discard 1 card');
  });

  test('a blitz cost with no discard is the mana alone', () => {
    const plain = card({ alternativeCosts: [{ kind: 'blitz', cost: ['1', 'B'] }] });
    expect(alternativeLabel('blitz', plain)).toBe('Blitz {1}{B}');
  });

  test('blitz is a named alternative and the log says what it was cast for', () => {
    expect(isNamedAlternative('blitz')).toBe(true);
    expect(alternativeLogWords('blitz')).toBe('for its blitz cost');
  });

  test('a card in the graveyard offers its blitz cast', () => {
    const grave = card({ zone: 'graveyard' });
    const decision = {
      kind: 'priority',
      seat: 0,
      options: [{ kind: 'castSpell', object: 'o1', alternative: 'blitz' }],
    } as unknown as PriorityDecision;
    expect(graveyardLabels(decision, grave)).toEqual(['Blitz {2}{R}{R}, discard 1 card']);
  });

  test('the spell and the permanent carry a blitzed badge', () => {
    expect(alternativeBadge({ alternative: 'blitz', zone: 'stack' })?.text).toBe('blitzed');
    expect(alternativeBadge({ alternative: 'blitz', zone: 'battlefield' })?.fact).toContain(
      'sacrificed at the next end step',
    );
    expect(alternativeBadge({ alternative: 'blitz', zone: 'graveyard' })).toBeNull();
  });
});
