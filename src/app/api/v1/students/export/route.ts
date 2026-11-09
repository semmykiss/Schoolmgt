import { createHandler } from '@/lib/api/handler'
import { parseListQuery } from '@/lib/api/paginate'
import { db } from '@/lib/db'

/** CSV export of the current filtered student list (same filters as GET /students). */
export const GET = createHandler({ permission: 'students.read' }, async ({ user, query }) => {
  const q = parseListQuery(query, { pageSize: 2000 })
  const where: Record<string, unknown> = { schoolId: user.schoolId }
  const classId = query.get('classId')
  const status = query.get('status')
  if (classId) where.classId = classId
  if (status) where.status = status
  if (q.search) {
    where.OR = [
      { firstName: { contains: q.search } },
      { lastName: { contains: q.search } },
      { admissionNumber: { contains: q.search } },
    ]
  }

  const students = await db.student.findMany({
    where,
    include: {
      class: { select: { name: true } },
      section: { select: { name: true } },
      guardians: { include: { guardian: { select: { firstName: true, lastName: true, phone: true } } } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 2000,
  })

  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = 'Admission Number,Last Name,First Name,Other Name,Gender,Date of Birth,Class,Section,Status,Admission Date,Guardian,Guardian Phone'
  const lines = students.map(s => {
    const g = s.guardians[0]?.guardian
    return [
      s.admissionNumber, s.lastName, s.firstName, s.otherName ?? '', s.gender,
      s.dateOfBirth ?? '', s.class?.name ?? '', s.section?.name ?? '', s.status,
      s.admissionDate, g ? `${g.firstName} ${g.lastName}` : '', g?.phone ?? '',
    ].map(esc).join(',')
  })
  const csv = `${header}\n${lines.join('\n')}`

  return new Response(`\uFEFF${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="students-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
