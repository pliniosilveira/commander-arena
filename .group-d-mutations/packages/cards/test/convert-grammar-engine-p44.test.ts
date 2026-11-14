// Parsed text is only worth something if the engine runs it as written (stage P44). These tests import a SYNTHETIC card through the grammar (never through a
// fixture), define it in an engine scenario and play it through applyAction: the Korvold deck's Emissary Green of D-194 and D-195 (ENGINE_VERSION 46), and a
// three-option vote worded in the same way. The card names start with "SYNTHETIC"; the type line, mana cost and Oracle text of Emissary Green are those of the
// real card (the owner's request file of 2026-10-29), its power and toughness, which the file does not give, are INVENTED (3/4). No ruling of the card could be
// read (Scryfall is not reachable from the sandbox).
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly, spellCard } from './convert-grammar-helpers';

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BEARS = 'Grizzly Bears';

const EMISSARY_TEXT =
  'Whenever ~ attacks, starting with you, each player votes for profit or security. You create a number of Treasure tokens equal to twice the number of profit votes. Put a number of +1/+1 counters on each creature you control equal to the number of security votes.';

const emissary: CardDefinition = parsed(
  'SYNTHETIC Parsed Emissary Green',
  'Legendary Creature — Human Advisor',
  EMISSARY_TEXT,
  { manaCost: '{4}{G}', colors: ['G'], power: '3', toughness: '4' },
);

const RITE_TEXT =
  'Starting with you, each player votes for gold, iron or ash. You gain life equal to twice the number of gold votes. Draw cards equal to the number of iron votes. Each opponent loses life equal to the number of ash votes.';
const rite: CardDefinition = parsed('SYNTHETIC Parsed Ballot Rite', 'Sorcery', RITE_TEXT, {
  manaCost: '{2}{U}',
  colors: ['U'],
});

const asked = (g: ScenarioGame) => {
  const d = g.state.pending;
  if (d?.kind !== 'chooseOption') throw new Error(`pending is ${d?.kind}`);
  return d;
};

describe('Emissary Green, the real wording through the grammar', () => {
  const attack = () => {
    const g = scenario()
      .seat(0)
      .define(emissary)
      .battlefield(emissary.name, BEARS)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([emissary.name]);
    g.passAll();
    return g;
  };
  const treasures = (g: ScenarioGame, seat: number) =>
    g.find({ name: 'Treasure' }).filter((o) => o.controller === seat).length;

  test('is valid and reads as the engine fixture of the same wording', () => {
    expect(validateCard(emissary)).toEqual([]);
    expect(emissary.faces[0]?.abilities).toEqual(
      syntheticCard('SYNTHETIC Emissary Green').faces[0]?.abilities,
    );
  });

  test('the controller votes first, then the opponent, who sees the vote', () => {
    const g = attack();
    expect(asked(g)).toMatchObject({
      seat: 0,
      purpose: 'vote',
      options: ['profit', 'security'],
      vote: { controller: 0, cast: [] },
    });
    g.act(0).chooseOption('profit');
    expect(asked(g)).toMatchObject({
      seat: 1,
      vote: { controller: 0, cast: [{ seat: 0, option: 'profit' }] },
    });
  });

  test('two profit votes make four Treasure tokens for the controller', () => {
    const g = attack();
    g.act(0).chooseOption('profit');
    g.act(1).chooseOption('profit');
    expect(treasures(g, 0)).toBe(4);
    expect(treasures(g, 1)).toBe(0);
  });

  test('two security votes put two +1/+1 counters on each creature the controller controls and none elsewhere', () => {
    const g = attack();
    g.act(0).chooseOption('security');
    g.act(1).chooseOption('security');
    expect(treasures(g, 0)).toBe(0);
    g.expect.counters(emissary.name, { '+1/+1': 2 });
    expect(
      g
        .find({ name: BEARS })
        .map((o) => [o.controller, o.counters['+1/+1'] ?? 0])
        .sort(),
    ).toEqual([
      [0, 2],
      [1, 0],
    ]);
  });

  test('a split vote: two Treasure tokens and one counter on each creature', () => {
    const g = attack();
    g.act(0).chooseOption('security');
    g.act(1).chooseOption('profit');
    expect(treasures(g, 0)).toBe(2);
    g.expect.counters(emissary.name, { '+1/+1': 1 });
  });
});

describe('a vote with three options, worded as Emissary Green is', () => {
  const play = () => {
    const g = scenario()
      .seat(0)
      .define(rite)
      .hand(rite.name)
      .battlefield('Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(rite.name, { pay: true });
    g.passAll();
    return g;
  };

  test('is valid', () => {
    expect(validateCard(rite)).toEqual([]);
  });

  test('gold and ash: 2 life for the controller and 1 for the opponent to lose', () => {
    const g = play();
    expect(asked(g).options).toEqual(['gold', 'iron', 'ash']);
    g.act(0).chooseOption('gold');
    g.act(1).chooseOption('ash');
    g.expect.life(0, 42);
    g.expect.life(1, 39);
    g.expect.handSize(0, 0);
  });

  test('iron twice: two cards', () => {
    const g = play();
    g.act(0).chooseOption('iron');
    g.act(1).chooseOption('iron');
    g.expect.handSize(0, 2);
    g.expect.life(0, 40);
  });
});

describe('what the grammar refuses', () => {
  const read = (text: string) =>
    parseOnly(spellCard('SYNTHETIC Vote Probe', text, { type: 'Sorcery' }));

  test('a count of votes with no vote before it is not supported (the engine refuses it)', () => {
    const imported = read('You gain life equal to the number of profit votes.');
    expect(imported.support.status).toBe('unsupported');
  });

  test('a count of an option the vote does not offer is not supported', () => {
    const imported = read(
      'Starting with you, each player votes for profit or security. You gain life equal to the number of gold votes.',
    );
    expect(imported.support.status).toBe('unsupported');
  });

  test.each([
    'Starting with the player to your left, each player votes for profit or security. You draw a card.',
    'Each player votes for profit or security. You draw a card.',
    'Starting with you, each player votes for a creature or a planeswalker. You draw a card.',
    'Starting with you, each player votes for profit. You draw a card.',
  ])('%s', (text) => {
    expect(read(text).support.status).toBe('unsupported');
  });

  test('the same text with one vote is supported (the probe is not why the others fail)', () => {
    expect(
      read(
        'Starting with you, each player votes for profit or security. You gain life equal to the number of profit votes.',
      ).support.status,
    ).toBe('supported');
  });
});
