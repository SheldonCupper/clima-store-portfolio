import { store } from '../config/store'

export function StoreLogo() {
  return (
    <img
      className="store-logo"
      src={store.logoUrl}
      alt={`Logo da ${store.name}`}
      width={80}
      height={80}
      decoding="async"
    />
  )
}
