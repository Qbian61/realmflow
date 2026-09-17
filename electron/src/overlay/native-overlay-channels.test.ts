import { IPC_SEND_CHANNELS } from '../../../shared/ipc-contract'
import { NATIVE_OVERLAY_SEND_CHANNELS } from './native-overlay-channels'

describe('native overlay preload channels', () => {
  it('stays aligned with the shared main-process contract', () => {
    expect(NATIVE_OVERLAY_SEND_CHANNELS).toEqual({
      select: IPC_SEND_CHANNELS.nativeOverlaySelect,
      close: IPC_SEND_CHANNELS.nativeOverlayClose
    })
  })
})
