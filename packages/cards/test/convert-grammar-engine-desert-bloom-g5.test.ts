// The Desert Bloom deck, group G5: types given to cards outside the battlefield (Dune Chanter), a pump for two creature types where one is its own plural (Kirri, Talented Sprout), a land
// that becomes a creature as large as the greatest mana value among your commanders (Cactus Preserve), desertwalk (Hazezon, Shaper of Sand) and a trigger that happens once more when a
// land enters (Ancient Greenwarden). The cards are SYNTHETIC stand-ins that carry the Oracle text of the real cards (the golden corpus holds those), read through the grammar only and
// played through applyAction (CR 613.1d, 205.1b, 702.14c, 603.2d, 107.3c, 613.4b, 903.3).
import { type Action, applyAction, getLegalActions } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const FILLER = Array.from({ length: 12 }, () => 'Island');
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';

const CHANTER = parsed(
  'SYNTHETIC G5 Chanter',
  'Creature — Plant Druid',
  'Reach\nLands you control and land cards you own that aren\'t on the battlefield are Deserts in addition to their other types.\nLands you control have "{T}: Add one mana of any color."',
  { manaCost: '{2}{G}', power: '2', toughness: '3', colors: ['G'] },
);
const KIRRI = parsed(
  'SYNTHETIC G5 Kirri',
  'Legendary Creature — Plant Druid',
  'Other Plants and Treefolk you control get +2/+0.\nAt the beginning of each of your postcombat main phases, return target Plant, Treefolk, or land card from your graveyard to your hand.',
  { manaCost: '{1}{R}{G}{W}', power: '0', toughness: '3', colors: ['R', 'G', 'W'] },
);
const PLANT = parsed('SYNTHETIC G5 Plant', 'Creature — Plant', '', {
  manaCost: '{1}{G}',
  power: '1',
  toughness: '1',
  colors: ['G'],
});
const TREEFOLK = parsed('SYNTHETIC G5 Treefolk', 'Creature — Treefolk', '', {
  manaCost: '{2}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const PRESERVE = parsed(
  'SYNTHETIC G5 Preserve',
  'Land — Desert',
  "This land enters tapped.\n{T}: Add one mana of any type that a land you control could produce.\n{3}: Until end of turn, ~ becomes an X/X green Plant creature with reach, where X is the greatest mana value among your commanders. It's still a land.",
);
const HAZEZON = parsed(
  'SYNTHETIC G5 Hazezon',
  'Legendary Creature — Human Warrior',
  'Desertwalk\nYou may play Desert lands from your graveyard.\nWhenever a Desert you control enters, create two 1/1 red, green, and white Sand Warrior creature tokens.',
  { manaCost: '{R}{G}{W}', power: '3', toughness: '3', colors: ['R', 'G', 'W'] },
);
const WALKER = parsed('SYNTHETIC G5 Desertwalker', 'Creature — Bear', 'Desertwalk', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
  colors: ['G'],
});
const GREENWARDEN = parsed(
  'SYNTHETIC G5 Greenwarden',
  'Creature — Elemental',
  'Reach\nYou may play lands from your graveyard.\nIf a land entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.',
  { manaCost: '{4}{G}{G}', power: '5', toughness: '7', colors: ['G'] },
);
const LANDFALL = parsed(
  'SYNTHETIC G5 Landfall',
  'Enchantment',
  'Whenever a land you control enters, you gain 1 life.',
  { manaCost: '{1}{G}', colors: ['G'] },
);
const ENTERS = parsed(
  'SYNTHETIC G5 Enters',
  'Creature — Bear',
  'When this creature enters, you gain 1 life.',
  { manaCost: '{1}{G}', power: '1', toughness: '1', colors: ['G'] },
);
const DESERT = parsed('SYNTHETIC G5 Dry Basin', 'Land — Desert', '');

const DEFS = [
  CHANTER,
  KIRRI,
  PLANT,
  TREEFOLK,
  PRESERVE,
  HAZEZON,
  WALKER,
  GREENWARDEN,
  LANDFALL,
  ENTERS,
  DESERT,
];

type Builder = ReturnType<typeof scenario>;

function base(): Builder {
  const b = scenario();
  for (const def of DEFS) b.define(def);
  return b;
}

type Ref = Parameters<ScenarioGame['object']>[0];

