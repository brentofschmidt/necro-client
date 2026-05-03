import { supabase } from './supabase'

export type ArticleStatus = 'draft' | 'published' | 'archived'

export type Article = {
  id: string
  slug: string
  title: string
  body: string
  excerpt: string | null
  cover_url: string | null
  author_id: string | null
  status: ArticleStatus
  published_at: string | null
  created_at: string
  updated_at: string
}

export type ArticleListItem = Article & {
  author_display_name: string | null
}

const ARTICLE_COLUMNS =
  'id, slug, title, body, excerpt, cover_url, author_id, status, published_at, created_at, updated_at'

async function attachAuthors(rows: Article[]): Promise<ArticleListItem[]> {
  const ids = Array.from(
    new Set(rows.map((r) => r.author_id).filter((id): id is string => !!id)),
  )
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, author_display_name: null }))
  }
  const { data, error } = await supabase
    .schema('accounts')
    .from('users')
    .select('id, display_name')
    .in('id', ids)
  if (error) {
    console.error('Failed to load article authors:', error.message)
    return rows.map((r) => ({ ...r, author_display_name: null }))
  }
  const map = new Map(
    ((data as { id: string; display_name: string | null }[] | null) ?? []).map((u) => [
      u.id,
      u.display_name,
    ]),
  )
  return rows.map((r) => ({
    ...r,
    author_display_name: r.author_id ? map.get(r.author_id) ?? null : null,
  }))
}

export type CreateArticleInput = {
  slug: string
  title: string
  body: string
  excerpt?: string | null
  cover_url?: string | null
  status?: ArticleStatus
  published_at?: string | null
}

export type UpdateArticleInput = Partial<CreateArticleInput>

export async function listPublishedArticles(): Promise<ArticleListItem[]> {
  const { data, error } = await supabase
    .schema('content')
    .from('articles')
    .select(ARTICLE_COLUMNS)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
  if (error) {
    console.error('Failed to list articles:', error.message)
    return []
  }
  return attachAuthors((data as Article[] | null) ?? [])
}

export async function listAllArticles(): Promise<ArticleListItem[]> {
  const { data, error } = await supabase
    .schema('content')
    .from('articles')
    .select(ARTICLE_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Failed to list all articles:', error.message)
    return []
  }
  return attachAuthors((data as Article[] | null) ?? [])
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const { data, error } = await supabase
    .schema('content')
    .from('articles')
    .select(ARTICLE_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    console.error('Failed to fetch article:', error.message)
    return null
  }
  return (data as Article | null) ?? null
}

export async function createArticle(
  authorId: string,
  input: CreateArticleInput,
): Promise<Article> {
  const row = {
    author_id: authorId,
    status: 'draft' as ArticleStatus,
    ...input,
  }
  const { data, error } = await supabase
    .schema('content')
    .from('articles')
    .insert(row)
    .select(ARTICLE_COLUMNS)
    .single()
  if (error) throw error
  return data as Article
}

export async function updateArticle(
  id: string,
  patch: UpdateArticleInput,
): Promise<Article> {
  const { data, error } = await supabase
    .schema('content')
    .from('articles')
    .update(patch)
    .eq('id', id)
    .select(ARTICLE_COLUMNS)
    .single()
  if (error) throw error
  return data as Article
}

export async function deleteArticle(id: string): Promise<void> {
  const { error } = await supabase
    .schema('content')
    .from('articles')
    .delete()
    .eq('id', id)
  if (error) throw error
}
