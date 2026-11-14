// Tokens (CR 111) and the Treasure token (CR 111.10a).
// Pins: CR 111.1 and 111.2 (the creator owns the token, it enters under their control), CR 111.7
// and 704.5d (a token in a zone other than the battlefield ceases to exist, after triggers that
// look at it), CR 111.10a (Treasure: "{T}, Sacrifice this token: Add one mana of any color"),
// CR 605 (mana abilities), CR 701.21 (sacrifice as a cost), CR 106.
// All cards are SYNTHETIC except the real fixtures named (see src/cards/fixtures).
import { describe, expect, test } from 'vitest';
import { TOKEN_PRESETS } from '../src/index';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

describe('creating tokens (CR 111)', () => {
  test('a spell creates two Treasures: artifact tokens owned and controlled by the caster', () => {
    const g = scenario().seat(0).hand('SYNTHETIC Make Treasures').pool('CR').seat(1).build();
    g.act(0).cast('SYNTHETIC Make Treasures', { pay: true });
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
    for (const t of g.find({ name: 'Treasure' })) {
      expect(t.token).not.toBeNull();
      expect(t.owner).toBe(0);
      expect(t.controller).toBe(0);
      expect(t.card).toBeNull();
      expect(t.tapped).toBe(false);
      const d = derive(g.state, t);
      expect(d.types).toEqual(['artifact']);
      expect(d.subtypes).toEqual(['Treasure']);
      expect(d.colors).toEqual([]);
    }
    expect(new Set(g.find({ name: 'Treasure' }).map((t) => t.id)).size).toBe(2);
    g.expect.eventLog([{ kind: 'tokenCreated', seat: 0, name: 'Treasure' }]);
    g.expect.invariants();
  });

  test('a token has the characteristics its effect defines (a 1/1 white Soldier)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Landfall Tokenmaker')
      .hand('Forest')
      .seat(1)
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    const soldier = g.object('Soldier');
    const d = derive(g.state, soldier);
    expect([d.power, d.toughness]).toEqual([1, 1]);
    expect(d.colors).toEqual(['W']);
    expect(d.types).toEqual(['creature']);
    expect(d.subtypes).toEqual(['Soldier']);
    // Summoning sick like any creature that came under its controller's control this turn.
    expect(g.view(0).battlefield.find((o) => o.id === soldier.id)?.summoningSick).toBe(true);
    expect(g.view(0).battlefield.find((o) => o.id === soldier.id)?.isToken).toBe(true);
    expect(g.view(0).battlefield.find((o) => o.id === soldier.id)?.tokenDefinition).toMatchObject({
      name: 'Soldier',
      power: 1,
      toughness: 1,
      colors: ['W'],
    });
  });

  test('a land that creates a Treasure when it enters (CR 111.2)', () => {
    const g = scenario().seat(0).hand('SYNTHETIC Treasure Land').seat(1).build();
    g.act(0).playLand('SYNTHETIC Treasure Land');
    g.passAll();
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
  });
});

describe('a token that leaves the battlefield ceases to exist (CR 111.7, 704.5d)', () => {
  test('a creature token destroyed is gone from every zone, after it died (CR 700.4)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Landfall Tokenmaker', 'SYNTHETIC Mourner')
      .hand('Forest')
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    g.expect.zone('Soldier', 'battlefield', { seat: 0 });
    g.pass();
    g.act(1).cast('Murder', { targets: [{ name: 'Soldier' }], pay: true });
    g.passAll();
    g.expect.noObject('Soldier');
    g.expect.eventLog([{ kind: 'died' }]);
    // The Mourner saw the token die before it ceased to exist.
    g.expect.life(0, 41);
    g.expect.invariants();
  });

  test('a Treasure sacrificed for mana leaves nothing behind in the graveyard', () => {
    const g = scenario().seat(0).hand('SYNTHETIC Make Treasures').pool('CR').seat(1).build();
    g.act(0).cast('SYNTHETIC Make Treasures', { pay: true });
    g.passAll();
    g.act(0).tapForMana({ name: 'Treasure', nth: 0 }, { color: 'G' });
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    // Only the sorcery is in the graveyard: the sacrificed token ceased to exist (CR 111.7).
    expect(g.state.seats[0]?.graveyard).toHaveLength(1);
    expect(Object.values(g.state.objects).filter((o) => o.token !== null)).toHaveLength(1);
  });
});

