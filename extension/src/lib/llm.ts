import type { LLMProvider, OrderAnalysis, PageContent } from '@/types'

const DEFAULT_RESULT: OrderAnalysis = {
  isOrderConfirmation: false,
  confidence: 0,
  products: [],
  retailer: null,
  orderNumber: null
}

// Enhanced system prompt for product extraction
const SYSTEM_PROMPT = `You are an expert at extracting products from e-commerce order confirmation pages. Your task is to find ALL products that were ordered.

## EXTRACTION STRATEGY

### Step 1: Identify Repeated Patterns
The key to finding products is looking for REPEATED STRUCTURES:
- Find elements with similar class names that appear 2+ times
- Look for: product-item, cart-item, line-item, order-item, row, item classes
- These repeated containers almost always contain individual products
- Table rows (<tr>), list items (<li>), or divs with similar class patterns

### Step 2: Extract Product Info from Each Pattern
For each repeated element, extract:
1. **name**: The longest descriptive text (usually brand + product + variant/size)
   - Include: brand, product name, size, color, quantity (e.g., "3 Pack", "x2")

2. **price**: Look for currency symbols ($ € £) near the name
   - Formats: $29.99, $29, AU$29.99, 29.99 USD

3. **quantity**: Can be explicit or embedded
   - Explicit: separate element saying "Qty: 3" or "x3"
   - Embedded: "3 Pack", "Set of 6", "12 count"

### Step 3: Determine isRecurring
TRUE for consumables that run out:
- Food, beverages, coffee, snacks
- Cleaning supplies, detergents, paper products
- Toiletries, cosmetics (consumable items)
- Pet food, pet supplies
- Office supplies (printer ink, paper)
- Vitamins, supplements, medications

FALSE for durables:
- Electronics, tools, hardware
- Furniture, home decor
- Clothing, shoes, accessories

## OUTPUT FORMAT
Return ONLY valid JSON. No explanations, no markdown blocks.
{
  "isOrderConfirmation": boolean,
  "confidence": number (0-1),
  "products": [
    {
      "name": string,
      "price": number | null,
      "quantity": number,
      "isRecurring": boolean,
      "category": string | null,
      "suggestedFrequencyDays": number | null
    }
  ],
  "retailer": string | null,
  "orderNumber": string | null
}`

/**
 * Analyze an order page using Gemini API
 */
