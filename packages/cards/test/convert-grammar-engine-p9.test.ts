// Parsed text is only worth something if the engine runs it as written (stage P9). These tests
// import SYNTHETIC cards through the grammar (never through a fixture), define them in an engine
// scenario and play them through applyAction: counterspells that name a kind of spell, "its
// controller" and "equal to its power" (Swords to Plowshares' shape), triggers on casting a spell,
// "~ or another creature dies", the beginning of "the end step", the conditions of "enters tapped
// unless", "it deals N damage", Equipment that attaches itself, `~` as the object of an effect, "up
// to one target", a card put on top of a library and "Enchant Forest". Every card name starts with
// "SYNTHETIC"; the Oracle text is template text from the corpus (reports/backlog.md and
// reports/template-replay.md, the real line of the shape) or marked SYNTHETIC where no real line
// has the shape. No real card's text is claimed.
import type { CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const instant = (name: string, text: string, manaCost: string) =>
  parsed(name, 'Instant', text, { manaCost, colors: ['U'] });
const sorcery = (name: string, text: string, manaCost: string) =>
  parsed(name, 'Sorcery', text, { manaCost, colors: ['W'] });
const creature = (name: string, text: string, manaCost = '{1}{G}', power = '2', toughness = '2') =>
  parsed(name, 'Creature — Bear', text, { manaCost, power, toughness, colors: ['G'] });
const enchantment = (name: string, text: string, manaCost = '{1}{U}') =>
  parsed(name, 'Enchantment', text, { manaCost, colors: ['U'] });

const BEARS = 'Grizzly Bears'; // 2/2
const BOLT = 'Lightning Bolt'; // 3 damage to any target

describe('"Counter target <kind of> spell": the spell filter is a filter of the stack (CR 115.1, 701.6)', () => {
  const NEGATE = instant('SYNTHETIC Parsed Negate', 'Counter target noncreature spell.', '{1}{U}');
  const ESSENCE = instant('SYNTHETIC Parsed Essence', 'Counter target creature spell.', '{1}{U}');
  const SPELLSEEKER = instant(
    'SYNTHETIC Parsed Spellseeker',
    'Counter target instant or sorcery spell.',
    '{1}{U}',
  );

  test('the parsed spells carry the stack filters', () => {
    expect(NEGATE.faces[0]?.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'stack', notTypes: ['creature'], stackKind: 'spell' },
          },
        },
      ],
      effect: { kind: 'counter', objects: { kind: 'target', id: 't1' } },
    });
    expect(ESSENCE.faces[0]?.spell?.targets?.[0]?.what).toEqual({
      kind: 'object',
      filter: { zone: 'stack', types: ['creature'], stackKind: 'spell' },
    });
    expect(SPELLSEEKER.faces[0]?.spell?.targets?.[0]?.what).toEqual({
      kind: 'object',
      filter: {
        zone: 'stack',
        stackKind: 'spell',
        anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
      },
    });
  });

  /** Seat 0 casts `spell`; seat 1 holds `counter` with two Islands. */
  const board = (counter: CardDefinition) =>
    scenario()
      .define(NEGATE)
      .define(ESSENCE)
      .define(SPELLSEEKER)
      .seat(0)
      .hand(BOLT, BEARS)
      .battlefield('Mountain', 'Mountain', 'Forest', 'Forest')
      .seat(1)
      .hand(counter.name)
      .battlefield('Island', 'Island')
      .build();

  test('a noncreature counterspell counters a Lightning Bolt', () => {
    const g = board(NEGATE);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast(NEGATE.name, { targets: [BOLT], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.life(1, 40);
    g.expect.invariants();
  });

  test('a noncreature counterspell cannot target a creature spell', () => {
    const g = board(NEGATE);
    g.act(0).cast(BEARS, { pay: true });
    g.act(0).pass();
    // The only spell on the stack is a creature spell: there is nothing to aim at.
    g.expect.illegal(1, { cast: NEGATE.name });
  });

  test('a creature counterspell counters a creature spell and cannot target a Bolt', () => {
    const g = board(ESSENCE);
    g.act(0).cast(BEARS, { pay: true });
    g.act(0).pass();
    g.act(1).cast(ESSENCE.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });

    const h = board(ESSENCE);
    h.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    h.act(0).pass();
    h.expect.illegal(1, { cast: ESSENCE.name });
  });

  test('"instant or sorcery" counters the Bolt and not the Bears', () => {
    const g = board(SPELLSEEKER);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).pass();
    g.act(1).cast(SPELLSEEKER.name, { targets: [BOLT], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0, count: 1 });
    g.expect.life(1, 40);

    const h = board(SPELLSEEKER);
    h.act(0).cast(BEARS, { pay: true });
    h.act(0).pass();
    h.expect.illegal(1, { cast: SPELLSEEKER.name });
  });
});

