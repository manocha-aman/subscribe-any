import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SYSTEM_PROMPT = `You are an AI assistant that analyzes e-commerce page content to determine if it's an order confirmation page and extract product information.

Your task is to:
1. Determine if the page content represents an order confirmation/receipt
2. Extract product names, prices, and quantities if present
3. Identify the retailer name
4. Determine if each product is likely a recurring purchase (consumables, supplies, etc.) vs one-time purchase (electronics, furniture, etc.)

Respond with a JSON object in this exact format:
{
  "isOrderConfirmation": boolean,
  "confidence": number (0-1),
  "products": [
    {
      "name": string,
      "price": number | null,
      "quantity": number,
      "isRecurring": boolean,
      "category": string | null
    }
  ],
  "retailer": string | null,
  "orderNumber": string | null
}

Guidelines for isRecurring:
- TRUE for: food, beverages, pet supplies, baby items, toiletries, cleaning supplies, vitamins, medications, office supplies, batteries
- FALSE for: electronics, furniture, appliances, clothing, books, jewelry, one-time tools

Only output the JSON object, no additional text.`

interface ProductInfo {
  name: string
  price: number | null
  quantity: number
  isRecurring: boolean
  category: string | null
}

interface OrderAnalysis {
  isOrderConfirmation: boolean
  confidence: number
  products: ProductInfo[]
  retailer: string | null
  orderNumber: string | null
}

serve(async (req) => {
  try {
    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { pageContent, provider } = await req.json()

    if (!pageContent) {
      return new Response(JSON.stringify({ error: 'pageContent is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const MAX_CONTENT_LENGTH = 40000
    const truncatedContent =
      pageContent.length > MAX_CONTENT_LENGTH
        ? pageContent.substring(0, MAX_CONTENT_LENGTH) + '...[truncated]'
        : pageContent

    const prompt = `Analyze this e-commerce page content and determine if it's an order confirmation:

PAGE CONTENT:
${truncatedContent}

Respond with only a JSON object in the specified format.`

    let analysis: OrderAnalysis

    // Choose AI provider (default to OpenAI)
    const aiProvider = provider || Deno.env.get('AI_PROVIDER') || 'openai'

    if (aiProvider === 'openai') {
      const apiKey = Deno.env.get('OPENAI_API_KEY')
      if (!apiKey) {
        throw new Error('OpenAI API key not configured')
      }

      const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini'
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 2000
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`OpenAI API error: ${response.status} ${errorText}`)
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ''
      analysis = parseOrderAnalysis(content)
    } else if (aiProvider === 'claude') {
      const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
      if (!apiKey) {
        throw new Error('Anthropic API key not configured')
      }

      const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-3-haiku-20240307'
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: prompt }
          ]
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Claude API error: ${response.status} ${errorText}`)
        throw new Error(`Claude API error: ${response.status}`)
      }

      const data = await response.json()
      const content = data.content?.[0]?.text || ''
      analysis = parseOrderAnalysis(content)
    } else {
      throw new Error(`Unsupported AI provider: ${aiProvider}`)
    }

    // Log the analysis for monitoring
    await supabase.from('ai_analyses').insert({
      user_id: user.id,
      provider: aiProvider,
      is_order_confirmation: analysis.isOrderConfirmation,
      confidence: analysis.confidence,
      product_count: analysis.products.length
    }).catch(console.error)

    return new Response(JSON.stringify(analysis), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error in analyze-order function:', error)
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error',
      isOrderConfirmation: false,
      confidence: 0,
      products: [],
      retailer: null,
      orderNumber: null
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

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

    if (typeof parsed.isOrderConfirmation !== 'boolean') {
      return defaultResult
    }

    const products: ProductInfo[] = Array.isArray(parsed.products)
      ? parsed.products.map((p: Partial<ProductInfo>) => ({
          name: p.name || 'Unknown Product',
          price: typeof p.price === 'number' ? p.price : null,
          quantity: typeof p.quantity === 'number' ? p.quantity : 1,
          isRecurring: typeof p.isRecurring === 'boolean' ? p.isRecurring : false,
          category: p.category || null
        }))
      : []

    return {
      isOrderConfirmation: parsed.isOrderConfirmation,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      products,
      retailer: parsed.retailer || null,
      orderNumber: parsed.orderNumber || null
    }
  } catch {
    return defaultResult
  }
}
