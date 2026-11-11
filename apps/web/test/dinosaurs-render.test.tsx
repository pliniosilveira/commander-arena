/**
 * The questions of the Dinosaurs slice rendered (D-145): the division of damage in the dock (steppers, what is left, an even split,
 * Confirm), the shares of a divided spell on the stack, the creature a token fights, the free cast and the look-and-take that must
 * take one card, the escalate cost under the modes, and the face-down card of a Hideaway permanent (a card back for the opponent).
 * The decisions are drawn from the decisions' own shapes over a small view: a one-on-one game cannot be stopped at each of them.
 */
import type {
  ChooseCardsDecision,
  ChooseModesDecision,
  ChoosePermanentDecision,
  ChosenTarget,
  GameView,
  ObjectView,
  PendingDecision,
  TargetsDecision,
} from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { CardFace } from '../src/ui/board/CardFace';
import { CardPickerPanel } from '../src/ui/decisions/CardPickerPanel';
import { ModesDialog } from '../src/ui/decisions/ModesDialog';
import { buildModel } from '../src/ui/decisions/model';
import { PermanentPanel } from '../src/ui/decisions/PermanentPanel';
import { TargetsPanel } from '../src/ui/decisions/TargetsPanel';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { StackPanel } from '../src/ui/panels/StackPanel';
import { StoreProvider } from '../src/ui/store-context';

const none = () => {};

async function startedStore() {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
  return store;
}
const html = (store: Awaited<ReturnType<typeof startedStore>>, node: React.ReactNode) =>
  renderToStaticMarkup(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>{node}</StoreProvider>,
  );

/** SYNTHETIC: an object shaped like an ObjectView, not taken from a real game. */
const obj = (n: number, name: string, over: Partial<ObjectView> = {}): ObjectView =>
  ({
    id: `o${n}`,
    owner: 0,
    controller: 0,
    zone: 'battlefield',
    name,
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: [],
    colors: [],
    power: 2,
    toughness: 2,
    oracleText: '',
    tapped: false,
    damage: 0,
    counters: {},
    isCommander: false,
    summoningSick: false,
    isToken: false,
    keywords: [],
    protector: null,
    support: 'supported',
    targets: [],
    ...over,
  }) as ObjectView;

const viewOf = (objects: readonly ObjectView[], pending: PendingDecision | null): GameView =>
  ({
    viewer: 0,
    turn: 3,
    activeSeat: 0,
    step: 'main1',
    battlefield: objects.filter((o) => o.zone === 'battlefield'),
    stack: objects.filter((o) => o.zone === 'stack'),
    exile: objects.filter((o) => o.zone === 'exile'),
    combat: null,
    seats: [
      {
        id: 0,
        hand: objects.filter((o) => o.zone === 'hand'),
        graveyard: [],
        command: [],
        mulligans: 0,
      },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0 },
    ],
    pending,
  }) as unknown as GameView;

describe('the division of damage in the dock', () => {
  const goblin = obj(1, 'Goblin', { controller: 1, owner: 1 });
  const elf = obj(2, 'Elf', { controller: 1, owner: 1 });
  const spell = obj(9, 'SYNTHETIC Arc Volley', { zone: 'stack', types: ['instant'] });
  const target = (id: `o${number}`, share?: number): ChosenTarget => ({
    kind: 'object',
    id,
    specId: 't1',
    ...(share === undefined ? {} : { share }),
  });
  const decision = {
    id: 'd1',
    seat: 0,
    kind: 'targets',
    source: 'o9',
    specs: [
      {
        specId: 't1',
        min: 1,
        max: 3,
        divide: 3,
        legal: [target('o1'), target('o2'), { kind: 'player', seat: 1, specId: 't1' }],
      },
    ],
  } as unknown as TargetsDecision;
  const panel = (picks: readonly ChosenTarget[]) => {
    const view = viewOf([goblin, elf, spell], decision);
    const ui: UiState = { ...initialUi(decision), targets: picks };
    return renderToStaticMarkup(
      <TargetsPanel decision={decision} view={view} ui={ui} update={none} />,
    );
  };

  test('before any target: what to do, no stepper', () => {
    const out = panel([]);
    expect(out).toContain('data-divide="t1"');
    expect(out).toContain('Divide 3 damage');
    expect(out).toContain('Choose the targets above');
    expect(out).not.toContain('Even split');
    expect(out).not.toContain('More damage to');
  });

  test('a row with a stepper per chosen target, nothing left, an even split to go back to', () => {
    const out = panel([target('o1', 2), target('o2', 1)]);
    expect(out).toContain('aria-label="Damage to Goblin">2</output>');
    expect(out).toContain('aria-label="Damage to Elf">1</output>');
    expect(out).toContain('All 3 damage assigned.');
    expect(out).toContain('data-divide-left="0"');
    // Nothing is left: "+" is off on both rows; "−" is off where the share is 1.
    expect(out).toMatch(/aria-label="More damage to Goblin" disabled/);
    expect(out).toMatch(/aria-label="Less damage to Elf" disabled/);
    expect(out).not.toMatch(/aria-label="Less damage to Goblin" disabled/);
    expect(out).toContain('Even split');
  });

  test('what is left to assign turns "+" on and says so', () => {
    const out = panel([target('o1', 1), target('o2', 1)]);
    expect(out).toContain('1 left to assign.');
    expect(out).toContain('data-divide-left="1"');
    expect(out).not.toMatch(/aria-label="More damage to Goblin" disabled/);
    expect(out).toContain('dec-warn');
  });

  test('a lone target needs no even split', () => {
    const out = panel([target('o1', 3)]);
    expect(out).toContain('All 3 damage assigned.');
    expect(out).not.toContain('Even split');
  });

  test('the stack shows each target with its share', async () => {
    const store = await startedStore();
    const snap = store.getState().snapshot;
    if (snap === null) throw new Error('no snapshot');
    const item = obj(902, 'SYNTHETIC Arc Volley', {
      zone: 'stack',
      types: ['instant'],
      targets: [
        { kind: 'object', id: 'o901', specId: 't1', share: 3 },
        { kind: 'player', seat: 1, specId: 't1', share: 2 },
      ],
    });
    const goblin901 = obj(901, 'Goblin');
    store.setState({ snapshot: { ...snap, view: { ...snap.view, stack: [item, goblin901] } } });
    const out = html(store, <StackPanel />);
    expect(out).toContain('data-stack-shares');
    expect(out).toContain('3 damage to Goblin, 2 damage to Opponent');
  });
});

