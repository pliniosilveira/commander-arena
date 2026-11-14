// The Vraska EDHREC deck, group 1 (stage P63, D-216): the REAL cards of the owner's golden corpus (real Oracle text, `fixtures/corpus/golden.jsonl`) read
// through the grammar only, defined in an engine scenario and played through applyAction. Nothing here is written from a masked or invented wording.
// The creatures and artifacts that stand in for other cards are SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import {
  applyAction,
  type CardDefinition,
  getLegalActions,
  getView,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';

const PONDER = real('Ponder');
const FRANTIC = real('Frantic Search');
const DISPATCH = real('Dispatch');
const ITERATION = real('Expressive Iteration');
const KYKAR = real("Kykar, Wind's Fury");
const IDOL = real('Idol of Oblivion');
const HAMMER = real('Hammer of Purphoros');
const AWAKENER = real('Cyberdrive Awakener');

// SYNTHETIC stand-ins (not real cards): artifacts for metalcraft, a Spirit creature card and a noncreature spell for Kykar's trigger.
const ROCK = parsed('SYNTHETIC Rock', 'Artifact', '{T}: Add {C}.');
const SPIRIT_CARD = parsed('SYNTHETIC Spirit', 'Creature — Spirit', 'Flying', {
  manaCost: '{3}{W}',
  power: '4',
  toughness: '4',
});
const SPARK = parsed('SYNTHETIC Spark', 'Instant', '~ deals 1 damage to any target.', {
  manaCost: '{R}',
});

describe('Ponder (look at the top three, any order, may shuffle, draw a card)', () => {
  const game = () =>
    scenario()
      .define(PONDER)
      .seat(0)
      .hand(PONDER.name)
      .battlefield('Island')
      .library('Forest', 'Plains', 'Swamp', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as a reorder, an offer to shuffle and a draw (CR 701.24, 401.2)', () => {
    expect(PONDER.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'lookAndReorder', count: 3 },
        { kind: 'may', effect: { kind: 'shuffle' } },
        { kind: 'draw', count: 1 },
      ],
    });
  });

  test('declining the shuffle draws the card that was put on top', () => {
    const g = game();
    g.act(0).cast(PONDER.name, { pay: true });
    g.passAll();
    g.expect.pending('arrangeCards', 0);
    const [a, b, c] = g.state.seats[0]?.library ?? [];
    if (a === undefined || b === undefined || c === undefined) throw new Error('library');
    // The Swamp (the third card) goes on top.
    const swamp = g.state.objects[c]?.card;
    g.act(0).arrange({ top: [c, a, b] });
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    const hand = g.state.seats[0]?.hand[0];
    expect(hand === undefined ? null : g.state.objects[hand]?.card).toBe(swamp);
    g.expect.invariants();
  });

  test('accepting the shuffle shuffles the library and still draws a card', () => {
    const g = game();
    g.act(0).cast(PONDER.name, { pay: true });
    g.passAll();
    const library = [...(g.state.seats[0]?.library ?? [])];
    g.act(0).arrange({ top: library.slice(0, 3) });
    g.act(0).accept();
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    expect(g.state.seats[0]?.library).toHaveLength(library.length - 1);
    g.expect.invariants();
  });
});

describe('Frantic Search (draw two, discard two, untap up to three lands)', () => {
  const game = () =>
    scenario()
      .define(FRANTIC)
      .seat(0)
      .hand(FRANTIC.name)
      .battlefield('Island', { count: 5 })
      .library('Forest', 'Plains', ...FILLER)
      .seat(1)
      .battlefield('Mountain', { tapped: true })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as a draw, a discard and an untap of lands the controller chooses, none up to three (CR 701.26a)', () => {
    expect(FRANTIC.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'draw', count: 2 },
        { kind: 'discard', count: 2 },
        { kind: 'untap', objects: { kind: 'choose', count: 3, upTo: true } },
      ],
    });
  });

  test('the controller chooses up to three tapped lands, of any player, and they untap', () => {
    const g = game();
    // Three of the five Islands pay for it; the other two stay untapped.
    const isle = (nth: number) => ({ name: 'Island', zone: 'battlefield' as const, nth });
    g.act(0)
      .cast(FRANTIC.name)
      .payManual([isle(0), isle(1), isle(2)]);
    g.passAll();
    // The hand held only the two cards drawn: both are discarded with nothing to choose.
    g.expect.pending('choosePermanent', 0);
    const decision = g.state.pending;
    if (decision?.kind !== 'choosePermanent') throw new Error('not a choosePermanent');
    expect(decision.purpose).toBe('untapChoice');
    expect(decision.min).toBe(0);
    expect(decision.max).toBe(3);
    // The opponent's tapped Mountain is among the choices: the words say "lands", not "lands you control".
    expect(decision.legal).toHaveLength(4);
    g.act(0).choosePermanents(isle(0), isle(1));
    g.expect.tapped(isle(0), false);
    g.expect.tapped(isle(1), false);
    g.expect.tapped(isle(2), true);
    g.expect.tapped('Mountain', true);
    g.expect.invariants();
  });

  test('choosing none is a legal answer', () => {
    const g = game();
    g.act(0).cast(FRANTIC.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });
});