export async function analyzeOrderWithAI(pageContent: string | PageContent): Promise<OrderAnalysis> {
  try {
    // Get Gemini API key from storage
    const result = await chrome.storage.local.get('geminiApiKey')
    const apiKey = result.geminiApiKey

    if (!apiKey) {
      console.log('[LLM] No Gemini API key configured, using fallback')
      const fallbackContent = typeof pageContent === 'string' ? pageContent : pageContent.textContent
      return analyzeOrderWithHeuristics(fallbackContent)
    }

    // Normalize content for API call - use text content for LLM
    const textContent = typeof pageContent === 'string'
      ? pageContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      : pageContent.textContent

    console.log('[LLM] Calling Gemini API...')

    const prompt = `${SYSTEM_PROMPT}

Analyze this e-commerce order page and extract all products.

PAGE CONTENT:
${textContent?.substring(0, 50000)}

Extract ALL products and return ONLY the JSON object.`

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[LLM] Gemini API error: ${response.status} ${errorText}`)
      const fallbackContent = typeof pageContent === 'string' ? pageContent : pageContent.textContent
      return analyzeOrderWithHeuristics(fallbackContent)
    }

    const data = await response.json()
    let content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Remove markdown code blocks if present
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    console.log('[LLM] Raw Gemini response:', content.substring(0, 500))

    const analysis = parseOrderAnalysis(content)
    console.log('[LLM] Parsed analysis:', analysis)
    return analysis
  } catch (error) {
    console.error('[LLM] AI analysis error:', error)
    const fallbackContent = typeof pageContent === 'string' ? pageContent : pageContent.textContent
    return analyzeOrderWithHeuristics(fallbackContent)
  }
}

/**
 * Parse LLM response into OrderAnalysis
 */
function parseOrderAnalysis(response: string): OrderAnalysis {
  const defaultResult: OrderAnalysis = {
    isOrderConfirmation: false,
    confidence: 0,
    products: [],
    retailer: null,
    orderNumber: null
  }

  try {
    let jsonStr = response
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return defaultResult
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      isOrderConfirmation: parsed.isOrderConfirmation ?? false,
      confidence: parsed.confidence ?? 0,
      products: Array.isArray(parsed.products)
        ? parsed.products.map((p: any) => ({
            name: p.name || 'Unknown Product',
            price: typeof p.price === 'number' ? p.price : null,
            quantity: typeof p.quantity === 'number' ? p.quantity : 1,
            isRecurring: typeof p.isRecurring === 'boolean' ? p.isRecurring : false,
            category: p.category || null,
            suggestedFrequencyDays: typeof p.suggestedFrequencyDays === 'number' ? p.suggestedFrequencyDays : null
          }))
        : [],
      retailer: parsed.retailer || null,
      orderNumber: parsed.orderNumber || null
    }
  } catch (e) {
    console.error('[LLM] Parse error:', e)
    return defaultResult
  }
}

/**
 * Fallback heuristic-based detection (no AI required)
 */
export function analyzeOrderWithHeuristics(pageContent: string): OrderAnalysis {
  const lowerContent = pageContent.toLowerCase()

  // Order confirmation indicators
  const confirmationSignals = [
    'order confirmation',
    'thank you for your order',
    'order has been received',
    'order number',
    'receipt',
    'purchase confirmation',
    'order successfully placed',
    'we\'ll send you an email'
  ]

  const hasConfirmation = confirmationSignals.some(signal =>
    lowerContent.includes(signal)
  )

  if (!hasConfirmation) {
    return DEFAULT_RESULT
  }

  // Extract retailer from common patterns
  const retailerPatterns = [
    { name: 'Amazon', pattern: /amazon|amzn/i },
    { name: 'eBay', pattern: /\bebay\b/i },
    { name: 'Walmart', pattern: /walmart/i },
    { name: 'Target', pattern: /target/i },
    { name: 'Best Buy', pattern: /best buy|bestbuy/i },
    { name: 'Apple', pattern: /\bapple\b/i },
    { name: 'Nike', pattern: /\bnike\b/i },
    { name: 'Bunnings', pattern: /bunnings/i }
  ]

  let retailer = null
  for (const { name, pattern } of retailerPatterns) {
    if (pattern.test(pageContent)) {
      retailer = name
      break
    }
  }

  // Extract order number
  const orderNumberMatch = pageContent.match(/order\s*[:#]?\s*([A-Z0-9-]{4,})/i)
  const orderNumber = orderNumberMatch?.[1] || null

  // Simple product extraction (looks for common patterns)
  const products: Array<{
    name: string
    price: number | null
    quantity: number
    isRecurring: boolean
    category: string | null
    suggestedFrequencyDays: number | null
  }> = []

  const productLines = pageContent.split(/\n|\r/).filter(line =>
    line.length > 10 && line.length < 200 &&
    (line.includes('$') || /\d+\s*(x|pcs|items|qty)/i.test(line))
  )

  for (const line of productLines.slice(0, 5)) {
    const priceMatch = line.match(/\$(\d+\.?\d*)/)
    products.push({
      name: line.trim().substring(0, 50),
      price: priceMatch ? parseFloat(priceMatch[1]) : null,
      quantity: 1,
      isRecurring: false,
      category: null,
      suggestedFrequencyDays: 30
    })
  }

  return {
    isOrderConfirmation: true,
    confidence: 0.6,
    products,
    retailer,
    orderNumber
  }
}

/**
 * Get the configured LLM provider
 */
export async function getLLMProvider(): Promise<LLMProvider | null> {
  return {
    async analyzeOrderPage(pageContent: string | PageContent): Promise<OrderAnalysis> {
      return analyzeOrderWithAI(pageContent)
    }
  }
}
