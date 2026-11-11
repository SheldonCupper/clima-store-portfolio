import whatsappIcon from '../../icones/whatsapp.png'

export function WhatsAppIcon({ size = 24 }: { size?: number }) {
  return <img src={whatsappIcon} width={size} height={size} className="social-icon" alt="" aria-hidden="true" draggable={false} />
}
