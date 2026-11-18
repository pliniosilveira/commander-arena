// Parsed text is only worth something if the engine runs it as written (stage P98). This test imports a SYNTHETIC card through the grammar (never through a fixture)
// with the real paragraph of Glorybringer (golden corpus, acceptance card of issue 103: "You may exert ~ as it attacks. When you do, it deals 4 damage to target
// non-Dragon creature an opponent controls."), defines it in an engine scenario and plays it through applyAction: the question as it attacks (CR 701.43d, 508.1g), the
// linked trigger (CR 607.2h), the damage dealt by the exerted creature, and the creature that does not untap during its next untap step (CR 701.43a). The name starts
// with "SYNTHETIC" and no real card's definition is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BRINGER = parsed(
  'SYNTHETIC Parsed Glorybringer',
  'Creature — Dragon',
  "Flying, haste\nYou may exert ~ as it attacks. When you do, it deals 4 damage to target non-Dragon creature an opponent controls. (An exerted creature won't untap during your next untap step.)",
  { manaCost: '{3}{R}{R}', colors: ['R'], power: '4', toughness: '4' },
);
const NAME = BRINGER.name;
const FILLER = Array.from({ length: 6 }, () => 'Island');

const game = () =>
  scenario()
    .seat(0)
    .define(BRINGER)
    .battlefield(NAME)
    .library(...FILLER)
    .seat(1)
    .battlefield('Giant Spider', 'Serra Angel', 'SYNTHETIC Charge Wyrm')
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();

describe('"You may exert ~ as it attacks. When you do, it deals 4 damage to target non-Dragon creature an opponent controls."', () => {
  test('the lowering is the exert ability and the trigger linked to it', () => {
    const abilities = BRINGER.faces[0]?.abilities ?? [];
    expect(abilities.map((a) => a.kind)).toEqual(['keyword', 'keyword', 'static', 'triggered']);
    expect(abilities[2]).toEqual({ kind: 'static', static: { kind: 'exertOnAttack' } });
    expect(abilities[3]).toMatchObject({ kind: 'triggered', trigger: { kind: 'exerted' } });
  });

  test('exerted as it attacks: 4 damage to the non-Dragon creature chosen, and it stays tapped through its next untap step', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(NAME);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    // The Dragon of the opponent is not a legal target: the Spider and the Angel are.
    const d = g.state.pending;
    expect(d?.kind === 'targets' ? d.specs[0]?.legal : []).toHaveLength(2);
    g.act(0).chooseTargets('Giant Spider');
    g.passAll();
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 1 });
    g.expect.zone('SYNTHETIC Charge Wyrm', 'battlefield', { seat: 1 });
    g.expect.tapped(NAME);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' }); // its controller's next untap step has run
    g.expect.tapped(NAME);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.tapped(NAME, false);
  });

  test('not exerted: nothing is dealt and the Dragon untaps as usual', () => {
    const g = game();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(NAME);
    g.act(0).decline();
    g.passAll();
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 1 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.tapped(NAME, false);
  });
});
