/** SpinLab BLE v1 20-byte shot result 封包回歸測試。 */
import { SPINLAB_PACKET_LENGTH, SPINLAB_STATUS_PACKET_LENGTH, SpinLabConnection, parseSpinLabResult, parseSpinLabStatus } from '../src/data/spinlab.js';

const packet = new Uint8Array(SPINLAB_PACKET_LENGTH);
packet[0] = 1;
packet[1] = 0;
packet[2] = 0x03;
packet[3] = 2;
write16(packet, 4, 42);
write16(packet, 6, 8353);
write16(packet, 8, 8010);
write16(packet, 10, 8695);
write16(packet, 12, 34);
write16(packet, 14, 1851);
write16(packet, 16, 205);
write16(packet, 18, 8174);

const backing = new Uint8Array(28);
backing.set(packet, 4);
const reading = parseSpinLabResult(new DataView(backing.buffer, 4, SPINLAB_PACKET_LENGTH));
assert(reading.valid && reading.status === 'valid', '解析有效 shot 狀態');
assert(reading.shotId === 42 && reading.totalShootCounter === 42, '解析 little-endian shot id');
assert(reading.shootPower === 8353 && reading.referenceSpLow === 8010 && reading.referenceSpHigh === 8695, '解析 Reference SP 中央值與範圍');
assert(reading.transitions === 34 && reading.pullActiveTimeMs === 185.1 && reading.reversalGapMs === 20.5, '解析 edge 與 0.1 ms 時間單位');
assert(reading.pullPeakRpm === 8174 && reading.bothEdges && reading.rewindAnomaly && !reading.alternationError, '解析 RPM 與 bit flags');
assert(reading.reversalType === 'smooth-gaps' && reading.source === 'spinlab', '解析 reversal 類型與資料來源');

const invalid = packet.slice();
invalid[1] = 2;
write16(invalid, 4, 43);
const invalidReading = parseSpinLabResult(invalid);
assert(!invalidReading.valid && invalidReading.status === 'no-reversal', '無 reversal shot 標記為無效');

assertThrows(() => parseSpinLabResult(packet.slice(0, 19)), '錯誤封包長度會拒絕解析');
const future = packet.slice();
future[0] = 2;
assertThrows(() => parseSpinLabResult(future), '未知協定版本會拒絕解析');

const received = [];
const rejected = [];
const connection = new SpinLabConnection({
  onReading: (value) => received.push(value),
  onInvalidReading: (value) => rejected.push(value),
});
connection.onNotification({ target: { value: new DataView(packet.buffer) } });
connection.onNotification({ target: { value: new DataView(packet.buffer) } });
connection.onNotification({ target: { value: new DataView(invalid.buffer) } });
assert(received.length === 1 && received[0].shotId === 42, 'notification 只送出一次有效 shot');
assert(rejected.length === 1 && rejected[0].status === 'no-reversal', '無效 shot 交給獨立 handler 且不加入測速紀錄');

const statusPacket = new Uint8Array(SPINLAB_STATUS_PACKET_LENGTH);
statusPacket.set([1, 0x07, 1, 1]);
const liveStatus = parseSpinLabStatus(statusPacket);
assert(liveStatus.loadInitialized && liveStatus.loadInstalled && liveStatus.charging, '解析已安裝與充電狀態 flags');
assert(liveStatus.loadRawLevel === 1 && liveStatus.loadStableLevel === 1, '解析 GPIO1 raw 與 stable level');

const emptyStatus = parseSpinLabStatus(Uint8Array.from([1, 0x04, 0, 0]));
assert(emptyStatus.loadInitialized && !emptyStatus.loadInstalled && !emptyStatus.charging, '解析 Launcher 未安裝狀態');
assertThrows(() => parseSpinLabStatus(Uint8Array.from([1, 0, 0])), '錯誤狀態封包長度會拒絕解析');

const receivedStatuses = [];
const statusConnection = new SpinLabConnection({ onLiveStatus: (value) => receivedStatuses.push(value) });
statusConnection.onStatusNotification({ target: { value: new DataView(statusPacket.buffer) } });
assert(receivedStatuses.length === 1 && receivedStatuses[0].loadInstalled, 'status notification 送出 Launcher 裝載狀態');

console.log('PASS spinlab tests');

function write16(bytes, offset, value) { bytes[offset] = value & 0xFF; bytes[offset + 1] = value >> 8 & 0xFF; }
function assert(condition, message) { if (!condition) throw new Error(message); }
function assertThrows(fn, message) { try { fn(); } catch { return; } throw new Error(message); }
