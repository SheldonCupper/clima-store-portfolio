import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  CartContext,
  type CartItem,
  type Product,
} from './cart'

export function CartProvider({
  children,
}: {
  children: ReactNode
}) {
  const [cart, setCart] = useState<CartItem[]>(() => {
    const savedCart = localStorage.getItem('refripro-cart')

    if (!savedCart) {
      return []
    }

    try {
      return JSON.parse(savedCart)
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(
      'refripro-cart',
      JSON.stringify(cart)
    )
  }, [cart])

  const cartCount = useMemo(() => {
    return cart.reduce(
      (total, item) => total + item.quantity,
      0
    )
  }, [cart])

  const cartTotal = useMemo(() => {
    return cart.reduce(
      (total, item) =>
        total +
        Number(item.product.price) * item.quantity,
      0
    )
  }, [cart])

  function addToCart(product: Product) {
    if (product.stock <= 0) return

    setCart((currentCart) => {
      const existingItem = currentCart.find(
        (item) => item.product.id === product.id
      )

      if (existingItem) {
        return currentCart.map((item) => {
          if (item.product.id !== product.id) {
            return item
          }

          return {
            ...item,
            quantity: Math.min(
              item.quantity + 1,
              product.stock
            ),
          }
        })
      }

      return [
        ...currentCart,
        {
          product,
          quantity: 1,
        },
      ]
    })
  }

  function increaseQuantity(productId: number) {
    setCart((currentCart) =>
      currentCart.map((item) => {
        if (item.product.id !== productId) {
          return item
        }

        return {
          ...item,
          quantity: Math.min(
            item.quantity + 1,
            item.product.stock
          ),
        }
      })
    )
  }

  function decreaseQuantity(productId: number) {
    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item.product.id !== productId) {
            return item
          }

          return {
            ...item,
            quantity: item.quantity - 1,
          }
        })
        .filter((item) => item.quantity > 0)
    )
  }

  function removeFromCart(productId: number) {
    setCart((currentCart) =>
      currentCart.filter(
        (item) => item.product.id !== productId
      )
    )
  }

  function clearCart() {
    setCart([])
  }

  return (
    <CartContext.Provider
      value={{
        cart,
        cartCount,
        cartTotal,
        addToCart,
        increaseQuantity,
        decreaseQuantity,
        removeFromCart,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  )
}