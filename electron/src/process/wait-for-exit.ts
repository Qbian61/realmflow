export function waitForExitBeforeTimeout(
  exited: Promise<void>,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (exitedBeforeTimeout: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(exitedBeforeTimeout)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    void exited.then(() => finish(true))
  })
}
