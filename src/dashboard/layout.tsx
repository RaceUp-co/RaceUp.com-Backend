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
