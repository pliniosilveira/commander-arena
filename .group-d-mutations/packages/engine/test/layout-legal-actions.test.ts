// getLegalActions and applyAction agree for every face of every layout (SPEC 4.2: the UI and the AI
// use the same legality code as the engine): for each object in the game, each face index from -1
// to 3, cast and played as a land, the action is accepted exactly when it is listed. A missing
// `face` is face 0, so an action without one is accepted exactly when the face 0 option is listed.
import { describe, expect, test } from 'vitest';
import { type Action, applyAction, getLegalActions } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const LAYOUT_CARDS = [
  'SYNTHETIC Singe // Mend',
  'SYNTHETIC Study // Zap',
  'SYNTHETIC Brawler Bear // Chop',
  'SYNTHETIC Wise Owl // Peek',
  'SYNTHETIC Ridge Drake // Ridge Pass',
  'SYNTHETIC Zeal Charm // Shock Pass',
  'SYNTHETIC Twin Knight // Twin Wall',
  'SYNTHETIC Moon Cub // Moon Beast',
  'SYNTHETIC Squire // Grown Knight',
] as const;

function candidates(g: ScenarioGame): Action[] {
  const out: Action[] = [];
  for (const id of Object.keys(g.state.objects)) {
    const object = id as Action extends { object: infer O } ? O : never;
    for (const face of [undefined, -1, 0, 1, 2, 3]) {
      const withFace = face === undefined ? {} : { face };
      out.push({ kind: 'castSpell', object, ...withFace } as Action);
      out.push({ kind: 'playLand', object, ...withFace } as Action);
    }
  }
  return out;
}

function listed(options: readonly Action[], action: Action): boolean {
  return options.some(
    (o) =>
      o.kind === action.kind &&
      'object' in o &&
      'object' in action &&
      o.object === action.object &&
      (('face' in o ? o.face : undefined) ?? 0) ===
        (('face' in action ? action.face : undefined) ?? 0) &&
      !('alternative' in o && o.alternative !== undefined),
  );
}

function agree(g: ScenarioGame, seat: 0 | 1): number {
  const options = getLegalActions(g.state, seat);
  let accepted = 0;
  for (const action of candidates(g)) {
    const ok = applyAction(g.state, seat, action).ok;
    expect(ok, JSON.stringify(action)).toBe(listed(options, action));
    if (ok) accepted += 1;
  }
  return accepted;
}

describe('listed options and accepted actions are the same set', () => {
  const rich = (b: ReturnType<typeof scenario>) =>
    b
      .seat(0)
      .hand(...LAYOUT_CARDS)
      .battlefield('Mountain', 'Plains', 'Island', 'Forest', 'Swamp', 'Mountain', 'Plains')
      .battlefield('Grizzly Bears')
      .seat(1)
      .battlefield('Llanowar Elves', 'Grizzly Bears');

  test('in the main phase with plenty of mana', () => {
    const g = rich(scenario()).build();
    expect(agree(g, 0)).toBeGreaterThan(8);
  });

  test('with no mana and no land drop: nothing but the pass', () => {
    const g = scenario()
      .seat(0)
      .hand(...LAYOUT_CARDS)
      .landsPlayed(1)
      .seat(1)
      .build();
    expect(agree(g, 0)).toBe(0);
  });

  test('at instant speed: only the instant faces', () => {
    const g = rich(scenario()).seat(0).at('precombatMain', { active: 1, priority: 0 }).build();
    expect(agree(g, 0)).toBeGreaterThan(0);
  });

  test('with a card on an Adventure in exile', () => {
    const g = scenario()
      .seat(0)
      .exile('SYNTHETIC Brawler Bear // Chop', { onAdventure: true })
      .exile('SYNTHETIC Wise Owl // Peek')
      .battlefield('Forest', 'Forest', 'Island', 'Island', 'Island')
      .seat(1)
      .build();
    // One option, face 0, accepted with and without the `face` field.
    expect(agree(g, 0)).toBe(2);
  });

  test('for the other seat, which does not hold priority: nothing is accepted', () => {
    const g = rich(scenario()).build();
    expect(getLegalActions(g.state, 1)).toEqual([]);
    for (const action of candidates(g)) {
      expect(applyAction(g.state, 1, action).ok).toBe(false);
    }
  });

  test('in the graveyard and the library, nothing of a layout card is castable', () => {
    const g = scenario()
      .seat(0)
      .graveyard(...LAYOUT_CARDS)
      .library(...LAYOUT_CARDS)
      .battlefield('Mountain', 'Plains', 'Island', 'Forest', 'Swamp')
      .seat(1)
      .build();
    expect(agree(g, 0)).toBe(0);
  });
});
