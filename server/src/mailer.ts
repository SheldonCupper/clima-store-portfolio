import nodemailer from 'nodemailer'

// Credenciais lidas apenas no backend; nenhum link/token é registrado em logs.
export function mailConfiguration() {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS
  const from = process.env.MAIL_FROM?.trim()
  const port = Number(process.env.SMTP_PORT || 587)
  if (process.env.NODE_ENV === 'production' && !process.env.APP_PUBLIC_URL) throw new Error('Configure APP_PUBLIC_URL em produção')
  const origin = new URL(process.env.APP_PUBLIC_URL || 'http://localhost:5173')
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('APP_PUBLIC_URL inválida')
  if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) throw new Error('Use HTTPS em APP_PUBLIC_URL')
  if (!host || !user || !pass || !from || !Number.isInteger(port) || port < 1 || port > 65535 || /[\r\n]/.test(from)) throw new Error('Envio de e-mails indisponível. Configure o SMTP no backend.')
  return { host, port, user, pass, from, origin: origin.origin }
}

export const accountMailer = {
  async send(to: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', token: string) {
    const config = mailConfiguration()
    const link = new URL(purpose === 'VERIFY_EMAIL' ? '/confirmar-email' : '/redefinir-senha', config.origin)
    // Fragmentos não são enviados no request HTTP nem no Referer.
    link.hash = new URLSearchParams({ token }).toString()
    const verification = purpose === 'VERIFY_EMAIL'
    const title = verification ? 'Confirme seu e-mail' : 'Redefina sua senha'
    const text = `${title} — Clima Store\n\nAbra o link para ${verification ? 'confirmar seu e-mail' : 'criar uma nova senha'}:\n${link.href}\n\nEste link é de uso único e expira em ${verification ? '24 horas' : '30 minutos'}. Se você não fez esta solicitação, ignore esta mensagem.`
    const transport = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.port === 465,
      requireTLS: config.port !== 465,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true,
    })
    await transport.sendMail({ from: config.from, to, subject: `${title} | Clima Store`, text })
  },
}
