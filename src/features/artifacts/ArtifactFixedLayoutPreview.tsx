import { useEffect, useRef, useState } from 'react'
import type { FileViewerRendererPluginInput } from '@file-viewer/core'

type ArtifactFixedLayoutPreviewProps = {
  fileType: 'pdf' | 'ofd'
  loadBytes: () => Promise<Uint8Array>
  name: string
  loadingLabel: string
  failedLabel: string
}

type ViewerInstance = {
  prepare?: () => Promise<void>
  load(source: {
    buffer: ArrayBuffer
    filename: string
    type: string
    size: number
  }): Promise<unknown>
  destroy(): Promise<void>
}

type PdfViewport = {
  width: number
  height: number
}

type PdfPage = {
  getViewport(options: { scale: number }): PdfViewport
  render(options: {
    canvasContext: CanvasRenderingContext2D
    viewport: PdfViewport
  }): { promise: Promise<void>; cancel?: () => void }
}

type PdfDocument = {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPage>
  destroy(): Promise<void> | void
}

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(options: {
    data: ArrayBuffer
    isEvalSupported: boolean
    useSystemFonts: boolean
  }): { promise: Promise<PdfDocument> }
}

export function ArtifactFixedLayoutPreview({
  fileType,
  loadBytes,
  name,
  loadingLabel,
  failedLabel
}: ArtifactFixedLayoutPreviewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let viewer: ViewerInstance | undefined
    let pdfDocument: PdfDocument | undefined
    const renderTasks: Array<{ cancel?: () => void }> = []
    let disposed = false
    setState('loading')

    const load = async (): Promise<void> => {
      const bytes = await loadBytes()
      if (fileType === 'pdf') {
        await renderPdf(bytes)
        return
      }

      if (!containerRef.current) throw new Error('OFD surface is missing')
      const buffer = bytes.slice().buffer
      const [{ createViewer }, { ofdRenderer }] = await Promise.all([
        import('@file-viewer/core'),
        import('@file-viewer/renderer-ofd')
      ])
      if (disposed || !containerRef.current) return
      viewer = createViewer(containerRef.current, {
        options: {
          rendererMode: 'replace',
          builtinRenderers: 'none',
          renderers:
            ofdRenderer as unknown as FileViewerRendererPluginInput,
          toolbar: true,
          i18n: { locale: 'zh-CN' }
        }
      }) as ViewerInstance
      await viewer.prepare?.()
      if (disposed) return
      await viewer.load({
        buffer,
        filename: name,
        type: fileType,
        size: buffer.byteLength
      })
      if (!disposed) setState('ready')
    }

    const renderPdf = async (bytes: Uint8Array): Promise<void> => {
      if (!containerRef.current) throw new Error('PDF surface is missing')
      const pdfjs = (await import('pdfjs-dist')) as PdfJsModule
      pdfjs.GlobalWorkerOptions.workerSrc ||= new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).toString()
      pdfDocument = await pdfjs.getDocument({
        data: bytes.slice().buffer,
        isEvalSupported: false,
        useSystemFonts: true
      }).promise
      if (disposed || !containerRef.current) return
      containerRef.current.replaceChildren()
      const availableWidth = Math.max(containerRef.current.clientWidth - 32, 320)
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const page = await pdfDocument.getPage(pageNumber)
        if (disposed || !containerRef.current) return
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(1.5, availableWidth / baseViewport.width)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) throw new Error('PDF canvas is unavailable')
        const outputScale = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        canvas.setAttribute('aria-label', `${name} 第 ${pageNumber} 页`)
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
        containerRef.current.appendChild(canvas)
        const renderTask = page.render({ canvasContext: context, viewport })
        renderTasks.push(renderTask)
        await renderTask.promise
      }
      if (!disposed) setState('ready')
    }

    void load().catch((error: unknown) => {
      if (
        !disposed &&
        !(error instanceof Error && error.name === 'AbortError')
      ) {
        setState('error')
      }
    })

    return () => {
      disposed = true
      renderTasks.forEach((task) => task.cancel?.())
      if (pdfDocument) void pdfDocument.destroy()
      if (viewer) void viewer.destroy()
    }
  }, [fileType, loadBytes, name])

  return (
    <div className="artifact-fixed-layout-preview">
      {state === 'loading' ? <div role="status">{loadingLabel}</div> : null}
      {state === 'error' ? (
        <div role="status" aria-live="assertive">
          {failedLabel}
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={
          fileType === 'pdf'
            ? 'artifact-fixed-layout-surface artifact-pdf-pages'
            : 'artifact-fixed-layout-surface'
        }
        aria-label={name}
        hidden={state === 'error'}
      />
    </div>
  )
}
