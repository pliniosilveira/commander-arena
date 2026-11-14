// Parsed text is only worth something if the engine runs it as written (stage P21). These tests import
// SYNTHETIC cards through the grammar (never through a fixture), define them in an engine scenario and play
// them through applyAction: the keywords of batch 2 (D-116, D-120), regeneration and "It can't be
// regenerated", "blocks" and "becomes blocked", "attacks alone", "You may pay [cost]. If you do, ..." and
// "equal to the life lost this way". Every card name starts with "SYNTHETIC"; the Oracle text is the real line
// of a shape in reports/template-replay.md where the replay has one and SYNTHETIC otherwise. No real card's
// text is claimed; the real cards used as the rest of the board (Grizzly Bears, Serra Angel, Llanowar Elves,
// Sol Ring, Lightning Bolt, the basic lands) are the engine's own fixtures.
import { type CardDefinition, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import type { StoredFace } from '../src/index';
import { parsed } from './convert-grammar-helpers';

const creature = (
  name: string,
  text: string,
  power: string,
  toughness: string,
  manaCost: string,
  colors: StoredFace['colors'],
) => parsed(name, 'Creature — Test', text, { manaCost, power, toughness, colors });
const sorcery = (name: string, text: string, manaCost: string, colors: StoredFace['colors']) =>
  parsed(name, 'Sorcery', text, { manaCost, colors });
const instant = (name: string, text: string, manaCost: string, colors: StoredFace['colors']) =>
  parsed(name, 'Instant', text, { manaCost, colors });
const artifactCreature = (name: string, text: string, manaCost: string) =>
  parsed(name, 'Artifact Creature — Construct', text, {
    manaCost,
    power: '2',
    toughness: '2',
    colors: [],
  });

const BEARS = 'Grizzly Bears'; // 2/2 {1}{G}
const ELVES = 'Llanowar Elves'; // 1/1
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance
const WALL = 'Wall of Stone'; // 0/8
const BOLT = 'Lightning Bolt';
const SOL = 'Sol Ring'; // an artifact, {T}: Add {C}{C}
const LIBRARY = ['Island', 'Island', 'Island'] as const;

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

function attackWith(g: ScenarioGame, ...attackers: string[]): ScenarioGame {
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack(attackers);
  return g;
}

describe('"Skulk" and "gains skulk until end of turn" (replay: 15 cards; CR 702.118b)', () => {
  const SKULKER = creature('SYNTHETIC Parsed Skulker', 'Skulk', '2', '2', '{1}{B}', ['B']);
  const MIST = instant(
    'SYNTHETIC Parsed Shadow Mist',
    'Target creature gains skulk until end of turn.',
    '{B}',
    ['B'],
  );

  test('the lowering is the engine keyword', () => {
    expect(SKULKER.faces[0]?.abilities).toEqual([{ kind: 'keyword', keyword: { kind: 'skulk' } }]);
  });

  test('a blocker with greater power can not block it, one with equal or less power can', () => {
    const g = scenario()
      .define(SKULKER)
      .seat(0)
      .battlefield(SKULKER.name)
      .seat(1)
      .battlefield(BEARS, ANGEL, WALL, ELVES)
      .build();
    attackWith(g, SKULKER.name);
    g.advanceTo('declareBlockers', { block: false });
    g.expect.canBlock(BEARS, SKULKER.name, true);
    g.expect.canBlock(WALL, SKULKER.name, true);
    g.expect.canBlock(ELVES, SKULKER.name, true);
    g.expect.canBlock(ANGEL, SKULKER.name, false);
    g.expect.invariants();
  });

  test('granted until end of turn: the Bears are blocked by nothing with more than 2 power', () => {
    const g = scenario()
      .define(MIST)
      .seat(0)
      .hand(MIST.name)
      .battlefield(BEARS, 'Swamp')
      .seat(1)
      .battlefield(ANGEL, WALL)
      .build();
    g.act(0).cast(MIST.name, { targets: [BEARS], pay: true });
    resolveTop(g);
    attackWith(g, BEARS);
    g.advanceTo('declareBlockers', { block: false });
    g.expect.canBlock(ANGEL, BEARS, false);
    g.expect.canBlock(WALL, BEARS, true);
  });
});

describe('"Battle cry" (replay: 13 cards; CR 702.91a)', () => {
  const CHIEF = creature('SYNTHETIC Parsed Chief', 'Battle cry', '2', '1', '{1}{R}', ['R']);

  test('each other attacking creature gets +1/+0 until end of turn, the chief itself does not', () => {
    const g = scenario()
      .define(CHIEF)
      .seat(0)
      .battlefield(CHIEF.name, BEARS, ELVES)
      .seat(1)
      .build();
    attackWith(g, CHIEF.name, BEARS);
    resolveTop(g);
    g.expect.pt(BEARS, 3, 2);
    g.expect.pt(CHIEF.name, 2, 1);
    g.expect.pt(ELVES, 1, 1);
    g.expect.invariants();
  });
});

describe('"Mentor" (replay: 19 cards; CR 702.134a)', () => {
  const MENTOR = creature('SYNTHETIC Parsed Mentor', 'Mentor', '3', '3', '{2}{R}', ['R']);

  test('a +1/+1 counter on the one attacking creature with less power', () => {
    const g = scenario()
      .define(MENTOR)
      .seat(0)
      .battlefield(MENTOR.name, ELVES, BEARS)
      .seat(1)
      .build();
    attackWith(g, MENTOR.name, ELVES);
    resolveTop(g);
    g.expect.pt(ELVES, 2, 2);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(MENTOR.name, 3, 3);
  });
});

describe('"Evolve" (replay: 22 cards; CR 702.100a)', () => {
  const WHELP = creature('SYNTHETIC Parsed Whelp', 'Evolve', '1', '1', '{G}', ['G']);

  test('a bigger creature entering under your control puts a +1/+1 counter on it, a smaller one does not', () => {
    const g = scenario()
      .define(WHELP)
      .seat(0)
      .battlefield(WHELP.name, 'Forest', 'Forest', 'Forest')
      .hand(BEARS, ELVES)
      .seat(1)
      .build();
    g.act(0).cast(ELVES, { pay: true });
    resolveTop(g);
    g.expect.stack([]);
    g.expect.pt(WHELP.name, 1, 1);
    g.act(0).cast(BEARS, { pay: true });
    resolveTop(g);
    g.expect.stack([`${WHELP.name} (ability)`]);
    resolveTop(g);
    g.expect.pt(WHELP.name, 2, 2);
  });
});

describe('"Bushido 2" (replay: 35 cards; CR 702.45a)', () => {
  const DUELIST = creature('SYNTHETIC Parsed Duelist', 'Bushido 2', '2', '2', '{1}{W}', ['W']);

  test('it blocks: +2/+2 until end of turn', () => {
    const g = scenario()
      .define(DUELIST)
      .seat(0)
      .battlefield(BEARS)
      .seat(1)
      .battlefield(DUELIST.name)
      .build();
    attackWith(g, BEARS);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: DUELIST.name, attacker: BEARS }]);
    resolveTop(g);
    g.expect.pt(DUELIST.name, 4, 4);
  });

  test('it becomes blocked once, however many creatures block it', () => {
    const g = scenario()
      .define(DUELIST)
      .seat(0)
      .battlefield(DUELIST.name)
      .seat(1)
      .battlefield(BEARS, ELVES)
      .build();
    attackWith(g, DUELIST.name);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([
      { blocker: BEARS, attacker: DUELIST.name },
      { blocker: ELVES, attacker: DUELIST.name },
    ]);
    resolveTop(g);
    g.expect.pt(DUELIST.name, 4, 4);
    g.expect.stack([]);
  });
});

