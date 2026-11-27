import type { Payload, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { arrangeDates, eventBySlug, findSimilar, mergeEvents, nearbyDates, syncDates, type EventDoc } from '../src/index.js'

/**
 * Finds that can run inside a request's transaction never paginate (0.2.1). A paginated find sends a count with it
 * on the request's session; when that is the transaction's first query the two race to start it, and one can fail
 * with NoSuchTransaction. The race needs a real replica set and luck, so these tests check the cause instead: a
 * made-up Payload whose `find` records what it was asked, and every find that carries a `req` must say
 * `pagination: false`. No database, no other plugin.
 */
type FindArgs = { collection: string; where?: unknown; pagination?: unknown; limit?: unknown; req?: unknown }
type Doc = Record<string, unknown>

function recorder(answer: (args: FindArgs) => Doc[] = () => []) {
  const finds: FindArgs[] = []
  const payload = {
    config: { custom: { events: { events: 'events', dates: 'event-dates', copyToDates: [], horizonMonths: 12, defaultTimezone: 'UTC' } } },
    find: async (args: FindArgs) => {
      finds.push(args)
      return { docs: answer(args) }
    },
    findByID: async ({ id }: { id: string }) => ({ id, name: `Event ${id}`, slug: `event-${id}` }),
  } as unknown as Payload
  const req = { payload, user: { id: 'u1', collection: 'users' }, context: {} } as unknown as PayloadRequest
  return { payload, req, finds }
}

/** The field a slug lookup searched: `slug` or `formerSlugs`. */
const lookedUp = (f: FindArgs) => Object.keys((f.where as { and: Doc[] }).and[1]!)[0]

const expectNoPaginatedFindWithReq = (finds: FindArgs[], howMany: number) => {
  const withReq = finds.filter((f) => f.req)
  expect(withReq).toHaveLength(howMany)
  for (const f of withReq) expect(f.pagination, `a find on ${f.collection} with a req must pass pagination: false`).toBe(false)
}

describe('eventBySlug inside a request never paginates (0.2.1)', () => {
  it('asks once, without a count, when the address is current', async () => {
    const { payload, req, finds } = recorder((f) => (lookedUp(f) === 'slug' ? [{ id: 'e1', slug: 'spring-show' }] : []))
    const found = await eventBySlug(payload, 'spring-show', { req })
    expect(found).toMatchObject({ event: { id: 'e1' }, redirect: null })
    expect(finds.map(lookedUp)).toEqual(['slug'])
    expectNoPaginatedFindWithReq(finds, 1)
  })

  it('asks twice, both without a count, when the address is a merged-away one', async () => {
    const { payload, req, finds } = recorder((f) => (lookedUp(f) === 'formerSlugs' ? [{ id: 'e2', slug: 'big-show' }] : []))
    const found = await eventBySlug(payload, 'old-show', { req })
    expect(found).toMatchObject({ event: { id: 'e2' }, redirect: 'big-show' })
    expect(finds.map(lookedUp)).toEqual(['slug', 'formerSlugs'])
    expectNoPaginatedFindWithReq(finds, 2)
  })

  it('asks twice, both without a count, when nothing has the address', async () => {
    const { payload, req, finds } = recorder()
    expect(await eventBySlug(payload, 'nowhere', { req })).toEqual({ event: null, redirect: null })
    expectNoPaginatedFindWithReq(finds, 2)
  })

  it('still asks for one row only, as the request’s user', async () => {
    const { payload, req, finds } = recorder()
    await eventBySlug(payload, 'nowhere', { req })
    for (const f of finds) expect(f).toMatchObject({ limit: 1, overrideAccess: false, user: { id: 'u1' }, req })
  })
})

describe('the other finds that take a request never paginate either', () => {
  it('findSimilar: the events list and the same-venue dates', async () => {
    const { payload, req, finds } = recorder()
    await findSimilar(payload, { name: 'Spring Show', venue: { postalCode: '00000' }, starts: '2031-03-01T20:00:00Z' }, { req })
    expect(finds.map((f) => f.collection)).toEqual(['events', 'event-dates'])
    expectNoPaginatedFindWithReq(finds, 2)
  })

  it('nearbyDates', async () => {
    const { payload, req, finds } = recorder()
    await nearbyDates(payload, { lng: 0, lat: 0, miles: 10, from: new Date(0), to: new Date(1), req })
    expectNoPaginatedFindWithReq(finds, 1)
  })

  it('arrangeDates and mergeEvents: each event’s dates, when planning', async () => {
    const { req, finds } = recorder()
    expect(await arrangeDates(req, { event: 'e1' })).toMatchObject({ applied: false, moves: 0 })
    expect(await mergeEvents(req, { into: 'e1', from: ['e2', 'e3'] })).toMatchObject({ applied: false, moves: 0 })
    expectNoPaginatedFindWithReq(finds, 3)
  })

  it('syncDates: the dates a rule made, read from a save hook’s request', async () => {
    const { payload, req, finds } = recorder()
    expect(await syncDates(payload, { id: 'e1', name: 'One-time', recurring: false } as unknown as EventDoc, { req })).toEqual({ created: 0, removed: 0 })
    expectNoPaginatedFindWithReq(finds, 1)
  })
})
