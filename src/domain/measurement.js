/**
 * Unified measurement model shared by SpinLab and Battle Pass sources.
 * Device adapters may expose different fields, but the UI and persistence
 * layers can consume this stable shape.
 */
export function createMeasurement(input = {}, options = {}) {
  const source = input.source || options.source || 'unknown';
  const capturedAt = input.capturedAt || input.at || options.capturedAt || new Date().toISOString();
  const peakRpm = finiteOrNull(input.peakRpm ?? input.pullPeakRpm);
  const pullActiveTimeMs = finiteOrNull(input.pullActiveTimeMs);
  return {
    schemaVersion: 1,
    id: input.id || `${source}-${capturedAt}-${input.shotId ?? input.totalShootCounter ?? 'measurement'}`,
    source,
    deviceType: source,
    capturedAt,
    // ESP32-relative timing fields are optional until the BLE raw-profile
    // protocol carries them. Keep the slots stable for future firmware.
    shotStartedUs: finiteOrNull(input.shotStartedUs),
    releaseUs: finiteOrNull(input.releaseUs),
    shotCompletedUs: finiteOrNull(input.shotCompletedUs),
    shootPower: finiteOrNull(input.shootPower),
    referenceSp: finiteOrNull(input.referenceSp),
    referenceSpLow: finiteOrNull(input.referenceSpLow),
    referenceSpHigh: finiteOrNull(input.referenceSpHigh),
    peakRpm,
    // Compatibility aliases for existing exports and UI components.
    pullPeakRpm: peakRpm,
    pullActiveTimeMs,
    reversalGapMs: finiteOrNull(input.reversalGapMs),
    transitions: input.transitions ?? input.pull?.edgeCount ?? null,
    bothEdges: input.bothEdges ?? null,
    alternationError: input.alternationError ?? null,
    reversalType: input.reversalType ?? null,
    shotId: input.shotId ?? null,
    totalShootCounter: input.totalShootCounter ?? null,
    profile: Array.isArray(input.profile) ? input.profile : [],
    rawEdges: Array.isArray(input.rawEdges) ? input.rawEdges : [],
    pull: {
      startIndex: input.pull?.startIndex ?? input.pullStartIndex ?? null,
      endIndex: input.pull?.endIndex ?? input.pullEndIndex ?? null,
      edgeCount: input.pull?.edgeCount ?? input.pullEdges ?? input.transitions ?? null,
      durationUs: input.pull?.durationUs ?? input.pullActiveDurationUs ?? (Number.isFinite(Number(pullActiveTimeMs)) ? Number(pullActiveTimeMs) * 1000 : null),
    },
    status: {
      valid: input.valid ?? true,
      code: input.status || null,
      loadInstalled: input.status?.loadInstalled ?? input.loadInstalled ?? null,
      charging: input.status?.charging ?? input.charging ?? null,
      rewindAnomaly: input.rewindAnomaly ?? null,
    },
    metadata: { ...input.metadata },
  };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
