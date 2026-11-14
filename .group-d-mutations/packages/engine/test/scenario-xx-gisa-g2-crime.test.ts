// "Whenever you commit a crime" (CR 700.13, D-464): a player commits a crime as they cast a spell, activate an ability or put a triggered ability on the stack and that spell or
// ability targets at least one opponent; at least one permanent, spell or ability an opponent controls; and/or at least one card in an opponent's graveyard. The event is
// `crimeCommitted`, made once for the spell or ability as its targets are chosen.
// Pins: CR 700.13 (Committing a crime), CR 601.2c, 602.2b, 603.3d (targets chosen as the spell is cast, the ability activated or the trigger put on the stack), CR 603.2 (a trigger),
// CR 707.10 (a copy is not cast), CR 603.2c (once for the object however many targets), CR 603.4 / 603.2 ("This ability triggers only once each turn"), CR 113.6b (an ability that
// works from the graveyard), CR 702.21a (Ward: the cost is paid as the ward ability resolves), CR 118.3, 119.4 (the life).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-gisa-g2.ts) or real fixtures (Lightning Bolt, Murder, Counterspell, Grizzly Bears).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WARLOCK = 'SYNTHETIC Crypt Warlock'; // {3}{B}{B} 4/4: Ward—{2}, Pay 2 life; Skeletons and Zombies you control get +1/+1 and have menace; a crime makes two Zombie Rogues (once a turn)
const DIGGER = 'SYNTHETIC Restless Digger'; // {B} 2/2 Skeleton Rogue: can't block; a crime: pay {B}, return this card from the graveyard to the battlefield
const NEEDLE = 'SYNTHETIC Needle Rogue'; // {T}: 1 damage to target creature
const STINGER = 'SYNTHETIC Entry Stinger'; // enters: 1 damage to target creature
const SCOUR = 'SYNTHETIC Grave Scour'; // {B} instant: exile target card from a graveyard
const TOKEN = 'Zombie Rogue';
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const COUNTER = 'Counterspell';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');
const crime = (seat: number) => ({ kind: 'crimeCommitted', seat });

describe('the cards are valid', () => {
  test.each([WARLOCK, DIGGER, NEEDLE, STINGER])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('the trigger names who commits the crime, relative to the controller', () => {
    const base = syntheticCard(DIGGER);
    const face = base.faces[0];
    const ability = face?.abilities[1];
    if (face === undefined || ability === undefined) throw new Error('no ability');
    const withWho = (who: unknown) => ({
      ...base,
      faces: [{ ...face, abilities: [{ ...ability, trigger: { kind: 'crimeCommitted', who } }] }],
    });
    expect(validateCard(withWho('opponent') as never)).toEqual([]);
    expect(validateCard(withWho('any') as never)).toEqual([]);
    expect(validateCard(withWho('me') as never).length).toBeGreaterThan(0);
  });
});

describe('what is a crime (CR 700.13)', () => {
  const game = () =>
    scenario()
      .define(syntheticCard(NEEDLE))
      .define(syntheticCard(STINGER))
      .define(syntheticCard(SCOUR))
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, MURDER, STINGER, SCOUR)
      .battlefield('Mountain', 'Mountain', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .battlefield(BEARS, { label: 'mine' })
      .battlefield(NEEDLE, { label: 'needle' })
      .graveyard('Llanowar Elves', { label: 'myCard' })
      .seat(1)
      .library(...LIBRARY)
      .hand(COUNTER)
      .battlefield('Island', 'Island')
      .battlefield('Giant Spider', { label: 'theirs' })
      .graveyard('Raging Goblin', { label: 'theirCard' })
      .at('precombatMain', { active: 0 })
      .build();

  test('a spell that targets an opponent is a crime', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    // A player is no object, so nothing "becomes the target" (ward and the like); the crime is made all the same.
    g.expect.eventLog([crime(0), { kind: 'spellCast', seat: 0 }]);
  });

  test('a spell that targets a permanent an opponent controls is a crime', () => {
    const g = game();
    g.act(0).cast(MURDER, { targets: ['theirs'], pay: true });
    g.expect.eventLog([crime(0)]);
  });

  test('a spell that targets a card in an opponent graveyard is a crime', () => {
    const g = game();
    g.act(0).cast(SCOUR, { targets: ['theirCard'], pay: true });
    g.expect.eventLog([crime(0)]);
  });

  test('a spell that targets you, your permanent or a card in your graveyard is not', () => {
    for (const [name, target] of [
      [BOLT, { player: 0 }],
      [BOLT, 'mine'],
      [SCOUR, 'myCard'],
    ] as const) {
      const g = game();
      g.act(0).cast(name, { targets: [target], pay: true });
      g.expect.noEvent({ kind: 'crimeCommitted' });
    }
  });

  test('a spell that targets an opposing spell: Counterspell on the spell of the player who is not the caster', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    const mark = g.mark();
    g.act(0).pass();
    g.act(1).cast(COUNTER, { targets: [BOLT], pay: true });
    expect(g.eventsSince(mark).filter((e) => e.kind === 'crimeCommitted')).toEqual([
      { kind: 'crimeCommitted', seat: 1, object: expect.any(String) },
    ]);
  });

  test('each spell is a crime of its own', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.act(0).cast(MURDER, { targets: ['theirs'], pay: true });
    expect(g.eventsSince(0).filter((e) => e.kind === 'crimeCommitted')).toHaveLength(2);
  });

  test('an activated ability that targets an opponent permanent is a crime, one that targets your own is not', () => {
    const g1 = game();
    g1.act(0).activate(NEEDLE, { targets: ['theirs'] });
    g1.expect.eventLog([{ kind: 'becameTarget' }, crime(0), { kind: 'abilityActivated', seat: 0 }]);
    const g2 = game();
    g2.act(0).activate(NEEDLE, { targets: ['mine'] });
    g2.expect.noEvent({ kind: 'crimeCommitted' });
  });

  test('a triggered ability put on the stack with such a target is a crime', () => {
    const g = game();
    g.act(0).cast(STINGER, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('theirs');
    g.expect.eventLog([{ kind: 'abilityTriggered', seat: 0 }, { kind: 'becameTarget' }, crime(0)]);
  });

  test('a triggered ability that targets your own creature is not', () => {
    const g = game();
    g.act(0).cast(STINGER, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('mine');
    g.expect.noEvent({ kind: 'crimeCommitted' });
  });

  test('the opponent targeting your permanent commits a crime of their own: Bolt cast by seat 1', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: ['mine'], pay: true });
    g.expect.eventLog([crime(1)]);
    g.expect.noEvent(crime(0));
  });
});

