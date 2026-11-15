import { registerDecorator, type ValidationOptions } from 'class-validator';
import { allowedMediaUrl } from './media.policy.js';

export function IsMediaUrl(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isMediaUrl',
      target: target.constructor,
      propertyName: String(propertyKey),
      options,
      validator: {
        validate: (value: unknown) =>
          allowedMediaUrl(
            value,
            (process.env.MEDIA_ALLOWED_ORIGINS ?? '')
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
            process.env.MEDIA_PUBLIC_BASE_URL ?? '',
            process.env.NODE_ENV === 'production',
          ),
        defaultMessage: () =>
          'Image URL must use an allowed media origin, or be empty to clear',
      },
    });
}
