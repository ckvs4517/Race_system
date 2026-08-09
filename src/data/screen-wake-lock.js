/**
 * Screen Wake Lock 的瀏覽器相容控制器。
 *
 * Wake Lock 與 Battle Pass BLE 必須彼此獨立：裝置或瀏覽器拒絕常亮時，
 * 測速、通知與工作階段都仍可繼續。此類別只管理螢幕常亮的生命週期。
 */
export class ScreenWakeLock {
  /**
   * @param {{ navigatorRef?: Navigator | null, documentRef?: Document | null, onChange?: (state: WakeLockState) => void }} options
   */
  constructor(options = {}) {
    this.navigatorRef = options.navigatorRef ?? (typeof navigator === 'undefined' ? null : navigator);
    this.documentRef = options.documentRef ?? (typeof document === 'undefined' ? null : document);
    this.onChange = options.onChange || null;
    this.supported = Boolean(this.navigatorRef && 'wakeLock' in this.navigatorRef && this.navigatorRef.wakeLock?.request);
    this.enabled = true;
    this.connected = false;
    this.sessionActive = false;
    this.sentinel = null;
    this.requestInFlight = null;
    this.error = null;
    this.handleVisibilityChange = () => this.onVisibilityChange();
    this.handleSentinelRelease = () => this.onSentinelRelease();
    this.documentRef?.addEventListener?.('visibilitychange', this.handleVisibilityChange);
  }

  /** @returns {WakeLockState} current UI-safe state. */
  getState() {
    return {
      supported: this.supported,
      enabled: this.enabled,
      active: Boolean(this.sentinel && !this.sentinel.released),
      error: this.error,
    };
  }

  /** Update BLE and session state, then safely reconcile the requested lock. */
  async setContext({ connected = this.connected, sessionActive = this.sessionActive } = {}) {
    this.connected = Boolean(connected);
    this.sessionActive = Boolean(sessionActive);
    return this.sync();
  }

  /** Enable or disable the user preference without touching the BLE connection. */
  async setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    return this.sync();
  }

  /** Request a screen lock only while the foreground measurement context is valid. */
  async requestWakeLock() {
    if (!this.supported || !this.canRequest() || this.sentinel || this.requestInFlight) return this.requestInFlight;
    this.error = null;
    const request = Promise.resolve(this.navigatorRef.wakeLock.request('screen'))
      .then(async (sentinel) => {
        this.requestInFlight = null;
        // A connection can end while the browser permission prompt is open.
        // Release a late grant instead of leaving a stale lock behind.
        if (!this.canRequest()) {
          try { await sentinel.release?.(); } catch {}
          return;
        }
        this.sentinel = sentinel;
        sentinel.addEventListener?.('release', this.handleSentinelRelease);
        this.notify();
      })
      .catch((error) => {
        this.requestInFlight = null;
        this.error = error || new Error('Wake Lock request failed');
        this.notify();
      });
    this.requestInFlight = request;
    return request;
  }

  /** Release the current sentinel and restore the operating system's normal timeout. */
  async releaseWakeLock() {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (!sentinel) {
      this.notify();
      return;
    }
    sentinel.removeEventListener?.('release', this.handleSentinelRelease);
    try { await sentinel.release?.(); } catch {}
    this.notify();
  }

  /** Remove global listeners and release any held resource when the page is left. */
  async cleanup() {
    this.documentRef?.removeEventListener?.('visibilitychange', this.handleVisibilityChange);
    this.connected = false;
    this.sessionActive = false;
    await this.releaseWakeLock();
  }

  async sync() {
    if (!this.shouldMaintainLock()) return this.releaseWakeLock();
    return this.requestWakeLock();
  }

  shouldMaintainLock() {
    return this.supported && this.enabled && this.connected && this.sessionActive && this.isDocumentVisible();
  }

  canRequest() {
    return this.shouldMaintainLock() && !(this.sentinel && !this.sentinel.released);
  }

  isDocumentVisible() {
    return !this.documentRef || this.documentRef.visibilityState !== 'hidden';
  }

  onVisibilityChange() {
    // Browsers commonly release Wake Lock in the background. Never request
    // while hidden; only restore when the same active session returns visible.
    if (!this.isDocumentVisible()) return;
    if (this.shouldMaintainLock() && (!this.sentinel || this.sentinel.released)) this.requestWakeLock();
  }

  onSentinelRelease() {
    this.sentinel?.removeEventListener?.('release', this.handleSentinelRelease);
    this.sentinel = null;
    this.notify();
  }

  notify() {
    this.onChange?.(this.getState());
  }
}

/** @typedef {{ supported: boolean, enabled: boolean, active: boolean, error: Error | null }} WakeLockState */
