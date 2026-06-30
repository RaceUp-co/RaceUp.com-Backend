import { Hono } from 'hono';
import type { AppType } from '../types';
import { getMaintenanceState, buildMaintenanceStatus } from '../services/maintenance';

const maintenanceRoutes = new Hono<AppType>();

// GET /api/maintenance (public) — statut effectif consomme par le front.
// Renvoie toujours 200 ; le front fail-open sur erreur reseau.
maintenanceRoutes.get('/', async (c) => {
  const state = await getMaintenanceState(c.env.DB);
  return c.json({ success: true, data: buildMaintenanceStatus(state) });
});

export default maintenanceRoutes;
