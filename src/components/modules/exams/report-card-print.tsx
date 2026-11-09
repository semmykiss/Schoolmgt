'use client'

import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer } from 'lucide-react'
import { api, qk } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtNum } from './exam-helpers'

// ── Print payload shapes ────────────────────────────────────────────────────
interface PrintPayload {
  card: {
    id: string; totalScore: number; average: number; position: number
    grade: string | null; attendanceSummary: string | null
    teacherRemark: string | null; principalRemark: string | null; published: boolean
  }
  student: {
    id: string; admissionNumber: string; firstName: string; lastName: string; otherName: string | null; gender: string
    class: { name: string } | null
    section: { name: string } | null
  }
  exam: {
    id: string; name: string
    term: { name: string; startDate: string; endDate: string; session: { name: string } }
    examType: { name: string }
  }
  school: {
    name: string; address: string | null; city: string | null; state: string | null
    phone: string | null; email: string | null; logoUrl: string | null; motto: string | null
    primaryColor: string; secondaryColor: string
  } | null
  classSize: number
  subjects: {
    subject: string; subjectCode: string | null
    marksObtained: number; maxMarks: number; absent: boolean; grade: string | null; remark: string | null
    teacher: string | null
  }[]
  bands: { grade: string; minScore: number; maxScore: number; remark: string }[]
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function ReportCardPrint({ examId, studentId, onClose }: {
  examId: string
  studentId: string
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: qk.reportCard(examId, studentId),
    queryFn: () => api<PrintPayload>('/report-cards', { query: { examId, studentId } }),
  })

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="Report card print preview" onClick={onClose}>
      <div className="mx-auto w-full max-w-3xl" onClick={e => e.stopPropagation()}>
        {/* toolbar — hidden when printing */}
        <div className="mb-2 flex items-center justify-end gap-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer aria-hidden /> Print / Save PDF
          </Button>
        </div>

        <div id="print-area" className="rounded-xl bg-white text-black shadow-2xl print:rounded-none print:shadow-none">
          {!data || isLoading ? (
            <div className="space-y-4 p-10">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-24 w-full" />
              <span className="flex items-center gap-2 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparing report card…
              </span>
            </div>
          ) : (
            <CardBody data={data} />
          )}
        </div>
      </div>
    </div>
  )
}

