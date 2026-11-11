// Multi-face cards as commanders (CR 903.8, 903.9). A commander that is an Adventure creature is
// cast from the command zone either way and pays the commander tax for each cast (CR 903.8); when
// its Adventure resolves it is exiled, which its owner may answer by putting it into the command zone
// as a state-based action (CR 903.9a, 704.6d), or leave in exile on the Adventure and cast from
// there as the creature, which is not a cast from the command zone and costs no tax (CR 715.3d).
// A modal double-faced commander is cast as either face. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import { getLegalActions } from '../src/index';
import { scenario } from '../src/testing/index';
import { viewOf } from './layout-helpers';

const BEAR = 'SYNTHETIC Brawler Bear // Chop';
const DRAKE = 'SYNTHETIC Ridge Drake // Ridge Pass';

describe('an Adventure commander', () => {
  const build = () =>
    scenario()
      .seat(0)
      .commander(BEAR)
      .battlefield('Mountain', 'Mountain', 'Forest', 'Forest', 'Forest', 'Forest')
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'bears' })
      .build();

  test('both faces are cast from the command zone, with the tax of the casts so far', () => {
    const g = build();
    const id = g.id(BEAR);
    expect(getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell')).toEqual([
      { kind: 'castSpell', object: id, face: 0 },
      { kind: 'castSpell', object: id, face: 1 },
    ]);
    g.act(0).cast(BEAR, { face: 1, targets: ['bears'], pay: true });
    expect(g.state.commanderCasts[g.object(BEAR).card as never]).toBe(1);
    g.expect.eventLog([{ kind: 'spellCast', fromZone: 'command', commanderTax: 0, face: 1 }]);
  });

  test('the resolved Adventure is exiled, and the owner may put the commander into the command zone', () => {
    const g = build();
    g.act(0).cast(BEAR, { face: 1, targets: ['bears'], pay: true });
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(BEAR, 'command', { seat: 0 });
    expect(g.object(BEAR).onAdventure).toBeUndefined();
    expect(g.object(BEAR).face).toBe(0);
    // Cast again: the tax of one earlier cast ({2}) is added to the cost of either face.
    // Chop killed the only creature, so only the creature face is castable: {1}{G} and the {2} tax.
    const afterTax = g.legalActions(0).filter((a) => a.kind === 'castSpell');
    expect(afterTax).toEqual([{ kind: 'castSpell', object: g.id(BEAR), face: 0 }]);
    g.act(0).cast(BEAR, { face: 0, pay: true });
    expect(g.state.commanderCasts[g.object(BEAR).card as never]).toBe(2);
    g.expect.eventLog([{ kind: 'spellCast', fromZone: 'command', commanderTax: 2 }]);
  });

  test('left in exile on the Adventure, it is cast as the creature, without tax and not from the command zone', () => {
    const g = build();
    g.act(0).cast(BEAR, { face: 1, targets: ['bears'], pay: true });
    g.passAll();
    g.act(0).declineCommandZone();
    g.expect.zone(BEAR, 'exile');
    expect(g.object(BEAR).onAdventure).toBe(true);
    expect(viewOf(g, BEAR).onAdventure).toBe(true);
    g.expect.legal(0, { cast: BEAR, face: 0 });
    g.expect.illegal(0, { cast: BEAR, face: 1 });
    g.act(0).cast(BEAR, { face: 0, pay: true });
    g.expect.eventLog([{ kind: 'spellCast', fromZone: 'exile', commanderTax: 0 }]);
    // Not a cast from the command zone: the tax count is still one.
    expect(g.state.commanderCasts[g.object(BEAR).card as never]).toBe(1);
  });
});

describe('a modal double-faced commander', () => {
  test('is cast as its front face; its back-face land is played from the hand only', () => {
    const g = scenario()
      .seat(0)
      .commander(DRAKE)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .seat(1)
      .build();
    g.expect.legal(0, { cast: DRAKE, face: 0 });
    // Lands are played from the hand (CR 305.1), never from the command zone.
    g.expect.illegal(0, { playLand: { name: DRAKE, zone: 'command' }, face: 1 });
    g.act(0).cast(DRAKE, { face: 0, pay: true });
    g.passAll();
    g.expect.zone(DRAKE, 'battlefield', { seat: 0 });
    expect(g.object(DRAKE).face).toBe(0);
  });
});
