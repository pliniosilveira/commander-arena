// The legal actions agree with what the engine does (SPEC 4.2) for the costs of D-095: a spell is
// offered exactly when its total cost (mana cost or alternative cost, tax, additional costs, minus
// reductions) can be paid, and an offered cast can always be carried through to the end, whatever
// the player chooses at each question. Determinism: the same actions give the same game.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-costs.ts).
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  checkInvariants,
  type GameState,
  getLegalActions,
  type ObjectId,
  stateHash,
} from '../src/index';
import { scenario } from '../src/testing/index';

const SPELLS = [
  'SYNTHETIC Sacrifice Draw',
  'SYNTHETIC Offering Bolt',
  'SYNTHETIC Land Offering',
  'SYNTHETIC Discard Burn',
  'SYNTHETIC Double Toll',
  'SYNTHETIC Blood Price',
  'SYNTHETIC Extra Mana Tax',
  'SYNTHETIC Sacrifice Kicker',
  'SYNTHETIC Wrath of Many',
  'SYNTHETIC Sacrifice Rite',
  'SYNTHETIC Free Counter',
  'SYNTHETIC Free Exile',
  'SYNTHETIC Free Offering',
  'SYNTHETIC Always Free',
  'SYNTHETIC Free Colossus',
  'Sol Ring',
  'Lightning Bolt',
];

interface Layout {
  readonly lands: number;
  readonly creatures: number;
  readonly extraHand: number;
  readonly commander: boolean;
  readonly reducer: 'none' | 'bench' | 'chant';
  readonly life: number;
}

function build(layout: Layout) {
  const b = scenario().seat(0).life(layout.life);
  b.hand(...SPELLS);
  if (layout.extraHand > 0) b.hand('Forest', { count: layout.extraHand });
  if (layout.lands > 0) {
    b.battlefield('Swamp', { count: Math.ceil(layout.lands / 2) });
    if (layout.lands > 1) b.battlefield('Mountain', { count: Math.floor(layout.lands / 2) });
  }
  if (layout.creatures > 0) b.battlefield('Grizzly Bears', { count: layout.creatures });
  if (layout.commander) b.battlefield('Isamaru, Hound of Konda', { commander: true });
  if (layout.reducer === 'bench') b.battlefield('SYNTHETIC Tinker Bench');
  if (layout.reducer === 'chant') b.battlefield('SYNTHETIC Spell Chant');
  b.library('Plains', 'Plains', 'Plains', 'Plains');
  return b.seat(1).battlefield('Giant Spider').library('Plains', 'Plains').build();
}

const LAYOUTS: Layout[] = [];
for (const lands of [0, 1, 2, 4, 7]) {
  for (const creatures of [0, 1, 3]) {
    for (const extraHand of [0, 2]) {
      for (const commander of [false, true]) {
        for (const reducer of ['none', 'bench', 'chant'] as const) {
          LAYOUTS.push({ lands, creatures, extraHand, commander, reducer, life: 40 });
        }
      }
    }
  }
}
// A few with little life, for the life costs.
for (const life of [1, 3, 4, 5]) {
  LAYOUTS.push({ lands: 3, creatures: 1, extraHand: 1, commander: false, reducer: 'none', life });
}

/** An answer a careful player gives: never cancel, pay automatically, take the first or last choice. */
function answer(state: GameState, which: 'first' | 'last'): Action {
  const d = state.pending;
  if (d === null) throw new Error('nothing pending');
  if (d.kind === 'payMana') return { kind: 'payAuto' };
  const legal = getLegalActions(state, d.seat).filter(
    (a) => a.kind !== 'cancel' && a.kind !== 'concede',
  );
  const pick = which === 'first' ? legal[0] : legal[legal.length - 1];
  if (pick === undefined) throw new Error(`no answer to ${d.kind}`);
  return pick;
}

/** Carries a cast that was just begun to the end: the spell is on the stack and priority is back (or the game is over, see below). */
function finish(state: GameState, seat: 0 | 1, which: 'first' | 'last'): GameState {
  let s = state;
  for (let i = 0; i < 20; i += 1) {
    const d = s.pending;
    if (d?.kind === 'priority') return s;
    // CR 119.4, 704.5a: a cost may take the whole life total; the player then loses before they would get priority.
    if (s.result !== null) return s;
    const r = applyAction(s, seat, answer(s, which));
    if (!r.ok) throw new Error(`stuck at ${d?.kind}: ${r.error}`);
    s = r.state;
  }
  throw new Error('the cast did not finish');
}

describe('the legal actions and the engine agree on every cast', () => {
  test(`across ${LAYOUTS.length} boards, every offered cast works through to the end and nothing else is accepted`, () => {
    let offeredTotal = 0;
    let refusedTotal = 0;
    for (const layout of LAYOUTS) {
      const g = build(layout);
      const tag = JSON.stringify(layout);
      const options = getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell');
      const offered = new Set(
        options.map((a) =>
          a.kind === 'castSpell' ? `${a.object}/${a.alternative ?? ''}/${a.face ?? 0}` : '',
        ),
      );
      for (const id of g.state.seats[0]?.hand ?? ([] as ObjectId[])) {
        for (const alternative of [undefined, 'free'] as const) {
          const action: Action = {
            kind: 'castSpell',
            object: id,
            ...(alternative === undefined ? {} : { alternative }),
          };
          const key = `${id}/${alternative ?? ''}/0`;
          const r = applyAction(g.state, 0, action);
          const card = g.state.objects[id];
          if (offered.has(key)) {
            expect(r.ok, `${tag} offered ${key}`).toBe(true);
            offeredTotal += 1;
            if (r.ok) {
              // The seat can carry it to the end whatever it picks at each question.
              for (const which of ['first', 'last'] as const) {
                const done = finish(r.state, 0, which);
                expect(checkInvariants(done), tag).toEqual([]);
                expect(done.stack.length, tag).toBeGreaterThan(0);
              }
            }
          } else {
            // Lands are not spells, so the engine refuses them too; anything not offered is refused.
            expect(r.ok, `${tag} not offered ${card?.card} ${key}`).toBe(false);
            refusedTotal += 1;
          }
        }
      }
    }
    expect(offeredTotal).toBeGreaterThan(200);
    expect(refusedTotal).toBeGreaterThan(200);
  }, 120_000);
});

describe('determinism', () => {
  test('the same casts in the same order give the same game, twice', () => {
    const run = () => {
      const g = scenario()
        .seed(7)
        .seat(0)
        .hand('SYNTHETIC Double Toll', 'SYNTHETIC Sacrifice Rite', 'Forest', 'Island')
        .battlefield('Swamp', { count: 4 })
        .battlefield('Grizzly Bears', 'Llanowar Elves', 'SYNTHETIC Doomed Scout')
        .library('Plains', 'Plains', 'Plains', 'Plains')
        .seat(1)
        .build();
      g.act(0).cast('SYNTHETIC Double Toll', { pay: true });
      g.act(0).choosePermanents('SYNTHETIC Doomed Scout');
      g.act(0).chooseCards('Forest');
      g.passAll();
      g.act(0).cast('SYNTHETIC Sacrifice Rite', { pay: true });
      g.act(0).choosePermanents('Llanowar Elves');
      g.passAll();
      return stateHash(g.state);
    };
    expect(run()).toBe(run());
  });
});
