// Extractor Demon and Terastodon (the Plunder the Graves deck), read from their REAL Oracle text (the corpus's golden.jsonl) through the grammar with no override, defined in an engine
// scenario and played through applyAction, at 2, 3 and 4 seats.
// Pins: CR 701.17a (mill), CR 603.10a (leaves-the-battlefield triggers look back), CR 603.5 (an optional triggered ability is decided as it resolves), CR 701.8a (destroy), CR 608.2h
// (last-known information of an object that left), CR 111.2 (the player who creates a token controls it), CR 110.2 (controller and owner).
import type { CardDefinition } from '@commander-arena/engine';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const DEMON = real('Extractor Demon');
const TERA = real('Terastodon');
const ABILITIES = (card: CardDefinition) => card.faces[0]?.abilities ?? [];

const BEARS = 'Grizzly Bears';
const KILL = parsed('SYNTHETIC Parsed Kill', 'Sorcery', 'Destroy target creature.', {
  manaCost: '{B}',
  colors: ['B'],
});
const FILLER = Array.from({ length: 8 }, () => 'Swamp');
const FORESTS = Array.from({ length: 8 }, () => 'Forest');

describe('both cards are valid and read as supported', () => {
  test.each([DEMON, TERA])('$name passes validateCard', (card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Extractor Demon: a trigger of another creature leaving, with an optional mill of a target player', () => {
    expect(ABILITIES(DEMON)[1]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'leavesBattlefield' },
      targets: [{ what: { kind: 'player' } }],
      effect: { kind: 'mill' },
      optional: true,
    });
  });

  test('Terastodon: up to three targets, one optional question, a token for the controller of each permanent put into a graveyard', () => {
    expect(ABILITIES(TERA)[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield' },
      targets: [{ min: 0, max: 3 }],
      optional: true,
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'destroy' },
          {
            kind: 'createToken',
            count: 1,
            controller: { kind: 'controllerOf', of: { kind: 'putIntoGraveyardThisWay' } },
          },
        ],
      },
    });
  });
});

