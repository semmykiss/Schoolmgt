import { badRequest } from './errors'

export interface ListQuery {
  page: number
  pageSize: number
  skip: number
  take: number
  search: string
}

export function parseListQuery(query: URLSearchParams, defaults?: { pageSize?: number }): ListQuery {
  const page = Math.max(1, Number(query.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(query.get('pageSize') || defaults?.pageSize || 25)))
  const search = (query.get('search') || '').trim()
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, search }
}

export function paginated<T>(items: T[], total: number, q: ListQuery) {
  return { items, total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total / q.pageSize)) }
}

export function requireId(id: string | undefined, label = 'Record'): string {
  if (!id) throw badRequest(`${label} id is required`)
  return id
}
