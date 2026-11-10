import type { MathModel } from '../model';
import BM2_96 from './bm2-96';

/** Every certified-for-submission RTP variant, by model id. */
export const MODELS: Record<string, MathModel> = {
  [BM2_96.id]: BM2_96,
};

export const DEFAULT_MODEL_ID = BM2_96.id;
