import instagramIcon from '../../icones/instagram.png'

export function InstagramIcon({ size = 16 }: { size?: number }) {
  return <img src={instagramIcon} width={size} height={size} className="social-icon" alt="" aria-hidden="true" draggable={false} />
}
