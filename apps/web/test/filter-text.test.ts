import { CREATURE_TYPES, type ObjectFilter } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { pluralSubtype, thingsPhrase } from '../src/game/filter-text';

const KNOWN: readonly (readonly [string, string])[] = [
  ['Zombie', 'Zombies'],
  ['Human', 'Humans'],
  ['Shaman', 'Shamans'],
  ['Elf', 'Elves'],
  ['Wolf', 'Wolves'],
  ['Werewolf', 'Werewolves'],
  ['Dwarf', 'Dwarves'],
  ['Merfolk', 'Merfolk'],
  ['Myr', 'Myr'],
  ['Treefolk', 'Treefolk'],
  ['Fish', 'Fish'],
  ['Samurai', 'Samurai'],
  ['Eldrazi', 'Eldrazi'],
  ['Ally', 'Allies'],
  ['Harpy', 'Harpies'],
  ['Spy', 'Spies'],
  ['Toy', 'Toys'],
  ['Fox', 'Foxes'],
  ['Sphinx', 'Sphinxes'],
  ['Phoenix', 'Phoenixes'],
  ['Octopus', 'Octopuses'],
  ['Walrus', 'Walruses'],
  ['Leech', 'Leeches'],
  ['Primarch', 'Primarchs'],
  ['Hero', 'Heroes'],
  ['Ox', 'Oxen'],
  ['Pegasus', 'Pegasi'],
  ['Cyclops', 'Cyclopes'],
  ['Time Lord', 'Time Lords'],
  ['Assembly-Worker', 'Assembly-Workers'],
];

test('the plural of a creature type is the right word, irregular and unchanged ones included', () => {
  for (const [one, many] of KNOWN) expect(pluralSubtype(one), one).toBe(many);
});

/** The types of CR 205.3m whose plural is not "+s", each checked by hand; every other type takes a plain "s". */
const NOT_PLAIN: Readonly<Record<string, string>> = {
  Ally: 'Allies',
  Army: 'Armies',
  Cyberman: 'Cybermen',
  Cyclops: 'Cyclopes',
  Dwarf: 'Dwarves',
  Elf: 'Elves',
  Fox: 'Foxes',
  Fungus: 'Fungi',
  Harpy: 'Harpies',
  Hero: 'Heroes',
  Homunculus: 'Homunculi',
  Leech: 'Leeches',
  Mercenary: 'Mercenaries',
  Mouse: 'Mice',
  Nautilus: 'Nautiluses',
  Octopus: 'Octopuses',
  Ox: 'Oxen',
  Pegasus: 'Pegasi',
  Phoenix: 'Phoenixes',
  Platypus: 'Platypuses',
  Sphinx: 'Sphinxes',
  Spy: 'Spies',
  Walrus: 'Walruses',
  Werewolf: 'Werewolves',
  Wolf: 'Wolves',
};

const UNCHANGED: ReadonlySet<string> = new Set([
  'Astartes',
  'Aurochs',
  'Caribou',
  'Custodes',
  'Dauthi',
  'Drix',
  'Eldrazi',
  'Elk',
  'Fish',
  'Jellyfish',
  'Kavu',
  'Kithkin',
  'Kor',
  'Lammasu',
  'Merfolk',
  'Moonfolk',
  'Myr',
  'Qu',
  'Samurai',
  'Sheep',
  'Soltari',
  'Starfish',
  'Thalakos',
  'Treefolk',
  'Vedalken',
  'Zubera',
]);

test('every creature type of the rules gets its plural: a table entry, unchanged, or a plain "s"', () => {
  expect(CREATURE_TYPES.length).toBeGreaterThan(300);
  for (const type of CREATURE_TYPES) {
    const expected = UNCHANGED.has(type) ? type : (NOT_PLAIN[type] ?? `${type}s`);
    expect(pluralSubtype(type), type).toBe(expected);
  }
});

test('a lone creature type names a group by its plural, whatever the type', () => {
  const lord = (subtype: string): ObjectFilter => ({
    types: ['creature'],
    subtypes: [subtype],
    controller: 'you',
    other: true,
  });
  for (const [one, many] of KNOWN) {
    expect(thingsPhrase(lord(one), true), one).toBe(`other ${many} you control`);
    expect(thingsPhrase(lord(one), false), one).toBe(`other ${one} you control`);
  }
  expect(thingsPhrase({ types: ['creature'], notSubtypes: ['Elf'], token: false }, true)).toBe(
    'nontoken non-Elf creatures on the battlefield',
  );
});
