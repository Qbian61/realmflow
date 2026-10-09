import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArtifactFixedLayoutPreview } from './ArtifactFixedLayoutPreview'

const load = vi.fn().mockResolvedValue({})
const destroy = vi.fn().mockResolvedValue(undefined)
const pdfRender = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
const pdfGetPage = vi.fn(async () => ({
  getViewport: ({ scale }: { scale: number }) => ({
    width: 240 * scale,
    height: 320 * scale
  }),
  render: pdfRender
}))
const pdfDestroy = vi.fn()
const getDocument = vi.fn(() => ({
  promise: Promise.resolve({
    numPages: 2,
    getPage: pdfGetPage,
    destroy: pdfDestroy
  })
}))

vi.mock('@file-viewer/core', () => ({
  createViewer: vi.fn(() => ({ load, destroy }))
}))

vi.mock('@file-viewer/renderer-ofd', () => ({
  ofdRenderer: { id: 'ofd-renderer' }
}))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument
}))

describe('ArtifactFixedLayoutPreview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    load.mockClear()
    destroy.mockClear()
    pdfRender.mockClear()
    pdfGetPage.mockClear()
    pdfDestroy.mockClear()
    getDocument.mockClear()
    vi.unstubAllGlobals()
  })

  it('loads authorized OFD bytes into the offline renderer and cleans up', async () => {
    const content = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

    const { unmount } = render(
      <ArtifactFixedLayoutPreview
        fileType="ofd"
        loadBytes={vi.fn().mockResolvedValue(content)}
        name="invoice.ofd"
        loadingLabel="正在加载 OFD"
        failedLabel="无法显示 OFD"
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('正在加载 OFD')
    await waitFor(() => {
      expect(load).toHaveBeenCalledWith({
        buffer: expect.any(ArrayBuffer),
        filename: 'invoice.ofd',
        type: 'ofd',
        size: 4
      })
    })
    expect(screen.getByLabelText('invoice.ofd')).toBeVisible()

    unmount()
    await waitFor(() => expect(destroy).toHaveBeenCalled())
  })

  it('renders PDF bytes into canvas pages without the OFD renderer', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D)

    const { unmount } = render(
      <ArtifactFixedLayoutPreview
        fileType="pdf"
        loadBytes={vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]))}
        name="resume.pdf"
        loadingLabel="正在加载 PDF"
        failedLabel="无法显示 PDF"
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('正在加载 PDF')
    expect(await screen.findByLabelText('resume.pdf 第 1 页')).toBeVisible()
    expect(await screen.findByLabelText('resume.pdf 第 2 页')).toBeVisible()
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.any(ArrayBuffer),
        isEvalSupported: false,
        useSystemFonts: true
      })
    )
    expect(pdfRender).toHaveBeenCalledTimes(2)
    expect(load).not.toHaveBeenCalled()

    unmount()
    expect(pdfDestroy).toHaveBeenCalled()
  })

  it('shows a terminal visible error when local rendering fails', async () => {
    render(
      <ArtifactFixedLayoutPreview
        fileType="ofd"
        loadBytes={vi.fn().mockRejectedValue(new Error('missing'))}
        name="missing.ofd"
        loadingLabel="正在加载 OFD"
        failedLabel="无法显示 OFD"
      />
    )

    expect(await screen.findByText('无法显示 OFD')).toHaveAttribute(
      'aria-live',
      'assertive'
    )
    expect(load).not.toHaveBeenCalled()
  })
})
