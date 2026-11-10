import type { MathModel } from '../model';
import BM2_92 from './bm2-92';
import BM2_94 from './bm2-94';
import BM2_96 from './bm2-96';

/**
 * Every RTP variant, by model id. Variants share the rules and paytable and
 * differ only in reel strips and crate-reveal weights.
 */
export const MODELS: Record<string, MathModel> = {
  [BM2_96.id]: BM2_96,
  [BM2_94.id]: BM2_94,
  [BM2_92.id]: BM2_92,
};

export const DEFAULT_MODEL_ID = BM2_96.id;
