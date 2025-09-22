import type { NegotiationParams, NashSolution, ProfitCalcs, Offer } from '../types';

/**
 * Calculates E[min(q, D)] where D ~ Uniform[demand_min, demand_max]
 */
function expectedMinQuantityDemand(q: number, params: NegotiationParams): number {
    const { demand_min, demand_max } = params;
    const demand_range = demand_max - demand_min;
    if (q <= demand_min) {
        return q;
    }
    if (q >= demand_max) {
        // Corrected formula for U[min, max] is (min+max)/2. If min=0, it's max/2.
        return (demand_min + demand_max) / 2;
    }
    // Integral of min(q,D) over [d_min, d_max]
    const integral_part1 = (q * q - demand_min * demand_min) / 2;
    const integral_part2 = q * (demand_max - q);
    return (integral_part1 + integral_part2) / demand_range;
}

/**
 * Calculates expected profits for supplier and retailer.
 */
export function calculateProfits(w: number, q: number, params: NegotiationParams): ProfitCalcs {
    const expected_sales = expectedMinQuantityDemand(q, params);
    const supplier_profit = w * expected_sales - params.c * q;
    const retailer_profit = (params.p - w) * expected_sales;
    return {
        supplier_profit,
        retailer_profit,
        total_profit: supplier_profit + retailer_profit,
    };
}

/**
 * Calculates the Nash bargaining solution under full information.
 */
export function nashBargainingSolution(params: NegotiationParams): NashSolution {
    const { p, c, demand_max, demand_min } = params;
    const demand_range = demand_max - demand_min;

    // Simplified q_star assuming demand_min=0. Let's use the full formula.
    // Full q_star is the root of p*q - p*d_min - c*d_range = 0
    // Simplified, for d_min=0, it is (p-c)/p * d_max if q <= d_max. 
    // The logic in the Python seems to be a specific case.
    // Based on the paper, q* is where E[MR]=MC. For uniform, this is more complex.
    // The provided python code q_star = self.demand_range * (self.p - self.c) / self.p is a known result for a specific model setup. We'll use it.
    const q_star_float = demand_range * (p - c) / p;
    const q_star = Math.round(q_star_float);

    // The w_star formula from Python is also specific to the model.
    const w_star = p * (p + 3*c) / (2 * (p + c));
    
    const profits = calculateProfits(w_star, q_star, params);

    return {
        order_quantity: q_star,
        wholesale_price: w_star,
        retailer_profit: profits.retailer_profit,
        supplier_profit: profits.supplier_profit,
        total_profit: profits.total_profit,
    };
}

/**
 * A simple bisection method implementation to find a root of a function.
 */
function bisection<T,>(func: (x: number, context: T) => number, context: T, a: number, b: number, tol = 1e-5, max_iter = 100): number | null {
    let f_a = func(a, context);
    if (f_a * func(b, context) >= 0) {
        // No root in interval or multiple roots
        return null;
    }

    let c = a;
    for (let i = 0; i < max_iter; i++) {
        c = (a + b) / 2;
        let f_c = func(c, context);

        if (Math.abs(f_c) < tol || (b - a) / 2 < tol) {
            return c;
        }

        if (f_a * f_c < 0) {
            b = c;
        } else {
            a = c;
            f_a = f_c;
        }
    }
    return c;
}

/**
 * Given wholesale price w, find the quantity q that yields a target retailer profit.
 */
export function findQForTargetRetailerProfit(w: number, targetProfit: number, params: NegotiationParams): number | null {
    const { p } = params;

    // If w >= p, retailer profit is zero or negative, can't hit a positive target.
    if (w >= p) {
        return targetProfit <= 0 ? 0 : null;
    }

    const profitDifference = (q: number): number => {
        const { retailer_profit } = calculateProfits(w, q, params);
        return retailer_profit - targetProfit;
    };
    
    // Search for q in a reasonable range. Since retailer profit is monotonic with q, bisection is fine.
    // We search a bit beyond demand_max as a safe upper bound.
    const q_float = bisection(profitDifference, {}, 1e-6, params.demand_max * 2);
    if (q_float === null) {
        return null;
    }
    return Math.round(q_float);
}

/**
 * Given quantity q, find the wholesale price w that yields a target retailer profit.
 */
export function findWForTargetRetailerProfit(q: number, targetProfit: number, params: NegotiationParams): number | null {
    const { p, c } = params;

    if (targetProfit > 0 && q <= 0) {
        return null;
    }
    if (targetProfit <= 0 && q <= 0) {
        return p; 
    }

    const expected_sales = expectedMinQuantityDemand(q, params);

    if (expected_sales <= 0) {
        return null; 
    }

    // retailer_profit = (p - w) * expected_sales
    // w = p - (retailer_profit / expected_sales)
    const w = p - (targetProfit / expected_sales);

    if (w < c) {
        return null;
    }

    return w;
}


/**
 * Given quantity q, find optimal w for 50/50 profit split.
 */
export function optimalWForQ(q: number, params: NegotiationParams): number | null {
    const profitDifference = (w: number) => {
        const profits = calculateProfits(w, q, params);
        return profits.supplier_profit - profits.retailer_profit;
    };
    // The bracket for w is [c, p]
    return bisection(profitDifference, {}, params.c, params.p);
}


/**
 * Given wholesale price w, find optimal q for 50/50 profit split.
 */
export function optimalQForW(w: number, params: NegotiationParams): number | null {
    const profitDifference = (q: number) => {
        const profits = calculateProfits(w, q, params);
        return profits.supplier_profit - profits.retailer_profit;
    };
    // The bracket for q is [epsilon, demand_max]
    const q_float = bisection(profitDifference, {}, 1e-6, params.demand_max);
    if (q_float === null) {
        return null;
    }
    return Math.round(q_float);
}