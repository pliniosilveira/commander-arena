// The SYNTHETIC template corpus of stage P2: activated abilities, "until end of turn" pumps,
// library search, discard, Cycling and a choice of types. Each line is a template, written after
// a real shape of the backlog (reports/backlog.md, the count it prints is in the note) or marked
// SYNTHETIC; none is a real card's text unless the note says so. Each line says whether it must
// import as supported, or where and why it stops, so a change that makes the grammar read less OR
// more than it should fails here. The kinds of expectation are those of convert-grammar-corpus.test.ts.
import { expect, test } from 'vitest';
import { type Line, NONE, no, OK, runCorpus } from './convert-grammar-corpus-helpers';

const NOT_RUNNABLE = { reason: 'notRunnable' } as const;

const ACTIVATED: readonly Line[] = [
  {
    kind: 'creature',
    text: '{2}: ~ gets +1/+0 until end of turn.',
    expect: OK,
    note: 'backlog: 226 cards',
  },
  {
    kind: 'creature',
    text: '{1}{U}: ~ gets +1/-1 until end of turn.',
    expect: OK,
    note: 'backlog: 42 cards',
  },
  {
    kind: 'artifact',
    text: '{1}, {T}, Sacrifice ~: Draw a card.',
    expect: OK,
    note: 'backlog: 49 cards',
  },
  {
    kind: 'artifact',
    text: '{2}, {T}, Sacrifice ~: Draw two cards.',
    expect: OK,
    note: 'backlog: 17 cards',
  },
  {
    kind: 'artifact',
    text: '{2}, {T}, Sacrifice ~: You gain 3 life.',
    expect: OK,
    note: 'backlog: 19 cards',
  },
  {
    kind: 'creature',
    text: '{T}: ~ deals 1 damage to any target.',
    expect: OK,
    note: 'backlog: 29 cards',
  },
  {
    kind: 'creature',
    text: '{4}, {T}: Tap target creature.',
    expect: OK,
    note: 'backlog: 38 cards',
  },
  {
    kind: 'creature',
    text: '{T}: Target creature gets +2/+2 until end of turn.',
    expect: OK,
    note: 'SYNTHETIC shape (a pump with a target)',
  },
  {
    kind: 'artifact',
    text: '{1}{U}{R}, {T}: Draw a card, then discard a card.',
    expect: OK,
    note: 'backlog: 27 cards',
  },
  {
    kind: 'enchantment',
    text: 'Sacrifice a creature: You gain 2 life.',
    expect: OK,
    note: 'SYNTHETIC shape (a sacrifice outlet)',
  },
  { kind: 'artifact', text: '{T}, Pay 2 life: Draw a card.', expect: OK, note: 'SYNTHETIC shape' },
  {
    kind: 'artifact',
    text: '{1}: Draw a card. Activate only as a sorcery.',
    expect: OK,
    note: 'SYNTHETIC shape',
  },
  {
    kind: 'artifact',
    text: 'Remove a charge counter from ~: You gain 1 life.',
    expect: OK,
    note: 'SYNTHETIC shape',
  },
  {
    kind: 'land',
    text: '{T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    expect: OK,
    note: 'backlog: 5 cards (Evolving Wilds)',
  },
  {
    kind: 'land',
    text: '{T}, Pay 1 life, Sacrifice ~: Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle.',
    expect: OK,
    note: 'backlog: a fetch land, 1 card per land-type pair',
  },
  {
    kind: 'artifact',
    text: '{2}, {T}, Sacrifice ~: Search your library for a land card, reveal it, put it into your hand, then shuffle.',
    expect: OK,
    note: 'backlog: 2 cards',
  },
  {
    kind: 'land',
    text: '{T}, Sacrifice ~: Add one mana of any color.',
    expect: OK,
    note: 'backlog: 12 cards; a mana ability that sacrifices itself (a Treasure)',
  },
  {
    kind: 'artifact',
    text: 'Sacrifice ~: Add {R}{R}.',
    expect: OK,
    note: "backlog: 13 cards; a mana ability with only the sacrifice of itself (the engine's Gold token has the shape)",
  },
  // What stays out.
  {
    kind: 'creature',
    text: '{W}: Level 2',
    expect: { engine: 'only a Class (layout class) has class level bars' },
    note: 'replay: 34 cards; the level bar of a Class is read (stage P75, D-235), and the engine refuses it on a card that is not one (the creature of this line, a leveler)',
  },
  {
    kind: 'creature',
    text: '{1}{B}: Regenerate ~.',
    expect: OK,
    note: 'backlog: 118 cards; read since the engine has regeneration (D-120, stage P21)',
  },
  {
    kind: 'land',
    text: "{4}, {T}: Target creature can't be blocked this turn.",
    expect: OK,
    note: 'backlog: 6 cards; the engine runs the `restrict` effect since D-094 (stage P12)',
  },
  {
    kind: 'artifact',
    text: '{T}: Add {G}. Draw a card.',
    expect: no('{T}: Add {G}. Draw a card.', 'ability.activated', {
      ...NOT_RUNNABLE,
      needs: ['manaAlso:draw'],
    }),
    note: 'a mana ability with a draw (CR 605.1a): never built as an ordinary activation',
  },
  {
    kind: 'land',
    text: 'Sacrifice a creature: Add {C}{C}.',
    expect: OK,
    note: "a mana ability that sacrifices a permanent of a kind the controller has, with no {T} (stage P63, D-216: Ashnod's Altar)",
  },
  {
    kind: 'artifact',
    text: '{T}, Sacrifice a creature: Add {B}{B}.',
    expect: OK,
    note: 'a mana ability with {T} that sacrifices a permanent of a kind (stage P63, D-216)',
  },
  {
    kind: 'artifact',
    text: '{T}: Add {G}. Activate only as a sorcery.',
    expect: no('Activate only as a sorcery.', 'restriction.sorcery', NOT_RUNNABLE),
    note: 'a mana ability has no timing; the diagnostic points at the restriction (stage P14)',
  },
  {
    kind: 'artifact',
    text: '{1}, Sacrifice two creatures: Draw a card.',
    expect: OK,
    note: 'the engine sacrifices several permanents as a cost since D-133',
  },
  {
    kind: 'artifact',
    text: '{T}, Sacrifice two creatures: Add {C}{C}.',
    expect: no('Sacrifice two creatures: Add {C}{C}.', 'cost.sacrifice', NOT_RUNNABLE),
    note: 'SYNTHETIC; the engine sacrifices several permanents as a cost of an ordinary activated ability only (D-133), not of a mana ability',
  },
  {
    kind: 'artifact',
    text: '{T}, Discard a card: Draw a card.',
    expect: OK,
    note: 'SYNTHETIC; stage P13: the engine pays a discard cost since D-095 (the player chooses)',
  },
  {
    kind: 'artifact',
    text: '{X}, {T}: Draw X cards.',
    expect: OK,
    note: 'SYNTHETIC; stage P16: the engine announces X for an activation (D-103)',
  },
  {
    kind: 'creature',
    text: '{2}: ~ gets +1/+1 and gains flying until end of turn.',
    expect: OK,
    note: 'read since stage P5 (grantKeyword runs, D-083); a pump and a keyword gain',
  },
  {
    kind: 'creature',
    text: '{T}: ~ gets +1/+1 until your next turn.',
    expect: no('until your next turn.', 'effect.pump'),
    note: 'only "until end of turn" has an end the engine runs',
  },
  {
    kind: 'artifact',
    text: '{1}: Draw a card. Activate only once each turn.',
    expect: OK,
    note: "read since stage P31 (D-140): the engine's `oncePerTurn`",
  },
  {
    kind: 'artifact',
    text: '{T}: You may draw a card.',
    expect: no('may draw a card.', 'effect.player'),
    note: 'the engine has no "may" on an activated ability',
  },
  {
    kind: 'land',
    text: '{T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.',
    expect: OK,
    note: 'Fabled Passage shape (stage P36, D-178: the land the search found is "that land")',
  },
];

