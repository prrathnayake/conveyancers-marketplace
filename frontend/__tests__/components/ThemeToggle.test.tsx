import { render, screen, fireEvent } from '@testing-library/react'
import ThemeToggle from '../../components/ThemeToggle'
import { useTheme } from '../../context/ThemeContext'

// Mock the useTheme hook
jest.mock('../../context/ThemeContext', () => ({
  useTheme: jest.fn(),
}))

describe('ThemeToggle', () => {
  it('renders correctly in light mode', () => {
    // Mock the return value of useTheme for light mode
    ;(useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      toggleTheme: jest.fn(),
    })

    render(<ThemeToggle />)

    // Check if the button is rendered with the correct aria-label and text
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
    expect(screen.getByText('Dark mode')).toBeInTheDocument()
    expect(screen.getByText('🌙')).toBeInTheDocument()
  })

  it('renders correctly in dark mode', () => {
    // Mock the return value of useTheme for dark mode
    ;(useTheme as jest.Mock).mockReturnValue({
      theme: 'dark',
      toggleTheme: jest.fn(),
    })

    render(<ThemeToggle />)

    // Check if the button is rendered with the correct aria-label and text
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
    expect(screen.getByText('Light mode')).toBeInTheDocument()
    expect(screen.getByText('☀️')).toBeInTheDocument()
  })

  it('calls toggleTheme when the button is clicked', () => {
    const mockToggleTheme = jest.fn()
    ;(useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      toggleTheme: mockToggleTheme,
    })

    render(<ThemeToggle />)

    // Click the button
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))

    // Expect toggleTheme to have been called
    expect(mockToggleTheme).toHaveBeenCalledTimes(1)
  })
})