describe('"Whenever you commit a crime, create two tapped 2/2 blue and black Zombie Rogue creature tokens. This ability triggers only once each turn."', () => {
  const game = () =>
    scenario()
      .define(syntheticCard(WARLOCK))
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, MURDER)
      .battlefield('Mountain', 'Mountain', 'Swamp', 'Swamp', 'Swamp')
      .battlefield(WARLOCK)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Giant Spider', { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('a crime: two Zombie Rogue tokens enter tapped, as 2/2 blue and black Zombies', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${WARLOCK} (ability)`, BOLT]);
    g.passAll();
    g.expect.zone(TOKEN, 'battlefield', { seat: 0, count: 2 });
    for (const obj of g.find({ name: TOKEN, zone: 'battlefield', seat: 0 })) {
      expect(obj.tapped).toBe(true);
    }
    g.expect.derived(`${TOKEN}[0]`, { colors: ['U', 'B'], subtypes: ['Zombie', 'Rogue'] });
  });

  test('the Zombies get +1/+1 and menace from the lord; it is not a Zombie itself', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pt(`${TOKEN}[0]`, 3, 3);
    g.expect.pt(`${TOKEN}[1]`, 3, 3);
    g.expect.derived(`${TOKEN}[0]`, { keywords: ['menace'] });
    g.expect.pt(WARLOCK, 4, 4);
  });

  test('a second crime in the same turn makes no more tokens (once each turn)', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(TOKEN, 'battlefield', { seat: 0, count: 2 });
    g.act(0).cast(MURDER, { targets: ['theirs'], pay: true });
    g.expect.stack([MURDER]);
    g.passAll();
    g.expect.zone(TOKEN, 'battlefield', { seat: 0, count: 2 });
  });

  test('a spell that is no crime makes no tokens', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.noObject(TOKEN);
  });

  test("the opponent's crime does not trigger it", () => {
    const g = scenario()
      .define(syntheticCard(WARLOCK))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WARLOCK)
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.expect.noEvent({ kind: 'abilityTriggered', seat: 0, source: g.id(WARLOCK) });
  });
});

describe('"Ward—{2}, Pay 2 life." (CR 702.21a)', () => {
  const game = (life: number, mountains: number) =>
    scenario()
      .define(syntheticCard(WARLOCK))
      .seat(0)
      .library(...LIBRARY)
      .life(life)
      .hand(BOLT)
      .battlefield(...Array.from({ length: mountains }, () => 'Mountain'))
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WARLOCK)
      .at('precombatMain', { active: 0 })
      .build();

  test('the spell is countered unless its controller pays {2} and 2 life', () => {
    const g = game(40, 3);
    g.act(0).cast(BOLT, { targets: [WARLOCK], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.life(0, 38);
    g.act(0).payAuto();
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.damage(WARLOCK, 3);
  });

  test('without the mana the spell is countered at once and no life is paid', () => {
    const g = game(40, 1);
    g.act(0).cast(BOLT, { targets: [WARLOCK], pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('with 1 life the life cannot be paid, so the spell is countered', () => {
    const g = game(1, 3);
    g.act(0).cast(BOLT, { targets: [WARLOCK], pay: true });
    g.passAll();
    g.expect.life(0, 1);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });
});

describe('"Whenever you commit a crime, you may pay {B}. If you do, return this card from your graveyard to the battlefield."', () => {
  const game = (
    extra: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario> = (b) => b,
  ) =>
    extra(
      scenario()
        .define(syntheticCard(DIGGER))
        .seat(0)
        .library(...LIBRARY)
        .graveyard(DIGGER)
        .hand(BOLT)
        .battlefield('Mountain', 'Swamp', 'Swamp'),
    )
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Giant Spider', { label: 'theirs' })
      .at('precombatMain', { active: 0 })
      .build();

  test('a crime: paying {B} returns the card from the graveyard to the battlefield', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(DIGGER, 'battlefield', { seat: 0 });
    g.expect.noObject(DIGGER, { zone: 'graveyard' });
  });

  test('declining leaves it in the graveyard', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.zone(DIGGER, 'graveyard', { seat: 0 });
  });

  test('a spell that is no crime does not trigger it', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.zone(DIGGER, 'graveyard', { seat: 0 });
  });

  test('on the battlefield it does not trigger (the ability works from the graveyard only, CR 113.6b)', () => {
    const g = scenario()
      .define(syntheticCard(DIGGER))
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain', 'Swamp', DIGGER)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
  });

  test('the opponent crime does not return it', () => {
    const g = scenario()
      .define(syntheticCard(DIGGER))
      .seat(0)
      .library(...LIBRARY)
      .graveyard(DIGGER)
      .battlefield('Swamp')
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.expect.stack([BOLT]);
  });
});
