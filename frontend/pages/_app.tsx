import type { AppProps } from 'next/app'

import '../styles/globals.css'
import Layout from '../components/Layout'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'

const App = ({ Component, pageProps }: AppProps): JSX.Element => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
