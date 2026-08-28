/** Tournament-wide constants and simple size calculations. */


export const BYE = '輪空';
export const PENDING = '待定';
export const MAX_TOURNAMENT_PLAYERS = 48;

export function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}
