// Ahoy Mateys deck, group 4 ("each creature you control ..." statics): Skeleton Crew ("Each other creature you control that's a Skeleton or Pirate gets +1/+1") and
// Don Andres, the Renegade ("Each creature you control but don't own gets +2/+2, has menace and deathtouch, and is a Pirate in addition to its other types" and "Whenever you
// cast a noncreature spell you don't own, create two tapped Treasure tokens"), read by the grammar and run by the engine. Gemcutter Buccaneer is NOT in this group's result:
// "Treasures you control are Equipment ... and have 'Equipped creature gets +2/+0,' equip Pirate {1}, and equip {3}" needs a static ability that a static ability gives to
// work as a continuous effect of layer 7c (the engine reads those only from printed abilities) and a granted equip keyword to expand; see the final report of the group.
// The first block parses the REAL Oracle text from the golden corpus, whole; the rest are SYNTHETIC cards whose abilities are the real lines (names replaced), played through
// `applyAction` with the scenario DSL, plus the near misses the grammar must not read. Every synthetic name starts with "SYNTHETIC". The repository's rules text is not
// in this worktree, so the only rules cited are ones the repository's own comments already use: CR 108.3 (owner), 205.3m (creature types), 611.3a (the group is whatever
// matches at any moment), 613.1d (layer 4, types), 613.1f (layer 6, abilities), 613.4c (layer 7c, +N/+N), 603.2 (triggers).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const real = (name: string) => {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  return importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
};

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BOLT = 'Lightning Bolt';

const CREW = "Each other creature you control that's a Skeleton or Pirate gets +1/+1.";
const RENEGADE =
  "Each creature you control but don't own gets +2/+2, has menace and deathtouch, and is a Pirate in addition to its other types.";
const CAST =
  "Whenever you cast a noncreature spell you don't own, create two tapped Treasure tokens.";

const vanilla = (name: string, types: string, power = '2', toughness = '2'): CardDefinition =>
  parsed(`SYNTHETIC Parsed ${name}`, `Creature — ${types}`, '', {
    manaCost: '{1}',
    power,
    toughness,
  });

describe('the real cards, whole', () => {
  // Gemcutter Buccaneer was unsupported when this group was built; its own tests are in convert-grammar-engine-gemcutter.test.ts.
  test.each(['Skeleton Crew', 'Don Andres, the Renegade', 'Gemcutter Buccaneer'])(
    '%s is supported',
    (name) => {
      const imported = real(name);
      expect(imported.support.unparsed).toEqual([]);
      expect(imported.support.status).toBe('supported');
      expect(validateCard(imported.definition)).toEqual([]);
    },
  );
});