const SEARCH: readonly Line[] = [
  {
    kind: 'sorcery',
    text: 'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    expect: OK,
    note: 'backlog: 7 cards (Rampant Growth)',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.',
    expect: OK,
    note: 'backlog: 3 cards (Cultivate)',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.',
    expect: OK,
    note: 'backlog: Farseek',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for a Forest card, put that card onto the battlefield, then shuffle.',
    expect: OK,
    note: "backlog: Nature's Lore",
  },
  {
    kind: 'sorcery',
    text: 'Search your library for a creature card, reveal it, put it into your hand, then shuffle.',
    expect: OK,
    note: 'backlog: a creature tutor',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for a card, put that card into your hand, then shuffle.',
    expect: OK,
    note: 'backlog: 8 cards; an empty filter, which the engine allows (CR 701.23d is not forced)',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for a card, put that card into your graveyard, then shuffle.',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for up to two Forest cards, put them onto the battlefield, then shuffle.',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for an artifact or enchantment card, reveal it, put it into your hand, then shuffle.',
    expect: OK,
    note: 'SYNTHETIC shape (a choice of types)',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.',
    expect: no(
      'with mana value X or less, put it onto the battlefield, then shuffle.',
      'effect.search',
    ),
    note: 'backlog: 2 cards; mana value is not in the engine filter',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for a card, then shuffle and put that card on top.',
    expect: no(', then shuffle and put that card on top.', 'effect.search'),
    note: 'backlog: 3 cards; the library is not a destination',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle.',
    expect: OK,
    note: "backlog: 1 card (Myriad Landscape); read since D-262, the engine's search option sharedLandType",
  },
  {
    kind: 'sorcery',
    text: 'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.',
    expect: OK,
    note: 'backlog: Path to Exile; the controller of the target searches (D-092, stage P11)',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.',
    expect: OK,
    note: 'SYNTHETIC; the Fabled Passage shape in a spell (stage P36, D-178)',
  },
  {
    kind: 'land',
    text: '{T}, Sacrifice ~: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap two lands.',
    expect: no('lands.', 'noun.target-permanent'),
    note: 'SYNTHETIC; "that land" is the card the search found, "two lands" is not read (since stage P49 "Then if you control four or more lands," is)',
  },
  {
    kind: 'sorcery',
    text: 'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap those lands.',
    expect: no('those lands.', 'effect.untap'),
    note: 'SYNTHETIC; a plural pronoun is not read after a search for one card (since stage P49 "Then if you control four or more lands," is)',
  },
];

