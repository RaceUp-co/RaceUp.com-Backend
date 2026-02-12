import type { Hono } from 'hono';

export type Bindings = {
  DB: D1Database;
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
  start_date: string;
  end_date: string | null;
  progress: number;
  last_update: string | null;
  deliverables_url: string | null;
  created_at: string;
  updated_at: string;
};

export type PageView = {
  id: number;
  path: string;
  referrer: string | null;
  user_agent: string | null;
  country: string | null;
  created_at: string;
};
