import { useTheme } from '../context/ThemeContext'

const ThemeToggle = (): JSX.Element => {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const label = `Switch to ${isDark ? 'light' : 'dark'} mode`

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-pressed={isDark}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true" className="theme-toggle__icon">
        {isDark ? '☀️' : '🌙'}
      </span>
      <span className="theme-toggle__text">{isDark ? 'Light' : 'Dark'} mode</span>
    </button>
  )
}

export default ThemeToggle
