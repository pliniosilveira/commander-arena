// The SYNTHETIC template corpus of stage P20: power and toughness from counts and X (D-109, D-115;
// ENGINE_VERSION 20). Each line is a template written after a real shape of the replay report
// (reports/template-replay.md, the owner's run, parser version 4; the count of cards is in the note as the
// report prints it) or marked SYNTHETIC; none is a real card's text, and no real card is marked supported
// here. Each line says whether it must import as supported, or where and why it stops, so a change that
// makes the grammar read less OR more than it should fails here. The kinds of expectation are those of
// convert-grammar-corpus.test.ts; `stats` is the printed power and toughness of a creature line.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const REPLAY: readonly Line[] = [
  {
    kind: 'creature',
    text: '~ gets +1/+0 for each artifact you control.',
    expect: OK,
    note: 'replay: 10 cards',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 for each land you control.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: '~ gets +1/+1 for each creature card in your graveyard.',
    expect: OK,
    note: 'replay: 5 cards',
  },
  {
    kind: 'creature',
    stats: ['*', '*'],
    text: "~'s power and toughness are each equal to the number of lands you control.",
    expect: OK,
    note: 'replay: 16 cards',
  },
  {
    kind: 'creature',
    stats: ['*', '*'],
    text: "~'s power and toughness are each equal to the number of cards in your hand.",
    expect: OK,
    note: 'replay: 12 cards',
  },
  {
    kind: 'creature',
    stats: ['*', '*'],
    text: "~'s power and toughness are each equal to the number of creatures you control.",
    expect: OK,
    note: 'replay: 12 cards',
  },
  {
    kind: 'creature',
    stats: ['*', '3'],
    text: "~'s power is equal to the number of creatures you control.",
    expect: OK,
    note: 'replay: 11 cards; the toughness the card prints is SYNTHETIC',
  },
  {
    kind: 'creature',
    stats: ['*', '4'],
    text: "~'s power is equal to the number of artifacts you control.",
    expect: OK,
    note: 'replay: 6 cards; the toughness the card prints is SYNTHETIC',
  },
  {
    kind: 'sorcery',
    text: 'All creatures get -X/-X until end of turn.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: '{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'instant',
    text: 'Target creature you control gets +X/+X and gains hexproof and indestructible until end of turn.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +1/+1 for each artifact and/or enchantment you control.',
    expect: OK,
    note: 'replay: 1 card; read since stage P28 (D-131): "and/or" is a disjunction of two kinds in one count',
  },
  {
    kind: 'creature',
    text: '~ gets +1/+1 for each color among permanents you control.',
    expect: OK,
    note: "replay: 1 card; read since stage P37 (D-180): the colors the permanents have between them (the engine's `colorsAmong`)",
  },
  {
    kind: 'enchantment',
    text: 'Creatures you control of the chosen type get +1/+1 for each fellowship counter on ~.',
    expect: no('fellowship counter on ~.', 'amount.for-each'),
    note: 'replay: 1 card; a counter is not an object of a filter',
  },
  {
    kind: 'enchantment',
    text: 'When ~ enters, each creature gets -X/-X until end of turn.',
    expect: no('~ enters, each creature gets -X/-X until end of turn.', 'ability.triggered', {
      reason: 'notRunnable',
    }),
    note: 'replay: 1 card; X in a triggered ability is 0 (CR 107.3j), so it is not read',
  },
  {
    kind: 'enchantment',
    text: 'When ~ enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.',
    expect: OK,
    note: 'replay: 1 card; read since stage P64 (D-217): "gain A and get +X/+X", X where it says',
  },
];

