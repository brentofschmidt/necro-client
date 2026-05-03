import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import {
  ArticleListItem,
  deleteArticle,
  listPublishedArticles,
  updateArticle,
} from '../lib/articles'
import { isAdmin } from '../lib/profile'
import { AuthOutletContext } from './AuthGate'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'long',
  timeStyle: 'short',
})

function authorNameOf(article: ArticleListItem): string {
  return article.author_display_name?.trim() || 'Necronet'
}

function paragraphsOf(body: string): string[] {
  return body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
}

function EllipsisIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  )
}

export function Home() {
  const ctx = useOutletContext<AuthOutletContext>()
  const navigate = useNavigate()
  const [articles, setArticles] = useState<ArticleListItem[] | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuContainerRef = useRef<HTMLDivElement>(null)

  const admin = isAdmin(ctx.profile)

  useEffect(() => {
    let cancelled = false
    listPublishedArticles().then((rows) => {
      if (!cancelled) setArticles(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!openMenuId) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (!menuContainerRef.current?.contains(target)) {
        setOpenMenuId(null)
        return
      }
      const wrapper = (target as HTMLElement).closest?.('.article-menu')
      if (!wrapper) setOpenMenuId(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [openMenuId])

  async function refresh() {
    const rows = await listPublishedArticles()
    setArticles(rows)
  }

  function onEdit(article: ArticleListItem) {
    setOpenMenuId(null)
    navigate(`/publish?edit=${article.id}`)
  }

  async function onArchive(article: ArticleListItem) {
    setOpenMenuId(null)
    if (!confirm(`Archive "${article.title}"? It will be hidden from the home page.`)) return
    try {
      await updateArticle(article.id, { status: 'archived' })
      await refresh()
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Failed to archive article.'
      alert(text)
    }
  }

  async function onDelete(article: ArticleListItem) {
    setOpenMenuId(null)
    if (!confirm(`Delete "${article.title}"? This cannot be undone.`)) return
    try {
      await deleteArticle(article.id)
      await refresh()
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Failed to delete article.'
      alert(text)
    }
  }

  return (
    <div className="home-page">
      <section className="news-section">
        <header className="news-header">
          <h1 className="news-title">News</h1>
        </header>
        {articles === null ? (
          <p className="news-empty">Loading…</p>
        ) : articles.length === 0 ? (
          <p className="news-empty">No articles yet.</p>
        ) : (
          <div className="news-list" ref={menuContainerRef}>
            {articles.map((article) => (
              <article key={article.id} className="news-article">
                {admin && (
                  <div className="article-menu">
                    <button
                      type="button"
                      className="article-menu-trigger"
                      aria-label="Article actions"
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === article.id}
                      onClick={() =>
                        setOpenMenuId((prev) => (prev === article.id ? null : article.id))
                      }
                    >
                      <EllipsisIcon />
                    </button>
                    {openMenuId === article.id && (
                      <div className="article-menu-dropdown" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="article-menu-item"
                          onClick={() => onEdit(article)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="article-menu-item"
                          onClick={() => onArchive(article)}
                        >
                          Archive
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="article-menu-item article-menu-item-danger"
                          onClick={() => onDelete(article)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <h2 className="news-article-title">{article.title}</h2>
                <div className="news-article-meta">
                  {article.author_id ? (
                    <Link
                      to={`/u/${article.author_id}`}
                      className="news-article-author news-article-author-link"
                    >
                      {authorNameOf(article)}
                    </Link>
                  ) : (
                    <span className="news-article-author">{authorNameOf(article)}</span>
                  )}
                  <span className="news-article-dot">·</span>
                  {article.published_at && (
                    <time dateTime={article.published_at}>
                      {dateFormatter.format(new Date(article.published_at))}
                    </time>
                  )}
                </div>
                <div className="news-article-body">
                  {paragraphsOf(article.body).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
