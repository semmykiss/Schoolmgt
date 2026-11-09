'use client'

import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { ClipboardCheck, ClipboardList, GraduationCap, Loader2, Users, Wallet, type LucideIcon } from 'lucide-react'
import { useSession } from '@/stores/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type LoginValues = z.infer<typeof loginSchema>

const registerSchema = z
  .object({
    schoolName: z.string().min(3, 'School name must be at least 3 characters').max(120),
    schoolType: z.enum(['SCHOOL', 'COLLEGE', 'TUITION_CENTRE', 'ACADEMY']),
    adminName: z.string().min(3, 'Enter the administrator’s full name').max(120),
    email: z.string().email('Enter a valid email address'),
    phone: z.string().max(30, 'Phone number is too long').optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Confirm your password'),
  })
  .refine(d => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
type RegisterValues = z.infer<typeof registerSchema>

const SCHOOL_TYPES = ['SCHOOL', 'COLLEGE', 'TUITION_CENTRE', 'ACADEMY'] as const

const TYPE_LABELS: Record<(typeof SCHOOL_TYPES)[number], string> = {
  SCHOOL: 'School',
  COLLEGE: 'College',
  TUITION_CENTRE: 'Tuition Centre',
  ACADEMY: 'Academy',
}

const DEMO_PASSWORD = 'Password123!'

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@schooldesk.ng' },
  { label: 'Teacher', email: 'tunde@schooldesk.ng' },
  { label: 'Accountant', email: 'accountant@schooldesk.ng' },
  { label: 'Parent', email: 'parent@schooldesk.ng' },
  { label: 'Student', email: 'student@schooldesk.ng' },
]

const FEATURES: { icon: LucideIcon; text: string }[] = [
  { icon: ClipboardList, text: 'Admissions → results in one flow' },
  { icon: Wallet, text: 'Fees & receipts with NGN ledger' },
  { icon: ClipboardCheck, text: 'Attendance & parent alerts' },
  { icon: Users, text: 'Parent/student portals' },
]

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive" role="alert">{message}</p>
}