describe('the creature a token fights', () => {
  const beast = obj(1, 'Phyrexian Beast');
  const goblin = obj(2, 'Goblin', { controller: 1, owner: 1 });
  const elf = obj(3, 'Elf', { controller: 1, owner: 1 });
  const spell = obj(9, 'SYNTHETIC Swarm Predation', { zone: 'stack', types: ['sorcery'] });
  const decision = {
    id: 'd2',
    seat: 0,
    kind: 'choosePermanent',
    source: 'o9',
    purpose: 'fight',
    subject: 'o1',
    legal: ['o2', 'o3'],
    min: 1,
    max: 1,
  } as unknown as ChoosePermanentDecision;

  test('a panel that names the fighter and a chip per creature', () => {
    const view = viewOf([beast, goblin, elf, spell], decision);
    const out = renderToStaticMarkup(
      <StoreProvider store={createAppStore({ client: new GameHost({ clock: () => 0 }) })}>
        <PermanentPanel decision={decision} view={view} ui={initialUi(decision)} update={none} />
      </StoreProvider>,
    );
    expect(out).toContain('aria-label="Creatures to fight"');
    expect(out).toContain('Phyrexian Beast fights');
    expect(out).toContain('>Goblin<');
    expect(out).toContain('>Elf<');
  });

  test('the bar says what is asked, and the fighter is marked on the board', () => {
    const view = viewOf([beast, goblin, elf, spell], decision);
    const model = buildModel(view, decision, initialUi(decision), {
      act: none,
      update: none,
      openChooser: none,
    });
    expect(model.bar.prompt).toBe(
      'Choose the creature Phyrexian Beast fights for SYNTHETIC Swarm Predation.',
    );
    expect(model.interaction.badge('o1')).toBe('Fighter');
    expect(model.interaction.badge('o2')).toBeNull();
    expect(model.interaction.clickable.has('o2')).toBe(true);
  });
});

