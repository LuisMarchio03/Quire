import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TypographyPanel } from './TypographyPanel'
import { DEFAULT_THEME } from '../../lib/reader/types'
import { DEFAULT_FOCUS } from './useReaderTheme'

const base = {
  theme: DEFAULT_THEME,
  focus: DEFAULT_FOCUS,
  onTheme: vi.fn(),
  onFocus: vi.fn(),
  onReset: vi.fn(),
  onClose: vi.fn(),
}

describe('TypographyPanel — página do PDF', () => {
  it('sem página fixa (EPUB), não há seção de página', () => {
    render(<TypographyPanel {...base} />)

    expect(screen.queryByText(/página do pdf/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /aumentar ampliação/i })).toBeNull()
  })

  it('com página fixa, corte e ampliação moram aqui e chamam os controles', async () => {
    const onZoom = vi.fn()
    const onCrop = vi.fn()
    render(<TypographyPanel {...base} page={{ zoom: 1, onZoom, crop: true, onCrop }} />)

    expect(screen.getByText(/página do pdf/i)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: /aumentar ampliação/i }))
    expect(onZoom).toHaveBeenCalledWith(1.5)
    await userEvent.click(screen.getByRole('button', { name: /diminuir ampliação/i }))
    expect(onZoom).toHaveBeenCalledWith(0.5)

    await userEvent.click(screen.getByLabelText(/cortar as margens/i))
    expect(onCrop).toHaveBeenCalled()
  })
})
