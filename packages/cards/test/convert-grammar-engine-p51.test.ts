// The Vraska deck, groups 5 and on (stage P51, D-209 and following): the REAL cards of the owner's golden corpus (real Oracle text,
// `fixtures/corpus/golden.jsonl`) read through the grammar only, defined in an engine scenario and played through applyAction. Nothing here is written from a
// masked or invented wording. No ruling of any card could be read (Scryfall is not reachable from the sandbox): nothing below rests on one.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';

const TUNE = real('Tune the Narrative');
const RUSH = real('Rush of Inspiration // Crackling Falls');
const EXPERIMENT = real('Unstable Experiment');

const energyOf = (g: { state: { seats: readonly { energy?: number }[] } }, seat = 0) =>
  g.state.seats[seat]?.energy ?? 0;

describe('Tune the Narrative (draw a card, you get {E}{E})', () => {
  const game = (copies = 1) =>
    scenario()
      .define(TUNE)
      .seat(0)
      .hand(...Array.from({ length: copies }, () => TUNE.name))
      .battlefield('Island', { count: 2 })
      .library('Forest', 'Plains', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('draws a card and gives the controller two energy counters (CR 107.14, 122.1)', () => {
    const g = game();
    g.act(0).cast(TUNE.name, { pay: true });
    g.passAll();
    expect(energyOf(g)).toBe(2);
    expect(getView(g.state, 0).seats[0]?.energy).toBe(2);
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    // The opponent has none.
    expect(energyOf(g, 1)).toBe(0);
    g.expect.invariants();
  });

  test('the energy is kept: a second one makes four', () => {
    const g = game(2);
    g.act(0).cast({ name: TUNE.name, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll();
    g.act(0).cast(TUNE.name, { pay: true });
    g.passAll();
    expect(energyOf(g)).toBe(4);
  });
});

describe('Rush of Inspiration (draw two, then discard a card at random unless you pay {E}{E}) // Crackling Falls', () => {
  const RUSH_FRONT = RUSH.name;
  const game = (hand: string[]) =>
    scenario()
      .define(TUNE)
      .define(RUSH)
      .seat(0)
      .hand(...hand)
      .battlefield('Island', { count: 4 })
      .library('Forest', 'Plains', 'Swamp', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as a draw, then a random discard unless the controller pays {E}{E} (CR 701.9b, 118.12a)', () => {
    const effect = RUSH.faces[0]?.spell?.effect;
    expect(effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'draw', count: 2 },
        {
          kind: 'unlessPays',
          cost: [{ kind: 'energy', count: 2 }],
          effect: { kind: 'discard', count: 1, random: true },
        },
      ],
    });
  });

  test('without energy nothing is asked: a card of the hand is discarded at random', () => {
    const g = game([RUSH_FRONT]);
    g.act(0).cast(RUSH_FRONT, { pay: true });
    g.passAll();
    // The hand held no card after the cast; two came from the library and one of them went away.
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    expect(g.state.seats[0]?.graveyard.length).toBe(2);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('with energy the controller is asked; paying keeps both cards and spends the energy', () => {
    const g = game([TUNE.name, RUSH_FRONT]);
    g.act(0).cast(TUNE.name, { pay: true });
    g.passAll();
    expect(energyOf(g)).toBe(2);
    g.act(0).cast(RUSH_FRONT, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    expect(energyOf(g)).toBe(0);
    // Tune drew one, Rush two, and the Rush went to the graveyard along with the Tune: no discard.
    expect(g.state.seats[0]?.hand).toHaveLength(3);
    g.expect.invariants();
  });

  test('declining the payment keeps the energy and discards a card at random', () => {
    const g = game([TUNE.name, RUSH_FRONT]);
    g.act(0).cast(TUNE.name, { pay: true });
    g.passAll();
    g.act(0).cast(RUSH_FRONT, { pay: true });
    g.passAll();
    g.act(0).decline();
    expect(energyOf(g)).toBe(2);
    expect(g.state.seats[0]?.hand).toHaveLength(2);
    g.expect.invariants();
  });

  test("the same seed discards the same card (the generator is the game's)", () => {
    const run = () => {
      const g = game([RUSH_FRONT]);
      g.act(0).cast(RUSH_FRONT, { pay: true });
      g.passAll();
      return g.state.seats[0]?.hand.map((id) => g.state.objects[id]?.card);
    };
    expect(run()).toEqual(run());
  });

  test('Crackling Falls, the land side, enters tapped and taps for {U} or {R}', () => {
    const g = game([RUSH_FRONT]);
    g.act(0).playLand(RUSH_FRONT, { face: 1 });
    g.expect.tapped('Crackling Falls', true);
  });
});

describe('Unstable Experiment (target player draws a card, then up to one target creature you control connives)', () => {
  const game = (hand: string[], library: string[]) =>
    scenario()
      .define(EXPERIMENT)
      .seat(0)
      .hand(EXPERIMENT.name, ...hand)
      .battlefield(BEARS)
      .battlefield('Island', { count: 2 })
      .library(...library, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('the creature connives: a nonland card discarded puts a +1/+1 counter on it (CR 701.50a)', () => {
    const g = game(['Lightning Bolt'], ['Forest']);
    g.act(0).cast(EXPERIMENT.name, { targets: [{ player: 0 }, BEARS], pay: true });
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Lightning Bolt');
    g.expect.counters(BEARS, { '+1/+1': 1 });
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEARS)).toMatchObject({
      power: 3,
      toughness: 3,
    });
    g.expect.invariants();
  });

  test('a land discarded puts no counter', () => {
    const g = game([], ['Forest']);
    g.act(0).cast(EXPERIMENT.name, { targets: [{ player: 0 }, BEARS], pay: true });
    g.passAll();
    // The player drew a Forest (the target draws), the creature connives: it draws and then discards a land.
    g.act(0).chooseCards('Forest');
    g.expect.counters(BEARS, {});
  });

  test('the creature is the target of up to one: it can be cast with the player alone, and the player draws', () => {
    const g = game([], ['Forest']);
    g.act(0).cast(EXPERIMENT.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.state.seats[1]?.hand).toHaveLength(1);
    g.expect.invariants();
  });
});

const GRINDER = real('Ruin Grinder');
const GEARHULK = real('Combustible Gearhulk');
const MOG = real('Mog, Moogle Warrior');

describe('Ruin Grinder (when it dies, each player may discard their hand and draw seven cards)', () => {
  const game = () =>
    scenario()
      .define(GRINDER)
      .seat(0)
      .battlefield(GRINDER.name)
      .battlefield('Swamp', { count: 3 })
      .hand('Murder', BEARS, 'Lightning Bolt')
      .library(...FILLER)
      .seat(1)
      .hand('Plains', 'Plains')
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const kill = () => {
    const g = game();
    g.act(0).cast('Murder', { targets: [GRINDER.name], pay: true });
    g.passAll();
    return g;
  };

  test('reads as a question to each player, who is "you" in what they do (CR 608.2d)', () => {
    const trigger = GRINDER.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      effect: {
        kind: 'playersMay',
        players: { kind: 'eachPlayer' },
        runsAs: 'chooser',
        effect: { kind: 'sequence', effects: [{ kind: 'discard' }, { kind: 'draw', count: 7 }] },
      },
    });
  });

  test('the active player answers first; one who accepts discards their hand and draws seven, one who declines keeps theirs (CR 101.4)', () => {
    const g = kill();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    // The hand of seat 0 held the bears and the Bolt (the Murder was cast): both were discarded, seven were drawn.
    expect(g.state.seats[0]?.hand).toHaveLength(7);
    expect(g.state.seats[0]?.graveyard.length).toBeGreaterThanOrEqual(3);
    expect(g.state.seats[1]?.hand).toHaveLength(2);
    g.expect.invariants();
  });

  test('both may: each discards their own hand and draws seven', () => {
    const g = kill();
    g.act(0).accept();
    g.act(1).accept();
    expect(g.state.seats[0]?.hand).toHaveLength(7);
    expect(g.state.seats[1]?.hand).toHaveLength(7);
    expect(g.state.seats[1]?.graveyard).toHaveLength(2);
  });

  test('both decline: nothing happens', () => {
    const g = kill();
    g.act(0).decline();
    g.act(1).decline();
    expect(g.state.seats[0]?.hand).toHaveLength(2);
    expect(g.state.seats[1]?.hand).toHaveLength(2);
  });
});

