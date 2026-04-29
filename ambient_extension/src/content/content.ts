/**
 * Content script -- platform-agnostic dispatcher.
 *
 * Detects which messaging platform the page belongs to via the platform
 * registry, then delegates DOM parsing, scrolling, and debug requests to
 * the matched platform implementation.
 */

import type { ConversationDict, ScrollMessage, ScrollBackDaysMessage, ScrollBackDaysResponse, ClickConversationMessage } from '../types';
import type { MessagePlatform } from './platforms/types';
import { getPlatformForUrl } from './platforms/registry';
import { GoogleMessagesPlatform } from './platforms/google-messages';
import { FacebookMessengerPlatform } from './platforms/facebook-messenger';

const platform: MessagePlatform | null = getPlatformForUrl(window.location.href);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!platform) {
    sendResponse({ success: false, error: 'No supported messaging platform detected on this page.' });
    return false;
  }

  console.log('Content script received message:', message.type);

  switch (message.type) {
    case 'PARSE_DOM':
      try {
        if (!platform.isOnConversationPage()) {
          sendResponse({
            success: false,
            error: 'Not on a conversation page. Please open a conversation first.',
          });
          return true;
        }
        const conversation = platform.parseConversation();
        sendResponse({ success: true, conversation });
      } catch (error) {
        console.error('Error parsing DOM:', error);
        sendResponse({ success: false, error: (error as Error).message });
      }
      return true;

    case 'SCROLL_CONVERSATION':
      handleScroll(message as ScrollMessage)
        .then((conversation) => sendResponse({ success: true, conversation }))
        .catch((error) => {
          console.error('Error scrolling:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'CHECK_PAGE':
      sendResponse({
        success: true,
        isOnConversation: platform.isOnConversationPage(),
      });
      return true;

    case 'DEBUG_DOM':
      try {
        const debugInfo = getDOMDebugInfo();
        sendResponse({ success: true, debug: debugInfo });
      } catch (error) {
        sendResponse({ success: false, error: (error as Error).message });
      }
      return true;

    case 'SCROLL_BACK_DAYS':
      handleScrollBackDays(message as ScrollBackDaysMessage)
        .then((response) => sendResponse(response))
        .catch((error) => {
          console.error('Error scrolling back:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'GET_CONVERSATION_LIST':
      try {
        const conversations = platform.listConversations();
        sendResponse({ success: true, conversations });
      } catch (error) {
        sendResponse({ success: false, error: (error as Error).message });
      }
      return true;

    case 'CLICK_CONVERSATION':
      platform.openConversation((message as ClickConversationMessage).index)
        .then((loaded) => {
          sendResponse({ success: loaded });
        })
        .catch((error) => {
          console.error('Error clicking conversation:', error);
          sendResponse({ success: false, error: (error as Error).message });
        });
      return true;

    default:
      return false;
  }
});

// ---- helpers ----

function getDOMDebugInfo(): object {
  if (platform instanceof GoogleMessagesPlatform) {
    return platform.getDOMDebugInfo();
  }
  if (platform instanceof FacebookMessengerPlatform) {
    return platform.getDOMDebugInfo();
  }
  return { error: 'Debug info not available for this platform' };
}

async function handleScroll(options: ScrollMessage): Promise<ConversationDict> {
  if (!platform) throw new Error('No platform detected');
  console.log('Scrolling conversation...', options);

  const scrollContainer = platform.getScrollContainer();
  if (!scrollContainer) {
    throw new Error('Could not find message scroll container');
  }

  return platform.parseConversation();
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleScrollBackDays(message: ScrollBackDaysMessage): Promise<ScrollBackDaysResponse> {
  if (!platform) return { success: false, error: 'No platform detected' };

  console.log('[Ambient] Scrolling back', message.days, 'days');

  if (!platform.isOnConversationPage()) {
    return { success: false, error: 'Not on a conversation page' };
  }

  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - message.days);
  targetDate.setHours(0, 0, 0, 0);

  console.log('[Ambient] Target date:', targetDate.toISOString());

  const scrollContainer = platform.getScrollContainer();
  if (scrollContainer) {
    console.log('[Ambient] Found scroll container:', scrollContainer.tagName, (scrollContainer as HTMLElement).className);
  } else {
    console.log('[Ambient] No scroll container found, will use scrollIntoView only');
  }

  const maxAttempts = 100;
  let attempts = 0;
  let previousOldestDate: Date | null = null;
  let stuckCount = 0;

  while (attempts < maxAttempts) {
    attempts++;

    const oldestMessage = platform.getOldestMessage();
    if (!oldestMessage) {
      return { success: false, error: 'Could not find any messages' };
    }

    console.log('[Ambient] Oldest message date:', oldestMessage.date.toISOString(), 'attempt:', attempts);

    if (oldestMessage.date <= targetDate) {
      console.log('[Ambient] Reached target date!');
      return { success: true, reachedTarget: true, oldestMessageDate: oldestMessage.date.toISOString() };
    }

    if (previousOldestDate && oldestMessage.date.getTime() === previousOldestDate.getTime()) {
      stuckCount++;
      if (stuckCount >= 3) {
        console.log('[Ambient] Reached beginning of conversation');
        return { success: true, reachedTarget: false, oldestMessageDate: oldestMessage.date.toISOString() };
      }
    } else {
      stuckCount = 0;
    }
    previousOldestDate = oldestMessage.date;

    oldestMessage.element.scrollIntoView({ behavior: 'instant', block: 'start' });

    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }

    await delay(500);
  }

  const finalOldest = platform.getOldestMessage();
  return { success: true, reachedTarget: false, oldestMessageDate: finalOldest?.date.toISOString() };
}

// ---- init ----

console.log('Ambient Extension content script loaded on:', window.location.href);

if (platform) {
  console.log(`Detected platform: ${platform.config.name}`);
  if (platform.isOnConversationPage()) {
    console.log('On a conversation page');
  }
} else {
  console.log('No supported messaging platform detected');
}