/**
 * The subtypes the engine derives for a card in any zone. The scenario's `derived` check names the list it found when it differs from the one given, and an impossible list is
 * given on purpose (the public API of the engine offers no other read of a card in a hand or a library).
 */
function subtypesOf(g: ScenarioGame, ref: Ref): string[] {
  try {
    g.expect.derived(ref, { subtypes: ['<none>'] });
  } catch (error) {
    const found = /but it has \[(.*)\]/.exec(String((error as Error).message));
    if (found !== null) return (found[1] ?? '').split(', ').filter((t) => t !== '');
  }
  throw new Error('the derived subtypes could not be read');
}

const hasSubtype = (g: ScenarioGame, ref: Ref, type: string): boolean =>
  subtypesOf(g, ref).includes(type);

describe('Dune Chanter: "Lands you control and land cards you own that aren\'t on the battlefield are Deserts in addition to their other types."', () => {
  const board = () =>
    base()
      .seat(0)
      .library('Plains', ...FILLER)
      .battlefield(CHANTER.name)
      .battlefield('Forest', { label: 'field' })
      .hand('Mountain', BEARS)
      .graveyard('Plains', BEARS)
      .seat(1)
      .library('Swamp', ...FILLER)
      .graveyard('Island')
      .battlefield('Swamp', { label: 'theirs' })
      .build();

  test('the lands its controller controls are Deserts and keep their land types (CR 205.1b)', () => {
    const g = board();
    expect(hasSubtype(g, 'field', 'Desert')).toBe(true);
    expect(hasSubtype(g, 'field', 'Forest')).toBe(true);
    expect(hasSubtype(g, 'theirs', 'Desert')).toBe(false);
  });

  test('the land cards its controller owns in a hand, a graveyard and a library are Deserts too (CR 613.1d, 604.3)', () => {
    const g = board();
    expect(hasSubtype(g, { name: 'Mountain', zone: 'hand', seat: 0 }, 'Desert')).toBe(true);
    expect(hasSubtype(g, { name: 'Plains', zone: 'graveyard', seat: 0 }, 'Desert')).toBe(true);
    expect(hasSubtype(g, { name: 'Plains', zone: 'library', seat: 0 }, 'Desert')).toBe(true);
  });

  test('a card that is not a land, and the cards another player owns, are not', () => {
    const g = board();
    expect(hasSubtype(g, { name: BEARS, zone: 'hand', seat: 0 }, 'Desert')).toBe(false);
    expect(hasSubtype(g, { name: BEARS, zone: 'graveyard', seat: 0 }, 'Desert')).toBe(false);
    expect(hasSubtype(g, { name: 'Island', zone: 'graveyard', seat: 1 }, 'Desert')).toBe(false);
    expect(hasSubtype(g, { name: 'Swamp', zone: 'library', seat: 1 }, 'Desert')).toBe(false);
  });

  test('without the creature on the battlefield nothing is a Desert', () => {
    const g = base()
      .seat(0)
      .library(...FILLER)
      .battlefield('Forest', { label: 'field' })
      .graveyard('Plains')
      .seat(1)
      .library(...FILLER)
      .build();
    expect(hasSubtype(g, 'field', 'Desert')).toBe(false);
    expect(hasSubtype(g, { name: 'Plains', zone: 'graveyard', seat: 0 }, 'Desert')).toBe(false);
  });

  test("only the lands of the creature's controller: an opponent's copy gives the cards that opponent owns", () => {
    const g = base()
      .seat(0)
      .library(...FILLER)
      .graveyard('Plains')
      .seat(1)
      .library(...FILLER)
      .battlefield(CHANTER.name)
      .graveyard('Island')
      .build();
    expect(hasSubtype(g, { name: 'Plains', zone: 'graveyard', seat: 0 }, 'Desert')).toBe(false);
    expect(hasSubtype(g, { name: 'Island', zone: 'graveyard', seat: 1 }, 'Desert')).toBe(true);
  });

  test('a land played with Hazezon on the battlefield is a Desert as it enters: two Sand Warriors (CR 603.2, 205.3i)', () => {
    const g = base()
      .seat(0)
      .library(...FILLER)
      .battlefield(CHANTER.name)
      .battlefield(HAZEZON.name)
      .hand('Forest')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).playLand('Forest');
    for (let i = 0; i < 4 && g.state.stack.length > 0; i += 1) g.passAll();
    const tokens = g.view(0).battlefield.filter((o) => o.name === 'Sand Warrior');
    expect(tokens).toHaveLength(2);
  });

  test('the creature also gives the lands "{T}: Add one mana of any color."', () => {
    const g = base()
      .seat(0)
      .library(...FILLER)
      .battlefield(CHANTER.name)
      .battlefield('Forest', { label: 'field' })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).tapForMana('field', { ability: 1, color: 'R' });
    g.expect.pool(0, { R: 1 });
  });
});

