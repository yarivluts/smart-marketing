import { SetMetadata } from '@nestjs/common';

export const ALLOW_PUBLISHABLE_KEY = 'growthos:allow-publishable-key';

/**
 * Lets a publishable (browser) key call this route - deny by default: a publishable key ships in a
 * web page, so it may only reach the routes marked with this (sending events, checking its own
 * installation), and only from its allowed origins. Checked by {@link ApiKeyAuthGuard}.
 */
export function AllowPublishableKey(): MethodDecorator & ClassDecorator {
  return SetMetadata(ALLOW_PUBLISHABLE_KEY, true);
}