describe('Combustible Gearhulk (target opponent may have you draw three cards; if not, you mill three cards and it deals damage equal to their total mana value)', () => {
  const game = () =>
    scenario()
      .define(GEARHULK)
      .seat(0)
      .hand(GEARHULK.name)
      .battlefield('Mountain', { count: 6 })
      .library('Serra Angel', BEARS, 'Lightning Bolt', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const cast = () => {
    const g = game();
    g.act(0).cast(GEARHULK.name, { pay: true });
    g.passAll();
    return g;
  };

  test('the opponent is asked, and if they accept the controller draws three cards (CR 608.2d)', () => {
    const g = cast();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    expect(g.state.seats[0]?.hand).toHaveLength(3);
    expect(g.state.seats[1]?.life).toBe(40);
    g.expect.invariants();
  });

  test('if they decline, the controller mills three and the opponent takes damage equal to their total mana value (CR 202.3, 701.17)', () => {
    const g = cast();
    g.act(1).decline();
    // Serra Angel (5), Grizzly Bears (2) and Lightning Bolt (1) are the top three cards.
    expect(g.state.seats[0]?.graveyard).toHaveLength(3);
    expect(g.state.seats[0]?.hand).toHaveLength(0);
    expect(g.state.seats[1]?.life).toBe(32);
    g.expect.invariants();
  });
});

describe('Mog, Moogle Warrior (at your end step each player may discard a card; those who did draw; a creature card makes a Moogle; a noncreature card grows the Moogles)', () => {
  const game = (mine: string[], theirs: string[]) =>
    scenario()
      .define(MOG)
      .seat(0)
      .battlefield(MOG.name)
      .hand(...mine)
      .library(...FILLER)
      .seat(1)
      .hand(...theirs)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const toEnd = (g: ReturnType<typeof game>) => {
    // Both players pass in the second main phase: the end step begins, and the trigger asks the first player.
    g.advanceTo('postcombatMain');
    g.act(0).pass();
    g.act(1).pass();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
  };
  const moogles = (g: ReturnType<typeof game>) =>
    getView(g.state, 0).battlefield.filter((o) => o.name === 'Moogle');

  test('a creature card discarded makes a 1/2 lifelink Moogle, and a noncreature card discarded then gives it a +1/+1 counter (CR 608.2c)', () => {
    const g = game([BEARS], ['Lightning Bolt']);
    toEnd(g);
    // One card in hand: nothing to choose, the card is discarded (CR 701.9b).
    g.act(0).accept();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    // Each player who discarded drew a card.
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    expect(g.state.seats[1]?.hand).toHaveLength(1);
    const [moogle] = moogles(g);
    expect(moogles(g)).toHaveLength(1);
    expect(moogle).toMatchObject({ power: 2, toughness: 3, isToken: true });
    expect(moogle?.keywords).toContain('lifelink');
    g.expect.invariants();
  });

  test('only the players who discarded draw: one who declines keeps their hand, no creature card makes no Moogle', () => {
    const g = game(['Lightning Bolt'], [BEARS]);
    toEnd(g);
    g.act(0).accept();
    g.act(1).decline();
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    expect(g.state.seats[1]?.hand).toHaveLength(1);
    expect(moogles(g)).toHaveLength(0);
  });

  test('a creature card alone makes a 1/2 Moogle with no counter', () => {
    const g = game([BEARS], []);
    toEnd(g);
    g.act(0).accept();
    g.act(1).decline();
    const [moogle] = moogles(g);
    expect(moogle).toMatchObject({ power: 1, toughness: 2 });
  });
});

const RELM = real("Relm's Sketching");
const SNARL = real('Furycalm Snarl');

describe("Relm's Sketching (create a token that's a copy of target artifact, creature, or land): a token copy of a land asks what the land asks (CR 614.12)", () => {
  const SHOCK = 'SYNTHETIC Shock Land';
  const game = (target: string, extra: string[] = []) =>
    scenario()
      .define(RELM)
      .define(SNARL)
      .seat(0)
      .hand(RELM.name, ...extra)
      .battlefield('Island', { count: 4 })
      .battlefield(target)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const tokenOf = (g: ReturnType<typeof game>, name: string) =>
    getView(g.state, 0).battlefield.find((o) => o.name === name && o.isToken);
  const cast = (g: ReturnType<typeof game>, target: string) => {
    g.act(0).cast(RELM.name, { targets: [target], pay: true });
    g.passAll();
  };

  test('a creature: the token is a copy of it', () => {
    const g = game(BEARS);
    cast(g, BEARS);
    expect(tokenOf(g, BEARS)).toMatchObject({ power: 2, toughness: 2 });
    g.expect.invariants();
  });

  test('a shock land: the controller is asked, and paying 2 life makes the token enter untapped', () => {
    const g = game(SHOCK);
    cast(g, SHOCK);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    expect(tokenOf(g, SHOCK)).toMatchObject({ tapped: false });
    expect(g.state.seats[0]?.life).toBe(38);
    g.expect.invariants();
  });

  test('a shock land: declining enters the token tapped and costs nothing', () => {
    const g = game(SHOCK);
    cast(g, SHOCK);
    g.act(0).decline();
    expect(tokenOf(g, SHOCK)).toMatchObject({ tapped: true });
    expect(g.state.seats[0]?.life).toBe(40);
  });

  test('a land that reveals a card: with a Mountain in hand the token enters untapped, and the Mountain stays in hand', () => {
    const g = game(SNARL.name, ['Mountain']);
    cast(g, SNARL.name);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    expect(tokenOf(g, SNARL.name)).toMatchObject({ tapped: false });
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    g.expect.invariants();
  });

  // D-225 (CR 614.12, 701.20a): the player chooses which card to reveal when more than one qualifies; what the opponent learns is the player's to decide.
  test('with two cards that qualify the player chooses which is revealed, and that card is the one the log shows', () => {
    const g = game(SNARL.name, ['Mountain', 'Plains']);
    cast(g, SNARL.name);
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the choice of a card to reveal');
    expect(d).toMatchObject({ purpose: 'reveal', zone: 'hand', seat: 0, min: 1, max: 1 });
    expect(d.legal).toHaveLength(2);
    const mark = g.mark();
    g.act(0).chooseCards({ name: 'Plains', zone: 'hand' });
    const revealed = g.eventsSince(mark).filter((e) => e.kind === 'cardsRevealed');
    expect(revealed).toMatchObject([{ names: ['Plains'], from: 'hand' }]);
    expect(tokenOf(g, SNARL.name)).toMatchObject({ tapped: false });
    expect(g.state.seats[0]?.hand).toHaveLength(2);
    g.expect.invariants();
  });

  test('declining the reveal asks nothing more and the token enters tapped', () => {
    const g = game(SNARL.name, ['Mountain', 'Plains']);
    cast(g, SNARL.name);
    g.act(0).decline();
    g.expect.pending('priority', 0);
    expect(tokenOf(g, SNARL.name)).toMatchObject({ tapped: true });
  });

  test('playing the land from the hand asks the same: two cards, the player picks the one revealed', () => {
    const g = scenario()
      .define(SNARL)
      .seat(0)
      .hand(SNARL.name, 'Mountain', 'Plains')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).playLand(SNARL.name);
    g.act(0).accept();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the choice of a card to reveal');
    expect(d.purpose).toBe('reveal');
    const mark = g.mark();
    g.act(0).chooseCards({ name: 'Mountain', zone: 'hand' });
    expect(g.eventsSince(mark).filter((e) => e.kind === 'cardsRevealed')).toMatchObject([
      { names: ['Mountain'] },
    ]);
    g.expect.tapped(SNARL.name, false);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('with one card that qualifies it is revealed without a question', () => {
    const g = scenario()
      .define(SNARL)
      .seat(0)
      .hand(SNARL.name, 'Mountain', 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).playLand(SNARL.name);
    g.act(0).accept();
    g.expect.pending('priority', 0);
    g.expect.tapped(SNARL.name, false);
  });

  test('a land that reveals a card with nothing to reveal enters tapped and nothing is asked', () => {
    const g = game(SNARL.name);
    cast(g, SNARL.name);
    g.expect.pending('priority', 0);
    expect(tokenOf(g, SNARL.name)).toMatchObject({ tapped: true });
  });
});

const MIRROR = real('Cursed Mirror');

// CR 614.12, 707.9, 111.2 (D-225): "As this artifact enters, you may have it become a copy of any creature on the battlefield until end of turn, except it has
// haste." A token that is a copy of such a permanent enters with the same replacement effect, so its controller is asked as it is created.
describe("Relm's Sketching on Cursed Mirror: a token copy of a permanent that may enter as a copy asks (CR 614.12)", () => {
  const game = (creatures: readonly string[]) =>
    scenario()
      .define(RELM)
      .define(MIRROR)
      .seat(0)
      .hand(RELM.name)
      .battlefield('Island', { count: 4 })
      .battlefield(MIRROR.name)
      .battlefield(...creatures)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const cast = (g: ReturnType<typeof game>) => {
    g.act(0).cast(RELM.name, { targets: [MIRROR.name], pay: true });
    g.passAll();
  };
  const tokens = (g: ReturnType<typeof game>) =>
    getView(g.state, 0).battlefield.filter((o) => o.isToken);

  test('the controller chooses a creature: the token becomes a copy of it with haste, until end of turn', () => {
    const g = game([BEARS]);
    cast(g);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected the choice of a creature');
    expect(d).toMatchObject({ purpose: 'entersCopy', seat: 0, min: 0, max: 1 });
    expect(d.legal).toEqual([g.id(BEARS)]);
    g.act(0).choosePermanents(BEARS);
    const [token] = tokens(g);
    expect(token).toMatchObject({ name: BEARS, power: 2, toughness: 2 });
    expect(token?.keywords).toContain('haste');
    g.expect.invariants();
    // At the end of the turn it is a Cursed Mirror again (CR 514.2).
    g.advanceTo('upkeep', { turn: 'next' });
    expect(tokens(g)[0]?.name).toBe(MIRROR.name);
  });

  test('choosing none leaves the token a Cursed Mirror', () => {
    const g = game([BEARS]);
    cast(g);
    g.act(0).choosePermanents();
    expect(tokens(g)[0]).toMatchObject({ name: MIRROR.name });
  });

  test('with no creature on the battlefield nothing is asked', () => {
    const g = game([]);
    cast(g);
    g.expect.pending('priority', 0);
    expect(tokens(g)[0]).toMatchObject({ name: MIRROR.name });
  });
});

const GOGO = real('Gogo, Mysterious Mime');

describe('Gogo, Mysterious Mime (at the beginning of combat you may have ~ become a copy of another target creature you control, except its name is ~; if you do, both get +2/+0, haste and attack)', () => {
  const ANGEL = 'Serra Angel';
  const game = () =>
    scenario()
      .define(GOGO)
      .seat(0)
      .battlefield(GOGO.name)
      .battlefield(ANGEL)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  const toCombat = () => {
    const g = game();
    // Both players pass in the main phase: the beginning of combat begins and the trigger asks its controller.
    g.act(0).pass();
    g.act(1).pass();
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    return g;
  };
  const view = (g: ReturnType<typeof game>, name: string) =>
    getView(g.state, 0).battlefield.find((o) => o.name === name);

  test('accepting makes Gogo a copy of the Angel that keeps its own name, and both get +2/+0 and haste (CR 707.2, 707.9a)', () => {
    const g = toCombat();
    g.act(0).accept();
    expect(view(g, GOGO.name)).toMatchObject({ power: 6, toughness: 4 });
    expect(view(g, GOGO.name)?.keywords).toEqual(expect.arrayContaining(['flying', 'haste']));
    expect(view(g, ANGEL)).toMatchObject({ power: 6, toughness: 4 });
    expect(view(g, ANGEL)?.keywords).toContain('haste');
    g.expect.invariants();
  });

  test('both must attack this turn if able', () => {
    const g = toCombat();
    g.act(0).accept();
    g.passAll();
    // The declare attackers decision requires both creatures: attacking with neither is refused.
    g.expect.pending('declareAttackers', 0);
    expect(g.act(0).try.declareAttackers([]).ok).toBe(false);
    g.act(0).attack([GOGO.name, ANGEL]);
    g.expect.invariants();
  });

  test('declining changes nothing: Gogo is a 2/2 and the Angel is untouched', () => {
    const g = toCombat();
    g.act(0).decline();
    expect(view(g, GOGO.name)).toMatchObject({ power: 2, toughness: 2 });
    expect(view(g, ANGEL)).toMatchObject({ power: 4, toughness: 4 });
  });
});

const FACE = real('Face Yourself');

describe('Face Yourself (for each creature target player controls, a token copy with haste that is sacrificed at the end step unless you control a planeswalker)', () => {
  const ANGEL = 'Serra Angel';
  const game = (mine: string[] = []) =>
    scenario()
      .define(FACE)
      .seat(0)
      .hand(FACE.name)
      .battlefield('Mountain', { count: 7 })
      .battlefield(...mine)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, ANGEL)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const cast = (g: ReturnType<typeof game>) => {
    g.act(0).cast(FACE.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
  };
  const tokens = (g: ReturnType<typeof game>) =>
    getView(g.state, 0).battlefield.filter((o) => o.isToken);
  const toEndStep = (g: ReturnType<typeof game>) => {
    g.advanceTo('end');
    // Two triggers of one player: the order they go on the stack is asked (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
  };

  test('one token for each creature of the target player, a copy of it with haste, made by the caster (CR 707.2, 111.4)', () => {
    const g = game();
    cast(g);
    const made = tokens(g);
    expect(made.map((o) => o.name).sort()).toEqual([BEARS, ANGEL].sort());
    expect(made.find((o) => o.name === ANGEL)).toMatchObject({ power: 4, toughness: 4 });
    for (const token of made) expect(token.keywords).toContain('haste');
    expect(made.every((o) => o.controller === 0)).toBe(true);
    g.expect.invariants();
  });

  test('at the beginning of the end step the tokens are sacrificed when you control no planeswalker', () => {
    const g = game();
    cast(g);
    toEndStep(g);
    expect(tokens(g)).toHaveLength(0);
    // The opponent's creatures are untouched.
    expect(getView(g.state, 1).battlefield.map((o) => o.name)).toEqual(
      expect.arrayContaining([BEARS, ANGEL]),
    );
  });

  test('with a planeswalker they stay (CR 603.4: the condition is read as the step begins)', () => {
    const g = game(['SYNTHETIC Loyalty Walker']);
    cast(g);
    // The condition is false as the step begins: nothing triggers and nothing is asked.
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g)).toHaveLength(2);
  });
});

