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
    <Layout title="Overview" currentPath="/dashboard" role={session.role}>
      <div class="period-selector">
        {['24h', '7d', '30d'].map((p) => (
          <a href={`/dashboard?period=${p}`} class={period === p ? 'active' : ''}>{p}</a>
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
