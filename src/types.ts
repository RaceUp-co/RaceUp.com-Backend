import type { Hono } from 'hono';

export type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  ACCESS_TOKEN_EXPIRY: string;
  REFRESH_TOKEN_EXPIRY: string;
};

export type Variables = {
  jwtPayload: {
    sub: string;
    email: string;
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
