import type { EntityManager } from 'typeorm';
import { planDisplayNameChange } from './display-name.policy.js';

export interface ProfileActor {
  id: string;
  type: 'USER' | 'ADMIN';
}

/** Call inside the profile/username transaction; the row lock serializes both paths. */
export async function writeDisplayName(
  manager: EntityManager,
  id: string,
  requested: string,
  actor: ProfileActor,
): Promise<void> {
  const rows: { displayName: string | null; lastChange: Date | null }[] =
    await manager.query(
      `SELECT display_name AS "displayName", last_display_name_changed_at AS "lastChange"
       FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
      [id],
    );
  if (!rows[0]) return;
  // Read time after acquiring the lock, not at transaction start before a wait.
  const [{ now }]: { now: Date }[] = await manager.query(
    'SELECT clock_timestamp() AS now',
  );
  const plan = planDisplayNameChange(
    rows[0].displayName,
    rows[0].lastChange,
    requested,
    now,
    actor.type === 'ADMIN',
  );
  if (!plan.changed) return;
  await manager.query(
    `UPDATE users SET display_name=$2,
       last_display_name_changed_at=CASE WHEN $5::boolean THEN last_display_name_changed_at ELSE $3::timestamptz END,
       updated_at=$4 WHERE id=$1`,
    [id, plan.displayName, plan.lastChange, now, actor.type === 'ADMIN'],
  );
  await manager.query(
    `INSERT INTO display_name_changes(user_id,actor_id,actor_type,old_name,new_name,changed_at)
     VALUES($1,$2,$3,$4,$5,$6)`,
    [id, actor.id, actor.type, rows[0].displayName, plan.displayName, now],
  );
}
