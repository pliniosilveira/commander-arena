/**
 * The questions of the Angels slice rendered (D-149): the proliferate dialog (permanents and players, any number, Choose all and none),
 * the cost of blocking in the dock and at the payment, one target for each opponent, the read-only shares of a copy of a divided spell,
 * and the restricted mana in a pool. The decisions are drawn from their own shapes over a small view.
 */
import type {
  ChoosePermanentDecision,
  ChosenTarget,
  DeclareBlockersDecision,
  GameView,
  ObjectView,
  PayManaDecision,
  PendingDecision,
  SeatView,
  TargetsDecision,
} from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { GameHost } from '../src/game/host';
import { createAppStore } from '../src/store';
import { ManaPool } from '../src/ui/board/PlayerStrip';
import { buildModel, type Controller } from '../src/ui/decisions/model';
import { DockPanel } from '../src/ui/decisions/Overlays';
import { PermanentPanel } from '../src/ui/decisions/PermanentPanel';
import { ProliferateDialog } from '../src/ui/decisions/ProliferateDialog';
import { TargetsPanel } from '../src/ui/decisions/TargetsPanel';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { StoreProvider } from '../src/ui/store-context';

const none = () => {};

/** The dock panel of a decision, as markup ('' when it draws none). */
const dockOf = (props: Parameters<typeof DockPanel>[0]) =>
  renderToStaticMarkup(<Dock {...props} />);
function Dock(props: Parameters<typeof DockPanel>[0]) {
  return DockPanel(props);
}

/** The hover chips read the store: a store of a real game of the page's test decks provides it. */
async function startedStore() {
  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  await store.getState().startGame({ seed: 7, humanDeck: 'white-knights', aiDeck: 'swamp-forest' });
  return store;
}
const store = await startedStore();
const withStore = (node: React.ReactNode) =>
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
    exile: [],
    combat: null,
    seats: [
      { id: 0, hand: [], graveyard: [], command: [], mulligans: 0, poison: 0, manaPool: [] },
      { id: 1, hand: null, graveyard: [], command: [], mulligans: 0, poison: 3, manaPool: [] },
    ],
    pending,
  }) as unknown as GameView;

describe('the proliferate dialog', () => {
  const spell = obj(9, 'Spreading Growth', {
    zone: 'stack',
    types: ['sorcery'],
    oracleText: 'Proliferate.',
  });
  const bears = obj(1, 'Grizzly Bears', { counters: { '+1/+1': 2 } });
  const rat = obj(2, 'Rat', { controller: 1, owner: 1, counters: { '-1/-1': 1 } });
  const decision = {
    id: 'd1',
    seat: 0,
    kind: 'choosePermanent',
    source: 'o9',
    purpose: 'proliferate',
    min: 0,
    max: 2,
    legal: ['o1', 'o2'],
    players: [1],
  } as unknown as ChoosePermanentDecision;
  const dialog = (d: ChoosePermanentDecision = decision, ui: Partial<UiState> = {}) => {
    const view = viewOf([bears, rat, spell], d);
    const state = { ...initialUi(d), ...ui };
    const ctl: Controller = { act: none, update: none, openChooser: none };
    return withStore(
      <ProliferateDialog
        d={d}
        view={view}
        ui={state}
        model={buildModel(view, d, state, ctl)}
        update={none}
      />,
    );
  };

  test('permanents with their counters and whose they are, players with poison, all and none', () => {
    const out = dialog();
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-label="Proliferate"');
    expect(out).toContain('>Proliferate</h2>');
    expect(out).toContain('Choose any number of permanents and/or players with counters');
    expect(out).toContain('Permanents with counters');
    expect(out).toContain('Grizzly Bears (2 +1/+1 counters), yours');
    expect(out).toContain('Rat (1 -1/-1 counter), opponent&#x27;s');
    expect(out).toContain('Players with poison counters');
    expect(out).toContain('Opponent (3 poison counters)');
    expect(out).toContain('data-proliferate-all');
    expect(out).toContain('data-proliferate-none');
    expect(out).toContain('0 of 2 permanents and 0 of 1 players chosen');
    // The words of the spell are above the chips; Confirm names what nothing chosen does.
    expect(out).toContain('Spreading Growth: Proliferate.');
    expect(out).toContain('Proliferate nothing');
  });

  test('what is chosen is pressed, and Confirm counts it', () => {
    const out = dialog(decision, { permanents: ['o1'], players: [1] });
    expect(out).toContain('1 of 2 permanents and 1 of 1 players chosen');
    expect(out.match(/aria-pressed="true"/g)?.length).toBe(2);
    expect(out).toContain('Proliferate (2)');
  });

  test('no players: no list of them', () => {
    const noPlayers = { ...decision, players: undefined } as unknown as ChoosePermanentDecision;
    expect(dialog(noPlayers)).not.toContain('Players with poison counters');
  });

  test('the dock draws nothing for it: the dialog is the question', () => {
    const view = viewOf([bears, rat, spell], decision);
    const out = dockOf({
      view,
      pending: decision,
      ui: initialUi(decision),
      model: {} as never,
      update: none,
      act: none,
      error: null,
    });
    expect(out).toBe('');
  });
});

