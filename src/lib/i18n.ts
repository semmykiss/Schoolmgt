// Lightweight i18n starter (Phase 10 stubs).
//
// English is the source of truth. Nigerian-language packs ship as starter
// stubs for the most common chrome strings — schools localise the core UI
// by choosing a locale in School Settings (stored on the school record).
// Extending coverage is additive: add keys to `en`, then translate per pack.

export interface LocaleOption {
  code: string
  label: string
  native: string
}

export const LOCALES: LocaleOption[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ha', label: 'Hausa', native: 'Hausa' },
  { code: 'yo', label: 'Yoruba', native: 'Yorùbá' },
  { code: 'ig', label: 'Igbo', native: 'Igbo' },
]

const en = {
  dashboard: 'Dashboard',
  students: 'Students',
  staff: 'Staff',
  attendance: 'Attendance',
  fees: 'Fees',
  exams: 'Exams',
  reports: 'Reports',
  settings: 'Settings',
  calendar: 'Calendar',
  homework: 'Homework',
  library: 'Library',
  announcements: 'Announcements',
  payments: 'Payments',
  classes: 'Classes',
  save: 'Save',
  cancel: 'Cancel',
  search: 'Search',
  welcome: 'Welcome',
  signOut: 'Sign out',
  notifications: 'Notifications',
} as const

export type I18nKey = keyof typeof en

// Starter packs — approximate translations for common school words.
const packs: Record<string, Partial<Record<I18nKey, string>>> = {
  ha: {
    students: 'Dalibai',
    staff: "Ma'aikata",
    attendance: 'Halarta',
    fees: 'Kudade',
    exams: 'Jarrabawa',
    reports: 'Rahotanni',
    settings: 'Saituna',
    calendar: 'Kalandar',
    homework: 'Aikin Gida',
    library: 'Laburare',
    announcements: 'Sanarwa',
    payments: 'Biyan Kudi',
    classes: 'Darussa',
    save: 'Ajiye',
    cancel: 'Soke',
    search: 'Bincike',
    welcome: 'Barka da zuwa',
    signOut: 'Fita',
    notifications: 'Sanarwomi',
  },
  yo: {
    students: 'Akekoo',
    staff: 'Awon Osiise',
    attendance: 'Iwole',
    fees: 'Owo',
    exams: 'Idanwo',
    reports: 'Iroyin',
    settings: 'Eto',
    calendar: 'Kalenda',
    homework: 'Ise Ile',
    library: 'Ile Ikawe',
    announcements: 'Ikedapo',
    payments: 'Ikowo Owo',
    classes: 'Awon Kilasi',
    save: 'Fipamo',
    cancel: 'Fagile',
    search: 'Sawari',
    welcome: 'Ekabo',
    signOut: 'Jade',
    notifications: 'Ikilo',
  },
  ig: {
    students: 'Umu Akwukwo',
    staff: 'Ndi Oru',
    attendance: 'Ubi',
    fees: 'Ego',
    exams: 'Ule',
    reports: 'Akuko',
    settings: 'Ntoala',
    calendar: 'Kalenda',
    homework: 'Oru Ulo',
    library: 'Ulo Akwukwo',
    announcements: 'Nkwuputa',
    payments: 'Ukwu Ego',
    classes: 'Aha Ndu',
    save: 'Chekwa',
    cancel: 'Kagbuo',
    search: 'Choo',
    welcome: 'Nnoo',
    signOut: 'Puo',
    notifications: 'Ozi',
  },
}

export function t(locale: string | null | undefined, key: I18nKey): string {
  if (!locale || locale === 'en') return en[key]
  return packs[locale]?.[key] ?? en[key]
}

export function localeLabel(code: string | null | undefined): string {
  return LOCALES.find(l => l.code === code)?.native ?? 'English'
}
