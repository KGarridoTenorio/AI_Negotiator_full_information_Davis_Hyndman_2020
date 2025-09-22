import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { NegotiationDashboard } from './components/NegotiationDashboard';
import { NegotiationSummary } from './components/NegotiationSummary';
import type { Message, Offer, NegotiationParams } from './types';
import { getAiResponse, parseOfferWithLLM } from './services/geminiService';
import { nashBargainingSolution, calculateProfits } from './services/negotiationService';
import { INITIAL_PARAMS } from './constants';

const DebugPanel: React.FC<{ prompt: string }> = ({ prompt }) => {
  const [isOpen, setIsOpen] = useState(true);

  if (!prompt) return null;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg mt-4">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full text-left p-2 font-semibold text-gray-400">
        {isOpen ? '▼' : '►'} Last AI Prompt
      </button>
      {isOpen && (
        <pre className="text-xs p-4 bg-black/20 text-gray-300 whitespace-pre-wrap font-mono overflow-x-auto">
          {prompt}
        </pre>
      )}
    </div>
  )
}

const generateNewParams = (): NegotiationParams => {
    const C_VALUES = [3, 4, 5];
    const P_VALUES = [10, 11, 12];
    const randomC = C_VALUES[Math.floor(Math.random() * C_VALUES.length)];
    const randomP = P_VALUES[Math.floor(Math.random() * P_VALUES.length)];
    return {
      ...INITIAL_PARAMS,
      c: randomC,
      p: randomP,
    };
};


