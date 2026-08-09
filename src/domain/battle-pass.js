/** BeyBattle Pass BLE 封包解析；只處理純資料，不直接碰瀏覽器 Bluetooth API。 */
export const BBP_LOCAL_NAME = 'BEYBLADE_TOOL01';
export const BBP_SERVICE_UUID = '55c40000-f8eb-11ec-b939-0242ac120002';
export const BBP_SP_CHARACTERISTIC_UUID = '55c4f002-f8eb-11ec-b939-0242ac120002';
export const BBP_PACKET_LENGTH = 17;

const HEADER_STATUS = 0xA0;
const HEADER_LIST_FIRST = 0xB0;
const HEADER_LIST_LAST = 0xB6;
const HEADER_CHECKSUM = 0xB7;
const HEADER_PROFILE_LAST = 0x73;

/**
 * Battle Pass 會以 17-byte notification 分段送出資料；0x73 代表一組發射資料結束。
 * 這裡依公開逆向格式重建 B0-B6 的 SP list，並用 B7 checksum 避免記錄破損資料。
 */
export class BattlePassPacketParser {
  constructor() {
    this.packetMap = new Map();
    this.deviceUid = '';
  }

  reset() {
    this.packetMap.clear();
  }

  ingest(input) {
    const bytes = toBytes(input);
    if (bytes.length !== BBP_PACKET_LENGTH) {
      return { type: 'ignored', reason: 'invalid-length', length: bytes.length };
    }

    const header = bytes[0];
    if (header === HEADER_STATUS) {
      const deviceUid = [...bytes.slice(11, 17)].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
      this.deviceUid = deviceUid || this.deviceUid;
      return {
        type: 'status',
        state: bytes[3],
        maxShootPower: readUint16LE(bytes, 7),
        totalShootCounter: readUint16LE(bytes, 9),
        deviceUid: this.deviceUid,
      };
    }

    this.packetMap.set(header, bytes.slice());
    if (header !== HEADER_PROFILE_LAST) return { type: 'pending', header };

    try {
      return this.finishShoot();
    } finally {
      this.packetMap.clear();
    }
  }

  finishShoot() {
    for (let header = HEADER_LIST_FIRST; header <= HEADER_LIST_LAST; header += 1) {
      if (!this.packetMap.has(header)) return { type: 'ignored', reason: 'incomplete-sp-list' };
    }
    const checksumPacket = this.packetMap.get(HEADER_CHECKSUM);
    if (!checksumPacket) return { type: 'ignored', reason: 'missing-checksum' };

    let checksum = 0;
    for (let header = HEADER_LIST_FIRST; header <= HEADER_LIST_LAST; header += 1) {
      const packet = this.packetMap.get(header);
      for (let index = 1; index < BBP_PACKET_LENGTH; index += 1) checksum += packet[index];
    }
    if ((checksum & 0xFF) !== checksumPacket[16]) {
      return { type: 'error', reason: 'checksum-mismatch', expected: checksumPacket[16], actual: checksum & 0xFF };
    }

    const listTail = this.packetMap.get(HEADER_LIST_LAST);
    const listIndex = listTail[11];
    if (listIndex < 1 || listIndex > 50) return { type: 'ignored', reason: 'invalid-list-index', listIndex };

    // 每包 B0-B5 各有 8 筆 SP；B6 有第 49、50 筆。listIndex 為 1-based。
    const zeroBasedIndex = listIndex - 1;
    const packetHeader = HEADER_LIST_FIRST + Math.floor(zeroBasedIndex / 8);
    const packetOffset = 1 + (zeroBasedIndex % 8) * 2;
    const valuePacket = this.packetMap.get(packetHeader);
    if (!valuePacket || packetOffset + 1 >= BBP_PACKET_LENGTH) {
      return { type: 'ignored', reason: 'invalid-sp-position', listIndex };
    }

    const profile = [];
    for (let header = 0x70; header <= 0x73; header += 1) {
      const packet = this.packetMap.get(header);
      if (!packet) continue;
      for (let offset = 1; offset <= 15; offset += 2) profile.push(readUint16LE(packet, offset));
    }

    return {
      type: 'shoot',
      shootPower: readUint16LE(valuePacket, packetOffset),
      totalShootCounter: readUint16LE(listTail, 9),
      listIndex,
      profile,
      deviceUid: this.deviceUid,
    };
  }
}

export function calculateShootStats(readings = []) {
  const values = readings.map((item) => Number(item.shootPower)).filter(Number.isFinite);
  if (!values.length) return { count: 0, max: 0, min: 0, average: 0, top: [] };
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    max: Math.max(...values),
    min: Math.min(...values),
    average: Math.round(sum / values.length),
    top: [...values].sort((a, b) => b - a).slice(0, 5),
  };
}

function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof DataView) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return Uint8Array.from(input || []);
}
