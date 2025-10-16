declare module 'bcryptjs' {
  const bcrypt: any
  export = bcrypt
}

declare module 'better-sqlite3' {
  const Database: any
  export = Database
}

declare module 'twilio' {
  const twilio: any
  export = twilio
}

declare module 'nodemailer' {
  export type Transporter<T = any> = any
  const nodemailer: any
  export = nodemailer
}

declare module 'nodemailer/lib/smtp-transport' {
  interface SMTPTransport {}
  namespace SMTPTransport {
    type SentMessageInfo = any
  }
  export = SMTPTransport
}

declare module 'jsonwebtoken' {
  export type JwtPayload = any
  const jsonwebtoken: any
  export = jsonwebtoken
}

declare module 'cookie' {
  export type SerializeOptions = any
  const cookie: any
  export = cookie
}
