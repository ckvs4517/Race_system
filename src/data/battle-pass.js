/** Web Bluetooth 連線層：負責單一 BeyBattle Pass 的 GATT lifecycle 與 notification。 */
import { BBP_LOCAL_NAME, BBP_SERVICE_UUID, BBP_SP_CHARACTERISTIC_UUID, BattlePassPacketParser } from '../domain/battle-pass.js';

export class BattlePassConnection {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.parser = new BattlePassPacketParser();
    this.device = null;
    this.characteristic = null;
    this.handleNotification = (event) => this.onNotification(event);
    this.handleDisconnected = () => this.onDisconnected();
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth);
  }

  get connected() {
    return Boolean(this.device?.gatt?.connected);
  }

  async connect() {
    if (!BattlePassConnection.isSupported()) throw new Error('目前瀏覽器不支援 Web Bluetooth。請改用支援 Web Bluetooth 的 Chrome 瀏覽器。');
    if (this.connected) return this.device;

    this.handlers.onStatus?.('requesting');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: BBP_LOCAL_NAME }],
      optionalServices: [BBP_SERVICE_UUID],
    });

    this.device = device;
    this.device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    this.handlers.onDevice?.({ name: device.name || BBP_LOCAL_NAME, browserDeviceId: device.id || '' });
    this.handlers.onStatus?.('connecting');

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BBP_SERVICE_UUID);
    const characteristic = await service.getCharacteristic(BBP_SP_CHARACTERISTIC_UUID);
    if (!characteristic.properties.notify) throw new Error('Battle Pass 的 Shoot Power characteristic 未提供 Notify。');

    this.characteristic = characteristic;
    this.characteristic.addEventListener('characteristicvaluechanged', this.handleNotification);
    await this.characteristic.startNotifications();
    this.handlers.onStatus?.('connected');
    return device;
  }

  async disconnect() {
    const characteristic = this.characteristic;
    this.characteristic = null;
    if (characteristic) {
      characteristic.removeEventListener('characteristicvaluechanged', this.handleNotification);
      try { await characteristic.stopNotifications(); } catch {}
    }
    if (this.device) this.device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.handlers.onStatus?.('disconnected');
  }

  onNotification(event) {
    try {
      const result = this.parser.ingest(event.target.value);
      if (result.type === 'status') this.handlers.onDevice?.({ deviceUid: result.deviceUid, maxShootPower: result.maxShootPower, totalShootCounter: result.totalShootCounter });
      if (result.type === 'shoot') this.handlers.onReading?.(result);
      if (result.type === 'error') this.handlers.onError?.(new Error('收到的 Battle Pass 資料 checksum 不一致，本次資料已略過。'));
    } catch (error) {
      this.handlers.onError?.(error);
    }
  }

  onDisconnected() {
    if (this.characteristic) this.characteristic.removeEventListener('characteristicvaluechanged', this.handleNotification);
    this.characteristic = null;
    this.handlers.onStatus?.('disconnected');
  }
}