describe('"Its controller gains 4 life": the controller of the target, last known (CR 109.4, 608.2h)', () => {
  const SMASH = instant(
    'SYNTHETIC Parsed Smash Grant',
    'Destroy target artifact or enchantment. Its controller gains 4 life.',
    '{R}',
  );
  const SCOLD = instant(
    'SYNTHETIC Parsed Scold',
    "Destroy target creature. That creature's controller loses 2 life.",
    '{B}',
  );

  test('the parsed spell destroys, then changes the life of the controller of the target', () => {
    expect(SMASH.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
        {
          kind: 'gainLife',
          player: { kind: 'controllerOf', of: { kind: 'target', id: 't1' } },
          amount: 4,
        },
      ],
    });
  });

  const board = () =>
    scenario()
      .define(SMASH)
      .define(SCOLD)
      .seat(0)
      .hand(SMASH.name, SCOLD.name)
      .battlefield('Mountain', 'Swamp')
      .battlefield('Sol Ring', { label: 'mine' })
      .seat(1)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield('Sol Ring', { label: 'ring' })
      .build();

  test('the controller of the destroyed permanent gains the life, not the caster', () => {
    const g = board();
    g.act(0).cast(SMASH.name, { targets: ['ring'], pay: true });
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1, count: 1 });
    g.expect.life(1, 44);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('a permanent you control works the same: you gain the life', () => {
    const g = board();
    g.act(0).cast(SMASH.name, { targets: ['mine'], pay: true });
    g.passAll();
    g.expect.life(0, 44);
    g.expect.life(1, 40);
  });

  test('"That creature\'s controller loses 2 life" is the same player selector for the other verb', () => {
    const g = board();
    g.act(0).cast(SCOLD.name, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1, count: 1 });
    g.expect.life(1, 38);
    g.expect.life(0, 40);
  });
});

describe('"... equal to its power": run for ~ (a target is stage P11, convert-grammar-engine-p11.test.ts)', () => {
  const SWORDS_SHAPE = 'Exile target creature. Its controller gains life equal to its power.';

  test("a target creature's power is lowered since D-092 (run in convert-grammar-engine-p11)", () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Parsed Exile Grant',
        manaCost: '{W}',
        typeLine: 'Instant',
        oracleText: SWORDS_SHAPE,
        colors: ['W'],
      }),
    );
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });

  const LEECH = creature(
    'SYNTHETIC Parsed Leech Bear',
    'Whenever ~ attacks, you gain life equal to its power.',
    '{1}{G}',
    '3',
    '3',
  );

  test('the power of ~ itself is run: attacking gains life equal to the power (CR 608.2h)', () => {
    expect(LEECH.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'attacks', what: { kind: 'this' } },
        effect: {
          kind: 'gainLife',
          player: { kind: 'you' },
          amount: { kind: 'powerOf', of: { kind: 'this' } },
        },
      },
    ]);
    const g = scenario()
      .define(LEECH)
      .seat(0)
      .battlefield(LEECH.name, { label: 'leech', counters: { '+1/+1': 1 } })
      .seat(1)
      .build();
    g.expect.pt('leech', 4, 4);
    g.playCombat({ attack: ['leech'], until: 'combatDamage' });
    g.expect.life(0, 44);
    g.expect.invariants();
  });
});

