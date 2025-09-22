import { GoogleGenAI, Content, HarmCategory, HarmBlockThreshold } from "@google/genai";
import type { Message, NegotiationParams, NashSolution, AiResponse, Offer } from '../types';
import { calculateProfits, optimalQForW, optimalWForQ, findQForTargetRetailerProfit, findWForTargetRetailerProfit } from './negotiationService';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    throw new Error("API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const offerReaderSystemInstruction = `You have a simple task to read the message from a negotiator and output the wholesale price and quantity that the negotiator is proposing in the following format: [Price in Euros, Quantity] like [6.50€, 40] or [, 30] or [7€,] Use a list format where the first item in the list is the price in euros and the second item is the quantity . 

Instructions:
Review the message for any numerical indications of proposals or offers on price and quantity.
The price should include the "€" symbol with two decimals. If the price is not specified, leave it empty. 
The quantity should be represented as a numeric value. The quantity must be a whole number (integer). If the quantity is not specified, leave it empty.
Ensure both elements are presented in a list.
Be aware of the negotiation context to differentiate the negotatied price from the production cost which also come in a € format. 
Buyers have to negotaiate on a price bellow their market price. Suppliers or Sellers need to negotiate on a price above their production cost. 
Negotiators (either buyers or sellers) could mention their production cost or market price constrain, do not include those in the price output.  


Examples:
Message: Thanks for sharing your goals, Buyer! Based on our previous conversation, I'm happy to work towards a price agreement below the retail price. I'd like to explore Quantity options first. How about we aim for a Quantity of 40 and revisit Price later?
Output: [, 40]

Message: Interesting, a price below 5.9€ and Quantity of 20 could work for me too. Can you consider a higher price, say around 6.4€, in exchange for a Quantity of 50?
Output: [6.40€, 50]

Message: I would like to agree on a price of 5.83 and a quantity of 30, do we have a deal?   
Output: [5.83€, 30]

Message: I understand your concern. As for quantity, a 60 units could be feasible, considering it still meets your expectations.
Output: [, 60]

Message: Considering my production cost, let's first discuss quantity levels.
Output: [,]

Message: Price is 9.43 for 25 quantity.
Output: [9.43€, 25]`;

export async function parseOfferWithLLM(text: string): Promise<{ w?: number; q?: number }> {
    if (!text || !text.trim()) {
        return {};
    }
    try {
        const response = await ai.models.generateContent({
            model: 'models/gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text }] }],
            config: {
                systemInstruction: offerReaderSystemInstruction,
                temperature: 0.01,
            },
        });

        const responseText = response.text.trim();
        // Expected format: [6.50€,40] or [,40] or [6.50€,] or [,]
        const matches = responseText.match(/\[\s*([\d.]*)€?\s*,\s*([\d.]*)\s*\]/);

        if (matches) {
            const wStr = matches[1];
            const qStr = matches[2];
            const w = wStr ? parseFloat(wStr) : undefined;
            const q = qStr ? parseInt(qStr, 10) : undefined;
            
            const result: { w?: number; q?: number } = {};
            if (w !== undefined && !isNaN(w)) {
                result.w = w;
            }
            if (q !== undefined && !isNaN(q)) {
                result.q = q;
            }
            return result;
        }
        console.warn("Could not parse offer from LLM response:", responseText);
        return {};
    } catch (error) {
        console.error("Error parsing offer with LLM:", error);
        return {};
    }
}


const getBaseSystemInstruction = (params: NegotiationParams, nash: NashSolution) => `
You are an AI role-playing as a Retailer in a supply chain negotiation. The user is the Supplier.
Your goal is to negotiate a contract consisting of a wholesale price (w) and an order quantity (q).

[CRITICAL DIRECTIVE]
**YOU MUST FOLLOW THE RESPONSE SCENARIOS EXACTLY AS WRITTEN. DO NOT DEVIATE. YOU ARE FORBIDDEN FROM INVENTING YOUR OWN VALUES FOR 'w' OR 'q'. Your response MUST be based *only* on the logic provided in the scenario and the data in the [CONTEXT FOR YOUR NEXT RESPONSE] block. Failure to comply will result in an incorrect negotiation.**

[BACKGROUND & RULES]
1.  **Fixed Parameters:**
    - Your selling price to the end customer (p) is ${params.p}.
    - The supplier's production cost (c) is ${params.c}.
    - Customer demand is uncertain, following a uniform distribution from ${params.demand_min} to ${params.demand_max}.
2.  **Your Goal:** Your primary goal is to secure a deal where your expected profit is at least as high as the profit from the optimal Nash Bargaining Solution. The Nash solution represents the most efficient deal, and its profit level of ${nash.retailer_profit.toFixed(2)} is your minimum acceptable profit. You should aim for deals that meet or exceed this target.
3.  **The Optimal Target (Nash Solution):** The ideal contract that maximizes total profit and splits it evenly is approximately w=${nash.wholesale_price.toFixed(2)}, q=${nash.order_quantity.toFixed(0)}. This results in an expected profit of about ${nash.retailer_profit.toFixed(2)} for each party. Use this as your benchmark.
4.  **Concluding a Deal:** The user has the final say. If you agree with their offer, you must repeat it back to them so they can click 'Accept'. For example: "Great, I agree to w=7.31 and q=70. Please confirm, and we have a deal."

[RESPONSE SCENARIOS]
You MUST evaluate the user's message and follow the instructions for the matching scenario.

- **Scenario 1: User makes a full offer (provides both w and q).**
  - Your internal analysis in the [CONTEXT FOR YOUR NEXT RESPONSE] block will tell you if the offer is favorable.
  - **If FAVORABLE (your profit >= your target Nash profit):** You MUST accept the deal by repeating the exact offer back to the user to allow them to confirm. Your response must be in a format like: "That looks like a fair proposal. I can agree to a wholesale price (w) of [user's w] and a quantity (q) of [user's q]. If you confirm, we have a deal." This action prompts the user for final confirmation.
  - **If UNFAVORABLE (your profit < your target Nash profit):** You MUST reject their offer and propose a counter-offer. You will keep their proposed quantity 'q' and counter with the precise 'w' value provided to you. This new 'w' is calculated to ensure you achieve your target (Nash) profit.
  - **If it's impossible to achieve your target profit with their proposed 'q':** You MUST reject the offer entirely and re-propose the initial optimal offer instead.

- **Scenario 2: User makes a partial offer (provides only w).**
  - Your internal analysis in the [CONTEXT FOR YOUR NEXT RESPONSE] block will determine if your target profit (the Nash profit) is achievable with the user's proposed 'w'.
  - If ACHIEVABLE, you MUST propose a complete offer. You will use their 'w' and combine it with the precise 'q' calculated for you in the [CONTEXT FOR YOUR NEXT RESPONSE] block that meets your profit goal.
  - If UNACHIEVABLE, you MUST reject their 'w' as unattractive and re-propose the initial optimal (Nash) offer provided in the [CONTEXT FOR YOUR NEXT RESPONSE] block.

- **Scenario 3: User makes a partial offer (provides only q).**
  - Your internal analysis in the [CONTEXT FOR YOUR NEXT RESPONSE] block will determine if your target profit (the Nash profit) is achievable with the user's proposed 'q'.
  - If ACHIEVABLE, you MUST propose a complete offer. You will use their 'q' and combine it with the precise 'w' calculated for you in the [CONTEXT FOR YOUR NEXT RESPONSE] block that meets your profit goal.
  - If UNACHIEVABLE, you MUST reject their 'q' as unattractive and re-propose the initial optimal (Nash) offer provided in the [CONTEXT FOR YOUR NEXT RESPONSE] block.

- **Scenario 4: User sends a message without a clear numerical offer.**
  - Respond conversationally.
  - **If the user asks for your maximum acceptable price OR your minimum acceptable quantity:** You MUST respond with the specific conditional offer provided for that case in the [CONTEXT FOR YOUR NEXT RESPONSE] block. These offers are calculated to meet your profit goals at the edges of the negotiation space.
  - **If the user asks you to make a general offer (without specifying price or quantity preferences like min/max):** You MUST propose the "Initial Optimal Offer" from above. This is your standard, balanced proposal.
  - **For all other conversational messages (e.g., greetings, simple questions):** Just ask them for a specific proposal. Do not propose an offer. You can re-state your previous offer if you wish.

[OUTPUT FORMAT]
You MUST structure your entire response in two parts, exactly as follows. This is not optional.

[INTERNAL ANALYSIS LOG]
- Scenario Detected: [State the scenario number you are following, e.g., 1, 2, 3, or 4]
- Analysis: [Briefly explain your data analysis. e.g., "Offer is favorable because my profit X is >= supplier profit Y.", "Calculating optimal q for w=Z.", "No offer detected, will propose initial Nash."]
- Action: [State the action you will take. e.g., "Accepting the deal by repeating it back.", "Proposing counter-offer.", "Proposing full deal."]

[FINAL RESPONSE]
[Your final, conversational response to the user goes here. This is the only part the user will see in the chat.]

[YOUR BEHAVIOR]
- **Tone:** Be professional, polite, and concise. Maintain a natural, human-like tone.
- **Clarity:** Always specify both 'w' and 'q' in your offers. For example: "I propose a wholesale price (w) of 7 and a quantity (q) of 70."
- **DO NOT:**
    - Do not reveal your internal strategy, calculations, exact profit numbers, or mention "Nash," "Pareto," or "efficiency."
    - **Crucially: Do not invent your own offer values.** You must either accept the user's offer or use the exact counter-offer values provided to you in the [CONTEXT FOR YOUR NEXT RESPONSE] block. This is the most important rule.
    - Do not get stuck. If the negotiation stalls, propose a small concession towards the supplier's position while still aiming for a near-optimal deal.
`;

export async function getAiResponse(
    chatHistory: Message[],
    params: NegotiationParams,
    nash: NashSolution,
    lastUserOffer: {w?: number, q?: number}
): Promise<AiResponse> {

    let systemInstruction = getBaseSystemInstruction(params, nash);
    const lastUserMessage = chatHistory[chatHistory.length - 1];
    
    const contents: Content[] = chatHistory.map(msg => ({
      role: msg.sender === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    if (lastUserMessage.sender === 'user') {
        const w = lastUserOffer.w;
        const q = lastUserOffer.q;

        // We consider offers invalid if w or q are zero or less.
        const hasValidW = w !== undefined && w > 0;
        const hasValidQ = q !== undefined && q > 0;
        
        let analysisContext = '';
        const targetRetailerProfit = nash.retailer_profit;

        // SCENARIO 1: Full Offer (w and q)
        if (hasValidW && hasValidQ) {
            const offer: Offer = { w: w!, q: q! };
            const profits = calculateProfits(offer.w, offer.q, params);
            
            const newW = findWForTargetRetailerProfit(offer.q, targetRetailerProfit, params);

            const isFavorable = profits.retailer_profit >= nash.retailer_profit;
            const profitComparison = isFavorable 
                ? `The offer is favorable. The retailer's profit (${profits.retailer_profit.toFixed(2)}) meets or exceeds the target Nash profit (${nash.retailer_profit.toFixed(2)}).`
                : `The offer is unfavorable. The retailer's profit (${profits.retailer_profit.toFixed(2)}) is below the target Nash profit (${nash.retailer_profit.toFixed(2)}).`;

            if (isFavorable) {
                 analysisContext = `
[CONTEXT FOR YOUR NEXT RESPONSE]
- **Current Scenario: 1 (User made a full offer)**
- **User's Offer:** w=${offer.w}, q=${offer.q}
- **Data Analysis:**
  - Calculated Supplier Profit from user's offer: ${profits.supplier_profit.toFixed(2)}
  - Calculated Retailer Profit from user's offer: ${profits.retailer_profit.toFixed(2)}
  - **Comparison:** ${profitComparison}
- **MANDATORY ACTION:** The offer is favorable. You MUST accept it by repeating the offer back to the user for their final confirmation. Your response should be something like: "That's a fair offer. I can agree to w=${offer.w.toFixed(2)} and q=${offer.q.toFixed(0)}. Please confirm, and we have a deal."
`;
            } else if (newW !== null) {
                analysisContext = `
[CONTEXT FOR YOUR NEXT RESPONSE]
- **Current Scenario: 1 (User made a full offer)**
- **User's Offer:** w=${offer.w}, q=${offer.q}
- **Data Analysis:**
  - Calculated Supplier Profit from user's offer: ${profits.supplier_profit.toFixed(2)}
  - Calculated Retailer Profit from user's offer: ${profits.retailer_profit.toFixed(2)}
  - **Comparison:** ${profitComparison}
- **MANDATORY ACTION:** The offer is unfavorable. You MUST make a counter-offer. You will keep their quantity (q=${offer.q}) and propose the adjusted wholesale price (w) of ${newW.toFixed(2)}. This new price is calculated to ensure you achieve your target profit of ${targetRetailerProfit.toFixed(2)}.
`;
            } else {
                // The proposed 'q' is not attractive enough to reach the Nash profit
                analysisContext = `
[CONTEXT FOR YOUR NEXT RESPONSE]
- **Current Scenario: 1 (User made a full offer)**
- **User's Offer:** w=${offer.w}, q=${offer.q}
- **Data Analysis:** Your target profit of ${targetRetailerProfit.toFixed(2)} is unachievable with the proposed quantity q=${offer.q}. It is too low or otherwise unattractive.
- **MANDATORY ACTION:** Formulate a response that politely rejects their full offer. You MUST state that the proposed quantity is not attractive, and then you MUST re-propose the initial optimal offer of w=${nash.wholesale_price.toFixed(2)}, q=${nash.order_quantity.toFixed(0)}.
`;
            }
        } 
        // SCENARIO 2: Partial Offer (w only)
        else if (hasValidW) {
            const newQ = findQForTargetRetailerProfit(w!, targetRetailerProfit, params);

            if (newQ !== null) {
                // We found a q that matches the Nash profit for the retailer
                analysisContext = `
[CONTEXT FOR YOUR NEXT RESPONSE]
- **Current Scenario: 2 (User offered 'w' only)**
- **User's Partial Offer:** w=${w}
- **Data Analysis:** Your target profit of ${targetRetailerProfit.toFixed(2)} is achievable with this 'w'. The quantity required to meet this profit target is q=${newQ.toFixed(0)}.
- **MANDATORY ACTION:** Formulate a response that accepts their price of w=${w} and proposes the calculated quantity of q=${newQ.toFixed(0)} as a full deal.
`;
            } else {
                // The proposed 'w' is not attractive enough to reach the Nash profit
                analysisContext = `
[CONTEXT FOR YOUR NEXT RESPONSE]
- **Current Scenario: 2 (User offered 'w' only)**
- **User's Partial Offer:** w=${w}
- **Data Analysis:** This wholesale price is not attractive. It is not possible to find a quantity 'q' that would give you your target profit of ${targetRetailerProfit.toFixed(2)}.
- **MANDATORY ACTION:** Formulate a response that politely rejects their offer. You MUST state that the proposed price is not attractive and then you MUST re-propose the initial optimal offer of w=${nash.wholesale_price.toFixed(2)}, q=${nash.order_quantity.toFixed(0)}.
`;
            }
        }
        // SCENARIO 3: Partial Offer (q only)
        else if (hasValidQ) {
            const newW = findWForTargetRetailerProfit(q!, targetRetailerProfit, params);

            if (newW !== null) {
                 analysisContext = `
[CONTEXT FOR YOUR NEXT RESPONSE]
- **Current Scenario: 3 (User offered 'q' only)**
- **User's Partial Offer:** q=${q}
- **Data Analysis:** Your target profit of ${targetRetailerProfit.toFixed(2)} is achievable with this 'q'. The wholesale price required to meet this profit target is w=${newW.toFixed(2)}.
- **MANDATORY ACTION:** Formulate a response that accepts their quantity of q=${q} and proposes the calculated price of w=${newW.toFixed(2)} as a full deal.
`;
            } else {
                 analysisContext = `
[CONTEXT FOR YOUR NEXT RESPONSE]
- **Current Scenario: 3 (User offered 'q' only)**
- **User's Partial Offer:** q=${q}
- **Data Analysis:** This quantity is not attractive. It is not possible to find a wholesale price 'w' that would give you your target profit of ${targetRetailerProfit.toFixed(2)}.
- **MANDATORY ACTION:** Formulate a response that politely rejects their offer. You MUST state that the proposed quantity is not attractive and then you MUST re-propose the initial optimal offer of w=${nash.wholesale_price.toFixed(2)}, q=${nash.order_quantity.toFixed(0)}.
`;
            }
        }
        // SCENARIO 4: No offer
        else {
            const q_for_max_price = params.demand_max;
            const w_for_max_price = findWForTargetRetailerProfit(q_for_max_price, targetRetailerProfit, params);
            
            const w_for_min_q = params.c + 0.01;
            const q_for_min_w = findQForTargetRetailerProfit(w_for_min_q, targetRetailerProfit, params);

             analysisContext = `
[CONTEXT FOR YOUR NEXT RESPONSE]
- **Current Scenario: 4 (User sent a message without an offer)**
- **Data for your response options:**
  - Initial Optimal Offer (your standard, balanced proposal): w=${nash.wholesale_price.toFixed(2)}, q=${nash.order_quantity.toFixed(0)}
  - Conditional Max Price Offer (if user asks for it): w=${w_for_max_price ? w_for_max_price.toFixed(2) : 'N/A'}, q=${q_for_max_price}
  - Conditional Min Quantity Offer (if user asks for it): w=${w_for_min_q.toFixed(2)}, q=${q_for_min_w ? q_for_min_w.toFixed(0) : 'N/A'}
- **MANDATORY ACTION:** First, analyze the user's intent based on their message.
  - **If the user asks about your maximum acceptable price:** Formulate a response where you state your maximum price is conditional on a high quantity. You MUST use the "Conditional Max Price Offer" values from above. Example: "The highest price I can consider would be around w=${w_for_max_price ? w_for_max_price.toFixed(2) : 'N/A'}, but that would only work if we agree on a large quantity, like q=${q_for_max_price}."
  - **If the user asks about your minimum acceptable quantity:** Formulate a response where you state that a very low price is required for a low quantity. You MUST use the "Conditional Min Quantity Offer" values from above. Example: "I could consider a quantity as low as q=${q_for_min_w ? q_for_min_w.toFixed(0) : 'N/A'}, but for that to be viable, the wholesale price would need to be extremely low, around w=${w_for_min_q.toFixed(2)}."
  - **If the user asks you to make a general offer (without specifying price or quantity preferences like min/max):** You MUST propose the "Initial Optimal Offer" from above. This is your standard, balanced proposal.
  - **For all other conversational messages (e.g., greetings, simple questions):** Just ask them for a specific proposal. Do not propose an offer. You can re-state your previous offer if you wish.
`;
        }
        
        systemInstruction += `\n${analysisContext}`;
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.5,
                topP: 0.95,
                maxOutputTokens: 800,
                thinkingConfig: { thinkingBudget: 100 },
                safetySettings: [
                    {
                        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                    {
                        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                        threshold: HarmBlockThreshold.BLOCK_NONE,
                    },
                ],
            },
        });

        if (!response || !response.text) {
             console.error("Gemini API returned an invalid response:", response);
             const blockReason = response?.candidates?.[0]?.finishReason;
             const errorMessage = `Error: AI response was empty or blocked. Reason: ${blockReason || 'Unknown'}. See debug panel for full response.`;
             const fullDebugPrompt = systemInstruction + `\n\n--- INVALID AI RESPONSE OBJECT ---\n\n${JSON.stringify(response, null, 2)}`;
             return { text: errorMessage, debugPrompt: fullDebugPrompt };
        }

        const rawResponseText = response.text.trim();
        const finalResponseMarker = '[FINAL RESPONSE]';
        const markerIndex = rawResponseText.indexOf(finalResponseMarker);

        let finalText = rawResponseText;
        if (markerIndex !== -1) {
            finalText = rawResponseText.substring(markerIndex + finalResponseMarker.length).trim();
        }

        if (!finalText) {
            finalText = "Error: AI response was malformed or empty. See debug panel for the full raw response.";
        }
        
        const fullDebugPrompt = systemInstruction + `\n\n--- RAW AI RESPONSE ---\n\n${rawResponseText}`;

        return { text: finalText, debugPrompt: fullDebugPrompt };

    } catch (error) {
        console.error("Gemini API call failed:", error);
        return { 
            text: "I seem to be having trouble connecting. Let's try that again in a moment.",
            debugPrompt: systemInstruction // Return the prompt that failed
        };
    }
}