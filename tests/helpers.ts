import type { MathModel } from '../src/engine/model';
import { SHARED_RULES } from '../src/engine/paytable';
import { parseStrip } from '../src/engine/symbols';

/** A deliberately tiny model whose full cycle can be enumerated by brute force. */
export function tinyModel(): MathModel {
  return {
    id: 'tiny',
    rtpLabel: '',
    buyRtpLabel: '',
    ...SHARED_RULES,
    maxFreeSpins: 30,
    maxMultiplier: 12,
    base: {
      strips: ['ccsS?hdPKc', 'csWhd?SPcBs', 'chsW?dSDcPh', 'cWsh?dSKGc', 'cshd?SPHcs'].map(parseStrip),
      revealWeights: [3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 0, 1],
    },
    free: {
      strips: ['ccs?hdPSKH', 'csWhd?PcWBs', 'chsW?dDScPh', 'cWsh?dKWGc', 'cshd?PHScs'].map(parseStrip),
      revealWeights: [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
    },
  };
}