describe('triggers on casting a spell (CR 601.2i, 603.2)', () => {
  const SCHOLAR = enchantment(
    'SYNTHETIC Parsed Scholar',
    'Whenever you cast a creature spell, draw a card.',
  );
  const SPARK = enchantment(
    'SYNTHETIC Parsed Sparkmage',
    'Whenever you cast a noncreature spell, ~ deals 1 damage to each opponent.',
    '{1}{R}',
  );
  const BAROMETER = enchantment(
    'SYNTHETIC Parsed Barometer',
    'Whenever a player casts a spell, you gain 1 life.',
    '{1}{W}',
  );
  const ARCANE = enchantment(
    'SYNTHETIC Parsed Arcane Spark',
    'Whenever you cast an instant or sorcery spell, you gain 2 life.',
    '{1}{U}',
  );

  test('the parsed triggers are the engine castSpell trigger with a stack filter', () => {
    expect(SCHOLAR.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: {
          kind: 'castSpell',
          filter: { types: ['creature'], stackKind: 'spell' },
          by: 'you',
        },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
    expect(SPARK.faces[0]?.abilities[0]).toMatchObject({
      trigger: { kind: 'castSpell', filter: { notTypes: ['creature'], stackKind: 'spell' } },
    });
    expect(BAROMETER.faces[0]?.abilities[0]).toMatchObject({
      trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'any' },
    });
    expect(ARCANE.faces[0]?.abilities[0]).toMatchObject({
      trigger: {
        kind: 'castSpell',
        filter: { stackKind: 'spell', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
      },
    });
  });

  const board = (permanent: CardDefinition) =>
    scenario()
      .define(permanent)
      .seat(0)
      .hand(BEARS, BOLT)
      .battlefield(permanent.name, 'Mountain', 'Mountain', 'Forest', 'Forest')
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain')
      .library('Forest', 'Forest', 'Forest')
      .build();

  test('a creature spell triggers the creature trigger: you draw; a Bolt does not', () => {
    const g = board(SCHOLAR);
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([`${SCHOLAR.name} (ability)`, BEARS]);
    g.passAll();
    g.expect.handSize(0, 2); // Lightning Bolt and the drawn card
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });

    const h = board(SCHOLAR);
    h.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    h.expect.stack([BOLT]);
  });

  test('a noncreature spell triggers the noncreature trigger: one damage to each opponent', () => {
    const g = board(SPARK);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 36); // 1 from the trigger, 3 from the Bolt
    const h = board(SPARK);
    h.act(0).cast(BEARS, { pay: true });
    h.expect.stack([BEARS]);
  });

  test('"a player casts" triggers for the opponent too, "you cast" only for you', () => {
    const g = board(BAROMETER);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.expect.stack([`${BAROMETER.name} (ability)`, BOLT]);
    g.passAll();
    g.expect.life(0, 40 - 3 + 1);

    const h = board(SCHOLAR);
    h.act(0).pass();
    h.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    h.expect.stack([BOLT]);
  });

  test('"instant or sorcery" triggers on the Bolt and not on the Bears', () => {
    const g = board(ARCANE);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 42);
    const h = board(ARCANE);
    h.act(0).cast(BEARS, { pay: true });
    h.expect.stack([BEARS]);
  });
});

