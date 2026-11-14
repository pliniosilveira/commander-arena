// Stage P31 (M15): a line of the Artifacts slice that the grammar reads whose engine feature is not listed is reported as "recognised,
// not runnable" naming that feature, never built (D-068, D-139). The engine lists every feature below, so the support check is replaced
// here by one that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the golden corpus
// (names replaced by ~) and SYNTHETIC variants.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const CASES = [
  // Filters and selectors.
  ['selector:attacking', "Return all attacking creatures to their owner's hand.", 'instant', []],
  [
    'selector:colorCount',
    'Each player sacrifices all permanents they control that are one or more colors.',
    'sorcery',
    [],
  ],
  [
    'selector:anyOf',
    '{1}, {T}: Destroy all artifacts, creatures, and enchantments.',
    'artifact',
    [],
  ],
  ['selector:ownerRef', "{T}, Sacrifice ~: Exile each opponent's graveyard.", 'artifact', []],
  [
    'selector:manaValueX',
    '{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by ~ this turn. Activate only once each turn.',
    'creature',
    [],
  ],
  [
    'selector:controllerDamagedBySource',
    '{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by ~ this turn. Activate only once each turn.',
    'creature',
    [],
  ],
  [
    'selector:anyNumber',
    "Whenever ~ attacks, you may tap X untapped Myr you control. If you do, ~ gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking.",
    'creature',
    [],
  ],
  [
    'selector:attackedBy',
    "Whenever ~ attacks, you may tap X untapped Myr you control. If you do, ~ gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking.",
    'creature',
    [],
  ],
  [
    'amount:thisWay',
    "Whenever ~ attacks, you may tap X untapped Myr you control. If you do, ~ gets +X/+0 until end of turn and deals X damage to the player or planeswalker it's attacking.",
    'creature',
    [],
  ],
  [
    'selector:attached',
    'When ~ enters, tap enchanted creature and you become the monarch.',
    'enchantment',
    ['Aura'],
  ],
  [
    'selector:choose',
    "{U}, {T}, Return an artifact you control to its owner's hand: You may put an artifact card from your hand onto the battlefield.",
    'creature',
    [],
  ],
  // Costs and restrictions.
  ['cost:putCounters', '{T}, Put a page counter on ~: Scry 1.', 'artifact', []],
  [
    'cost:returnToHand',
    "{U}, {T}, Return an artifact you control to its owner's hand: You may put an artifact card from your hand onto the battlefield.",
    'creature',
    [],
  ],
  [
    'ability:oncePerTurn',
    '{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by ~ this turn. Activate only once each turn.',
    'creature',
    [],
  ],
  [
    'ability:costReducedBy',
    '{5}{U}, {T}: Draw a card. This ability costs {1} less to activate for each other artifact you control.',
    'artifact',
    [],
  ],
  // Triggers and conditions.
  [
    'trigger:combatDamageBatch',
    'Whenever one or more artifact creatures you control deal combat damage to a player, draw a card.',
    'enchantment',
    [],
  ],
  [
    'trigger:tappedForMana',
    'Whenever you tap a permanent for {C}, add an additional {C}.',
    'artifact',
    [],
  ],
  [
    'trigger:state',
    'When there are four or more page counters on ~, exile it. If you do, you gain 4 life.',
    'artifact',
    [],
  ],
  [
    'condition:didPrevious',
    'When there are four or more page counters on ~, exile it. If you do, you gain 4 life.',
    'artifact',
    [],
  ],
  [
    'condition:duringStep',
    'When ~ enters during the declare attackers step, you may reselect which player or permanent target attacking creature is attacking.',
    'artifact',
    [],
  ],
  [
    'condition:controlsGreatest',
    'At the beginning of your upkeep, if you control the artifact with the greatest mana value or tied for the greatest mana value, draw a card.',
    'creature',
    [],
  ],
  [
    'condition:playerHasDesignation',
    "Enchanted creature doesn't untap during its controller's untap step unless that player is the monarch.",
    'enchantment',
    ['Aura'],
  ],
  // Effects.
  [
    'effect:reselectAttack',
    'When ~ enters during the declare attackers step, you may reselect which player or permanent target attacking creature is attacking.',
    'artifact',
    [],
  ],
  [
    'effect:lookAtTop',
    'Whenever equipped creature attacks, look at the top six cards of your library. You may reveal an artifact card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.',
    'artifact',
    ['Equipment'],
  ],
  [
    'effect:sacrifice',
    'Each player sacrifices all permanents they control that are one or more colors.',
    'sorcery',
    [],
  ],
  // Statics and keywords.
  ['static:cantBeBlockedBy', "Juggernauts you control can't be blocked by Walls.", 'creature', []],
  [
    'static:setPt',
    'Other creatures you control have base power and toughness 5/3 and are Juggernauts in addition to their other creature types.',
    'creature',
    [],
  ],
  [
    'static:setTypes',
    'Other creatures you control have base power and toughness 5/3 and are Juggernauts in addition to their other creature types.',
    'creature',
    [],
  ],
  [
    'static:castAsThoughFlash',
    'You may cast artifact spells as though they had flash.',
    'creature',
    [],
  ],
  [
    'static:takeFromLinkedExile',
    "As long as a card exiled with ~ is a creature card, ~ has the power, toughness, and creature types of the last creature card exiled with it. It's still a Shapeshifter.",
    'creature',
    [],
  ],
  [
    'ability:staticCondition',
    "Enchanted creature doesn't untap during its controller's untap step unless that player is the monarch.",
    'enchantment',
    ['Aura'],
  ],
  ['keyword:livingWeapon', 'Living weapon', 'artifact', ['Equipment']],
] as const;

describe('the lines of the Artifacts slice name the feature the engine lacks (D-139)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type, subtypes) => {
    const missing = withoutFeature(ref, text, type, subtypes);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type, subtypes] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type, subtypes);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
        expect(parsed.spell ?? undefined, `${ref}: ${text}`).toBeUndefined();
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('a feature the engine does not list does not block the others', () => {
    BLOCKED.clear();
    BLOCKED.add('selector:colorCount');
    try {
      expect(read('Destroy all creatures.', 'sorcery').unparsed).toEqual([]);
      expect(read('Destroy all multicolored creatures.', 'sorcery').unparsed).toHaveLength(1);
    } finally {
      BLOCKED.clear();
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'selector:attacking',
      'selector:colorCount',
      'selector:manaValueX',
      'selector:controllerDamagedBySource',
      'selector:attackedBy',
      'cost:putCounters',
      'cost:returnToHand',
      'ability:oncePerTurn',
      'ability:costReducedBy',
      'trigger:combatDamageBatch',
      'trigger:tappedForMana',
      'trigger:state',
      'condition:duringStep',
      'condition:controlsGreatest',
      'effect:reselectAttack',
      'effect:lookAtTop',
      'static:cantBeBlockedBy',
      'static:setPt',
      'static:castAsThoughFlash',
      'static:takeFromLinkedExile',
      'keyword:livingWeapon',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
