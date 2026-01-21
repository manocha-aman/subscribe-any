import type { OrderAnalysis } from '@/types'

// Mock LLM responses for testing

export const mockAmazonOrderResponse: OrderAnalysis = {
  isOrderConfirmation: true,
  confidence: 0.95,
  products: [
    {
      name: 'Purina Pro Plan Dog Food, 35 lb',
      price: 59.99,
      quantity: 1,
      isRecurring: true,
      category: 'Pet Supplies'
    },
    {
      name: 'Dog Treats Variety Pack',
      price: 24.99,
      quantity: 2,
      isRecurring: true,
      category: 'Pet Supplies'
    }
  ],
  retailer: 'Amazon',
  orderNumber: '112-1234567-8901234'
}

export const mockWalmartOrderResponse: OrderAnalysis = {
  isOrderConfirmation: true,
  confidence: 0.92,
  products: [
    {
      name: 'Pampers Diapers Size 4, 150 count',
      price: 44.97,
      quantity: 1,
      isRecurring: true,
      category: 'Baby'
    },
    {
      name: 'Huggies Wipes, 6 pack',
      price: 12.99,
      quantity: 1,
      isRecurring: true,
      category: 'Baby'
    }
  ],
  retailer: 'Walmart',
  orderNumber: '2000012345678'
}

export const mockNonOrderResponse: OrderAnalysis = {
  isOrderConfirmation: false,
  confidence: 0.1,
  products: [],
  retailer: null,
  orderNumber: null
}

export const mockOneTimeProductResponse: OrderAnalysis = {
  isOrderConfirmation: true,
  confidence: 0.88,
  products: [
    {
      name: 'Samsung 55" Smart TV',
      price: 499.99,
      quantity: 1,
      isRecurring: false,
      category: 'Electronics'
    },
    {
      name: 'HDMI Cable 6ft',
      price: 12.99,
      quantity: 2,
      isRecurring: false,
      category: 'Electronics'
    }
  ],
  retailer: 'Best Buy',
  orderNumber: 'BBY01-123456789'
}

export const mockMixedProductResponse: OrderAnalysis = {
  isOrderConfirmation: true,
  confidence: 0.9,
  products: [
    {
      name: 'Vitamin D3 5000 IU, 360 capsules',
      price: 18.99,
      quantity: 1,
      isRecurring: true,
      category: 'Health'
    },
    {
      name: 'Yoga Mat',
      price: 29.99,
      quantity: 1,
      isRecurring: false,
      category: 'Sports'
    }
  ],
  retailer: 'Amazon',
  orderNumber: '112-9876543-2109876'
}

export const mockMalformedResponse = {
  // Missing required fields
  someField: 'value'
}

export const mockEmptyResponse: OrderAnalysis = {
  isOrderConfirmation: true,
  confidence: 0.5,
  products: [],
  retailer: 'Unknown Store',
  orderNumber: null
}
