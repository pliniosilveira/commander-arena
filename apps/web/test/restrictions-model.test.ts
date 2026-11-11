/**
 * Restrictions, requirements and evasion in the web (D-094, D-098) without a game: the chips an
 * object gets from the view, the creatures that must attack (CR 508.1d) starting chosen and
 * staying chosen, and the words that explain why a blocker cannot block an evasive attacker
 * (CR 509.1b).
 */
import type {
  Action,
  DeclareAttackersDecision,
  DeclareBlockersDecision,
  GameView,
  ObjectId,
  ObjectView,
  PendingDecision,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { chipsOf } from '../src/ui/board/keywords';
import { requiredAttacks, toggleAttacker } from '../src/ui/decisions/attack';
import { blockRefusals, blockRefusalText } from '../src/ui/decisions/block-reasons';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { dragSpec, resolveDrop } from '../src/ui/dnd/model';
import { lookupIndexFor } from './decisions-helpers';

const o = (n: number): ObjectId => `o${n}`;

function card(n: number, name: string, patch: Partial<ObjectView> = {}): ObjectView {
  return {
    id: o(n),
    name,
    controller: 0,
    owner: 0,
    types: ['creature'],
    supertypes: [],
    subtypes: [],
    colors: [],
    keywords: [],
    ...patch,
  } as unknown as ObjectView;
}

describe('chips', () => {
  test('keywords come first (a landwalk named for its land), restrictions after, marked apart', () => {
    const chips = chipsOf({
      keywords: ['flying', 'landwalk', 'fear'],
      landwalks: ['Island', 'nonbasic'],
      restrictions: ['cantBlock', 'attacksEachCombat'],
    });
    expect(chips.map((c) => [c.full, c.restriction])).toEqual([
      ['Flying', false],
      ['Islandwalk', false],
      ['Nonbasic landwalk', false],
      ['Fear', false],
      ["Can't block", true],
      ['Attacks each combat', true],
    ]);
  });

  test('every restriction has its own words and a landwalk without a type is just "Landwalk"', () => {
    const all = chipsOf({
      keywords: ['landwalk', 'intimidate', 'shadow'],
      restrictions: [
        'cantBlock',
        'cantBeBlocked',
        'attacksEachCombat',
        'doesntUntap',
        'cantBeCountered',
      ],
    });
    expect(all.map((c) => c.full)).toEqual([
      'Landwalk',
      'Intimidate',
      'Shadow',
      "Can't block",
      "Can't be blocked",
      'Attacks each combat',
      "Doesn't untap",
      "Can't be countered",
    ]);
    expect(new Set(all.map((c) => c.key)).size).toBe(all.length);
  });

  test('an object with none has none', () => {
    expect(chipsOf({ keywords: [] })).toEqual([]);
  });
});

describe('creatures that must attack', () => {
  const decision: DeclareAttackersDecision & PendingDecision = {
    id: 'd1',
    seat: 0,
    kind: 'declareAttackers',
    mustAttack: [o(2)],
    candidates: [
      { attacker: o(1), targets: [{ kind: 'player', seat: 1 }] },
      {
        attacker: o(2),
        targets: [
          { kind: 'player', seat: 1 },
          { kind: 'permanent', object: o(10) },
        ],
      },
    ],
  };

  test('they start chosen, at the default target', () => {
    expect(requiredAttacks(decision, null)).toEqual([
      { attacker: o(2), target: { kind: 'player', seat: 1 } },
    ]);
    expect(initialUi(decision).attacks).toEqual([
      { attacker: o(2), target: { kind: 'player', seat: 1 } },
    ]);
  });

  test('nothing is chosen when nothing is required', () => {
    expect(initialUi({ ...decision, mustAttack: [] }).attacks).toEqual([]);
  });

  test('a click does not take one out; another creature still toggles', () => {
    const start = requiredAttacks(decision, null);
    expect(toggleAttacker(start, decision.candidates, o(2), null, decision.mustAttack)).toEqual(
      start,
    );
    const both = toggleAttacker(start, decision.candidates, o(1), null, decision.mustAttack);
    expect(both.map((p) => p.attacker)).toEqual([o(2), o(1)]);
    expect(toggleAttacker(both, decision.candidates, o(1), null, decision.mustAttack)).toEqual(
      start,
    );
  });

  function harness() {
    const view = {
      viewer: 0,
      turn: 3,
      activeSeat: 0,
      step: 'declareAttackers',
      battlefield: [card(1, 'Grizzly Bears'), card(2, 'SYNTHETIC Berserker')],
      stack: [],
      exile: [],
      seats: [
        { id: 0, hand: [], graveyard: [], command: [], mulligans: 0 },
        { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
      ],
      pending: decision,
    } as unknown as GameView;
    const acts: Action[] = [];
    const said: string[] = [];
    let ui: UiState = initialUi(decision);
    const ctl: Controller = {
      act: (a) => acts.push(a),
      update: (change) => {
        ui = change(ui);
      },
      openChooser: () => {},
      explain: (m) => said.push(m),
    };
    return { model: () => buildModel(view, decision, ui, ctl), acts, said, ui: () => ui, view };
  }

  test('the model badges it "Must attack", explains a click on it and keeps it in the attack', () => {
    const h = harness();
    const m = h.model();
    expect(m.interaction.badge(o(2))).toBe('Must attack');
    expect(m.interaction.badge(o(1))).toBeNull();
    expect(m.bar.buttons[1]?.label).toBe('Declare attackers (1)');
    expect(m.bar.detail).toContain('SYNTHETIC Berserker must attack each combat if able.');
    m.interaction.onObject(o(2));
    expect(h.said).toEqual(['SYNTHETIC Berserker must attack each combat if able.']);
    expect(h.ui().attacks.map((p) => p.attacker)).toEqual([o(2)]);
    m.interaction.onObject(o(1));
    expect(h.model().bar.buttons[1]?.label).toBe('Declare attackers (2)');
    h.model().interaction.onObject(o(1));
    expect(h.model().bar.buttons[1]?.label).toBe('Declare attackers (1)');
    h.model().bar.buttons[1]?.run();
    expect(h.acts).toEqual([
      {
        kind: 'declareAttackers',
        attacks: [{ attacker: o(2), target: { kind: 'player', seat: 1 } }],
      },
    ]);
  });

  test('drag and drop: no "Remove from the attack" zone for it, and dropping elsewhere keeps it in', () => {
    const h = harness();
    const index = lookupIndexFor(h.view.battlefield);
    const must = dragSpec(decision, h.ui(), index, 0, o(2), 'permanent');
    expect(must?.zones.map((z) => z.label)).toEqual(['Attack Opponent', 'Attack a card']);
    const free = dragSpec(
      decision,
      {
        ...h.ui(),
        attacks: [...h.ui().attacks, { attacker: o(1), target: { kind: 'player', seat: 1 } }],
      },
      index,
      0,
      o(1),
      'permanent',
    );
    expect(free?.zones.map((z) => z.label)).toContain('Remove Grizzly Bears from the attack');
    // Dropping the required creature back on the battlefield does nothing (the zone is absent).
    const result = resolveDrop(decision, h.ui(), index, 0, o(2), 'permanent', {
      kind: 'battlefield',
    });
    expect(result.kind).toBe('none');
  });
});

describe('why a blocker cannot block', () => {
  const defending = [
    card(20, 'Island', { types: ['land'], subtypes: ['Island'], supertypes: ['basic'] }),
    card(21, 'SYNTHETIC Dual Land', { types: ['land'], subtypes: [] }),
  ];
  const redBlocker = card(5, 'SYNTHETIC Red Blocker', { colors: ['R'] });
  const blackBlocker = card(6, 'SYNTHETIC Black Blocker', { colors: ['B'] });
  const golem = card(7, 'SYNTHETIC Artifact Golem', { types: ['artifact', 'creature'] });

  test("can't be blocked", () => {
    const a = card(1, 'SYNTHETIC Unblockable Bear', { restrictions: ['cantBeBlocked'] });
    expect(blockRefusals(a, redBlocker, defending)).toEqual(["can't be blocked"]);
  });

  test('landwalk applies only when the defender controls that land', () => {
    const walker = card(1, 'SYNTHETIC Islandwalker', {
      keywords: ['landwalk'],
      landwalks: ['Island'],
    });
    expect(blockRefusals(walker, redBlocker, defending)).toEqual([
      'islandwalk: you control an Island',
    ]);
    expect(blockRefusals(walker, redBlocker, [defending[1] as ObjectView])).toEqual([]);
    const desert = card(2, 'SYNTHETIC Desertwalker', {
      keywords: ['landwalk'],
      landwalks: ['Desert'],
    });
    expect(blockRefusals(desert, redBlocker, defending)).toEqual([]);
    const nonbasic = card(3, 'SYNTHETIC Nonbasic Walker', {
      keywords: ['landwalk'],
      landwalks: ['nonbasic'],
    });
    expect(blockRefusals(nonbasic, redBlocker, defending)).toEqual([
      'nonbasic landwalk: you control a nonbasic land',
    ]);
  });

  test('fear lets artifact and black creatures block', () => {
    const fear = card(1, 'SYNTHETIC Fear Bear', { keywords: ['fear'], colors: ['B'] });
    expect(blockRefusals(fear, redBlocker, defending)).toEqual([
      'fear: only artifact or black creatures can block it',
    ]);
    expect(blockRefusals(fear, blackBlocker, defending)).toEqual([]);
    expect(blockRefusals(fear, golem, defending)).toEqual([]);
  });

  test('intimidate lets artifact creatures and creatures sharing a color block', () => {
    const bear = card(1, 'SYNTHETIC Intimidate Bear', { keywords: ['intimidate'], colors: ['R'] });
    expect(blockRefusals(bear, blackBlocker, defending)).toEqual([
      'intimidate: only artifact creatures and creatures that share a color can block it',
    ]);
    expect(blockRefusals(bear, redBlocker, defending)).toEqual([]);
    expect(blockRefusals(bear, golem, defending)).toEqual([]);
  });

  test('shadow works in both directions', () => {
    const shadow = card(1, 'SYNTHETIC Shadow Bear', { keywords: ['shadow'] });
    expect(blockRefusals(shadow, redBlocker, defending)).toEqual([
      'shadow: only creatures with shadow can block it',
    ]);
    const wall = card(2, 'SYNTHETIC Shadow Wall', { keywords: ['shadow'] });
    expect(blockRefusals(shadow, wall, defending)).toEqual([]);
    const plain = card(3, 'SYNTHETIC Red Blocker');
    expect(blockRefusals(plain, wall, defending)).toEqual([
      'shadow: a creature with shadow can block only creatures with shadow',
    ]);
  });

  test('evasion abilities add up, and a plain attacker has no reason', () => {
    const wraith = card(1, 'SYNTHETIC Dread Wraith', {
      keywords: ['flying', 'fear'],
      colors: ['B'],
      restrictions: ['cantBeBlocked'],
    });
    expect(blockRefusals(wraith, redBlocker, defending)).toEqual([
      "can't be blocked",
      'fear: only artifact or black creatures can block it',
    ]);
    expect(blockRefusals(card(2, 'Grizzly Bears'), redBlocker, defending)).toEqual([]);
  });

  test('the sentence names the blocker, each refused attacker and its reasons; silent with none', () => {
    const a = card(1, 'SYNTHETIC Unblockable Bear', { restrictions: ['cantBeBlocked'] });
    const b = card(2, 'SYNTHETIC Islandwalker', { keywords: ['landwalk'], landwalks: ['Island'] });
    const plain = card(3, 'Grizzly Bears');
    expect(
      blockRefusalText(redBlocker, [
        { attacker: a, reasons: blockRefusals(a, redBlocker, defending) },
        { attacker: b, reasons: blockRefusals(b, redBlocker, defending) },
        { attacker: plain, reasons: [] },
      ]),
    ).toBe(
      "SYNTHETIC Red Blocker can't block SYNTHETIC Unblockable Bear (can't be blocked) or SYNTHETIC Islandwalker (islandwalk: you control an Island).",
    );
    expect(blockRefusalText(redBlocker, [{ attacker: plain, reasons: [] }])).toBeNull();
    expect(blockRefusalText(redBlocker, [])).toBeNull();
  });

  test('the block bar adds the sentence while a blocker is picked up, and only then', () => {
    const attacker = card(1, 'SYNTHETIC Unblockable Bear', {
      controller: 1,
      restrictions: ['cantBeBlocked'],
    });
    const decision: DeclareBlockersDecision & PendingDecision = {
      id: 'd1',
      seat: 0,
      kind: 'declareBlockers',
      attackers: [{ attacker: o(1), target: { kind: 'player', seat: 0 }, minBlockers: 1 }],
      candidates: [{ blocker: o(5), canBlock: [] }],
    };
    const view = {
      viewer: 0,
      turn: 3,
      activeSeat: 1,
      step: 'declareBlockers',
      battlefield: [attacker, redBlocker, ...defending],
      stack: [],
      exile: [],
      seats: [
        { id: 0, hand: [], graveyard: [], command: [], mulligans: 0 },
        { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
      ],
      pending: decision,
    } as unknown as GameView;
    const ctl: Controller = { act: () => {}, update: () => {}, openChooser: () => {} };
    const idle = buildModel(view, decision, initialUi(decision), ctl);
    expect(idle.bar.detail).toBe('Click a creature, then the attacker it blocks.');
    const picked = buildModel(
      view,
      decision,
      { ...initialUi(decision), block: { blocks: [], blocker: o(5) } },
      ctl,
    );
    expect(picked.bar.detail).toBe(
      "SYNTHETIC Red Blocker selected: click an attacker to block it. SYNTHETIC Red Blocker can't block SYNTHETIC Unblockable Bear (can't be blocked).",
    );
  });
});
