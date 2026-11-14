// Fetching, a reflexive trigger after a sacrifice, a trigger for spells only, and abilities given to a group (D-177, the Korvold slice 2).
// Pins: CR 701.23 and 400.7j (what a search leaves as "it": the card it found, wherever it put it), CR 603.12 (a reflexive triggered ability
// triggers on what its earlier part did; it needs no "may"), CR 608.2h and 113.7a (the power of a permanent that was sacrificed is read as it
// last was on the battlefield), CR 603.2 and 601.2c (becoming the target of a spell, not of an ability), CR 605.1a and 602.5 (a mana ability
// that sacrifices its permanent is still a mana ability), CR 613.1f (an ability given to a group in layer 6), CR 111.10a (a Treasure token).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-fetch-grants.ts), the real fixtures named, or the SYNTHETIC Pinger of the ward tests.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { chooseCardsDecision } from './pending-helpers';
import { twoSeatGame } from './two-seat-helpers';

const GATE = 'SYNTHETIC Fetch Gate';
const SEEKER = 'SYNTHETIC Seeker Rite';
const TWIN = 'SYNTHETIC Twin Seeker';
const DOUBLE = 'SYNTHETIC Double Seeker';
const PASSING = 'SYNTHETIC Passing Land';
const TITHER = 'SYNTHETIC Grim Tither';
const WARDEN = 'SYNTHETIC Pyre Warden';
const MAGNET = 'SYNTHETIC Spell Magnet';
const BANNER = 'SYNTHETIC Gilded Banner';
const SHRINE = 'SYNTHETIC Coin Shrine';
const MAKER = 'SYNTHETIC Make Treasures'; // {1}{R}: create two Treasure tokens
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

describe('the cards are valid', () => {
  test.each([GATE, SEEKER, TWIN, DOUBLE, PASSING, TITHER, WARDEN, MAGNET, BANNER, SHRINE])(
    '%s',
    (name) => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    },
  );
});

// ---- A search leaves "it" (CR 701.23, 400.7j)

