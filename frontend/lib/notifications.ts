import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import twilio from 'twilio'

type EmailPayload = {
  to: string
  subject: string
  html: string
}

type SmsPayload = {
  to: string
  body: string
}

let mailTransporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null
let smsClient: ReturnType<typeof twilio> | null = null

const getSmtpTransporter = () => {
  if (mailTransporter) {
    return mailTransporter
  }

  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
  const user = process.env.SMTP_USERNAME
  const pass = process.env.SMTP_PASSWORD

  if (!host || !port || !user || !pass) {
    return null
  }

  mailTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  return mailTransporter
}

const getSmsClient = () => {
  if (smsClient) {
    return smsClient
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    return null
  }

  smsClient = twilio(accountSid, authToken)
  return smsClient
}

export const sendEmail = async (payload: EmailPayload): Promise<void> => {
  const transporter = getSmtpTransporter()
  const sender = process.env.SMTP_FROM_ADDRESS
  if (!transporter || !sender) {
    console.warn('SMTP transport unavailable; email not sent')
    return
  }

  await transporter.sendMail({ from: sender, ...payload })
}

export const sendSms = async (payload: SmsPayload): Promise<void> => {
  const client = getSmsClient()
  const from = process.env.TWILIO_FROM_NUMBER
  if (!client || !from) {
    console.warn('SMS client unavailable; message not sent')
    return
  }

  await client.messages.create({ from, ...payload })
}

export const notifyAdminChange = async (message: string): Promise<void> => {
  const email = process.env.ADMIN_ALERT_EMAIL
  const sms = process.env.ADMIN_ALERT_MOBILE

  const tasks: Array<Promise<void>> = []
  if (email) {
    tasks.push(sendEmail({ to: email, subject: 'Marketplace admin change', html: `<p>${message}</p>` }))
  }
  if (sms) {
    tasks.push(sendSms({ to: sms, body: message }))
  }
  await Promise.allSettled(tasks)
}
