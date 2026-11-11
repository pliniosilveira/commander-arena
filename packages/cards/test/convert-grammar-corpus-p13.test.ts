// The SYNTHETIC template corpus of stage P13: the costs slice of the engine (D-095, D-101): additional
// costs to cast, cost reductions, the free cast with a commander, the discard cost of Ward and of an
// activated ability, and counted amounts. Each line is a template written after a real shape of the
// replay report (reports/template-replay.md and the templates behind it, parser version 4; the count
// of cards is in the note as the report prints it) or marked SYNTHETIC; none is a real card's text,
// and no real card is marked supported here. Each line says whether it must import as supported, or
// where and why it stops, so a change that makes the grammar read less OR more than it should fails
// here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { type Line, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const ADDITIONAL: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, sacrifice a creature.\nDestroy target creature.',
    expect: OK,
    note: 'replay: 58 cards',
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, discard a card.\nDraw two cards.',
    expect: OK,
    note: 'replay: 17 cards',
  },
  {
    kind: 'instant',
    text: 'As an additional cost to cast ~, sacrifice an artifact or creature.\n~ deals 4 damage to any target.',
    expect: OK,
    note: 'replay: 14 cards',
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, sacrifice a land.\nYou gain 6 life.',
    expect: OK,
    note: 'replay: 6 cards',
  },
  {
    kind: 'creature',
    text: 'As an additional cost to cast ~, discard a card.',
    expect: OK,
    note: 'SYNTHETIC; a permanent spell has additional costs too',
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, pay 3 life.\nDraw two cards.',
    expect: OK,
    note: 'SYNTHETIC; the engine pays a fixed amount of life',
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, sacrifice a creature and discard a card.\nYou gain 5 life.',
    expect: OK,
    note: 'SYNTHETIC; the two costs of the engine fixtures',
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, pay X life.\nDraw X cards.',
    expect: OK,
    note: 'replay: 7 cards; stage P16: "pay X life" is the engine\'s payXLife (D-103)',
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, sacrifice another creature.\nDraw two cards.',
    expect: no('sacrifice another creature.', 'cost.sacrifice', { reason: 'notRunnable' }),
    note: 'SYNTHETIC; the engine\'s filter has nothing to leave out ("another") for a spell',
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, sacrifice two creatures.\nDraw two cards.',
    expect: no('sacrifice two creatures.', 'cost.sacrifice', { reason: 'notRunnable' }),
    note: 'SYNTHETIC; the engine sacrifices one permanent as a cost',
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, discard a creature card.\nDraw two cards.',
    expect: no('creature card.', 'cost.discard'),
    note: 'SYNTHETIC; the engine discards N cards of the hand, with no quality',
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, sacrifice an artifact or discard a card.\nDraw two cards.',
    expect: OK,
    note: "replay: 1 card; read since stage P38 (D-182): a choice between two costs, the engine's `additionalCostChoice`",
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, pay 5 life or pay {2}.\nDraw two cards.',
    expect: OK,
    note: "replay: 1 card; read since stage P38 (D-182): a choice between two costs, the engine's `additionalCostChoice`",
  },
  {
    kind: 'sorcery',
    text: 'As an additional cost to cast ~, sacrifice a creature.\nAs an additional cost to cast ~, sacrifice a land.\nDraw two cards.',
    expect: { engine: 'more than one sacrifice cost is not supported' },
    note: 'SYNTHETIC; read, and the engine refuses a second sacrifice',
  },
];

