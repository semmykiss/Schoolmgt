import {
  LayoutDashboard, ClipboardList, GraduationCap, BriefcaseBusiness, BookOpen,
  CalendarRange, ClipboardCheck, FileSpreadsheet, NotebookPen, Wallet, Landmark,
  Package, Library, Megaphone, CalendarDays, MessageSquareText, BarChart3,
  Users, ShieldCheck, ScrollText, Settings2, Braces, type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  key: string           // route segment, e.g. "students" → #/students
  label: string
  icon: LucideIcon
  phase: number         // build phase that delivers this module
  permission?: string   // hide if user lacks it
  badgeKey?: 'notifications'
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, phase: 0 },
    ],
  },
  {
    label: 'People',
    items: [
      { key: 'admissions', label: 'Admissions', icon: ClipboardList, phase: 2, permission: 'admissions.read' },
      { key: 'students', label: 'Students', icon: GraduationCap, phase: 2, permission: 'students.read' },
      { key: 'staff', label: 'Staff & HR', icon: BriefcaseBusiness, phase: 8, permission: 'hr.read' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { key: 'academic', label: 'Academic Setup', icon: BookOpen, phase: 1, permission: 'academic.read' },
      { key: 'timetable', label: 'Timetable', icon: CalendarRange, phase: 3, permission: 'timetable.read' },
      { key: 'attendance', label: 'Attendance', icon: ClipboardCheck, phase: 3, permission: 'attendance.read' },
      { key: 'exams', label: 'Exams & Grades', icon: FileSpreadsheet, phase: 5, permission: 'exams.read' },
      { key: 'homework', label: 'Homework', icon: NotebookPen, phase: 6, permission: 'assignments.read' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { key: 'fees', label: 'Fees & Billing', icon: Wallet, phase: 4, permission: 'fees.read' },
      { key: 'accounts', label: 'Accounts & Ledger', icon: Landmark, phase: 4, permission: 'accounts.read' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'inventory', label: 'Inventory', icon: Package, phase: 9, permission: 'inventory.read' },
      { key: 'library', label: 'Library', icon: Library, phase: 9, permission: 'inventory.read' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { key: 'announcements', label: 'Announcements', icon: Megaphone, phase: 7, permission: 'communication.read' },
      { key: 'calendar', label: 'Event Calendar', icon: CalendarDays, phase: 7, permission: 'communication.read' },
      { key: 'messages', label: 'Message Centre', icon: MessageSquareText, phase: 7, permission: 'communication.read' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { key: 'reports', label: 'Reports & Analytics', icon: BarChart3, phase: 10, permission: 'reports.read' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { key: 'users', label: 'Users', icon: Users, phase: 0, permission: 'users.read' },
      { key: 'roles', label: 'Roles & Permissions', icon: ShieldCheck, phase: 0, permission: 'roles.read' },
      { key: 'audit', label: 'Audit Log', icon: ScrollText, phase: 10, permission: 'audit.read' },
      { key: 'settings', label: 'School Settings', icon: Settings2, phase: 10, permission: 'settings.read' },
      { key: 'api-docs', label: 'API Explorer', icon: Braces, phase: 0 },
    ],
  },
]

export const MODULES: Record<string, NavItem> = Object.fromEntries(
  NAV_GROUPS.flatMap(g => g.items).map(i => [i.key, i]),
)

/** Phases delivered so far — nav phase badges only show for unbuilt modules. */
export const BUILT_PHASES = new Set([0, 1, 2, 3, 4, 5, 6])

/** What each phase delivers — powers the "coming soon" views. */
export const PHASE_CONTENT: Record<number, { title: string; bullets: string[] }> = {
  1: { title: 'Academic Setup', bullets: ['Sessions & terms', 'Classes, sections & form teachers', 'Subjects & teacher assignment', 'Syllabus / lesson plans', 'Promotions'] },
  2: { title: 'Admissions & Students', bullets: ['Online application form', 'Applicant pipeline (Applied → Interview → Admitted)', 'Convert applicant to student', 'Profiles, guardians & siblings', 'CSV import/export & ID cards'] },
  3: { title: 'Timetable & Attendance', bullets: ['Period setup', 'Class & teacher timetables with clash detection', 'Daily & per-period attendance', 'Staff attendance', 'Monthly reports & parent alerts'] },
  4: { title: 'Fees & Accounts', bullets: ['Fee structures per class', 'Invoices, instalments & discounts', 'Receipts & online payments (Paystack/Flutterwave)', 'Defaulters list', 'Income/expense ledger'] },
  5: { title: 'Exams & Report Cards', bullets: ['Exam types & schedules', 'Grading scales', 'Marks entry with auto-grading', 'Broadsheet & class positions', 'Branded printable report cards'] },
  6: { title: 'Portals & Homework', bullets: ['Parent portal', 'Student portal', 'Homework posting & due dates', 'Attendance/results/fees at a glance'] },
  7: { title: 'Communication', bullets: ['Announcements', 'Event calendar', 'SMS/Email/WhatsApp templates', 'Delivery logs'] },
  8: { title: 'Staff & HR', bullets: ['Employee records', 'Salary structures', 'Payslips', 'Leave requests'] },
  9: { title: 'Inventory & Library', bullets: ['Items & stock movements', 'Suppliers', 'Book catalogue', 'Issuing & returns with fines'] },
  10: { title: 'Reports & Administration', bullets: ['Attendance/academic/financial analytics', 'Saved filters & scheduled exports', 'Audit log viewer', 'School branding & settings', 'Backups & i18n'] },
}
