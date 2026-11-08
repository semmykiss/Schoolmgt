import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'

const STAFF_ROLES = ['ADMIN', 'PRINCIPAL', 'TEACHER', 'ACCOUNTANT', 'LIBRARIAN', 'HR']
const iso = (d: Date) => d.toISOString().slice(0, 10)

export const GET = createHandler({ roles: STAFF_ROLES }, async ({ user }) => {
  const schoolId = user.schoolId
  const today = iso(new Date())
  const monthPrefix = today.slice(0, 7)

  const currentTerm = await db.term.findFirst({
    where: { schoolId, isCurrent: true },
    include: { session: { select: { name: true } } },
  })

  const [students, staff, classes, attGrouped] = await Promise.all([
    db.student.count({ where: { schoolId, status: 'ACTIVE' } }),
    db.employee.count({ where: { schoolId, status: 'ACTIVE' } }),
    db.schoolClass.count({ where: { schoolId } }),
    db.studentAttendance.groupBy({
      by: ['status'], where: { schoolId, date: today }, _count: { _all: true },
    }),
  ])

  const byStatus: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 }
  for (const g of attGrouped) byStatus[g.status] = g._count._all
  const attTotal = Object.values(byStatus).reduce((a, b) => a + b, 0)
  const attRate = attTotal > 0 ? Math.round(((byStatus.PRESENT + byStatus.LATE) / attTotal) * 1000) / 10 : null

  const [collectedAgg, outstandingAgg] = await Promise.all([
    db.payment.aggregate({ where: { schoolId, paidAt: { startsWith: monthPrefix } }, _sum: { amount: true } }),
    currentTerm
      ? db.feeInvoice.aggregate({
          where: { schoolId, termId: currentTerm.id, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
          _sum: { total: true, amountPaid: true },
        })
      : Promise.resolve(null),
  ])

  const upcomingExams = await db.examSchedule.findMany({
    where: { schoolId, date: { gte: today } },
    orderBy: { date: 'asc' }, take: 5,
    include: {
      exam: { select: { name: true } },
      classSubject: { include: { subject: { select: { name: true } }, class: { select: { name: true } } } },
    },
  })

  const recentAdmissions = await db.student.findMany({
    where: { schoolId }, orderBy: { createdAt: 'desc' }, take: 6,
    include: { class: { select: { name: true } } },
  })

  const recentActivity = await db.auditLog.findMany({
    where: { schoolId }, orderBy: { createdAt: 'desc' }, take: 8,
  })

  // last 6 months cashflow
  const from = new Date(); from.setDate(1); from.setMonth(from.getMonth() - 5)
  const ledger = await db.ledgerEntry.findMany({
    where: { schoolId, date: { gte: iso(from) } },
    select: { date: true, type: true, amount: true },
  })
  const flow: Record<string, { income: number; expense: number }> = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    flow[iso(d).slice(0, 7)] = { income: 0, expense: 0 }
  }
  for (const e of ledger) {
    const m = e.date.slice(0, 7)
    if (!flow[m]) continue
    if (e.type === 'INCOME') flow[m].income += e.amount
    else flow[m].expense += e.amount
  }

  return {
    term: currentTerm ? { id: currentTerm.id, name: currentTerm.name, session: currentTerm.session.name } : null,
    counts: { students, staff, classes },
    attendanceToday: { ...byStatus, total: attTotal, rate: attRate },
    fees: {
      collectedThisMonth: collectedAgg._sum.amount ?? 0,
      outstanding: outstandingAgg ? (outstandingAgg._sum.total ?? 0) - (outstandingAgg._sum.amountPaid ?? 0) : 0,
    },
    upcomingExams: upcomingExams.map(s => ({
      id: s.id, examName: s.exam.name,
      subject: s.classSubject?.subject.name ?? '—',
      className: s.classSubject?.class.name ?? '—',
      date: s.date, startTime: s.startTime, endTime: s.endTime,
    })),
    recentAdmissions: recentAdmissions.map(s => ({
      id: s.id, admissionNumber: s.admissionNumber,
      fullName: `${s.firstName} ${s.lastName}`,
      className: s.class?.name ?? null, admissionDate: s.admissionDate, status: s.status,
    })),
    recentActivity: recentActivity.map(a => ({
      id: a.id, userName: a.userName, action: a.action, entity: a.entity,
      summary: a.summary, createdAt: a.createdAt,
    })),
    cashflow: Object.entries(flow).map(([month, v]) => ({ month, ...v })),
  }
})
