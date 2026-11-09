'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, Columns3, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  loading?: boolean
  rowId: (row: T) => string
  searchPlaceholder?: string
  searchExtractor?: (row: T) => string
  enableColumnToggle?: boolean
  enableSelection?: boolean
  bulkActions?: (selectedRows: T[], clear: () => void) => ReactNode
  toolbar?: ReactNode
  onRowClick?: (row: T) => void
  emptyState?: ReactNode
  initialPageSize?: number
  className?: string
}

export function DataTable<T>({
  columns, data, loading, rowId,
  searchPlaceholder = 'Search…', searchExtractor,
  enableColumnToggle = true, enableSelection,
  bulkActions, toolbar, onRowClick, emptyState,
  initialPageSize = 10, className,
}: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  const filteredData = useMemo(() => {
    if (!globalFilter.trim() || !searchExtractor) return data
    const needle = globalFilter.toLowerCase()
    return data.filter(row => searchExtractor(row).toLowerCase().includes(needle))
  }, [data, globalFilter, searchExtractor])

  const allColumns = useMemo(() => {
    if (!enableSelection) return columns
    const selectCol: ColumnDef<T, unknown> = {
      id: '__select',
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all on page"
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={v => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          onCheckedChange={v => row.toggleSelected(!!v)}
          onClick={e => e.stopPropagation()}
        />
      ),
    }
    return [selectCol, ...columns]
  }, [columns, enableSelection])

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is unmemoizable by design
  const table = useReactTable({
    data: filteredData,
    columns: allColumns,
    getRowId: row => rowId(row),
    state: { sorting, columnVisibility, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: initialPageSize } },
  })

  const selectedRows = table.getSelectedRowModel().rows.map(r => r.original)

  if (loading) {
    return (
      <div className={cn('rounded-xl border', className)}>
        <div className="flex items-center gap-3 border-b p-3">
          <Skeleton className="h-9 w-full max-w-xs" />
          <div className="flex-1" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="p-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="h-4 w-4" />
              {columns.slice(0, 4).map((_, j) => (
                <Skeleton key={j} className={cn('h-4', j === 0 ? 'w-1/4' : 'w-1/6')} />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (data.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>
  }

  const pageCount = table.getPageCount()
  const pageIndex = table.getState().pagination.pageIndex

  return (
    <div className={cn('flex flex-col rounded-xl border bg-card', className)}>
      {/* toolbar */}
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
        {searchExtractor && (
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-8 h-9"
              aria-label="Search table"
            />
          </div>
        )}
        {selectedRows.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-sm">
            <span className="font-medium">{selectedRows.length} selected</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Clear selection"
              onClick={() => setRowSelection({})}>
              <X className="h-3.5 w-3.5" />
            </Button>
            {bulkActions?.(selectedRows, () => setRowSelection({}))}
          </div>
        )}
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          {toolbar}
          {enableColumnToggle && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Columns3 className="mr-1.5 h-4 w-4" aria-hidden /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table.getAllLeafColumns().filter(c => c.id !== '__select').map(col => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={v => col.toggleVisibility(!!v)}
                    onSelect={e => e.preventDefault()}
                  >
                    {typeof col.columnDef.meta === 'object' && (col.columnDef.meta as { label?: string }).label
                      ? (col.columnDef.meta as { label: string }).label
                      : (typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* table */}
      <div className="max-h-[65vh] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map(header => (
                  <TableHead key={header.id} className="whitespace-nowrap font-medium">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                        aria-label={`Sort by ${header.column.id}`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && <ChevronUp className="h-3.5 w-3.5" aria-hidden />}
                        {header.column.getIsSorted() === 'desc' && <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={allColumns.length} className="py-10 text-center text-muted-foreground">
                  No rows match your search.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={cn(onRowClick && 'cursor-pointer')}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id} className="whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* footer */}
      <div className="flex flex-col items-center justify-between gap-2 border-t p-3 text-sm text-muted-foreground sm:flex-row">
        <span>
          {selectedRows.length > 0 ? `${selectedRows.length} of ` : ''}
          {filteredData.length} row{filteredData.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">
          <span>Page {pageIndex + 1} of {Math.max(1, pageCount)}</span>
          <Button variant="outline" size="icon" className="h-8 w-8"
            disabled={pageIndex === 0} aria-label="Previous page"
            onClick={() => table.previousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8"
            disabled={pageIndex >= pageCount - 1} aria-label="Next page"
            onClick={() => table.nextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// augment column meta for labels
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends import('@tanstack/react-table').RowData, TValue> {
    label?: string
  }
}

