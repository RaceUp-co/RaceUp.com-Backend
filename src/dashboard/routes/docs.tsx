import { Hono } from 'hono';
import { html } from 'hono/html';
import type { AppType } from '../../types';
import { Layout } from '../layout';

type EndpointDef = {
  method: string;
  path: string;
  description: string;
  auth: string;
  body?: string;
  response?: string;
};

type EndpointGroup = {
  name: string;
  endpoints: EndpointDef[];
};

const API_REGISTRY: EndpointGroup[] = [
  {
    name: 'Auth',
    endpoints: [
      { method: 'POST', path: '/api/auth/register', auth: '-', description: 'Creer un compte', body: '{"email":"...","password":"...","username":"...","first_name":"...","last_name":"..."}', response: '{"success":true,"data":{"accessToken":"...","refreshToken":"...","user":{...}}}' },
      { method: 'POST', path: '/api/auth/login', auth: '-', description: 'Connexion email/password', body: '{"email":"...","password":"..."}', response: '{"success":true,"data":{"accessToken":"...","refreshToken":"...","user":{...}}}' },
      { method: 'POST', path: '/api/auth/google', auth: '-', description: 'OAuth Google', body: '{"access_token":"..."}' },
      { method: 'POST', path: '/api/auth/apple', auth: '-', description: 'OAuth Apple', body: '{"id_token":"...","first_name":"...","last_name":"..."}' },
      { method: 'POST', path: '/api/auth/refresh', auth: '-', description: 'Renouveler tokens', body: '{"refresh_token":"..."}' },
      { method: 'POST', path: '/api/auth/refresh-session', auth: '-', description: 'Refresh via cookie HttpOnly' },
      { method: 'GET', path: '/api/auth/me', auth: 'JWT', description: 'Profil utilisateur courant' },
      { method: 'PATCH', path: '/api/auth/me', auth: 'JWT', description: 'Modifier profil', body: '{"first_name":"...","last_name":"...","username":"...","birth_date":"..."}' },
      { method: 'POST', path: '/api/auth/change-password', auth: 'JWT', description: 'Changer mot de passe', body: '{"current_password":"...","new_password":"..."}' },
      { method: 'POST', path: '/api/auth/change-email', auth: 'JWT', description: 'Changer email', body: '{"new_email":"...","password":"..."}' },
      { method: 'POST', path: '/api/auth/logout', auth: 'JWT', description: 'Deconnexion' },
      { method: 'DELETE', path: '/api/auth/account', auth: 'JWT', description: 'Supprimer compte', body: '{"password":"..."}' },
    ],
  },
  {
    name: 'Projects',
    endpoints: [
      { method: 'GET', path: '/api/projects', auth: 'JWT', description: 'Liste projets utilisateur' },
      { method: 'POST', path: '/api/projects', auth: 'JWT', description: 'Creer un projet', body: '{"name":"...","service_type":"...","tier":"..."}' },
      { method: 'GET', path: '/api/projects/:id', auth: 'JWT', description: 'Detail projet' },
      { method: 'PATCH', path: '/api/projects/:id', auth: 'JWT', description: 'Renommer projet', body: '{"name":"..."}' },
      { method: 'DELETE', path: '/api/projects/:id', auth: 'JWT', description: 'Archiver projet (soft delete)' },
    ],
  },
  {
    name: 'Tickets',
    endpoints: [
      { method: 'GET', path: '/api/projects/:id/tickets', auth: 'JWT', description: 'Liste tickets du projet' },
      { method: 'POST', path: '/api/projects/:id/tickets', auth: 'JWT', description: 'Creer ticket', body: '{"subject":"...","message":"..."}' },
      { method: 'GET', path: '/api/projects/:id/tickets/:ticketId', auth: 'JWT', description: 'Detail ticket + messages' },
      { method: 'PATCH', path: '/api/projects/:id/tickets/:ticketId', auth: 'JWT', description: 'Changer statut', body: '{"status":"open|resolved"}' },
      { method: 'POST', path: '/api/projects/:id/tickets/:ticketId/messages', auth: 'JWT', description: 'Ajouter message', body: '{"content":"..."}' },
    ],
  },
  {
    name: 'Files',
    endpoints: [
      { method: 'GET', path: '/api/projects/:id/files', auth: 'JWT', description: 'Liste fichiers du projet' },
      { method: 'POST', path: '/api/projects/:id/files', auth: 'JWT', description: 'Upload fichier (multipart/form-data)' },
      { method: 'GET', path: '/api/projects/:id/files/:fileId/download', auth: 'JWT', description: 'Telecharger fichier' },
      { method: 'DELETE', path: '/api/projects/:id/files/:fileId', auth: 'JWT', description: 'Supprimer fichier' },
    ],
  },
  {
    name: 'Admin',
    endpoints: [
      { method: 'GET', path: '/api/admin/dashboard/overview', auth: 'JWT+Admin', description: 'Stats globales' },
      { method: 'GET', path: '/api/admin/dashboard/signups?days=30', auth: 'JWT+Admin', description: 'Inscriptions par jour' },
      { method: 'GET', path: '/api/admin/dashboard/visits?days=30', auth: 'JWT+Admin', description: 'Pages vues par jour' },
      { method: 'GET', path: '/api/admin/users?q=&page=1&limit=50', auth: 'JWT+Admin', description: 'Liste utilisateurs' },
      { method: 'GET', path: '/api/admin/users/:id', auth: 'JWT+Admin', description: 'Detail utilisateur' },
      { method: 'PATCH', path: '/api/admin/users/:id/role', auth: 'JWT+SuperAdmin', description: 'Changer role', body: '{"role":"user|admin|super_admin"}' },
      { method: 'GET', path: '/api/admin/projects', auth: 'JWT+Admin', description: 'Tous les projets' },
      { method: 'POST', path: '/api/admin/projects', auth: 'JWT+Admin', description: 'Creer projet pour un user', body: '{"user_id":"...","name":"...","service_type":"...","start_date":"..."}' },
    ],
  },
  {
    name: 'Tracking',
    endpoints: [
      { method: 'POST', path: '/api/track/pageview', auth: '-', description: 'Enregistrer page vue', body: '{"path":"/fr/services/"}' },
    ],
  },
  {
    name: 'Health',
    endpoints: [
      { method: 'GET', path: '/api/health', auth: '-', description: 'Health check', response: '{"status":"ok","timestamp":"..."}' },
    ],
  },
];

