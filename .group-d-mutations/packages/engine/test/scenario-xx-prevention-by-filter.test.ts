// "Prevent all combat damage that would be dealt this turn by non-Spider creatures." (D-145): a prevention shield for the damage dealt by
// every source a filter matches (`preventDamage.byFilter`), with the creatures a spell makes: "Create X Spider tokens, where X is the
// number of creatures attacking you."
// Pins: CR 615.1 (a prevention effect watches for damage that would be dealt), CR 609.7a (a prevention effect for a source), CR 611.2c (a
// prevention effect changes the rules of the game: what it covers is read as damage would be dealt), CR 615.6 (prevented damage is never
// dealt), CR 506.4 and 508.1b (creatures attacking you), CR 514.2 (until end of turn).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-prevention-by.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import type { GameEvent } from '../src/index';
import { syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const FOG = 'SYNTHETIC Spider Fog';
const BIG_FOG = 'SYNTHETIC Big Fog';
const THEIR_FOG = 'SYNTHETIC Their Fog';
const BEARS = 'Grizzly Bears'; // 2/2
const ELF = 'SYNTHETIC Elf 5/2'; // power 5
const V33 = 'SYNTHETIC Vanilla 3/3';
const BOLT = 'Lightning Bolt';

const dealt = (events: readonly GameEvent[]) => events.filter((e) => e.kind === 'damageDealt');
const prevented = (events: readonly GameEvent[]) =>
  events.filter((e) => e.kind === 'damagePrevented');

/** Seat 0 attacks with `attackers`; seat 1 (the defender) has priority in the declare attackers step. */
function defenderWindow(g: ScenarioGame, attackers: readonly string[]): void {
  g.advanceTo('declareAttackers');
  g.act(0).attack(attackers);
  g.act(0).pass();
}

const spiders = (g: ScenarioGame) => g.find({ name: 'Spider', zone: 'battlefield' });

describe('the cards are valid', () => {
  test.each([FOG, BIG_FOG, THEIR_FOG])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('"Create X Spider tokens, where X is the number of creatures attacking you. Prevent all combat damage ... by non-Spider creatures."', () => {
  function fogged(attackers: readonly string[], blocks: boolean) {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(...attackers)
      .library('Island', 'Island', 'Island')
      .seat(1)
      .life(20)
      .hand(FOG)
      .battlefield('Forest', 'Forest', 'Forest')
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    defenderWindow(g, attackers);
    g.act(1).cast(FOG, { pay: true });
    g.passAll();
    if (blocks) {
      g.advanceTo('declareBlockers');
    }
    return g;
  }

  test('one Spider for each attacker', () => {
    const g = fogged([BEARS, ELF, V33], false);
    expect(spiders(g)).toHaveLength(3);
  });

  test('the attackers deal no combat damage to the player', () => {
    const g = fogged([BEARS, ELF, V33], false);
    const mark = g.mark();
    g.advanceTo('endOfCombat');
    g.expect.life(1, 20);
    expect(dealt(g.eventsSince(mark))).toHaveLength(0);
    expect(prevented(g.eventsSince(mark)).length).toBeGreaterThan(0);
  });

  test('the Spiders are not covered: a Spider that blocks deals its damage, and takes none', () => {
    const g = fogged([BEARS], true);
    expect(g.state.pending?.kind).toBe('declareBlockers');
    const spider = spiders(g)[0];
    expect(spider).toBeDefined();
    g.act(1).declareBlockers([{ blocker: g.id(spider?.id ?? ''), attacker: BEARS }]);
    g.advanceTo('endOfCombat');
    g.expect.damage(BEARS, 1);
    expect((spider === undefined ? undefined : g.state.objects[spider.id])?.damage).toBe(0);
    g.expect.life(1, 20);
  });

  test('your own creatures are covered as well (every non-Spider creature)', () => {
    const g = scenario()
      .seat(1)
      .life(20)
      .hand(FOG)
      .battlefield('Forest', 'Forest', 'Forest')
      .battlefield(V33, { label: 'mine' })
      .library('Island', 'Island', 'Island')
      .seat(0)
      .battlefield(BEARS)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    defenderWindow(g, [BEARS]);
    g.act(1).cast(FOG, { pay: true });
    g.passAll();
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: 'mine', attacker: BEARS }]);
    g.advanceTo('endOfCombat');
    g.expect.damage(BEARS, 0);
    g.expect.damage('mine', 0);
  });

  test('X counts only creatures attacking you, not one that attacks a planeswalker you control', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS, ELF)
      .library('Island', 'Island', 'Island')
      .seat(1)
      .hand(FOG)
      .battlefield('Forest', 'Forest', 'Forest', 'SYNTHETIC Vanilla Planeswalker')
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).declareAttackers([
      { attacker: BEARS },
      { attacker: ELF, target: 'SYNTHETIC Vanilla Planeswalker' },
    ]);
    g.act(0).pass();
    g.act(1).cast(FOG, { pay: true });
    g.passAll();
    expect(spiders(g)).toHaveLength(1);
  });

  test('no attackers: no Spiders, and the shield still exists but prevents nothing', () => {
    const g = scenario()
      .seat(0)
      .library('Island', 'Island', 'Island')
      .seat(1)
      .hand(FOG)
      .battlefield('Forest', 'Forest', 'Forest')
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(FOG, { pay: true });
    g.passAll();
    expect(spiders(g)).toHaveLength(0);
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'preventDamage')).toHaveLength(
      1,
    );
  });

  test('it ends at the cleanup step (CR 514.2)', () => {
    const g = fogged([BEARS], false);
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.continuousEffects.filter((e) => e.change.kind === 'preventDamage')).toHaveLength(
      0,
    );
  });
});