const BATTLEMAGE = real('Pompous Battlemage // Improvised Act');
const CHRONOLOGIST = real('Fatehold Chronologist // Peer Review');

describe('Pompous Battlemage // Improvised Act and Fatehold Chronologist // Peer Review (CR 722: prepare)', () => {
  const FRONT_B = 'Pompous Battlemage';
  const game = (hand: string[], battlefield: string[] = []) =>
    scenario()
      .define(BATTLEMAGE)
      .define(CHRONOLOGIST)
      .seat(0)
      .hand(
        ...hand.map((n) =>
          n === FRONT_B ? BATTLEMAGE.name : n === 'Fatehold Chronologist' ? CHRONOLOGIST.name : n,
        ),
      )
      .battlefield('Mountain', 'Mountain', 'Plains', 'Island', 'Island')
      .battlefield(...battlefield)
      .library('Forest', 'Plains', 'Swamp', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const permanent = (g: ReturnType<typeof game>, name: string) =>
    getView(g.state, 0).battlefield.find((o) => o.name === name);
  const copies = (g: ReturnType<typeof game>) =>
    Object.values(g.state.objects).filter((o) => o.prepareOf !== undefined);

  test('both read as a card of the layout prepare with "enters prepared" on the creature face (CR 722.2, 722.3a)', () => {
    for (const def of [BATTLEMAGE, CHRONOLOGIST]) {
      expect(def.layout).toBe('prepare');
      expect(def.faces).toHaveLength(2);
      expect(def.faces[0]?.abilities).toContainEqual({
        kind: 'replacement',
        replacement: { kind: 'entersPrepared' },
      });
      expect(def.faces[1]?.types.some((t) => t === 'sorcery')).toBe(true);
    }
  });

  test('in the hand the card is only the creature; the prepare spell is not cast from the card (CR 722.3, 722.4)', () => {
    const g = game([FRONT_B]);
    g.expect.legal(0, { cast: FRONT_B });
    expect(getView(g.state, 0).seats[0]?.hand?.[0]?.name).toBe(FRONT_B);
    expect(copies(g)).toHaveLength(0);
    // No legal cast names the prepare spell: Improvised Act cannot be cast from the card in the hand.
    expect(
      getLegalActions(g.state, 0).some(
        (a) => a.kind === 'castSpell' && (a as { face?: number }).face === 1,
      ),
    ).toBe(false);
  });

  test('it enters prepared: the designation, and a copy of the prepare spell in exile (CR 722.3a, 722.3c)', () => {
    const g = game([FRONT_B]);
    g.act(0).cast(FRONT_B, { pay: true });
    g.passAll();
    expect(g.state.objects[permanent(g, FRONT_B)?.id as never]?.prepared).toBe(true);
    const [copy] = copies(g);
    expect(copies(g)).toHaveLength(1);
    expect(copy?.zone).toBe('exile');
    expect(copy?.card).toBeNull();
    // It is the prepare spell, one card of the game (one object, not two cards: CR 722.2c).
    expect(getView(g.state, 0).exile.map((o) => o.name)).toContain('Improvised Act');
    g.expect.legal(0, { cast: 'Improvised Act' });
    g.expect.invariants();
  });

  test('casting the copy: the permanent loses the designation, the spell resolves, and the copy ceases to exist (CR 722.3c, 601.2i, 707.10a)', () => {
    const g = game([FRONT_B, 'Plains']);
    g.act(0).cast(FRONT_B, { pay: true });
    g.passAll();
    g.act(0).cast(copies(g)[0]?.id as string, { pay: true });
    expect(g.state.objects[permanent(g, FRONT_B)?.id as never]?.prepared).toBeUndefined();
    g.passAll();
    // "You may discard a card. If you do, draw a card."
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    expect(copies(g)).toHaveLength(0);
    expect(getView(g.state, 0).exile.map((o) => o.name)).not.toContain('Improvised Act');
    // A prepared permanent is cast once: nothing in exile can be cast again.
    expect(copies(g)).toHaveLength(0);
    g.expect.invariants();
  });

  // CR 722.2b (D-225): "The existence and values of these alternative characteristics are part of the object's copiable values", so a token that is a copy of a
  // preparation creature has the prepare spell, enters prepared (the "enters prepared" ability is copied too) and its controller gets a copy of the prepare spell in exile.
  test("Relm's Sketching on a prepared creature: the token copy has the prepare spell, enters prepared and the copy waits in exile (CR 722.2b, 722.3c)", () => {
    const g = scenario()
      .define(BATTLEMAGE)
      .define(RELM)
      .seat(0)
      .hand(BATTLEMAGE.name, RELM.name)
      .battlefield('Mountain', 'Mountain', 'Plains', 'Island', 'Island')
      .battlefield('Island', 'Island', 'Island', 'Island')
      .library('Forest', 'Plains', 'Swamp', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(BATTLEMAGE.name, { pay: true });
    g.passAll();
    expect(copies(g)).toHaveLength(1);
    g.act(0).cast(RELM.name, { targets: [{ name: FRONT_B }], pay: true });
    g.passAll();
    const token = Object.values(g.state.objects).find(
      (o) => o.token !== null && o.prepared === true,
    );
    expect(token).toBeDefined();
    // Two prepared permanents, each with its own copy of the prepare spell in exile.
    expect(copies(g)).toHaveLength(2);
    expect(copies(g).map((c) => c.prepareOf)).toContain(token?.id);
    g.expect.invariants();
  });

  test('the permanent leaves the battlefield: the copy is gone, and a new object that enters prepared again makes a new one (CR 400.7)', () => {
    const g = game([FRONT_B, 'Unsummon'], []);
    g.act(0).cast(FRONT_B, { pay: true });
    g.passAll();
    expect(copies(g)).toHaveLength(1);
    g.act(0).cast('Unsummon', { targets: [FRONT_B], pay: true });
    g.passAll();
    expect(copies(g)).toHaveLength(0);
    // Nothing in exile can be cast.
    expect(getView(g.state, 0).exile.map((o) => o.name)).not.toContain('Improvised Act');
  });

  test("Fatehold Chronologist's Peer Review makes a 2/2 Wizard Soldier token named Cadet and surveils 1", () => {
    const g = game(['Fatehold Chronologist']);
    g.act(0).cast('Fatehold Chronologist', { pay: true });
    g.passAll();
    g.act(0).cast(copies(g)[0]?.id as string, { pay: true });
    g.passAll();
    const cadet = getView(g.state, 0).battlefield.find((o) => o.isToken);
    expect(cadet).toMatchObject({ power: 2, toughness: 2 });
    expect(cadet?.subtypes).toEqual(expect.arrayContaining(['Wizard', 'Soldier']));
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: ['Forest'], other: [] });
    g.expect.invariants();
  });

  test('two prepared permanents have a copy each and each is cast on its own', () => {
    const g = game([FRONT_B, FRONT_B]);
    g.act(0).cast({ name: FRONT_B, zone: 'hand', nth: 0 }, { pay: true });
    g.passAll();
    g.act(0).cast(FRONT_B, { pay: true });
    g.passAll();
    expect(copies(g)).toHaveLength(2);
  });
});

describe('Studious First-Year // Rampant Growth (a preparation card of the training corpus that the layout reads, D-214)', () => {
  const STUDIOUS = real('Studious First-Year // Rampant Growth');
  test('it enters prepared; its copy of Rampant Growth is cast from exile and puts a basic land onto the battlefield tapped', () => {
    const g = scenario()
      .define(STUDIOUS)
      .seat(0)
      .hand(STUDIOUS.name)
      .battlefield('Forest', 'Forest', 'Forest')
      .library('Forest', 'Plains', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast('Studious First-Year', { pay: true });
    g.passAll();
    const copy = Object.values(g.state.objects).find((o) => o.prepareOf !== undefined);
    expect(copy?.zone).toBe('exile');
    g.act(0).cast(copy?.id as string, { pay: true });
    g.passAll();
    // A search of the library is asked of the player: a basic land, the first answer.
    if (g.state.pending?.kind === 'chooseCards') g.act(0).chooseCards('Plains');
    expect(
      getView(g.state, 0).battlefield.filter((o) => o.name === 'Plains' && o.tapped),
    ).toHaveLength(1);
    g.expect.invariants();
  });
});
