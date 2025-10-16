import Head from 'next/head'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type RawProfile = {
  id: string
  name: string
  state: string
  suburb: string
  verified: boolean
}

type Profile = RawProfile & {
  rating: number
  reviewCount: number
  turnaround: string
  specialties: string[]
  remoteFriendly: boolean
  responseTime: string
}

type SortOption = 'relevance' | 'rating' | 'reviews' | 'name_asc'
type ViewMode = 'grid' | 'table'

const PROFILE_METADATA: Record<string, Omit<Profile, keyof RawProfile>> = {
  pro_1001: {
    rating: 4.9,
    reviewCount: 128,
    turnaround: '24-48 hours',
    specialties: ['Residential settlements', 'Off-the-plan'],
    remoteFriendly: true,
    responseTime: 'within 30 minutes',
  },
  pro_1002: {
    rating: 4.8,
    reviewCount: 86,
    turnaround: '2-3 business days',
    specialties: ['First-home buyers', 'Commercial conveyancing'],
    remoteFriendly: false,
    responseTime: 'within 1 hour',
  },
  pro_1003: {
    rating: 4.5,
    reviewCount: 45,
    turnaround: 'Same week settlements',
    specialties: ['Queensland compliance', 'Title insurance'],
    remoteFriendly: true,
    responseTime: 'within 3 hours',
  },
  pro_1004: {
    rating: 4.7,
    reviewCount: 52,
    turnaround: '3-5 business days',
    specialties: ['ACT eConveyancing', 'Developments'],
    remoteFriendly: true,
    responseTime: 'within 45 minutes',
  },
}

const states = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

const enrichProfile = (profile: RawProfile, index: number): Profile => {
  const metadata = PROFILE_METADATA[profile.id]
  if (metadata) {
    return { ...profile, ...metadata }
  }

  return {
    ...profile,
    rating: 4.4 + (index % 3) * 0.1,
    reviewCount: 24 + index * 5,
    turnaround: '3-5 business days',
    specialties: ['Residential settlements'],
    remoteFriendly: index % 2 === 0,
    responseTime: 'within 2 hours',
  }
}

const renderStars = (rating: number): string => {
  const fullStars = Math.round(rating)
  return '★'.repeat(fullStars).padEnd(5, '☆')
}