export function LoginView() {
  const login = useSession(s => s.login)
  const register = useSession(s => s.register)

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      schoolName: '', schoolType: 'SCHOOL', adminName: '', email: '', phone: '', password: '', confirmPassword: '',
    },
  })

  const onLogin = loginForm.handleSubmit(async values => {
    try {
      await login(values.email, values.password)
      toast.success('Welcome back!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed')
    }
  })

  const onRegister = registerForm.handleSubmit(async values => {
    try {
      await register({
        schoolName: values.schoolName,
        schoolType: values.schoolType,
        adminName: values.adminName,
        email: values.email,
        phone: values.phone || undefined,
        password: values.password,
      })
      toast.success('School created 🎉')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Registration failed')
    }
  })

  const prefillDemo = (email: string) => {
    loginForm.setValue('email', email, { shouldValidate: true })
    loginForm.setValue('password', DEMO_PASSWORD, { shouldValidate: true })
  }

  const loginErrors = loginForm.formState.errors
  const registerErrors = registerForm.formState.errors

  return (
    <div className="grid min-h-screen bg-background md:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0F766E] to-[#134E4A] p-10 text-white md:flex md:flex-col md:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/5 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/5 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute right-16 top-1/3 h-40 w-40 rounded-full border border-white/10" aria-hidden />
        <div className="pointer-events-none absolute bottom-24 right-10 h-24 w-24 rounded-full border border-white/10" aria-hidden />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
            <GraduationCap className="h-6 w-6" aria-hidden />
          </div>
          <span className="text-xl font-semibold tracking-tight">SchoolDesk</span>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Run your entire school from one dashboard
          </h1>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(f => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-white/90">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <f.icon className="h-4 w-4" aria-hidden />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">Built for Nigerian schools — secure, simple, affordable.</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md"
        >
          <Card className="shadow-lg">
            <CardHeader>
              <div className="mb-1 flex items-center gap-2.5 md:hidden">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <GraduationCap className="h-5 w-5" aria-hidden />
                </div>
                <span className="text-lg font-semibold tracking-tight">SchoolDesk</span>
              </div>
              <CardTitle className="text-xl">Welcome to SchoolDesk</CardTitle>
              <CardDescription>Sign in to your school workspace, or register a new school.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="register">Register school</TabsTrigger>
                </TabsList>

                {/* Sign in */}
                <TabsContent value="signin" className="mt-5">
                  <form onSubmit={onLogin} noValidate className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@school.ng"
                        className="h-10"
                        {...loginForm.register('email')}
                      />
                      <FieldError message={loginErrors.email?.message} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="h-10"
                        {...loginForm.register('password')}
                      />
                      <FieldError message={loginErrors.password?.message} />
                    </div>
                    <Button type="submit" className="h-10 w-full" disabled={loginForm.formState.isSubmitting}>
                      {loginForm.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
                      Sign in
                    </Button>

                    <div className="rounded-lg border bg-muted/40 p-3">
                      <p className="mb-2 text-xs text-muted-foreground">
                        Demo accounts — tap to prefill (password: <span className="font-mono">{DEMO_PASSWORD}</span>):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {DEMO_ACCOUNTS.map(d => (
                          <button
                            key={d.email}
                            type="button"
                            title={d.email}
                            onClick={() => prefillDemo(d.email)}
                            className="rounded-full border bg-background px-2.5 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary"
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-center text-xs text-muted-foreground">
                      Demo school pre-seeded — just sign in with a demo chip.
                    </p>
                  </form>
                </TabsContent>

                {/* Register */}
                <TabsContent value="register" className="mt-5">
                  <form onSubmit={onRegister} noValidate className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-school">School name</Label>
                      <Input
                        id="reg-school"
                        placeholder="Crescent Heights Academy"
                        className="h-10"
                        {...registerForm.register('schoolName')}
                      />
                      <FieldError message={registerErrors.schoolName?.message} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-type">School type</Label>
                      <Controller
                        name="schoolType"
                        control={registerForm.control}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger id="reg-type" className="h-10 w-full">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {SCHOOL_TYPES.map(t => (
                                <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <FieldError message={registerErrors.schoolType?.message} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-admin">Administrator name</Label>
                      <Input
                        id="reg-admin"
                        placeholder="Mrs. Adaeze Okafor"
                        className="h-10"
                        {...registerForm.register('adminName')}
                      />
                      <FieldError message={registerErrors.adminName?.message} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-email">Email</Label>
                        <Input
                          id="reg-email"
                          type="email"
                          autoComplete="email"
                          placeholder="admin@school.ng"
                          className="h-10"
                          {...registerForm.register('email')}
                        />
                        <FieldError message={registerErrors.email?.message} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
                        <Input
                          id="reg-phone"
                          type="tel"
                          placeholder="0803 000 0000"
                          className="h-10"
                          {...registerForm.register('phone')}
                        />
                        <FieldError message={registerErrors.phone?.message} />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-password">Password</Label>
                        <Input
                          id="reg-password"
                          type="password"
                          autoComplete="new-password"
                          placeholder="Min. 8 characters"
                          className="h-10"
                          {...registerForm.register('password')}
                        />
                        <FieldError message={registerErrors.password?.message} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="reg-confirm">Confirm password</Label>
                        <Input
                          id="reg-confirm"
                          type="password"
                          autoComplete="new-password"
                          placeholder="Repeat password"
                          className="h-10"
                          {...registerForm.register('confirmPassword')}
                        />
                        <FieldError message={registerErrors.confirmPassword?.message} />
                      </div>
                    </div>
                    <Button type="submit" className="h-10 w-full" disabled={registerForm.formState.isSubmitting}>
                      {registerForm.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
                      Create school
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
