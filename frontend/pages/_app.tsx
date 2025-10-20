import type { AppProps } from 'next/app'

import '../styles/globals.css'
import Layout from '../components/Layout'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
import { PerspectiveProvider } from '../context/PerspectiveContext'

const App = ({ Component, pageProps }: AppProps): JSX.Element => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PerspectiveProvider>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </PerspectiveProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