describe('the grammar reads the lines', () => {
  test('Skeleton Crew: other creatures you control with one type or the other, +1/+1', () => {
    const [ability] = readAll(CREW, 'creature').abilities;
    expect(ability).toMatchObject({
      kind: 'static',
      static: {
        kind: 'modifyPt',
        subject: {
          kind: 'filter',
          other: true,
          filter: {
            types: ['creature'],
            controller: 'you',
            anyOf: [{ subtypes: ['Skeleton'] }, { subtypes: ['Pirate'] }],
          },
        },
      },
    });
  });

  test("Don Andres: the creatures you control but don't own, with their own filter", () => {
    const abilities = readAll(RENEGADE, 'creature').abilities;
    expect(abilities.length).toBeGreaterThan(0);
    for (const a of abilities) {
      expect(a).toMatchObject({
        kind: 'static',
        static: {
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', notOwnedByYou: true },
          },
        },
      });
    }
    const kinds = abilities.map((a) => (a.kind === 'static' ? a.static.kind : a.kind)).sort();
    expect(kinds).toEqual(['grantKeyword', 'grantKeyword', 'modifyPt', 'setTypes']);
  });

  test("Don Andres: a noncreature spell you don't own, as the filter of the spell", () => {
    const [trigger] = readAll(CAST, 'creature').abilities;
    expect(trigger).toMatchObject({
      kind: 'triggered',
      trigger: {
        kind: 'castSpell',
        by: 'you',
        filter: { notOwnedByYou: true, notTypes: ['creature'] },
      },
    });
  });

  test.each([
    ['one type only', "Each other creature you control that's a Skeleton gets +1/+1."],
    ['three types', "Each creature you control that's a Skeleton or Pirate or Elf gets +1/+1."],
    [
      'a word that is no creature type',
      "Each creature you control that's a Skeleton or Banana gets +1/+1.",
    ],
    [
      'another controller',
      "Each creature your opponents control that's a Skeleton or Pirate gets +1/+1.",
    ],
    ['no controller', "Each creature that's a Skeleton or Pirate gets +1/+1."],
    ["other with 'but don't own'", "Each other creature you control but don't own gets +2/+2."],
    ['an opponent controller', "Each creature an opponent controls but don't own gets +2/+2."],
    [
      'a spell you do own',
      'Whenever you cast a noncreature spell you own, create two tapped Treasure tokens.',
    ],
    [
      "a spell that you don't own that targets",
      "Whenever you cast a spell you don't own that targets a creature, draw a card.",
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});

describe('Skeleton Crew: other Skeletons and Pirates you control get +1/+1', () => {
  const crew = parsed('SYNTHETIC Parsed Skeleton Crew', 'Creature — Skeleton Pirate', CREW, {
    manaCost: '{3}{B}',
    power: '3',
    toughness: '3',
  });
  const skeleton = vanilla('Skeleton', 'Skeleton');
  const pirate = vanilla('Pirate', 'Human Pirate', '1', '1');
  const both = vanilla('Skeleton Pirate', 'Skeleton Pirate', '2', '3');
  const zombie = vanilla('Zombie', 'Zombie');
  const rival = vanilla('Rival Skeleton', 'Skeleton');

  const build = () =>
    scenario()
      .seat(0)
      .define(crew)
      .define(skeleton)
      .define(pirate)
      .define(both)
      .define(zombie)
      .battlefield(crew.name, skeleton.name, pirate.name, both.name, zombie.name)
      .library(...FILLER)
      .seat(1)
      .define(rival)
      .battlefield(rival.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(crew)).toEqual([]);
  });

  test('a Skeleton and a Pirate get +1/+1; one that is both gets it once (CR 613.4c)', () => {
    const g = build();
    g.expect.pt(skeleton.name, 3, 3);
    g.expect.pt(pirate.name, 2, 2);
    g.expect.pt(both.name, 3, 4);
  });

  test('the creature itself is left out ("other") and a Zombie is not a Skeleton or Pirate (CR 205.3m)', () => {
    const g = build();
    g.expect.pt(crew.name, 3, 3);
    g.expect.pt(zombie.name, 2, 2);
  });

  test("an opponent's Skeleton is not a creature you control", () => {
    const g = scenario()
      .seat(0)
      .define(crew)
      .battlefield(crew.name)
      .library(...FILLER)
      .seat(1)
      .define(rival)
      .battlefield(rival.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.pt(rival.name, 2, 2);
  });

  test('a creature that enters later is included (CR 611.3a)', () => {
    const g = scenario()
      .seat(0)
      .define(crew)
      .define(skeleton)
      .battlefield(crew.name)
      .hand(skeleton.name)
      .battlefield('Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(skeleton.name, { pay: true });
    g.passAll();
    g.expect.pt(skeleton.name, 3, 3);
  });
});

describe("Don Andres, the Renegade: creatures you control but don't own", () => {
  const renegade = parsed(
    'SYNTHETIC Parsed Renegade',
    'Legendary Creature — Vampire Pirate',
    `${RENEGADE}\n${CAST}`,
    { manaCost: '{1}{U}{B}{R}', power: '4', toughness: '3' },
  );
  const bear = vanilla('Bear', 'Bear');
  const stolen = vanilla('Stolen Bear', 'Bear');

  const build = (withRenegade = true) =>
    scenario()
      .seat(0)
      .define(renegade)
      .define(bear)
      .battlefield(...(withRenegade ? [renegade.name] : []), bear.name, 'Mountain')
      .hand(BOLT)
      .library(...FILLER)
      .seat(1)
      .define(stolen)
      .battlefield(stolen.name, { controller: 0 })
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(renegade)).toEqual([]);
  });

  test('a creature you control but do not own gets +2/+2, menace, deathtouch and Pirate (CR 108.3, 613.1d, 613.1f, 613.4c)', () => {
    const g = build();
    g.expect.pt(stolen.name, 4, 4);
    g.expect.derived(stolen.name, {
      types: ['creature'],
      subtypes: ['Bear', 'Pirate'],
      keywords: ['menace', 'deathtouch'],
    });
  });

  test('your own creatures, Don Andres included, get nothing: you own them', () => {
    const g = build();
    g.expect.pt(bear.name, 2, 2);
    g.expect.derived(bear.name, { subtypes: ['Bear'], keywords: [] });
    g.expect.pt(renegade.name, 4, 3);
    g.expect.derived(renegade.name, { subtypes: ['Vampire', 'Pirate'], keywords: [] });
  });

  test('without Don Andres the stolen creature is as printed', () => {
    const g = build(false);
    g.expect.pt(stolen.name, 2, 2);
    g.expect.derived(stolen.name, { subtypes: ['Bear'], keywords: [] });
  });

  test('a spell of your own, creature or not, does not trigger it (CR 603.2)', () => {
    const g = build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.noObject('Treasure', { zone: 'battlefield' });
  });
});
