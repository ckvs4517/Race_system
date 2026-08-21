import { deliverBlob } from '../src/export/file-delivery.js';

const original = { navigator: globalThis.navigator, File: globalThis.File, document: globalThis.document, URL: globalThis.URL };
let shared = 0;
let clicked = 0;
class TestFile extends Blob { constructor(parts, name, options) { super(parts, options); this.name = name; } }
globalThis.File = TestFile;
globalThis.document = { createElement: () => ({ set href(value) {}, set download(value) {}, click: () => { clicked += 1; } }) };
globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} };

function setNavigator(value) { Object.defineProperty(globalThis, 'navigator', { configurable: true, value }); }
setNavigator({ share: async () => { shared += 1; }, canShare: () => true });
await deliverBlob(new Blob(['x'], { type: 'text/plain' }), 'a.txt');
assert(shared === 1 && clicked === 0, 'uses Web Share files when supported');

setNavigator({ canShare: () => false });
await deliverBlob(new Blob(['x']), 'b.txt');
assert(clicked === 1, 'falls back to anchor download without file sharing');

setNavigator({ share: async () => { shared += 1; } });
await deliverBlob(new Blob(['x']), 'b2.txt');
assert(shared === 2 && clicked === 1, 'attempts Web Share when canShare is unavailable');

setNavigator({ share: async () => { const error = new Error('cancelled'); error.name = 'AbortError'; throw error; }, canShare: () => true });
await deliverBlob(new Blob(['x']), 'c.txt');
assert(clicked === 1, 'does not download after Share Sheet cancellation');

setNavigator({ share: async () => { throw new Error('unsupported'); }, canShare: () => true });
await deliverBlob(new Blob(['x']), 'd.txt');
assert(clicked === 2, 'falls back after a non-cancellation share error');

console.log('PASS file-delivery tests');
function assert(condition, message) { if (!condition) throw new Error(message); console.log(`PASS ${message}`); }