describe('"~ or another creature dies": one ability per subject (CR 603.2c, 700.4)', () => {
  const AGENT = creature(
    'SYNTHETIC Parsed Drain Agent',
    'Whenever ~ or another creature dies, each opponent loses 1 life and you gain 1 life.',
    '{1}{B}',
    '1',
    '1',
  );
  const ARTIST = creature(
    'SYNTHETIC Parsed Drain Artist',
    'Whenever ~ or another creature dies, target player loses 1 life and you gain 1 life.',
    '{1}{B}',
    '0',
    '1',
  );

  test('the parsed line is two engine abilities with the same body', () => {
    const [a, b] = AGENT.faces[0]?.abilities ?? [];
    expect(a).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'this' } },
    });
    expect(b).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'], other: true } },
    });
    expect(a && 'effect' in a ? a.effect : null).toEqual(b && 'effect' in b ? b.effect : undefined);
    expect(AGENT.faces[0]?.abilities).toHaveLength(2);
  });

  const board = (card: CardDefinition) =>
    scenario()
      .define(card)
      .seat(0)
      .battlefield(card.name, { label: 'agent' })
      .battlefield(BEARS, { label: 'bears' })
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .build();

  test('another creature dying triggers it once: each opponent loses 1, you gain 1', () => {
    const g = board(AGENT);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 41);
    g.expect.invariants();
  });

  test('~ dying triggers it too, once (not also as "another creature")', () => {
    const g = board(AGENT);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['agent'], pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 41);
    g.expect.stack([]);
  });

  test('with a target: the controller picks the player as the ability goes on the stack', () => {
    const g = board(ARTIST);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 41);
    g.expect.invariants();
  });
});

describe('"At the beginning of the end step": every end step (CR 513.1a)', () => {
  const BALL = creature(
    'SYNTHETIC Parsed Ball Spark',
    'At the beginning of the end step, sacrifice ~.',
    '{1}{R}',
    '6',
    '1',
  );

  test('the parsed trigger is the engine end step trigger of each turn', () => {
    expect(BALL.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'each' },
        effect: { kind: 'sacrifice', objects: { kind: 'this' } },
      },
    ]);
  });

  test("it is sacrificed at the end step of its controller's turn", () => {
    const g = scenario().define(BALL).seat(0).battlefield(BALL.name).seat(1).build();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BALL.name, 'graveyard', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('it is also sacrificed at the end step of an opponent\'s turn ("the end step", not "your")', () => {
    const g = scenario()
      .define(BALL)
      .at('precombatMain', { active: 1 })
      .seat(0)
      .battlefield(BALL.name)
      .seat(1)
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BALL.name, 'graveyard', { seat: 0, count: 1 });
  });
});

describe('"enters tapped unless you control ...": a permanent, a basic land, other Islands (CR 614.12)', () => {
  const land = (name: string, text: string) => parsed(name, 'Land', `${text}\n{T}: Add {C}.`, {});
  const CITADEL = land(
    'SYNTHETIC Parsed Citadel',
    '~ enters tapped unless you control a legendary creature.',
  );
  const CAMP = land('SYNTHETIC Parsed Camp', '~ enters tapped unless you control a basic land.');
  const HARBOR = land(
    'SYNTHETIC Parsed Harbor',
    '~ enters tapped unless you control three or more other Islands.',
  );

  test('the parsed conditions are the engine controlsAtLeast conditions', () => {
    const unless = (card: CardDefinition) => {
      const [first] = card.faces[0]?.abilities ?? [];
      return first?.kind === 'replacement' && first.replacement.kind === 'entersTapped'
        ? first.replacement.unless
        : undefined;
    };
    expect(unless(CITADEL)).toEqual({
      kind: 'controlsAtLeast',
      filter: { types: ['creature'], supertypes: ['legendary'] },
      count: 1,
    });
    expect(unless(CAMP)).toEqual({
      kind: 'controlsAtLeast',
      filter: { types: ['land'], supertypes: ['basic'] },
      count: 1,
    });
    expect(unless(HARBOR)).toEqual({
      kind: 'controlsAtLeast',
      filter: { subtypes: ['Island'], other: true },
      count: 3,
    });
  });

  const play = (card: CardDefinition, ...others: string[]) => {
    const g = scenario()
      .define(card)
      .seat(0)
      .hand(card.name)
      .battlefield(...others)
      .seat(1)
      .build();
    g.act(0).playLand(card.name);
    return g;
  };

  test('with a legendary creature it enters untapped, without one it enters tapped', () => {
    play(CITADEL, 'Isamaru, Hound of Konda').expect.tapped(CITADEL.name, false);
    play(CITADEL, BEARS).expect.tapped(CITADEL.name, true);
    play(CITADEL).expect.tapped(CITADEL.name, true);
  });

  test('with a basic land it enters untapped, without one it enters tapped', () => {
    play(CAMP, 'Forest').expect.tapped(CAMP.name, false);
    play(CAMP, BEARS).expect.tapped(CAMP.name, true);
  });

  test('three other Islands untap it, two do not; a Forest is not an Island', () => {
    play(HARBOR, 'Island', 'Island', 'Island').expect.tapped(HARBOR.name, false);
    play(HARBOR, 'Island', 'Island', 'Forest').expect.tapped(HARBOR.name, true);
  });
});

