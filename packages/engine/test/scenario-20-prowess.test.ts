// Scenario 20 (SPEC 12): prowess.
// Pins: CR 702.108a (Prowess): a triggered ability, "Whenever you cast a noncreature spell, this
// creature gets +1/+1 until end of turn"; CR 603.2 / 603.3: it triggers as the spell is cast and
// goes on the stack above it (CR 601.2i: the spell is cast first), so it resolves first (CR 405.5,
// last in, first out); CR 603.3b: several triggers at once are ordered by their controller, and
// each noncreature spell cast is a separate trigger (CR 603.2c); CR 611.2a / 514.2: "until end of
// turn" ends in the cleanup step; CR 613.4c (Layer 7c): the bonus changes power and toughness.
// The card carries the `prowess` keyword; `derive` expands it into exactly that triggered ability
// (src/rules/derive-keywords.ts), so these tests pin the keyword, the trigger it stands for and its
// timing. Two instances trigger separately (CR 702.108b), and a creature that loses all abilities
// loses prowess (CR 613.1f).
// Cards: "SYNTHETIC Prowess Monk" (2/2 with that ability) and "SYNTHETIC Shock" (2 damage to target
// creature), both defined in this file, with real Lightning Bolt and Grizzly Bears.
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MONK = 'SYNTHETIC Prowess Monk';
const SHOCK = 'SYNTHETIC Shock';
const BOLT = 'Lightning Bolt';

const prowessMonk = singleFaceCard({
  name: MONK,
  manaCost: ['W'],
  types: ['creature'],
  subtypes: ['Monk'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 2,
  oracleText:
    'Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)',
  abilities: [{ kind: 'keyword', keyword: { kind: 'prowess' } }],
});

const TWIN = 'SYNTHETIC Twin Prowess Monk';
const twinMonk = singleFaceCard({
  name: TWIN,
  manaCost: ['1', 'W'],
  types: ['creature'],
  subtypes: ['Monk'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 2,
  oracleText: 'Prowess, prowess',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'prowess' } },
    { kind: 'keyword', keyword: { kind: 'prowess' } },
  ],
});

const HUSH = 'SYNTHETIC Hush One';
const hushOne = singleFaceCard({
  name: HUSH,
  manaCost: ['U'],
  types: ['instant'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText: 'Target creature loses all abilities until end of turn.',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: {
      kind: 'loseAllAbilities',
      objects: { kind: 'target', id: 't1' },
      duration: 'untilEndOfTurn',
    },
  },
});

const shock = singleFaceCard({
  name: SHOCK,
  manaCost: ['R'],
  types: ['instant'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'Deals 2 damage to target creature.',
  spell: {
    targets: [
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } },
    ],
    effect: { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't1' } },
  },
});

const PROWESS_ABILITY = `${MONK} (ability)`;

function board() {
  return scenario()
    .seat(0)
    .hand(BOLT, { label: 'bolt1' })
    .hand(BOLT, { label: 'bolt2' })
    .hand('Grizzly Bears', SHOCK)
    .battlefield('Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest')
    .battlefield(MONK)
    .define(prowessMonk)
    .define(shock)
    .seat(1)
    .battlefield('Mountain')
    .hand(BOLT)
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .build();
}

