import { describe, expect, it } from 'vitest'
import {
  CronSchedulePlanner,
  CronSchedulePlannerError
} from './cron-schedule-planner'

const planner = new CronSchedulePlanner()

describe('CronSchedulePlanner', () => {
  it('returns the next slot strictly after the supplied instant', () => {
    expect(
      planner.next(
        { cronExpression: '*/5 * * * *', timeZone: 'UTC' },
        Date.parse('2026-09-27T12:05:00.000Z')
      )
    ).toBe(Date.parse('2026-09-27T12:10:00.000Z'))
  })

  it('calculates weekday slots in the schedule time zone', () => {
    expect(
      planner.next(
        {
          cronExpression: '0 9 * * 1-5',
          timeZone: 'Asia/Shanghai'
        },
        Date.parse('2026-09-27T00:00:00.000Z')
      )
    ).toBe(Date.parse('2026-09-28T01:00:00.000Z'))
  })

  it('uses crontab OR semantics for restricted month-day and weekday', () => {
    expect(
      planner.next(
        { cronExpression: '0 9 1 * 1', timeZone: 'UTC' },
        Date.parse('2026-09-01T09:01:00.000Z')
      )
    ).toBe(Date.parse('2026-09-07T09:00:00.000Z'))
  })

  it('moves a nonexistent spring-forward time to the next valid hour', () => {
    expect(
      planner.next(
        {
          cronExpression: '30 2 * * *',
          timeZone: 'America/New_York'
        },
        Date.parse('2026-03-08T06:00:00.000Z')
      )
    ).toBe(Date.parse('2026-03-08T07:30:00.000Z'))
  })

  it('runs a repeated fall-back wall time once per local day', () => {
    const first = planner.next(
      {
        cronExpression: '30 1 * * *',
        timeZone: 'America/New_York'
      },
      Date.parse('2026-11-01T04:00:00.000Z')
    )

    expect(first).toBe(Date.parse('2026-11-01T05:30:00.000Z'))
    expect(
      planner.next(
        {
          cronExpression: '30 1 * * *',
          timeZone: 'America/New_York'
        },
        first
      )
    ).toBe(Date.parse('2026-11-02T06:30:00.000Z'))
  })

  it.each([
    ['invalid expression', '61 * * * *', 'UTC', Date.now()],
    ['invalid time zone', '0 9 * * *', 'Mars/Olympus', Date.now()],
    ['invalid timestamp', '0 9 * * *', 'UTC', Number.NaN]
  ])('rejects %s with a stable error', (_label, cronExpression, timeZone, at) => {
    expect(() =>
      planner.next({ cronExpression, timeZone }, at)
    ).toThrow(CronSchedulePlannerError)
  })
})
