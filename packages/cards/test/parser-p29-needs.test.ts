// Stage P29 (M11): a line of the filtered-subjects slice that the grammar reads whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built (D-068, D-133). The engine lists every feature below, so the
// support check is replaced here by one that lacks one feature at a time, and the lowering must name it. The wordings are those of
// reports/decks.md (parser version 33), with SYNTHETIC numbers, and SYNTHETIC variants.
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
  // The parts of a filter.
  ['selector:nontoken', 'Destroy target nontoken creature.', 'sorcery'],
  [
    'selector:nontoken',
    'Other nontoken creatures you control get +1/+1 and have vigilance.',
    'creature',
  ],
  [
    'selector:notSubtypes',
    'Whenever ~ or another Zombie enters, all non-Zombie creatures get -1/-1 until end of turn.',
    'creature',
  ],
  ['selector:colorless', 'Colorless creatures you control get +1/+1.', 'creature'],
  ['selector:colorless', 'Whenever you cast a colorless spell, you gain 1 life.', 'creature'],
  ['selector:keywords', 'Destroy target creature with flying.', 'sorcery'],
  [
    'selector:keywords',
    '~ deals X damage to each creature without flying and each planeswalker.',
    'sorcery',
  ],
  [
    'selector:keywords',
    'Whenever a creature you control with flying enters, it gains haste until end of turn.',
    'creature',
  ],
  // Triggers and the player an event is about.
  [
    'trigger:attacksAt',
    'Whenever a creature attacks you or a planeswalker you control, investigate.',
    'creature',
  ],
  ['trigger:dealtDamage', 'Whenever ~ is dealt damage, draw a card.', 'creature'],
  ['trigger:dealtDamage', 'Whenever ~ is dealt damage, you gain that much life.', 'creature'],
  ['amount:triggerDamage', 'Whenever ~ is dealt damage, you gain that much life.', 'creature'],
  [
    'selector:triggerPlayer',
    'Whenever an opponent draws a card, that player loses 1 life.',
    'creature',
  ],
  [
    'selector:triggerPlayer',
    'Whenever ~ deals combat damage to a player, that player discards a card and you create a tapped 2/2 black Zombie creature token.',
    'creature',
  ],
  [
    'selector:triggerPlayer',
    'Whenever a Dragon you control becomes the target of a spell or ability an opponent controls, ~ deals 3 damage to that player.',
    'creature',
  ],
  [
    'selector:triggerSubject',
    'Whenever another nontoken creature you control enters, put a +1/+1 counter on it. It gains haste until end of turn.',
    'creature',
  ],
  [
    'selector:controllerOf',
    "Whenever a creature attacks you or a planeswalker you control, that creature's controller loses 1 life.",
    'creature',
  ],
  // Statics: a condition, a limit on blockers, the cast from the graveyard.
  ['ability:staticCondition', '~ gets +3/+3 as long as you have 30 or more life.', 'creature'],
  [
    'ability:staticCondition',
    'As long as you control your commander, ~ gets +2/+2 and creatures you control have vigilance.',
    'creature',
  ],
  ['condition:lifeTotal', '~ gets +3/+3 as long as you have 30 or more life.', 'creature'],
  [
    'condition:lifeTotal',
    '{T}: Draw a card. Activate only if you have at least 7 life more than your starting life total.',
    'creature',
  ],
  ['condition:thisMatches', "~ has hexproof as long as it's untapped.", 'creature'],
  [
    'condition:controlCommander',
    'As long as you control your commander, ~ gets +2/+2.',
    'creature',
  ],
  [
    'condition:controlsAtLeast',
    'As long as you control three or more artifacts, ~ has hexproof.',
    'creature',
  ],
  [
    'static:castFromGraveyard',
    'You may cast this card from your graveyard as long as you control a Zombie.',
    'creature',
  ],
  ['static:castFromGraveyard', 'You may cast this card from your graveyard.', 'creature'],
  [
    'static:attackTax',
    'As long as ~ is untapped, creatures can’t attack you or planeswalkers you control unless their controller pays {2} for each of those creatures.',
    'creature',
  ],
  [
    'static:restriction',
    "Each creature you control with power 4 or greater can't be blocked by more than one creature.",
    'creature',
  ],
  ['static:grantKeyword', 'Other Zombie creatures get +1/+1 and have deathtouch.', 'creature'],
  // Costs and what they sacrificed.
  [
    'cost:tapPermanents',
    'Tap three untapped Zombies you control: You draw a card and lose 1 life.',
    'creature',
  ],
  ['cost:sacrifice', '{1}, Sacrifice two artifacts: Draw a card.', 'creature'],
  [
    'selector:sacrificedCost',
    "{1}{B}, {T}, Sacrifice another creature: Create X 2/2 black Zombie creature tokens, where X is the sacrificed creature's power.",
    'creature',
  ],
  // The replacement.
  [
    'replacement:wouldDie',
    'If a nontoken creature an opponent controls would die, instead exile that card and create a 2/2 black Zombie creature token.',
    'creature',
  ],
  // The effects of the rows.
  [
    'effect:restrict',
    "Whenever ~ or another artifact you control enters, put a +1/+1 counter on ~. It can't be blocked this turn.",
    'creature',
  ],
  [
    'effect:setTypes',
    'Whenever a Dragon you control enters, put a +1/+1 counter on ~. Until end of turn, ~ becomes a Dragon in addition to his other types and gains flying.',
    'creature',
  ],
] as const;

describe('the lines of the filtered-subjects slice name the feature the engine lacks (D-133)', () => {
  test.each(CASES)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        expect(read(text, type).abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('a feature the engine does not list does not block the others', () => {
    BLOCKED.clear();
    BLOCKED.add('selector:colorless');
    try {
      expect(read('Nontoken creatures you control get +1/+1.', 'creature').unparsed).toEqual([]);
      expect(read('Colorless creatures you control get +1/+1.', 'creature').unparsed).toHaveLength(
        1,
      );
    } finally {
      BLOCKED.clear();
    }
  });

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'selector:token',
      'selector:nontoken',
      'selector:notSubtypes',
      'selector:colorless',
      'selector:keywords',
      'selector:triggerPlayer',
      'selector:sacrificedCost',
      'trigger:attacksAt',
      'trigger:dealtDamage',
      'amount:triggerDamage',
      'ability:staticCondition',
      'condition:lifeTotal',
      'condition:thisMatches',
      'cost:tapPermanents',
      'replacement:wouldDie',
      'static:castFromGraveyard',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
