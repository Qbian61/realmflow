import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { installProcessOutputErrorGuards } from './process-output-error-guard'

type OutputStreams = {
  stdout: EventEmitter
  stderr: EventEmitter
}

const install = installProcessOutputErrorGuards as unknown as (
  streams: OutputStreams
) => void

function outputError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`write ${code}`), { code })
}

describe('process output error guard', () => {
  it('ignores broken pipes from stdout and stderr', () => {
    const streams = {
      stdout: new EventEmitter(),
      stderr: new EventEmitter()
    }
    install(streams)

    expect(() => streams.stdout.emit('error', outputError('EPIPE')))
      .not.toThrow()
    expect(() => streams.stderr.emit('error', outputError('EPIPE')))
      .not.toThrow()
  })

  it('does not hide output errors other than a broken pipe', () => {
    const streams = {
      stdout: new EventEmitter(),
      stderr: new EventEmitter()
    }
    install(streams)
    const error = outputError('ECONNRESET')

    expect(() => streams.stdout.emit('error', error)).toThrow(error)
  })

  it('installs only one guard per output stream', () => {
    const streams = {
      stdout: new EventEmitter(),
      stderr: new EventEmitter()
    }

    install(streams)
    install(streams)

    expect(streams.stdout.listenerCount('error')).toBe(1)
    expect(streams.stderr.listenerCount('error')).toBe(1)
  })
})
