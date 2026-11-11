import type { ProductAttributes } from '../../shared/productAttributes'
import { createContext } from 'react'

export type Product = {
  isService?: boolean
  serviceDetails?: import('../../shared/services').ServiceDetails
  id: number
  name: string
  slug: string
  description: string | null
  sku: string
  price: string
  pixPrice: string | null
  stock: number
  active: boolean
  imageUrl: string | null
  imageUrls?: string[]
  gtin?: string | null
  technicalAttributes?: ProductAttributes
  categoryId: number
  createdAt: string
  updatedAt: string
  category: {
    id: number
    name: string
    slug: string
    active: boolean
  }
}

export type CartItem = {
  product: Product
  quantity: number
}

export type CartContextType = {
  cart: CartItem[]
  cartCount: number
  cartTotal: number
  addToCart: (product: Product) => void
  increaseQuantity: (productId: number) => void
  decreaseQuantity: (productId: number) => void
  removeFromCart: (productId: number) => void
  clearCart: () => void
}

export const CartContext =
  createContext<CartContextType | undefined>(undefined)