# Dashboard Admin RaceUp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal admin dashboard server-rendered with Hono JSX inside the existing `raceup-backend-api` Worker, with session cookie auth, request logging, SQL explorer, and API documentation with integrated tester.

**Architecture:** All dashboard pages live under `/dashboard/*` in the same Cloudflare Worker. Hono JSX renders HTML server-side. A logger middleware intercepts all requests and stores metrics in a new `request_logs` D1 table. Dashboard auth uses HMAC-signed cookies independent of the API JWT system.

**Tech Stack:** Hono 4.7+ JSX, Cloudflare Workers, D1 (SQLite), TypeScript, Web Crypto API (HMAC-SHA256)

**Note:** This project has no test infrastructure (vitest/miniflare not configured). Each task includes manual verification via `npm run dev` + curl/browser.

---

## File Structure

### New files to create

```
src/
├── dashboard/
│   ├── styles.ts               # CSS template string
│   ├── session.ts              # HMAC cookie sign/verify/middleware
│   ├── layout.tsx              # HTML layout (head, sidebar, main)
│   ├── components/
│   │   ├── nav.tsx             # Sidebar navigation
│   │   ├── table.tsx           # Reusable paginated table
│   │   ├── stat-card.tsx       # Stat card (value + delta)
│   │   └── chart.tsx           # SVG bar/line chart
│   └── routes/
│       ├── auth.tsx            # GET/POST /dashboard/login, /dashboard/logout
│       ├── overview.tsx        # GET /dashboard/
│       ├── logs.tsx            # GET /dashboard/logs
│       ├── errors.tsx          # GET /dashboard/errors
│       ├── users.tsx           # GET /dashboard/users, /dashboard/users/:id
│       ├── projects.tsx        # GET /dashboard/projects, /dashboard/projects/:id
│       ├── database.tsx        # GET/POST /dashboard/database
│       ├── docs.tsx            # GET /dashboard/docs
│       └── config.tsx          # GET /dashboard/config (placeholder)
├── middleware/
│   └── logger.ts              # Request logging middleware → D1
db/
└── migrations/
    └── 002_request_logs.sql   # New table
```

### Files to modify

```
src/index.ts                   # Mount dashboard routes + logger middleware
src/types.ts                   # Add DashboardSession to Variables
tsconfig.json                  # Enable JSX
docs/architecture.md           # Update documentation
```

---

### Task 1: Enable JSX and create migration

**Files:**
- Modify: `tsconfig.json`
- Create: `db/migrations/002_request_logs.sql`
- Modify: `src/types.ts`

- [ ] **Step 1: Update tsconfig.json for Hono JSX**

Add JSX support and include `.tsx` files:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ESNext"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Create the request_logs migration**

Create `db/migrations/002_request_logs.sql`:

```sql
-- Request logs for dashboard monitoring
CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  user_id TEXT,
  ip TEXT,
  country TEXT,
  user_agent TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_path ON request_logs(path);
CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code);
```

- [ ] **Step 3: Add DashboardSession type to types.ts**

Add after the `Variables` type:

```typescript
export type DashboardSession = {
  userId: string;
  email: string;
  role: string;
  exp: number;
};
```

Add `dashboardSession` to the `Variables` type:

```typescript
export type Variables = {
  jwtPayload: {
    sub: string;
    email: string;
    username: string;
    iat: number;
    exp: number;
  };
  currentUser: User;
  dashboardSession: DashboardSession;
};
```

- [ ] **Step 4: Apply migration locally**

Run:
```bash
npx wrangler d1 execute RaceUp-User-Data --local --file=db/migrations/002_request_logs.sql
```

Expected: "Executed X commands" with no errors.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json db/migrations/002_request_logs.sql src/types.ts
git commit -m "feat(dashboard): enable JSX, add request_logs table, add DashboardSession type"
```

---

### Task 2: Logger middleware

**Files:**
- Create: `src/middleware/logger.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create the logger middleware**

Create `src/middleware/logger.ts`:

```typescript
import type { Context, Next } from 'hono';
import type { AppType } from '../types';

export async function loggerMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<void> {
  const start = Date.now();

  await next();

  const duration = Date.now() - start;
  const path = new URL(c.req.url).pathname;

  // Skip logging dashboard asset requests and the login page itself
  if (path === '/dashboard/login' && c.req.method === 'GET') return;

  // Extract user_id from JWT payload if available
  let userId: string | null = null;
  try {
    const payload = c.get('jwtPayload');
    if (payload?.sub) userId = payload.sub;
  } catch {
    // No JWT payload available
  }

  // Extract error message for failed requests
  let error: string | null = null;
  if (c.res.status >= 400) {
    try {
      const cloned = c.res.clone();
      const body = await cloned.text();
      error = body.substring(0, 500);
    } catch {
      error = null;
    }
  }

  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null;
  const country = c.req.header('cf-ipcountry') ?? null;
  const userAgent = c.req.header('user-agent') ?? null;

  // Fire-and-forget: don't block the response
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      'INSERT INTO request_logs (method, path, status_code, duration_ms, user_id, ip, country, user_agent, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        c.req.method,
        path,
        c.res.status,
        duration,
        userId,
        ip,
        country,
        userAgent,
        error,
        new Date().toISOString()
      )
      .run()
      .catch((err) => console.error('Logger error:', err))
  );
}
```

- [ ] **Step 2: Mount logger in index.ts**

Add import at top of `src/index.ts`:

```typescript
import { loggerMiddleware } from './middleware/logger';
```

Add the middleware BEFORE the CORS middleware (so it catches all routes including dashboard):

```typescript
// Logger — intercepts all requests for dashboard metrics
app.use('*', loggerMiddleware);
```

- [ ] **Step 3: Verify locally**

Run `npm run dev`, then:
```bash
curl http://localhost:8787/api/health
```

Check D1 local database has a new row in `request_logs`:
```bash
npx wrangler d1 execute RaceUp-User-Data --local --command="SELECT * FROM request_logs LIMIT 5"
```

Expected: One row with method=GET, path=/api/health, status_code=200.

- [ ] **Step 4: Commit**

```bash
git add src/middleware/logger.ts src/index.ts
git commit -m "feat(dashboard): add request logger middleware writing to D1"
```

---

### Task 3: Dashboard styles

**Files:**
- Create: `src/dashboard/styles.ts`

- [ ] **Step 1: Create the CSS template**

Create `src/dashboard/styles.ts`:

```typescript
export const dashboardCSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; background: #0f0f1a; color: #d0d0d0; display: flex; min-height: 100vh; }
  a { color: #4a9eff; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Sidebar */
  .sidebar { width: 220px; background: #1a1a2e; border-right: 1px solid #2a2a4a; padding: 16px 0; flex-shrink: 0; display: flex; flex-direction: column; }
  .sidebar-title { padding: 0 16px 16px; font-size: 14px; font-weight: bold; color: #4a9eff; border-bottom: 1px solid #2a2a4a; margin-bottom: 8px; }
  .sidebar a { display: block; padding: 8px 16px; color: #a0a0b0; font-size: 13px; }
  .sidebar a:hover, .sidebar a.active { background: #2a2a4a; color: #fff; text-decoration: none; }
  .sidebar .logout { margin-top: auto; border-top: 1px solid #2a2a4a; padding-top: 8px; }
  .sidebar .logout a { color: #ff6b6b; }

  /* Main */
  .main { flex: 1; padding: 24px; overflow-x: auto; }
  .page-title { font-size: 18px; color: #fff; margin-bottom: 20px; border-bottom: 1px solid #2a2a4a; padding-bottom: 8px; }

  /* Stat cards */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .stat-card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 4px; padding: 14px; }
  .stat-label { font-size: 11px; color: #707090; text-transform: uppercase; margin-bottom: 4px; }
  .stat-value { font-size: 24px; font-weight: bold; color: #fff; }
  .stat-delta { font-size: 11px; margin-top: 4px; }
  .stat-delta.positive { color: #4caf50; }
  .stat-delta.negative { color: #ff6b6b; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
  th { background: #1a1a2e; color: #707090; text-align: left; padding: 8px 10px; border-bottom: 2px solid #2a2a4a; font-size: 11px; text-transform: uppercase; }
  td { padding: 6px 10px; border-bottom: 1px solid #1a1a2e; }
  tr:nth-child(even) { background: #12121f; }
  tr:hover { background: #1e1e35; }
  tr.error-row { background: #2a1515; }
  tr.error-row:hover { background: #3a1f1f; }

  /* Filters */
  .filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .filters select, .filters input { background: #1a1a2e; border: 1px solid #2a2a4a; color: #d0d0d0; padding: 6px 8px; font-size: 12px; font-family: inherit; border-radius: 3px; }
  .filters button { background: #4a9eff; color: #fff; border: none; padding: 6px 12px; font-size: 12px; cursor: pointer; font-family: inherit; border-radius: 3px; }
  .filters button:hover { background: #3a8eef; }

  /* Pagination */
  .pagination { display: flex; gap: 8px; align-items: center; margin-top: 12px; font-size: 12px; }
  .pagination a { padding: 4px 10px; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 3px; }
  .pagination a.disabled { opacity: 0.3; pointer-events: none; }
  .pagination .current { color: #4a9eff; }

  /* Forms */
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; color: #707090; margin-bottom: 4px; }
  .form-group input, .form-group select, .form-group textarea { width: 100%; background: #1a1a2e; border: 1px solid #2a2a4a; color: #d0d0d0; padding: 8px; font-size: 13px; font-family: inherit; border-radius: 3px; }
  .form-group textarea { min-height: 120px; resize: vertical; }
  .btn { background: #4a9eff; color: #fff; border: none; padding: 8px 16px; font-size: 13px; cursor: pointer; font-family: inherit; border-radius: 3px; }
  .btn:hover { background: #3a8eef; }
  .btn-danger { background: #ff4444; }
  .btn-danger:hover { background: #ee3333; }

  /* Login page */
  .login-wrapper { display: flex; align-items: center; justify-content: center; min-height: 100vh; width: 100%; }
  .login-box { background: #1a1a2e; border: 1px solid #2a2a4a; padding: 32px; width: 360px; border-radius: 4px; }
  .login-box h1 { font-size: 16px; color: #fff; margin-bottom: 20px; text-align: center; }
  .login-error { background: #2a1515; border: 1px solid #ff4444; color: #ff6b6b; padding: 8px; font-size: 12px; margin-bottom: 12px; border-radius: 3px; }

  /* Charts */
  .chart-container { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 4px; padding: 16px; margin-bottom: 20px; }
  .chart-title { font-size: 12px; color: #707090; text-transform: uppercase; margin-bottom: 12px; }

  /* Section title */
  .section-title { font-size: 14px; color: #fff; margin: 20px 0 10px; }

  /* Accordion (docs) */
  details { background: #1a1a2e; border: 1px solid #2a2a4a; margin-bottom: 4px; border-radius: 3px; }
  details summary { padding: 10px 12px; cursor: pointer; font-size: 13px; color: #d0d0d0; }
  details summary:hover { background: #2a2a4a; }
  details[open] summary { border-bottom: 1px solid #2a2a4a; color: #fff; }
  details .detail-body { padding: 12px; }
  pre { background: #0a0a15; padding: 10px; overflow-x: auto; font-size: 12px; border-radius: 3px; border: 1px solid #2a2a4a; }
  code { color: #4caf50; }

  /* SQL explorer */
  .sql-result { max-height: 500px; overflow: auto; }

  /* Badge */
  .badge { display: inline-block; padding: 2px 6px; font-size: 10px; border-radius: 2px; }
  .badge-admin { background: #4a9eff22; color: #4a9eff; }
  .badge-super { background: #ff9f4322; color: #ff9f43; }
  .badge-user { background: #2a2a4a; color: #707090; }
  .badge-ok { background: #4caf5022; color: #4caf50; }
  .badge-error { background: #ff444422; color: #ff4444; }

  /* Period selector */
  .period-selector { display: flex; gap: 4px; margin-bottom: 16px; }
  .period-selector a { padding: 4px 10px; background: #1a1a2e; border: 1px solid #2a2a4a; font-size: 12px; border-radius: 3px; color: #a0a0b0; }
  .period-selector a.active { background: #4a9eff; color: #fff; border-color: #4a9eff; }
`;
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/styles.ts
git commit -m "feat(dashboard): add CSS styles template"
```

---

### Task 4: Session management (HMAC cookie)

**Files:**
- Create: `src/dashboard/session.ts`

- [ ] **Step 1: Create the session module**

Create `src/dashboard/session.ts`:

```typescript
import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppType, DashboardSession } from '../types';
import { getUserByEmail } from '../services/user';
import { verifyPassword } from '../services/password';

const COOKIE_NAME = 'dashboard_session';
const SESSION_DURATION = 7200; // 2 hours in seconds

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function createSessionCookie(
  c: Context<AppType>,
  userId: string,
  email: string,
  role: string
): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION;
  const payload: DashboardSession = { userId, email, role, exp };
  const payloadStr = JSON.stringify(payload);

  const encoder = new TextEncoder();
  const key = await getHmacKey(c.env.JWT_SECRET);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadStr));

  const payloadB64 = base64UrlEncode(encoder.encode(payloadStr));
  const sigB64 = base64UrlEncode(signature);
  const cookieValue = `${payloadB64}.${sigB64}`;

  const isProd = c.env.ENVIRONMENT === 'production';
  setCookie(c, COOKIE_NAME, cookieValue, {
    path: '/dashboard',
    httpOnly: true,
    secure: isProd,
    sameSite: 'Strict',
    maxAge: SESSION_DURATION,
    ...(isProd ? { domain: '.raceup.com' } : {}),
  });
}

