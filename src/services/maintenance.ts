import type { MaintenanceState, MaintenanceStatus } from '../types';

// Etat brut stocke en base (toujours la ligne id = 1).
export async function getMaintenanceState(db: D1Database): Promise<MaintenanceState> {
  const row = await db
    .prepare(
      'SELECT id, is_enabled, starts_at, ends_at, message, updated_at, updated_by FROM maintenance_state WHERE id = 1'
    )
    .first<MaintenanceState>();

  // Filet de securite : si la ligne n'existe pas encore, on renvoie un etat desactive.
  return (
    row ?? {
      id: 1,
      is_enabled: 0,
      starts_at: null,
      ends_at: null,
      message: null,
      updated_at: null,
      updated_by: null,
    }
  );
}

/**
 * Calcule si la maintenance est *effectivement* active a l'instant `now`.
 * Regle : interrupteur active ET (pas de date de debut OU debut passe)
 *         ET (pas de date de fin OU fin pas encore atteinte).
 * Cela permet la programmation (debut futur) et l'auto-extinction (fin passee).
 */
export function isMaintenanceActive(state: MaintenanceState, now: Date = new Date()): boolean {
  if (Number(state.is_enabled) !== 1) return false;

  const ts = now.getTime();

  if (state.starts_at) {
    const start = Date.parse(state.starts_at);
    if (!Number.isNaN(start) && ts < start) return false; // pas encore commence
  }

  if (state.ends_at) {
    const end = Date.parse(state.ends_at);
    if (!Number.isNaN(end) && ts > end) return false; // deja termine
  }

  return true;
}

// Statut public expose au front (etat effectif + infos d'affichage).
export function buildMaintenanceStatus(state: MaintenanceState): MaintenanceStatus {
  return {
    active: isMaintenanceActive(state),
    is_enabled: Number(state.is_enabled) === 1,
    starts_at: state.starts_at ?? null,
    ends_at: state.ends_at ?? null,
    message: state.message ?? null,
  };
}

export type MaintenanceUpdate = {
  is_enabled: boolean;
  starts_at: string | null;
  ends_at: string | null;
  message: string | null;
  updated_by: string;
};

// Met a jour la ligne unique (upsert defensif).
export async function setMaintenanceState(db: D1Database, update: MaintenanceUpdate): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO maintenance_state (id, is_enabled, starts_at, ends_at, message, updated_at, updated_by)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         is_enabled = excluded.is_enabled,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         message = excluded.message,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    )
    .bind(
      update.is_enabled ? 1 : 0,
      update.starts_at,
      update.ends_at,
      update.message,
      now,
      update.updated_by
    )
    .run();
}
