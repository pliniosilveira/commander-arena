// The SYNTHETIC template corpus of stage P12: the restrictions and evasion the engine runs since
// D-094 and D-098 ("can't block", "can't be blocked", "attacks each combat if able", "doesn't untap",
// "can't be countered", "target creature can't be blocked this turn", landwalk). Each line is a
// template written after a real shape of the replay report (reports/template-replay.md and the
// templates behind it, parser version 4; the count of cards is in the note as the report prints it)
// or marked SYNTHETIC; none is a real card's text, and no real card is marked supported here. Each
// line says whether it must import as supported, or where and why it stops, so a change that makes
// the grammar read less OR more than it should fails here. The kinds of expectation are those of
// convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const SELF: readonly Line[] = [
  { kind: 'creature', text: "~ can't block.", expect: OK, note: 'replay: 91 cards' },
  { kind: 'creature', text: "~ can't be blocked.", expect: OK, note: 'replay: 60 cards' },
  {
    kind: 'creature',
    text: '~ attacks each combat if able.',
    expect: OK,
    note: 'replay: 61 cards',
  },
  {
    kind: 'creature',
    text: "~ doesn't untap during your untap step.",
    expect: OK,
    note: 'replay: 35 cards',
  },
  {
    kind: 'creature',
    text: "~ can't block and can't be blocked.",
    expect: OK,
    note: 'replay: 5 cards',
  },
  {
    kind: 'creature',
    text: "This creature can't be blocked.\nFlying",
    expect: OK,
    note: 'SYNTHETIC; "this creature" is `~`',
  },
  {
    kind: 'instant',
    text: "This spell can't be countered.\nDestroy target creature.",
    expect: OK,
    note: 'SYNTHETIC; the one static ability of an instant',
  },
  {
    kind: 'sorcery',
    text: "This spell can't be countered.\nDestroy target creature.",
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: "~ can't be blocked except by creatures with flying.",
    expect: no('except by creatures with flying.', 'static.self'),
    note: 'SYNTHETIC; an exception is not "can\'t be blocked"',
  },
  {
    kind: 'creature',
    text: "~ can't be blocked by creatures with power 2 or less.",
    expect: OK,
    note: "replay: 31 cards; read since stage P31 (D-140): the engine's `cantBeBlockedBy`",
  },
  {
    kind: 'creature',
    text: "~ can't block unless you control a Plains.",
    expect: no('unless you control a Plains.', 'static.self'),
    note: 'SYNTHETIC',
  },
  {
    kind: 'creature',
    text: 'You may choose not to untap ~ during your untap step.',
    expect: OK,
    note: 'replay: 44 cards; a choice, not a restriction; read since stage P24 (static.optional-untap)',
  },
  {
    kind: 'enchantment',
    text: "Creature spells you control can't be countered.",
    expect: OK,
    note: "replay: 4 cards; read since stage P40 (D-186): the engine's `spellsCantBeCountered`",
  },
];

const ATTACHED: readonly Line[] = [
  {
    kind: 'equipment',
    text: "Equipped creature can't be blocked.\nEquip {1}",
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'aura',
    text: "Enchant creature\nEnchanted creature can't block.",
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature attacks each combat if able.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'aura',
    text: "Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.",
    expect: OK,
    note: 'replay: 48 cards',
  },
  {
    kind: 'equipment',
    text: "Equipped creature can't be blocked and has shroud.\nEquip {1}",
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'equipment',
    text: "Equipped creature has ward {2}, is an Assassin in addition to its other types, and can't be blocked.\nEquip {2}",
    expect: no(
      "ward {2}, is an Assassin in addition to its other types, and can't be blocked.",
      'static.attached',
    ),
    note: 'replay: 1 card; ward is not a grant and "is an Assassin" is not read',
  },
  {
    kind: 'enchantment',
    text: "Creatures your opponents control can't block.",
    expect: OK,
    note: 'SYNTHETIC; the engine fixture of the filter subject',
  },
  {
    kind: 'enchantment',
    text: "Creatures with power less than ~'s power can't block creatures you control.",
    expect: no(
      "with power less than ~'s power can't block creatures you control.",
      'static.permanents',
    ),
    note: 'replay: 1 card',
  },
];

const EFFECTS: readonly Line[] = [
  {
    kind: 'instant',
    text: "Target creature can't be blocked this turn.",
    expect: OK,
    note: 'replay: 7 cards',
  },
  {
    kind: 'sorcery',
    text: "Target creature can't block this turn.",
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: "Target creature can't block this turn.\nDraw a card.",
    expect: OK,
    note: 'SYNTHETIC; two lines of one spell',
  },
  {
    kind: 'land',
    text: "{T}: Add {C}.\n{4}, {T}: Target creature can't be blocked this turn.",
    expect: OK,
    note: 'replay: 6 cards (the second line)',
  },
  {
    kind: 'creature',
    text: "Whenever ~ attacks, target creature can't block this turn.",
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'land',
    text: "{3}, {T}: Target creature with power 3 or less can't be blocked this turn.",
    expect: OK,
    note: 'replay: 5 cards; the target filter compares power since stage P18 (D-111)',
  },
  {
    kind: 'instant',
    text: "Target creature can't be blocked this turn except by creatures with flying.",
    expect: no('except by creatures with flying.', 'effect.restrict'),
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: "Target creatures can't block this turn.",
    expect: no("creatures can't block this turn.", 'noun.target-permanent'),
    note: 'SYNTHETIC; the engine takes one creature',
  },
];

const LANDWALK: readonly Line[] = [
  { kind: 'creature', text: 'Swampwalk', expect: OK, note: 'replay: 38 cards' },
  { kind: 'creature', text: 'Islandwalk', expect: OK, note: 'replay: 33 cards' },
  { kind: 'creature', text: 'Forestwalk', expect: OK, note: 'replay: 26 cards' },
  { kind: 'creature', text: 'Mountainwalk', expect: OK, note: 'the same rule' },
  { kind: 'creature', text: 'Plainswalk', expect: OK, note: 'the same rule' },
  { kind: 'creature', text: 'Nonbasic landwalk', expect: OK, note: 'the same rule' },
  { kind: 'creature', text: 'Flying, islandwalk', expect: OK, note: 'SYNTHETIC; a mixed line' },
  {
    kind: 'equipment',
    text: 'Equipped creature has snow landwalk.\nEquip {1}',
    expect: no('snow landwalk.', 'static.attached'),
    note: 'replay: 1 card; a landwalk cannot be granted (D-098)',
  },
  {
    kind: 'creature',
    text: 'Snow landwalk',
    expect: no('Snow landwalk', 'none'),
    note: 'SYNTHETIC; not an engine keyword',
  },
];

runCorpus('the template corpus (stage P12)', [...SELF, ...ATTACHED, ...EFFECTS, ...LANDWALK]);
