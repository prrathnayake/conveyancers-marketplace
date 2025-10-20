import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import twilio from 'twilio'
import { logError } from './observability'

type EmailPayload = {
  to: string
  subject: string
  html: string
}

type SmsPayload = {
  to: string
  body: string
}

export type NotificationOptions = {
  correlationId?: string
}

type NotificationChannel = 'email' | 'sms'

export type NotificationErrorCode =
  | 'smtp_credentials_missing'
  | 'smtp_delivery_failed'
  | 'twilio_credentials_missing'
  | 'twilio_delivery_failed'
  | 'admin_alert_delivery_failed'

type NotificationErrorDetails = Record<string, unknown>

export class NotificationError extends Error {
  code: NotificationErrorCode
  details?: NotificationErrorDetails

  constructor(
    code: NotificationErrorCode,
    message: string,
    options?: { cause?: unknown; details?: NotificationErrorDetails }
  ) {
    super(message)
    this.name = 'NotificationError'
    this.code = code
    this.details = options?.details
    if (options?.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }
}

const formatCause = (error: NotificationError): Record<string, unknown> | undefined => {
  const cause = (error as { cause?: unknown }).cause
  if (!cause) {
    return undefined
  }
  if (cause instanceof NotificationError) {
    return {
      code: cause.code,
      message: cause.message,
      details: cause.details ?? null,
    }
  }
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
    }
  }
  return { value: typeof cause === 'string' ? cause : String(cause) }
}

const logNotificationError = (
  channel: NotificationChannel,
  error: NotificationError,
  options: NotificationOptions = {}
): void => {
  const payload: Record<string, unknown> = {
    code: error.code,
    message: error.message,
  }
  if (error.details) {
    payload.details = error.details
  }
  const cause = formatCause(error)
  if (cause) {
    payload.cause = cause
  }
  logError(options.correlationId ?? null, `notification_${channel}`, payload)
}

let mailTransporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null
let smsClient: ReturnType<typeof twilio> | null = null

const getSmtpTransporter = () => {
  if (mailTransporter) {
    return mailTransporter
  }

  const host = process.env.SMTP_HOST
  const portValue = process.env.SMTP_PORT
  const port = portValue ? Number(portValue) : NaN
  const user = process.env.SMTP_USERNAME
  const pass = process.env.SMTP_PASSWORD

  const missing: string[] = []
  if (!host) {
    missing.push('SMTP_HOST')
  }
  if (!portValue || Number.isNaN(port)) {
    missing.push('SMTP_PORT')
  }
  if (!user) {
    missing.push('SMTP_USERNAME')
  }
  if (!pass) {
    missing.push('SMTP_PASSWORD')
  }

  if (missing.length > 0) {
    throw new NotificationError('smtp_credentials_missing', 'SMTP credentials are not fully configured', {
      details: { missing },
    })
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

  const missing: string[] = []
  if (!accountSid) {
    missing.push('TWILIO_ACCOUNT_SID')
  }
  if (!authToken) {
    missing.push('TWILIO_AUTH_TOKEN')
  }

  if (missing.length > 0) {
    throw new NotificationError('twilio_credentials_missing', 'Twilio credentials are not fully configured', {
      details: { missing },
    })
  }

  smsClient = twilio(accountSid, authToken)
  return smsClient
}

export const sendEmail = async (
  payload: EmailPayload,
  options: NotificationOptions = {}
): Promise<void> => {
  try {
    const transporter = getSmtpTransporter()
    const sender = process.env.SMTP_FROM_ADDRESS
    if (!sender) {
      throw new NotificationError('smtp_credentials_missing', 'SMTP_FROM_ADDRESS is not configured', {
        details: { missing: ['SMTP_FROM_ADDRESS'] },
      })
    }

    await transporter.sendMail({ from: sender, ...payload })
  } catch (error) {
    const notificationError =
      error instanceof NotificationError
        ? error
        : new NotificationError('smtp_delivery_failed', 'Failed to deliver email notification', {
            cause: error,
            details: { recipient: payload.to },
          })
    logNotificationError('email', notificationError, options)
    throw notificationError
  }
}

export const sendSms = async (
  payload: SmsPayload,
  options: NotificationOptions = {}
): Promise<void> => {
  try {
    const client = getSmsClient()
    const from = process.env.TWILIO_FROM_NUMBER
    if (!from) {
      throw new NotificationError('twilio_credentials_missing', 'TWILIO_FROM_NUMBER is not configured', {
        details: { missing: ['TWILIO_FROM_NUMBER'] },
      })
    }

    await client.messages.create({ from, ...payload })
  } catch (error) {
    const notificationError =
      error instanceof NotificationError
        ? error
        : new NotificationError('twilio_delivery_failed', 'Failed to deliver SMS notification', {
            cause: error,
            details: { recipient: payload.to },
          })
    logNotificationError('sms', notificationError, options)
    throw notificationError
  }
}

export const notifyAdminChange = async (
  message: string,
  options: NotificationOptions = {}
): Promise<void> => {
  const email = process.env.ADMIN_ALERT_EMAIL
  const sms = process.env.ADMIN_ALERT_MOBILE

  const tasks: Array<Promise<void>> = []
  if (email) {
    tasks.push(sendEmail({ to: email, subject: 'Marketplace admin change', html: `<p>${message}</p>` }, options))
  }
  if (sms) {
    tasks.push(sendSms({ to: sms, body: message }, options))
  }
  if (tasks.length === 0) {
    return
  }

  const results = await Promise.allSettled(tasks)
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failures.length > 0) {
    const failureSummaries = failures.map(({ reason }) => {
      if (reason instanceof NotificationError) {
        return {
          code: reason.code,
          message: reason.message,
          details: reason.details ?? null,
        }
      }
      if (reason instanceof Error) {
        return { name: reason.name, message: reason.message }
      }
      return { message: String(reason) }
    })
    const aggregated = new NotificationError(
      'admin_alert_delivery_failed',
      'Failed to deliver admin change notification',
      { details: { failures: failureSummaries } }
    )
    logError(options.correlationId ?? null, 'admin_change_notification', {
      message: aggregated.message,
      failures: failureSummaries,
    })
    throw aggregated
  }
}
