export interface AuthenticatedUser {
  userId: string;
  role: string;
  roles: string[];
  scopes: string[];
  sessionId: string;
  issuer: string;
  audience: string | string[];
}

export interface JwtPayload {
  sub: string;
  role: string;
  sid: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
}