describe('other filters and other damage', () => {
  test('creatures with power 4 or greater: the others still deal damage (CR 609.7a)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(ELF, V33)
      .seat(1)
      .life(20)
      .hand(BIG_FOG)
      .battlefield('Forest', 'Forest', 'Forest')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    defenderWindow(g, [ELF, V33]);
    g.act(1).cast(BIG_FOG, { pay: true });
    g.passAll();
    g.advanceTo('endOfCombat');
    // The 5/2 is prevented, the 3/3 connects.
    g.expect.life(1, 17);
  });

  test('the filter is read as damage would be dealt: a creature that grows past the line is covered (CR 611.2c)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(V33)
      .battlefield('SYNTHETIC Might Aura', { attachedTo: V33 })
      .seat(1)
      .life(20)
      .hand(BIG_FOG)
      .battlefield('Forest', 'Forest', 'Forest')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    // The 3/3 with the Aura is a 5/5: power 4 or greater, so its damage is prevented.
    defenderWindow(g, [V33]);
    g.act(1).cast(BIG_FOG, { pay: true });
    g.passAll();
    g.advanceTo('endOfCombat');
    g.expect.life(1, 20);
  });

  test('"by creatures you do not control" is relative to the controller of the spell, and covers noncombat damage too', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(BEARS)
      .hand(THEIR_FOG)
      .battlefield('Forest', 'Forest', 'Forest')
      .seat(1)
      .life(20)
      .battlefield(V33)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(THEIR_FOG, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack([BEARS]);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([{ blocker: V33, attacker: BEARS }]);
    g.advanceTo('endOfCombat');
    // The opponent's 3/3 deals no damage to my Bears; my Bears' 2 damage to their creature is not prevented.
    g.expect.damage(BEARS, 0);
    g.expect.damage(V33, 2);
  });

  test('damage from a spell is not dealt by a creature: a Bolt is not covered by a creature filter', () => {
    const g = scenario()
      .seat(1)
      .life(20)
      .hand(BOLT, FOG)
      .battlefield('Forest', 'Forest', 'Forest', 'Mountain')
      .seat(0)
      .battlefield(BEARS)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.act(1).cast(FOG, { pay: true });
    g.passAll();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});

describe('validation', () => {
  const withEffect = (e: object) =>
    ({
      ...syntheticCard(BIG_FOG),
      faces: [{ ...syntheticCard(BIG_FOG).faces[0], spell: { effect: e } }],
    }) as unknown as Parameters<typeof validateCard>[0];
  const shield = (extra: object) => ({
    kind: 'preventDamage',
    scope: 'combat',
    amount: 'all',
    to: { kind: 'any' },
    duration: 'untilEndOfTurn',
    ...extra,
  });

  test('a filter of the sources validates', () => {
    expect(validateCard(withEffect(shield({ byFilter: { types: ['creature'] } })))).toEqual([]);
  });

  test('a source named by "by" and by a filter is refused, and a filter outside the battlefield', () => {
    const both = validateCard(
      withEffect(shield({ by: { kind: 'this' }, byFilter: { types: ['creature'] } })),
    );
    expect(both.length).toBeGreaterThan(0);
    const zone = validateCard(withEffect(shield({ byFilter: { zone: 'graveyard' } })));
    expect(zone.length).toBeGreaterThan(0);
    expect(validateCard(withEffect(shield({ byFilter: null }))).length).toBeGreaterThan(0);
  });
});
