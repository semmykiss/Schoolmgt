// OpenAPI 3.1 document — grows with each module phase.

const info = {
  title: 'SchoolDesk API',
  version: '1.0.0',
  description: 'Multi-tenant school management API. All endpoints are prefixed with /api/v1 and scoped to the authenticated user\'s school. Auth uses httpOnly JWT access + rotating refresh cookies.',
}

const jsonBody = (schema?: object) => ({ required: true, content: { 'application/json': { schema: schema ?? {} } } })
const okResp = (description = 'Success') => ({ 200: { description, content: { 'application/json': { schema: { type: 'object', properties: { data: {} } } } } } })

function op(method: string, summary: string, tag: string, extra: Record<string, unknown> = {}) {
  return { [method]: { summary, tags: [tag], responses: okResp(), ...extra } }
}

const paths: Record<string, unknown> = {
  '/auth/register': {
    post: { summary: 'Create a school + administrator account (onboarding)', tags: ['Auth'],
      requestBody: jsonBody(), responses: okResp('Session cookies set') },
  },
  '/auth/login': op('post', 'Sign in with email + password', 'Auth', { requestBody: jsonBody() }),
  '/auth/refresh': op('post', 'Rotate refresh token, issue new access token', 'Auth'),
  '/auth/logout': op('post', 'Revoke refresh token and clear cookies', 'Auth'),
  '/auth/me': op('get', 'Current user, permissions, school branding and branches', 'Auth'),
  '/auth/change-password': op('post', 'Change own password (revokes all sessions)', 'Auth', { requestBody: jsonBody() }),

  '/users': { get: { summary: 'List users (search, role, status, pagination)', tags: ['Users'], responses: okResp() },
    post: { summary: 'Create a user', tags: ['Users'], requestBody: jsonBody(), responses: okResp() } },
  '/users/{id}': {
    patch: { summary: 'Update a user (name, role, status, password reset)', tags: ['Users'], requestBody: jsonBody(), responses: okResp() },
    delete: { summary: 'Delete a user', tags: ['Users'], responses: okResp() },
  },
  '/roles': op('get', 'List roles with permissions + full permission catalogue', 'Roles'),
  '/roles/{name}': op('patch', 'Update a role\'s permission matrix (ADMIN role is locked)', 'Roles', { requestBody: jsonBody() }),
  '/school': { get: op('get', 'Get current school profile', 'School')['get'],
    patch: op('patch', 'Update school profile/branding', 'School', { requestBody: jsonBody() })['patch'] },
  '/branches': { get: op('get', 'List branches', 'School')['get'],
    post: { summary: 'Create a branch', tags: ['School'], requestBody: jsonBody(), responses: okResp() } },
  '/settings': { get: op('get', 'Get all school settings (key/value)', 'Settings')['get'],
    put: op('put', 'Upsert a setting', 'Settings', { requestBody: jsonBody() })['put'] },
  '/dashboard': op('get', 'Dashboard widgets: counts, today attendance, fees month, upcoming exams, recent admissions/activity, 6-month cashflow', 'Dashboard'),
  '/search': op('get', 'Global search across students and staff (?q=)', 'Search'),
  '/notifications': op('get', 'Latest notifications for the signed-in user', 'Notifications'),
  '/notifications/read': op('post', 'Mark notifications read ({ids[]} or {all:true})', 'Notifications', { requestBody: jsonBody() }),
}

export const openApiDoc = {
  openapi: '3.1.0',
  info,
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Auth' }, { name: 'Users' }, { name: 'Roles' }, { name: 'School' }, { name: 'Settings' },
    { name: 'Dashboard' }, { name: 'Search' }, { name: 'Notifications' },
    { name: 'Academic' }, { name: 'Admissions' }, { name: 'Students' }, { name: 'Timetable' },
    { name: 'Attendance' }, { name: 'Exams' }, { name: 'Assignments' }, { name: 'Fees' },
    { name: 'Payments' }, { name: 'Accounts' }, { name: 'HR' }, { name: 'Inventory' },
    { name: 'Library' }, { name: 'Communication' }, { name: 'Portal' }, { name: 'Reports' },
  ],
  paths,
}

export function registerPaths(entries: Record<string, unknown>) {
  Object.assign(paths, entries)
}
