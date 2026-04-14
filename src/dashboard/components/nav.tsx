import type { FC } from 'hono/jsx';

type NavProps = {
  currentPath: string;
  role: string;
};

export const Nav: FC<NavProps> = ({ currentPath, role }) => {
  const items = [
    { href: '/dashboard', label: 'Overview' },
    { href: '/dashboard/logs', label: 'Logs' },
    { href: '/dashboard/errors', label: 'Erreurs' },
    { href: '/dashboard/users', label: 'Utilisateurs' },
    { href: '/dashboard/projects', label: 'Projets' },
    { href: '/dashboard/consent', label: 'Consentement' },
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
