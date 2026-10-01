export interface AuthenticatedUser {
  userId: string;
  roles: string[];
  scopes: string[];
}

export interface JwtPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  roles?: string[];
  scope?: string;
}
