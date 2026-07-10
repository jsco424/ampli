'use client'

import { useEffect, useState, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import {
  BarChart2,
  Search,
  Plus,
  Trash2,
  Clock,
  CheckCircle,
  ArrowRight,
  FolderPlus,
  Folder,
  ChevronDown,
  Filter,
  Tag,
  X,
  Check,
} from 'lucide-react'
import Link from 'next/link'
import UndoToast from '@/components/UndoToast'
import DeleteModal from '@/components/DeleteModal'
import { getTagColor } from '@/components/TagInput'

const STATUS_OPTIONS = ['All', 'Completed', 'Processing']
const SORT_OPTIONS = ['Newest', 'Oldest', 'A–Z', 'Z–A']

export default function ProjectsPage() {
  const { user, isLoaded } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sort, setSort] = useState('Newest')
  const [showSort, setShowSort] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folders, setFolders] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [showTagFilter, setShowTagFilter] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const tagFilterRef = useRef<HTMLDivElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string }[] | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; names: string } | null>(null)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  const loadProjects = () => {
    if (!user) return
    supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProjects(data || [])
        const f = [...new Set((data || []).map((p: any) => p.folder).filter(Boolean))] as string[]
        setFolders(f)
        setLoading(false)
      })
  }

  useEffect(() => {
    loadProjects()
  }, [user])

  useEffect(() => {
    if (!projects.some((p) => p.status === 'processing')) return
    const interval = setInterval(loadProjects, 5000)
    return () => clearInterval(interval)
  }, [projects])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!tagFilterRef.current?.contains(e.target as Node)) setShowTagFilter(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const allTags = [...new Set(projects.flatMap((p) => p.tags || []))].sort()
  const filteredTagOptions = tagSearch
    ? allTags.filter((t) => t.includes(tagSearch.toLowerCase()))
    : allTags

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedIds((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const requestDelete = (ids: string[], e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    setDeleteModal(
      projects.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, name: p.name }))
    )
  }

  const handleDeleteConfirm = (ids: string[]) => {
    const names = projects
      .filter((p) => ids.includes(p.id))
      .map((p) => p.name)
      .join(', ')
    setProjects((p) => p.filter((x) => !ids.includes(x.id)))
    setSelectedIds(new Set())
    setSelectMode(false)
    setDeleteModal(null)
    setPendingDelete({ ids, names: ids.length === 1 ? names : `${ids.length} projects` })
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    for (const id of pendingDelete.ids) await supabase.from('projects').delete().eq('id', id)
    setPendingDelete(null)
  }

  const undoDelete = () => {
    if (!pendingDelete) return
    loadProjects()
    setPendingDelete(null)
  }

  const createFolder = () => {
    if (!newFolderName.trim()) return
    setFolders((f) => [...new Set([...f, newFolderName.trim()])])
    setNewFolderName('')
    setShowFolderModal(false)
  }

  let filtered = projects.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.file_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || p.status === statusFilter.toLowerCase()
    const matchFolder = selectedFolder === null || p.folder === selectedFolder
    const matchTag = selectedTag === null || (p.tags || []).includes(selectedTag)
    return matchSearch && matchStatus && matchFolder && matchTag
  })

  filtered = [...filtered].sort((a, b) => {
    if (sort === 'Newest')
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (sort === 'Oldest')
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (sort === 'A–Z') return a.name.localeCompare(b.name)
    if (sort === 'Z–A') return b.name.localeCompare(a.name)
    return 0
  })

  // ── Token-based styles ──────────────────────────────────────────────────────
  const base = dark ? 'bg-[#0a0a0f] text-white' : 'bg-[#f8f8fa] text-zinc-900'
  const card = dark ? 'bg-[#111118] border-white/[0.07]' : 'bg-white border-zinc-200'
  const input = dark
    ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder-white/25'
    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
  const muted = dark ? 'text-white/40' : 'text-zinc-500'
  const dropdown = dark ? 'bg-[#111118] border-white/[0.08]' : 'bg-white border-zinc-200'

  if (!isLoaded || !user) return null

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />

      {deleteModal && (
        <DeleteModal
          projects={deleteModal}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteModal(null)}
        />
      )}
      {pendingDelete && (
        <UndoToast
          projectName={pendingDelete.names}
          onUndo={undoDelete}
          onConfirm={confirmDelete}
        />
      )}

      <main className="pt-20 px-6 max-w-5xl mx-auto pb-20">
        {/* Header */}
        <div className="mt-8 mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1 tracking-tight">My Projects</h1>
            <p className={`text-sm ${muted}`}>
              {projects.length} project{projects.length !== 1 ? 's' : ''} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectMode(!selectMode)
                setSelectedIds(new Set())
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors
                ${
                  selectMode
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                    : dark
                      ? 'border-white/[0.08] text-white/40 hover:bg-white/[0.04]'
                      : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                }`}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
            {selectMode && selectedIds.size > 0 && (
              <button
                onClick={() => requestDelete([...selectedIds])}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-400 transition-colors"
              >
                <Trash2 size={13} /> Delete ({selectedIds.size})
              </button>
            )}
            <Link
              href="/projects/new"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 transition-colors"
            >
              <Plus size={14} /> New Project
            </Link>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-44 shrink-0 space-y-0.5">
            <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${muted}`}>
              Folders
            </p>
            {[
              { label: 'All Projects', icon: BarChart2, value: null },
              ...folders.map((f) => ({ label: f, icon: Folder, value: f })),
            ].map(({ label, icon: Icon, value }) => (
              <button
                key={label}
                onClick={() => setSelectedFolder(value)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors truncate
                  ${
                    selectedFolder === value
                      ? 'bg-blue-500/10 text-blue-400 font-medium'
                      : dark
                        ? 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                        : 'text-zinc-500 hover:bg-zinc-100'
                  }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
            <button
              onClick={() => setShowFolderModal(true)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors mt-1
                ${dark ? 'text-white/25 hover:text-white/50 hover:bg-white/[0.04]' : 'text-zinc-400 hover:bg-zinc-100'}`}
            >
              <FolderPlus size={13} /> New Folder
            </button>
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0">
            {/* Search + filters */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <div
                className={`flex items-center gap-2 flex-1 min-w-40 px-3 py-2 rounded-lg border ${input}`}
              >
                <Search size={13} className={muted} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="flex-1 bg-transparent outline-none text-sm"
                />
              </div>

              {/* Status */}
              <div className="flex gap-1">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                      ${statusFilter === s ? 'bg-blue-500 text-white' : dark ? 'bg-white/[0.04] text-white/40 hover:bg-white/[0.07]' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Tag filter */}
              {allTags.length > 0 && (
                <div ref={tagFilterRef} className="relative">
                  <button
                    onClick={() => {
                      setShowTagFilter(!showTagFilter)
                      setTagSearch('')
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                      ${
                        selectedTag
                          ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                          : dark
                            ? 'border-white/[0.08] text-white/40 hover:bg-white/[0.04]'
                            : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                      }`}
                  >
                    <Tag size={11} />
                    {selectedTag || 'Tag'}
                    {selectedTag ? (
                      <span
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          setSelectedTag(null)
                        }}
                        className="cursor-pointer hover:opacity-60"
                      >
                        <X size={10} />
                      </span>
                    ) : (
                      <ChevronDown size={10} />
                    )}
                  </button>
                  {showTagFilter && (
                    <div
                      className={`absolute right-0 top-full mt-1 rounded-xl border shadow-2xl z-20 overflow-hidden w-52 ${dropdown}`}
                    >
                      <div
                        className={`p-2 border-b ${dark ? 'border-white/[0.06]' : 'border-zinc-100'}`}
                      >
                        <input
                          value={tagSearch}
                          onChange={(e) => setTagSearch(e.target.value)}
                          placeholder="Search tags..."
                          autoFocus
                          className={`w-full px-3 py-1.5 rounded-lg border text-xs outline-none ${input}`}
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {filteredTagOptions.length === 0 ? (
                          <p className={`px-3 py-2 text-xs ${muted}`}>No tags found</p>
                        ) : (
                          filteredTagOptions.map((tag) => (
                            <button
                              key={tag}
                              onClick={() => {
                                setSelectedTag(selectedTag === tag ? null : tag)
                                setShowTagFilter(false)
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${dark ? 'hover:bg-white/[0.04]' : 'hover:bg-zinc-50'}`}
                            >
                              <span
                                className={`px-2 py-0.5 rounded-lg border font-medium ${getTagColor(tag)}`}
                              >
                                {tag}
                              </span>
                              {selectedTag === tag && <Check size={11} className="text-blue-500" />}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sort */}
              <div className="relative">
                <button
                  onClick={() => setShowSort(!showSort)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                    ${dark ? 'border-white/[0.08] text-white/40 hover:bg-white/[0.04]' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}
                >
                  <Filter size={11} /> {sort} <ChevronDown size={10} />
                </button>
                {showSort && (
                  <div
                    className={`absolute right-0 top-full mt-1 rounded-xl border shadow-2xl z-10 overflow-hidden w-28 ${dropdown}`}
                  >
                    {SORT_OPTIONS.map((o) => (
                      <button
                        key={o}
                        onClick={() => {
                          setSort(o)
                          setShowSort(false)
                        }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors
                          ${sort === o ? 'text-blue-400 font-medium' : dark ? 'text-white/50 hover:bg-white/[0.04]' : 'text-zinc-600 hover:bg-zinc-50'}`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Active tag indicator */}
            {selectedTag && (
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-xs ${muted}`}>Filtering by:</span>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium ${getTagColor(selectedTag)}`}
                >
                  {selectedTag}
                  <button onClick={() => setSelectedTag(null)}>
                    <X size={10} />
                  </button>
                </span>
              </div>
            )}

            {/* Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className={`p-12 rounded-xl border text-center ${card}`}>
                <BarChart2 size={28} className={`mx-auto mb-3 ${muted}`} />
                <p className="text-sm font-medium mb-1">No projects found</p>
                <p className={`text-xs mb-4 ${muted}`}>
                  {search || selectedTag
                    ? 'Try a different search or filter'
                    : 'Create your first project to get started'}
                </p>
                <Link
                  href="/projects/new"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 transition-colors"
                >
                  <Plus size={13} /> New Project
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.map((p) => (
                  <div key={p.id} className="relative group">
                    {p.status === 'processing' ? (
                      <div className={`p-4 rounded-xl border opacity-60 ${card}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="p-1.5 rounded-lg bg-amber-500/10">
                            <BarChart2 size={14} className="text-amber-500" />
                          </div>
                          <span className="flex items-center gap-1.5 text-xs text-amber-400">
                            <div className="w-2.5 h-2.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                            Processing
                          </span>
                        </div>
                        <h3 className="font-semibold text-sm mb-1 truncate">{p.name}</h3>
                        <p className={`text-xs truncate ${muted}`}>{p.file_name}</p>
                        <p className={`text-xs mt-2 ${muted}`}>Generating insights...</p>
                      </div>
                    ) : (
                      <div className="relative">
                        {selectMode && (
                          <button
                            onClick={(e) => toggleSelect(p.id, e)}
                            className={`absolute top-3 left-3 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
                              ${selectedIds.has(p.id) ? 'bg-blue-500 border-blue-500' : dark ? 'border-white/20 bg-white/5' : 'border-zinc-300 bg-white'}`}
                          >
                            {selectedIds.has(p.id) && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path
                                  d="M1 4L3.5 6.5L9 1"
                                  stroke="white"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        )}
                        <Link
                          href={selectMode ? '#' : `/projects/${p.id}`}
                          onClick={selectMode ? (e) => toggleSelect(p.id, e) : undefined}
                          className={`block p-4 rounded-xl border transition-all
                            ${selectMode && selectedIds.has(p.id) ? 'border-blue-500/50 bg-blue-500/5' : ''}
                            ${!selectMode ? 'hover:border-blue-500/40 hover:bg-blue-500/[0.03]' : ''}
                            ${selectMode ? 'pl-10 cursor-pointer' : ''}
                            ${card}`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="p-1.5 rounded-lg bg-blue-500/10">
                              <BarChart2 size={14} className="text-blue-500" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-xs text-emerald-500">
                                <CheckCircle size={11} /> Completed
                              </span>
                              {!selectMode && (
                                <button
                                  onClick={(e) => requestDelete([p.id], e)}
                                  className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:text-red-400 ${dark ? 'hover:bg-white/5' : 'hover:bg-zinc-100'}`}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                          <h3 className="font-semibold text-sm mb-1 truncate">{p.name}</h3>
                          <p className={`text-xs truncate mb-2 ${muted}`}>{p.file_name}</p>

                          {(p.tags || []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {p.tags.slice(0, 3).map((tag: string) => (
                                <span
                                  key={tag}
                                  className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${getTagColor(tag)}`}
                                >
                                  {tag}
                                </span>
                              ))}
                              {p.tags.length > 3 && (
                                <span className={`text-xs px-1 ${muted}`}>
                                  +{p.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-2 flex-wrap mb-3">
                            {p.target_company && (
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${dark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}
                              >
                                {p.target_company}
                              </span>
                            )}
                            {p.target_audience && (
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${dark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600'}`}
                              >
                                {p.target_audience}
                              </span>
                            )}
                            {p.folder && (
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${dark ? 'bg-white/5 text-white/35' : 'bg-zinc-100 text-zinc-500'}`}
                              >
                                <Folder size={9} /> {p.folder}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <div className={`flex items-center gap-1 text-xs ${muted}`}>
                              <Clock size={10} /> {new Date(p.created_at).toLocaleDateString()}
                            </div>
                            {!selectMode && (
                              <span className="text-xs text-blue-500 flex items-center gap-1 font-medium">
                                View Results <ArrowRight size={10} />
                              </span>
                            )}
                          </div>
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* New Folder Modal */}
        {showFolderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowFolderModal(false)}
            />
            <div className={`relative w-full max-w-sm p-6 rounded-2xl border shadow-2xl ${card}`}>
              <h3 className="font-bold text-base mb-4">Create New Folder</h3>
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                placeholder="Folder name..."
                autoFocus
                className={`w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-blue-500/50 mb-4 ${input}`}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFolderModal(false)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-medium ${dark ? 'border-white/[0.08] hover:bg-white/[0.04]' : 'border-zinc-200 hover:bg-zinc-50'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={createFolder}
                  disabled={!newFolderName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-400 transition-colors disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