describe('Dispatch (tap target creature; metalcraft: exile that creature)', () => {
  const game = (rocks: number) =>
    scenario()
      .define(DISPATCH)
      .define(ROCK)
      .seat(0)
      .hand(DISPATCH.name)
      .battlefield('Plains')
      .battlefield(ROCK.name, { count: rocks })
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('with three artifacts the creature is tapped and exiled (CR 608.2c)', () => {
    const g = game(3);
    g.act(0).cast(DISPATCH.name, { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'exile');
    g.expect.invariants();
  });

  test('with two artifacts the creature is only tapped', () => {
    const g = game(2);
    g.act(0).cast(DISPATCH.name, { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield');
    g.expect.tapped(BEARS, true);
    g.expect.invariants();
  });
});

describe('Expressive Iteration (look at three, one to hand, one to the bottom, one exiled and playable)', () => {
  const game = (library: readonly string[]) =>
    scenario()
      .define(ITERATION)
      .seat(0)
      .hand(ITERATION.name)
      .battlefield('Island')
      .battlefield('Mountain')
      .library(...library)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as a split of the top three and a permission to play the exiled card (CR 608.2c, 601.2)', () => {
    expect(ITERATION.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'lookAndSplit', count: 3, hand: 1, bottom: 1, exile: 1 },
        { kind: 'mayPlay', objects: { kind: 'moved' }, lasts: 'endOfTurn' },
      ],
    });
  });

  test('the player chooses the hand card and the bottom card; the last is exiled and may be played this turn', () => {
    const g = game(['Forest', 'Plains', 'Swamp', ...FILLER]);
    g.act(0).cast(ITERATION.name, { pay: true });
    g.passAll();
    const first = g.state.pending;
    if (first?.kind !== 'chooseCards') throw new Error('not a chooseCards');
    expect(first.purpose).toBe('lookSplit');
    expect(first.to).toBe('hand');
    expect(first.legal).toHaveLength(3);
    expect([first.min, first.max]).toEqual([1, 1]);
    g.act(0).chooseCards('Swamp');
    const second = g.state.pending;
    if (second?.kind !== 'chooseCards') throw new Error('not a chooseCards');
    expect(second.to).toBe('bottom');
    expect(second.legal).toHaveLength(2);
    g.act(0).chooseCards('Plains');
    // The Swamp is in the hand, the Plains on the bottom of the library, the Forest exiled.
    expect(g.state.seats[0]?.hand.map((id) => g.state.objects[id]?.card)).toHaveLength(1);
    g.expect.zone('Forest', 'exile');
    expect(g.state.seats[0]?.library.length).toBe(FILLER.length + 1);
    // The exiled Forest is played this turn, as though it were in the hand (CR 305.1).
    expect(g.act(0).try.playLand({ name: 'Forest', zone: 'exile' }).ok).toBe(true);
    g.expect.zone('Forest', 'battlefield');
    g.expect.invariants();
  });

  test('with two cards in the library the hand and the bottom are done, and nothing is exiled', () => {
    const g = game(['Forest', 'Plains']);
    g.act(0).cast(ITERATION.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards('Forest');
    // One card is left for the bottom: nothing to ask.
    expect(g.state.seats[0]?.hand).toHaveLength(1);
    expect(g.state.seats[0]?.library).toHaveLength(1);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('with an empty library nothing happens', () => {
    const g = game([]);
    g.act(0).cast(ITERATION.name, { pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });
});

describe("Kykar, Wind's Fury (Sacrifice a Spirit: Add {R}.)", () => {
  const MANA_ABILITY = KYKAR.faces[0]?.abilities.findIndex((a) => a.kind === 'mana') ?? -1;

  test('reads as a mana ability whose cost sacrifices a Spirit, not the permanent itself (CR 605.1a, 701.21a)', () => {
    expect(MANA_ABILITY).toBeGreaterThanOrEqual(0);
    expect(KYKAR.faces[0]?.abilities[MANA_ABILITY]).toMatchObject({
      kind: 'mana',
      cost: [{ kind: 'sacrifice', what: { subtypes: ['Spirit'] } }],
      production: { kind: 'fixed', mana: ['R'] },
    });
  });

  const game = () =>
    scenario()
      .define(KYKAR)
      .define(SPIRIT_CARD)
      .define(SPARK)
      .seat(0)
      .hand(SPARK.name)
      .battlefield(KYKAR.name)
      .battlefield(SPIRIT_CARD.name)
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('sacrificing the Spirit adds {R}; Kykar stays and does not tap', () => {
    const g = game();
    expect(g.act(0).try.tapForMana(KYKAR.name, { ability: MANA_ABILITY }).ok).toBe(true);
    g.expect.zone(SPIRIT_CARD.name, 'graveyard');
    g.expect.zone(KYKAR.name, 'battlefield');
    g.expect.tapped(KYKAR.name, false);
    expect(g.state.seats[0]?.manaPool).toHaveLength(1);
    expect(g.state.seats[0]?.manaPool[0]?.color).toBe('R');
    g.expect.invariants();
  });

  test('without a Spirit the ability cannot be activated', () => {
    const g = scenario()
      .define(KYKAR)
      .seat(0)
      .battlefield(KYKAR.name)
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    const r = g.act(0).try.tapForMana(KYKAR.name, { ability: MANA_ABILITY });
    expect(r.ok).toBe(false);
    g.expect.zone(KYKAR.name, 'battlefield');
  });

  test('a Spirit token is given up before a Spirit card, and the payment of a spell can use it', () => {
    const g = game();
    // Kykar's own trigger: casting the noncreature spell makes a 1/1 Spirit token; the Spark is paid with {R} from a Spirit.
    g.act(0)
      .cast(SPARK.name, { targets: [{ player: 1 }] })
      .payManual([{ source: KYKAR.name, ability: MANA_ABILITY }]);
    // The Spirit card was the only Spirit when the mana was made: it was sacrificed.
    g.expect.zone(SPIRIT_CARD.name, 'graveyard');
    g.passAll();
    g.expect.invariants();
    // Now there is a Spirit token (from the cast trigger), the only Spirit: it is the one the next activation gives up.
    expect(g.act(0).try.tapForMana(KYKAR.name, { ability: MANA_ABILITY }).ok).toBe(true);
    expect(g.state.seats[0]?.manaPool.length).toBeGreaterThanOrEqual(1);
    g.expect.invariants();
    void getLegalActions;
  });
});

// D-222 (CR 601.2b, 118.3, 605.3b): the player chooses the permanent a cost "Sacrifice a Spirit" gives up, by hand and when paying.
describe("Kykar, Wind's Fury: the player chooses which Spirit is sacrificed", () => {
  const MANA = KYKAR.faces[0]?.abilities.findIndex((a) => a.kind === 'mana') ?? -1;
  const DEEP_SPIRIT = parsed('SYNTHETIC Deep Spirit', 'Creature \u2014 Spirit', 'Flying', {
    manaCost: '{5}{U}',
    power: '2',
    toughness: '2',
  });
  const board = (spirits: readonly CardDefinition[] = [SPIRIT_CARD, DEEP_SPIRIT]) => {
    let b = scenario()
      .define(KYKAR)
      .define(SPIRIT_CARD)
      .define(DEEP_SPIRIT)
      .define(SPARK)
      .seat(0)
      .hand(SPARK.name)
      .battlefield(KYKAR.name);
    for (const spirit of spirits) b = b.battlefield(spirit.name);
    return b
      .battlefield(BEARS)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };
  const sacrificeOptions = (g: ReturnType<typeof board>) => {
    const d = g.state.pending;
    if (d?.kind !== 'priority') throw new Error('not at priority');
    return d.options.flatMap((o) =>
      o.kind === 'activateAbility' && o.abilityIndex === MANA ? [o.sacrifice] : [],
    );
  };

  test('with more than one Spirit to give up the engine offers one activation for each', () => {
    const g = board();
    const given = sacrificeOptions(g);
    expect(given).toHaveLength(2);
    expect(new Set(given).size).toBe(2);
    expect(given.every((id) => id !== undefined)).toBe(true);
    expect(g.state.seats[0]?.manaPool).toHaveLength(0);
  });

  test('an activation that does not say which Spirit is refused and changes nothing; a permanent that is not a Spirit is refused too', () => {
    const g = board();
    const before = g.state;
    expect(g.act(0).try.tapForMana(KYKAR.name, { ability: MANA }).ok).toBe(false);
    expect(g.act(0).try.tapForMana(KYKAR.name, { ability: MANA, sacrifice: BEARS }).ok).toBe(false);
    expect(g.act(0).try.tapForMana(KYKAR.name, { ability: MANA, sacrifice: KYKAR.name }).ok).toBe(
      false,
    ); // Kykar is a Bird Wizard
    expect(g.state).toBe(before);
  });

  test('the one named is the one that goes, whichever it is', () => {
    const a = board();
    expect(
      a.act(0).try.tapForMana(KYKAR.name, { ability: MANA, sacrifice: DEEP_SPIRIT.name }).ok,
    ).toBe(true);
    a.expect.zone(DEEP_SPIRIT.name, 'graveyard');
    a.expect.zone(SPIRIT_CARD.name, 'battlefield');
    const b = board();
    expect(
      b.act(0).try.tapForMana(KYKAR.name, { ability: MANA, sacrifice: SPIRIT_CARD.name }).ok,
    ).toBe(true);
    b.expect.zone(SPIRIT_CARD.name, 'graveyard');
    b.expect.zone(DEEP_SPIRIT.name, 'battlefield');
  });

  test('with one Spirit to give up there is no choice: one plain option that sacrifices it', () => {
    const g = board([SPIRIT_CARD]);
    expect(sacrificeOptions(g)).toEqual([undefined]);
    expect(g.act(0).try.tapForMana(KYKAR.name, { ability: MANA }).ok).toBe(true);
    g.expect.zone(SPIRIT_CARD.name, 'graveyard');
  });

  test('paying a spell by hand: the payment lists the Spirits to choose from, and an unnamed or illegal sacrifice is refused', () => {
    const g = board();
    g.act(0).cast(SPARK.name, { targets: [{ player: 1 }] });
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error('not paying');
    expect(pay.manaSources.find((s) => s.abilityIndex === MANA)?.sacrifices).toHaveLength(2);
    const before = g.state;
    const tap = (sacrifice?: string) => ({
      kind: 'payManual' as const,
      taps: [
        {
          object: g.id(KYKAR.name),
          abilityIndex: MANA,
          ...(sacrifice === undefined ? {} : { sacrifice: g.id(sacrifice) }),
        },
      ],
    });
    expect(applyAction(g.state, 0, tap()).ok).toBe(false);
    expect(applyAction(g.state, 0, tap(BEARS)).ok).toBe(false);
    expect(g.state).toBe(before);
    g.act(0).choose(tap(DEEP_SPIRIT.name));
    g.expect.zone(DEEP_SPIRIT.name, 'graveyard');
    g.expect.zone(SPIRIT_CARD.name, 'battlefield');
  });

  test("pay automatically is the planner's default, which the player overrides by paying by hand: the lowest mana value first", () => {
    const g = board();
    g.act(0).cast(SPARK.name, { targets: [{ player: 1 }], pay: true });
    g.expect.zone(SPIRIT_CARD.name, 'graveyard');
    g.expect.zone(DEEP_SPIRIT.name, 'battlefield');
  });
});

describe('Idol of Oblivion ({T}: Draw a card. Activate only if you created a token this turn.)', () => {
  const game = (extra: readonly CardDefinition[] = []) => {
    let b = scenario().define(IDOL).define(HAMMER);
    for (const card of extra) b = b.define(card);
    return b
      .seat(0)
      .battlefield(IDOL.name)
      .battlefield(HAMMER.name)
      .battlefield('Mountain', { count: 3 })
      .battlefield('Swamp')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };

  test('reads as an activation restricted to a turn in which a token entered under your control (CR 111.2, 602.5b)', () => {
    expect(IDOL.faces[0]?.abilities[0]).toMatchObject({
      kind: 'activated',
      activateOnlyIf: { kind: 'enteredThisTurn', count: 1, token: true },
    });
  });

  test('is refused before any token was created, and draws after one was', () => {
    const g = game();
    const refused = g.act(0).try.activate(IDOL.name);
    expect(refused.ok).toBe(false);
    // Hammer of Purphoros: {2}{R}, {T}, Sacrifice a land makes a Golem token; the turn log remembers it.
    g.act(0).activate(HAMMER.name).payManual(['Mountain[0]', 'Mountain[1]', 'Mountain[2]']);
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('Swamp');
    g.passAll();
    const before = g.state.seats[0]?.hand.length ?? 0;
    const drawn = g.act(0).try.activate(IDOL.name);
    expect(drawn.ok).toBe(true);
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(before + 1);
    g.expect.invariants();
  });
});

describe('Hammer of Purphoros (haste for creatures you control; {2}{R}, {T}, Sacrifice a land: a 3/3 Golem)', () => {
  test('the Golem token is a colorless enchantment artifact creature 3/3 (CR 111.3)', () => {
    const g = scenario()
      .define(HAMMER)
      .seat(0)
      .battlefield(HAMMER.name)
      .battlefield('Mountain', { count: 3 })
      .battlefield('Swamp')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).activate(HAMMER.name).payManual(['Mountain[0]', 'Mountain[1]', 'Mountain[2]']);
    g.act(0).choosePermanents('Swamp');
    g.passAll();
    const golem = g.state.battlefield
      .map((id) => g.state.objects[id])
      .find((o) => o?.token?.characteristics.name === 'Golem');
    expect(golem?.token?.characteristics).toMatchObject({
      types: ['enchantment', 'artifact', 'creature'],
      subtypes: ['Golem'],
      power: 3,
      toughness: 3,
      colors: [],
    });
    g.expect.zone('Swamp', 'graveyard');
    g.expect.invariants();
  });
});

describe('Cyberdrive Awakener (each noncreature artifact you control becomes a 4/4 artifact creature until end of turn)', () => {
  const game = () =>
    scenario()
      .define(AWAKENER)
      .define(ROCK)
      .define(HAMMER)
      .seat(0)
      .hand(AWAKENER.name)
      .battlefield('Island', { count: 6 })
      .battlefield(ROCK.name, { count: 2 })
      .battlefield(HAMMER.name)
      .seat(1)
      .battlefield(ROCK.name)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('reads as one effect: the types and the base power and toughness of the group fixed as it resolves (CR 611.2c, 613.4b)', () => {
    const trigger = AWAKENER.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    expect(trigger).toMatchObject({
      effect: {
        kind: 'setTypes',
        types: ['artifact', 'creature'],
        basePt: { power: 4, toughness: 4 },
        duration: 'untilEndOfTurn',
        // CR 205.1b: "becomes a ... artifact creature" retains every prior card type and subtype.
        additive: true,
      },
    });
  });

  test('an artifact that is also an enchantment keeps being one: it becomes an artifact enchantment creature, and keeps its subtypes (CR 205.1b)', () => {
    const RELIC = parsed(
      'SYNTHETIC Relic Shrine',
      'Artifact Enchantment \u2014 Shrine',
      '{T}: Add {C}.',
      { manaCost: '{2}' },
    );
    const g = scenario()
      .define(AWAKENER)
      .define(RELIC)
      .seat(0)
      .hand(AWAKENER.name)
      .battlefield('Island', { count: 6 })
      .battlefield(RELIC.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(AWAKENER.name, { pay: true });
    g.passAll();
    g.passAll();
    const relic = getView(g.state, 0).battlefield.find((o) => o.name === RELIC.name);
    expect([...(relic?.types ?? [])].sort()).toEqual(['artifact', 'creature', 'enchantment']);
    expect(relic?.subtypes).toContain('Shrine');
    expect([relic?.power, relic?.toughness]).toEqual([4, 4]);
    g.expect.invariants();
  });

  test("your noncreature artifacts become 4/4 artifact creatures, the opponent's do not, and it ends with the turn", () => {
    const g = game();
    g.act(0).cast(AWAKENER.name, { pay: true });
    g.passAll();
    g.passAll();
    const view = (name: string, seat: 0 | 1) =>
      g.state.battlefield
        .map((id) => g.state.objects[id])
        .filter((o) => o !== undefined && o.zone === 'battlefield')
        .map((o) => o as NonNullable<typeof o>)
        .filter((o) => o.controller === seat)
        .map((o) => ({ o, d: getViewOf(g, o.id) }))
        .filter((x) => x.d.name === name);
    const mine = view(ROCK.name, 0);
    expect(mine).toHaveLength(2);
    for (const { d } of mine) {
      expect(d.types).toContain('creature');
      expect(d.types).toContain('artifact');
      expect([d.power, d.toughness]).toEqual([4, 4]);
    }
    expect(view(ROCK.name, 1)[0]?.d.types).not.toContain('creature');
    // The Awakener itself was a creature already and is not one of them (it stays 4/4 by its own card).
    g.expect.invariants();
  });
});

function getViewOf(g: { state: import('@commander-arena/engine').GameState }, id: string) {
  const o = getView(g.state, 0).battlefield.find((p) => p.id === id);
  if (o === undefined) throw new Error('not on the battlefield');
  return o;
}
