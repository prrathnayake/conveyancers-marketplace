import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'

import AdminLayout from '../components/AdminLayout'
import type { SessionUser } from '../../frontend/lib/session'
import { getSessionFromRequest } from '../../frontend/lib/session'

import type { SystemLogEntry } from './api/system-logs'

type SystemLogsPageProps = {
  user: SessionUser
}

type SystemLogsListResponse = {
  services: string[]
}

type SystemLogsEntriesResponse = {
  service: string
  entries: SystemLogEntry[]
}

type ApiError = {
  error: string
}

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return timestamp
  }
  return date.toLocaleString()
}

const AdminSystemLogs = ({ user }: SystemLogsPageProps): JSX.Element => {
  const [services, setServices] = useState<string[]>([])
  const [selectedService, setSelectedService] = useState<string>('')
  const [entries, setEntries] = useState<SystemLogEntry[]>([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latestServiceRequest = useRef(0)
  const latestEntriesRequest = useRef(0)

  const loadEntries = useCallback(async (service: string) => {
    const requestId = latestEntriesRequest.current + 1
    latestEntriesRequest.current = requestId
    try {
      setEntriesLoading(true)
      setError(null)
      const response = await fetch(`/api/system-logs?service=${encodeURIComponent(service)}`)
      const payload = (await response.json()) as SystemLogsEntriesResponse | ApiError
      if (!response.ok) {
        const message =
          typeof (payload as ApiError).error === 'string'
            ? (payload as ApiError).error
            : 'Failed to load log entries'
        throw new Error(message)
      }
      const data = payload as SystemLogsEntriesResponse
      if (latestEntriesRequest.current === requestId) {
        setEntries(data.entries)
      }
    } catch (err) {
      if (latestEntriesRequest.current === requestId) {
        setError(err instanceof Error ? err.message : 'Unable to load log entries')
        setEntries([])
      }
    } finally {
      if (latestEntriesRequest.current === requestId) {
        setEntriesLoading(false)
      }
    }
  }, [])

  const loadServices = useCallback(async (): Promise<string | null> => {
    const requestId = latestServiceRequest.current + 1
    latestServiceRequest.current = requestId
    try {
      setServicesLoading(true)
      setError(null)
      const response = await fetch('/api/system-logs')
      const payload = (await response.json()) as SystemLogsListResponse | ApiError
      if (!response.ok) {
        const message =
          typeof (payload as ApiError).error === 'string'
            ? (payload as ApiError).error
            : 'Failed to load log services'
        throw new Error(message)
      }
      if (latestServiceRequest.current !== requestId) {
        return null
      }

      const data = payload as SystemLogsListResponse
      setServices(data.services)
      if (data.services.length === 0) {
        setSelectedService('')
        setEntries([])
        return null
      }

      let nextService = data.services[0]
      setSelectedService((current) => {
        if (current && data.services.includes(current)) {
          nextService = current
          return current
        }
        nextService = data.services[0]
        return nextService
      })

      await loadEntries(nextService)
      return nextService
    } catch (err) {
      if (latestServiceRequest.current === requestId) {
        setError(err instanceof Error ? err.message : 'Unable to load available logs')
        setServices([])
        setSelectedService('')
        setEntries([])
      }
      return null
    } finally {
      if (latestServiceRequest.current === requestId) {
        setServicesLoading(false)
      }
    }
  }, [loadEntries])

  useEffect(() => {
    void loadServices()
  }, [loadServices])

  const handleServiceChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value
      setSelectedService(value)
      if (value) {
        void loadEntries(value)
      } else {
        setEntries([])
      }
    },
    [loadEntries]
  )

  const serviceOptions = useMemo(() => {
    return services.map((service) => (
      <option key={service} value={service}>
        {service}
      </option>
    ))
  }, [services])

  return (
    <AdminLayout user={user}>
      <Head>
        <title>System logs</title>
      </Head>
      <section className="admin-section">
        <header className="admin-section__header">
          <div>
            <h1 className="admin-section__title">Service telemetry</h1>
            <p className="admin-section__description">
              Inspect cross-workflow log records retained for compliance and operational audits.
            </p>
          </div>
          <span className="admin-badge">{user.email}</span>
        </header>

        <div className="admin-log-container">
          <div className="admin-log-controls">
            <label className="admin-form__label">
              Service
              <select
                value={selectedService}
                onChange={handleServiceChange}
                className="admin-select admin-log-select"
                disabled={servicesLoading || services.length === 0}
              >
                {serviceOptions}
              </select>
            </label>
            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={() => selectedService && void loadEntries(selectedService)}
              disabled={!selectedService || entriesLoading}
            >
              Refresh
            </button>
            <button
              type="button"
              className="admin-button admin-button--ghost"
              onClick={() => void loadServices()}
              disabled={servicesLoading}
            >
              Rescan services
            </button>
          </div>

          {error ? (
            <p className="admin-error" role="alert">
              {error}
            </p>
          ) : null}

          {servicesLoading ? (
            <p>Discovering log streams…</p>
          ) : services.length === 0 ? (
            <p className="admin-empty">No services have emitted audit logs yet.</p>
          ) : entriesLoading ? (
            <p>Loading log entries…</p>
          ) : entries.length === 0 ? (
            <p className="admin-empty">No log entries recorded for this service.</p>
          ) : (
            <ul className="admin-log-entries">
              {entries.map((entry, index) => (
                <li key={`${entry.timestamp}-${index}`} className="admin-log-entry">
                  <div className="admin-log-entry__meta">
                    <time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
                    <span className="admin-log-entry__category">{entry.category}</span>
                    {entry.context ? <span className="admin-log-entry__context">Request {entry.context}</span> : null}
                  </div>
                  <pre className="admin-log-entry__message">{entry.message}</pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </AdminLayout>
  )
}

export const getServerSideProps: GetServerSideProps<SystemLogsPageProps> = async ({ req }) => {
  const user = getSessionFromRequest(req)
  if (!user || user.role !== 'admin') {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  return { props: { user } }
}

export default AdminSystemLogs
