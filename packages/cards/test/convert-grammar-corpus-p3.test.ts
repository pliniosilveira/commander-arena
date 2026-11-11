// The SYNTHETIC template corpus of stage P3: Auras, Equipment and static abilities with subjects.
// Each line is a template written after a real shape of the backlog (reports/backlog.md and the
// templates behind it; the count is in the note, as the report prints it) or marked SYNTHETIC; none
// is a real card's text unless the note says so. Each line says whether it must import as
// supported, or where and why it stops, so a change that makes the grammar read less OR more than
// it should fails here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { expect, test } from 'vitest';
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const NOT_RUNNABLE = { reason: 'notRunnable' } as const;

const AURAS: readonly Line[] = [
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature gets +2/+2.',
    expect: OK,
    note: 'backlog: Enchant creature 892 cards, Enchanted creature gets +N/+N 129',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature gets -2/-2.',
    expect: OK,
    note: 'backlog: Enchanted creature gets -N/-N 33',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature gets +1/+1 and has flying.',
    expect: OK,
    note: 'backlog: 32 cards',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature gets +2/+2 and has trample.',
    expect: OK,
    note: 'backlog: 20 cards',
  },
  {
    kind: 'aura',
    text: 'Enchant creature you control\nEnchanted creature gets +1/+1.',
    expect: OK,
    note: 'backlog: Enchant creature you control 55 cards',
  },
  {
    kind: 'aura',
    text: 'Enchant land\nEnchanted land has hexproof.',
    expect: OK,
    note: 'backlog: Enchant land 82 cards; SYNTHETIC grant',
  },
  { kind: 'aura', text: 'Enchant permanent', expect: OK, note: 'backlog: 22 cards' },
  {
    kind: 'aura',
    text: 'Enchant artifact or creature\nEnchanted permanent gets +1/+1.',
    expect: OK,
    note: 'SYNTHETIC shape (a choice of types)',
  },
  {
    kind: 'aura',
    text: 'Enchant creature or planeswalker you control',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'aura',
    text: 'Enchant creature, land, or planeswalker',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'aura',
    text: 'Enchant player',
    expect: no('player', 'keyword.enchant'),
    note: 'backlog: 46 cards; a permanent phrase does not name a player',
  },
  {
    kind: 'aura',
    text: 'Enchant Forest',
    expect: OK,
    note: 'backlog: 2 cards; a basic land type is a subtype (stage P9, CR 205.3i)',
  },
  {
    kind: 'aura',
    text: 'Enchant creature card in a graveyard',
    expect: no('card in a graveyard', 'noun.bare-permanent'),
    note: 'backlog: 2 cards',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature has "{T}: Add {G}."',
    expect: OK,
    note: 'SYNTHETIC; stage P14: a granted mana ability runs (D-099, `static:grantAbility`)',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature has "{T}: Draw a card."',
    expect: no('Enchanted creature has "{T}: Draw a card."', 'static.attached', {
      ...NOT_RUNNABLE,
    }),
    note: 'SYNTHETIC; still not run: an attached permanent is given a triggered ability (stage P49, D-206) and a mana ability, no activated one',
  },
  {
    kind: 'aura',
    text: "Enchant creature\nEnchanted creature can't be blocked.",
    expect: OK,
    note: 'backlog: 2 cards; the engine runs it since D-094 (stage P12)',
  },
  {
    kind: 'aura',
    text: "Enchant creature\nEnchanted creature can't attack or block.",
    expect: no("can't attack or block.", 'static.attached'),
    note: 'no engine primitive for it',
  },
  {
    kind: 'aura',
    text: "Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.",
    expect: OK,
    note: 'backlog: 48 cards; the engine runs it since D-094 (stage P12)',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature gets +1/+1 and is goaded.',
    expect: no('and is goaded.', 'static.attached'),
    note: 'backlog: 7 cards',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature gets +1/+1 until end of turn.',
    expect: no('until end of turn.', 'static.attached'),
    note: 'SYNTHETIC; a duration is not a static ability',
  },
  {
    kind: 'aura',
    text: 'Enchanted creature gets +2/+2.',
    expect: { engine: 'an Aura needs an enchant ability' },
    note: 'an Aura with no enchant line is refused by the engine (CR 303.4a)',
  },
  {
    kind: 'enchantment',
    text: 'Enchant creature',
    expect: { engine: 'only an Aura has an enchant ability' },
    note: 'only an Aura has an enchant ability (CR 702.5a)',
  },
  {
    kind: 'equipment',
    text: 'Enchanted creature gets +1/+1.\nEquip {1}',
    expect: no('Enchanted creature gets +1/+1.', 'noun.attached-permanent', NOT_RUNNABLE),
    note: 'SYNTHETIC; an Equipment enchants nothing',
  },
];

