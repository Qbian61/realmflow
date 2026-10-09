import { statfs } from 'node:fs/promises'
import { cpus, freemem, totalmem, type CpuInfo } from 'node:os'
import type { SystemResources } from '../../../shared/system-status'

type StatFsResult = {
  blocks: number | bigint
  bfree: number | bigint
  bavail: number | bigint
  bsize: number | bigint
}

type Dependencies = {
  cpus: () => CpuInfo[]
  totalmem: () => number
  freemem: () => number
  statfs: (path: string) => Promise<StatFsResult>
  wait: (milliseconds: number) => Promise<void>
  diskPath: string
}

const CPU_SAMPLE_INTERVAL_MS = 150

export class SystemResourceSampler {
  private readonly dependencies: Dependencies

  constructor(dependencies: Partial<Dependencies> & { diskPath: string }) {
    this.dependencies = {
      cpus,
      totalmem,
      freemem,
      statfs: async (path) => statfs(path, { bigint: true }),
      wait: (milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)),
      ...dependencies
    }
  }

  async sample(): Promise<SystemResources> {
    const firstCpu = aggregateCpu(this.dependencies.cpus())
    const memoryTotalBytes = nonNegative(this.dependencies.totalmem())
    const memoryFreeBytes = clamp(
      nonNegative(this.dependencies.freemem()),
      0,
      memoryTotalBytes
    )
    const diskPromise = this.dependencies.statfs(this.dependencies.diskPath)
    await this.dependencies.wait(CPU_SAMPLE_INTERVAL_MS)
    const secondCpu = aggregateCpu(this.dependencies.cpus())
    const disk = await diskPromise
    const diskTotalBytes =
      toSafeNumber(disk.blocks) * toSafeNumber(disk.bsize)
    const diskAvailableBytes =
      toSafeNumber(disk.bavail) * toSafeNumber(disk.bsize)
    const diskUsedBytes = clamp(
      diskTotalBytes - diskAvailableBytes,
      0,
      diskTotalBytes
    )
    const memoryUsedBytes = memoryTotalBytes - memoryFreeBytes

    return {
      cpuPercent: percentage(
        secondCpu.total - firstCpu.total - (secondCpu.idle - firstCpu.idle),
        secondCpu.total - firstCpu.total
      ),
      memoryUsedBytes,
      memoryTotalBytes,
      memoryPercent: percentage(memoryUsedBytes, memoryTotalBytes),
      diskUsedBytes,
      diskTotalBytes,
      diskPercent: percentage(diskUsedBytes, diskTotalBytes)
    }
  }
}

function aggregateCpu(items: CpuInfo[]): { total: number; idle: number } {
  return items.reduce(
    (summary, item) => ({
      total:
        summary.total +
        item.times.user +
        item.times.nice +
        item.times.sys +
        item.times.idle +
        item.times.irq,
      idle: summary.idle + item.times.idle
    }),
    { total: 0, idle: 0 }
  )
}

function percentage(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0
  }
  return Math.round(clamp((value / total) * 100, 0, 100) * 100) / 100
}

function toSafeNumber(value: number | bigint): number {
  const result = typeof value === 'bigint' ? Number(value) : value
  return nonNegative(Number.isSafeInteger(result) ? result : 0)
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
