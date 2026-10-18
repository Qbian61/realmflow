type ProcessOutputStream = {
  on: (
    event: 'error',
    listener: (error: NodeJS.ErrnoException) => void
  ) => unknown
}

type ProcessOutputStreams = {
  stdout?: ProcessOutputStream
  stderr?: ProcessOutputStream
}

const guardedStreams = new WeakSet<object>()

export function installProcessOutputErrorGuards(
  streams: ProcessOutputStreams = {}
): void {
  guardOutputStream(streams.stdout ?? process.stdout)
  guardOutputStream(streams.stderr ?? process.stderr)
}

function guardOutputStream(stream: ProcessOutputStream): void {
  const identity = stream as object
  if (guardedStreams.has(identity)) return

  guardedStreams.add(identity)
  stream.on('error', (error) => {
    if (error.code === 'EPIPE') return
    throw error
  })
}