describe('the host of an Aura and the tap of a spell in the dock', () => {
  const aura = obj(5, 'Angelic Mantle', { zone: 'stack', types: ['enchantment'] });
  const spell = obj(9, 'Sky Blade Angel', { zone: 'stack', oracleText: 'Flying, lifelink.' });
  const birds = [1, 2, 3, 4, 6].map((n) => obj(n, 'Mana Bird'));
  const render = (decision: ChoosePermanentDecision, stack: readonly ObjectView[]) =>
    withStore(
      <PermanentPanel
        decision={decision}
        view={viewOf([...birds, ...stack], decision)}
        ui={initialUi(decision)}
        update={none}
      />,
    );

  test('an Aura asks what it enchants, not what to sacrifice', () => {
    const decision = {
      id: 'd1',
      seat: 0,
      kind: 'choosePermanent',
      source: 'o9',
      subject: 'o5',
      purpose: 'auraHost',
      min: 1,
      max: 1,
      legal: ['o1', 'o2'],
    } as unknown as ChoosePermanentDecision;
    const out = render(decision, [spell, aura]);
    expect(out).toContain('aria-label="Permanents to enchant"');
    expect(out).toContain('>Attach Angelic Mantle</h3>');
    expect(out).not.toContain('Sacrifice');
    expect(out).toContain('Mana Bird 1');
  });

  test('a spell cast by tapping creatures names the spell in the title', () => {
    const decision = {
      id: 'd1',
      seat: 0,
      kind: 'choosePermanent',
      source: 'o9',
      purpose: 'tap',
      forCost: true,
      min: 4,
      max: 4,
      legal: ['o1', 'o2', 'o3', 'o4', 'o6'],
    } as unknown as ChoosePermanentDecision;
    const out = render(decision, [spell]);
    expect(out).toContain('aria-label="Permanents to tap"');
    expect(out).toContain('>Tap to cast Sky Blade Angel</h3>');
    expect(out).toContain('0 of 4 chosen');
  });
});

describe('the cost of blocking in the dock', () => {
  const angel = obj(3, 'Archangel of Tithes', { controller: 1, owner: 1 });
  const decision = {
    id: 'd1',
    seat: 0,
    kind: 'declareBlockers',
    candidates: [{ blocker: 'o1', canBlock: ['o3'] }],
    attackers: [{ attacker: 'o3', target: { kind: 'player', seat: 0 }, minBlockers: 1 }],
    blockCost: { cost: ['1'], affordable: 1, source: 'o3' },
  } as unknown as DeclareBlockersDecision;
  const dock = (blocks: readonly { blocker: string; attacker: string }[], d = decision) =>
    dockOf({
      view: viewOf([angel, obj(1, 'Bear')], d),
      pending: d,
      ui: { ...initialUi(d), block: { blocks, blocker: null } as never },
      model: {} as never,
      update: none,
      act: none,
      error: null,
    });

  test('what blocking costs, with nothing chosen and with a block', () => {
    const empty = dock([]);
    expect(empty).toContain('aria-label="Cost of blocking"');
    expect(empty).toContain(
      'Blocking costs {1} per creature (Archangel of Tithes). Your mana covers 1 creature now.',
    );
    expect(empty).not.toContain('chosen:');
    const one = dock([{ blocker: 'o1', attacker: 'o3' }]);
    expect(one).toContain('1 chosen:');
    expect(one).not.toContain('role="status"');
  });

  test('too many blockers warn', () => {
    const tight = {
      ...decision,
      blockCost: { cost: ['1'], affordable: 0, source: 'o3' },
    } as DeclareBlockersDecision;
    const out = dock([{ blocker: 'o1', attacker: 'o3' }], tight);
    expect(out).toContain('Your mana covers none now.');
    expect(out).toContain('You cannot pay to block now');
    expect(out).toContain('role="status"');
  });

  test('without a tax the dock has no cost panel, only the damage getting through', () => {
    const free = { ...decision, blockCost: undefined } as unknown as DeclareBlockersDecision;
    const out = dock([], free);
    expect(out).not.toContain('Cost of blocking');
    expect(out).toContain('aria-label="Damage getting through"');
  });

  test('the payment says who blocks once it is paid', () => {
    const pay = {
      id: 'd2',
      seat: 0,
      kind: 'payMana',
      source: 'o3',
      totalCost: ['1'],
      manaSources: [],
      purpose: 'blockTax',
      blocks: [{ blocker: 'o1', attacker: 'o3' }],
    } as unknown as PayManaDecision;
    const out = dockOf({
      view: viewOf([angel, obj(1, 'Bear')], pay),
      pending: pay,
      ui: initialUi(pay),
      model: {} as never,
      update: none,
      act: none,
      error: null,
    });
    expect(out).toContain('data-block-tax');
    expect(out).toContain(
      'Bear will block once this is paid. The cost is from Archangel of Tithes.',
    );
  });
});

