import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell } from 'recharts';
import type { NegotiationParams, Offer, ProfitCalcs, NashSolution } from '../types';
import { calculateProfits } from '../services/negotiationService';

interface DashboardProps {
  params: NegotiationParams;
  latestOffer: Offer | null;
  profitCalcs: ProfitCalcs | null;
  nashSolution: NashSolution;
  nashProfitCalcs: ProfitCalcs;
}

const InfoCard: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">{title}</h3>
        {children}
    </div>
);

const ProfitDisplay: React.FC<{ title: string, value: number, color: string }> = ({ title, value, color }) => (
    <div>
        <span className={`text-sm ${color}`}>{title}</span>
        <p className="text-lg font-mono font-semibold text-gray-200">{value.toFixed(2)}</p>
    </div>
);

export const NegotiationDashboard: React.FC<DashboardProps> = ({ params, latestOffer, nashSolution }) => {

  const [manualW, setManualW] = useState('');
  const [manualQ, setManualQ] = useState('');

  useEffect(() => {
    if (latestOffer) {
      setManualW(latestOffer.w.toFixed(2));
      setManualQ(latestOffer.q.toFixed(0));
    } else {
      setManualW('');
      setManualQ('');
    }
  }, [latestOffer]);
  
  const analysisOffer = useMemo(() => {
    const w = parseFloat(manualW);
    const q = parseInt(manualQ, 10);
    if (!isNaN(w) && w >= params.c && !isNaN(q) && q > 0) {
      return { w, q };
    }
    return null;
  }, [manualW, manualQ, params.c]);

  const analysisProfitCalcs = useMemo(() => {
    if (analysisOffer) {
      return calculateProfits(analysisOffer.w, analysisOffer.q, params);
    }
    return null;
  }, [analysisOffer, params]);


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

  const chartData = analysisOffer ? generateChartData(analysisOffer.w, analysisOffer.q, params.c, params.p) : [];

  const chartTitle = analysisOffer 
    ? `Profit vs Demand (w=${analysisOffer.w.toFixed(2)}, q=${analysisOffer.q.toFixed(0)})` 
    : 'Profit vs Demand (Enter an offer)';
  
  const expectedSupplierProfit = analysisProfitCalcs?.supplier_profit;
  const expectedRetailerProfit = analysisProfitCalcs?.retailer_profit;
  
  const profitSplitData = (analysisProfitCalcs && analysisProfitCalcs.supplier_profit >= 0 && analysisProfitCalcs.retailer_profit >= 0)
    ? [
        { name: 'Supplier', value: analysisProfitCalcs.supplier_profit },
        { name: 'Retailer', value: analysisProfitCalcs.retailer_profit },
    ] : null;
  const COLORS = ['#F87171', '#60A5FA']; // Red for Supplier, Blue for Retailer

  return (
    <div className="space-y-4 h-full flex flex-col">
        <InfoCard title="Nash Bargaining Solution">
            <div className="text-base flex items-center justify-around py-1">
                <span>
                    w: <span className="font-mono text-blue-400 font-semibold">{nashSolution.wholesale_price.toFixed(2)}</span>
                </span>
                <span>
                    q: <span className="font-mono text-red-400 font-semibold">{nashSolution.order_quantity.toFixed(0)}</span>
                </span>
            </div>
        </InfoCard>

       <InfoCard title="Offer Sandbox & Analysis">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-4">
                    <div className="space-y-3 text-sm">
                        <p className="text-xs text-gray-400">Enter an offer to see a real-time profit analysis. This automatically syncs with the latest offer in the chat.</p>
                        <div className="flex items-center gap-2">
                            <label htmlFor="w-manual" className="font-semibold text-blue-400 w-4">w:</label>
                            <input id="w-manual" type="number" min={params.c} value={manualW} onChange={(e) => setManualW(e.target.value)} placeholder={`e.g. ${nashSolution.wholesale_price.toFixed(2)}`} className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-gray-200 w-full font-mono focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                        <div className="flex items-center gap-2">
                            <label htmlFor="q-manual" className="font-semibold text-red-400 w-4">q:</label>
                            <input id="q-manual" type="number" step="1" min="1" value={manualQ} onChange={(e) => setManualQ(e.target.value)} placeholder={`e.g. ${nashSolution.order_quantity.toFixed(0)}`} className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-gray-200 w-full font-mono focus:ring-blue-500 focus:border-blue-500" />
                        </div>
                    </div>
                     {analysisProfitCalcs ? (
                        <div className="flex flex-col gap-y-2">
                            <ProfitDisplay title="Supplier Profit" value={analysisProfitCalcs.supplier_profit} color="text-red-400" />
                            <ProfitDisplay title="Retailer Profit" value={analysisProfitCalcs.retailer_profit} color="text-blue-400" />
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center pt-2">
                           <p className="text-gray-500 text-xs text-center">Enter a valid offer (w ≥ {params.c}, q > 0) to see profit details.</p>
                        </div>
                    )}
                </div>
                <div className="h-40">
                    {profitSplitData ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={profitSplitData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={60}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {profitSplitData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem' }}
                                    formatter={(value: number) => value.toFixed(2)}
                                />
                                <Legend wrapperStyle={{fontSize: "12px", paddingTop: "10px"}}/>
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <p className="text-xs text-center text-gray-500 h-full flex items-center justify-center">Profit split chart not available for this offer (e.g., negative profit).</p>}
                </div>
            </div>
       </InfoCard>

      <div className="flex-1 bg-gray-800 p-4 rounded-lg border border-gray-700 min-h-[300px]">
        <h3 className="text-center font-semibold text-gray-300 mb-4 text-sm">{chartTitle}</h3>
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
            
            {expectedSupplierProfit !== undefined && <ReferenceLine y={expectedSupplierProfit} label={{value: "E[πS]", fill: '#F87171', fontSize: 10, position:'left'}} stroke="#F87171" strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="supplierProfit" name="Supplier Profit" stroke="#F87171" strokeWidth={2} dot={false} isAnimationActive={false}/>
           
            {expectedRetailerProfit !== undefined && <ReferenceLine y={expectedRetailerProfit} label={{value: "E[πR]", fill: '#60A5FA', fontSize: 10, position:'right'}} stroke="#60A5FA" strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="retailerProfit" name="Retailer Profit" stroke="#60A5FA" strokeWidth={2} dot={false} isAnimationActive={false}/>

          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};