describe('"Search your library for a basic land card, put it onto the battlefield tapped, ... Then if you control four or more lands, untap that land."', () => {
  const fetch = (lands: number) => {
    const g = scenario()
      .seat(0)
      .battlefield(GATE, ...Array.from({ length: lands }, () => 'Forest'))
      .library('Island', { label: 'island' })
      .library('Grizzly Bears')
      .library('Mountain', { label: 'mountain' })
      .seat(1)
      .library('Plains')
      .at('precombatMain')
      .build();
    g.act(0).activate(GATE);
    return g;
  };

  test('with four lands after the fetch, the land that was found is untapped', () => {
    const g = fetch(3);
    // The cost sacrificed the Gate: three Forests are left, and the fetched land is the fourth.
    g.expect.zone(GATE, 'graveyard', { seat: 0 });
    g.passAll();
    g.act(0).chooseCards('island');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.tapped('Island', false);
    g.expect.invariants();
  });

  test('with only three lands after the fetch, it stays tapped', () => {
    const g = fetch(2);
    g.passAll();
    g.act(0).chooseCards('island');
    g.expect.tapped('Island', true);
  });

  test('only the land it found is untapped, not the other lands (the Forests stay as they were)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GATE, 'Forest', 'Forest', 'Forest')
      .library('Island', { label: 'island' })
      .seat(1)
      .library('Plains')
      .at('precombatMain')
      .build();
    g.act(0).tapForMana({ name: 'Forest', nth: 0 });
    g.act(0).activate(GATE);
    g.passAll();
    g.act(0).chooseCards('island');
    g.expect.tapped({ name: 'Forest', nth: 0 }, true);
    g.expect.tapped('Island', false);
  });

  test('finding nothing leaves nothing to untap, and the ability still finishes', () => {
    const g = fetch(3);
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone('Island', 'battlefield', { seat: 0, count: 0 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });

  test('with no basic land in the library the search finds nothing and asks nothing', () => {
    const g = scenario()
      .seat(0)
      .battlefield(GATE, 'Forest', 'Forest', 'Forest')
      .library(BEARS)
      .seat(1)
      .library('Plains')
      .at('precombatMain')
      .build();
    g.act(0).activate(GATE);
    g.passAll();
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });
});

describe('"Search your library for a creature card, put it into your hand, ... You gain life equal to its power."', () => {
  test('"it" is the card that was found, in the hand: its power is the life gained', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(SEEKER)
      .pool('GC')
      .library('Island')
      .library(BEARS)
      .library(ANGEL, { label: 'angel' })
      .seat(1)
      .library('Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast(SEEKER, { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('angel');
    g.expect.zone(ANGEL, 'hand', { seat: 0 });
    g.expect.life(0, 24);
    g.expect.invariants();
  });
});

describe('"Search ... for up to two basic land cards, put them onto the battlefield tapped, then shuffle. Untap them."', () => {
  test('both of the lands that were found are untapped', () => {
    const g = scenario()
      .seat(0)
      .hand(TWIN)
      .pool('GCC')
      .library('Island', { label: 'island' })
      .library('Mountain', { label: 'mountain' })
      .library('Forest', { label: 'forest' })
      .seat(1)
      .library('Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast(TWIN, { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('island', 'mountain');
    g.expect.tapped('Island', false);
    g.expect.tapped('Mountain', false);
  });
});

describe('a second search replaces what "it" is (CR 400.7j)', () => {
  test('after two searches "it" is what the second one found: the land of the first stays tapped', () => {
    const g = scenario()
      .seat(0)
      .hand(DOUBLE)
      .pool('GCCC')
      .library('Island', { label: 'island' })
      .library(BEARS, { label: 'bears' })
      .seat(1)
      .library('Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast(DOUBLE, { pay: true });
    resolveTop(g);
    g.act(0).chooseCards('island');
    g.act(0).chooseCards('bears');
    g.expect.zone(BEARS, 'hand', { seat: 0 });
    g.expect.tapped('Island', true);
  });
});

// ---- A reflexive trigger after a sacrifice that is not an offer (CR 603.12)

describe('"When this land enters, sacrifice it. When you do, search ... a basic Forest or Island card, ... and you gain 1 life."', () => {
  const play = () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(PASSING)
      .library('Mountain', { label: 'mountain' })
      .library('Forest', { label: 'forest' })
      .library('Plains', { label: 'plains' })
      .library('Island', { label: 'island' })
      .seat(1)
      .library('Plains')
      .at('precombatMain')
      .build();
    g.act(0).playLand(PASSING);
    return g;
  };

  test('the land enters and its trigger sacrifices it; the reflexive ability is a new object on the stack', () => {
    const g = play();
    g.expect.stack([`${PASSING} (ability)`]);
    g.passAll();
    g.expect.zone(PASSING, 'graveyard', { seat: 0 });
    // The reflexive ability is its own object (CR 603.12), put on the stack where the first one was.
    g.expect.stack([`${PASSING} (ability)`]);
    g.expect.life(0, 20);
  });

  test('it offers only the basic Forests and Islands, finds one tapped, shuffles and gains 1 life', () => {
    const g = play();
    g.passAll();
    g.passAll();
    g.expect.pending('chooseCards', 0);
    const d = chooseCardsDecision(g);
    expect(d.legal).toEqual([g.id('forest'), g.id('island')]);
    g.act(0).chooseCards('island');
    g.expect.zone('Island', 'battlefield', { seat: 0 });
    g.expect.tapped('Island', true);
    g.expect.life(0, 21);
    g.expect.librarySize(0, 3);
    g.expect.invariants();
  });

  test('finding nothing still gains the life', () => {
    const g = play();
    g.passAll();
    g.passAll();
    g.act(0).chooseCards();
    g.expect.life(0, 21);
  });
});

describe('"When this creature enters, sacrifice another creature. When you do, you gain life equal to that creature\'s power."', () => {
  const tither = (extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) =>
    twoSeatGame((b) => extra(b.hand(TITHER).battlefield('Swamp', { count: 3 })));

  test('the life is the power of the creature that was sacrificed, as it was on the battlefield', () => {
    const g = tither((b) => b.battlefield(BEARS, ANGEL));
    g.act(0).cast(TITHER, { pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(ANGEL);
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.life(0, 24);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('a creature that was bigger on the battlefield (a +1/+1 counter) counts for what it was there', () => {
    const g = tither((b) => b.battlefield(BEARS, { counters: { '+1/+1': 2 } }));
    g.act(0).cast(TITHER, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(0, 24);
  });

  test('with no other creature nothing is sacrificed and there is no reflexive ability', () => {
    const g = tither((b) => b);
    g.act(0).cast(TITHER, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.life(0, 20);
  });
});

describe('"At the beginning of your end step, you may sacrifice another creature. When you do, this deals damage equal to that creature\'s power to any target and you create three Treasure tokens."', () => {
  const endStep = (extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) => {
    const g = twoSeatGame((b) => extra(b.battlefield(WARDEN)));
    g.advanceTo('end');
    // The trigger is on the stack: it asks as it resolves (CR 603.5).
    g.passAll();
    return g;
  };

  test('sacrificing starts the reflexive ability; its target is chosen then, and the damage is the sacrificed power', () => {
    const g = endStep((b) => b.battlefield(ANGEL));
    g.act(0).accept();
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    resolveTop(g);
    g.expect.life(1, 16);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 3 });
    g.expect.invariants();
  });

  test('the damage can go to a creature', () => {
    const g = endStep((b) => b.battlefield(ANGEL).seat(1).battlefield('Giant Spider'));
    g.act(0).accept();
    g.act(0).chooseTargets({ name: 'Giant Spider', seat: 1 });
    resolveTop(g);
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
  });

  test('declining sacrifices nothing and makes nothing', () => {
    const g = endStep((b) => b.battlefield(ANGEL));
    g.act(0).decline();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.noObject('Treasure');
    g.expect.life(1, 20);
  });
});

// ---- "Becomes the target of a spell" (CR 603.2, 601.2c)

describe('"Whenever this creature becomes the target of a spell, create a Treasure token."', () => {
  const board = () =>
    scenario()
      .seat(0)
      .battlefield(MAGNET)
      .library('Plains')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain', 'SYNTHETIC Pinger')
      .library('Plains')
      .at('precombatMain')
      .build();

  test("an opponent's spell that targets it triggers it, as the spell is cast", () => {
    const g = board();
    g.pass();
    g.act(1).cast(BOLT, { targets: [MAGNET], pay: true });
    g.expect.stack([`${MAGNET} (ability)`, BOLT]);
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
  });

  test('an ability that targets it does not', () => {
    const g = board();
    g.pass();
    g.act(1).activate('SYNTHETIC Pinger', { targets: [MAGNET] });
    g.expect.stack(['SYNTHETIC Pinger (ability)']);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });

  test('a spell that does not target it does not', () => {
    const g = board();
    g.pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.expect.stack([BOLT]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });
});

// ---- A mana ability that sacrifices its permanent, given to a group (CR 605.1a, 613.1f)

describe('"Treasures you control have \\"{T}, Sacrifice this artifact: Add two mana of any one color.\\""', () => {
  const withTreasure = (extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) => {
    const g = extra(
      scenario().seat(0).hand(MAKER).battlefield(BANNER, 'Mountain', 'Mountain').library('Plains'),
    )
      .seat(1)
      .library('Plains')
      .at('precombatMain');
    const built = g.build();
    built.act(0).cast(MAKER, { pay: true });
    resolveTop(built);
    return built;
  };

  test('a Treasure has its own ability and the given one, after it', () => {
    const g = withTreasure((b) => b);
    const id = g.id({ name: 'Treasure', nth: 0 });
    const offered = (index: number) =>
      g
        .legalActions(0)
        .flatMap((a) =>
          a.kind === 'activateAbility' && a.source === id && a.abilityIndex === index
            ? [a.color ?? '-']
            : [],
        );
    expect(offered(0)).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(offered(1)).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(offered(2)).toEqual([]);
  });

  test('using it makes two mana of the one color chosen and sacrifices the Treasure', () => {
    const g = withTreasure((b) => b);
    g.act(0).tapForMana({ name: 'Treasure', nth: 0 }, { ability: 1, color: 'R' });
    g.expect.pool(0, 'RR');
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Treasure', 'graveyard', { seat: 0, count: 0 });
    g.expect.invariants();
  });

  test("the Treasure's own ability still makes one mana", () => {
    const g = withTreasure((b) => b);
    g.act(0).tapForMana({ name: 'Treasure', nth: 0 }, { ability: 0, color: 'G' });
    g.expect.pool(0, 'G');
  });

  test('a cost is paid by hand with the given ability: one Treasure pays {1}{G}', () => {
    const g = withTreasure((b) => b.hand(BEARS));
    g.act(0)
      .cast(BEARS)
      .payManual([{ source: { name: 'Treasure', nth: 0 }, ability: 1, color: 'G' }]);
    g.expect.stack([BEARS]);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
  });

  test('the planner pays {1}{G} with the Treasure that is left (it has two abilities, which are alternatives of one source)', () => {
    const g = scenario()
      .seat(0)
      .hand(MAKER, BEARS)
      .battlefield(BANNER, 'Mountain', 'Mountain')
      .library('Plains')
      .seat(1)
      .library('Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast(MAKER, { pay: true });
    resolveTop(g);
    g.act(0).tapForMana({ name: 'Treasure', nth: 1 }, { ability: 0, color: 'G' });
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 0 });
  });

  test('a Treasure the opponent controls does not have it, and one that arrives later does', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BANNER)
      .library('Plains')
      .seat(1)
      .hand(MAKER)
      .battlefield('Mountain', 'Mountain')
      .library('Plains')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(MAKER, { pay: true });
    resolveTop(g);
    const id = g.id({ name: 'Treasure', nth: 0, seat: 1 });
    const second = g
      .legalActions(1)
      .filter((a) => a.kind === 'activate' && a.object === id && a.abilityIndex === 1);
    expect(second).toEqual([]);
  });
});

// ---- An activated ability given to a group (CR 602, 613.1f)

describe('"Lands you control have \\"{T}: Create a Treasure token.\\""', () => {
  const board = () =>
    scenario()
      .seat(0)
      .battlefield(SHRINE, 'Forest', 'Mountain')
      .hand('Plains')
      .library('Plains')
      .seat(1)
      .battlefield('Island')
      .library('Plains')
      .at('precombatMain')
      .build();

  const offers = (g: ScenarioGame, card: Parameters<ScenarioGame['id']>[0], seat: 0 | 1 = 0) => {
    const id = g.id(card);
    return g
      .legalActions(seat)
      .filter((a) => a.kind === 'activate' && a.object === id && a.abilityIndex === 1);
  };

  test('each land I control offers it, after its own mana ability; the Shrine and the opponent lands do not', () => {
    const g = board();
    expect(offers(g, 'Forest')).toHaveLength(1);
    expect(offers(g, 'Mountain')).toHaveLength(1);
    expect(offers(g, SHRINE)).toHaveLength(0);
    expect(offers(g, { name: 'Island', seat: 1 }, 1)).toHaveLength(0);
  });

  test('activating it taps the land, goes on the stack and makes a Treasure', () => {
    const g = board();
    g.act(0).activate('Forest', { ability: 1 });
    g.expect.tapped('Forest', true);
    g.expect.stack(['Forest (ability)']);
    resolveTop(g);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('a land that is played later has it too', () => {
    const g = board();
    g.act(0).playLand('Plains');
    expect(offers(g, { name: 'Plains', zone: 'battlefield' })).toHaveLength(1);
  });

  test('a tapped land has not (its cost is {T})', () => {
    const g = board();
    g.act(0).tapForMana('Forest');
    expect(offers(g, 'Forest')).toHaveLength(0);
  });
});
