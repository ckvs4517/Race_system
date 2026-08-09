/** BeyBattle Pass 17-byte notification 解析與工作階段統計回歸測試。 */
import { BBP_PACKET_LENGTH, BattlePassPacketParser, calculateShootStats } from '../src/domain/battle-pass.js';

const statusParser = new BattlePassPacketParser();
const statusPacket = packet(0xA0);
statusPacket[3] = 0x01;
write16(statusPacket, 7, 15432);
write16(statusPacket, 9, 321);
statusPacket.set([0x01, 0x23, 0x45, 0x67, 0x89, 0xAB], 11);
const status = statusParser.ingest(statusPacket);
assert(status.type === 'status', 'A0 封包辨識為狀態資料');
assert(status.maxShootPower === 15432, 'A0 解析最大 Shoot Power');
assert(status.totalShootCounter === 321, 'A0 解析裝置累積發射次數');
assert(status.deviceUid === '0123456789AB', 'A0 解析 6-byte Battle Pass UID');

for (const listIndex of [1, 8, 9, 49, 50]) {
  const parser = new BattlePassPacketParser();
  const { packets, expected } = shootPackets(listIndex);
  let result;
  for (const current of packets) result = parser.ingest(current);
  assert(result.type === 'shoot', `第 ${listIndex} 筆 SP 可完成一組發射資料`);
  assert(result.shootPower === expected, `第 ${listIndex} 筆 SP 跨封包索引正確`);
  assert(result.totalShootCounter === 777, `第 ${listIndex} 筆保留裝置累積次數`);
  assert(result.profile.length === 32, `第 ${listIndex} 筆保留 32 點 power profile`);
}

const broken = shootPackets(5).packets;
broken.find((item) => item[0] === 0xB7)[16] ^= 0xFF;
const brokenParser = new BattlePassPacketParser();
let brokenResult;
for (const current of broken) brokenResult = brokenParser.ingest(current);
assert(brokenResult.type === 'error' && brokenResult.reason === 'checksum-mismatch', 'checksum 錯誤不輸出錯誤 Shoot Power');

const stats = calculateShootStats([
  { shootPower: 10000 }, { shootPower: 12000 }, { shootPower: 11000 }, { shootPower: 13000 }, { shootPower: 9000 }, { shootPower: 12500 },
]);
assert(stats.count === 6, '統計計算發射筆數');
assert(stats.max === 13000 && stats.min === 9000, '統計計算最高與最低 SP');
assert(stats.average === 11250, '統計計算平均 SP');
assert(stats.top.join(',') === '13000,12500,12000,11000,10000', '統計保留 Top 5');

console.log('PASS battle-pass tests');

function shootPackets(listIndex) {
  const packets = [];
  const values = Array.from({ length: 50 }, (_, index) => 8000 + index * 137);
  for (let header = 0xB0; header <= 0xB6; header += 1) packets.push(packet(header));
  values.forEach((value, zeroBased) => {
    const header = 0xB0 + Math.floor(zeroBased / 8);
    if (header > 0xB6) return;
    const offset = 1 + (zeroBased % 8) * 2;
    if (offset + 1 >= BBP_PACKET_LENGTH) return;
    const target = packets.find((item) => item[0] === header);
    write16(target, offset, value);
  });
  const tail = packets.find((item) => item[0] === 0xB6);
  write16(tail, 7, Math.max(...values));
  write16(tail, 9, 777);
  tail[11] = listIndex;

  const checksum = packets.reduce((total, current) => total + current.slice(1).reduce((sum, value) => sum + value, 0), 0) & 0xFF;
  const checksumPacket = packet(0xB7);
  checksumPacket[16] = checksum;
  packets.push(checksumPacket);

  for (let header = 0x70; header <= 0x73; header += 1) {
    const profile = packet(header);
    for (let offset = 1; offset <= 15; offset += 2) write16(profile, offset, 1000 + (header - 0x70) * 100 + offset);
    packets.push(profile);
  }
  return { packets, expected: values[listIndex - 1] };
}

function packet(header) { const result = new Uint8Array(BBP_PACKET_LENGTH); result[0] = header; return result; }
function write16(bytes, offset, value) { bytes[offset] = value & 0xFF; bytes[offset + 1] = value >> 8 & 0xFF; }
function assert(condition, message) { if (!condition) throw new Error(message); console.log(`PASS ${message}`); }
