// One-off fix-up for the live demo database (Phase 6):
//   1. Link the student portal login (student@schooldesk.ng) to Chinedu Okafor's
//      Student row — the original seed never set Student.userId.
//   2. Ensure the sample homework submission exists for the demo flow.
// Run: bunx tsx scripts/portal-seed-fix.ts   (idempotent)

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const user = await db.user.findFirst({ where: { email: 'student@schooldesk.ng' } })
  if (!user) throw new Error('student@schooldesk.ng user not found — run the seed first')

  const student = await db.student.findFirst({
    where: { schoolId: user.schoolId, firstName: 'Chinedu', lastName: 'Okafor' },
  })
  if (!student) throw new Error('Chinedu Okafor student row not found')

  if (student.userId === user.id) {
    console.log('✔ student user already linked:', student.id)
  } else {
    await db.student.update({ where: { id: student.id }, data: { userId: user.id } })
    console.log('✔ linked student login →', student.id, `(${student.firstName} ${student.lastName})`)
  }

  const maths = await db.assignment.findFirst({ where: { schoolId: user.schoolId, title: 'Problem Solving Worksheet 4' } })
  if (!maths) {
    console.log('ℹ no seeded maths assignment — skipping sample submission')
  } else {
    const existing = await db.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId: maths.id, studentId: student.id } },
    })
    if (existing) {
      console.log('✔ sample submission already exists')
    } else {
      await db.assignmentSubmission.create({
        data: {
          assignmentId: maths.id,
          studentId: student.id,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          note: 'Questions 1–20 completed in my exercise book.',
        },
      })
      console.log('✔ created sample submission for', maths.title)
    }
  }
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => db.$disconnect())