const SYNTHETIC: readonly Line[] = [
  {
    kind: 'aura',
    text: 'Enchant creature\nEnchanted creature gets -1/-1 for each creature card in your graveyard.',
    expect: OK,
    note: 'SYNTHETIC; a negative step',
  },
  {
    kind: 'equipment',
    text: 'Equipped creature gets +2/+0 for each Elf you control.',
    expect: OK,
    note: 'SYNTHETIC; a step of two, and a creature type in the count',
  },
  {
    kind: 'creature',
    text: '~ gets +1/+1 for each other creature you control.',
    expect: OK,
    note: 'SYNTHETIC; "other" leaves the source out',
  },
  {
    kind: 'enchantment',
    text: 'Other creatures you control get +1/+1 for each Elf you control.',
    expect: OK,
    note: 'SYNTHETIC; a lord scaled by a count',
  },
  {
    kind: 'creature',
    stats: ['2', '*'],
    text: "~'s toughness is equal to the number of cards in your hand.",
    expect: OK,
    note: 'SYNTHETIC; a toughness-only definition',
  },
  {
    kind: 'instant',
    text: 'Target creature gets +X/+0 until end of turn.',
    expect: OK,
    note: 'SYNTHETIC',
  },
  {
    kind: 'instant',
    text: 'Target creature gets -X/-0 until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; "-0" is 0',
  },
  {
    kind: 'creature',
    text: '{X}{R}: ~ gets +X/+0 until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; an activated ability with {X} in its cost',
  },
  {
    kind: 'sorcery',
    text: 'Each creature gets -X/-X until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; "each creature gets"',
  },
  {
    kind: 'creature',
    stats: ['*', '*'],
    text: 'Flying',
    expect: { engine: "a printed '*' power needs a characteristic-defining ability" },
    note: 'SYNTHETIC; a printed * with no line that defines it stays unsupported',
  },
  {
    kind: 'creature',
    stats: ['1+*', '1+*'],
    text: "~'s power and toughness are each equal to the number of lands you control.",
    expect: { engine: 'unsupported power value "1+*"' },
    note: 'SYNTHETIC; an offset is not a count',
  },
  {
    kind: 'creature',
    stats: ['*', '*'],
    text: "~'s power is equal to the number of lands you control.",
    expect: { engine: "a printed '*' toughness needs a characteristic-defining ability" },
    note: 'SYNTHETIC; the card prints * for a stat the line does not define',
  },
  {
    kind: 'creature',
    stats: ['2', '2'],
    text: "~'s power and toughness are each equal to the number of lands you control.",
    expect: { engine: 'which the card must print as' },
    note: 'SYNTHETIC; a line for a stat the card prints as a number',
  },
  {
    kind: 'creature',
    stats: ['*', '*'],
    text: "~'s power and toughness are each equal to twice the number of lands you control.",
    expect: no(
      "~'s power and toughness are each equal to twice the number of lands you control.",
      'none',
    ),
    note: 'SYNTHETIC; "twice" is not read',
  },
  {
    kind: 'creature',
    stats: ['*', '*'],
    text: "~'s power and toughness are each equal to the number of lands your opponents control.",
    expect: no('equal to the number of lands your opponents control.', 'static.defines-pt', {
      reason: 'notRunnable',
    }),
    note: 'SYNTHETIC; the objects of another player are not counted by a static ability',
  },
  {
    kind: 'creature',
    text: '~ gets +1/+1 for each creature you control with power 3 or greater.',
    expect: no('for each creature you control with power 3 or greater.', 'static.pt-count', {
      reason: 'notRunnable',
    }),
    note: 'SYNTHETIC; a power inside the counted filter (CR 613.8)',
  },
  {
    kind: 'creature',
    text: '~ gets +X/+X for each artifact you control.',
    expect: no('+X/+X for each artifact you control.', 'static.pt-count'),
    note: 'SYNTHETIC; X in a static ability (CR 107.3j)',
  },
  {
    kind: 'creature',
    text: '~ gets +1/+1 until end of turn for each artifact you control.',
    expect: no('until end of turn for each artifact you control.', 'static.pt-count'),
    note: 'SYNTHETIC; a count in a resolving effect is not read yet (docs/ROADMAP.md)',
  },
  {
    kind: 'instant',
    text: 'Target creature gets +X/+X until end of turn, where X is the number of creatures you control.',
    expect: OK,
    note: 'SYNTHETIC; read since stage P28 (D-131): X is the count, written into the pump',
  },
];

runCorpus('the template corpus of stage P20 (replay lines)', REPLAY);
runCorpus('the template corpus of stage P20 (SYNTHETIC lines)', SYNTHETIC);
