import type { ConversationDict, ConversationListItem } from '../../types';

export interface PlatformConfig {
  id: string;
  name: string;
  urlPatterns: RegExp[];
  /** True if the tab must remain focused for reliable DOM operations (e.g. scroll-to-load). */
  requiresActiveTab?: boolean;
}

export interface MessagePlatform {
  config: PlatformConfig;

  isOnConversationPage(): boolean;
  parseConversation(): ConversationDict;
  getScrollContainer(): Element | null;
  getOldestMessage(): { element: Element; date: Date } | null;
  listConversations(): ConversationListItem[];
  openConversation(index: number): Promise<boolean>;
}