describe('token details', () => {
  test("a token bounced to its owner's hand ceases to exist instead (CR 111.7)", () => {
    const g = scenario()
      .seat(0)
      .battlefield('SYNTHETIC Landfall Tokenmaker')
      .hand('Forest')
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island')
      .build();
    g.act(0).playLand('Forest');
    g.passAll();
    g.pass();
    g.act(1).cast('Unsummon', { targets: [{ name: 'Soldier' }], pay: true });
    g.passAll();
    g.expect.noObject('Soldier');
    g.expect.handSize(0, 0);
    g.expect.handSize(1, 0);
    expect(Object.values(g.state.objects).filter((o) => o.token !== null)).toHaveLength(0);
  });

  test('"enters tapped" and "enters with counters" of a token apply as it enters (CR 614.12)', () => {
    const maker = singleFaceCard({
      name: 'SYNTHETIC Odd Token Maker',
      manaCost: null,
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'Create a tapped 0/0 Construct token with two +1/+1 counters on it.',
      spell: {
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: {
              name: 'Construct',
              manaCost: null,
              supertypes: [],
              types: ['artifact', 'creature'],
              subtypes: ['Construct'],
              colors: [],
              power: 0,
              toughness: 0,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [
                { kind: 'replacement', replacement: { kind: 'entersTapped' } },
                {
                  kind: 'replacement',
                  replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 2 },
                },
              ],
            },
          },
        },
      },
    });
    const g = scenario().define(maker).seat(0).hand('SYNTHETIC Odd Token Maker').seat(1).build();
    g.act(0).cast('SYNTHETIC Odd Token Maker');
    g.passAll();
    g.expect.tapped('Construct', true);
    g.expect.counters('Construct', { '+1/+1': 2 });
    const d = derive(g.state, g.object('Construct'));
    expect([d.power, d.toughness]).toEqual([2, 2]);
    expect(
      g.view(0).battlefield.find((o) => o.name === 'Construct')?.tokenDefinition,
    ).toMatchObject({
      power: 0,
      toughness: 0,
    });
  });

  test('a 0/0 token with no counters dies at once (CR 704.5f) and triggers "dies"', () => {
    const maker = singleFaceCard({
      name: 'SYNTHETIC Doomed Token Maker',
      manaCost: null,
      types: ['sorcery'],
      colors: [],
      colorIdentity: [],
      oracleText: 'Create a 0/0 Wisp token.',
      spell: {
        effect: {
          kind: 'createToken',
          count: 1,
          token: {
            kind: 'custom',
            definition: {
              name: 'Wisp',
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Wisp'],
              colors: [],
              power: 0,
              toughness: 0,
              loyalty: null,
              defense: null,
              oracleText: '',
              abilities: [],
            },
          },
        },
      },
    });
    const g = scenario()
      .define(maker)
      .seat(0)
      .hand('SYNTHETIC Doomed Token Maker')
      .battlefield('SYNTHETIC Mourner')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Doomed Token Maker');
    g.pass();
    g.pass();
    g.expect.noObject('Wisp');
    g.expect.stack(['SYNTHETIC Mourner (ability)']);
  });
});

