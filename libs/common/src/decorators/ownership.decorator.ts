import { SetMetadata } from '@nestjs/common';

export const OWNERSHIP_KEY = 'auth:ownership';

export interface OwnershipOptions {
  paramName?: string;     // default: 'id'
  bypassRoles?: string[]; // roles that bypass the ownership check
}

export const CheckOwnership = (options: OwnershipOptions = {}) =>
  SetMetadata(OWNERSHIP_KEY, {
    paramName: options.paramName ?? 'id',
    bypassRoles: options.bypassRoles ?? [],
  });
