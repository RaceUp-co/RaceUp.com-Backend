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
