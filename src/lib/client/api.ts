// Typed fetch wrapper for the SchoolDesk REST API (/api/v1).
// - Auto-refreshes the access token once on 401 and retries.
// - Throws ApiClientError with server-provided message/details.

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

type Query = Record<string, string | number | boolean | undefined | null>

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Query
  signal?: AbortSignal
}

function buildUrl(path: string, query?: Query): string {
  const base = path.startsWith('/api/') ? path : `/api/v1${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return base
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

let refreshing: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST' })
    .then(r => r.ok)
    .catch(() => false)
    .finally(() => { setTimeout(() => { refreshing = null }, 100) })
  return refreshing
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const doFetch = () => fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  let res = await doFetch()
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await tryRefresh()) res = await doFetch()
  }

  let json: { data?: T; error?: { message?: string; code?: string; details?: unknown } } = {}
  try { json = await res.json() } catch { /* empty body */ }

  if (!res.ok) {
    throw new ApiClientError(res.status, json.error?.message || `Request failed (${res.status})`, json.error?.code, json.error?.details)
  }
  return json.data as T
}

export const qk = {
  session: ['session'] as const,
  dashboard: ['dashboard'] as const,
  notifications: ['notifications'] as const,
  users: (filters?: Record<string, unknown>) => ['users', filters ?? {}] as const,
  roles: ['roles'] as const,
  // academics
  sessions: (filters?: Record<string, unknown>) => ['academic', 'sessions', filters ?? {}] as const,
  terms: (sessionId?: string) => ['academic', 'terms', sessionId ?? 'all'] as const,
  classes: (filters?: Record<string, unknown>) => ['academic', 'classes', filters ?? {}] as const,
  subjects: (filters?: Record<string, unknown>) => ['academic', 'subjects', filters ?? {}] as const,
  classSubjects: (classId?: string) => ['academic', 'class-subjects', classId ?? 'all'] as const,
  lessonPlans: (filters?: Record<string, unknown>) => ['academic', 'lesson-plans', filters ?? {}] as const,
  promotionPreview: (classId?: string) => ['academic', 'promotions', classId ?? 'none'] as const,
  employees: (search?: string) => ['employees', search ?? ''] as const,
  // admissions + students
  applicants: (filters?: Record<string, unknown>) => ['admissions', 'applicants', filters ?? {}] as const,
  students: (filters?: Record<string, unknown>) => ['students', filters ?? {}] as const,
  student: (id?: string) => ['students', 'detail', id ?? 'none'] as const,
  // timetable
  periods: () => ['timetable', 'periods'] as const,
  timetableGrid: (termId?: string, classId?: string, sectionId?: string) =>
    ['timetable', 'grid', termId ?? 'current', classId ?? 'none', sectionId ?? 'all'] as const,
  teacherTimetable: (termId?: string, teacherId?: string) =>
    ['timetable', 'teacher', termId ?? 'current', teacherId ?? 'none'] as const,
  // attendance
  attendanceRegister: (classId?: string, sectionId?: string, date?: string, periodId?: string) =>
    ['attendance', 'register', classId ?? 'none', sectionId ?? 'all', date ?? '', periodId ?? 'daily'] as const,
  attendanceSummary: (classId?: string, sectionId?: string, from?: string, to?: string) =>
    ['attendance', 'summary', classId ?? 'none', sectionId ?? 'all', from ?? '', to ?? ''] as const,
  staffAttendance: (date?: string) => ['attendance', 'staff', date ?? ''] as const,
}
