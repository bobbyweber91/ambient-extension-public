/**
 * Reusable tab tracking utility for the sidepanel.
 *
 * Remembers which tab the extension is operating on, detects when the user
 * switches away, and provides a promise-based pause/resume mechanism so that
 * content-script-dependent operations can wait until the user returns.
 *
 * Usage:
 *   const tracker = new TabTracker({ onPaused, onResumed, onTabClosed });
 *   tracker.startTracking(tab.id!, tab.windowId!, tab.title ?? '');
 *   await tracker.sendMessage({ type: 'PARSE_DOM' });
 *   tracker.stopTracking();
 */

export interface TabTrackerCallbacks {
  onPaused: (tabTitle: string) => void;
  onResumed: () => void;
  onTabClosed: () => void;
}

export class TabTracker {
  private trackedTabId: number | null = null;
  private trackedWindowId: number | null = null;
  private trackedTabTitle: string = '';
  private paused = false;
  private tracking = false;
  private resumeResolve: (() => void) | null = null;
  private callbacks: TabTrackerCallbacks;

  private boundOnActivated: (info: chrome.tabs.TabActiveInfo) => void;
  private boundOnRemoved: (tabId: number) => void;
  private boundOnFocusChanged: (windowId: number) => void;

  constructor(callbacks: TabTrackerCallbacks) {
    this.callbacks = callbacks;
    this.boundOnActivated = this.handleTabActivated.bind(this);
    this.boundOnRemoved = this.handleTabRemoved.bind(this);
    this.boundOnFocusChanged = this.handleWindowFocusChanged.bind(this);
  }

  startTracking(tabId: number, windowId: number, tabTitle: string): void {
    this.stopTracking();

    this.trackedTabId = tabId;
    this.trackedWindowId = windowId;
    this.trackedTabTitle = tabTitle;
    this.paused = false;
    this.tracking = true;

    console.log(`[Ambient] TabTracker: started tracking tab ${tabId} (window ${windowId}, "${tabTitle}")`);

    chrome.tabs.onActivated.addListener(this.boundOnActivated);
    chrome.tabs.onRemoved.addListener(this.boundOnRemoved);
    chrome.windows.onFocusChanged.addListener(this.boundOnFocusChanged);
  }

  stopTracking(): void {
    if (!this.tracking) return;

    console.log(`[Ambient] TabTracker: stopped tracking tab ${this.trackedTabId}`);

    this.tracking = false;
    this.trackedTabId = null;
    this.trackedWindowId = null;
    this.trackedTabTitle = '';

    chrome.tabs.onActivated.removeListener(this.boundOnActivated);
    chrome.tabs.onRemoved.removeListener(this.boundOnRemoved);
    chrome.windows.onFocusChanged.removeListener(this.boundOnFocusChanged);

    if (this.paused) {
      this.paused = false;
      if (this.resumeResolve) {
        this.resumeResolve();
        this.resumeResolve = null;
      }
    }
  }

  /**
   * Returns a promise that resolves immediately if the tracked tab is active,
   * or waits until the user switches back to it.
   */
  waitForResume(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.resumeResolve = resolve;
    });
  }

  /**
   * Wraps `chrome.tabs.sendMessage` with automatic pause-awareness.
   * Waits for the tracked tab to be active before sending.
   */
  async sendMessage(message: unknown): Promise<unknown> {
    if (this.trackedTabId === null) {
      throw new Error('No tracked tab. Call startTracking() first.');
    }
    if (this.paused) {
      console.log('[Ambient] TabTracker: sendMessage waiting for tab to become active again…');
    }
    await this.waitForResume();
    const type = (message as { type?: string })?.type ?? 'unknown';
    console.log(`[Ambient] TabTracker: sending ${type} to tab ${this.trackedTabId}`);
    return chrome.tabs.sendMessage(this.trackedTabId, message);
  }

  /** Focus the tracked tab and its window. */
  async switchToTrackedTab(): Promise<void> {
    if (this.trackedTabId === null) return;
    console.log(`[Ambient] TabTracker: switching to tracked tab ${this.trackedTabId}`);
    try {
      await chrome.tabs.update(this.trackedTabId, { active: true });
      if (this.trackedWindowId !== null) {
        await chrome.windows.update(this.trackedWindowId, { focused: true });
      }
    } catch (e) {
      console.warn('[Ambient] TabTracker: failed to switch to tracked tab', e);
    }
  }

  getTabId(): number | null {
    return this.trackedTabId;
  }

  getTabTitle(): string {
    return this.trackedTabTitle;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isTracking(): boolean {
    return this.tracking;
  }

  // ---- private event handlers ----

  private handleTabActivated(info: chrome.tabs.TabActiveInfo): void {
    if (!this.tracking || this.trackedTabId === null) return;

    if (info.windowId === this.trackedWindowId) {
      if (info.tabId !== this.trackedTabId && !this.paused) {
        this.pause();
      } else if (info.tabId === this.trackedTabId && this.paused) {
        this.resume();
      }
    }
  }

  private handleTabRemoved(tabId: number): void {
    if (!this.tracking) return;
    if (tabId === this.trackedTabId) {
      console.log(`[Ambient] TabTracker: tracked tab ${tabId} was closed`);
      this.stopTracking();
      this.callbacks.onTabClosed();
    }
  }

  private handleWindowFocusChanged(windowId: number): void {
    if (!this.tracking || this.trackedWindowId === null) return;

    // chrome.windows.WINDOW_ID_NONE means all windows lost focus (e.g. alt-tab out of Chrome)
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;

    if (windowId !== this.trackedWindowId && !this.paused) {
      this.pause();
    } else if (windowId === this.trackedWindowId && this.paused) {
      // Window regained focus — but the tracked tab might not be the active
      // tab in that window, so verify before resuming.
      chrome.tabs.query({ active: true, windowId: this.trackedWindowId }, (tabs) => {
        if (tabs[0]?.id === this.trackedTabId && this.paused) {
          this.resume();
        }
      });
    }
  }

  private pause(): void {
    console.log(`[Ambient] TabTracker: paused — user left tracked tab ${this.trackedTabId}`);
    this.paused = true;
    this.callbacks.onPaused(this.trackedTabTitle);
  }

  private resume(): void {
    console.log(`[Ambient] TabTracker: resumed — user returned to tracked tab ${this.trackedTabId}`);
    this.paused = false;
    this.callbacks.onResumed();
    if (this.resumeResolve) {
      this.resumeResolve();
      this.resumeResolve = null;
    }
  }
}
