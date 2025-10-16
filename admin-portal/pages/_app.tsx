import type { AppProps } from 'next/app'

import '../styles/globals.css'

const AdminApp = ({ Component, pageProps }: AppProps): JSX.Element => {
  return <Component {...pageProps} />
}

export default AdminApp