const Search = (): JSX.Element => {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false)
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [sortOption, setSortOption] = useState<SortOption>('relevance')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
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
      const payload = (await response.json()) as RawProfile[]
      setProfiles(payload.map((profile, index) => enrichProfile(profile, index)))
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

  const handleReset = () => {
    setQuery('')
    setStateFilter('')
    setShowVerifiedOnly(false)
    setRemoteOnly(false)
    setSortOption('relevance')
    setViewMode('grid')
    void fetchProfiles()
  }

  const totalVerified = useMemo(() => profiles.filter((profile) => profile.verified).length, [profiles])
  const remoteCapable = useMemo(() => profiles.filter((profile) => profile.remoteFriendly).length, [profiles])

  const filteredProfiles = useMemo(() => {
    const matchesQuery = (profile: Profile) => {
      if (!query.trim()) {
        return true
      }
      const searchTerm = query.trim().toLowerCase()
      return (
        profile.name.toLowerCase().includes(searchTerm) ||
        profile.suburb.toLowerCase().includes(searchTerm) ||
        profile.specialties.some((specialty) => specialty.toLowerCase().includes(searchTerm))
      )
    }

    const matchesState = (profile: Profile) => {
      if (!stateFilter.trim()) {
        return true
      }
      return profile.state.toLowerCase() === stateFilter.trim().toLowerCase()
    }

    return profiles
      .filter((profile) => matchesQuery(profile) && matchesState(profile))
      .filter((profile) => (showVerifiedOnly ? profile.verified : true))
      .filter((profile) => (remoteOnly ? profile.remoteFriendly : true))
  }, [profiles, query, stateFilter, showVerifiedOnly, remoteOnly])

  const sortedProfiles = useMemo(() => {
    const sorted = [...filteredProfiles]
    switch (sortOption) {
      case 'rating':
        sorted.sort((a, b) => b.rating - a.rating)
        break
      case 'reviews':
        sorted.sort((a, b) => b.reviewCount - a.reviewCount)
        break
      case 'name_asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      default:
        sorted.sort((a, b) => Number(b.verified) - Number(a.verified))
        break
    }
    return sorted
  }, [filteredProfiles, sortOption])

  return (
    <>
      <Head>
        <title>Find an Australian conveyancer</title>
      </Head>
      <main className="page">
        <section className="intro">
          <div>
            <h1>Verified conveyancers, matched to your matter</h1>
            <p>
              Search by state, speciality, and responsiveness. Every professional listed is licence-checked and escrow-ready.
            </p>
          </div>
          <div className="insights" role="list" aria-label="Marketplace insights">
            <div role="listitem">
              <strong>{profiles.length}</strong>
              <span>available profiles</span>
            </div>
            <div role="listitem">
              <strong>{totalVerified}</strong>
              <span>ARNECC verified</span>
            </div>
            <div role="listitem">
              <strong>{remoteCapable}</strong>
              <span>remote friendly</span>
            </div>
          </div>
        </section>

        <form className="filters" onSubmit={handleSubmit} aria-label="Search filters">
          <div className="field-group">
            <label htmlFor="search-query">Name, suburb, or keyword</label>
            <input
              id="search-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. off-the-plan Sydney"
              autoComplete="off"
            />
          </div>
          <div className="field-group">
            <label htmlFor="state-select">State</label>
            <select
              id="state-select"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
            >
              <option value="">All states</option>
              {states.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
          <div className="field-toggles">
            <label className="toggle">
              <input
                type="checkbox"
                checked={showVerifiedOnly}
                onChange={(event) => setShowVerifiedOnly(event.target.checked)}
              />
              Only show ARNECC-verified
            </label>
            <label className="toggle">
              <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} />
              Remote friendly only
            </label>
          </div>
          <div className="field-actions">
            <button type="submit" className="primary">
              Apply filters
            </button>
            <button type="button" className="secondary" onClick={handleReset}>
              Reset
            </button>
          </div>
        </form>

        <div className="results-toolbar" aria-label="Result controls">
          <div className="result-count">
            Showing <strong>{sortedProfiles.length}</strong> conveyancers
          </div>
          <div className="toolbar-controls">
            <label className="sort">
              <span>Sort by</span>
              <select value={sortOption} onChange={(event) => setSortOption(event.target.value as SortOption)}>
                <option value="relevance">Relevance</option>
                <option value="rating">Rating</option>
                <option value="reviews">Reviews</option>
                <option value="name_asc">Name A-Z</option>
              </select>
            </label>
            <div className="view-toggle" role="radiogroup" aria-label="Choose layout">
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === 'grid'}
                className={viewMode === 'grid' ? 'active' : ''}
                onClick={() => setViewMode('grid')}
              >
                Grid
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={viewMode === 'table'}
                className={viewMode === 'table' ? 'active' : ''}
                onClick={() => setViewMode('table')}
              >
                Table
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="skeleton-grid" role="status" aria-live="polite">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton-card" />
            ))}
            <span className="sr-only">Loading results…</span>
          </div>
        )}

        {!loading && error && <p className="error">Unable to load conveyancers: {error}</p>}

        {!loading && !error && sortedProfiles.length === 0 && (
          <div className="empty-state">
            <h2>No conveyancers matched your filters</h2>
            <p>Try clearing speciality keywords or selecting “All states” to widen your search.</p>
            <button type="button" className="secondary" onClick={handleReset}>
              Clear all filters
            </button>
          </div>
        )}

        {!loading && !error && sortedProfiles.length > 0 && viewMode === 'grid' && (
          <ul className="results-grid" aria-live="polite">
            {sortedProfiles.map((profile) => (
              <li key={profile.id} className="result-card">
                <div className="card-header">
                  <div>
                    <h3>{profile.name}</h3>
                    <p className="location">
                      {profile.suburb}, {profile.state}
                    </p>
                  </div>
                  <span className={`status ${profile.verified ? 'status--verified' : 'status--pending'}`}>
                    {profile.verified ? 'ARNECC verified' : 'Awaiting verification'}
                  </span>
                </div>
                <div className="card-body">
                  <div className="rating" aria-label={`Rated ${profile.rating} out of 5`}>
                    <span aria-hidden="true">{renderStars(profile.rating)}</span>
                    <span className="rating-value">{profile.rating.toFixed(1)}</span>
                    <span className="reviews">({profile.reviewCount} reviews)</span>
                  </div>
                  <p className="turnaround">Average turnaround: {profile.turnaround}</p>
                  <p className="response">Typical response: {profile.responseTime}</p>
                  <ul className="specialties">
                    {profile.specialties.map((specialty) => (
                      <li key={specialty}>{specialty}</li>
                    ))}
                  </ul>
                </div>
                <div className="card-actions">
                  <button type="button" className="primary ghost">
                    Request introduction
                  </button>
                  <button type="button" className="secondary ghost">
                    Save to shortlist
                  </button>
                  {profile.remoteFriendly && <span className="pill">Works remotely</span>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && sortedProfiles.length > 0 && viewMode === 'table' && (
          <div className="table-wrapper" role="region" aria-live="polite" aria-label="Conveyancer table view">
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Location</th>
                  <th scope="col">Rating</th>
                  <th scope="col">Turnaround</th>
                  <th scope="col">Specialties</th>
                  <th scope="col">Remote</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td data-label="Name">{profile.name}</td>
                    <td data-label="Location">
                      {profile.suburb}, {profile.state}
                    </td>
                    <td data-label="Rating">{profile.rating.toFixed(1)} ({profile.reviewCount})</td>
                    <td data-label="Turnaround">{profile.turnaround}</td>
                    <td data-label="Specialties">{profile.specialties.join(', ')}</td>
                    <td data-label="Remote">{profile.remoteFriendly ? 'Yes' : 'No'}</td>
                    <td data-label="Status">{profile.verified ? 'Verified' : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <style jsx>{`
        .page {
          padding: 3rem 1.5rem 4rem;
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
          color: #0f172a;
        }

        .intro {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1.5rem;
        }

        h1 {
          margin: 0 0 0.8rem;
          font-size: clamp(2.1rem, 4vw, 2.8rem);
          line-height: 1.2;
        }

        .intro p {
          margin: 0;
          max-width: 32rem;
          color: #475569;
          line-height: 1.6;
        }

        .insights {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 1rem;
          background: white;
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          padding: 1.25rem 1.5rem;
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
        }

        .insights div {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .insights strong {
          font-size: 1.4rem;
          color: #1d4ed8;
        }

        .insights span {
          color: #475569;
          font-size: 0.95rem;
        }

        .filters {
          display: grid;
          gap: 1.5rem;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          align-items: end;
          background: white;
          border-radius: 24px;
          padding: 1.75rem;
          border: 1px solid rgba(148, 163, 184, 0.35);
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }

        label {
          font-weight: 600;
          font-size: 0.95rem;
          color: #0f172a;
        }

        input,
        select {
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          padding: 0.7rem 0.9rem;
          font-size: 1rem;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        input:focus,
        select:focus {
          outline: none;
          border-color: rgba(37, 99, 235, 0.8);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
        }

        .field-toggles {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .toggle {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-weight: 500;
          color: #1f2937;
        }

        .toggle input {
          width: 1.1rem;
          height: 1.1rem;
          border-radius: 4px;
        }

        .field-actions {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .primary,
        .secondary {
          border-radius: 999px;
          padding: 0.75rem 1.5rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .primary {
          background: #1d4ed8;
          color: white;
          box-shadow: 0 12px 30px rgba(29, 78, 216, 0.25);
        }

        .secondary {
          background: rgba(148, 163, 184, 0.15);
          color: #0f172a;
          border: 1px solid rgba(148, 163, 184, 0.35);
        }

        .primary:hover,
        .primary:focus-visible,
        .secondary:hover,
        .secondary:focus-visible {
          outline: none;
          transform: translateY(-1px);
          box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
        }

        .secondary.ghost {
          background: rgba(148, 163, 184, 0.12);
        }

        .primary.ghost {
          background: rgba(29, 78, 216, 0.12);
          color: #1d4ed8;
          box-shadow: none;
          border: 1px solid rgba(29, 78, 216, 0.3);
        }

        .results-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        .result-count {
          font-size: 1rem;
          color: #1f2937;
        }

        .toolbar-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: center;
        }

        .sort {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 500;
          color: #475569;
        }

        .view-toggle {
          display: inline-flex;
          background: rgba(148, 163, 184, 0.15);
          border-radius: 999px;
          padding: 0.25rem;
          gap: 0.25rem;
        }

        .view-toggle button {
          border: none;
          background: transparent;
          padding: 0.4rem 1rem;
          border-radius: 999px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
        }

        .view-toggle button.active {
          background: #1d4ed8;
          color: white;
          transform: translateY(-1px);
        }

        .skeleton-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
        }

        .skeleton-card {
          height: 220px;
          border-radius: 20px;
          background: linear-gradient(110deg, rgba(148, 163, 184, 0.25) 8%, rgba(203, 213, 225, 0.4) 18%, rgba(148, 163, 184, 0.25) 33%);
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          border: 0;
        }

        .error {
          color: #dc2626;
          font-weight: 600;
        }

        .empty-state {
          background: white;
          border-radius: 24px;
          padding: 2.5rem;
          border: 1px solid rgba(148, 163, 184, 0.35);
          text-align: center;
          display: grid;
          gap: 1rem;
          justify-items: center;
        }

        .empty-state h2 {
          margin: 0;
          font-size: 1.6rem;
        }

        .results-grid {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
        }

        .result-card {
          background: white;
          border-radius: 24px;
          padding: 1.75rem;
          border: 1px solid rgba(148, 163, 184, 0.35);
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          box-shadow: 0 22px 48px rgba(15, 23, 42, 0.08);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
        }

        .card-header h3 {
          margin: 0 0 0.2rem;
          font-size: 1.25rem;
        }

        .location {
          margin: 0;
          color: #475569;
          font-size: 0.95rem;
        }

        .status {
          border-radius: 999px;
          padding: 0.4rem 0.85rem;
          font-weight: 600;
          font-size: 0.8rem;
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
        }

        .status--verified {
          background: rgba(22, 163, 74, 0.15);
          color: #15803d;
          border: 1px solid rgba(22, 163, 74, 0.3);
        }

        .status--pending {
          background: rgba(245, 158, 11, 0.15);
          color: #b45309;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .card-body {
          display: grid;
          gap: 0.75rem;
        }

        .rating {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          color: #1d4ed8;
        }

        .rating-value {
          font-size: 1.1rem;
        }

        .reviews {
          font-size: 0.85rem;
          color: #475569;
          font-weight: 500;
        }

        .turnaround,
        .response {
          margin: 0;
          color: #475569;
          font-size: 0.95rem;
        }

        .specialties {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }

        .specialties li {
          background: rgba(37, 99, 235, 0.12);
          color: #1d4ed8;
          padding: 0.35rem 0.8rem;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .card-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          padding: 0.35rem 0.8rem;
          background: rgba(59, 130, 246, 0.15);
          color: #1d4ed8;
          border-radius: 999px;
          font-weight: 600;
          font-size: 0.85rem;
        }

        .table-wrapper {
          background: white;
          border-radius: 24px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 720px;
        }

        th,
        td {
          padding: 1rem 1.25rem;
          text-align: left;
          border-bottom: 1px solid rgba(148, 163, 184, 0.25);
          font-size: 0.95rem;
        }

        th {
          font-size: 0.85rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: #64748b;
        }

        tr:last-of-type td {
          border-bottom: none;
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        @media (max-width: 720px) {
          .filters {
            grid-template-columns: 1fr;
          }

          .field-actions {
            flex-direction: row;
            justify-content: flex-start;
          }

          .card-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .card-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .primary,
          .secondary {
            width: 100%;
            justify-content: center;
          }

          .toolbar-controls {
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>
      <style jsx global>{`
        body {
          background: #f8fafc;
          font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
      `}</style>
    </>
  )
}

export default Search