const REDUCTIONS: readonly Line[] = [
  {
    kind: 'sorcery',
    text: '~ costs {1} less to cast for each creature on the battlefield.\n~ deals 13 damage to each creature.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'creature',
    text: '~ costs {2} less to cast.',
    expect: OK,
    note: 'SYNTHETIC; a flat reduction of the spell itself',
  },
  {
    kind: 'enchantment',
    text: 'Artifact spells you cast cost {1} less to cast.',
    expect: OK,
    note: 'replay: 5 cards',
  },
  {
    kind: 'enchantment',
    text: 'Instant and sorcery spells you cast cost {1} less to cast.',
    expect: OK,
    note: 'replay: 16 cards',
  },
  {
    kind: 'enchantment',
    text: 'Creature spells you cast cost {1} less to cast.',
    expect: OK,
    note: 'replay: 7 cards',
  },
  {
    kind: 'enchantment',
    text: 'Noncreature spells you cast cost {1} less to cast.',
    expect: OK,
    note: 'replay: 7 cards',
  },
  {
    kind: 'enchantment',
    text: 'Enchantment spells you cast cost {1} less to cast.',
    expect: OK,
    note: 'replay: 4 cards',
  },
  {
    kind: 'enchantment',
    text: 'Dragon spells you cast cost {2} less to cast.',
    expect: OK,
    note: 'replay: 4 cards',
  },
  {
    kind: 'enchantment',
    text: 'Red spells you cast cost {1} less to cast.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'enchantment',
    text: 'Black creature spells you cast cost {1} less to cast.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'Aura and Equipment spells you cast cost {1} less to cast.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'creature',
    text: '~ costs {X} less to cast, where X is the greatest power among creatures you control.',
    expect: OK,
    note: 'replay: 4 cards; read since stage P28 (D-131): X is what the text defines, an aggregate of the creatures',
  },
  {
    kind: 'creature',
    text: '~ costs {3} less to cast if you control a creature with power 4 or greater.',
    expect: OK,
    note: 'replay: 1 card; read since stage P38 (D-182): a condition on the reduction, read as the total cost is determined',
  },
  {
    kind: 'enchantment',
    text: 'As ~ enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.',
    expect: OK,
    note: 'replay: 1 card; read since stage P15 (D-100: a type chosen as the permanent entered)',
  },
  {
    kind: 'enchantment',
    text: 'Creature spells you cast with power 4 or greater cost {2} less to cast.',
    expect: OK,
    note: 'replay: 1 card; read since stage P32 (D-147): a comparison of the spell the filter says (CR 202.3, 208.1)',
  },
  {
    kind: 'enchantment',
    text: 'Each spell you cast that’s red or green costs {1} less to cast.',
    expect: no('Each spell you cast that’s red or green costs {1} less to cast.', 'none'),
    note: 'replay: 1 card',
  },
  {
    kind: 'enchantment',
    text: 'Artifact spells you cast cost {W} less to cast.',
    expect: no('{W} less to cast.', 'static.spells-cost-reduction'),
    note: 'SYNTHETIC; colored mana is never reduced (the engine reduces generic mana)',
  },
  {
    kind: 'enchantment',
    text: '~ costs {1} more to cast for each creature you control.',
    expect: no('more to cast for each creature you control.', 'static.self-cost-reduction'),
    note: 'SYNTHETIC; a cost increase is not built',
  },
];

const FREE: readonly Line[] = [
  {
    kind: 'instant',
    text: 'If you control a commander, you may cast ~ without paying its mana cost.\nCounter target spell.',
    expect: OK,
    note: 'replay: 5 cards',
  },
  {
    kind: 'sorcery',
    text: 'You may cast ~ without paying its mana cost.\nExile target creature.',
    expect: OK,
    note: 'SYNTHETIC; no condition (the engine fixture "Always Free")',
  },
  {
    kind: 'instant',
    text: 'If you control a creature, you may cast ~ without paying its mana cost.\nCounter target spell.',
    expect: no('may cast ~ without paying its mana cost.', 'effect.player'),
    note: 'SYNTHETIC; only a commander is a condition the engine tests (the lead "If you control a creature" is read since stage P32)',
  },
  {
    kind: 'instant',
    text: 'You may cast a spell with mana value 5 or less from your hand without paying its mana cost.',
    expect: OK,
    note: "replay: 5 cards; read since stage P32 (D-147): the engine's `castFree`, a card chosen from the hand as the effect resolves",
  },
];