describe('Extractor Demon: "Whenever another creature leaves the battlefield, you may have target player mill two cards." (CR 603.10a, 701.17a)', () => {
  const start = (seats: 2 | 3 | 4) => {
    let b = scenario({ seats })
      .define(DEMON)
      .define(KILL)
      .seat(0)
      .battlefield(DEMON.name)
      .battlefield('Swamp')
      .hand(KILL.name)
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER);
    if (seats > 2) b = b.seat(2).library(...FILLER);
    if (seats > 3) b = b.seat(3).library(...FILLER);
    return b.at('precombatMain', { active: 0 }).build();
  };
  const killBears = (g: ReturnType<typeof start>) => {
    g.act(0).cast(KILL.name, { targets: [BEARS], pay: true });
    g.passAll();
  };

  test.each([2, 3, 4] as const)(
    'at %i seats: the controller may have any player mill two, the last opponent included',
    (seats) => {
      const g = start(seats);
      killBears(g);
      const victim = seats - 1;
      g.act(0).chooseTargets({ player: victim } as never);
      g.passAll();
      g.act(0).accept();
      g.passAll();
      // Two cards milled, and the Bears when the victim is their owner.
      expect(g.state.seats[victim]?.graveyard.length).toBe(victim === 1 ? 3 : 2);
      expect(g.state.seats[victim]?.library.length).toBe(6);
      expect(g.state.seats[0]?.library.length).toBe(8);
      g.expect.invariants();
    },
  );

  test('the controller may have themselves mill', () => {
    const g = start(2);
    killBears(g);
    g.act(0).chooseTargets({ player: 0 } as never);
    g.passAll();
    g.act(0).accept();
    g.passAll();
    expect(g.state.seats[0]?.library.length).toBe(6);
    expect(g.state.seats[1]?.library.length).toBe(8);
  });

  test('declining mills nothing (CR 603.5)', () => {
    const g = start(3);
    killBears(g);
    g.act(0).chooseTargets({ player: 2 } as never);
    g.passAll();
    g.act(0).decline();
    g.passAll();
    expect(g.state.seats[2]?.library.length).toBe(8);
    expect(g.state.seats[1]?.library.length).toBe(8);
  });

  test('the Demon leaving itself does not trigger it ("another")', () => {
    const g = scenario({ seats: 2 })
      .define(DEMON)
      .define(KILL)
      .seat(0)
      .battlefield(DEMON.name)
      .battlefield('Swamp')
      .hand(KILL.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(KILL.name, { targets: [DEMON.name], pay: true });
    g.passAll();
    g.expect.zone(DEMON.name, 'graveyard', { seat: 0 });
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('a creature of the controller leaving triggers it too', () => {
    const g = scenario({ seats: 2 })
      .define(DEMON)
      .define(KILL)
      .seat(0)
      .battlefield(DEMON.name, BEARS)
      .battlefield('Swamp')
      .hand(KILL.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(KILL.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 } as never);
    g.passAll();
    g.act(0).accept();
    g.passAll();
    expect(g.state.seats[1]?.library.length).toBe(6);
  });
});

describe('Terastodon: "you may destroy up to three target noncreature permanents. For each permanent put into a graveyard this way, its controller creates a 3/3 green Elephant creature token."', () => {
  const VAULT = parsed('SYNTHETIC Parsed Vault', 'Artifact', 'Indestructible');
  const EXILER = parsed(
    'SYNTHETIC Parsed Exiler',
    'Enchantment',
    'If a creature would die, exile it instead.',
  );
  // The same sentence as Terastodon's, after a destroy that is not optional and not a trigger.
  const CULL = parsed(
    'SYNTHETIC Parsed Cull',
    'Sorcery',
    'Destroy target creature. For each permanent put into a graveyard this way, its controller creates a 3/3 green Elephant creature token.',
    { manaCost: '{B}', colors: ['B'] },
  );
  const TREASURER = parsed('SYNTHETIC Parsed Treasurer', 'Sorcery', 'Create a Treasure token.', {
    manaCost: '{G}',
    colors: ['G'],
  });

  const base = (seats: 2 | 3 | 4) => {
    let b = scenario({ seats })
      .define(TERA)
      .define(VAULT)
      .define(EXILER)
      .define(CULL)
      .define(TREASURER)
      .seat(0)
      .hand(TERA.name)
      .battlefield(...FORESTS)
      .library(...FILLER);
    for (let seat = 1; seat < seats; seat += 1) b = b.seat(seat as 1 | 2 | 3).library(...FILLER);
    return b;
  };
  const cast = (g: ReturnType<ReturnType<typeof base>['build']>) => {
    g.act(0).cast(TERA.name, { pay: true });
    g.passAll();
  };
  const elephants = (g: ReturnType<ReturnType<typeof base>['build']>, seat: 0 | 1 | 2 | 3) =>
    g.find({ name: 'Elephant', zone: 'battlefield', seat }).length;

  test('destroys up to three noncreature permanents; each controller gets one Elephant for each of theirs (CR 111.2)', () => {
    const g = base(2)
      .seat(0)
      .battlefield('Sol Ring')
      .seat(1)
      .battlefield('Command Tower', 'Plains', BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    cast(g);
    g.act(0).chooseTargets('Sol Ring', 'Command Tower', 'Plains');
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 0 });
    g.expect.zone('Command Tower', 'graveyard', { seat: 1 });
    g.expect.zone('Plains', 'graveyard', { seat: 1 });
    expect(elephants(g, 0)).toBe(1);
    expect(elephants(g, 1)).toBe(2);
    // The Elephants are 3/3 green creatures.
    const token = g.find({ name: 'Elephant', zone: 'battlefield', seat: 1 })[0];
    expect(token).toBeDefined();
    if (token !== undefined) g.expect.pt(token.id as never, 3, 3);
    g.expect.invariants();
  });

  test.each([3, 4] as const)(
    'at %i seats: the permanents of every opponent give each of them their tokens',
    (seats) => {
      let b = base(seats).seat(0).battlefield('Sol Ring').seat(1).battlefield('Command Tower');
      b = b.seat(2).battlefield('Plains');
      if (seats > 3) b = b.seat(3).battlefield('Island');
      const g = b.at('precombatMain', { active: 0 }).build();
      cast(g);
      g.act(0).chooseTargets('Command Tower', 'Plains', seats > 3 ? 'Island' : 'Sol Ring');
      g.passAll();
      g.act(0).accept();
      g.passAll();
      expect(elephants(g, 1)).toBe(1);
      expect(elephants(g, 2)).toBe(1);
      if (seats > 3) {
        expect(elephants(g, 3)).toBe(1);
        expect(elephants(g, 0)).toBe(0);
      } else {
        expect(elephants(g, 0)).toBe(1);
      }
      g.expect.invariants();
    },
  );

  test('"up to": one target, or none, is fine', () => {
    const g = base(2)
      .seat(1)
      .battlefield('Command Tower', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();
    cast(g);
    g.act(0).chooseTargets('Plains');
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.zone('Plains', 'graveyard', { seat: 1 });
    g.expect.zone('Command Tower', 'battlefield', { seat: 1 });
    expect(elephants(g, 1)).toBe(1);
  });

  test('a creature is not a legal target (noncreature permanents only)', () => {
    const g = base(2).seat(1).battlefield(BEARS).at('precombatMain', { active: 0 }).build();
    cast(g);
    expect(() => g.act(0).chooseTargets(BEARS)).toThrow();
  });

  test('declining destroys nothing and makes no Elephants (CR 603.5)', () => {
    const g = base(2)
      .seat(1)
      .battlefield('Command Tower')
      .at('precombatMain', { active: 0 })
      .build();
    cast(g);
    g.act(0).chooseTargets('Command Tower');
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.zone('Command Tower', 'battlefield', { seat: 1 });
    expect(elephants(g, 0)).toBe(0);
    expect(elephants(g, 1)).toBe(0);
  });

  test('an indestructible permanent is not destroyed, so it gives no token (CR 701.8a, 702.12b)', () => {
    const g = base(2)
      .seat(1)
      .battlefield(VAULT.name, 'Command Tower')
      .at('precombatMain', { active: 0 })
      .build();
    cast(g);
    g.act(0).chooseTargets(VAULT.name, 'Command Tower');
    g.passAll();
    g.act(0).accept();
    g.passAll();
    g.expect.zone(VAULT.name, 'battlefield', { seat: 1 });
    g.expect.zone('Command Tower', 'graveyard', { seat: 1 });
    expect(elephants(g, 1)).toBe(1);
  });

  test('a creature that is exiled instead of dying was not put into a graveyard, so it gives no token (CR 701.8a, 614.1a)', () => {
    const g = base(2)
      .seat(0)
      .hand(CULL.name)
      .battlefield('Swamp')
      .seat(1)
      .battlefield(EXILER.name, BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(CULL.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    expect(elephants(g, 1)).toBe(0);
  });

  test('the same sentence after a plain destroy: a creature that dies gives its controller a token', () => {
    const g = base(2)
      .seat(0)
      .hand(CULL.name)
      .battlefield('Swamp')
      .seat(1)
      .battlefield(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(CULL.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(elephants(g, 1)).toBe(1);
  });

  test('the controller is read as the permanent left (CR 608.2h): a stolen permanent gives its token to its controller, not its owner', () => {
    const g = base(3)
      .seat(1)
      .battlefield('Sol Ring', { controller: 2 })
      .at('precombatMain', { active: 0 })
      .build();
    cast(g);
    g.act(0).chooseTargets('Sol Ring');
    g.passAll();
    g.act(0).accept();
    g.passAll();
    // A permanent goes to its owner's graveyard (CR 701.8a); its controller made the Elephant.
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    expect(elephants(g, 2)).toBe(1);
    expect(elephants(g, 1)).toBe(0);
  });

  test('a token that is destroyed was put into a graveyard, so its controller still gets an Elephant (CR 111.7)', () => {
    const g = base(2)
      .seat(0)
      .hand(TREASURER.name)
      .battlefield('Forest')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(TREASURER.name, { pay: true });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0 });
    cast(g);
    g.act(0).chooseTargets('Treasure');
    g.passAll();
    g.act(0).accept();
    g.passAll();
    expect(g.find({ name: 'Treasure', zone: 'battlefield' }).length).toBe(0);
    expect(elephants(g, 0)).toBe(1);
  });
});

describe('"for each permanent put into a graveyard this way" needs a destroy before it', () => {
  test('validateCard refuses the selector with no destroy effect before it', () => {
    const [ability] = ABILITIES(TERA);
    if (ability?.kind !== 'triggered' || ability.effect.kind !== 'sequence') {
      throw new Error('unexpected shape');
    }
    const [, tokens] = ability.effect.effects;
    const face = TERA.faces[0];
    if (tokens === undefined || face === undefined) throw new Error('unexpected shape');
    const broken: CardDefinition = {
      ...TERA,
      faces: [{ ...face, abilities: [{ ...ability, effect: tokens }] }],
    };
    expect(JSON.stringify(validateCard(broken))).toContain('putIntoGraveyardThisWay');
  });

  test.each([
    // An exile is no destroy: nothing says what "put into a graveyard this way" would be.
    'Exile target permanent. For each permanent put into a graveyard this way, its controller creates a 3/3 green Elephant creature token.',
    // A narrower noun would claim more than the engine checks.
    'Destroy target creature. For each creature put into a graveyard this way, its controller creates a 3/3 green Elephant creature token.',
  ])('is not read: %s', (text) => {
    const imported = parseOnly(
      syntheticCard({ name: 'SYNTHETIC Parsed Refused', typeLine: 'Sorcery', oracleText: text }),
    );
    expect(imported.support.status).toBe('unsupported');
  });
});