describe('the free cast and the look-and-take', () => {
  const bolt = obj(1, 'Lightning Bolt', { zone: 'hand', types: ['instant'], manaCost: ['R'] });
  const spell = obj(9, 'SYNTHETIC Free Cast Rite', { zone: 'stack', types: ['sorcery'] });
  const cast = {
    id: 'd3',
    seat: 0,
    kind: 'chooseCards',
    source: 'o9',
    purpose: 'cast',
    zone: 'hand',
    legal: ['o1'],
    min: 0,
    max: 1,
    reveal: false,
    prompt: 'You may cast a card from your hand without paying its mana cost',
  } as unknown as ChooseCardsDecision;

  test('a panel for the free cast of a card of the hand', async () => {
    const store = await startedStore();
    const view = viewOf([bolt, spell], cast);
    const out = html(
      store,
      <CardPickerPanel decision={cast} view={view} ui={initialUi(cast)} update={none} />,
    );
    expect(out).toContain('aria-label="Cards to cast for free"');
    expect(out).toContain('Cast for free: SYNTHETIC Free Cast Rite');
    expect(out).toContain('Choose a card to cast without paying its mana cost, or none.');
    expect(out).toContain('Lightning Bolt');
    const model = buildModel(view, cast, initialUi(cast), {
      act: none,
      update: none,
      openChooser: none,
    });
    expect(model.bar.buttons[0]?.label).toBe("Don't cast");
    expect(model.bar.buttons[0]?.disabled).toBe(false);
  });

  test('a card to play from exile, face down, shown to the one who may look at it', async () => {
    const store = await startedStore();
    const exiled = obj(2, 'Secret Giant', { zone: 'exile', faceDown: true, power: 5 });
    const play = {
      ...cast,
      zone: 'exile',
      legal: ['o2'],
      prompt: 'You may play the exiled card without paying its mana cost',
    };
    const view = viewOf([exiled, spell], play as unknown as PendingDecision);
    const out = html(
      store,
      <CardPickerPanel
        decision={play as ChooseCardsDecision}
        view={view}
        ui={initialUi(play as never)}
        update={none}
      />,
    );
    expect(out).toContain('Play for free: SYNTHETIC Free Cast Rite');
    expect(out).toContain('Secret Giant');
    expect(out).toContain('Choose a card to play without paying its mana cost, or none.');
  });

  test('Hideaway: one card must be taken, and it is exiled face down', async () => {
    const store = await startedStore();
    const vault = obj(5, 'SYNTHETIC Hidden Vault', { types: ['land'] });
    const trigger = obj(8, 'SYNTHETIC Hidden Vault', {
      zone: 'stack',
      abilitySource: 'o5',
      ability: {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: {
          kind: 'lookAtTop',
          count: 2,
          take: { filter: {}, max: 1, min: 1, to: 'exileFaceDown' },
          rest: 'bottomRandom',
        },
      } as never,
    });
    const a = obj(1, 'Mountain', { types: ['land'] });
    const b = obj(2, 'Forest', { types: ['land'] });
    const look = {
      id: 'd4',
      seat: 0,
      kind: 'chooseCards',
      source: 'o8',
      purpose: 'lookTake',
      zone: 'library',
      legal: ['o1', 'o2'],
      looked: ['o1', 'o2'],
      min: 1,
      max: 1,
      reveal: false,
      prompt: 'Look at the top 2 cards',
    } as unknown as ChooseCardsDecision;
    const view = { ...viewOf([vault, trigger], look), pendingCards: [a, b] } as GameView;
    const out = html(
      store,
      <CardPickerPanel decision={look} view={view} ui={initialUi(look)} update={none} />,
    );
    expect(out).toContain('Choose a card to exile face down.');
    expect(out).toContain('Only you see these cards.');
    const model = buildModel(view, look, initialUi(look), {
      act: none,
      update: none,
      openChooser: none,
    });
    expect(model.bar.prompt).toBe(
      "Look at the top two cards of your library. Exile one of them face down. Put the rest on the bottom of your library in a random order (SYNTHETIC Hidden Vault's ability).",
    );
    // No "none": Confirm waits for a card.
    expect(model.bar.buttons[0]?.label).toBe('Exile face down');
    expect(model.bar.buttons[0]?.disabled).toBe(true);
    expect(model.bar.buttons[0]?.hint).toBe('Choose 1 more card');
  });
});

describe('the escalate cost under the modes', () => {
  const d = {
    id: 'd5',
    seat: 0,
    kind: 'chooseModes',
    source: 'o9',
    sourceName: 'SYNTHETIC Escalating Charm',
    sourceOracleText:
      'Escalate {1} Choose one or more — • Deals 2 damage to target creature. • Target player draws a card. • You gain 3 life.',
    purpose: 'spell',
    modes: [
      { index: 0, text: 'Deals 2 damage to target creature.', legal: true },
      { index: 1, text: 'Target player draws a card.', legal: true },
      { index: 2, text: 'You gain 3 life.', legal: false },
    ],
    min: 1,
    max: 3,
    sets: [[0], [1], [0, 1]],
  } as unknown as ChooseModesDecision;

  test('the dialog says what each mode beyond the first costs, and why a mode is out', () => {
    const view = viewOf([], d);
    const ui = { ...initialUi(d), modes: [0, 1] };
    const model = buildModel(view, d, ui, { act: none, update: none, openChooser: none });
    expect(model.bar.detail).toBe(
      '2 of 1 to 3 chosen. Escalate {1}: {1} more for one mode beyond the first.',
    );
    const out = renderToStaticMarkup(<ModesDialog d={d} ui={ui} model={model} update={none} />);
    expect(out).toContain('Escalate {1}: {1} more for one mode beyond the first.');
    expect(out).toContain('No legal target, or not enough mana for the escalate cost');
  });
});

describe('a face-down card of a Hideaway permanent', () => {
  test('the other player sees a card back with no name', () => {
    const back = obj(1, 'Face-down card', {
      zone: 'exile',
      faceDown: true,
      owner: 1,
      types: [],
      power: null,
      toughness: null,
    });
    const out = renderToStaticMarkup(
      <StoreProvider store={createAppStore({ client: new GameHost({ clock: () => 0 }) })}>
        <CardFace object={back} variant="hand" />
      </StoreProvider>,
    );
    expect(out).toContain('data-face-down');
    expect(out).toContain('Face-down card (face down)');
    expect(out).not.toContain('foretold');
  });

  test('its controller sees the whole card', () => {
    const mine = obj(2, 'Secret Giant', { zone: 'exile', faceDown: true, power: 5, toughness: 5 });
    const out = renderToStaticMarkup(
      <StoreProvider store={createAppStore({ client: new GameHost({ clock: () => 0 }) })}>
        <CardFace object={mine} variant="hand" />
      </StoreProvider>,
    );
    expect(out).not.toContain('data-face-down');
    expect(out).toContain('Secret Giant');
  });
});
