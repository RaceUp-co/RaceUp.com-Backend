export async function recordPageView(
  db: D1Database,
  data: {
    path: string;
    referrer?: string | null;
    user_agent?: string | null;
    country?: string | null;
  }
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO page_views (path, referrer, user_agent, country) VALUES (?, ?, ?, ?)'
    )
    .bind(
      data.path,
      data.referrer ?? null,
      data.user_agent ?? null,
      data.country ?? null
    )
    .run();
}

export async function getRegistrationStats(
  db: D1Database,
  days: number = 30
): Promise<Array<{ date: string; count: number }>> {
  const result = await db
    .prepare(
      `SELECT date(created_at) as date, COUNT(*) as count
       FROM users
       WHERE created_at >= datetime('now', '-' || ? || ' days')
       GROUP BY date(created_at)
       ORDER BY date ASC`
    )
    .bind(days)
    .all<{ date: string; count: number }>();

  return result.results;
}

export async function getPageViewStats(
  db: D1Database,
  days: number = 30
): Promise<Array<{ date: string; count: number }>> {
  const result = await db
    .prepare(
      `SELECT date(created_at) as date, COUNT(*) as count
       FROM page_views
       WHERE created_at >= datetime('now', '-' || ? || ' days')
       GROUP BY date(created_at)
       ORDER BY date ASC`
    )
    .bind(days)
    .all<{ date: string; count: number }>();

  return result.results;
}

export async function getAdminStats(
  db: D1Database
): Promise<{
  totalUsers: number;
  totalProjects: number;
  activeProjects: number;
  totalRevenue: number;
  pendingPurchases: number;
}> {
  const [usersResult, projectsResult, activeResult] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
    db
      .prepare('SELECT COUNT(*) as count FROM projects')
      .first<{ count: number }>(),
    db
      .prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'in_progress'")
      .first<{ count: number }>(),
  ]);

  return {
    totalUsers: usersResult?.count ?? 0,
    totalProjects: projectsResult?.count ?? 0,
    activeProjects: activeResult?.count ?? 0,
    totalRevenue: 0,
    pendingPurchases: 0,
  };
}