function CardBody({ data }: { data: PrintPayload }) {
  const { card, student, exam, school, classSize, subjects, bands } = data
  const primary = school?.primaryColor ?? '#0F766E'
  const fullName = [student.firstName, student.otherName, student.lastName].filter(Boolean).join(' ')

  return (
    <div className="p-6 sm:p-10" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
      {/* ── Letterhead ── */}
      <header className="flex items-center gap-4 border-b-4 pb-4" style={{ borderColor: primary }}>
        {school?.logoUrl ? (
          <img src={school.logoUrl} alt={`${school.name} logo`} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
            style={{ backgroundColor: primary }} aria-hidden
          >
            {(school?.name ?? 'SD').slice(0, 1)}
          </div>
        )}
        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-xl font-bold uppercase tracking-wide sm:text-2xl">{school?.name ?? 'School'}</h1>
          {school?.motto && <p className="text-xs italic text-neutral-600">“{school.motto}”</p>}
          <p className="mt-0.5 text-xs text-neutral-600">
            {[school?.address, school?.city, school?.state].filter(Boolean).join(', ') || '—'}
          </p>
          <p className="text-xs text-neutral-600">
            {[school?.phone, school?.email].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>

      {/* ── Title bar ── */}
      <div className="my-4 text-center">
        <h2 className="inline-block border-2 px-6 py-1.5 text-lg font-bold uppercase tracking-widest" style={{ borderColor: primary, color: primary }}>
          Term Report Sheet
        </h2>
        <p className="mt-1 text-sm text-neutral-700">
          {exam.examType.name} · {exam.term.session.name} Session
        </p>
      </div>

      {/* ── Bio grid ── */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 border-y py-3 text-sm sm:grid-cols-3">
        <BioItem label="Student" value={fullName} />
        <BioItem label="Admission No" value={student.admissionNumber} mono />
        <BioItem label="Gender" value={student.gender === 'MALE' ? 'Male' : student.gender === 'FEMALE' ? 'Female' : student.gender} />
        <BioItem label="Class" value={[student.class?.name, student.section ? `Section ${student.section.name}` : null].filter(Boolean).join(' · ') || '—'} />
        <BioItem label="Term" value={exam.term.name.replace('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())} />
        <BioItem label="Term Ends" value={exam.term.endDate} mono />
      </dl>

      {/* ── Scores table ── */}
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr style={{ backgroundColor: `${primary}18` }}>
            <th scope="col" className="border px-2 py-1.5 text-left font-semibold">Subject</th>
            <th scope="col" className="border px-2 py-1.5 text-center font-semibold">Score</th>
            <th scope="col" className="border px-2 py-1.5 text-center font-semibold">Out of</th>
            <th scope="col" className="border px-2 py-1.5 text-center font-semibold">Grade</th>
            <th scope="col" className="border px-2 py-1.5 text-left font-semibold">Remark</th>
            <th scope="col" className="border px-2 py-1.5 text-left font-semibold">Teacher</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => (
            <tr key={i} className={i % 2 ? 'bg-neutral-50' : ''}>
              <td className="border px-2 py-1.5">{s.subject}</td>
              <td className="border px-2 py-1.5">
                {s.absent ? <span title="Absent">AB</span> : <span className="font-semibold tabular-nums">{s.marksObtained}</span>}
              </td>
              <td className="border px-2 py-1.5 text-center tabular-nums">{s.maxMarks}</td>
              <td className="border px-2 py-1.5 text-center font-bold" style={{ color: gradeColor(s.grade, primary) }}>{s.grade ?? '—'}</td>
              <td className="border px-2 py-1.5">{s.remark ?? ''}</td>
              <td className="border px-2 py-1.5 text-xs text-neutral-600">{s.teacher ?? ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold" style={{ backgroundColor: `${primary}18` }}>
            <td className="border px-2 py-1.5">Total</td>
            <td className="border px-2 py-1.5 text-center tabular-nums">{Math.round(card.totalScore)}</td>
            <td className="border px-2 py-1.5 text-center tabular-nums">{subjects.reduce((n, s) => n + s.maxMarks, 0)}</td>
            <td className="border px-2 py-1.5 text-center">{card.grade ?? ''}</td>
            <td className="border px-2 py-1.5 text-sm font-normal">Average: {fmtNum(card.average, 2)}%</td>
            <td className="border px-2 py-1.5" />
          </tr>
        </tfoot>
      </table>

      {/* ── Summary boxes ── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryBox label="Position" value={`${ordinal(card.position)} of ${classSize}`} accent={primary} />
        <SummaryBox label="Average" value={`${fmtNum(card.average, 2)}%`} accent={primary} />
        <SummaryBox label="Overall Grade" value={card.grade ?? '—'} accent={primary} />
        <SummaryBox label="Attendance" value={card.attendanceSummary ?? '—'} accent={primary} />
      </div>

      {/* ── Remarks ── */}
      <div className="mt-4 space-y-2 text-sm">
        <p><span className="font-semibold" style={{ color: primary }}>Form Teacher&apos;s Remark: </span>{card.teacherRemark ?? '—'}</p>
        <p><span className="font-semibold" style={{ color: primary }}>Principal&apos;s Remark: </span>{card.principalRemark ?? '—'}</p>
      </div>

      {/* ── Grading key + signatures ── */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Grading Key</p>
          <div className="flex flex-wrap gap-1.5">
            {bands.map(b => (
              <span key={b.grade} className="rounded border px-1.5 py-0.5 text-xs">
                <b>{b.grade}</b> {b.minScore}–{b.maxScore} {b.remark}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-end justify-between gap-6 text-xs text-neutral-600">
          <div className="w-40 border-t border-neutral-400 pt-1 text-center">Form Teacher</div>
          <div className="w-40 border-t border-neutral-400 pt-1 text-center">Principal</div>
        </div>
      </div>

      <p className="mt-4 text-center text-[10px] uppercase tracking-widest text-neutral-400">
        Powered by SchoolDesk · {card.published ? 'Published result' : 'Unpublished draft'}
      </p>
    </div>
  )
}

function BioItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className={`font-semibold ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

function SummaryBox({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border p-2.5 text-center" style={{ borderColor: `${accent}55` }}>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-base font-bold" style={{ color: accent }}>{value}</p>
    </div>
  )
}

function gradeColor(grade: string | null, accent: string): string {
  if (!grade) return '#000'
  if (grade.startsWith('A') || grade.startsWith('B')) return accent
  if (grade.startsWith('C') || grade.startsWith('D')) return '#B45309'
  return '#DC2626'
}
