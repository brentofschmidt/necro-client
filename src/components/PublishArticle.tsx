import { FormEvent, useEffect, useState } from 'react'
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom'
import {
  Article,
  ArticleListItem,
  ArticleStatus,
  createArticle,
  deleteArticle,
  listAllArticles,
  updateArticle,
} from '../lib/articles'
import { isAdmin, nullIfEmpty } from '../lib/profile'
import { AuthOutletContext } from './AuthGate'

const STATUSES: ArticleStatus[] = ['draft', 'published', 'archived']

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

type FormState = {
  id: string | null
  slug: string
  title: string
  excerpt: string
  body: string
  status: ArticleStatus
  publishNow: boolean
}

const EMPTY_FORM: FormState = {
  id: null,
  slug: '',
  title: '',
  excerpt: '',
  body: '',
  status: 'draft',
  publishNow: false,
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fromArticle(article: Article): FormState {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt ?? '',
    body: article.body,
    status: article.status,
    publishNow: false,
  }
}

export function PublishArticle() {
  const ctx = useOutletContext<AuthOutletContext>()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [articles, setArticles] = useState<ArticleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(
    null,
  )
  const [autoSlug, setAutoSlug] = useState(true)
  const [searchParams, setSearchParams] = useSearchParams()
  const editId = searchParams.get('edit')

  useEffect(() => {
    if (!isAdmin(ctx.profile)) return
    let cancelled = false
    listAllArticles().then((rows) => {
      if (!cancelled) {
        setArticles(rows)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [ctx.profile])

  useEffect(() => {
    if (!editId || articles.length === 0) return
    if (form.id === editId) return
    const target = articles.find((a) => a.id === editId)
    if (target) {
      setAutoSlug(false)
      setForm(fromArticle(target))
      setMessage(null)
    }
  }, [editId, articles, form.id])

  if (!isAdmin(ctx.profile)) {
    return <Navigate to="/" replace />
  }

  const userId = ctx.session?.user?.id
  if (!userId) return null

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function onTitleChange(title: string) {
    patchForm({
      title,
      slug: autoSlug && form.id === null ? slugify(title) : form.slug,
    })
  }

  function onSlugChange(slug: string) {
    setAutoSlug(false)
    patchForm({ slug })
  }

  function startEditing(article: Article) {
    setAutoSlug(false)
    setForm(fromArticle(article))
    setMessage(null)
  }

  function resetForm() {
    setAutoSlug(true)
    setForm(EMPTY_FORM)
    setMessage(null)
    if (searchParams.has('edit')) {
      const next = new URLSearchParams(searchParams)
      next.delete('edit')
      setSearchParams(next, { replace: true })
    }
  }

  async function refreshList() {
    const rows = await listAllArticles()
    setArticles(rows)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const status: ArticleStatus = form.publishNow ? 'published' : form.status

      let published_at: string | null | undefined
      if (form.publishNow) {
        published_at = new Date().toISOString()
      } else if (status !== 'published') {
        published_at = null
      } else if (!form.id) {
        published_at = new Date().toISOString()
      } else {
        published_at = undefined // keep existing on edit
      }

      const payload = {
        slug: form.slug.trim(),
        title: form.title.trim(),
        excerpt: nullIfEmpty(form.excerpt),
        body: form.body,
        status,
        ...(published_at !== undefined ? { published_at } : {}),
      }

      if (form.id) {
        await updateArticle(form.id, payload)
        setMessage({ kind: 'info', text: 'Article updated.' })
      } else {
        await createArticle(userId!, payload)
        setMessage({ kind: 'info', text: 'Article created.' })
        resetForm()
      }
      await refreshList()
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Failed to save article.'
      setMessage({ kind: 'error', text })
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this article? This cannot be undone.')) return
    try {
      await deleteArticle(id)
      if (form.id === id) resetForm()
      await refreshList()
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Failed to delete article.'
      setMessage({ kind: 'error', text })
    }
  }

  return (
    <div className="settings-page">
      <h1 className="settings-title">Publish</h1>

      <div className="publish-layout">
        <form className="publish-form" onSubmit={onSubmit}>
          <div className="settings-section-header">
            <h2>{form.id ? 'Edit article' : 'New article'}</h2>
            <p>
              {form.id
                ? 'Updating an existing article.'
                : 'Drafts stay private; published articles appear on the home page.'}
            </p>
          </div>

          <div className="field">
            <label htmlFor="article-title">Title</label>
            <input
              id="article-title"
              value={form.title}
              onChange={(e) => onTitleChange(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="article-slug">Slug</label>
            <input
              id="article-slug"
              value={form.slug}
              onChange={(e) => onSlugChange(e.target.value)}
              pattern="[a-z0-9\-]+"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="article-excerpt">Excerpt (optional)</label>
            <textarea
              id="article-excerpt"
              value={form.excerpt}
              onChange={(e) => patchForm({ excerpt: e.target.value })}
              rows={2}
            />
          </div>

          <div className="field">
            <label htmlFor="article-body">Body</label>
            <textarea
              id="article-body"
              value={form.body}
              onChange={(e) => patchForm({ body: e.target.value })}
              rows={12}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="article-status">Status</label>
            <select
              id="article-status"
              value={form.status}
              onChange={(e) => patchForm({ status: e.target.value as ArticleStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <label className="toggle-row">
            <span className="toggle-label">
              <span className="toggle-title">Publish now</span>
              <span className="toggle-description">
                Set status to published with the current time as the publish date.
              </span>
            </span>
            <span className="toggle-switch">
              <input
                type="checkbox"
                checked={form.publishNow}
                onChange={(e) => patchForm({ publishNow: e.target.checked })}
              />
              <span className="toggle-slider" />
            </span>
          </label>

          <div className="publish-form-actions">
            <button type="submit" className="btn btn-inline" disabled={saving}>
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Create article'}
            </button>
            {form.id && (
              <button
                type="button"
                className="btn btn-ghost btn-inline"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel edit
              </button>
            )}
          </div>

          {message && <div className={`message ${message.kind}`}>{message.text}</div>}
        </form>

        <aside className="publish-list">
          <div className="settings-section-header">
            <h2>All articles</h2>
            <p>Drafts and archived items are listed here too.</p>
          </div>
          {loading ? (
            <p className="text-dim">Loading…</p>
          ) : articles.length === 0 ? (
            <p className="text-dim">No articles yet.</p>
          ) : (
            <ul className="publish-article-list">
              {articles.map((a) => (
                <li key={a.id} className="publish-article-row">
                  <div className="publish-article-info">
                    <div className="publish-article-title">{a.title}</div>
                    <div className="publish-article-sub">
                      <span className={`status-pill status-pill-${a.status}`}>{a.status}</span>
                      {a.published_at && (
                        <span className="text-dim">
                          {dateFormatter.format(new Date(a.published_at))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="publish-article-actions">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => startEditing(a)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onDelete(a.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
