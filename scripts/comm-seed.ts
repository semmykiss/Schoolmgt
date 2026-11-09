// Phase 7 demo data — communication module showcase (idempotent):
//   • announcements: one pinned published + one draft + one class-scoped
//   • calendar events: PTA meeting, mid-term break, exams window, inter-house sports
//   • message templates: fee reminder, absence alert, exam notice
//   • sample delivery logs via the mock driver
// Run: bunx tsx scripts/comm-seed.ts

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return iso(d)
}

async function main() {
  const school = await db.school.findFirst()
  if (!school) throw new Error('No school found — run the main seed first')
  const schoolId = school.id

  const admin = await db.user.findFirst({ where: { schoolId, role: 'ADMIN' } })

  // ── Announcements ─────────────────────────────────────────────────────────
  const announcements = [
    {
      title: 'Second Term PTA Meeting',
      body: 'Dear Parents,\n\nThe Second Term PTA meeting holds on Saturday at 10:00 AM in the main hall. Attendance is highly encouraged as we will review the term\'s academic performance and upcoming projects.\n\n— School Management',
      audience: 'PARENTS', classId: null as string | null, pinned: true, published: true,
    },
    {
      title: 'Staff Briefing — New Grading Workflow',
      body: 'All academic staff should attend a short briefing on the updated grading scale and report-card workflow, Thursday 3:30 PM in the conference room.',
      audience: 'STAFF', classId: null, pinned: false, published: true,
    },
    {
      title: 'Inter-House Sports Festival',
      body: 'Our annual Inter-House Sports Festival comes up this month. Parents are welcome — come cheer the houses! Details on the event calendar.',
      audience: 'ALL', classId: null, pinned: false, published: true,
    },
    {
      title: 'JSS 3 Extra Lessons',
      body: 'Extra BECE preparation lessons for JSS 3 begin next week, Mondays and Wednesdays, 2:00–3:30 PM.',
      audience: 'CLASS', classId: null, pinned: false, published: false, // audience fixed below
    },
  ]

  const jss3 = await db.schoolClass.findFirst({ where: { schoolId, name: { contains: 'JSS 3' } } })
  for (const a of announcements) {
    const existing = await db.announcement.findFirst({ where: { schoolId, title: a.title } })
    if (existing) { console.log('✔ announcement exists:', a.title); continue }
    await db.announcement.create({
      data: {
        schoolId,
        title: a.title,
        body: a.body,
        audience: a.audience,
        classId: a.audience === 'CLASS' ? jss3?.id ?? null : null,
        pinned: a.pinned,
        publishedAt: a.published ? new Date(Date.now() - 2 * 24 * 3600 * 1000) : null,
        createdById: admin?.id ?? null,
      },
    })
    console.log('✚ announcement:', a.title)
  }

  // ── Calendar events ───────────────────────────────────────────────────────
  const events = [
    { title: 'Inter-House Sports Festival', type: 'ACTIVITY', start: daysFromNow(5), end: daysFromNow(5), description: 'Annual inter-house athletics competition at the school field.' },
    { title: 'Mid-Term Break', type: 'HOLIDAY', start: daysFromNow(12), end: daysFromNow(14), description: 'Students resume the following day by 7:30 AM.' },
    { title: 'Second Term Examinations', type: 'EXAM', start: daysFromNow(25), end: daysFromNow(31), description: 'Check the exam schedule for subject papers.' },
    { title: 'PTA General Meeting', type: 'MEETING', start: daysFromNow(8), end: daysFromNow(8), description: 'Main hall, 10:00 AM.' },
  ]
  for (const e of events) {
    const existing = await db.calendarEvent.findFirst({ where: { schoolId, title: e.title } })
    if (existing) { console.log('✔ event exists:', e.title); continue }
    await db.calendarEvent.create({
      data: {
        schoolId, title: e.title, description: e.description, type: e.type,
        startDate: e.start, endDate: e.end, audience: 'ALL', createdById: admin?.id ?? null,
      },
    })
    console.log('✚ event:', e.title)
  }

  // ── Message templates ─────────────────────────────────────────────────────
  const templates = [
    {
      name: 'Fee payment reminder', channel: 'SMS',
      subject: null as string | null,
      body: 'Dear Parent, a balance of {{amount}} remains on {{student}}\'s fees at {{school}}. Kindly pay before {{date}}. Thank you.',
    },
    {
      name: 'Absence alert', channel: 'SMS',
      subject: null,
      body: 'Notice from {{school}}: {{student}} was marked absent today, {{date}}. If this is unexpected, please contact the school office.',
    },
    {
      name: 'Exam timetable notice', channel: 'EMAIL',
      subject: 'Examination timetable published — {{school}}',
      body: 'Dear {{name}},\n\nThe examination timetable for the current term has been published. Please review the schedule with {{student}} and ensure punctuality on all paper days.\n\nRegards,\n{{school}} Exams Office',
    },
  ]
  for (const t of templates) {
    const existing = await db.messageTemplate.findFirst({ where: { schoolId, name: t.name } })
    if (existing) { console.log('✔ template exists:', t.name); continue }
    await db.messageTemplate.create({ data: { schoolId, name: t.name, channel: t.channel, subject: t.subject, body: t.body } })
    console.log('✚ template:', t.name)
  }

  // ── Sample delivery logs (mock driver, SIMULATED) ─────────────────────────
  const logCount = await db.communicationLog.count({ where: { schoolId } })
  if (logCount === 0) {
    const guardians = await db.guardian.findMany({
      where: { schoolId, phone: { not: '' } },
      select: { phone: true, firstName: true },
      take: 5,
    })
    const now = Date.now()
    await db.communicationLog.createMany({
      data: guardians.map((g, i) => ({
        schoolId,
        channel: 'SMS' as const,
        recipient: g.phone,
        subject: null,
        body: `Dear Parent, the Second Term PTA Meeting holds Saturday at 10:00 AM. — Crescent Dawn Group of Schools`,
        status: 'SIMULATED',
        provider: 'mock',
        error: null,
        sentAt: new Date(now - (i + 1) * 3600 * 1000),
        createdById: admin?.id ?? null,
      })),
    })
    console.log(`✚ ${guardians.length} sample delivery logs`)
  } else {
    console.log('✔ delivery logs already present:', logCount)
  }

  console.log('✅ Communication demo data ready')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