describe('Kirri, Talented Sprout: "Other Plants and Treefolk you control get +2/+0."', () => {
  const board = () =>
    base()
      .seat(0)
      .library(...FILLER)
      .battlefield(KIRRI.name)
      .battlefield(PLANT.name, { label: 'mine' })
      .battlefield(TREEFOLK.name)
      .battlefield(BEARS)
      .seat(1)
      .library(...FILLER)
      .battlefield(PLANT.name, { label: 'theirs' })
      .build();

  test('a Plant and a Treefolk you control get +2/+0; another creature, and Kirri itself, do not (CR 613.4c)', () => {
    const g = board();
    g.expect.pt('mine', 3, 1);
    g.expect.pt(TREEFOLK.name, 4, 2);
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt(KIRRI.name, 0, 3);
  });

  test('a Plant another player controls is not pumped', () => {
    const g = board();
    g.expect.pt('theirs', 1, 1);
  });
});

describe('Kirri, Talented Sprout: "return target Plant, Treefolk, or land card from your graveyard to your hand"', () => {
  const postcombat = () =>
    base()
      .seat(0)
      .library(...FILLER)
      .battlefield(KIRRI.name)
      .graveyard('Forest', PLANT.name, TREEFOLK.name, BEARS)
      .seat(1)
      .library(...FILLER)
      .graveyard('Swamp')
      .at('precombatMain', { active: 0 })
      .build();

  test('the targets are the Plant, Treefolk and land cards of your graveyard, and nothing else (CR 115.1, 205.2a)', () => {
    const g = postcombat();
    g.advanceTo('postcombatMain');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const offered = (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
    const inYard = (name: string) => g.id({ name, zone: 'graveyard', seat: 0 });
    expect([...offered].sort()).toEqual(['Forest', PLANT.name, TREEFOLK.name].map(inYard).sort());
  });

  test('the chosen card goes to your hand', () => {
    const g = postcombat();
    g.advanceTo('postcombatMain');
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = d.specs[0]?.legal ?? [];
    const forestId = g.id({ name: 'Forest', zone: 'graveyard', seat: 0 });
    const forest = legal.find((t) => t.kind === 'object' && t.id === forestId);
    if (forest === undefined) throw new Error('the Forest was not offered');
    g.choose(0, { kind: 'chooseTargets', targets: [forest] });
    for (let i = 0; i < 4 && g.state.stack.length > 0; i += 1) g.passAll();
    g.expect.handSize(0, 1);
    expect(g.object({ name: 'Forest', zone: 'hand', seat: 0 }).zone).toBe('hand');
  });
});

describe('Cactus Preserve: "{3}: Until end of turn, ~ becomes an X/X green Plant creature with reach, where X is the greatest mana value among your commanders. It\'s still a land."', () => {
  const board = () =>
    base()
      .seat(0)
      .library(...FILLER)
      .battlefield(PRESERVE.name, { label: 'preserve' })
      .battlefield('Forest', { count: 3 })
      .command('Isamaru, Hound of Konda', { commander: true }) // mana value 1
      .command('Yargle, Glutton of Urborg', { commander: true }) // mana value 4
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('it becomes a 4/4 green Plant creature with reach and is still a Desert land (CR 613.1d, 613.4b, 205.1b)', () => {
    const g = board();
    g.act(0).activate('preserve', { ability: 2, pay: true });
    g.passAll();
    g.expect.pt('preserve', 4, 4);
    g.expect.derived('preserve', {
      types: ['land', 'creature'],
      colors: ['G'],
      keywords: ['reach'],
    });
    expect(hasSubtype(g, 'preserve', 'Plant')).toBe(true);
    expect(hasSubtype(g, 'preserve', 'Desert')).toBe(true);
  });

  test('it lasts until end of turn only', () => {
    const g = board();
    g.act(0).activate('preserve', { ability: 2, pay: true });
    g.passAll();
    g.expect.derived('preserve', { types: ['land', 'creature'] });
    g.advanceTo('cleanup');
    g.expect.derived('preserve', { types: ['land'] });
  });
});

describe('desertwalk (CR 702.14c): "can\'t be blocked as long as defending player controls a Desert"', () => {
  function attacked(defender: (b: Builder) => void): ScenarioGame {
    const b = base()
      .seat(0)
      .library(...FILLER)
      .battlefield(WALKER.name)
      .seat(1)
      .library(...FILLER);
    defender(b);
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([WALKER.name]);
    g.advanceTo('declareBlockers');
    return g;
  }
  function canBlock(g: ScenarioGame): boolean {
    const action: Action = {
      kind: 'declareBlockers',
      blocks: [{ blocker: g.id(SPIDER), attacker: g.id(WALKER.name) }],
    };
    const accepted = applyAction(g.state, 1, action).ok;
    const listed = getLegalActions(g.state, 1).some(
      (a) => JSON.stringify(a) === JSON.stringify(action),
    );
    expect(listed).toBe(accepted);
    return accepted;
  }

  test('a Desert on the defending side: it cannot be blocked', () => {
    expect(canBlock(attacked((b) => b.battlefield(DESERT.name, SPIDER)))).toBe(false);
  });

  test('no Desert there: it can be blocked', () => {
    expect(canBlock(attacked((b) => b.battlefield('Forest', SPIDER)))).toBe(true);
  });

  test("a Desert only the attacker's side controls does not count", () => {
    const g = attacked((b) => b.battlefield('Forest', SPIDER));
    expect(g.view(0).battlefield.some((o) => o.name === WALKER.name)).toBe(true);
    expect(canBlock(g)).toBe(true);
  });

  test('a land made a Desert by an effect counts (CR 702.14c, 613.1d)', () => {
    const g = attacked((b) => b.battlefield(CHANTER.name, 'Forest', SPIDER));
    expect(canBlock(g)).toBe(false);
  });
});

describe('Ancient Greenwarden: "If a land entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time."', () => {
  const game = (withWarden: boolean) => {
    const b = base()
      .seat(0)
      .library(...FILLER)
      .battlefield(LANDFALL.name)
      .hand('Forest', ENTERS.name);
    if (withWarden) b.battlefield(GREENWARDEN.name);
    return b
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('without it a land entering triggers a landfall ability once', () => {
    const g = game(false);
    g.act(0).playLand('Forest');
    for (let i = 0; i < 6 && g.state.stack.length > 0; i += 1) g.passAll();
    g.expect.life(0, 41);
  });

  test('with it the same ability triggers one more time (CR 603.2d, 603.6a)', () => {
    const g = game(true);
    g.act(0).playLand('Forest');
    for (let i = 0; i < 6 && g.state.stack.length > 0; i += 1) g.passAll();
    g.expect.life(0, 42);
  });

  test('a creature entering is not a land entering: its own enters trigger happens once', () => {
    const g = game(true);
    g.act(0).cast(ENTERS.name).pay();
    for (let i = 0; i < 6 && g.state.stack.length > 0; i += 1) g.passAll();
    g.expect.life(0, 41);
  });
});

describe('what the grammar refuses rather than half runs (honesty)', () => {
  const status = (typeLine: string, text: string, extra = {}) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC G5 Refused',
        typeLine,
        oracleText: text,
        manaCost: '{1}',
        ...extra,
      }),
    ).support.status;

  test('the cards outside the battlefield take no keyword or bonus: the whole line stays unsupported', () => {
    expect(
      status(
        'Creature — Plant',
        "Lands you control and land cards you own that aren't on the battlefield have vigilance.",
        {
          power: '1',
          toughness: '1',
        },
      ),
    ).toBe('unsupported');
  });

  test('a list of creature types alone ("Plant or Treefolk card") is no card the engine reads', () => {
    expect(
      status(
        'Creature — Plant',
        'At the beginning of your end step, return target Plant or Treefolk card from your graveyard to your hand.',
        { power: '1', toughness: '1' },
      ),
    ).toBe('unsupported');
  });
});