const EQUIPMENT: readonly Line[] = [
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1.\nEquip {2}',
    expect: OK,
    note: 'backlog: Equip {M} 568 cards, Equipped creature gets +N/+N 172',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/-1.\nEquip {1}',
    expect: OK,
    note: 'backlog: 3 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature has haste and shroud.\nEquip {0}',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature has hexproof and haste.\nEquip {1}',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 and has trample.\nEquip {1}',
    expect: OK,
    note: 'backlog: 17 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 and has vigilance.\nEquip {2}',
    expect: OK,
    note: 'backlog: 15 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 and has haste.\nEquip {1}',
    expect: OK,
    note: 'backlog: 9 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature has double strike.\nEquip {3}',
    expect: OK,
    note: 'backlog: 8 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 and has trample and lifelink.\nEquip {3}',
    expect: OK,
    note: 'backlog: 3 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature has deathtouch and lifelink.\nEquip {2}',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 and has indestructible.\nEquip {2}',
    expect: OK,
    note: 'backlog: 2 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 and has double strike and trample.\nEquip {3}',
    expect: OK,
    note: 'backlog: 2 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +2/+0.\nEquip—Pay 2 life',
    expect: OK,
    note: 'SYNTHETIC; the engine pays life for equip',
  },
  {
    kind: 'equipment',
    text: 'Equip {1}',
    expect: OK,
    note: 'SYNTHETIC; an Equipment that gives nothing is still one',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1.\nEquip legendary creature {3}',
    expect: no('legendary creature {3}', 'keyword.equip'),
    note: 'backlog: 5 cards; CR 702.6c, not modelled by the engine',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1.\nEquip commander {3}',
    expect: OK,
    note: 'backlog: 2 cards; "Equip commander {3}" is read since stage P70 (D-256, CR 702.6c, 903.3)',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1.\nEquip your commander {3}',
    expect: no('your commander {3}', 'keyword.equip'),
    note: 'SYNTHETIC wording: only "Equip commander {N}" is read',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 and has protection from everything.\nEquip {2}',
    expect: no('everything.', 'static.attached'),
    note: 'SYNTHETIC: protection from a quality that is not a color is not read',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 for each color among permanents you control.\nEquip {2}',
    expect: OK,
    note: 'backlog: 1 card ("for each land you control" is read since stage P20; "for each color among permanents you control" since stage P37, D-180)',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 and loses flying.\nEquip {2}',
    expect: no('and loses flying.', 'static.attached'),
    note: 'backlog: 3 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 and has protection from black and from green.\nEquip {2}',
    expect: OK,
    note: 'backlog: 1 card; protection from colors is a keyword a static ability gives since stage P70 (D-256)',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 and has trample and "Whenever ~ deals combat damage to a player or planeswalker, create that many Treasure tokens."\nEquip {3}',
    expect: no(
      '"Whenever ~ deals combat damage to a player or planeswalker, create that many Treasure tokens."',
      'static.attached',
    ),
    note: 'backlog: 1 card',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature has "{T}: Add {G}."\nEquip {1}',
    expect: OK,
    note: 'SYNTHETIC; stage P14: a granted mana ability runs (D-099, `static:grantAbility`)',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature has "Sacrifice ~: Draw a card."\nEquip {1}',
    expect: no('Equipped creature has "Sacrifice ~: Draw a card."', 'static.attached', {
      ...NOT_RUNNABLE,
    }),
    note: 'SYNTHETIC; still not run: only a mana ability can be given',
  },
  {
    kind: 'equipment',
    text: "Equipped creature can't be blocked and has shroud.\nEquip {1}",
    expect: OK,
    note: 'backlog: 1 card; a restriction and a grant (stage P12)',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature has nonbasic landwalk.\nEquip {1}',
    expect: no('nonbasic landwalk.', 'static.attached'),
    note: 'backlog: 1 card',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1.\nEquip {X}',
    expect: no('{X}', 'keyword.equip'),
    note: 'X in a cost is not read',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1.\nEquip—Sacrifice a creature',
    expect: no('Sacrifice a creature', 'keyword.equip'),
    note: 'SYNTHETIC; the engine pays only mana and life for equip',
  },
  {
    kind: 'equipment',
    text: 'Whenever equipped creature dies, draw two cards.\nEquip {2}',
    expect: OK,
    note: 'backlog: 1 card; a trigger on the equipped creature is read since stage P18 (D-111)',
  },
  {
    kind: 'creature',
    text: 'Equipped creature gets +1/+1.',
    expect: no('Equipped creature gets +1/+1.', 'noun.attached-permanent', NOT_RUNNABLE),
    note: 'SYNTHETIC; nothing is equipped by a creature',
  },
];

