/** Screen Wake Lock 控制器：以可控 browser doubles 驗證其資源生命週期。 */
import { ScreenWakeLock } from '../src/data/screen-wake-lock.js';
import { speedometerView } from '../src/views/speedometer.js';

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.visibilityState = 'visible';
  }
}

class FakeSentinel extends EventTarget {
  constructor() {
    super();
    this.released = false;
  }

  async release() {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }

  releaseFromBrowser() {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

function createEnvironment({ failRequest = false } = {}) {
  const documentRef = new FakeDocument();
  const sentinels = [];
  const environment = { requests: 0, sentinels, documentRef, options: null };
  const wakeLock = {
    async request() {
      environment.requests += 1;
      if (failRequest) throw new Error('permission denied');
      const sentinel = new FakeSentinel();
      sentinels.push(sentinel);
      return sentinel;
    },
  };
  environment.options = { navigatorRef: { wakeLock }, documentRef };
  return environment;
}

const supported = createEnvironment();
const manager = new ScreenWakeLock(supported.options);
await manager.setContext({ connected: true, sessionActive: true });
assert(supported.requests === 1 && manager.getState().active, '支援 Wake Lock 時，已連線工作階段會申請螢幕常亮');

await manager.setContext({ connected: false, sessionActive: false });
assert(supported.sentinels[0].released && !manager.getState().active, '中斷連線會釋放 Wake Lock');

await manager.setContext({ connected: true, sessionActive: true });
const beforeToggle = supported.requests;
await manager.setEnabled(false);
assert(supported.sentinels.at(-1).released && !manager.getState().active, '使用者關閉開關會釋放 Wake Lock');
await manager.setEnabled(true);
assert(supported.requests === beforeToggle + 1 && manager.getState().active, '重新開啟且已連線時會立即重新申請 Wake Lock');

const visibleRequests = supported.requests;
supported.documentRef.visibilityState = 'hidden';
supported.documentRef.dispatchEvent(new Event('visibilitychange'));
assert(supported.requests === visibleRequests, '頁面 hidden 時不會重新申請 Wake Lock');
supported.sentinels.at(-1).releaseFromBrowser();
assert(!manager.getState().active, '瀏覽器自動 release sentinel 時會更新狀態');
supported.documentRef.visibilityState = 'visible';
supported.documentRef.dispatchEvent(new Event('visibilitychange'));
await tick();
assert(supported.requests === visibleRequests + 1 && manager.getState().active, '回到 visible 且測速仍有效時會重新申請 Wake Lock');

const cleanupSentinel = supported.sentinels.at(-1);
await manager.cleanup();
assert(cleanupSentinel.released && !manager.getState().active, 'component cleanup 會釋放 Wake Lock');
const afterCleanup = supported.requests;
supported.documentRef.dispatchEvent(new Event('visibilitychange'));
assert(supported.requests === afterCleanup, 'cleanup 後會移除 visibility listener');

const unsupported = new ScreenWakeLock({ navigatorRef: {}, documentRef: new FakeDocument() });
await unsupported.setContext({ connected: true, sessionActive: true });
assert(!unsupported.getState().supported && !unsupported.getState().active, '不支援 Wake Lock 時安全降級');

const failed = createEnvironment({ failRequest: true });
const failedManager = new ScreenWakeLock(failed.options);
await failedManager.setContext({ connected: true, sessionActive: true });
assert(!failedManager.getState().active && failedManager.getState().error, 'Wake Lock request 失敗不會拋出並保留錯誤狀態');

const view = speedometerView();
assert(view.includes('data-speed-keep-display-awake') && view.includes('DISPLAY'), '轉速表顯示防熄屏狀態與控制開關');
assert(view.includes('data-speed-action="connect-spinlab"') && view.includes('data-speed-action="connect-battle-pass"'), '轉速表可選擇 SpinLab 或 Battle Pass');
assert(view.includes('LOAD SENSOR STANDBY') && view.includes('GPIO1'), '轉速表顯示 SpinLab 陀螺安裝狀態燈');

console.log('PASS screen wake lock tests');

function tick() { return new Promise((resolve) => setTimeout(resolve, 0)); }
function assert(condition, message) { if (!condition) throw new Error(message); console.log(`PASS ${message}`); }