export async function verifySessionCookie(
  c: Context<AppType>
): Promise<DashboardSession | null> {
  const cookie = getCookie(c, COOKIE_NAME);
  if (!cookie) return null;

  const parts = cookie.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;

  try {
    const payloadBytes = base64UrlDecode(payloadB64);
    const signatureBytes = base64UrlDecode(sigB64);

    const key = await getHmacKey(c.env.JWT_SECRET);
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, payloadBytes);
    if (!valid) return null;

    const decoder = new TextDecoder();
    const payload: DashboardSession = JSON.parse(decoder.decode(payloadBytes));

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export function clearSessionCookie(c: Context<AppType>): void {
  deleteCookie(c, COOKIE_NAME, { path: '/dashboard' });
}

export async function dashboardAuthMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<Response | void> {
  const session = await verifySessionCookie(c);
  if (!session) {
    return c.redirect('/dashboard/login');
  }

  c.set('dashboardSession', session);
  await next();
}

export async function superAdminDashboardMiddleware(
  c: Context<AppType>,
  next: Next
): Promise<Response | void> {
  const session = c.get('dashboardSession');
  if (session.role !== 'super_admin') {
    return c.html('<h1>403 — Acces reserve aux super-administrateurs</h1>', 403);
  }
  await next();
}

export async function authenticateDashboardUser(
  c: Context<AppType>,
  email: string,
  password: string
): Promise<{ success: boolean; error?: string; userId?: string; role?: string }> {
  const user = await getUserByEmail(c.env.DB, email);
  if (!user) {
    return { success: false, error: 'Email ou mot de passe incorrect.' };
  }

  if (!user.password_hash) {
    return { success: false, error: 'Compte OAuth — connexion par mot de passe impossible.' };
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return { success: false, error: 'Email ou mot de passe incorrect.' };
  }

  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return { success: false, error: 'Acces reserve aux administrateurs.' };
  }

  return { success: true, userId: user.id, role: user.role };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/session.ts
git commit -m "feat(dashboard): add HMAC session cookie management"
```

---

### Task 5: Dashboard components (nav, stat-card, table, chart)

**Files:**
- Create: `src/dashboard/components/nav.tsx`
- Create: `src/dashboard/components/stat-card.tsx`
- Create: `src/dashboard/components/table.tsx`
- Create: `src/dashboard/components/chart.tsx`

- [ ] **Step 1: Create the navigation component**

Create `src/dashboard/components/nav.tsx`:

```tsx
import type { FC } from 'hono/jsx';

type NavProps = {
  currentPath: string;
  role: string;
};

export const Nav: FC<NavProps> = ({ currentPath, role }) => {
  const items = [
    { href: '/dashboard/', label: 'Overview' },
    { href: '/dashboard/logs', label: 'Logs' },
    { href: '/dashboard/errors', label: 'Erreurs' },
    { href: '/dashboard/users', label: 'Utilisateurs' },
    { href: '/dashboard/projects', label: 'Projets' },
    ...(role === 'super_admin'
      ? [{ href: '/dashboard/database', label: 'Base de donnees' }]
      : []),
    { href: '/dashboard/docs', label: 'Documentation' },
    { href: '/dashboard/config', label: 'Configuration' },
  ];

  return (
    <nav class="sidebar">
      <div class="sidebar-title">RaceUp Dashboard</div>
      {items.map((item) => (
        <a
          href={item.href}
          class={currentPath === item.href ? 'active' : ''}
        >
          {item.label}
        </a>
      ))}
      <div class="logout">
        <a href="/dashboard/logout">Deconnexion</a>
      </div>
    </nav>
  );
};
```

- [ ] **Step 2: Create the stat card component**

Create `src/dashboard/components/stat-card.tsx`:

```tsx
import type { FC } from 'hono/jsx';

type StatCardProps = {
  label: string;
  value: string | number;
  delta?: string;
  deltaType?: 'positive' | 'negative';
};

export const StatCard: FC<StatCardProps> = ({ label, value, delta, deltaType }) => {
  return (
    <div class="stat-card">
      <div class="stat-label">{label}</div>
      <div class="stat-value">{value}</div>
      {delta && (
        <div class={`stat-delta ${deltaType ?? ''}`}>{delta}</div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Create the reusable table component**

Create `src/dashboard/components/table.tsx`:

```tsx
import type { FC } from 'hono/jsx';
import { html } from 'hono/html';

type Column = {
  key: string;
  label: string;
  render?: (value: unknown, row: Record<string, unknown>) => string;
};

type TableProps = {
  columns: Column[];
  rows: Record<string, unknown>[];
  rowClass?: (row: Record<string, unknown>) => string;
};

type PaginationProps = {
  basePath: string;
  page: number;
  total: number;
  limit: number;
  queryParams?: string;
};

export const DataTable: FC<TableProps> = ({ columns, rows, rowClass }) => {
  return (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colspan={columns.length.toString()} style="text-align:center;color:#707090;padding:20px;">
              Aucune donnee
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr class={rowClass ? rowClass(row) : ''}>
              {columns.map((col) => (
                <td>
                  {col.render
                    ? html([col.render(row[col.key], row)] as unknown as TemplateStringsArray)
                    : String(row[col.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
};

export const Pagination: FC<PaginationProps> = ({ basePath, page, total, limit, queryParams }) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const qs = queryParams ? `&${queryParams}` : '';

  return (
    <div class="pagination">
      <a
        href={`${basePath}?page=${page - 1}${qs}`}
        class={page <= 1 ? 'disabled' : ''}
      >
        &laquo; Prec
      </a>
      <span class="current">
        Page {page} / {totalPages} ({total} resultats)
      </span>
      <a
        href={`${basePath}?page=${page + 1}${qs}`}
        class={page >= totalPages ? 'disabled' : ''}
      >
        Suiv &raquo;
      </a>
    </div>
  );
};
```

- [ ] **Step 4: Create the chart component**

Create `src/dashboard/components/chart.tsx`:

```tsx
import type { FC } from 'hono/jsx';

type BarChartProps = {
  title: string;
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
};

export const BarChart: FC<BarChartProps> = ({ title, data, height = 150, color = '#4a9eff' }) => {
  if (data.length === 0) {
    return (
      <div class="chart-container">
        <div class="chart-title">{title}</div>
        <div style="color:#707090;font-size:12px;padding:20px;text-align:center;">Aucune donnee</div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(4, Math.floor(600 / data.length) - 2);
  const svgWidth = data.length * (barWidth + 2);

  return (
    <div class="chart-container">
      <div class="chart-title">{title}</div>
      <svg width="100%" viewBox={`0 0 ${svgWidth} ${height + 20}`} style="max-width:100%;">
        {data.map((d, i) => {
          const barHeight = (d.value / maxVal) * height;
          const x = i * (barWidth + 2);
          const y = height - barHeight;
          return (
            <g>
              <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} opacity="0.8">
                <title>{`${d.label}: ${d.value}`}</title>
              </rect>
              {data.length <= 24 && (
                <text
                  x={x + barWidth / 2}
                  y={height + 14}
                  text-anchor="middle"
                  fill="#707090"
                  font-size="8"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
```

- [ ] **Step 5: Commit**

```bash
git add src/dashboard/components/
git commit -m "feat(dashboard): add nav, stat-card, table, chart components"
```

---

### Task 6: Dashboard layout

**Files:**
- Create: `src/dashboard/layout.tsx`

- [ ] **Step 1: Create the layout component**

Create `src/dashboard/layout.tsx`:

```tsx
import type { FC } from 'hono/jsx';
import { Nav } from './components/nav';
import { dashboardCSS } from './styles';

type LayoutProps = {
  title: string;
  currentPath: string;
  role: string;
  children: unknown;
};

export const Layout: FC<LayoutProps> = ({ title, currentPath, role, children }) => {
  return (
    <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{title} — RaceUp Dashboard</title>
        <style>{dashboardCSS}</style>
      </head>
      <body>
        <Nav currentPath={currentPath} role={role} />
        <div class="main">
          <h1 class="page-title">{title}</h1>
          {children}
        </div>
      </body>
    </html>
  );
};

type LoginLayoutProps = {
  children: unknown;
};

export const LoginLayout: FC<LoginLayoutProps> = ({ children }) => {
  return (
    <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Login — RaceUp Dashboard</title>
        <style>{dashboardCSS}</style>
      </head>
      <body>
        <div class="login-wrapper">{children}</div>
      </body>
    </html>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/layout.tsx
git commit -m "feat(dashboard): add layout and login layout components"
```

---

### Task 7: Auth routes (login / logout)

**Files:**
- Create: `src/dashboard/routes/auth.tsx`

- [ ] **Step 1: Create the auth routes**

Create `src/dashboard/routes/auth.tsx`:

```tsx
import { Hono } from 'hono';
import type { AppType } from '../../types';
import { LoginLayout } from '../layout';
import {
  authenticateDashboardUser,
  createSessionCookie,
  clearSessionCookie,
} from '../session';

const authRoutes = new Hono<AppType>();

authRoutes.get('/login', (c) => {
  const error = c.req.query('error');
  return c.html(
    <LoginLayout>
      <div class="login-box">
        <h1>RaceUp Dashboard</h1>
        {error && <div class="login-error">{decodeURIComponent(error)}</div>}
        <form method="POST" action="/dashboard/login">
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label>Mot de passe</label>
            <input type="password" name="password" required autocomplete="current-password" />
          </div>
          <button type="submit" class="btn" style="width:100%;margin-top:8px;">
            Se connecter
          </button>
        </form>
      </div>
    </LoginLayout>
  );
});

authRoutes.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const email = String(body['email'] ?? '');
  const password = String(body['password'] ?? '');

  if (!email || !password) {
    return c.redirect('/dashboard/login?error=' + encodeURIComponent('Email et mot de passe requis.'));
  }

  const result = await authenticateDashboardUser(c, email, password);
  if (!result.success) {
    return c.redirect('/dashboard/login?error=' + encodeURIComponent(result.error!));
  }

  await createSessionCookie(c, result.userId!, email, result.role!);
  return c.redirect('/dashboard/');
});

authRoutes.get('/logout', (c) => {
  clearSessionCookie(c);
  return c.redirect('/dashboard/login');
});

export default authRoutes;
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/routes/auth.tsx
git commit -m "feat(dashboard): add login/logout routes"
```

---

### Task 8: Overview page

**Files:**
- Create: `src/dashboard/routes/overview.tsx`

- [ ] **Step 1: Create the overview page**

Create `src/dashboard/routes/overview.tsx`:

```tsx
import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { StatCard } from '../components/stat-card';
import { BarChart } from '../components/chart';
import { DataTable } from '../components/table';

const overviewRoutes = new Hono<AppType>();

overviewRoutes.get('/', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const period = c.req.query('period') ?? '24h';

  const periodMap: Record<string, string> = {
    '24h': '-1 day',
    '7d': '-7 days',
    '30d': '-30 days',
  };
  const interval = periodMap[period] ?? '-1 day';

  // Purge old logs (> 30 days)
  await db.prepare("DELETE FROM request_logs WHERE created_at < datetime('now', '-30 days')").run();

  // Parallel queries
  const [
    reqCountResult,
    reqCountPrevResult,
    avgDurationResult,
    errorRateResult,
    activeUsersResult,
    totalUsersResult,
    activeProjectsResult,
    hourlyRequestsResult,
    hourlyDurationResult,
    recentErrorsResult,
    topEndpointsResult,
    topCountriesResult,
  ] = await Promise.all([
    // Requests current period
    db.prepare(`SELECT COUNT(*) as count FROM request_logs WHERE created_at >= datetime('now', ?)`)
      .bind(interval).first<{ count: number }>(),
    // Requests previous period (for delta)
    db.prepare(`SELECT COUNT(*) as count FROM request_logs WHERE created_at >= datetime('now', ?, ?) AND created_at < datetime('now', ?)`)
      .bind(interval, interval, interval).first<{ count: number }>().catch(() => ({ count: 0 })),
    // Avg duration
    db.prepare(`SELECT AVG(duration_ms) as avg FROM request_logs WHERE created_at >= datetime('now', ?)`)
      .bind(interval).first<{ avg: number | null }>(),
    // Error rate
    db.prepare(`SELECT COUNT(CASE WHEN status_code >= 400 THEN 1 END) * 100.0 / MAX(COUNT(*), 1) as rate FROM request_logs WHERE created_at >= datetime('now', ?)`)
      .bind(interval).first<{ rate: number | null }>().catch(() => ({ rate: 0 })),
    // Active users (distinct user_id in period)
    db.prepare(`SELECT COUNT(DISTINCT user_id) as count FROM request_logs WHERE user_id IS NOT NULL AND created_at >= datetime('now', ?)`)
      .bind(interval).first<{ count: number }>(),
    // Total users
    db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
    // Active projects
    db.prepare("SELECT COUNT(*) as count FROM projects WHERE is_archived = 0 AND status = 'in_progress'").first<{ count: number }>(),
    // Hourly requests (last 24h always for chart)
    db.prepare(`SELECT strftime('%H', created_at) as hour, COUNT(*) as count FROM request_logs WHERE created_at >= datetime('now', '-1 day') GROUP BY hour ORDER BY hour`)
      .all<{ hour: string; count: number }>(),
    // Hourly avg duration
    db.prepare(`SELECT strftime('%H', created_at) as hour, AVG(duration_ms) as avg FROM request_logs WHERE created_at >= datetime('now', '-1 day') GROUP BY hour ORDER BY hour`)
      .all<{ hour: string; avg: number }>(),
    // Recent errors
    db.prepare(`SELECT method, path, status_code, error, created_at FROM request_logs WHERE status_code >= 400 ORDER BY created_at DESC LIMIT 10`)
      .all(),
    // Top endpoints
    db.prepare(`SELECT path, COUNT(*) as count, ROUND(AVG(duration_ms)) as avg_ms FROM request_logs WHERE created_at >= datetime('now', ?) GROUP BY path ORDER BY count DESC LIMIT 10`)
      .bind(interval).all(),
    // Top countries
    db.prepare(`SELECT country, COUNT(*) as count FROM request_logs WHERE country IS NOT NULL AND created_at >= datetime('now', ?) GROUP BY country ORDER BY count DESC LIMIT 5`)
      .bind(interval).all(),
  ]);

  const reqCount = reqCountResult?.count ?? 0;
  const avgDuration = Math.round(avgDurationResult?.avg ?? 0);
  const errorRate = (errorRateResult?.rate ?? 0).toFixed(1);
  const activeUsers = activeUsersResult?.count ?? 0;
  const totalUsers = totalUsersResult?.count ?? 0;
  const activeProjects = activeProjectsResult?.count ?? 0;

  const hourlyData = (hourlyRequestsResult?.results ?? []).map((r: Record<string, unknown>) => ({
    label: String(r.hour) + 'h',
    value: Number(r.count),
  }));

  const durationData = (hourlyDurationResult?.results ?? []).map((r: Record<string, unknown>) => ({
    label: String(r.hour) + 'h',
    value: Math.round(Number(r.avg)),
  }));

  return c.html(
    <Layout title="Overview" currentPath="/dashboard/" role={session.role}>
      <div class="period-selector">
        {['24h', '7d', '30d'].map((p) => (
          <a href={`/dashboard/?period=${p}`} class={period === p ? 'active' : ''}>{p}</a>
        ))}
      </div>

      <div class="stats-grid">
        <StatCard label="Requetes" value={reqCount} />
        <StatCard label="Temps moyen" value={`${avgDuration}ms`} />
        <StatCard label="Taux erreurs" value={`${errorRate}%`} deltaType={Number(errorRate) > 5 ? 'negative' : 'positive'} />
        <StatCard label="Users actifs" value={activeUsers} />
        <StatCard label="Total users" value={totalUsers} />
        <StatCard label="Projets actifs" value={activeProjects} />
      </div>

      <BarChart title="Requetes par heure (24h)" data={hourlyData} />
      <BarChart title="Duree moyenne par heure (ms)" data={durationData} color="#4caf50" />

      <h2 class="section-title">10 dernieres erreurs</h2>
      <DataTable
        columns={[
          { key: 'created_at', label: 'Date' },
          { key: 'method', label: 'Method' },
          { key: 'path', label: 'Path' },
          { key: 'status_code', label: 'Status' },
          { key: 'error', label: 'Erreur', render: (v) => String(v ?? '-').substring(0, 100) },
        ]}
        rows={(recentErrorsResult?.results ?? []) as Record<string, unknown>[]}
        rowClass={() => 'error-row'}
      />

      <h2 class="section-title">Top 10 endpoints</h2>
      <DataTable
        columns={[
          { key: 'path', label: 'Path' },
          { key: 'count', label: 'Requetes' },
          { key: 'avg_ms', label: 'Duree moy. (ms)' },
        ]}
        rows={(topEndpointsResult?.results ?? []) as Record<string, unknown>[]}
      />

      <h2 class="section-title">Top 5 pays</h2>
      <DataTable
        columns={[
          { key: 'country', label: 'Pays' },
          { key: 'count', label: 'Requetes' },
        ]}
        rows={(topCountriesResult?.results ?? []) as Record<string, unknown>[]}
      />
    </Layout>
  );
});

export default overviewRoutes;
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/routes/overview.tsx
git commit -m "feat(dashboard): add overview page with stats, charts, tables"
```

---

### Task 9: Logs page

**Files:**
- Create: `src/dashboard/routes/logs.tsx`

- [ ] **Step 1: Create the logs page**

Create `src/dashboard/routes/logs.tsx`:

```tsx
import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';

const logsRoutes = new Hono<AppType>();

logsRoutes.get('/logs', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;

  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const method = c.req.query('method') ?? '';
  const status = c.req.query('status') ?? '';
  const path = c.req.query('path') ?? '';

  let where = 'WHERE 1=1';
  const bindings: unknown[] = [];

  if (method) {
    where += ' AND method = ?';
    bindings.push(method);
  }
  if (status === '2xx') {
    where += ' AND status_code >= 200 AND status_code < 300';
  } else if (status === '4xx') {
    where += ' AND status_code >= 400 AND status_code < 500';
  } else if (status === '5xx') {
    where += ' AND status_code >= 500';
  }
  if (path) {
    where += ' AND path LIKE ?';
    bindings.push(`%${path}%`);
  }

  const countBindings = [...bindings];
  bindings.push(limit, offset);

  const [logsResult, countResult] = await Promise.all([
    db.prepare(`SELECT id, method, path, status_code, duration_ms, user_id, ip, country, created_at FROM request_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings).all(),
    db.prepare(`SELECT COUNT(*) as total FROM request_logs ${where}`)
      .bind(...countBindings).first<{ total: number }>(),
  ]);

  const rows = (logsResult?.results ?? []) as Record<string, unknown>[];
  const total = countResult?.total ?? 0;
  const qs = `method=${method}&status=${status}&path=${encodeURIComponent(path)}`;

  return c.html(
    <Layout title="Request Logs" currentPath="/dashboard/logs" role={session.role}>
      <form class="filters" method="GET" action="/dashboard/logs">
        <select name="method">
          <option value="">Toutes methodes</option>
          {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((m) => (
            <option value={m} selected={method === m}>{m}</option>
          ))}
        </select>
        <select name="status">
          <option value="">Tous status</option>
          <option value="2xx" selected={status === '2xx'}>2xx</option>
          <option value="4xx" selected={status === '4xx'}>4xx</option>
          <option value="5xx" selected={status === '5xx'}>5xx</option>
        </select>
        <input type="text" name="path" placeholder="Filtrer par path..." value={path} />
        <button type="submit">Filtrer</button>
      </form>

      <DataTable
        columns={[
          { key: 'created_at', label: 'Date' },
          { key: 'method', label: 'Method' },
          { key: 'path', label: 'Path' },
          { key: 'status_code', label: 'Status' },
          { key: 'duration_ms', label: 'Duree (ms)' },
          {
            key: 'user_id',
            label: 'User',
            render: (v) => v ? `<a href="/dashboard/users/${v}">${String(v).substring(0, 8)}...</a>` : '-',
          },
          { key: 'country', label: 'Pays' },
          { key: 'ip', label: 'IP' },
        ]}
        rows={rows}
        rowClass={(row) => (Number(row.status_code) >= 400 ? 'error-row' : '')}
      />

      <Pagination basePath="/dashboard/logs" page={page} total={total} limit={limit} queryParams={qs} />
    </Layout>
  );
});

