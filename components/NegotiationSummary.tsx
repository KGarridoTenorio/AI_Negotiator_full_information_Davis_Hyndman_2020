import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { NegotiationParams, Offer, ProfitCalcs } from '../types';

interface SummaryProps {
    finalOffer: Offer;
    params: NegotiationParams;
    finalProfits: ProfitCalcs;
    onReset: () => void;
}

const generateChartData = (w: number, q: number, c: number, p: number) => {
    const data = [];
    for (let d = 0; d <= 100; d += 5) {
      const sales = Math.min(d, q);
      const supplierProfit = w * sales - c * q;
      const retailerProfit = (p - w) * sales;
      data.push({
        demand: d,
        supplierProfit: supplierProfit,
        retailerProfit: retailerProfit,
      });
    }
    return data;
};

export const NegotiationSummary: React.FC<SummaryProps> = ({ finalOffer, params, finalProfits, onReset }) => {
    const chartData = generateChartData(finalOffer.w, finalOffer.q, params.c, params.p);
    
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-gray-200 p-4 md:p-8">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 md:p-8 max-w-4xl w-full text-center shadow-2xl space-y-6 animate-fade-in">
                <h1 className="text-3xl md:text-4xl font-bold text-green-400">Negotiation Concluded!</h1>
                <p className="text-gray-400">Congratulations on reaching a deal. Here is the summary of your agreement.</p>
                
                <div className="bg-gray-900/50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-400 mb-1">Final Terms</h3>
                        <p>Wholesale Price (w): <span className="font-mono text-blue-400 font-bold">{finalOffer.w.toFixed(2)}</span></p>
                        <p>Order Quantity (q): <span className="font-mono text-red-400 font-bold">{finalOffer.q.toFixed(0)}</span></p>
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-400 mb-1">Final Expected Profits</h3>
                        <p>Supplier Profit: <span className="font-mono text-red-400 font-bold">{finalProfits.supplier_profit.toFixed(2)}</span></p>
                        <p>Retailer Profit: <span className="font-mono text-blue-400 font-bold">{finalProfits.retailer_profit.toFixed(2)}</span></p>
                    </div>
                </div>

                <div className="h-64 md:h-80 w-full bg-gray-800 p-4 rounded-lg border border-gray-700">
                    <h3 className="font-semibold text-gray-300 mb-4 text-sm">Final Deal: Profit vs. Demand</h3>
                    <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="demand" stroke="#9CA3AF" tick={{ fontSize: 12 }} label={{ value: 'Demand Realization', position: 'insideBottom', offset: -5, fill:'#9CA3AF', fontSize: 12 }} />
                            <YAxis stroke="#9CA3AF" tick={{ fontSize: 12 }} label={{ value: 'Profit', angle: -90, position: 'insideLeft', fill:'#9CA3AF', fontSize: 12 }}/>
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem' }}
                                labelStyle={{ color: '#E5E7EB' }}
                                itemStyle={{ fontWeight: 'bold' }}
                            />
                            <Legend wrapperStyle={{fontSize: "12px"}}/>
                            <ReferenceLine y={0} stroke="#4B5563" strokeDasharray="2 2" />
                            
                            <ReferenceLine y={finalProfits.supplier_profit} label={{value: "E[πS]", fill: '#F87171', fontSize: 10, position:'left'}} stroke="#F87171" strokeDasharray="4 4" />
                            <Line type="monotone" dataKey="supplierProfit" name="Supplier Profit" stroke="#F87171" strokeWidth={2} dot={false} isAnimationActive={false}/>
                        
                            <ReferenceLine y={finalProfits.retailer_profit} label={{value: "E[πR]", fill: '#60A5FA', fontSize: 10, position:'right'}} stroke="#60A5FA" strokeDasharray="4 4" />
                            <Line type="monotone" dataKey="retailerProfit" name="Retailer Profit" stroke="#60A5FA" strokeWidth={2} dot={false} isAnimationActive={false}/>
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <button
                    onClick={onReset}
                    className="bg-green-600 text-white font-bold px-6 py-3 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-600 transition-colors"
                >
                    Start New Negotiation
                </button>
            </div>
            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in {
                    animation: fade-in 0.5s ease-out forwards;
                }
            `}</style>
        </div>
    );
};