export interface Message {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  offer?: Offer;
}

export interface Offer {
  w: number; // wholesale price
  q: number; // quantity
}

export interface NegotiationParams {
  c: number; // production_cost
  p: number; // retail_price
  demand_min: number;
  demand_max: number;
}

export interface ProfitCalcs {
  supplier_profit: number;
  retailer_profit: number;
  total_profit: number;
}

export interface NashSolution {
    order_quantity: number;
    wholesale_price: number;
    retailer_profit: number;
    supplier_profit: number;
    total_profit: number;
}

export interface AiResponse {
  text: string;
  offer?: Offer;
  debugPrompt?: string;
}