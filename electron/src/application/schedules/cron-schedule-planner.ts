import { CronExpressionParser } from 'cron-parser'
import type { Schedule } from '../../../../domain/schedule'

export class CronSchedulePlannerError extends Error {
  readonly name = 'CronSchedulePlannerError'

  constructor() {
    super('Schedule cron expression or time zone is invalid')
  }
}

export interface SchedulePlanner {
  next(
    schedule: Pick<Schedule, 'cronExpression' | 'timeZone'>,
    after: number
  ): number
}

export class CronSchedulePlanner implements SchedulePlanner {
  next(
    schedule: Pick<Schedule, 'cronExpression' | 'timeZone'>,
    after: number
  ): number {
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      schedule.cronExpression.trim().split(/\s+/).length !== 5
    ) {
      throw new CronSchedulePlannerError()
    }
    try {
      const next = CronExpressionParser.parse(schedule.cronExpression, {
        currentDate: new Date(after),
        tz: schedule.timeZone
      })
        .next()
        .getTime()
      if (!Number.isSafeInteger(next) || next <= after) {
        throw new CronSchedulePlannerError()
      }
      return next
    } catch {
      throw new CronSchedulePlannerError()
    }
  }
}
