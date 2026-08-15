import { createMeasurement } from '../src/domain/measurement.js';

const spinlab = createMeasurement({
  source: 'spinlab', shotId: 7, shootPower: 8300, pullPeakRpm: 8174,
  transitions: 34, pullActiveTimeMs: 185.1, loadInstalled: true,
});
assert(spinlab.schemaVersion === 1, 'measurement schema version');
assert(spinlab.deviceType === 'spinlab' && spinlab.peakRpm === 8174, 'SpinLab fields normalized');
assert(spinlab.pull.edgeCount === 34 && spinlab.pull.durationUs === 185100, 'pull fields normalized');
assert(spinlab.status.loadInstalled === true, 'status fields normalized');

const battlePass = createMeasurement({ source: 'battle-pass', shootPower: 9000, profile: [1, 2] });
assert(battlePass.deviceType === 'battle-pass' && battlePass.profile.length === 2, 'Battle Pass fields normalized');
assert(battlePass.rawEdges.length === 0 && battlePass.peakRpm === null, 'optional fields are safe defaults');

console.log('PASS measurement tests');

function assert(condition, message) { if (!condition) throw new Error(message); }
