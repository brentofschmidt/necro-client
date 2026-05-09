import { Fragment, ReactNode, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────────────
// DataTable — a reusable table with optional search, sorting, row-level
// navigation, and per-row expansion.
//
// Schema (columns):
//   id          — stable column identifier (used as React key + sort target)
//   header      — header label
//   cell        — render function for the cell body
//   align?      — 'left' (default) | 'right'
//   sortKey?    — (row) => string | number — when present, the column header
//                 becomes a button that toggles sort on click. Strings should
//                 be lowercased here if you want case-insensitive ordering.
//
// Search:    searchKeys: (row) => string[]         — hides the field if omitted.
// Sort:      defaultSort: { columnId, direction }  — initial sort. After any
//                                                    user click, manual sort
//                                                    takes over.
// Loading:   pass rows={null}.
// Expansion: expandedContent: (row) => ReactNode   — when set, each row gets
//                                                    a chevron column on the
//                                                    left. Clicking the row
//                                                    toggles a panel below
//                                                    showing detail content.
//                                                    rowHref is ignored when
//                                                    expansion is enabled.
//            isExpandable: (row) => boolean         — optional per-row gate.
//                                                    Rows where this returns
//                                                    false skip the chevron
//                                                    and the click handler;
//                                                    the chevron column is
//                                                    still reserved so other
//                                                    rows align. Useful for
//                                                    tables where some rows
//                                                    have no detail to show.
// ─────────────────────────────────────────────────────────────────────────────

export type DataTableColumn<T> = {
  id: string
  header: string
  cell: (row: T) => ReactNode
  align?: 'left' | 'right'
  sortKey?: (row: T) => string | number
}

export type DataTableSort = {
  columnId: string
  direction: 'asc' | 'desc'
}

export type DataTableProps<T> = {
  rows: T[] | null
  columns: DataTableColumn<T>[]
  rowKey: (row: T) => string
  rowHref?: (row: T) => string
  rowAriaLabel?: (row: T) => string
  searchPlaceholder?: string
  searchKeys?: (row: T) => string[]
  emptyText?: string
  loadingText?: string
  noResultsText?: string
  defaultSort?: DataTableSort
  expandedContent?: (row: T) => ReactNode
  isExpandable?: (row: T) => boolean
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.5-4.5" />
    </svg>
  )
}

function SortIndicator({ direction }: { direction: 'asc' | 'desc' | null }) {
  // Single arrow when sorted, faint up/down pair when sortable but inactive.
  if (direction === 'asc') {
    return (
      <span className="data-table-sort-icon data-table-sort-icon-active" aria-hidden="true">
        <svg viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6l4-4 4 4" />
        </svg>
      </span>
    )
  }
  if (direction === 'desc') {
    return (
      <span className="data-table-sort-icon data-table-sort-icon-active" aria-hidden="true">
        <svg viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 2l4 4 4-4" />
        </svg>
      </span>
    )
  }
  return (
    <span className="data-table-sort-icon" aria-hidden="true">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5l3-3 3 3" />
        <path d="M3 7l3 3 3-3" />
      </svg>
    </span>
  )
}

function ExpandIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`data-row-expand-icon${open ? ' data-row-expand-icon-open' : ''}`}
      aria-hidden="true"
    >
      <path d="M3 4l3 3 3-3" />
    </svg>
  )
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  rowAriaLabel,
  searchPlaceholder,
  searchKeys,
  emptyText = 'No items.',
  loadingText = 'Loading…',
  noResultsText = 'No matches.',
  defaultSort,
  expandedContent,
  isExpandable,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<DataTableSort | undefined>(defaultSort)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const trimmed = query.trim().toLowerCase()

  // Expansion takes priority over rowHref — having both would mean a row
  // click is ambiguous. If you want both, give the table only one of them.
  const useExpand = !!expandedContent
  const useHref = !useExpand && !!rowHref

  const filtered = useMemo(() => {
    if (rows == null) return null
    if (!trimmed || !searchKeys) return rows
    return rows.filter((r) =>
      searchKeys(r).some((k) => k.toLowerCase().includes(trimmed)),
    )
  }, [rows, trimmed, searchKeys])

  const sortedAndFiltered = useMemo(() => {
    if (!filtered || !sort) return filtered
    const col = columns.find((c) => c.id === sort.columnId)
    if (!col?.sortKey) return filtered
    const dir = sort.direction === 'asc' ? 1 : -1
    const get = col.sortKey
    return [...filtered].sort((a, b) => {
      const av = get(a)
      const bv = get(b)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [filtered, sort, columns])

  function toggleSort(columnId: string) {
    setSort((prev) => {
      if (prev?.columnId !== columnId) {
        return { columnId, direction: 'asc' }
      }
      return {
        columnId,
        direction: prev.direction === 'asc' ? 'desc' : 'asc',
      }
    })
  }

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const totalCols = columns.length + (useExpand ? 1 : 0)

  return (
    <div className="data-table-wrap">
      {searchKeys && (
        <div className="data-table-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder ?? 'Search…'}
            aria-label={searchPlaceholder ?? 'Search'}
          />
          {query !== '' && (
            <button
              type="button"
              className="data-table-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      {sortedAndFiltered === null ? (
        <p className="text-dim">{loadingText}</p>
      ) : rows !== null && rows.length === 0 ? (
        <p className="text-dim">{emptyText}</p>
      ) : sortedAndFiltered.length === 0 ? (
        <p className="text-dim">{noResultsText}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              {useExpand && <th className="data-table-expand-col" aria-hidden="true" />}
              {columns.map((c) => {
                const sortable = !!c.sortKey
                const active = sortable && sort?.columnId === c.id
                const direction = active ? sort!.direction : null
                const className = c.align === 'right' ? 'col-numeric' : undefined
                if (!sortable) {
                  return (
                    <th key={c.id} className={className}>
                      {c.header}
                    </th>
                  )
                }
                return (
                  <th key={c.id} className={className}>
                    <button
                      type="button"
                      className="data-table-sort-btn"
                      onClick={() => toggleSort(c.id)}
                      aria-sort={
                        active
                          ? direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <span>{c.header}</span>
                      <SortIndicator direction={direction} />
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedAndFiltered.map((row) => {
              const key = rowKey(row)
              const rowExpandable = useExpand && (isExpandable?.(row) ?? true)
              const expanded = rowExpandable && expandedKeys.has(key)
              return (
                <Fragment key={key}>
                  <tr
                    className={
                      'data-row' +
                      (rowExpandable ? ' data-row-expandable' : '') +
                      (expanded ? ' data-row-expanded' : '') +
                      (useExpand && !rowExpandable ? ' data-row-inert' : '')
                    }
                    onClick={rowExpandable ? () => toggleExpanded(key) : undefined}
                    aria-expanded={rowExpandable ? expanded : undefined}
                  >
                    {useExpand && (
                      <td className="data-table-expand-col">
                        {rowExpandable && <ExpandIcon open={expanded} />}
                      </td>
                    )}
                    {columns.map((col, i) => {
                      const numeric = col.align === 'right'
                      const isFirst = i === 0
                      if (isFirst && useHref) {
                        return (
                          <td
                            key={col.id}
                            className={`data-cell-anchor${numeric ? ' col-numeric' : ''}`}
                          >
                            <Link
                              to={rowHref!(row)}
                              className="data-row-anchor"
                              aria-label={rowAriaLabel?.(row) ?? ''}
                            />
                            {col.cell(row)}
                          </td>
                        )
                      }
                      return (
                        <td
                          key={col.id}
                          className={numeric ? 'col-numeric' : undefined}
                        >
                          {col.cell(row)}
                        </td>
                      )
                    })}
                  </tr>
                  {expanded && expandedContent && (
                    <tr className="data-row-expansion">
                      <td
                        colSpan={totalCols}
                        className="data-row-expansion-cell"
                      >
                        {expandedContent(row)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
