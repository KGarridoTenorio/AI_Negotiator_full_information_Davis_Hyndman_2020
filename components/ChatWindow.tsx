import React, { useEffect, useRef } from 'react';
import type { Message, Offer } from '../types';

interface ChatWindowProps {
  messages: Message[];
  userInput: string;
  setUserInput: (value: string) => void;
  onSendMessage: () => void;
  isLoading: boolean;
  isConcluded: boolean;
  offerW: string;
  setOfferW: (value: string) => void;
  offerQ: string;
  setOfferQ: (value: string) => void;
  onSendOffer: () => void;
  onAcceptOffer: () => void;
  latestAiOffer: Offer | null;
}

const OfferPill: React.FC<{ w: number, q: number }> = ({ w, q }) => (
    <div className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 mt-2 inline-block">
        <span className="font-semibold text-gray-200">Offer:</span>
        <span className="ml-3">
            <span className="text-blue-400">w</span> = <span className="font-mono">{w.toFixed(2)}</span>
        </span>
        <span className="ml-4">
            <span className="text-red-400">q</span> = <span className="font-mono">{q.toFixed(0)}</span>
        </span>
    </div>
);


export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  userInput,
  setUserInput,
  onSendMessage,
  isLoading,
  isConcluded,
  offerW,
  setOfferW,
  offerQ,
  setOfferQ,
  onSendOffer,
  onAcceptOffer,
  latestAiOffer
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      onSendMessage();
    }
  };
  
  const canAccept = latestAiOffer && parseFloat(offerW) === latestAiOffer.w && parseInt(offerQ, 10) === latestAiOffer.q;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg flex flex-col h-full shadow-lg">
      <div className="flex-1 p-4 overflow-y-auto">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex mb-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-xl ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              {msg.offer && <OfferPill w={msg.offer.w} q={msg.offer.q} />}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="bg-gray-700 text-gray-200 rounded-xl rounded-bl-none px-4 py-2">
              <div className="flex items-center space-x-1">
                 <span className="text-sm">Typing</span>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse delay-75"></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse delay-150"></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse delay-300"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
       <div className="p-4 border-t border-gray-700">
        {isConcluded ? (
            <div className="text-center text-green-400 font-semibold p-2 bg-green-900/50 rounded-md">
                Negotiation Concluded
            </div>
        ) : (
            <div className="space-y-3">
              <div className="flex space-x-2">
                <input
                  type="text"
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-200 placeholder-gray-500 disabled:opacity-50"
                  placeholder="Type a message (optional)..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading || isConcluded}
                />
                <button
                  onClick={onSendMessage}
                  disabled={isLoading || !userInput.trim() || isConcluded}
                  className="bg-gray-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                  Send
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <div className="flex-1 flex items-center space-x-2">
                    <label htmlFor="w-input" className="font-semibold text-blue-400">w:</label>
                    <input
                        id="w-input"
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-200 placeholder-gray-500 disabled:opacity-50 font-mono"
                        placeholder="Price"
                        value={offerW}
                        onChange={(e) => setOfferW(e.target.value)}
                        disabled={isLoading || isConcluded}
                    />
                </div>
                <div className="flex-1 flex items-center space-x-2">
                    <label htmlFor="q-input" className="font-semibold text-red-400">q:</label>
                    <input
                        id="q-input"
                        type="number"
                        step="1"
                        min="1"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-200 placeholder-gray-500 disabled:opacity-50 font-mono"
                        placeholder="Quantity"
                        value={offerQ}
                        onChange={(e) => setOfferQ(e.target.value)}
                        disabled={isLoading || isConcluded}
                    />
                </div>
                 {canAccept ? (
                    <button
                        onClick={onAcceptOffer}
                        disabled={isLoading}
                        className="flex-shrink-0 bg-green-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                    >
                        Accept Offer
                    </button>
                ) : (
                    <button
                        onClick={onSendOffer}
                        disabled={isLoading || !offerW || !offerQ}
                        className="flex-shrink-0 bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                    >
                        Send Offer
                    </button>
                )}
              </div>
            </div>
        )}
      </div>
    </div>
  );
};