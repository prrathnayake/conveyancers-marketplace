import Head from 'next/head'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'

type Profile = {
  id: string
  name: string
  state: string
  suburb: string
  verified: boolean
}

const Search = (): JSX.Element => {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProfiles = useCallback(async (params?: { q?: string; state?: string }) => {
    setLoading(true)
    setError(null)
    try {
      const searchParams = new URLSearchParams()
      if (params?.q) {
        searchParams.set('q', params.q)
      }
      if (params?.state) {
        searchParams.set('state', params.state)
      }
      const queryString = searchParams.toString()
      const response = await fetch(`/api/profiles/search${queryString ? `?${queryString}` : ''}`)
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }
      const payload = (await response.json()) as Profile[]
      setProfiles(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
      setProfiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchProfiles()
  }, [fetchProfiles])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void fetchProfiles({ q: query.trim(), state: stateFilter.trim() || undefined })
  }

  return (
    <>
      <Head>
        <title>Find an Australian conveyancer</title>
      </Head>
      <main style={{ padding: 24, maxWidth: 720 }}>
        <h2 style={{ fontSize: '2rem', marginBottom: 24 }}>Verified conveyancers</h2>
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24 }}
        >
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, marginBottom: 4 }}>Name or suburb</span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Sydney"
              style={{ padding: 8, minWidth: 200 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, marginBottom: 4 }}>State</span>
            <input
              type="text"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
              placeholder="VIC, NSW, QLD..."
              style={{ padding: 8, width: 120, textTransform: 'uppercase' }}
            />
          </label>
          <button type="submit" style={{ padding: '10px 20px', background: '#2563eb', color: 'white', borderRadius: 6 }}>
            Search
          </button>
        </form>

        {loading && <p>Loading...</p>}
        {error && !loading && (
          <p style={{ color: '#dc2626' }}>Unable to load conveyancers: {error}</p>
        )}

        {!loading && !error && profiles.length === 0 && <p>No conveyancers matched your filters.</p>}

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16 }}>
          {profiles.map((profile) => (
            <li key={profile.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem' }}>{profile.name}</h3>
              <p style={{ margin: 0 }}>
                {profile.suburb}, {profile.state}
              </p>
              <p style={{ margin: '8px 0 0 0', color: profile.verified ? '#16a34a' : '#d97706' }}>
                {profile.verified ? 'ARNECC verified' : 'Awaiting verification'}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}

export default Search
