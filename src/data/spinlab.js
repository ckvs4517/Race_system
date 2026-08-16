/** SpinLab Web Bluetooth 連線與 20-byte shot result 封包解析。 */
export const SPINLAB_LOCAL_NAME = 'SpinLab';
export const SPINLAB_SERVICE_UUID = '8f4e1000-9c3a-4f2b-a7d1-6b5c2e91a001';
export const SPINLAB_RESULT_CHARACTERISTIC_UUID = '8f4e1000-9c3a-4f2b-a7d1-6b5c2e91a002';
export const SPINLAB_STATUS_CHARACTERISTIC_UUID = '8f4e1000-9c3a-4f2b-a7d1-6b5c2e91a003';
export const SPINLAB_RAW_CHARACTERISTIC_UUID = '8f4e1000-9c3a-4f2b-a7d1-6b5c2e91a004';
export const SPINLAB_PACKET_LENGTH = 20;
export const SPINLAB_STATUS_PACKET_LENGTH = 4;
export const SPINLAB_PROTOCOL_VERSION = 1;

const STATUS_NAMES = ['valid', 'invalid-short', 'no-reversal', 'overflow'];
const REVERSAL_NAMES = ['none', 'strong-gap', 'smooth-gaps'];

export function parseSpinLabResult(input) {
  const bytes = toBytes(input);
  if (bytes.byteLength !== SPINLAB_PACKET_LENGTH) {
    throw new Error(`SpinLab 封包長度錯誤：預期 ${SPINLAB_PACKET_LENGTH} bytes，實際 ${bytes.byteLength} bytes。`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== SPINLAB_PROTOCOL_VERSION) {
    throw new Error(`SpinLab 通訊版本不相容：網站支援 v${SPINLAB_PROTOCOL_VERSION}，裝置送出 v${version}。`);
  }

  const statusCode = view.getUint8(1);
  const flags = view.getUint8(2);
  const reversalCode = view.getUint8(3);
  const shotId = view.getUint16(4, true);
  return {
    type: 'shoot',
    source: 'spinlab',
    valid: statusCode === 0,
    status: STATUS_NAMES[statusCode] || `unknown-${statusCode}`,
    statusCode,
    shotId,
    totalShootCounter: shotId,
    shootPower: view.getUint16(6, true),
    referenceSpLow: view.getUint16(8, true),
    referenceSpHigh: view.getUint16(10, true),
    transitions: view.getUint16(12, true),
    pullActiveTimeMs: view.getUint16(14, true) / 10,
    reversalGapMs: view.getUint16(16, true) / 10,
    pullPeakRpm: view.getUint16(18, true),
    bothEdges: Boolean(flags & 0x01),
    rewindAnomaly: Boolean(flags & 0x02),
    alternationError: Boolean(flags & 0x04),
    reversalType: REVERSAL_NAMES[reversalCode] || `unknown-${reversalCode}`,
    reversalCode,
    profile: [],
  };
}

export function parseSpinLabStatus(input) {
  const bytes = toBytes(input);
  if (bytes.byteLength !== SPINLAB_STATUS_PACKET_LENGTH) {
    throw new Error(`SpinLab 狀態封包長度錯誤：預期 ${SPINLAB_STATUS_PACKET_LENGTH} bytes，實際 ${bytes.byteLength} bytes。`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(0);
  if (version !== SPINLAB_PROTOCOL_VERSION) {
    throw new Error(`SpinLab 狀態通訊版本不相容：網站支援 v${SPINLAB_PROTOCOL_VERSION}，裝置送出 v${version}。`);
  }
  const flags = view.getUint8(1);
  return {
    type: 'status',
    source: 'spinlab',
    loadInstalled: Boolean(flags & 0x01),
    charging: Boolean(flags & 0x02),
    loadInitialized: Boolean(flags & 0x04),
    loadRawLevel: view.getUint8(2),
    loadStableLevel: view.getUint8(3),
  };
}

export function parseSpinLabRawChunk(input) {
  const bytes = toBytes(input);
  if (bytes.byteLength !== 20 || bytes[1] !== 1) throw new Error('Invalid SpinLab raw chunk');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const edges = [];
  const count = view.getUint8(8);
  for (let i = 0; i < count; i += 1) edges.push({ deltaUs: view.getUint16(13 + i * 3, true), flags: view.getUint8(15 + i * 3) });
  return { shotId: view.getUint16(2, true), chunkIndex: view.getUint8(4), totalChunks: view.getUint8(5), edgeStart: view.getUint16(6, true), baseTimestampUs: view.getUint32(9, true), edges };
}

export class SpinLabConnection {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.device = null;
    this.characteristic = null;
    this.statusCharacteristic = null;
    this.rawCharacteristic = null;
    this.lastShotId = null;
    this.handleNotification = (event) => this.onNotification(event);
    this.handleStatusNotification = (event) => this.onStatusNotification(event);
    this.handleRawNotification = (event) => this.onRawNotification(event);
    this.handleDisconnected = () => this.onDisconnected();
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth);
  }

  get connected() {
    return Boolean(this.device?.gatt?.connected);
  }

  async connect() {
    if (!SpinLabConnection.isSupported()) throw new Error('目前瀏覽器不支援 Web Bluetooth。請改用支援 Web Bluetooth 的 Chrome 或 Edge。');
    if (this.connected) return this.device;

    this.handlers.onStatus?.('requesting');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: SPINLAB_LOCAL_NAME }],
      optionalServices: [SPINLAB_SERVICE_UUID],
    });
    this.device = device;
    this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    this.handlers.onDevice?.({ name: device.name || SPINLAB_LOCAL_NAME, browserDeviceId: device.id || '' });
    this.handlers.onStatus?.('connecting');

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SPINLAB_SERVICE_UUID);
    const characteristic = await service.getCharacteristic(SPINLAB_RESULT_CHARACTERISTIC_UUID);
    const statusCharacteristic = await service.getCharacteristic(SPINLAB_STATUS_CHARACTERISTIC_UUID);
    const rawCharacteristic = await service.getCharacteristic(SPINLAB_RAW_CHARACTERISTIC_UUID);
    if (!characteristic.properties.notify) throw new Error('SpinLab 結果 characteristic 未提供 Notify。');
    if (!statusCharacteristic.properties.notify || !statusCharacteristic.properties.read) throw new Error('SpinLab 狀態 characteristic 必須提供 Read 與 Notify。');

    this.characteristic = characteristic;
    this.statusCharacteristic = statusCharacteristic;
    this.rawCharacteristic = rawCharacteristic;
    this.characteristic.addEventListener('characteristicvaluechanged', this.handleNotification);
    this.statusCharacteristic.addEventListener('characteristicvaluechanged', this.handleStatusNotification);
    this.rawCharacteristic.addEventListener('characteristicvaluechanged', this.handleRawNotification);
    await this.characteristic.startNotifications();
    await this.statusCharacteristic.startNotifications();
    await this.rawCharacteristic.startNotifications();
    this.handlers.onLiveStatus?.(parseSpinLabStatus(await this.statusCharacteristic.readValue()));
    this.handlers.onStatus?.('connected');
    return device;
  }

  async disconnect() {
    const characteristic = this.characteristic;
    const statusCharacteristic = this.statusCharacteristic;
    const rawCharacteristic = this.rawCharacteristic;
    this.characteristic = null;
    this.statusCharacteristic = null;
    this.rawCharacteristic = null;
    if (characteristic) {
      characteristic.removeEventListener('characteristicvaluechanged', this.handleNotification);
      try { await characteristic.stopNotifications(); } catch {}
    }
    if (statusCharacteristic) {
      statusCharacteristic.removeEventListener('characteristicvaluechanged', this.handleStatusNotification);
      try { await statusCharacteristic.stopNotifications(); } catch {}
    }
    if (rawCharacteristic) { rawCharacteristic.removeEventListener('characteristicvaluechanged', this.handleRawNotification); try { await rawCharacteristic.stopNotifications(); } catch {} }
    if (this.device) this.device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.handlers.onStatus?.('disconnected');
  }

  onNotification(event) {
    try {
      const reading = parseSpinLabResult(event.target.value);
      if (reading.shotId === this.lastShotId) return;
      this.lastShotId = reading.shotId;
      if (reading.valid) this.handlers.onReading?.(reading);
      else this.handlers.onInvalidReading?.(reading);
    } catch (error) {
      this.handlers.onError?.(error);
    }
  }

  onStatusNotification(event) {
    try {
      this.handlers.onLiveStatus?.(parseSpinLabStatus(event.target.value));
    } catch (error) {
      this.handlers.onError?.(error);
    }
  }

  onDisconnected() {
    if (this.characteristic) this.characteristic.removeEventListener('characteristicvaluechanged', this.handleNotification);
    if (this.statusCharacteristic) this.statusCharacteristic.removeEventListener('characteristicvaluechanged', this.handleStatusNotification);
    if (this.rawCharacteristic) this.rawCharacteristic.removeEventListener('characteristicvaluechanged', this.handleRawNotification);
    this.characteristic = null;
    this.statusCharacteristic = null;
    this.rawCharacteristic = null;
    this.handlers.onStatus?.('disconnected');
  }

  onRawNotification(event) {
    try { this.handlers.onRawChunk?.(parseSpinLabRawChunk(event.target.value)); } catch (error) { this.handlers.onError?.(error); }
  }
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof DataView) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return Uint8Array.from(input || []);
}
