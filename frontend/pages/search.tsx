import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import styles from '../styles/search.module.css'
import { usePerspective } from '../context/PerspectiveContext'

type ApiProfile = {
  id: string
  name: string
  state: string
  suburb: string
  verified: boolean
  rating?: number
  reviewCount?: number
  turnaround?: string
  specialties?: string[]
  remoteFriendly?: boolean
  responseTime?: string
}

type Profile = Required<Omit<ApiProfile, 'specialties' | 'turnaround' | 'responseTime'>> & {
  specialties: string[]
  turnaround: string
  responseTime: string
}

type SortOption = 'relevance' | 'rating' | 'reviews' | 'name_asc'
type ViewMode = 'grid' | 'table'

const states = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

const enrichProfile = (profile: ApiProfile): Profile => {
  return {
    id: profile.id,
    name: profile.name,
    state: profile.state,
    suburb: profile.suburb,
    verified: Boolean(profile.verified),
    rating: typeof profile.rating === 'number' ? profile.rating : 0,
    reviewCount: typeof profile.reviewCount === 'number' ? profile.reviewCount : 0,
    turnaround: profile.turnaround || '3-5 business days',
    specialties: Array.isArray(profile.specialties) ? profile.specialties : [],
    remoteFriendly: Boolean(profile.remoteFriendly),
    responseTime: profile.responseTime || 'within 24 hours',
  }
}

const renderStars = (rating: number): string => {
  const fullStars = Math.round(rating)
  return '★'.repeat(fullStars).padEnd(5, '☆')
}