const GROUPS: readonly Line[] = [
  {
    kind: 'enchantment',
    text: 'Creatures you control get +1/+1.',
    expect: OK,
    note: 'backlog: 32 cards',
  },
  {
    kind: 'enchantment',
    text: 'Other creatures you control get +1/+1.',
    expect: OK,
    note: 'backlog: 18 cards',
  },
  {
    kind: 'creature',
    text: 'Other creatures you control have trample.',
    expect: OK,
    note: 'backlog: 8 cards',
  },
  {
    kind: 'enchantment',
    text: 'Creatures you control have haste.',
    expect: OK,
    note: 'backlog: 16 cards',
  },
  {
    kind: 'enchantment',
    text: 'Creatures you control have trample.',
    expect: OK,
    note: 'backlog: 5 cards',
  },
  {
    kind: 'enchantment',
    text: 'Creatures you control have lifelink.',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'Creatures your opponents control get -1/-1.',
    expect: OK,
    note: 'backlog: 7 cards',
  },
  {
    kind: 'creature',
    text: 'Other Elves you control get +1/+1.',
    expect: OK,
    note: 'backlog: 7 cards',
  },
  {
    kind: 'creature',
    text: 'Other Elf creatures you control get +1/+1.',
    expect: OK,
    note: 'backlog: 2 cards',
  },
  {
    kind: 'creature',
    text: 'Legendary creatures you control get +1/+1.',
    expect: OK,
    note: 'backlog: 3 cards',
  },
  {
    kind: 'creature',
    text: 'Other artifact creatures you control get +1/+1.',
    expect: OK,
    note: 'backlog: 7 cards',
  },
  {
    kind: 'enchantment',
    text: 'Other permanents you control have indestructible.',
    expect: OK,
    note: 'backlog: 2 cards',
  },
  {
    kind: 'creature',
    text: 'Other creatures you control get +1/+1 and have flying.',
    expect: OK,
    note: 'SYNTHETIC shape; two engine abilities',
  },
  {
    kind: 'enchantment',
    text: 'Creatures you control get +1/+1 and have vigilance.',
    expect: OK,
    note: 'SYNTHETIC shape',
  },
  {
    kind: 'enchantment',
    text: 'Creature tokens you control get +1/+1.',
    expect: OK,
    note: "backlog: 5 cards; read since stage P64 (D-217): a group of the controller's tokens",
  },
  {
    kind: 'enchantment',
    text: 'Attacking creatures you control have deathtouch.',
    // Read since stage P31 ("attacking", D-140); a static ability's subject does not read combat in the engine.
    expect: no('Attacking creatures you control have deathtouch.', 'noun.plain-permanents', {
      reason: 'notRunnable',
    }),
    note: 'backlog: 2 cards',
  },
  {
    kind: 'enchantment',
    text: 'Nontoken creatures you control have riot.',
    expect: OK,
    note: 'backlog: 2 cards; the group is read since stage P29, the keyword (Riot) since stage P40 (D-186)',
  },
  {
    kind: 'enchantment',
    text: 'Lands you control have "{T}: Add one mana of any color."',
    expect: OK,
    note: 'backlog: 6 cards (2 alone); stage P14: a granted mana ability runs (D-099)',
  },
  {
    kind: 'enchantment',
    text: 'Creatures you control have "{T}: Add one mana of any color."',
    expect: OK,
    note: 'backlog: 3 cards; the engine gives the ability to creatures as to lands (CR 613.1f)',
  },
  {
    kind: 'enchantment',
    text: 'Lands you control have "{T}: Add one mana of any color. Draw a card."',
    expect: no(
      'Lands you control have "{T}: Add one mana of any color. Draw a card."',
      'static.permanents',
      NOT_RUNNABLE,
    ),
    note: 'SYNTHETIC; still not run: the granted text is not one mana ability (`manaAlso:draw`)',
  },
  {
    kind: 'enchantment',
    text: 'Creatures you control get +1/+1 until end of turn.',
    expect: no('until end of turn.', 'static.permanents'),
    note: 'SYNTHETIC; a duration is not a static ability',
  },
  {
    kind: 'enchantment',
    text: 'Creatures you control have flash.',
    expect: no('flash.', 'static.permanents'),
    note: 'SYNTHETIC; flash is not a grantable keyword',
  },
  {
    kind: 'enchantment',
    text: 'Elves you control get +1/+1.',
    expect: OK,
    note: 'SYNTHETIC; stage P15 reads a creature type (CR 205.3m) with or without "other"',
  },
  {
    kind: 'enchantment',
    text: "Creatures can't attack you unless their controller pays {1} for each creature they control that's attacking you.",
    expect: OK,
    note: 'backlog: 4 cards (SYNTHETIC cost {1}); read since stage P24 (static.attack-tax)',
  },
];

const CORPUS = [...AURAS, ...EQUIPMENT, ...GROUPS];

runCorpus('the template corpus (stage P3)', CORPUS);

test('the P3 corpus has unique lines, and supported, unparsed and not-runnable expectations', () => {
  expect(new Set(CORPUS.map((l) => `${l.kind}|${l.text}`)).size).toBe(CORPUS.length);
  expect(CORPUS.filter((l) => 'supported' in l.expect).length).toBeGreaterThanOrEqual(35);
  expect(
    CORPUS.filter((l) => 'unparsed' in l.expect && l.expect.unparsed.reason === undefined).length,
  ).toBeGreaterThanOrEqual(15);
  expect(
    CORPUS.filter((l) => 'unparsed' in l.expect && l.expect.unparsed.reason === 'notRunnable')
      .length,
  ).toBeGreaterThanOrEqual(5);
  expect(CORPUS.filter((l) => 'engine' in l.expect).length).toBeGreaterThanOrEqual(2);
});