describe('"it deals N damage to ..." where "it" is ~ (CR 120.2, 113.7a)', () => {
  const BRASS = parsed(
    'SYNTHETIC Parsed Pain Land',
    'Land',
    'Whenever ~ becomes tapped, it deals 1 damage to you.\n{T}: Add {C}.',
  );
  const PINGER = creature(
    'SYNTHETIC Parsed Welcome Bear',
    'When ~ enters, it deals 1 damage to target opponent.',
  );
  const COUNTDOWN = creature(
    'SYNTHETIC Parsed Counter Bear',
    'Remove a +1/+1 counter from ~: It deals 1 damage to any target.',
  );

  test("the parsed abilities have no source field: the ability's own permanent deals it", () => {
    expect(BRASS.faces[0]?.abilities[0]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'becomesTapped', what: { kind: 'this' } },
      effect: { kind: 'dealDamage', amount: 1, to: { kind: 'you' } },
    });
    expect(COUNTDOWN.faces[0]?.abilities).toMatchObject([
      {
        kind: 'activated',
        cost: [{ kind: 'removeCounters', counter: '+1/+1', count: 1 }],
        effect: { kind: 'dealDamage', amount: 1, to: { kind: 'target', id: 't1' } },
      },
    ]);
  });

  test('tapping the land for mana triggers it: you take 1', () => {
    const g = scenario().define(BRASS).seat(0).battlefield(BRASS.name).seat(1).build();
    g.act(0).tapForMana(BRASS.name);
    g.passAll();
    g.expect.life(0, 39);
    g.expect.invariants();
  });

  test('entering, it deals 1 damage to the target opponent', () => {
    const g = scenario()
      .define(PINGER)
      .seat(0)
      .hand(PINGER.name)
      .battlefield('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(PINGER.name, { pay: true });
    // One opponent is the only legal target, so the engine chooses it as the trigger goes on.
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 40);
    g.expect.invariants();
  });

  test('removing a counter as the cost: it deals 1 damage to the chosen target', () => {
    const g = scenario()
      .define(COUNTDOWN)
      .seat(0)
      .battlefield(COUNTDOWN.name, { label: 'bear', counters: { '+1/+1': 1 } })
      .seat(1)
      .build();
    g.act(0)
      .activate('bear')
      .targets([{ player: 1 }]);
    g.passAll();
    g.expect.counters('bear', {});
    g.expect.life(1, 39);
    g.expect.pt('bear', 2, 2);
    g.expect.invariants();
  });
});