describe('SPEC scenario 20: prowess (CR 702.108a)', () => {
  test('casting a noncreature spell triggers it, above the spell on the stack', () => {
    const g = board();
    g.expect.pt(MONK, 2, 2);
    g.act(0).cast('bolt1', { targets: [{ player: 1 }], pay: true });
    g.expect.stack([PROWESS_ABILITY, BOLT]);
    // Nothing has resolved yet: the trigger doesn't change the monk until it resolves.
    g.expect.pt(MONK, 2, 2);
  });

  test('the trigger resolves before the spell, and the monk is 3/3 until end of turn', () => {
    const g = board();
    g.act(0).cast('bolt1', { targets: [{ player: 1 }], pay: true });
    const mark = g.mark();
    g.pass();
    g.pass();
    // The trigger resolved; the Bolt is still on the stack and has dealt no damage.
    g.expect.pt(MONK, 3, 3);
    g.expect.stack([BOLT]);
    g.expect.life(1, 40);
    g.expect.noEvent({ kind: 'damageDealt' }, { since: mark });
    g.act(0).pass();
    g.act(1).pass();
    g.expect.life(1, 37);
    g.expect.pt(MONK, 3, 3);
    g.expect.stack([]);
  });

  test('"before the spell" matters: 2 damage to the monk itself does not kill it', () => {
    const g = board();
    g.act(0).cast(SHOCK, { targets: [MONK], pay: true });
    g.expect.stack([PROWESS_ABILITY, SHOCK]);
    g.passAll();
    // 2 damage on a 3/3 (after prowess resolved first) is not lethal; on a 2/2 it would be.
    g.expect.zone(MONK, 'battlefield', { seat: 0 });
    g.expect.damage(MONK, 2);
    g.expect.pt(MONK, 3, 3);
  });

  test('each noncreature spell is a separate trigger: two spells give +2/+2', () => {
    const g = board();
    g.act(0).cast('bolt1', { targets: [{ player: 1 }], pay: true });
    g.act(0).cast('bolt2', { targets: [{ player: 1 }], pay: true });
    g.expect.stack([PROWESS_ABILITY, BOLT, PROWESS_ABILITY, BOLT]);
    g.passAll();
    g.expect.pt(MONK, 4, 4);
    g.expect.life(1, 34);
  });

  test('a creature spell does not trigger it', () => {
    const g = board();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.expect.stack(['Grizzly Bears']);
    g.passAll();
    g.expect.pt(MONK, 2, 2);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });

  test('an opponent\'s noncreature spell does not trigger it ("you cast")', () => {
    const g = board();
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.pt(MONK, 2, 2);
  });

  test('playing a land is not casting a spell: no trigger', () => {
    const g = scenario()
      .seat(0)
      .hand('Forest')
      .battlefield(MONK)
      .define(prowessMonk)
      .seat(1)
      .build();
    g.act(0).playLand('Forest');
    g.expect.stack([]);
    g.expect.pt(MONK, 2, 2);
  });

  test('the bonus lasts until end of turn and then the monk is a 2/2 again (CR 514.2)', () => {
    const g = board();
    g.act(0).cast('bolt1', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pt(MONK, 3, 3);
    advanceToNextTurn(g);
    g.expect.pt(MONK, 2, 2);
  });
});

function advanceToNextTurn(g: ScenarioGame) {
  g.advanceTo('upkeep', { turn: 4 });
}

describe('prowess as a keyword (CR 702.108a, 702.108b)', () => {
  test('the creature has the keyword, and the triggered ability it means after its printed abilities', () => {
    const g = board();
    g.expect.derived(MONK, { keywords: ['prowess'] });
    const abilities = derive(g.state, g.object(MONK)).abilities;
    expect(abilities.map((a) => a.kind)).toEqual(['keyword', 'triggered']);
  });

  test('two instances trigger separately: one spell, two triggers, +2/+2', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(TWIN)
      .define(twinMonk)
      .seat(1)
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${TWIN} (ability)`, `${TWIN} (ability)`, BOLT]);
    g.passAll();
    g.expect.pt(TWIN, 4, 4);
    g.expect.life(1, 37);
  });

  test('a creature that lost all abilities has lost prowess: no trigger (CR 613.1f)', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(MONK)
      .define(prowessMonk)
      .define(hushOne)
      .seat(1)
      .hand(HUSH)
      .battlefield('Island')
      .build();
    g.act(0).pass();
    g.act(1).cast(HUSH, { targets: [MONK], pay: true });
    g.passAll();
    g.expect.derived(MONK, { keywords: [] });
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
    g.passAll();
    g.expect.pt(MONK, 2, 2);
  });
});
