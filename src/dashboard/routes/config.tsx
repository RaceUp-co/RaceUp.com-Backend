import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import {
  getMaintenanceState,
  isMaintenanceActive,
  setMaintenanceState,
} from '../../services/maintenance';

const configRoutes = new Hono<AppType>();

// Coupe une valeur ISO/datetime pour la reinjecter dans un <input type="datetime-local">
// (l'input attend exactement "YYYY-MM-DDTHH:MM").
function toDatetimeLocalValue(v: string | null): string {
  if (!v) return '';
  // "2026-07-06T20:00:00.000Z" ou "2026-07-06T20:00" -> "2026-07-06T20:00"
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]}T${m[2]}` : '';
}

function formatHuman(v: string | null): string {
  if (!v) return '—';
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return v;
  const [, y, mo, d, h, mi] = m;
  return `${d}/${mo}/${y} a ${h}:${mi}`;
}

configRoutes.get('/config', async (c) => {
  const session = c.get('dashboardSession');
  const state = await getMaintenanceState(c.env.DB);
  const active = isMaintenanceActive(state);
  const enabled = Number(state.is_enabled) === 1;
  const msg = c.req.query('msg') ?? '';

  // Banniere de statut courant
  const statusBox = active
    ? { bg: '#2a1515', border: '#ff6b6b', color: '#ff6b6b', label: 'EN MAINTENANCE — le site public est actuellement bloque (sauf admins).' }
    : enabled
      ? { bg: '#2a2a15', border: '#ff9f43', color: '#ff9f43', label: 'Programmee — interrupteur actif mais hors de la fenetre horaire (site accessible).' }
      : { bg: '#152a15', border: '#4caf50', color: '#4caf50', label: 'Site en ligne — aucune maintenance active.' };

  return c.html(
    <Layout title="Configuration" currentPath="/dashboard/config" role={session.role}>
      <h2 class="section-title">Mode maintenance du site officiel</h2>

      {msg === 'saved' && (
        <div style="background:#1a3a1a;border:1px solid #4caf50;color:#4caf50;padding:8px;font-size:12px;margin:12px 0;border-radius:3px;">
          Configuration enregistree avec succes.
        </div>
      )}
      {msg === 'invalid_dates' && (
        <div style="background:#3a1a1a;border:1px solid #ff6b6b;color:#ff6b6b;padding:8px;font-size:12px;margin:12px 0;border-radius:3px;">
          La date de fin doit etre posterieure a la date de debut.
        </div>
      )}

      <div style={`background:${statusBox.bg};border:1px solid ${statusBox.border};color:${statusBox.color};padding:12px;font-size:13px;margin:12px 0;border-radius:4px;font-weight:600;`}>
        {statusBox.label}
      </div>

      <p style="color:#707090;font-size:12px;max-width:640px;margin-bottom:16px;">
        Quand la maintenance est active, toutes les pages du site public affichent une page d'indisponibilite.
        Seuls les comptes <strong>admin</strong> et <strong>super_admin</strong> continuent d'acceder au site.
        Les dates sont optionnelles : sans date de fin, l'ecran indiquera une duree indeterminee.
      </p>

      <form method="post" action="/dashboard/config/maintenance" style="max-width:640px;">
        <div class="form-group" style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <input type="checkbox" id="is_enabled" name="is_enabled" value="on" checked={enabled} style="width:auto;" />
          <label for="is_enabled" style="margin:0;cursor:pointer;">Activer le mode maintenance</label>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Date et heure de debut (optionnel)</label>
            <input type="datetime-local" name="starts_at" value={toDatetimeLocalValue(state.starts_at)} />
            <span style="color:#707090;font-size:11px;">Vide = demarre immediatement.</span>
          </div>
          <div class="form-group">
            <label>Date et heure de fin (optionnel)</label>
            <input type="datetime-local" name="ends_at" value={toDatetimeLocalValue(state.ends_at)} />
            <span style="color:#707090;font-size:11px;">Vide = duree indeterminee.</span>
          </div>
        </div>

        <div class="form-group" style="margin-top:12px;">
          <label>Message personnalise (optionnel)</label>
          <textarea name="message" rows={2} placeholder="Laisser vide pour le message par defaut.">{state.message ?? ''}</textarea>
        </div>

        <button type="submit" class="btn" style="margin-top:8px;">Enregistrer la configuration</button>
      </form>

      <table style="margin-top:24px;width:auto;font-size:12px;color:#707090;">
        <tr><td style="padding-right:20px;">Debut programme</td><td style="color:#fff;">{formatHuman(state.starts_at)}</td></tr>
        <tr><td style="padding-right:20px;">Fin programmee</td><td style="color:#fff;">{formatHuman(state.ends_at)}</td></tr>
        <tr><td style="padding-right:20px;">Derniere modif.</td><td style="color:#fff;">{state.updated_at ? formatHuman(state.updated_at) : '—'}{state.updated_by ? ` par ${state.updated_by}` : ''}</td></tr>
      </table>
    </Layout>
  );
});

// POST /config/maintenance — enregistre la configuration du mode maintenance.
configRoutes.post('/config/maintenance', async (c) => {
  const session = c.get('dashboardSession');
  const body = await c.req.parseBody();

  const isEnabled = String(body['is_enabled'] ?? '') === 'on';
  const startsAt = String(body['starts_at'] ?? '').trim() || null;
  const endsAt = String(body['ends_at'] ?? '').trim() || null;
  const message = String(body['message'] ?? '').trim().slice(0, 500) || null;

  // Coherence des dates : fin > debut si les deux sont fournies.
  if (startsAt && endsAt) {
    const s = Date.parse(startsAt);
    const e = Date.parse(endsAt);
    if (!Number.isNaN(s) && !Number.isNaN(e) && e <= s) {
      return c.redirect('/dashboard/config?msg=invalid_dates');
    }
  }

  await setMaintenanceState(c.env.DB, {
    is_enabled: isEnabled,
    starts_at: startsAt,
    ends_at: endsAt,
    message,
    updated_by: session.email,
  });

  return c.redirect('/dashboard/config?msg=saved');
});

export default configRoutes;