describe('"When ~ enters, attach it to target creature you control" (CR 701.3, 301.5)', () => {
  const BLADE = parsed(
    'SYNTHETIC Parsed Cleaver',
    'Artifact — Equipment',
    'When ~ enters, attach it to target creature you control.\nEquipped creature gets +2/+2.\nEquip {3}',
    { manaCost: '{1}' },
  );

  test('the parsed trigger attaches this permanent to the chosen target', () => {
    expect(BLADE.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
          },
        },
      ],
      effect: { kind: 'attach', object: { kind: 'this' }, to: { kind: 'target', id: 't1' } },
    });
  });

  test('cast, it enters, its trigger attaches it to my creature: +2/+2 at once', () => {
    const g = scenario()
      .define(BLADE)
      .seat(0)
      .hand(BLADE.name)
      .battlefield('Mountain')
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(BEARS, { label: 'other' })
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .build();
    g.act(0).cast(BLADE.name, { pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('mine');
    g.passAll();
    g.expect.attached(BLADE.name, 'mine');
    g.expect.pt('mine', 4, 4);
    g.expect.pt('other', 2, 2);
    g.expect.pt('theirs', 2, 2);
    g.expect.invariants();
  });

  test("only a creature I control is a legal target (the opponent's Bears is not)", () => {
    const g = scenario()
      .define(BLADE)
      .seat(0)
      .hand(BLADE.name)
      .battlefield('Mountain')
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(BEARS, { label: 'other' })
      .seat(1)
      .battlefield(BEARS, { label: 'theirs' })
      .build();
    g.act(0).cast(BLADE.name, { pay: true });
    g.passAll();
    const refused = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('theirs'), specId: 't1' }],
    });
    expect(refused.ok).toBe(false);
  });
});