export default logsRoutes;
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/routes/logs.tsx
git commit -m "feat(dashboard): add logs page with filters and pagination"
```

---

### Task 10: Errors page

**Files:**
- Create: `src/dashboard/routes/errors.tsx`

- [ ] **Step 1: Create the errors page**

Create `src/dashboard/routes/errors.tsx`:

```tsx
import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';

const errorsRoutes = new Hono<AppType>();

errorsRoutes.get('/errors', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const view = c.req.query('view') ?? 'list';

  if (view === 'grouped') {
    const grouped = await db.prepare(`
      SELECT path, status_code, COUNT(*) as occurrences,
             MAX(created_at) as last_seen,
             MIN(created_at) as first_seen
      FROM request_logs
      WHERE status_code >= 400 AND created_at >= datetime('now', '-1 day')
      GROUP BY path, status_code
      ORDER BY occurrences DESC
      LIMIT 50
    `).all();

    return c.html(
      <Layout title="Erreurs" currentPath="/dashboard/errors" role={session.role}>
        <div class="filters">
          <a href="/dashboard/errors?view=list" class="btn">Vue liste</a>
          <a href="/dashboard/errors?view=grouped" class="btn" style="opacity:0.6">Vue groupee (active)</a>
        </div>

        <DataTable
          columns={[
            { key: 'path', label: 'Path' },
            { key: 'status_code', label: 'Status' },
            { key: 'occurrences', label: 'Occurrences (24h)' },
            { key: 'first_seen', label: 'Premier' },
            { key: 'last_seen', label: 'Dernier' },
          ]}
          rows={(grouped?.results ?? []) as Record<string, unknown>[]}
          rowClass={() => 'error-row'}
        />
      </Layout>
    );
  }

  // Default: list view
  const [errorsResult, countResult] = await Promise.all([
    db.prepare(`SELECT method, path, status_code, error, user_id, created_at FROM request_logs WHERE status_code >= 400 ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset).all(),
    db.prepare('SELECT COUNT(*) as total FROM request_logs WHERE status_code >= 400')
      .first<{ total: number }>(),
  ]);

  const total = countResult?.total ?? 0;

  return c.html(
    <Layout title="Erreurs" currentPath="/dashboard/errors" role={session.role}>
      <div class="filters">
        <a href="/dashboard/errors?view=list" class="btn" style="opacity:0.6">Vue liste (active)</a>
        <a href="/dashboard/errors?view=grouped" class="btn">Vue groupee</a>
      </div>

      <DataTable
        columns={[
          { key: 'created_at', label: 'Date' },
          { key: 'method', label: 'Method' },
          { key: 'path', label: 'Path' },
          { key: 'status_code', label: 'Status' },
          { key: 'error', label: 'Erreur', render: (v) => String(v ?? '-').substring(0, 120) },
          {
            key: 'user_id',
            label: 'User',
            render: (v) => v ? `<a href="/dashboard/users/${v}">${String(v).substring(0, 8)}...</a>` : '-',
          },
        ]}
        rows={(errorsResult?.results ?? []) as Record<string, unknown>[]}
        rowClass={() => 'error-row'}
      />

      <Pagination basePath="/dashboard/errors" page={page} total={total} limit={limit} queryParams="view=list" />
    </Layout>
  );
});

export default errorsRoutes;
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/routes/errors.tsx
git commit -m "feat(dashboard): add errors page with list and grouped views"
```

---

### Task 11: Users page

**Files:**
- Create: `src/dashboard/routes/users.tsx`

- [ ] **Step 1: Create the users page**

Create `src/dashboard/routes/users.tsx`:

```tsx
import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';

const usersRoutes = new Hono<AppType>();

// List users
usersRoutes.get('/users', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const q = c.req.query('q') ?? '';

  let where = '';
  const bindings: unknown[] = [];
  const countBindings: unknown[] = [];

  if (q) {
    const search = `%${q}%`;
    where = 'WHERE u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?';
    bindings.push(search, search, search, search);
    countBindings.push(search, search, search, search);
  }

  bindings.push(limit, offset);

  const [usersResult, countResult] = await Promise.all([
    db.prepare(`
      SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.role, u.auth_provider, u.created_at,
             COUNT(p.id) as project_count
      FROM users u
      LEFT JOIN projects p ON p.user_id = u.id AND p.is_archived = 0
      ${where}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings).all(),
    db.prepare(`SELECT COUNT(*) as total FROM users u ${where}`)
      .bind(...countBindings).first<{ total: number }>(),
  ]);

  const total = countResult?.total ?? 0;

  const roleBadge = (role: unknown) => {
    const r = String(role);
    if (r === 'super_admin') return '<span class="badge badge-super">super_admin</span>';
    if (r === 'admin') return '<span class="badge badge-admin">admin</span>';
    return '<span class="badge badge-user">user</span>';
  };

  return c.html(
    <Layout title="Utilisateurs" currentPath="/dashboard/users" role={session.role}>
      <form class="filters" method="GET" action="/dashboard/users">
        <input type="text" name="q" placeholder="Rechercher email, username..." value={q} style="width:300px;" />
        <button type="submit">Rechercher</button>
      </form>

      <DataTable
        columns={[
          {
            key: 'email',
            label: 'Email',
            render: (v, row) => `<a href="/dashboard/users/${row.id}">${String(v)}</a>`,
          },
          { key: 'username', label: 'Username' },
          { key: 'first_name', label: 'Prenom' },
          { key: 'last_name', label: 'Nom' },
          { key: 'role', label: 'Role', render: (v) => roleBadge(v) },
          { key: 'auth_provider', label: 'Auth' },
          { key: 'project_count', label: 'Projets' },
          { key: 'created_at', label: 'Inscrit le' },
        ]}
        rows={(usersResult?.results ?? []) as Record<string, unknown>[]}
      />

      <Pagination basePath="/dashboard/users" page={page} total={total} limit={limit} queryParams={`q=${encodeURIComponent(q)}`} />
    </Layout>
  );
});