describe('"Extort" (replay: 17 cards; CR 702.101a) and its spelled-out text', () => {
  const PRIEST = creature('SYNTHETIC Parsed Extort Priest', 'Extort', '1', '1', '{W}', ['W']);
  const SPELLED = creature(
    'SYNTHETIC Parsed Spelled Priest',
    'Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain life equal to the total life lost this way.',
    '1',
    '1',
    '{W}',
    ['W'],
  );

  test.each([PRIEST, SPELLED])('$name: cast a spell, pay, drain 1', (def) => {
    const g = scenario()
      .define(def)
      .seat(0)
      .life(20)
      .battlefield(def.name, 'Mountain', 'Plains')
      .hand(BOLT)
      .library(...LIBRARY)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional', purpose: 'mayPay' });
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.life(1, 19);
    g.expect.life(0, 21);
    resolveTop(g);
    g.expect.life(1, 16);
  });

  test('declining does nothing', () => {
    const g = scenario()
      .define(SPELLED)
      .seat(0)
      .life(20)
      .battlefield(SPELLED.name, 'Mountain', 'Plains')
      .hand(BOLT)
      .library(...LIBRARY)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    g.act(0).decline();
    g.expect.life(1, 20);
    g.expect.life(0, 20);
  });
});

describe('"Affinity for artifacts" (replay: 37 cards; CR 702.41a) and the other things it counts', () => {
  const GOLEM = artifactCreature('SYNTHETIC Parsed Golem', 'Affinity for artifacts', '{5}');
  const KNIGHT = creature(
    'SYNTHETIC Parsed Plains Knight',
    'Affinity for Plains',
    '2',
    '2',
    '{4}{W}',
    ['W'],
  );

  test('each artifact you control takes {1} off the generic cost', () => {
    const g = scenario()
      .define(GOLEM)
      .seat(0)
      .hand(GOLEM.name)
      .battlefield(SOL, SOL, 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .battlefield(SOL)
      .build();
    g.act(0).cast(GOLEM.name);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    // Two artifacts of mine reduce {5} to {3}; the opponent's Sol Ring does not count.
    expect(d.totalCost).toEqual(['3']);
  });

  test('"for Plains" counts the Plains, and colored mana is not reduced', () => {
    const g = scenario()
      .define(KNIGHT)
      .seat(0)
      .hand(KNIGHT.name)
      .battlefield('Plains', 'Plains', 'Mountain', 'Mountain')
      .seat(1)
      .build();
    g.act(0).cast(KNIGHT.name);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    expect(d.totalCost).toEqual(['2', 'W']);
  });

  test('the legal actions offer the spell exactly when the reduced cost can be paid', () => {
    const castable = (artifacts: number, lands: number) => {
      const g = scenario()
        .define(GOLEM)
        .seat(0)
        .hand(GOLEM.name)
        .battlefield(
          ...Array.from({ length: artifacts }, () => 'Wall of Stone'),
          ...Array.from({ length: lands }, () => 'Mountain'),
        )
        .seat(1)
        .build();
      return getLegalActions(g.state, 0).some((a) => a.kind === 'castSpell');
    };
    // Wall of Stone is not an artifact: five lands pay {5}, four do not.
    expect(castable(0, 5)).toBe(true);
    expect(castable(2, 4)).toBe(false);
  });
});

describe('"Convoke", "Improvise" and "Delve" (replay: 102, 23 and 27 cards; CR 702.51a, 702.126a, 702.66a)', () => {
  const WURM = creature('SYNTHETIC Parsed Convoke Wurm', 'Convoke', '5', '5', '{4}{G}{G}', ['G']);
  const CONSTRUCT = artifactCreature('SYNTHETIC Parsed Improviser', 'Improvise', '{4}');
  const SPIRIT = creature('SYNTHETIC Parsed Delver', 'Delve', '3', '3', '{4}{B}', ['B']);

  function payOptions(g: ScenarioGame) {
    const d = g.state.pending;
    if (d?.kind !== 'choosePayOptions')
      throw new Error(`expected choosePayOptions, got ${d?.kind}`);
    return d;
  }

  test('convoke: tapping creatures pays the cost, the engine says which mana each paid', () => {
    const g = scenario()
      .define(WURM)
      .seat(0)
      .hand(WURM.name)
      .battlefield(BEARS, ELVES, ANGEL, WALL, 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(WURM.name);
    const d = payOptions(g);
    expect(d.mechanism).toBe('convoke');
    expect(d.cost).toEqual(['4', 'G', 'G']);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    // Bears and Elves paid the green mana, the Angel and the Wall two of the generic; the Forest the other two.
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['2']);
    g.expect.tapped(BEARS, true);
    g.expect.tapped(ANGEL, true);
  });

  test('improvise: artifacts pay generic mana only', () => {
    const g = scenario()
      .define(CONSTRUCT)
      .seat(0)
      .hand(CONSTRUCT.name)
      .battlefield(SOL, 'Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .build();
    g.act(0).cast(CONSTRUCT.name);
    const d = payOptions(g);
    expect(d.mechanism).toBe('improvise');
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    // The Sol Ring paid one of the {4}; the two Mountains pay the rest.
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['3']);
    g.expect.tapped(SOL, true);
  });

  test('delve: cards of your graveyard are exiled for generic mana', () => {
    const g = scenario()
      .define(SPIRIT)
      .seat(0)
      .hand(SPIRIT.name)
      .graveyard(BEARS, ELVES, BOLT)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .graveyard(ANGEL)
      .build();
    g.act(0).cast(SPIRIT.name);
    const d = payOptions(g);
    expect(d.mechanism).toBe('delve');
    expect(d.candidates).toHaveLength(3);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    for (const card of [BEARS, ELVES, BOLT]) g.expect.zone(card, 'exile', { seat: 0 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
  });
});

describe('"Cascade" (replay: 34 cards; CR 702.85a)', () => {
  const GIANT = creature('SYNTHETIC Parsed Cascader', 'Cascade', '4', '4', '{2}{R}{R}', ['R']);

  test('casting it exiles to the first cheaper nonland card and offers it for free', () => {
    const g = scenario()
      .define(GIANT)
      .seat(0)
      .hand(GIANT.name)
      .battlefield('Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library('Island', BEARS, ELVES)
      .seat(1)
      .seed(1)
      .build();
    g.act(0).cast(GIANT.name, { pay: true });
    g.expect.stack([`${GIANT.name} (ability)`, GIANT.name]);
    resolveTop(g);
    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional', purpose: 'cascade' });
    g.act(0).accept();
    g.expect.stack([BEARS, GIANT.name]);
  });
});

describe('"{1}{B}: Regenerate ~." (replay: 118 cards; CR 701.19a)', () => {
  const TROLL = creature('SYNTHETIC Parsed Troll', '{1}{B}: Regenerate ~.', '2', '2', '{2}{B}', [
    'B',
  ]);

  function board(swamps = 2) {
    return scenario()
      .define(TROLL)
      .seat(0)
      .battlefield(TROLL.name, ...Array.from({ length: swamps }, () => 'Swamp'))
      .library(...LIBRARY)
      .seat(1)
      .battlefield('Mountain', 'Mountain')
      .hand(BOLT, BOLT)
      .library(...LIBRARY)
      .build();
  }

  test('lethal damage: it stays, tapped and healed, and the shield is used up', () => {
    const g = board();
    g.act(0).activate(TROLL.name, { pay: true });
    resolveTop(g);
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: [TROLL.name], pay: true });
    resolveTop(g);
    g.expect.zone(TROLL.name, 'battlefield', { seat: 0 });
    g.expect.damage(TROLL.name, 0);
    g.expect.tapped(TROLL.name, true);
    g.expect.noEvent({ kind: 'died' });
    g.expect.invariants();
  });

  test('without the ability, the same Bolt kills it', () => {
    const g = board();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: [TROLL.name], pay: true });
    resolveTop(g);
    g.expect.zone(TROLL.name, 'graveyard', { seat: 0 });
  });
});

