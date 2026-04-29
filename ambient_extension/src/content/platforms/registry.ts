import type { MessagePlatform } from './types';
import { GoogleMessagesPlatform } from './google-messages';
import { FacebookMessengerPlatform } from './facebook-messenger';
import { WhatsAppPlatform } from './whatsapp';

const platforms: MessagePlatform[] = [
  new GoogleMessagesPlatform(),
  new FacebookMessengerPlatform(),
  new WhatsAppPlatform(),
];

/**
 * Find the platform implementation whose URL patterns match the given URL.
 * Returns null if no registered platform matches.
 */
export function getPlatformForUrl(url: string): MessagePlatform | null {
  for (const platform of platforms) {
    if (platform.config.urlPatterns.some(pattern => pattern.test(url))) {
      return platform;
    }
  }
  return null;
}