// User detail
usersRoutes.get('/users/:id', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const userId = c.req.param('id');

  const user = await db.prepare(
    'SELECT id, email, username, first_name, last_name, birth_date, role, auth_provider, created_at, updated_at FROM users WHERE id = ?'
  ).bind(userId).first();

  if (!user) {
    return c.html(
      <Layout title="Utilisateur introuvable" currentPath="/dashboard/users" role={session.role}>
        <p>Cet utilisateur n'existe pas.</p>
        <a href="/dashboard/users">Retour</a>
      </Layout>,
      404
    );
  }

  const projects = await db.prepare(
    'SELECT id, name, status, service_type, progress, created_at FROM projects WHERE user_id = ? AND is_archived = 0 ORDER BY created_at DESC'
  ).bind(userId).all();

  const recentLogs = await db.prepare(
    'SELECT method, path, status_code, duration_ms, created_at FROM request_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).bind(userId).all();

  return c.html(
    <Layout title={`User: ${user.email}`} currentPath="/dashboard/users" role={session.role}>
      <a href="/dashboard/users" style="font-size:12px;">&laquo; Retour a la liste</a>

      <table style="margin:16px 0;width:auto;">
        <tr><td style="color:#707090;padding-right:20px;">ID</td><td>{String(user.id)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Email</td><td>{String(user.email)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Username</td><td>{String(user.username)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Nom</td><td>{String(user.first_name)} {String(user.last_name)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Role</td><td>{String(user.role)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Auth</td><td>{String(user.auth_provider)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Inscrit le</td><td>{String(user.created_at)}</td></tr>
      </table>

      {session.role === 'super_admin' && String(user.role) !== 'super_admin' && (
        <form method="POST" action={`/dashboard/users/${userId}/role`} style="margin-bottom:20px;">
          <div class="filters">
            <select name="role">
              <option value="user" selected={String(user.role) === 'user'}>user</option>
              <option value="admin" selected={String(user.role) === 'admin'}>admin</option>
              <option value="super_admin">super_admin</option>
            </select>
            <button type="submit" class="btn">Changer role</button>
          </div>
        </form>
      )}

      <h2 class="section-title">Projets ({projects?.results?.length ?? 0})</h2>
      <DataTable
        columns={[
          {
            key: 'name',
            label: 'Nom',
            render: (v, row) => `<a href="/dashboard/projects/${row.id}">${String(v)}</a>`,
          },
          { key: 'service_type', label: 'Service' },
          { key: 'status', label: 'Statut' },
          { key: 'progress', label: 'Progression', render: (v) => `${v}%` },
          { key: 'created_at', label: 'Cree le' },
        ]}
        rows={(projects?.results ?? []) as Record<string, unknown>[]}
      />

      <h2 class="section-title">20 dernieres requetes</h2>
      <DataTable
        columns={[
          { key: 'created_at', label: 'Date' },
          { key: 'method', label: 'Method' },
          { key: 'path', label: 'Path' },
          { key: 'status_code', label: 'Status' },
          { key: 'duration_ms', label: 'Duree (ms)' },
        ]}
        rows={(recentLogs?.results ?? []) as Record<string, unknown>[]}
        rowClass={(row) => (Number(row.status_code) >= 400 ? 'error-row' : '')}
      />
    </Layout>
  );
});

// Change role (POST)
usersRoutes.post('/users/:id/role', async (c) => {
  const session = c.get('dashboardSession');
  if (session.role !== 'super_admin') {
    return c.html('<h1>403</h1>', 403);
  }

  const userId = c.req.param('id');
  const body = await c.req.parseBody();
  const role = String(body['role'] ?? '');

  if (!['user', 'admin', 'super_admin'].includes(role)) {
    return c.redirect(`/dashboard/users/${userId}`);
  }

  await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
    .bind(role, new Date().toISOString(), userId).run();

  return c.redirect(`/dashboard/users/${userId}`);
});

export default usersRoutes;
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/routes/users.tsx
git commit -m "feat(dashboard): add users list, detail, and role management pages"
```

---

### Task 12: Projects page

**Files:**
- Create: `src/dashboard/routes/projects.tsx`

- [ ] **Step 1: Create the projects page**

Create `src/dashboard/routes/projects.tsx`:

```tsx
import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable, Pagination } from '../components/table';

const projectsRoutes = new Hono<AppType>();

// List projects
projectsRoutes.get('/projects', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const status = c.req.query('status') ?? '';

  let where = 'WHERE p.is_archived = 0';
  const bindings: unknown[] = [];
  const countBindings: unknown[] = [];

  if (status) {
    where += ' AND p.status = ?';
    bindings.push(status);
    countBindings.push(status);
  }

  bindings.push(limit, offset);

  const [projectsResult, countResult] = await Promise.all([
    db.prepare(`
      SELECT p.id, p.name, p.status, p.service_type, p.progress, p.created_at,
             u.email as user_email
      FROM projects p
      LEFT JOIN users u ON u.id = p.user_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...bindings).all(),
    db.prepare(`SELECT COUNT(*) as total FROM projects p ${where}`)
      .bind(...countBindings).first<{ total: number }>(),
  ]);

  const total = countResult?.total ?? 0;

  return c.html(
    <Layout title="Projets" currentPath="/dashboard/projects" role={session.role}>
      <form class="filters" method="GET" action="/dashboard/projects">
        <select name="status">
          <option value="">Tous statuts</option>
          <option value="in_progress" selected={status === 'in_progress'}>En cours</option>
          <option value="completed" selected={status === 'completed'}>Termine</option>
          <option value="paused" selected={status === 'paused'}>En pause</option>
        </select>
        <button type="submit">Filtrer</button>
      </form>

      <DataTable
        columns={[
          {
            key: 'name',
            label: 'Nom',
            render: (v, row) => `<a href="/dashboard/projects/${row.id}">${String(v)}</a>`,
          },
          { key: 'user_email', label: 'Client' },
          { key: 'service_type', label: 'Service' },
          { key: 'status', label: 'Statut' },
          { key: 'progress', label: 'Progress', render: (v) => `${v}%` },
          { key: 'created_at', label: 'Cree le' },
        ]}
        rows={(projectsResult?.results ?? []) as Record<string, unknown>[]}
      />

      <Pagination basePath="/dashboard/projects" page={page} total={total} limit={limit} queryParams={`status=${status}`} />
    </Layout>
  );
});

// Project detail
projectsRoutes.get('/projects/:id', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const projectId = c.req.param('id');

  const project = await db.prepare(`
    SELECT p.*, u.email as user_email, u.username as user_username
    FROM projects p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).bind(projectId).first();

  if (!project) {
    return c.html(
      <Layout title="Projet introuvable" currentPath="/dashboard/projects" role={session.role}>
        <p>Ce projet n'existe pas.</p>
        <a href="/dashboard/projects">Retour</a>
      </Layout>,
      404
    );
  }

  const [tickets, files] = await Promise.all([
    db.prepare(`
      SELECT t.id, t.subject, t.status, t.created_at,
             (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) as message_count
      FROM tickets t WHERE t.project_id = ? ORDER BY t.created_at DESC
    `).bind(projectId).all(),
    db.prepare('SELECT id, original_filename, file_size, mime_type, created_at FROM project_files WHERE project_id = ? ORDER BY created_at DESC')
      .bind(projectId).all(),
  ]);

  return c.html(
    <Layout title={`Projet: ${project.name}`} currentPath="/dashboard/projects" role={session.role}>
      <a href="/dashboard/projects" style="font-size:12px;">&laquo; Retour a la liste</a>

      <table style="margin:16px 0;width:auto;">
        <tr><td style="color:#707090;padding-right:20px;">ID</td><td>{String(project.id)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Nom</td><td>{String(project.name)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Client</td><td><a href={`/dashboard/users/${project.user_id}`}>{String(project.user_email)}</a></td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Service</td><td>{String(project.service_type)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Statut</td><td>{String(project.status)}</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Progression</td><td>{String(project.progress)}%</td></tr>
        <tr><td style="color:#707090;padding-right:20px;">Cree le</td><td>{String(project.created_at)}</td></tr>
      </table>

      <h2 class="section-title">Tickets ({tickets?.results?.length ?? 0})</h2>
      <DataTable
        columns={[
          { key: 'subject', label: 'Sujet' },
          { key: 'status', label: 'Statut' },
          { key: 'message_count', label: 'Messages' },
          { key: 'created_at', label: 'Cree le' },
        ]}
        rows={(tickets?.results ?? []) as Record<string, unknown>[]}
      />

      <h2 class="section-title">Fichiers ({files?.results?.length ?? 0})</h2>
      <DataTable
        columns={[
          { key: 'original_filename', label: 'Fichier' },
          { key: 'file_size', label: 'Taille', render: (v) => `${(Number(v) / 1024).toFixed(1)} KB` },
          { key: 'mime_type', label: 'Type' },
          { key: 'created_at', label: 'Upload le' },
        ]}
        rows={(files?.results ?? []) as Record<string, unknown>[]}
      />
    </Layout>
  );
});

export default projectsRoutes;
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/routes/projects.tsx
git commit -m "feat(dashboard): add projects list and detail pages"
```

---

### Task 13: Database page (SQL Explorer — super_admin only)

**Files:**
- Create: `src/dashboard/routes/database.tsx`

- [ ] **Step 1: Create the database page**

Create `src/dashboard/routes/database.tsx`:

```tsx
import { Hono } from 'hono';
import type { AppType } from '../../types';
import { Layout } from '../layout';
import { DataTable } from '../components/table';
import { superAdminDashboardMiddleware } from '../session';

const databaseRoutes = new Hono<AppType>();

databaseRoutes.use('*', superAdminDashboardMiddleware);

databaseRoutes.get('/database', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;

  // Get all tables
  const tables = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
  ).all();

  // Get row counts for each table
  const tableCounts: { name: string; count: number; }[] = [];
  for (const t of (tables?.results ?? [])) {
    const name = String(t.name);
    const result = await db.prepare(`SELECT COUNT(*) as count FROM "${name}"`).first<{ count: number }>();
    tableCounts.push({ name, count: result?.count ?? 0 });
  }

  // Get table info if requested
  const inspectTable = c.req.query('table');
  let tableInfo: Record<string, unknown>[] = [];
  if (inspectTable) {
    const info = await db.prepare(`PRAGMA table_info("${inspectTable.replace(/"/g, '')}")`).all();
    tableInfo = (info?.results ?? []) as Record<string, unknown>[];
  }

  return c.html(
    <Layout title="Base de donnees" currentPath="/dashboard/database" role={session.role}>
      <h2 class="section-title">Tables</h2>
      <table>
        <thead>
          <tr><th>Table</th><th>Lignes</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {tableCounts.map((t) => (
            <tr>
              <td>{t.name}</td>
              <td>{t.count}</td>
              <td><a href={`/dashboard/database?table=${t.name}`}>Structure</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      {inspectTable && (
        <div>
          <h2 class="section-title">Structure: {inspectTable}</h2>
          <DataTable
            columns={[
              { key: 'cid', label: '#' },
              { key: 'name', label: 'Colonne' },
              { key: 'type', label: 'Type' },
              { key: 'notnull', label: 'NOT NULL', render: (v) => Number(v) ? 'oui' : 'non' },
              { key: 'dflt_value', label: 'Default' },
              { key: 'pk', label: 'PK', render: (v) => Number(v) ? 'oui' : '' },
            ]}
            rows={tableInfo}
          />
        </div>
      )}

      <h2 class="section-title">Requete SQL</h2>
      <form method="POST" action="/dashboard/database/query">
        <div class="form-group">
          <textarea name="sql" placeholder="SELECT * FROM users LIMIT 10;" rows={5}></textarea>
        </div>
        <button type="submit" class="btn">Executer</button>
      </form>
    </Layout>
  );
});

databaseRoutes.post('/database/query', async (c) => {
  const session = c.get('dashboardSession');
  const db = c.env.DB;
  const body = await c.req.parseBody();
  const sql = String(body['sql'] ?? '').trim();

  if (!sql) {
    return c.redirect('/dashboard/database');
  }

  let results: Record<string, unknown>[] = [];
  let columns: string[] = [];
  let error: string | null = null;
  let executionTime = 0;

  try {
    const start = Date.now();
    const result = await db.prepare(sql).all();
    executionTime = Date.now() - start;

    results = ((result?.results ?? []) as Record<string, unknown>[]).slice(0, 500);
    if (results.length > 0) {
      columns = Object.keys(results[0]);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return c.html(
    <Layout title="Base de donnees — Resultat" currentPath="/dashboard/database" role={session.role}>
      <a href="/dashboard/database" style="font-size:12px;">&laquo; Retour</a>

      <h2 class="section-title">Requete</h2>
      <pre><code>{sql}</code></pre>

      {error ? (
        <div class="login-error" style="margin-top:12px;">{error}</div>
      ) : (
        <div>
          <p style="font-size:12px;color:#707090;margin:12px 0;">
            {results.length} ligne(s) — {executionTime}ms
          </p>
          <div class="sql-result">
            <table>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr>
                    {columns.map((col) => (
                      <td>{String(row[col] ?? 'NULL')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 class="section-title">Nouvelle requete</h2>
      <form method="POST" action="/dashboard/database/query">
        <div class="form-group">
          <textarea name="sql" rows={5}>{sql}</textarea>
        </div>
        <button type="submit" class="btn">Executer</button>
      </form>
    </Layout>
  );
});

export default databaseRoutes;
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/routes/database.tsx
git commit -m "feat(dashboard): add SQL explorer page (super_admin only)"
```

---

### Task 14: Documentation page with API tester

**Files:**
- Create: `src/dashboard/routes/docs.tsx`

- [ ] **Step 1: Create the docs page**

Create `src/dashboard/routes/docs.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/routes/docs.tsx
git commit -m "feat(dashboard): add API documentation page with integrated tester"
```

---

### Task 15: Config placeholder page

**Files:**
- Create: `src/dashboard/routes/config.tsx`

- [ ] **Step 1: Create the config placeholder**

Create `src/dashboard/routes/config.tsx`:

```tsx
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
```

- [ ] **Step 2: Commit**

```bash
git add src/dashboard/routes/config.tsx
git commit -m "feat(dashboard): add config placeholder page"
```

---

### Task 16: Wire everything into index.ts

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update index.ts to mount all dashboard routes**

Replace the full content of `src/index.ts` with:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppType } from './types';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import projectRoutes from './routes/projects';
import trackingRoutes from './routes/tracking';
import { loggerMiddleware } from './middleware/logger';
import { dashboardAuthMiddleware } from './dashboard/session';
import dashboardAuthRoutes from './dashboard/routes/auth';
import overviewRoutes from './dashboard/routes/overview';
import logsRoutes from './dashboard/routes/logs';
import errorsRoutes from './dashboard/routes/errors';
import usersRoutes from './dashboard/routes/users';
import projectsDashRoutes from './dashboard/routes/projects';
import databaseRoutes from './dashboard/routes/database';
import docsRoutes from './dashboard/routes/docs';
import configRoutes from './dashboard/routes/config';

const app = new Hono<AppType>();

// Logger — intercepts all requests for dashboard metrics
app.use('*', loggerMiddleware);

// CORS (API only)
app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      const allowed = [
        'https://raceup.com',
        'https://www.raceup.com',
        'https://race-up.net',
        'https://www.race-up.net',
      ];
      if (!origin) return null;
      if (allowed.includes(origin)) return origin;
      if (origin.endsWith('.pages.dev')) return origin;
      if (origin.startsWith('http://localhost')) return origin;
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);

// Health check
app.get('/api/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/track', trackingRoutes);

// Dashboard — public routes (login/logout)
app.route('/dashboard', dashboardAuthRoutes);

// Dashboard — protected routes (session cookie required)
app.use('/dashboard/*', dashboardAuthMiddleware);
app.route('/dashboard', overviewRoutes);
app.route('/dashboard', logsRoutes);
app.route('/dashboard', errorsRoutes);
app.route('/dashboard', usersRoutes);
app.route('/dashboard', projectsDashRoutes);
app.route('/dashboard', databaseRoutes);
app.route('/dashboard', docsRoutes);
app.route('/dashboard', configRoutes);

// Global error handler
app.onError((err, c) => {
  console.error(err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erreur interne du serveur.',
      },
    },
    500
  );
});

// 404
app.notFound((c) =>
  c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route non trouvee.',
      },
    },
    404
  )
);

export default app;
```

- [ ] **Step 2: Verify the app compiles**

Run:
```bash
npm run dev
```

Expected: No TypeScript errors, server starts on `localhost:8787`.

- [ ] **Step 3: Test the dashboard login flow**

1. Open `http://localhost:8787/dashboard/` in browser → should redirect to `/dashboard/login`
2. Log in with an admin account → should redirect to `/dashboard/`
3. Overview page should show stats (mostly zeros if fresh DB)
4. Navigate through each section to verify pages render

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(dashboard): wire all dashboard routes into main app"
```

---

### Task 17: Update documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Add the dashboard section to `CLAUDE.md` after the existing route tables:

```markdown
### Dashboard `/dashboard` (Cookie session, admin/super_admin)

| Method | Route | Description |
|--------|-------|-------------|
| GET | /login | Page de connexion |
| POST | /login | Authentification (email, password) → cookie HMAC |
| GET | /logout | Deconnexion (supprime cookie) |
| GET | / | Overview — stats, graphiques, top endpoints |
| GET | /logs | Request logs — filtres, pagination |
| GET | /errors | Erreurs — vue liste et groupee |
| GET | /users | Liste utilisateurs — recherche, pagination |
| GET | /users/:id | Detail utilisateur + projets + logs |
| POST | /users/:id/role | Changer role (super_admin only) |
| GET | /projects | Liste projets — filtre status |
| GET | /projects/:id | Detail projet + tickets + fichiers |
| GET | /database | SQL explorer — tables, structure (super_admin only) |
| POST | /database/query | Executer SQL (super_admin only) |
| GET | /docs | Documentation API + testeur integre |
| GET | /config | Placeholder — bientot disponible |
```

Add `request_logs` table to the schema section:

```markdown
request_logs (id AUTOINCREMENT, method, path, status_code, duration_ms, user_id?,
              ip?, country?, user_agent?, error?, created_at)
  IDX: created_at, path, status_code
```

- [ ] **Step 2: Update architecture.md with dashboard documentation**

Add a new "Dashboard" section covering:
- Auth mechanism (HMAC cookie)
- Route structure
- Middleware chain
- request_logs table schema
- Components structure

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/architecture.md
git commit -m "docs: update architecture and CLAUDE.md with dashboard documentation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | JSX setup + migration + types | tsconfig.json, migration, types.ts |
| 2 | Logger middleware | middleware/logger.ts, index.ts |
| 3 | CSS styles | dashboard/styles.ts |
| 4 | Session management (HMAC cookie) | dashboard/session.ts |
| 5 | Components (nav, stat-card, table, chart) | dashboard/components/*.tsx |
| 6 | Layout component | dashboard/layout.tsx |
| 7 | Auth routes (login/logout) | dashboard/routes/auth.tsx |
| 8 | Overview page | dashboard/routes/overview.tsx |
| 9 | Logs page | dashboard/routes/logs.tsx |
| 10 | Errors page | dashboard/routes/errors.tsx |
| 11 | Users page | dashboard/routes/users.tsx |
| 12 | Projects page | dashboard/routes/projects.tsx |
| 13 | Database page (SQL explorer) | dashboard/routes/database.tsx |
| 14 | Docs page (API tester) | dashboard/routes/docs.tsx |
| 15 | Config placeholder | dashboard/routes/config.tsx |
| 16 | Wire into index.ts | index.ts |
| 17 | Update documentation | CLAUDE.md, architecture.md |