const docsRoutes = new Hono<AppType>();

docsRoutes.get('/docs', (c) => {
  const session = c.get('dashboardSession');
  const isProd = c.env.ENVIRONMENT === 'production';
  const apiBase = isProd
    ? 'https://raceup-backend-api.jacqueslucas-m2101.workers.dev'
    : 'http://localhost:8787';

  return c.html(
    <Layout title="Documentation API" currentPath="/dashboard/docs" role={session.role}>
      <div class="filters" style="margin-bottom:16px;">
        <label style="font-size:12px;color:#707090;">Bearer Token:</label>
        <input type="text" id="global-token" placeholder="Coller le JWT ici..." style="width:400px;" />
      </div>

      {API_REGISTRY.map((group) => (
        <div>
          <h2 class="section-title">{group.name}</h2>
          {group.endpoints.map((ep, idx) => {
            const testerId = `tester-${group.name}-${idx}`;
            const methodColor = ep.method === 'GET' ? '#4caf50' : ep.method === 'POST' ? '#4a9eff' : ep.method === 'PATCH' ? '#ff9f43' : ep.method === 'DELETE' ? '#ff4444' : '#d0d0d0';
            return (
              <details>
                <summary>
                  <span style={`color:${methodColor};font-weight:bold;margin-right:8px;`}>{ep.method}</span>
                  <code>{ep.path}</code>
                  <span style="color:#707090;margin-left:8px;font-size:11px;">— {ep.description}</span>
                  <span style="float:right;font-size:10px;color:#707090;">{ep.auth}</span>
                </summary>
                <div class="detail-body">
                  <p style="font-size:12px;color:#707090;margin-bottom:8px;">Auth: {ep.auth}</p>
                  {ep.body && (
                    <div class="form-group">
                      <label>Body (JSON)</label>
                      <textarea id={`${testerId}-body`} rows={3}>{ep.body}</textarea>
                    </div>
                  )}
                  {ep.response && (
                    <div>
                      <label style="font-size:12px;color:#707090;">Exemple de reponse:</label>
                      <pre><code>{ep.response}</code></pre>
                    </div>
                  )}
                  <button
                    class="btn"
                    style="margin-top:8px;"
                    onclick={`testEndpoint('${apiBase}','${ep.method}','${ep.path}','${testerId}')`}
                  >
                    Envoyer
                  </button>
                  <pre id={`${testerId}-result`} style="margin-top:8px;display:none;"></pre>
                </div>
              </details>
            );
          })}
        </div>
      ))}

      {html`<script>
        async function testEndpoint(base, method, path, testerId) {
          const resultEl = document.getElementById(testerId + '-result');
          const bodyEl = document.getElementById(testerId + '-body');
          const token = document.getElementById('global-token').value;
          resultEl.style.display = 'block';
          resultEl.textContent = 'Chargement...';

          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = 'Bearer ' + token;

          const opts = { method, headers };
          if (bodyEl && bodyEl.value && method !== 'GET') {
            opts.body = bodyEl.value;
          }

          try {
            const res = await fetch(base + path, opts);
            const text = await res.text();
            try {
              resultEl.textContent = res.status + ' ' + res.statusText + '\\n\\n' + JSON.stringify(JSON.parse(text), null, 2);
            } catch {
              resultEl.textContent = res.status + ' ' + res.statusText + '\\n\\n' + text;
            }
          } catch (err) {
            resultEl.textContent = 'Erreur: ' + err.message;
          }
        }
      </script>`}
    </Layout>
  );
});

export default docsRoutes;
