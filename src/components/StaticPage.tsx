import { ReactNode } from 'react'

type Props = {
  title: string
  lede?: string
  children: ReactNode
}

export function StaticPage({ title, lede, children }: Props) {
  return (
    <div className="static-page">
      <header className="static-page-header">
        <h1 className="static-page-title">{title}</h1>
        {lede && <p className="static-page-lede">{lede}</p>}
      </header>
      <div className="static-page-body">{children}</div>
    </div>
  )
}
