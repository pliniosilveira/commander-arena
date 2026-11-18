// The First Flight deck (Kangee), the group of triggers that pump the attacking or blocking creatures that have flying: the Oracle text of Kangee's Lieutenant and Kangee,
// Sky Warden goes through the grammar as a card with no override and is played through applyAction. The cards are SYNTHETIC stored copies of the printed text (they are not
// in the golden corpus); the other stand-ins are SYNTHETIC too. Pins: CR 508.1k (an attacking creature), CR 509.1g (a blocking creature), CR 611.2a and 611.2c (the group
// is fixed as the effect resolves, later attackers and later keywords are not in it), CR 613.4c (layer 7c), CR 603.2 (a trigger that is already on the stack resolves
// even if its source has left).
import type { CardDefinition, GameState } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

function real(
  name: string,
  typeLine: string,
  oracleText: string,
  extra: { manaCost: string; power: string; toughness: string },
): CardDefinition {
  const imported = importCard(
    syntheticCard({ name, typeLine, oracleText, ...extra }),
    undefined,
    NO_OVERRIDES,
  );
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const LIEUTENANT = real(
  "Kangee's Lieutenant",
  'Creature — Bird Soldier',
  'Flying\nWhenever this creature attacks, attacking creatures with flying get +1/+1 until end of turn.\nEncore {5}{W} ({5}{W}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)',
  { manaCost: '{2}{W}', power: '1', toughness: '1' },
);
const KANGEE = real(
  'Kangee, Sky Warden',
  'Legendary Creature — Bird Noble',
  'Flying, vigilance\nWhenever Kangee attacks, attacking creatures with flying get +2/+0 until end of turn.\nWhenever Kangee blocks, blocking creatures with flying get +0/+2 until end of turn.',
  { manaCost: '{3}{W}{U}', power: '3', toughness: '3' },
);

const FLYER = parsed('SYNTHETIC Flyer', 'Creature — Bird', 'Flying', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const RUNNER = parsed('SYNTHETIC Runner', 'Creature — Bear', '', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const GLIDE = parsed(
  'SYNTHETIC Glide',
  'Instant',
  'Target creature gains flying until end of turn.',
  { manaCost: '{W}' },
);
const SNIPE = parsed('SYNTHETIC Snipe', 'Instant', 'Destroy target creature.', {
  manaCost: '{B}',
});

const FILLER = Array.from({ length: 30 }, () => 'Island');

function settle(g: { state: GameState; passAll(): unknown }) {
  for (let i = 0; i < 16 && g.state.stack.length > 0; i += 1) g.passAll();
}

function attackBoard() {
  const g = scenario()
    .define(LIEUTENANT)
    .define(FLYER)
    .define(RUNNER)
    .define(GLIDE)
    .define(SNIPE)
    .seat(0)
    .battlefield(LIEUTENANT.name, { label: 'lt' })
    .battlefield(FLYER.name, { label: 'flyer' })
    .battlefield(RUNNER.name, { label: 'runner' })
    .battlefield('Plains', { count: 2 })
    .hand(GLIDE.name)
    .library(...FILLER)
    .seat(1)
    .battlefield(FLYER.name, { label: 'theirs' })
    .battlefield('Swamp', { count: 2 })
    .hand(SNIPE.name)
    .library(...FILLER)
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  return g;
}

describe('Kangee\'s Lieutenant: "Whenever this creature attacks, attacking creatures with flying get +1/+1 until end of turn." (CR 508.1k, 611.2c, 613.4c)', () => {
  test('the attacking flyers get +1/+1; an attacking creature without flying does not', () => {
    const g = attackBoard();
    g.act(0).attack(['lt', 'flyer', 'runner']);
    settle(g);
    g.expect.pt('lt', 2, 2);
    g.expect.pt('flyer', 3, 3);
    g.expect.pt('runner', 2, 2);
    g.expect.invariants();
  });

  test('a flyer that does not attack is not affected, nor is the opponent without an attack', () => {
    const g = attackBoard();
    g.act(0).attack(['lt', 'runner']);
    settle(g);
    g.expect.pt('lt', 2, 2);
    g.expect.pt('flyer', 2, 2);
    g.expect.pt('theirs', 2, 2);
  });

  test('a creature that gains flying afterwards is not in the group (CR 611.2c)', () => {
    const g = attackBoard();
    g.act(0).attack(['lt', 'runner']);
    settle(g);
    g.act(0).cast(GLIDE.name, { pay: true, targets: ['runner'] });
    settle(g);
    g.expect.derived('runner', { keywords: ['flying'] });
    g.expect.pt('runner', 2, 2);
  });

  test('a creature that gains flying before the trigger resolves is in the group (the group is read as it resolves)', () => {
    const g = attackBoard();
    g.act(0).attack(['lt', 'runner']);
    g.act(0).cast(GLIDE.name, { pay: true, targets: ['runner'] });
    settle(g);
    g.expect.pt('runner', 3, 3);
    g.expect.pt('lt', 2, 2);
  });

  test('the bonus ends with the turn', () => {
    const g = attackBoard();
    g.act(0).attack(['lt', 'flyer']);
    settle(g);
    g.expect.pt('flyer', 3, 3);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt('flyer', 2, 2);
    g.expect.pt('lt', 1, 1);
  });

  test('the Lieutenant destroyed in response: the trigger still resolves for the other attacking flyers (CR 603.2)', () => {
    const g = attackBoard();
    g.act(0).attack(['lt', 'flyer', 'runner']);
    g.act(0).pass();
    g.act(1).cast(SNIPE.name, { pay: true, targets: ['lt'] });
    settle(g);
    g.expect.noObject("Kangee's Lieutenant", { zone: 'battlefield' });
    g.expect.pt('flyer', 3, 3);
    g.expect.pt('runner', 2, 2);
  });

  test('an attacking flyer removed from combat before it resolves is not affected', () => {
    const g = attackBoard();
    g.act(0).attack(['lt', 'flyer']);
    g.act(0).pass();
    g.act(1).cast(SNIPE.name, { pay: true, targets: ['flyer'] });
    settle(g);
    g.expect.noObject(FLYER.name, { zone: 'battlefield', seat: 0 });
    g.expect.pt('lt', 2, 2);
  });
});

describe('Kangee, Sky Warden: attacks +2/+0, blocks +0/+2 for the flyers of that side (CR 508.1k, 509.1g)', () => {
  const attackKangee = () => {
    const g = scenario()
      .define(KANGEE)
      .define(FLYER)
      .define(RUNNER)
      .seat(0)
      .battlefield(KANGEE.name, { label: 'kangee' })
      .battlefield(FLYER.name, { label: 'flyer' })
      .battlefield(RUNNER.name, { label: 'runner' })
      .library(...FILLER)
      .seat(1)
      .battlefield(FLYER.name, { label: 'theirs' })
      .library(...FILLER)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  test('attacking: +2/+0 for each attacking flyer, none for the ground creature and none for the blockers', () => {
    const g = attackKangee();
    g.act(0).attack(['kangee', 'flyer', 'runner']);
    settle(g);
    g.expect.pt('kangee', 5, 3);
    g.expect.pt('flyer', 4, 2);
    g.expect.pt('runner', 2, 2);
    g.expect.pt('theirs', 2, 2);
  });

  test('blocking: +0/+2 for the blocking flyers only; the attacking flyer does not get it', () => {
    const g = scenario()
      .define(KANGEE)
      .define(FLYER)
      .define(RUNNER)
      .seat(0)
      .battlefield(FLYER.name, { label: 'attacker' })
      .battlefield(RUNNER.name, { label: 'runner' })
      .library(...FILLER)
      .seat(1)
      .battlefield(KANGEE.name, { label: 'kangee' })
      .battlefield(FLYER.name, { label: 'ally' })
      .battlefield(RUNNER.name, { label: 'ground' })
      .library(...FILLER)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(['attacker', 'runner']);
    g.advanceTo('declareBlockers');
    g.act(1).declareBlockers([
      { blocker: 'kangee', attacker: 'attacker' },
      { blocker: 'ally', attacker: 'runner' },
      { blocker: 'ground', attacker: 'runner' },
    ] as const);
    settle(g);
    g.expect.pt('kangee', 3, 5);
    g.expect.pt('ally', 2, 4);
    g.expect.pt('ground', 2, 2);
    g.expect.pt('attacker', 2, 2);
  });
});