describe('"Regenerate target creature." and "Regenerate each creature you control."', () => {
  const CHARM = instant('SYNTHETIC Parsed Regrowth Charm', 'Regenerate target creature.', '{G}', [
    'G',
  ]);
  const BANNER = instant(
    'SYNTHETIC Parsed Regrowth Banner',
    'Regenerate each creature you control.',
    '{G}',
    ['G'],
  );
  const WRATH = sorcery('SYNTHETIC Parsed Wrath', 'Destroy all creatures.', '{2}{W}{W}', ['W']);

  test('a shield spell saves the creature from a Wrath, once', () => {
    const g = scenario()
      .define(CHARM)
      .define(WRATH)
      .seat(0)
      .hand(CHARM.name, WRATH.name)
      .battlefield(BEARS, 'Forest', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield(ELVES)
      .build();
    g.act(0).cast(CHARM.name, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.act(0).cast(WRATH.name, { pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, true);
    g.expect.zone(ELVES, 'graveyard', { seat: 1 });
  });

  test("a shield for each creature you control, and none for the opponent's", () => {
    const g = scenario()
      .define(BANNER)
      .define(WRATH)
      .seat(0)
      .hand(BANNER.name, WRATH.name)
      .battlefield(BEARS, ELVES, 'Forest', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .battlefield(ANGEL)
      .build();
    g.act(0).cast(BANNER.name, { pay: true });
    resolveTop(g);
    g.act(0).cast(WRATH.name, { pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
  });
});

describe('"Destroy ... It can\'t be regenerated." (replay: 2 and 4 cards; CR 701.19c)', () => {
  const SMITE = sorcery(
    'SYNTHETIC Parsed Final Smite',
    "Destroy target creature. It can't be regenerated.",
    '{1}{B}{B}',
    ['B'],
  );
  const PLAGUE = sorcery(
    'SYNTHETIC Parsed Final Plague',
    "Destroy all creatures. They can't be regenerated.",
    '{2}{B}{B}',
    ['B'],
  );
  const CHARM = instant('SYNTHETIC Parsed Regrowth Charm', 'Regenerate target creature.', '{G}', [
    'G',
  ]);
  const MURDER = sorcery('SYNTHETIC Parsed Plain Murder', 'Destroy target creature.', '{1}{B}{B}', [
    'B',
  ]);

  function shielded(card: CardDefinition, lands: readonly string[]) {
    const g = scenario()
      .define(card)
      .define(CHARM)
      .seat(0)
      .hand(card.name, CHARM.name)
      .battlefield(BEARS, ...lands, 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(CHARM.name, { targets: [BEARS], pay: true });
    resolveTop(g);
    return g;
  }

  test('a destroy without the sentence is replaced by the shield', () => {
    const g = shielded(MURDER, ['Swamp', 'Swamp', 'Swamp']);
    g.act(0).cast(MURDER.name, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('with the sentence the creature dies, shield or not', () => {
    const g = shielded(SMITE, ['Swamp', 'Swamp', 'Swamp']);
    g.act(0).cast(SMITE.name, { targets: [BEARS], pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('"Destroy all creatures. They can\'t be regenerated." kills the shielded creature too', () => {
    const g = shielded(PLAGUE, ['Swamp', 'Swamp', 'Swamp', 'Swamp']);
    g.act(0).cast(PLAGUE.name, { pay: true });
    resolveTop(g);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('"Whenever ~ blocks" and "becomes blocked" (SYNTHETIC; CR 509.3a, 509.3c)', () => {
  const BLOCKER = creature(
    'SYNTHETIC Parsed Guard',
    'Whenever ~ blocks, you gain 2 life.',
    '2',
    '2',
    '{1}{W}',
    ['W'],
  );
  const BRUTE = creature(
    'SYNTHETIC Parsed Brute',
    'Whenever ~ becomes blocked, you gain 3 life.',
    '2',
    '2',
    '{1}{R}',
    ['R'],
  );
  const EITHER = creature(
    'SYNTHETIC Parsed Duellist',
    'Whenever ~ blocks or becomes blocked, it gets +1/+1 until end of turn.',
    '2',
    '2',
    '{1}{W}',
    ['W'],
  );

  test('blocks: once for the creature that is declared as a blocker', () => {
    const g = scenario()
      .define(BLOCKER)
      .seat(0)
      .life(20)
      .battlefield(BEARS)
      .seat(1)
      .life(20)
      .battlefield(BLOCKER.name)
      .build();
    attackWith(g, BEARS);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: BLOCKER.name, attacker: BEARS }]);
    resolveTop(g);
    g.expect.life(1, 22);
  });

  test('becomes blocked: once, however many creatures block it', () => {
    const g = scenario()
      .define(BRUTE)
      .seat(0)
      .life(20)
      .battlefield(BRUTE.name)
      .seat(1)
      .battlefield(BEARS, ELVES)
      .build();
    attackWith(g, BRUTE.name);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([
      { blocker: BEARS, attacker: BRUTE.name },
      { blocker: ELVES, attacker: BRUTE.name },
    ]);
    resolveTop(g);
    g.expect.life(0, 23);
    g.expect.stack([]);
  });

  test('either event: +1/+1 for the one it is, and not for a creature that is neither', () => {
    const g = scenario()
      .define(EITHER)
      .seat(0)
      .battlefield(BEARS)
      .seat(1)
      .battlefield(EITHER.name)
      .build();
    attackWith(g, BEARS);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([{ blocker: EITHER.name, attacker: BEARS }]);
    resolveTop(g);
    g.expect.pt(EITHER.name, 3, 3);
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('"Whenever ~ attacks alone" (SYNTHETIC; CR 506.5)', () => {
  const LONER = creature(
    'SYNTHETIC Parsed Loner',
    'Whenever ~ attacks alone, it gets +2/+0 until end of turn.',
    '2',
    '2',
    '{1}{R}',
    ['R'],
  );

  test('it triggers when the only attacker, and not beside another', () => {
    const alone = scenario().define(LONER).seat(0).battlefield(LONER.name, BEARS).seat(1).build();
    attackWith(alone, LONER.name);
    resolveTop(alone);
    alone.expect.pt(LONER.name, 4, 2);
    const together = scenario()
      .define(LONER)
      .seat(0)
      .battlefield(LONER.name, BEARS)
      .seat(1)
      .build();
    attackWith(together, LONER.name, BEARS);
    together.expect.stack([]);
    together.expect.pt(LONER.name, 2, 2);
  });
});

describe('"You may pay [cost]. If you do, ..." (replay: 6 and 1 cards; CR 118.3, 608.2c)', () => {
  const VAULT = creature(
    'SYNTHETIC Parsed Vault',
    'At the beginning of your upkeep, you may pay {1}. If you do, you gain 2 life.',
    '1',
    '1',
    '{1}',
    [],
  );
  const BLOOD = creature(
    'SYNTHETIC Parsed Bloodpact',
    'At the beginning of your upkeep, you may pay 3 life. If you do, draw a card.',
    '1',
    '1',
    '{1}',
    [],
  );
  const UNTAPPER = creature(
    'SYNTHETIC Parsed Mana Vault',
    'At the beginning of your upkeep, you may pay {2}. If you do, untap ~.',
    '1',
    '1',
    '{1}',
    [],
  );

  function upkeep(def: CardDefinition, ...more: string[]) {
    const g = scenario()
      .define(def)
      .seat(0)
      .life(20)
      .battlefield(def.name, ...more)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('upkeep', { turn: 5 });
    return g;
  }

  test('the question is asked, accepting asks for the mana, and the effect follows', () => {
    const g = upkeep(VAULT, 'Mountain');
    g.expect.stack([`${VAULT.name} (ability)`]);
    g.pass();
    g.pass();
    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional', purpose: 'mayPay' });
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.life(0, 22);
  });

  test('declining does nothing, and with nothing to pay it the question is not asked', () => {
    const g = upkeep(VAULT, 'Mountain');
    g.pass();
    g.pass();
    g.act(0).decline();
    g.expect.life(0, 20);
    const broke = upkeep(VAULT);
    broke.pass();
    broke.pass();
    broke.expect.life(0, 20);
    expect(broke.state.pending?.kind).not.toBe('confirmOptional');
  });

  test('a payment of life, then the card', () => {
    const g = upkeep(BLOOD);
    g.pass();
    g.pass();
    g.act(0).accept();
    g.expect.life(0, 17);
    g.expect.zone('Island', 'hand', { seat: 0 });
  });

  test('"untap ~": the permanent the ability is on (replay: the shape of 6 cards)', () => {
    const g = scenario()
      .define(UNTAPPER)
      .seat(0)
      .battlefield(UNTAPPER.name, { tapped: true })
      .battlefield('Mountain', 'Mountain')
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('upkeep', { turn: 5 });
    g.pass();
    g.pass();
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.tapped(UNTAPPER.name, false);
  });
});

describe('"Each opponent loses X life. You gain life equal to the life lost this way." (replay: 1 card)', () => {
  const DRAIN = sorcery(
    'SYNTHETIC Parsed Drain',
    'Each opponent loses X life. You gain life equal to the life lost this way.',
    '{X}{B}{B}',
    ['B'],
  );

  test('the life lost is the life gained', () => {
    const g = scenario()
      .define(DRAIN)
      .seat(0)
      .life(10)
      .hand(DRAIN.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .life(20)
      .build();
    g.act(0).cast(DRAIN.name, { x: 3, pay: true });
    resolveTop(g);
    g.expect.life(1, 17);
    g.expect.life(0, 13);
  });
});
