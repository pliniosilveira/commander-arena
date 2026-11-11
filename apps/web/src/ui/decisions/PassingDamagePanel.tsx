/**
 * "Damage getting through" (issue 106): while the player declares blockers, what each defender takes
 * from the attackers nobody blocks and from tramplers' excess, updated with every block picked. The
 * numbers come from `combat-damage-preview.ts` and are the plain combat damage, which the caption says.
 */
import type { DeclareBlockersDecision, GameView } from '@commander-arena/engine';
import type { BlockPick } from './block';
import {
  type PassingTarget,
  passingDamage,
  passingHeadline,
  passingRemaining,
} from './combat-damage-preview';
import { objectIndex } from './lookup';

function Row({ t }: { t: PassingTarget }) {
  const remaining = passingRemaining(t);
  const sources = t.sources
    .map((s) => `${s.name} ${s.amount}${s.how === 'trample' ? ' (trample)' : ''}`)
    .join(', ');
  const lethalWord =
    t.target.kind === 'player'
      ? t.poison > 0 && t.damage === 0
        ? 'Lethal poison'
        : 'Lethal'
      : 'Destroyed';
  return (
    <li
      className="dec-pass-row"
      data-passing-lethal={t.lethal}
      data-passing-target={t.target.kind === 'player' ? `seat-${t.target.seat}` : t.target.object}
    >
      <strong className="dec-pass-head">{passingHeadline(t)}</strong>
      {remaining === '' ? null : <span className="dec-pass-left">{remaining}</span>}
      {t.lethal ? (
        <span className="dec-pass-lethal" role="alert">
          {lethalWord}
        </span>
      ) : null}
      <small className="dec-pass-from">{sources}</small>
    </li>
  );
}

export function PassingDamagePanel({
  view,
  decision,
  blocks,
}: {
  view: GameView;
  decision: Pick<DeclareBlockersDecision, 'attackers'>;
  blocks: readonly BlockPick[];
}) {
  const rows = passingDamage(view, decision, blocks, objectIndex(view));
  return (
    <section className="dec-panel dec-passing-damage" aria-label="Damage getting through">
      <h3 className="dec-panel-title">Damage getting through</h3>
      {rows.length === 0 ? (
        <p className="dec-sub dec-left" data-passing-none>
          None: every attacker is blocked.
        </p>
      ) : (
        <ul className="dec-pass-list" aria-live="polite">
          {rows.map((t) => (
            <Row key={t.target.kind === 'player' ? `p${t.target.seat}` : t.target.object} t={t} />
          ))}
        </ul>
      )}
      <p className="dec-sub dec-left dec-pass-note">
        Plain combat damage as it stands: first strike, tricks and prevention can change it.
      </p>
    </section>
  );
}
