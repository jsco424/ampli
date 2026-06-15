'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { supabase } from '@/lib/supabase'
import {
  BarChart2, Search, Plus, Trash2, Clock, CheckCircle,
  ArrowRight, FolderPlus, Folder, ChevronDown, Filter, X
} from 'lucide-react'
import Link from 'next/link'
import UndoToast from '@/components/UndoToast'
import DeleteModal from '@/components/DeleteModal'

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
  const [movingProject, setMovingProject] = useState<string | null>(null)

  // Delete state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string }[] | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; names: string } | null>(null)

  useEffect(() => {
    if (isLoaded && !user) router.push('/sign-in')
  }, [isLoaded, user, router])

  const loadProjects = () => {
    if (!user) return
    supabase.from('projects').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProjects(data || [])
        const f = [...new Set((data || []).map((p: any) => p.folder).filter(Boolean))] as string[]
        setFolders(f)
        setLoading(false)
      })
  }

  useEffect(() => { loadProjects() }, [user])

  useEffect(() => {
    if (!projects.some(p => p.status === 'processing')) return
    const interval = setInterval(loadProjects, 5000)
    return () => clearInterval(interval)
  }, [projects])

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const requestDelete = (ids: string[], e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    const toDelete = projects.filter(p => ids.includes(p.id)).map(p => ({ id: p.id, name: p.name }))
    setDeleteModal(toDelete)
  }

  const handleDeleteConfirm = (ids: string[]) => {
    const names = projects
      .filter(p => ids.includes(p.id))
      .map(p => p.name)
      .join(', ')
    // Remove from UI immediately
    setProjects(p => p.filter(x => !ids.includes(x.id)))
    setSelectedIds(new Set())
    setSelectMode(false)
    setDeleteModal(null)
    setPendingDelete({ ids, names: ids.length === 1 ? names : `${ids.length} projects` })
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    for (const id of pendingDelete.ids) {
      await supabase.from('projects').delete().eq('id', id)
    }
    setPendingDelete(null)
  }

  const undoDelete = () => {
    if (!pendingDelete) return
    loadProjects()
    setPendingDelete(null)
  }

  const createFolder = () => {
    if (!newFolderName.trim()) return
    setFolders(f => [...new Set([...f, newFolderName.trim()])])
    setNewFolderName('')
    setShowFolderModal(false)
  }

  const moveToFolder = async (projectId: string, folder: string | null) => {
    await supabase.from('projects').update({ folder }).eq('id', projectId)
    setProjects(p => p.map(x => x.id === projectId ? { ...x, folder } : x))
    setMovingProject(null)
  }

  let filtered = projects.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.file_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || p.status === statusFilter.toLowerCase()
    const matchFolder = selectedFolder === null || p.folder === selectedFolder
    return matchSearch && matchStatus && matchFolder
  })

  filtered = [...filtered].sort((a, b) => {
    if (sort === 'Newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    if (sort === 'Oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (sort === 'A–Z') return a.name.localeCompare(b.name)
    if (sort === 'Z–A') return b.name.localeCompare(a.name)
    return 0
  })

  const base = dark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const input = dark ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500' : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'

  if (!isLoaded || !user) return null

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />

      {/* Modals & Toasts */}
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
        <div className="mt-6 mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">My Projects</h1>
            <p className={`text-sm ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {projects.length} project{projects.length !== 1 ? 's' : ''} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Select mode toggle */}
            <button
              onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
              className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors
                ${selectMode
                  ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                  : dark ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-800' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}>
              {selectMode ? 'Cancel' : 'Select'}
            </button>

            {/* Bulk delete */}
            {selectMode && selectedIds.size > 0 && (
              <button
                onClick={() => requestDelete([...selectedIds])}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors">
                <Trash2 size={13} />
                Delete ({selectedIds.size})
              </button>
            )}

            <Link href="/projects/new"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
              <Plus size={15} />
              New Project
            </Link>
          </div>
        </div>

        <div className="flex gap-6">

          {/* Sidebar — Folders */}
          <div className="w-48 shrink-0 space-y-1">
            <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              Folders
            </p>
            <button
              onClick={() => setSelectedFolder(null)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors
                ${selectedFolder === null
                  ? 'bg-blue-500/10 text-blue-500 font-medium'
                  : dark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-100'}`}>
              <BarChart2 size={14} />
              All Projects
            </button>

            {folders.map(f => (
              <button key={f}
                onClick={() => setSelectedFolder(f)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors truncate
                  ${selectedFolder === f
                    ? 'bg-blue-500/10 text-blue-500 font-medium'
                    : dark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-100'}`}>
                <Folder size={14} />
                {f}
              </button>
            ))}

            <button
              onClick={() => setShowFolderModal(true)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors mt-2
                ${dark ? 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'}`}>
              <FolderPlus size={14} />
              New Folder
            </button>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">

            {/* Filters */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <div className={`flex items-center gap-2 flex-1 min-w-40 px-3 py-2 rounded-xl border ${input}`}>
                <Search size={14} className={dark ? 'text-zinc-500' : 'text-zinc-400'} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="flex-1 bg-transparent outline-none text-sm"
                />
              </div>

              <div className="flex gap-1.5">
                {STATUS_OPTIONS.map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors
                      ${statusFilter === s
                        ? 'bg-blue-500 text-white'
                        : dark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}>
                    {s}
                  </button>
                ))}
              </div>

              <div className="relative">
                <button onClick={() => setShowSort(!showSort)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors
                    ${dark ? 'border-zinc-700 text-zinc-400 hover:bg-zinc-800' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}>
                  <Filter size={12} />
                  {sort}
                  <ChevronDown size={12} />
                </button>
                {showSort && (
                  <div className={`absolute right-0 top-full mt-1 rounded-xl border shadow-xl z-10 overflow-hidden w-32
                    ${dark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    {SORT_OPTIONS.map(o => (
                      <button key={o} onClick={() => { setSort(o); setShowSort(false) }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors
                          ${sort === o ? 'text-blue-500 font-medium' : dark ? 'text-zinc-300 hover:bg-zinc-800' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                        {o}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Projects Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className={`p-12 rounded-2xl border text-center ${card}`}>
                <BarChart2 size={32} className={`mx-auto mb-3 ${dark ? 'text-zinc-600' : 'text-zinc-400'}`} />
                <p className="text-sm font-medium mb-1">No projects found</p>
                <p className={`text-xs mb-4 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {search ? 'Try a different search term' : 'Create your first project to get started'}
                </p>
                <Link href="/projects/new"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
                  <Plus size={14} /> New Project
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filtered.map(p => (
                  <div key={p.id} className="relative group">
                    {p.status === 'processing' ? (
                      <div className={`p-4 rounded-2xl border opacity-75 ${card}`}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="p-2 rounded-xl bg-amber-500/10">
                            <BarChart2 size={16} className="text-amber-500" />
                          </div>
                          <span className="flex items-center gap-1.5 text-xs text-amber-400">
                            <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                            Processing
                          </span>
                        </div>
                        <h3 className="font-semibold text-sm mb-1 truncate">{p.name}</h3>
                        <p className={`text-xs truncate ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>{p.file_name}</p>
                        <p className={`text-xs mt-2 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>Generating insights...</p>
                      </div>
                    ) : (
                      <div className="relative">
                        {/* Checkbox in select mode */}
                        {selectMode && (
                          <button
                            onClick={e => toggleSelect(p.id, e)}
                            className={`absolute top-3 left-3 z-10 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors
                              ${selectedIds.has(p.id)
                                ? 'bg-blue-500 border-blue-500'
                                : dark ? 'border-zinc-600 bg-zinc-800' : 'border-zinc-300 bg-white'}`}>
                            {selectedIds.has(p.id) && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                        )}

                        <Link href={selectMode ? '#' : `/projects/${p.id}`}
                          onClick={selectMode ? e => toggleSelect(p.id, e) : undefined}
                          className={`block p-4 rounded-2xl border transition-all
                            ${selectMode && selectedIds.has(p.id) ? 'border-blue-500 bg-blue-500/5' : ''}
                            ${!selectMode ? 'hover:border-blue-500 hover:shadow-md' : ''}
                            ${selectMode ? 'pl-10 cursor-pointer' : ''}
                            ${card}`}>
                          <div className="flex items-start justify-between mb-2">
                            <div className="p-2 rounded-xl bg-blue-500/10">
                              <BarChart2 size={16} className="text-blue-500" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1 text-xs text-emerald-500">
                                <CheckCircle size={12} /> Completed
                              </span>
                              {!selectMode && (
                                <button onClick={e => requestDelete([p.id], e)}
                                  className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:text-red-400
                                    ${dark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'}`}>
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                          <h3 className="font-semibold text-sm mb-1 truncate">{p.name}</h3>
                          <p className={`text-xs truncate mb-2 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>{p.file_name}</p>

                          {/* Tags */}
                          <div className="flex items-center gap-2 flex-wrap mb-3">
                            {p.target_company && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${dark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                                {p.target_company}
                              </span>
                            )}
                            {p.target_audience && (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${dark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                                {p.target_audience}
                              </span>
                            )}
                            {p.folder && (
                              <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${dark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
                                <Folder size={10} /> {p.folder}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <div className={`flex items-center gap-1 text-xs ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                              <Clock size={11} />
                              {new Date(p.created_at).toLocaleDateString()}
                            </div>
                            {!selectMode && (
                              <span className="text-xs text-blue-500 flex items-center gap-1 font-medium">
                                View Results <ArrowRight size={11} />
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
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFolderModal(false)} />
            <div className={`relative w-full max-w-sm p-6 rounded-2xl border shadow-2xl
              ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
              <h3 className="font-bold text-base mb-4">Create New Folder</h3>
              <input
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFolder()}
                placeholder="Folder name..."
                autoFocus
                className={`w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500 mb-4
                  ${dark ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500' : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'}`}
              />
              <div className="flex gap-3">
                <button onClick={() => setShowFolderModal(false)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-medium
                    ${dark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'}`}>
                  Cancel
                </button>
                <button onClick={createFolder} disabled={!newFolderName.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-40">
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