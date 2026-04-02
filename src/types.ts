import type { Hono } from 'hono';

export type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  ACCESS_TOKEN_EXPIRY: string;
  REFRESH_TOKEN_EXPIRY: string;
  GOOGLE_CLIENT_ID: string;
  APPLE_CLIENT_ID: string;
};

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

export type AppType = {
  Bindings: Bindings;
  Variables: Variables;
};

export type User = {
  id: string;
  email: string;
  password_hash: string;
  username: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  auth_provider: string;
  role: string;
  created_at: string;
  updated_at: string;
};

export type RefreshToken = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: 'in_progress' | 'completed' | 'paused';
  service_type: string;
  tier: string | null;
  start_date: string;
  end_date: string | null;
  progress: number;
  last_update: string | null;
  deliverables_url: string | null;
  is_archived: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Ticket = {
  id: string;
  project_id: string;
  subject: string;
  status: 'open' | 'resolved';
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TicketMessage = {
  id: string;
  ticket_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export type ProjectFileRecord = {
  id: string;
  project_id: string;
  uploaded_by: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  r2_key: string;
  created_at: string;
};

export type PageView = {
  id: number;
  path: string;
  referrer: string | null;
  user_agent: string | null;
  country: string | null;
  created_at: string;
};

export type DashboardSession = {
  userId: string;
  email: string;
  role: string;
  exp: number;
};