describe('"~" as the object of an effect: untap, return, exile, put on top of a library', () => {
  const UNTAPPER = creature('SYNTHETIC Parsed Untapper', '{3}: Untap ~.', '{1}{G}');
  const BOUNCER = creature(
    'SYNTHETIC Parsed Bouncer',
    "{W}: Return ~ to its owner's hand.",
    '{1}{W}',
  );
  const VANISH = sorcery('SYNTHETIC Parsed Vanish', 'Draw a card. Exile ~.', '{1}{W}');
  const LOOPER = creature(
    'SYNTHETIC Parsed Looper',
    "{T}: Draw a card, then put ~ on top of its owner's library.",
    '{1}{U}',
  );

  test('the parsed effects name this permanent (an ability) or this spell (the spell text)', () => {
    expect(UNTAPPER.faces[0]?.abilities).toMatchObject([
      { kind: 'activated', effect: { kind: 'untap', objects: { kind: 'this' } } },
    ]);
    expect(BOUNCER.faces[0]?.abilities).toMatchObject([
      { kind: 'activated', effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'hand' } },
    ]);
    expect(VANISH.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: 1 },
        { kind: 'exile', objects: { kind: 'thisSpell' } },
      ],
    });
    expect(LOOPER.faces[0]?.abilities).toMatchObject([
      {
        kind: 'activated',
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw' },
            { kind: 'moveToZone', objects: { kind: 'this' }, to: 'library', position: 'top' },
          ],
        },
      },
    ]);
  });

  test('"{3}: Untap ~." untaps the tapped permanent', () => {
    const g = scenario()
      .define(UNTAPPER)
      .seat(0)
      .battlefield(UNTAPPER.name, { label: 'bear', tapped: true })
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.expect.tapped('bear', true);
    g.act(0).activate('bear', { pay: true });
    g.passAll();
    g.expect.tapped('bear', false);
    g.expect.invariants();
  });

  test('"{W}: Return ~ to its owner\'s hand." puts it in its owner\'s hand', () => {
    const g = scenario()
      .define(BOUNCER)
      .seat(0)
      .battlefield(BOUNCER.name, { label: 'bear' })
      .battlefield('Plains')
      .seat(1)
      .build();
    g.act(0).activate('bear', { pay: true });
    g.passAll();
    g.expect.zone(BOUNCER.name, 'hand', { seat: 0, count: 1 });
    g.expect.noObject(BOUNCER.name, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('"Exile ~." ends a spell: it goes to exile, not to the graveyard (CR 608.2n)', () => {
    const g = scenario()
      .define(VANISH)
      .seat(0)
      .hand(VANISH.name)
      .battlefield('Plains', 'Plains')
      .library('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(VANISH.name, { pay: true });
    g.passAll();
    g.expect.zone(VANISH.name, 'exile', { seat: 0, count: 1 });
    g.expect.zone(VANISH.name, 'graveyard', { seat: 0, count: 0 });
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('"put ~ on top of its owner\'s library" after the draw: the next draw finds it', () => {
    const g = scenario()
      .define(LOOPER)
      .seat(0)
      .battlefield(LOOPER.name, { label: 'looper' })
      .library('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).activate('looper');
    g.passAll();
    g.expect.zone(LOOPER.name, 'library', { seat: 0, count: 1 });
    g.expect.handSize(0, 1);
    expect(g.state.seats[0]?.library[0]).toBeDefined();
    const top = g.state.seats[0]?.library[0];
    expect(top === undefined ? null : g.state.objects[top]?.card).toBe(
      g.find({ name: LOOPER.name })[0]?.card,
    );
    g.expect.invariants();
  });

  test('where the permanent is gone by the time the effect runs, nothing is lowered', () => {
    // A cost that sacrifices ~ and a "dies" trigger of ~ leave no permanent to act on.
    for (const [type, text] of [
      ['Creature — Bear', "Sacrifice ~: Return ~ to its owner's hand."],
      ['Creature — Bear', "When ~ dies, return ~ to its owner's hand."],
      ['Creature — Bear', 'Sacrifice ~: Untap ~.'],
    ] as const) {
      const imported = parseOnly(
        syntheticCard({
          name: 'SYNTHETIC Gone Bear',
          typeLine: type,
          oracleText: text.replaceAll('~', 'SYNTHETIC Gone Bear'),
          power: '1',
          toughness: '1',
          manaCost: '{1}',
        }),
      );
      expect(imported.support.status, text).toBe('unsupported');
      expect(imported.support.unparsed[0]?.reason, text).toBe('notRunnable');
    }
  });

  test('a spell cannot return or untap itself: only "Exile ~." is read for a spell', () => {
    const imported = parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Odd Spell',
        typeLine: 'Instant',
        oracleText: "Return SYNTHETIC Odd Spell to its owner's hand.",
        manaCost: '{1}',
      }),
    );
    expect(imported.support.status).toBe('unsupported');
  });
});

describe('imperative life ("you may gain 1 life", "and lose 1 life"), "up to one target", cards put on a library', () => {
  const SIPHON = enchantment(
    'SYNTHETIC Parsed Siphon',
    'Whenever another creature enters, you may gain 1 life.',
    '{1}{W}',
  );
  const PACT = sorcery('SYNTHETIC Parsed Pact', 'Draw two cards and lose 2 life.', '{1}{B}');
  const TINKER = creature(
    'SYNTHETIC Parsed Tinker Bear',
    'When ~ enters, destroy up to one target artifact or enchantment.',
  );
  const RECALL = parsed(
    'SYNTHETIC Parsed Recall Stone',
    'Artifact',
    '{1}{W}, {T}: Put target enchantment card from your graveyard on top of your library.',
    { manaCost: '{2}' },
  );

  test('"you may gain 1 life": the controller is asked on resolution (CR 603.5)', () => {
    expect(SIPHON.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { types: ['creature'], other: true } },
        optional: true,
        effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 1 },
      },
    ]);
    const build = () =>
      scenario()
        .define(SIPHON)
        .seat(0)
        .hand(BEARS)
        .battlefield(SIPHON.name, 'Forest', 'Forest')
        .seat(1)
        .build();
    const g = build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.life(0, 41);
    const h = build();
    h.act(0).cast(BEARS, { pay: true });
    h.passAll();
    h.act(0).decline();
    h.expect.life(0, 40);
  });

  test('"Draw two cards and lose 2 life.": the second clause has no subject of its own', () => {
    expect(PACT.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'draw', player: { kind: 'you' }, count: 2 },
        { kind: 'loseLife', player: { kind: 'you' }, amount: 2 },
      ],
    });
    const g = scenario()
      .define(PACT)
      .seat(0)
      .hand(PACT.name)
      .battlefield('Swamp', 'Swamp')
      .library('Forest', 'Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).cast(PACT.name, { pay: true });
    g.passAll();
    g.expect.life(0, 38);
    g.expect.handSize(0, 2);
  });

  test('"up to one target": zero or one chosen, the effect applies to what was chosen', () => {
    expect(TINKER.faces[0]?.abilities).toMatchObject([
      { kind: 'triggered', targets: [{ id: 't1', min: 0, max: 1 }] },
    ]);
    const build = () =>
      scenario()
        .define(TINKER)
        .seat(0)
        .hand(TINKER.name)
        .battlefield('Forest', 'Forest')
        .seat(1)
        .battlefield('Sol Ring')
        .build();
    const none = build();
    none.act(0).cast(TINKER.name, { pay: true });
    none.passAll();
    none.act(0).chooseTargets();
    none.passAll();
    none.expect.zone('Sol Ring', 'battlefield', { seat: 1 });

    const one = build();
    one.act(0).cast(TINKER.name, { pay: true });
    one.passAll();
    one.act(0).chooseTargets('Sol Ring');
    one.passAll();
    one.expect.zone('Sol Ring', 'graveyard', { seat: 1, count: 1 });
    one.expect.invariants();
  });

  test('a card from your graveyard goes on top of your library, and only the kind named', () => {
    const HUM = enchantment('SYNTHETIC Parsed Hum', 'You have no maximum hand size.', '{W}');
    expect(RECALL.faces[0]?.abilities).toMatchObject([
      {
        kind: 'activated',
        effect: {
          kind: 'moveToZone',
          objects: { kind: 'target', id: 't1' },
          to: 'library',
          position: 'top',
        },
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', types: ['enchantment'], controller: 'you' },
            },
          },
        ],
      },
    ]);
    const g = scenario()
      .define(RECALL)
      .define(HUM)
      .seat(0)
      .battlefield(RECALL.name, 'Plains', 'Plains')
      .graveyard(HUM.name, BEARS)
      .library('Forest', 'Forest')
      .seat(1)
      .build();
    g.act(0).activate(RECALL.name);
    g.expect.pending('targets', 0);
    const refused = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [
        {
          kind: 'object',
          id: g.id({ name: BEARS, zone: 'graveyard' }),
          specId: 't1',
        },
      ],
    });
    expect(refused.ok).toBe(false);
    g.act(0).chooseTargets(HUM.name);
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(HUM.name, 'library', { seat: 0, count: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0, count: 1 });
    const top = g.state.seats[0]?.library[0];
    expect(top === undefined ? null : g.state.objects[top]?.card).toBe(
      g.find({ name: HUM.name })[0]?.card,
    );
    g.expect.invariants();
  });
});

describe('"Enchant Forest": a basic land type is a subtype (CR 205.3i, 702.5a)', () => {
  const SPRAWL = parsed('SYNTHETIC Parsed Sprawl', 'Enchantment — Aura', 'Enchant Forest', {
    manaCost: '{1}',
  });

  test('the parsed keyword is the enchant filter of the subtype', () => {
    expect(SPRAWL.faces[0]?.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { subtypes: ['Forest'] } } },
    ]);
  });

  test('it can enchant a Forest, and is not castable with only a Mountain to enchant', () => {
    const g = scenario()
      .define(SPRAWL)
      .seat(0)
      .hand(SPRAWL.name)
      .battlefield('Forest', { label: 'wood' })
      .battlefield('Mountain', 'Island')
      .seat(1)
      .build();
    g.act(0).cast(SPRAWL.name, { targets: ['wood'], pay: true });
    g.passAll();
    g.expect.attached(SPRAWL.name, 'wood');

    const h = scenario()
      .define(SPRAWL)
      .seat(0)
      .hand(SPRAWL.name)
      .battlefield('Mountain', 'Island', 'Plains')
      .seat(1)
      .build();
    h.expect.illegal(0, { cast: SPRAWL.name });
  });
});
