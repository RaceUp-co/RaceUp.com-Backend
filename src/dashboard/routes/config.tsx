import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';

const configRoutes = new Hono<AppType>();

configRoutes.get('/config', (c) => {
  const session = c.get('dashboardSession');
  return c.html(
    <Layout title="Configuration" currentPath="/dashboard/config" role={session.role}>
      <div style="text-align:center;padding:60px 0;color:#707090;">
        <p style="font-size:48px;margin-bottom:16px;">&#9881;</p>
        <p style="font-size:16px;">Bientot disponible</p>
        <p style="font-size:12px;margin-top:8px;">Feature flags, cles API, configuration des routes</p>
      </div>
    </Layout>
  );
});

export default configRoutes;