describe('the targets of an Aura-exiling enchantment and of a copy', () => {
  const t = (id: string, over: Record<string, unknown> = {}): ChosenTarget =>
    ({ kind: 'object', id, specId: 't1', ...over }) as ChosenTarget;
  const goblin = obj(1, 'Goblin', { controller: 1, owner: 1 });
  const elf = obj(2, 'Elf', { controller: 1, owner: 1 });
  const spell = obj(9, 'Grasp of Law', { zone: 'stack', types: ['enchantment'] });

  test('one for each opponent: a heading for each opponent, their permanents under it', () => {
    const decision = {
      id: 'd',
      seat: 0,
      kind: 'targets',
      source: 'o9',
      forTrigger: true,
      specs: [
        {
          specId: 't1',
          min: 0,
          max: 1,
          onePerGroup: true,
          legal: [t('o1', { group: 1 }), t('o2', { group: 1 })],
        },
      ],
    } as unknown as TargetsDecision;
    const out = renderToStaticMarkup(
      <TargetsPanel
        decision={decision}
        view={viewOf([goblin, elf, spell], decision)}
        ui={{ ...initialUi(decision), targets: [t('o1')] }}
        update={none}
      />,
    );
    expect(out).toContain('data-group="1"');
    expect(out).toContain('Opponent&#x27;s permanents: up to one');
    expect(out).toContain('Goblin');
    expect(out).toContain('Elf');
    expect(out.match(/aria-pressed="true"/g)?.length).toBe(1);
  });

  test('a copy of a divided spell shows the shares and no stepper', () => {
    const decision = {
      id: 'd',
      seat: 0,
      kind: 'targets',
      source: 'o9',
      forCopy: true,
      current: [t('o1', { share: 2 }), t('o2', { share: 1 })],
      specs: [{ specId: 't1', min: 2, max: 2, keepsDivision: true, legal: [t('o1'), t('o2')] }],
    } as unknown as TargetsDecision;
    const out = renderToStaticMarkup(
      <TargetsPanel
        decision={decision}
        view={viewOf([goblin, elf, spell], decision)}
        ui={initialUi(decision)}
        update={none}
      />,
    );
    expect(out).toContain('data-divide-kept');
    expect(out).toContain('Goblin 2');
    expect(out).toContain('Elf 1');
    expect(out).toContain('The division cannot be changed.');
    expect(out).not.toContain('More damage to');
    expect(out).not.toContain('Even split');
    expect(out).not.toContain('data-divide="t1"');
  });
});

describe('restricted mana in a pool', () => {
  const mana = (color: string, restriction: unknown = null) => ({
    color,
    snow: false,
    source: 'o1',
    restriction,
  });

  test('free mana first, restricted mana outlined with what it can pay for', () => {
    const pool = [
      mana('W', { kind: 'spellMatch', subtypes: ['Angel'] }),
      mana('R'),
    ] as unknown as SeatView['manaPool'];
    const out = renderToStaticMarkup(<ManaPool pool={pool} />);
    expect(out).toContain('data-pool="RW"');
    expect(out).toContain('data-pool-restricted="W"');
    expect(out).toContain('class="board-pool-restricted"');
    expect(out).toContain('title="Spend only to cast an Angel spell"');
  });

  test('an ordinary pool is as it was', () => {
    const out = renderToStaticMarkup(
      <ManaPool pool={[mana('G'), mana('G')] as unknown as SeatView['manaPool']} />,
    );
    expect(out).toContain('data-pool="GG"');
    expect(out).not.toContain('data-pool-restricted');
    expect(out).not.toContain('board-pool-restricted');
  });
});