describe('Treasure: {T}, Sacrifice this token: Add one mana of any color (CR 111.10a)', () => {
  const withTreasure = (extra?: (b: ReturnType<typeof scenario>) => void) => {
    const b = scenario().seat(0).hand('SYNTHETIC Make Treasures').pool('CR').seat(1);
    extra?.(b);
    const g = b.build();
    g.act(0).cast('SYNTHETIC Make Treasures', { pay: true });
    g.passAll();
    return g;
  };

  test('tapping it for mana sacrifices it and adds one mana of the chosen color', () => {
    const g = withTreasure();
    const before = g.mark();
    g.act(0).tapForMana({ name: 'Treasure', nth: 0 }, { color: 'U' });
    g.expect.pool(0, 'U');
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    // Tapped, then sacrificed; the sacrifice is an event like any other (Korvold-like triggers).
    // The costs are paid first (CR 605.3b), then the mana is added.
    g.expect.eventLog(
      [
        { kind: 'tapped' },
        { kind: 'zoneChanged', fromZone: 'battlefield', toZone: 'graveyard' },
        { kind: 'sacrificed', controller: 0 },
        { kind: 'manaAdded', seat: 0, count: 1 },
      ],
      { since: before },
    );
    g.expect.invariants();
  });

  test('every color is on offer, and the mana is not tied to any land', () => {
    const g = withTreasure();
    const options = g
      .legalActions(0)
      .filter((a) => a.kind === 'activateAbility')
      .map((a) => (a.kind === 'activateAbility' ? a.color : null));
    expect(new Set(options)).toEqual(new Set(['W', 'U', 'B', 'R', 'G']));
  });

  test('a Treasure triggers "whenever you sacrifice a permanent" when it is sacrificed for mana', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Make Treasures')
      .pool('CR')
      .battlefield('SYNTHETIC Sacrifice Lifegainer')
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Make Treasures', { pay: true });
    g.passAll();
    g.act(0).tapForMana({ name: 'Treasure', nth: 0 }, { color: 'U' });
    g.expect.stack(['SYNTHETIC Sacrifice Lifegainer (ability)']);
  });

  test('automatic payment uses lands before a Treasure (SPEC 10)', () => {
    const g = withTreasure((b) => b.seat(0).hand('Lightning Bolt').battlefield('Mountain'));
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
    g.expect.tapped('Mountain', true);
  });

  test('automatic payment sacrifices a Treasure when nothing else can pay', () => {
    const g = withTreasure((b) => b.seat(0).hand('Lightning Bolt'));
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('manual payment may tap a Treasure, and it is sacrificed', () => {
    const g = withTreasure((b) => b.seat(0).hand('Lightning Bolt'));
    const h = g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }] });
    h.payManual([{ source: { name: 'Treasure', nth: 0 }, color: 'R' }]);
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 1 });
    g.expect.stack(['Lightning Bolt']);
  });

  test('a Treasure that is never used stays on the battlefield', () => {
    const g = withTreasure();
    g.advanceTo('end');
    g.expect.zone('Treasure', 'battlefield', { seat: 0, count: 2 });
  });

  test('each Treasure is used once: tapping both leaves none', () => {
    const g = withTreasure();
    g.act(0).tapForMana({ name: 'Treasure', nth: 0 }, { color: 'R' });
    g.act(0).tapForMana({ name: 'Treasure', nth: 0 }, { color: 'R' });
    g.expect.noObject('Treasure');
    g.expect.pool(0, 'RR');
  });

  test('the opponent cannot use my Treasure', () => {
    const g = withTreasure();
    g.pass();
    const r = g.act(1).try.tapForMana({ name: 'Treasure', seat: 0, nth: 0 });
    expect(r.ok).toBe(false);
  });
});

describe('predefined tokens (CR 111.10)', () => {
  test('the Treasure preset is the definition in CR 111.10a', () => {
    const t = TOKEN_PRESETS.Treasure;
    expect(t.name).toBe('Treasure');
    expect(t.types).toEqual(['artifact']);
    expect(t.subtypes).toEqual(['Treasure']);
    expect(t.colors).toEqual([]);
    expect(t.abilities).toEqual([
      {
        kind: 'mana',
        cost: [{ kind: 'tap' }, { kind: 'sacrifice', what: { kind: 'this' } }],
        production: { kind: 'anyColor' },
      },
    ]);
  });
});