export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [negotiationParams, setNegotiationParams] = useState<NegotiationParams>(generateNewParams);
  const [isConcluded, setIsConcluded] = useState<boolean>(false);
  const [isDebugMode, setIsDebugMode] = useState<boolean>(false);
  const [lastPrompt, setLastPrompt] = useState<string>('');
  
  const [offerW, setOfferW] = useState<string>('');
  const [offerQ, setOfferQ] = useState<string>('');

  const nashSolution = useRef(nashBargainingSolution(negotiationParams));
  
  useEffect(() => {
    nashSolution.current = nashBargainingSolution(negotiationParams);
  }, [negotiationParams]);

  const latestAiOffer = useMemo(() => {
    return messages.slice().reverse().find(m => m.sender === 'ai' && m.offer)?.offer || null;
  }, [messages]);
  
  useEffect(() => {
    if (latestAiOffer) {
        setOfferW(latestAiOffer.w.toFixed(2));
        setOfferQ(latestAiOffer.q.toFixed(0));
    }
  }, [latestAiOffer]);


  const addMessage = useCallback((sender: 'user' | 'ai', text: string, offer?: Offer | null) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), sender, text, offer: offer || undefined }]);
  }, []);

  const handleReset = useCallback(() => {
    const newParams = generateNewParams();
    setNegotiationParams(newParams);
    
    setMessages([{
      id: Date.now(),
      sender: 'ai',
      text: "Hello, I'm the retailer. I'm ready to discuss the terms for our partnership. To start, you can send me a message or propose a full offer below."
    }]);
    setUserInput('');
    setOfferW('');
    setOfferQ('');
    setIsLoading(false);
    setIsConcluded(false);
    setLastPrompt('');
  }, []);

  useEffect(() => {
    const firstMessage: Message = {
      id: Date.now(),
      sender: 'ai',
      text: "Hello, I'm the retailer. I'm ready to discuss the terms for our partnership. To start, you can send me a message or propose a full offer below."
    };
    setMessages([firstMessage]);
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processAiResponse = async (chatHistory: Message[]) => {
    setIsLoading(true);
    try {
        const lastUserMessage = chatHistory[chatHistory.length - 1];
        const lastUserOffer = await parseOfferWithLLM(lastUserMessage.text);

        const { text: aiResponseText, debugPrompt } = await getAiResponse(chatHistory, negotiationParams, nashSolution.current, lastUserOffer);
        setLastPrompt(debugPrompt || 'No debug prompt available.');

        const aiParsedOffer = await parseOfferWithLLM(aiResponseText);
        const aiFullOffer = (aiParsedOffer.w !== undefined && aiParsedOffer.q !== undefined)
            ? { w: aiParsedOffer.w, q: aiParsedOffer.q }
            : null;

        addMessage('ai', aiResponseText, aiFullOffer);
    } catch (error) {
        console.error("Error getting AI response:", error);
        addMessage('ai', "Sorry, I encountered an error. Please try again.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading || isConcluded) return;

    const userMessageText = userInput;
    setUserInput('');

    const userMessageForHistory: Message = { id: Date.now(), sender: 'user', text: userMessageText, offer: undefined };
    addMessage('user', userMessageText, null);
    
    const newChatHistory = [...messages, userMessageForHistory];
    await processAiResponse(newChatHistory);
  };

  const handleSendOffer = async () => {
    const w = parseFloat(offerW);
    const q = parseInt(offerQ, 10);

    if (isNaN(w) || isNaN(q) || w < negotiationParams.c || q <= 0 || isLoading || isConcluded) {
        // Simple validation feedback can be added later if needed
        return;
    }

    const offer: Offer = { w, q };
    const userMessageText = `I'd like to propose a wholesale price (w) of ${w.toFixed(2)} and a quantity (q) of ${q}.`;
    
    const userMessageForHistory: Message = { id: Date.now(), sender: 'user', text: userMessageText, offer };
    addMessage('user', userMessageText, offer);

    const newChatHistory = [...messages, userMessageForHistory];
    await processAiResponse(newChatHistory);
  };

  const handleAcceptOffer = () => {
    if (!latestAiOffer || isConcluded) return;

    const acceptanceText = `Sounds good, I accept your offer of w=${latestAiOffer.w.toFixed(2)} and q=${latestAiOffer.q}. We have a deal.`;
    addMessage('user', acceptanceText, latestAiOffer);
    setIsConcluded(true);
  };


  const latestOffer = useMemo(() => {
    return messages.slice().reverse().find(m => m.offer)?.offer || null;
  }, [messages]);

  const profitCalcs = useMemo(() => {
      if (!latestOffer) return null;
      return calculateProfits(latestOffer.w, latestOffer.q, negotiationParams);
  }, [latestOffer, negotiationParams]);

  const nashProfitCalcs = useMemo(() => {
      return calculateProfits(nashSolution.current.wholesale_price, nashSolution.current.order_quantity, negotiationParams);
  }, [nashSolution, negotiationParams]);


  if (isConcluded && latestOffer && profitCalcs) {
    return (
      <NegotiationSummary
        finalOffer={latestOffer}
        params={negotiationParams}
        finalProfits={profitCalcs}
        onReset={handleReset}
      />
    );
  }

  return (
    <div className="flex h-screen font-sans bg-gray-900 text-gray-200">
      <main className="flex flex-1 flex-col md:flex-row gap-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <div className="md:w-1/2 lg:w-3/5 flex flex-col gap-4">
            <header className="text-center">
              <h1 className="text-3xl md:text-4xl font-bold text-white">AI Negotiation Trainer</h1>
              <p className="text-gray-400 mt-2">
                You are the <span className="font-semibold text-red-400">Supplier</span>. Negotiate with the AI <span className="font-semibold text-blue-400">Retailer</span>.
                <br />
                <span className="text-sm font-mono">(This session: Production Cost c={negotiationParams.c}, Retail Price p={negotiationParams.p})</span>
              </p>
              <div className="flex items-center justify-center mt-4 space-x-2 text-sm">
                  <label htmlFor="debug-toggle" className="text-gray-400">Debug Mode</label>
                  <input 
                    type="checkbox" 
                    id="debug-toggle"
                    checked={isDebugMode}
                    onChange={() => setIsDebugMode(!isDebugMode)}
                    className="h-4 w-8 appearance-none bg-gray-700 rounded-full transition-colors duration-200 ease-in-out cursor-pointer
                              checked:bg-green-500
                              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-green-500
                              relative inline-block"
                  />
              </div>
            </header>
            <div className="flex-1 flex flex-col min-h-0">
               <ChatWindow
                  messages={messages}
                  userInput={userInput}
                  setUserInput={setUserInput}
                  onSendMessage={handleSendMessage}
                  isLoading={isLoading}
                  isConcluded={isConcluded}
                  offerW={offerW}
                  setOfferW={setOfferW}
                  offerQ={offerQ}
                  setOfferQ={setOfferQ}
                  onSendOffer={handleSendOffer}
                  onAcceptOffer={handleAcceptOffer}
                  latestAiOffer={latestAiOffer}
                />
            </div>
             {isDebugMode && <DebugPanel prompt={lastPrompt} />}
        </div>
        <div className="md:w-1/2 lg:w-2/5 flex flex-col">
          <NegotiationDashboard
            params={negotiationParams}
            latestOffer={latestOffer}
            profitCalcs={profitCalcs}
            nashSolution={nashSolution.current}
            nashProfitCalcs={nashProfitCalcs}
          />
        </div>
      </main>
    </div>
  );
}