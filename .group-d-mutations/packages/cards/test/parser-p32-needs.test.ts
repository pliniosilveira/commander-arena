// Stage P32 (M9): a line of the Dinosaurs slice that the grammar reads whose engine feature is not listed is reported as "recognised,
// not runnable" naming that feature, never built (D-068, D-145, D-147). The engine lists every feature below, so the support check is
// replaced here by one that lacks one feature at a time, and the lowering must name it. The lines are the real Oracle text of the golden
// corpus (names replaced by ~) and SYNTHETIC variants.
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
  // Filters, selectors and amounts.
  [
    'selector:hasCounter',
    'Each creature you control with a counter on it has "{T}: Add {G}."',
    'creature',
    [],
  ],
  [
    'selector:commander',
    '{2}, {T}: Target commander gains lifelink until end of turn.',
    'land',
    [],
  ],
  [
    'selector:keywords',
    "Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead.",
    'sorcery',
    [],
  ],
  [
    'selector:moved',
    'For each creature your opponents control, create a 4/4 green Phyrexian Beast creature token. Each of those tokens fights a different one of those creatures.',
    'sorcery',
    [],
  ],
  [
    'amount:commanderManaValue',
    'Equipped creature gets +X/+X, where X is the greatest mana value among your commanders.',
    'artifact',
    ['Equipment'],
  ],
  [
    'amount:affected',
    'At the beginning of each combat, double the power and toughness of each creature you control until end of turn.',
    'enchantment',
    [],
  ],
  [
    'amount:aggregate',
    '~ deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as you cast ~.',
    'sorcery',
    [],
  ],
  // Triggers, conditions and abilities.
  [
    'trigger:triggerCondition',
    "Whenever ~ attacks while you don't control another Dinosaur, put a stun counter on it.",
    'creature',
    ['Dinosaur'],
  ],
  [
    'ability:manaInstead',
    '{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color instead.',
    'creature',
    [],
  ],
  [
    'condition:controlsAtLeast',
    "Whenever ~ attacks while you don't control another Dinosaur, put a stun counter on it.",
    'creature',
    ['Dinosaur'],
  ],
  [
    'condition:controlsGreatest',
    'At the beginning of your end step, draw two cards if you control the creature with the greatest power or tied for the greatest power.',
    'enchantment',
    [],
  ],
  [
    'condition:objectMatches',
    '{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on ~ and you gain 1 life.',
    'creature',
    [],
  ],
  // Effects.
  [
    'effect:fight',
    "Target creature you control fights target creature you don't control.",
    'sorcery',
    [],
  ],
  [
    'effect:revealUntil',
    'When ~ enters, reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order.',
    'creature',
    [],
  ],
  [
    'effect:castFree',
    'You may cast a spell with mana value 5 or less from your hand without paying its mana cost.',
    'sorcery',
    [],
  ],
  [
    'effect:dealDividedDamage',
    '~ deals X damage divided as you choose among any number of target creatures, where X is the greatest power among creatures you control as you cast ~.',
    'sorcery',
    [],
  ],
  [
    'effect:lookAtTop',
    '{4}{G}{G}, {T}: Look at the top six cards of your library. You may reveal a creature card with mana value less than or equal to the number of lands you control from among them and put it onto the battlefield. Put the rest on the bottom in a random order.',
    'creature',
    [],
  ],
  [
    'effect:preventDamage',
    'Prevent all combat damage that would be dealt this turn by non-Spider creatures.',
    'instant',
    [],
  ],
  [
    'effect:dealDamage',
    "Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead.",
    'sorcery',
    [],
  ],
  // Statics and keywords.
  [
    'static:restrictionUnless',
    "~ can't attack or block unless you control another creature with power 4 or greater.",
    'creature',
    [],
  ],
  [
    'static:loseAllAbilities',
    'Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
    'enchantment',
    ['Aura'],
  ],
  [
    'static:setColors',
    'Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
    'enchantment',
    ['Aura'],
  ],
  [
    'static:setTypes',
    'Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
    'enchantment',
    ['Aura'],
  ],
  [
    'static:setPt',
    'Enchanted creature loses all abilities and is a green Elk creature with base power and toughness 3/3.',
    'enchantment',
    ['Aura'],
  ],
  [
    'static:costReduction',
    'Creature spells you cast with power 4 or greater cost {2} less to cast.',
    'creature',
    [],
  ],
  ['keyword:hideaway', 'Hideaway 4', 'land', []],
  ['keyword:escalate', 'Escalate {G}', 'instant', []],
] as const;

describe('the lines of the Dinosaurs slice name the feature the engine lacks (D-145)', () => {
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

  test('every feature the lowerings of this slice name is declared', () => {
    for (const ref of [
      'selector:hasCounter',
      'selector:commander',
      'amount:commanderManaValue',
      'amount:affected',
      'trigger:triggerCondition',
      'ability:manaInstead',
      'effect:fight',
      'effect:revealUntil',
      'effect:castFree',
      'effect:dealDividedDamage',
      'effect:lookAtTop',
      'effect:preventDamage',
      'static:restrictionUnless',
      'static:loseAllAbilities',
      'static:setColors',
      'static:setTypes',
      'keyword:hideaway',
      'keyword:escalate',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
