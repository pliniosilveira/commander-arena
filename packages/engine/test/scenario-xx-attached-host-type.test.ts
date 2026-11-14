// The host type of an "attached" static subject: "Enchanted creature gets +1/+1" on an Aura with
// `Enchant permanent` applies only while the permanent it is attached to is a creature.
// Pins: CR 303.4a and 702.5a (what an Aura may enchant is its enchant ability's business), CR
// 303.4m (the "enchanted [object]" an ability refers to is whatever the permanent is attached to),
// CR 301.5a (the "equipped creature"), CR 613.1f and 613.4c (layers 6 and 7c: keyword grants and
// "+N/+N"), CR 205.4 (supertypes are part of the type line). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-followups.ts).
import { describe, expect, test } from 'vitest';
import { GRANTABLE_KEYWORDS, getView } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const GROWTH = 'SYNTHETIC Growth Aura'; // Enchant permanent. Enchanted creature gets +1/+1.
const WARD = 'SYNTHETIC Land Ward Aura'; // Enchanted land has hexproof; enchanted creature +0/+1.
const LEGEND = 'SYNTHETIC Legend Aura'; // Enchanted legendary creature gets +2/+2.
const BEARS = 'Grizzly Bears'; // 2/2
const ISAMARU = 'Isamaru, Hound of Konda'; // legendary 2/2

const keywordsOn = (g: ScenarioGame, name: string): readonly string[] =>
  g.view(0).battlefield.find((o) => o.name === name)?.keywords ?? [];

describe('"Enchanted creature" on an Aura that can enchant any permanent', () => {
  test('a creature host gets the bonus', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(GROWTH, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.expect.attached(GROWTH, BEARS);
    g.expect.pt(BEARS, 3, 3);
  });

  test('a land host gets nothing, and the Aura stays on it (it may enchant a permanent)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Forest', BEARS)
      .battlefield(GROWTH, { attachedTo: 'Forest' })
      .seat(1)
      .build();
    g.expect.attached(GROWTH, 'Forest');
    // Neither the land nor the unrelated creature changed.
    g.expect.pt(BEARS, 2, 2);
    const forest = g.view(0).battlefield.find((o) => o.name === 'Forest');
    expect(forest?.power ?? null).toBeNull();
    expect(forest?.toughness ?? null).toBeNull();
    g.expect.invariants();
  });

  test('casting it at a land: the land is a legal target and the creature static does nothing', () => {
    const g = scenario()
      .seat(0)
      .hand(GROWTH)
      .battlefield('Forest', 'Forest', BEARS)
      .seat(1)
      .build();
    g.act(0).cast(GROWTH);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const legal = (d.specs[0]?.legal ?? []).flatMap((t) => (t.kind === 'object' ? [t.id] : []));
    expect(legal).toContain(g.id({ name: 'Forest', nth: 0 }));
    expect(legal).toContain(g.id(BEARS));
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', specId: 'enchant', id: g.id({ name: 'Forest', nth: 0 }) }],
    });
    g.act(0).payAuto();
    g.passAll();
    g.expect.attached(GROWTH, { name: 'Forest', nth: 0 });
    g.expect.pt(BEARS, 2, 2);
  });

  test('an Aura on a creature falls off with it: an enchant ability that names no type is still an Aura', () => {
    // The same Aura on the creature, then the creature leaves: the Aura falls off (CR 704.5m is
    // not applicable to an Enchant permanent Aura on a land, which stays legal).
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(GROWTH, { attachedTo: BEARS })
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island')
      .build();
    g.expect.pt(BEARS, 3, 3);
    g.pass();
    g.act(1).cast('Unsummon', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(GROWTH, 'graveyard', { seat: 0 });
  });
});

describe('each static ability of one Aura checks the host for itself', () => {
  test('on a land the land clause applies, on a creature the creature clause', () => {
    const onLand = scenario()
      .seat(0)
      .battlefield('Forest', BEARS)
      .battlefield(WARD, { attachedTo: 'Forest' })
      .seat(1)
      .build();
    expect(keywordsOn(onLand, 'Forest')).toContain('hexproof');
    onLand.expect.pt(BEARS, 2, 2);

    const onCreature = scenario()
      .seat(0)
      .battlefield('Forest', BEARS)
      .battlefield(WARD, { attachedTo: BEARS })
      .seat(1)
      .build();
    expect(keywordsOn(onCreature, BEARS)).not.toContain('hexproof');
    expect(keywordsOn(onCreature, 'Forest')).not.toContain('hexproof');
    onCreature.expect.pt(BEARS, 2, 3);
  });
});

describe('supertypes of the host ("Enchanted legendary creature")', () => {
  test('a legendary creature gets the bonus, an ordinary one does not', () => {
    const legendary = scenario()
      .seat(0)
      .battlefield(ISAMARU)
      .battlefield(LEGEND, { attachedTo: ISAMARU })
      .seat(1)
      .build();
    legendary.expect.pt(ISAMARU, 4, 4);

    const ordinary = scenario()
      .seat(0)
      .battlefield(BEARS)
      .battlefield(LEGEND, { attachedTo: BEARS })
      .seat(1)
      .build();
    ordinary.expect.pt(BEARS, 2, 2);
  });

  test('the view agrees with the derived characteristics', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ISAMARU)
      .battlefield(LEGEND, { attachedTo: ISAMARU })
      .seat(1)
      .build();
    const iso = getView(g.state, 0).battlefield.find((o) => o.name === ISAMARU);
    expect([iso?.power, iso?.toughness]).toEqual([4, 4]);
  });
});

describe('GRANTABLE_KEYWORDS is exported for the parser', () => {
  test('lists the keywords without parameters and not flash, ward or protection', () => {
    expect([...GRANTABLE_KEYWORDS].sort()).toEqual(
      [
        'flying',
        'trample',
        'haste',
        'vigilance',
        'lifelink',
        'deathtouch',
        'firstStrike',
        'doubleStrike',
        'menace',
        'reach',
        'hexproof',
        'shroud',
        'indestructible',
        'defender',
        'fear',
        'intimidate',
        'shadow',
        // D-110: read straight from the abilities left after layer 6.
        'infect',
        'wither',
        // D-120: read straight from the abilities by the blocker check.
        'skulk',
        // D-149: each instance granted is its own triggered ability (CR 702.83b, 702.108b).
        'exalted',
        'prowess',
        // D-185: riot, given to a group by a static ability and read as a permanent enters (an effect or an attached host cannot give it).
        'riot',
        // D-472, D-473: afflict and landwalk carry a number or a land type, checked by `checkGrantedParameter`.
        'afflict',
        'landwalk',
      ].sort(),
    );
    for (const excluded of ['flash', 'ward', 'protection', 'cycling', 'enchant', 'equip']) {
      expect(GRANTABLE_KEYWORDS).not.toContain(excluded);
    }
  });
});