const DISCARD: readonly Line[] = [
  {
    kind: 'creature',
    text: 'Ward—Discard a card.',
    expect: OK,
    note: 'replay: 12 cards',
  },
  {
    kind: 'creature',
    text: 'Discard a card: ~ gets +1/+1 until end of turn.',
    expect: OK,
    note: 'SYNTHETIC; the cost of an activated ability',
  },
  {
    kind: 'artifact',
    text: '{1}, Discard a card: Draw a card.',
    expect: OK,
    note: 'SYNTHETIC; the mana before the discard',
  },
  {
    kind: 'artifact',
    text: '{T}, Discard a card: Draw a card.',
    expect: OK,
    note: 'SYNTHETIC; a discard beside {T}',
  },
  {
    kind: 'artifact',
    text: '{1}, Discard a card, Discard a card: Draw a card.',
    expect: no('{1}, Discard a card, Discard a card: Draw a card.', 'ability.activated', {
      reason: 'notRunnable',
    }),
    note: 'SYNTHETIC; the engine pays one discard cost',
  },
  {
    kind: 'artifact',
    text: '{T}, Discard a card: Add {R}{R}.',
    expect: no('{T}, Discard a card: Add {R}{R}.', 'ability.activated', {
      reason: 'notRunnable',
      needs: ['manaCost:discard'],
    }),
    note: 'SYNTHETIC; a mana ability pays no discard',
  },
  {
    kind: 'creature',
    text: 'Ward—Discard a creature card.',
    expect: no('creature card.', 'cost.discard'),
    note: 'SYNTHETIC; no quality on the discarded card',
  },
  {
    kind: 'creature',
    text: 'Discard ~: ~ gets +1/+1 until end of turn.',
    expect: no('~: ~ gets +1/+1 until end of turn.', 'cost.discard'),
    note: 'SYNTHETIC; the card is not discarded by its own name ("Discard this card" is read since stage P68)',
  },
];

const COUNTED: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Draw a card for each creature you control.',
    expect: OK,
    note: 'replay: 2 cards',
  },
  {
    kind: 'artifact',
    text: '{1}{B}{B}, {T}: Draw a card, then you lose life equal to the number of cards in your hand.',
    expect: OK,
    note: 'replay: 1 card',
  },
  {
    kind: 'sorcery',
    text: 'You gain life equal to the number of lands you control.',
    expect: OK,
    note: 'SYNTHETIC; the engine example of "Land Tithe"',
  },
  {
    kind: 'sorcery',
    text: '~ deals damage to target player equal to the number of creatures on the battlefield.',
    expect: OK,
    note: 'SYNTHETIC; the engine example of "Crowd Burn"',
  },
  {
    kind: 'sorcery',
    text: 'You gain 4 life for each creature you control with power 4 or greater.',
    expect: OK,
    note: 'replay: 1 card; read since stage P28 (D-131): four life for each is `multiple` of the count, the quality "with power 4 or greater" is the filter',
  },
  {
    kind: 'creature',
    text: '~ gets +1/+0 until end of turn for each artifact you control.',
    expect: no('until end of turn for each artifact you control.', 'static.pt-count'),
    note: 'replay: 10 cards say "~ gets +1/+0 for each artifact you control." (read since stage P20); a count after the duration of a pump is not read',
  },
  {
    kind: 'creature',
    text: 'When ~ enters, create a 0/1 green Plant creature token for each land you control.',
    expect: OK,
    note: 'replay: 1 card; read since stage P15 (`effect.create-token` counts a single token)',
  },
  {
    kind: 'creature',
    text: 'At the beginning of your upkeep, you lose 1 life for each burden counter on ~.',
    expect: OK,
    note: "replay: 1 card; read since stage P28 (D-131): the counters on the permanent are the engine's `countersOn`",
  },
];

runCorpus('the template corpus (stage P13): additional costs to cast', ADDITIONAL);
runCorpus('the template corpus (stage P13): cost reductions', REDUCTIONS);
runCorpus('the template corpus (stage P13): the free cast with a commander', FREE);
runCorpus('the template corpus (stage P13): discard as a cost', DISCARD);
runCorpus('the template corpus (stage P13): counted amounts', COUNTED);