const DISCARD: readonly Line[] = [
  { kind: 'sorcery', text: 'Draw a card, then discard a card.', expect: OK },
  { kind: 'sorcery', text: 'Discard a card.', expect: OK },
  { kind: 'sorcery', text: 'Each player discards a card.', expect: OK },
  { kind: 'sorcery', text: 'Target opponent discards a card.', expect: OK },
  {
    kind: 'sorcery',
    text: 'Target player discards a card at random.',
    expect: OK,
    note: 'a random discard is the engine discard.random since stage P51 (D-209)',
  },
  {
    kind: 'sorcery',
    text: 'Discard your hand.',
    expect: OK,
    note: 'a whole hand is the engine discard of as many cards as the hand holds since stage P52 (D-210)',
  },
  {
    kind: 'sorcery',
    text: 'Each player discards their hand, then draws seven cards.',
    expect: no('their hand, then draws seven cards.', 'effect.player.discard'),
  },
];

const CYCLING: readonly Line[] = [
  { kind: 'creature', text: 'Cycling {2}', expect: OK, note: 'backlog: 293 cards (Cycling {M})' },
  { kind: 'creature', text: 'Cycling {W}', expect: OK },
  {
    kind: 'creature',
    text: 'Cycling—Pay 2 life',
    expect: OK,
    note: 'SYNTHETIC: the shape is from memory of a real card, not from the backlog',
  },
  {
    kind: 'creature',
    text: 'Plainscycling {2}',
    expect: OK,
    note: 'backlog: 11 cards; a search from the hand (read since stage P17, the engine runs typecycling, D-110)',
  },
  {
    kind: 'creature',
    text: 'Basic landcycling {1}',
    expect: OK,
    note: 'backlog: 36 cards (read since stage P17)',
  },
  {
    kind: 'creature',
    text: 'Cycling {X}',
    expect: no('{X}', 'keyword.cycling'),
    note: 'X in a cost is not read',
  },
];