const Search = (): JSX.Element => {
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false)
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [sortOption, setSortOption] = useState<SortOption>('relevance')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null)
  const [chatError, setChatError] = useState<{ id: string; message: string } | null>(null)
  const { perspective, setPerspective, availablePerspectives } = usePerspective()

  const perspectiveSummary = useMemo(() => {
    return perspective === 'buyer'
      ? 'Preview support focused on purchase due diligence, escrow, and contract reviews.'
      : 'Preview support tailored to vendor statements, settlement readiness, and marketing disclosures.'
  }, [perspective])

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
      const payload = (await response.json()) as ApiProfile[]
      setProfiles(payload.map(enrichProfile))
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

  const extractUserId = (compositeId: string): number | null => {
    const match = compositeId.match(/^(?:conveyancer_)?(\d+)$/)
    if (!match) {
      return null
    }
    return Number(match[1])
  }

  const handleStartChat = async (profileId: string) => {
    const userId = extractUserId(profileId)
    if (!userId) {
      return
    }
    setChatLoadingId(profileId)
    setChatError(null)
    try {
      const response = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: userId, perspective }),
      })
      if (response.status === 401) {
        await router.push(`/login?next=${encodeURIComponent(`/chat?partnerId=${userId}`)}`)
        return
      }
      if (!response.ok) {
        const message =
          response.status === 403
            ? 'Secure chat is only available between conveyancers and verified clients.'
            : 'Unable to open secure chat'
        throw new Error(message)
      }
      await router.push(`/chat?partnerId=${userId}`)
    } catch (err) {
      setChatError({ id: profileId, message: err instanceof Error ? err.message : 'Unexpected error' })
    } finally {
      setChatLoadingId(null)
    }
  }

  return (
    <>
      <Head>
        <title>Find an Australian conveyancer</title>
      </Head>
      <main className={styles.page}>
        <section className={styles.intro}>
          <div>
            <h1>Verified conveyancers, matched to your matter</h1>
            <p>
              Search by state, speciality, and responsiveness. Every professional listed is licence-checked and escrow-ready.
            </p>
            <div className={styles.perspectiveToolbar} role="group" aria-label="Select client perspective">
              <span className={styles.perspectiveLabel}>Viewing as</span>
              <div className={styles.perspectiveButtons}>
                {availablePerspectives.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={
                      option === perspective
                        ? `${styles.perspectiveButton} ${styles.perspectiveButtonActive}`
                        : styles.perspectiveButton
                    }
                    aria-pressed={option === perspective}
                    onClick={() => setPerspective(option)}
                  >
                    {option === 'buyer' ? 'Buyer' : 'Seller'}
                  </button>
                ))}
              </div>
            </div>
            <p className={styles.perspectiveSummary}>{perspectiveSummary}</p>
          </div>
          <div className={styles.insights} role="list" aria-label="Marketplace insights">
            <div role="listitem">
              <strong>{profiles.length}</strong>
              <span>available profiles</span>
            </div>
            <div role="listitem">
              <strong>{totalVerified}</strong>
              <span>ConveySafe verified</span>
            </div>
            <div role="listitem">
              <strong>{remoteCapable}</strong>
              <span>remote friendly</span>
            </div>
          </div>
        </section>

        <form className={styles.filters} onSubmit={handleSubmit} aria-label="Search filters">
          <div className={styles.fieldGroup}>
            <label htmlFor="search-query">Name, suburb, or keyword</label>
            <input
              id="search-query"
              className={styles.input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. off-the-plan Sydney"
              autoComplete="off"
            />
          </div>
          <div className={styles.fieldGroup}>
            <label htmlFor="state-select">State</label>
            <select
              id="state-select"
              className={styles.select}
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
          <div className={styles.fieldToggles}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={showVerifiedOnly}
                onChange={(event) => setShowVerifiedOnly(event.target.checked)}
              />
              Only show ConveySafe verified
            </label>
            <label className={styles.toggle}>
              <input type="checkbox" checked={remoteOnly} onChange={(event) => setRemoteOnly(event.target.checked)} />
              Remote friendly only
            </label>
          </div>
          <div className={styles.fieldActions}>
            <button type="submit" className={styles.primaryButton}>
              Apply filters
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleReset}>
              Reset
            </button>
          </div>
        </form>

        <div className={styles.resultsToolbar} aria-label="Result controls">
          <div className={styles.resultCount}>
            Showing <strong>{sortedProfiles.length}</strong> conveyancers
          </div>
          <div className={styles.toolbarControls}>
            <label className={styles.sort}>
              <span>Sort by</span>
              <select
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as SortOption)}
              >
                <option value="relevance">Relevance</option>
                <option value="rating">Rating</option>
                <option value="reviews">Reviews</option>
                <option value="name_asc">Name A-Z</option>
              </select>
            </label>
            <div className={styles.viewToggle} role="radiogroup" aria-label="Choose layout">
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
          <div className={styles.skeletonGrid} role="status" aria-live="polite">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={styles.skeletonCard} />
            ))}
            <span className="sr-only">Loading results…</span>
          </div>
        )}

        {!loading && error && <p className={styles.errorMessage}>Unable to load conveyancers: {error}</p>}

        {!loading && !error && sortedProfiles.length === 0 && (
          <div className={styles.emptyState}>
            <h2>No conveyancers matched your filters</h2>
            <p>Try clearing speciality keywords or selecting “All states” to widen your search.</p>
            <button type="button" className={styles.secondaryButton} onClick={handleReset}>
              Clear all filters
            </button>
          </div>
        )}

        {!loading && !error && sortedProfiles.length > 0 && viewMode === 'grid' && (
          <ul className={styles.resultsGrid} aria-live="polite">
            {sortedProfiles.map((profile) => (
              <li key={profile.id} className={styles.resultCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3>{profile.name}</h3>
                    <p className={styles.location}>
                      {profile.suburb}, {profile.state}
                    </p>
                  </div>
                    <span className={`${styles.status} ${profile.verified ? styles.statusVerified : styles.statusPending}`}>
                    {profile.verified ? 'ConveySafe verified' : 'Awaiting ConveySafe checks'}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.rating} aria-label={`Rated ${profile.rating} out of 5`}>
                    <span aria-hidden="true">{renderStars(profile.rating)}</span>
                    <span className={styles.ratingValue}>{profile.rating.toFixed(1)}</span>
                    <span className={styles.reviews}>({profile.reviewCount} reviews)</span>
                  </div>
                  <p className={styles.turnaround}>Average turnaround: {profile.turnaround}</p>
                  <p className={styles.response}>Typical response: {profile.responseTime}</p>
                  <ul className={styles.specialties}>
                    {profile.specialties.map((specialty) => (
                      <li key={specialty}>{specialty}</li>
                    ))}
                  </ul>
                </div>
                <div className={styles.cardActions}>
                  <Link href={`/conveyancers/${profile.id}`} className={styles.ghostPrimary}>
                    View profile
                  </Link>
                  <button
                    type="button"
                    className={styles.ghostSecondary}
                    onClick={() => void handleStartChat(profile.id)}
                    disabled={chatLoadingId === profile.id}
                  >
                    {chatLoadingId === profile.id ? 'Opening chat…' : 'Start secure chat'}
                  </button>
                  {profile.remoteFriendly && <span className={styles.pill}>Works remotely</span>}
                  {chatError?.id === profile.id ? (
                    <p className={styles.cardError} role="alert">
                      {chatError.message}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && sortedProfiles.length > 0 && viewMode === 'table' && (
          <div className={styles.tableWrapper} role="region" aria-live="polite" aria-label="Conveyancer table view">
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
                  <th scope="col">Actions</th>
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
                    <td data-label="Actions" className={styles.tableActions}>
                      <Link href={`/conveyancers/${profile.id}`} className={styles.ghostPrimary}>
                        Profile
                      </Link>
                      <button
                        type="button"
                        className={styles.ghostSecondary}
                        onClick={() => void handleStartChat(profile.id)}
                        disabled={chatLoadingId === profile.id}
                      >
                        {chatLoadingId === profile.id ? 'Opening…' : 'Secure chat'}
                      </button>
                      {chatError?.id === profile.id ? (
                        <span className={styles.inlineError}>{chatError.message}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  )
}

export default Search
