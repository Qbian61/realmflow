import { fireEvent, render, screen } from '@testing-library/react'
import { ProviderLogo } from './ProviderLogo'

describe('ProviderLogo', () => {
  it('renders the curated brand icon for a known provider', () => {
    render(<ProviderLogo id="openai" name="OpenAI" />)

    const logo = screen.getByTestId('provider-logo-openai')
    expect(logo).toHaveAttribute('data-provider-logo', 'openai')
    const image = logo.querySelector('img')
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute('src', expect.stringContaining('openai.svg'))
  })

  it('renders deterministic local initials when no brand icon exists', () => {
    render(<ProviderLogo id="xiaomi" name="Xiaomi" />)

    const logo = screen.getByTestId('provider-logo-xiaomi')
    expect(logo).toHaveTextContent('XI')
    expect(logo.style.backgroundImage).toBe('')
  })

  it('resolves the VolcEngine Ark display name to its brand icon', () => {
    render(<ProviderLogo id="builtin-ark" name="VolcEngine Ark" />)

    const image = screen
      .getByTestId('provider-logo-builtin-ark')
      .querySelector('img')
    expect(image).toHaveAttribute(
      'src',
      expect.stringContaining('volcengine.svg')
    )
  })

  it('falls back to stable initials when the local brand image fails', () => {
    render(<ProviderLogo id="openai" name="OpenAI" size={24} />)

    const logo = screen.getByTestId('provider-logo-openai')
    const image = logo.querySelector('img')
    expect(image).toHaveAttribute('width', '23')
    expect(image).toHaveAttribute('height', '23')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')

    fireEvent.error(image!)

    expect(logo).toHaveClass('is-fallback')
    expect(logo).toHaveTextContent('OP')
    expect(logo.querySelector('img')).toBeNull()
  })
})