const CHOICES: readonly Line[] = [
  { kind: 'instant', text: 'Destroy target artifact or enchantment.', expect: OK },
  { kind: 'instant', text: 'Destroy target creature or planeswalker.', expect: OK },
  { kind: 'sorcery', text: 'Exile target artifact, creature, enchantment, or land.', expect: OK },
  { kind: 'instant', text: 'Tap target artifact or creature.', expect: OK },
  {
    kind: 'instant',
    text: 'Put a +1/+1 counter on target artifact or creature you control.',
    expect: OK,
    note: 'backlog: 1 card',
  },
  {
    kind: 'instant',
    text: 'Creatures you control get +1/+1 until end of turn.',
    expect: OK,
    note: 'backlog: 40 cards (with +N/+N)',
  },
  {
    kind: 'instant',
    text: 'Target creature gets +3/+3 until end of turn.',
    expect: OK,
    note: 'backlog: 67 cards',
  },
  {
    kind: 'instant',
    text: 'Target creature gets -2/-2 until end of turn.',
    expect: OK,
    note: 'backlog: 58 cards',
  },
  {
    kind: 'instant',
    text: 'Destroy target tapped artifact or creature.',
    expect: no('or creature.', 'noun.target-permanent'),
    note: 'what "tapped" modifies is ambiguous',
  },
  {
    kind: 'instant',
    text: 'Destroy target artifact or creature with flying.',
    expect: no('with flying.', 'noun.target-permanent'),
  },
  {
    kind: 'instant',
    text: 'Destroy target Aura or Equipment.',
    expect: OK,
    note: 'read since stage P28: a choice of subtypes for one object ("Aura or Equipment") is a disjunction of filters',
  },
  {
    kind: 'instant',
    text: 'Target creature gets +3/+1 and gains trample until end of turn.',
    expect: OK,
    note: 'backlog: 22 cards; read since stage P5 (grantKeyword runs, D-083)',
  },
  {
    kind: 'instant',
    text: 'Other creatures you control get +1/+1 until end of turn.',
    expect: no('Other creatures you control get +1/+1 until end of turn.', NONE),
    note: '"other" is not read',
  },
  {
    kind: 'instant',
    text: 'Target creature gets +3/+3.',
    expect: no('.', 'effect.pump'),
    note: 'without a duration it would last for ever (CR 611.2a)',
  },
];

const CORPUS = [...ACTIVATED, ...SEARCH, ...DISCARD, ...CYCLING, ...CHOICES];

runCorpus('the template corpus (stage P2)', CORPUS);

test('the P2 corpus has unique lines, and supported, unparsed and not-runnable expectations', () => {
  expect(new Set(CORPUS.map((l) => `${l.kind}|${l.text}`)).size).toBe(CORPUS.length);
  // Stages P51 and P52 (D-209, D-210) read two lines of this corpus that were unread ("at random", "your hand"): the floor of the unread lines moved from 15 to 13; stage P63 (D-216) read two sacrifice mana abilities, so the not-runnable floor moved from 5 to 3; D-262 read "up to two basic land cards that share a land type" (Myriad Landscape), so the unread floor moved from 13 to 12.
  expect(CORPUS.filter((l) => 'supported' in l.expect).length).toBeGreaterThanOrEqual(40);
  expect(
    CORPUS.filter((l) => 'unparsed' in l.expect && l.expect.unparsed.reason === undefined).length,
  ).toBeGreaterThanOrEqual(12);
  expect(
    CORPUS.filter((l) => 'unparsed' in l.expect && l.expect.unparsed.reason === 'notRunnable')
      .length,
  ).toBeGreaterThanOrEqual(3);
});
