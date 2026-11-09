import { db } from '@/lib/db'
import { createHandler } from '@/lib/api/handler'
import { badRequest, conflict, notFound } from '@/lib/api/errors'
import { portalAccessSchema } from '@/lib/validation/hr'
import { hashPassword } from '@/lib/auth/password'
import { generateTempPassword } from '@/lib/domain/hr'

/**
 * POST /hr/employees/:id/portal-access — grant or reset a staff login.
 *   { action: 'CREATE_LOGIN', role, email?, password? } → new User row linked to the employee
 *   { action: 'RESET_PASSWORD', password? }             → new password for the linked user
 * When `password` is omitted a temporary one is generated and returned ONCE.
 */
export const POST = createHandler({ permission: 'hr.employees.portal', body: portalAccessSchema }, async ({ user, params, body, audit }) => {
  const employee = await db.employee.findFirst({ where: { id: params.id, schoolId: user.schoolId } })
  if (!employee) throw notFound('Staff member not found')
  const fullName = `${employee.firstName} ${employee.lastName}`

  if (body.action === 'CREATE_LOGIN') {
    if (employee.userId) throw conflict(`${fullName} already has a portal login — use "Reset password" instead`)
    const email = (body.email || employee.email || '').trim().toLowerCase()
    if (!email) throw badRequest('An email address is required to create a portal login')
    if (await db.user.findFirst({ where: { schoolId: user.schoolId, email } })) {
      throw conflict('A user with this email already exists in your school')
    }

    const temporary = !body.password
    const password = body.password || generateTempPassword()
    const created = await db.user.create({
      data: {
        schoolId: user.schoolId,
        branchId: employee.branchId,
        email,
        fullName,
        role: body.role,
        phone: employee.phone ?? null,
        passwordHash: await hashPassword(password),
        status: 'ACTIVE',
      },
    })
    await db.employee.update({ where: { id: employee.id }, data: { userId: created.id } })

    audit({ action: 'create', entity: 'User', entityId: created.id, summary: `Granted ${body.role} portal login to ${fullName} (${email})` })
    return { userId: created.id, email, temporaryPassword: temporary ? password : undefined }
  }

  // RESET_PASSWORD
  if (!employee.userId) throw badRequest(`${fullName} has no portal login to reset`)
  const temporary = !body.password
  const password = body.password || generateTempPassword()
  await db.user.update({
    where: { id: employee.userId },
    data: { passwordHash: await hashPassword(password) },
  })
  audit({ action: 'update', entity: 'User', entityId: employee.userId, summary: `Reset portal password for ${fullName}` })
  return { userId: employee.userId, temporaryPassword: temporary ? password : undefined }
})

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
