
import type { NegotiationParams } from './types';

export const INITIAL_PARAMS: NegotiationParams = {
  c: 3,    // Supplier's per-unit production cost
  p: 10,   // Retailer's selling price
  demand_min: 0,
  demand_max: 100,
};
