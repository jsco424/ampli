'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Navbar from '@/components/Navbar'
import { useTheme } from '@/hooks/useTheme'
import { UploadCloud, FileText, X, Sparkles, ChevronRight, MessageSquare, Target, Users, ShieldAlert, Info, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { scanForPII, type PIIScanResult } from '@/lib/piiScanner'
import PrivacyModal from '@/components/PrivacyModal'
import PIIMeter from '@/components/PIIMeter'
import Link from 'next/link'

export default function NewProjectPage() {
  const { user } = useUser()
  const { dark } = useTheme()
  const router = useRouter()

  const [file, setFile] = useState<File | null>(null)
  const [fileText, setFileText] = useState<string>('')
  const [piiResult, setPiiResult] = useState<PIIScanResult | null>(null)
  const [prompt, setPrompt] = useState('')
  const [projectName, setProjectName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [optIn, setOptIn] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [selectedCompany, setSelectedCompany] = useState<any>(null)
  const [selectedAudience, setSelectedAudience] = useState<any>(null)
  const [companySearch, setCompanySearch] = useState('')
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('company_research').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCompanies(data || []))
  }, [user])

  const processFile = async (f: File) => {
    setFile(f)
    setPiiResult(null)
    const text = await f.text()
    setFileText(text)
    const result = scanForPII(text)
    setPiiResult(result)
    if (result.riskLevel === 'high') setOptIn(false)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) processFile(f)
  }

  const handleSubmit = async () => {
    if (!file || !projectName || !user) return
    setLoading(true)

    try {
      const preview = fileText.split('\n').slice(0, 20).join('\n')

      // Step 1 — save project immediately as 'processing'
      const { data, error } = await supabase.from('projects').insert({
        name: projectName,
        user_id: user.id,
        user_email: user.emailAddresses[0].emailAddress,
        file_name: file.name,
        raw_data: preview,
        prompt,
        status: 'processing',
        opt_in_crowd: optIn && piiResult?.riskLevel !== 'high',
        target_company: selectedCompany?.company_name || null,
        target_audience: selectedAudience?.role || null,
        industry: null,
        created_at: new Date().toISOString(),
      }).select().single()

      if (error) throw error

      // Step 2 — show confirmation screen immediately
      setSubmitted(true)
      setLoading(false)

      // Step 3 — trigger generation in background
      fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: data.id,
          data: preview,
          prompt,
          projectName,
          targetCompany: selectedCompany?.company_name || null,
          targetAudience: selectedAudience || null,
          optIn: optIn && piiResult?.riskLevel !== 'high',
        }),
      }).catch(console.error)

    } catch (err: any) {
      console.error(err)
      setLoading(false)
    }
  }

  const filteredCompanies = companies.filter(c =>
    c.company_name?.toLowerCase().includes(companySearch.toLowerCase())
  )

  const base = dark ? 'bg-zinc-950 text-white' : 'bg-zinc-50 text-zinc-900'
  const card = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
  const input = dark ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500' : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
  const sectionCard = dark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
  const canOptIn = !piiResult || piiResult.riskLevel !== 'high'

  // Confirmation screen
  if (submitted) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center px-6 ${base}`}>
        <Navbar />
        <div className={`w-full max-w-md p-10 rounded-3xl border text-center ${card}`}>
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-5">
            <Sparkles size={28} className="text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Your insights are on the way</h1>
          <p className={`text-sm leading-relaxed mb-8 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            ampli is analyzing <span className="font-medium text-white">{file?.name}</span> and generating your narrative. This usually takes 15–30 seconds. You can check back from your dashboard.
          </p>

          <div className="space-y-3">
            <div className={`flex items-center gap-3 p-3 rounded-xl text-left ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}>
              <CheckCircle size={16} className="text-emerald-400 shrink-0" />
              <span className="text-sm">Project saved successfully</span>
            </div>
            <div className={`flex items-center gap-3 p-3 rounded-xl text-left ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}>
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-sm">Generating narrative & insights...</span>
            </div>
            {optIn && (
              <div className={`flex items-center gap-3 p-3 rounded-xl text-left ${dark ? 'bg-zinc-800' : 'bg-zinc-50'}`}>
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-sm">Contributing anonymized data to crowd pool...</span>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <Link href="/"
              className="w-full py-3 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors text-center">
              Back to Dashboard
            </Link>
            <button
              onClick={() => { setSubmitted(false); setFile(null); setProjectName(''); setPrompt(''); setPiiResult(null); setFileText('') }}
              className={`w-full py-3 rounded-xl border text-sm font-medium transition-colors ${dark ? 'border-zinc-700 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-50'}`}>
              Start Another Project
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${base}`}>
      <Navbar />
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}

      <main className="pt-24 px-6 max-w-2xl mx-auto pb-20">

        {/* Header */}
        <div className="text-center mb-8">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${dark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
            <Sparkles size={24} className="text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold mb-1">Create New Project</h1>
          <p className={`text-sm ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            Upload your data file and let AI generate narratives and insights
          </p>
        </div>

        {/* Project Name */}
        <div className="mb-5">
          <label className="block text-sm font-medium mb-2">Project Title</label>
          <input
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="Enter a name for your project"
            className={`w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500 ${input}`}
          />
        </div>

        {/* File Upload */}
        <div className="mb-3">
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all
              ${dragging ? 'border-blue-500 bg-blue-500/5' : dark ? 'border-zinc-700' : 'border-zinc-300'}`}>
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText size={20} className="text-blue-500" />
                <span className="text-sm font-medium">{file.name}</span>
                <button onClick={() => { setFile(null); setPiiResult(null); setFileText('') }}
                  className="text-zinc-400 hover:text-red-400">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <UploadCloud size={32} className={`mx-auto mb-3 ${dark ? 'text-zinc-600' : 'text-zinc-400'}`} />
                <p className="text-sm font-medium mb-1">Drop your file here, or browse</p>
                <p className={`text-xs mb-4 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>Supports CSV, XLSX, and XLS files</p>
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors">
                  Browse Files
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={onFileChange} className="hidden" />
                </label>
              </>
            )}
          </div>
        </div>

        {/* PII Meter */}
        {piiResult && (
          <div className="mb-5">
            <PIIMeter result={piiResult} />
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleSubmit}
          disabled={!file || !projectName || loading}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-5">
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving project...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Generate Narrative & Insights
              <ChevronRight size={16} />
            </>
          )}
        </button>

        {/* Custom Prompt */}
        <div className={`p-4 rounded-2xl border mb-4 ${sectionCard}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-blue-500/10">
              <MessageSquare size={14} className="text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">Customize Your Analysis</p>
              <p className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>Brief the AI like you're briefing an analyst before a meeting</p>
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={`e.g. "We're pitching to Apple's VP of Performance Marketing. Lead with mobile conversion trends and tie everything back to app install efficiency."`}
            rows={3}
            className={`w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none ${input}`}
          />
          <p className={`text-xs mt-2 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            💡 Tip: Include who you're pitching to, what they care about, and what angle you want to lead with
          </p>
        </div>

        {/* Target Company */}
        <div className={`p-4 rounded-2xl border mb-4 ${dark ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/10">
              <Target size={14} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">Tailor for a Target Company</p>
              <p className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>Pick a company you've researched to tailor insights for a pitch</p>
            </div>
          </div>

          {companies.length === 0 ? (
            <p className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              No researched companies yet. Use the <span className="font-semibold">Company Research</span> tool on the dashboard first.
            </p>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm ${input}`}>
                <span className={selectedCompany ? '' : dark ? 'text-zinc-500' : 'text-zinc-400'}>
                  {selectedCompany ? selectedCompany.company_name : 'Select a company...'}
                </span>
                <ChevronRight size={14} className={`transition-transform ${showCompanyDropdown ? 'rotate-90' : ''}`} />
              </button>

              {showCompanyDropdown && (
                <div className={`absolute top-full left-0 right-0 mt-1 rounded-xl border shadow-xl z-10 overflow-hidden
                  ${dark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                  <div className="p-2">
                    <input
                      value={companySearch}
                      onChange={e => setCompanySearch(e.target.value)}
                      placeholder="Search companies..."
                      className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${input}`}
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedCompany(null); setSelectedAudience(null); setShowCompanyDropdown(false) }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-500/10 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      No target company
                    </button>
                    {filteredCompanies.map(c => (
                      <button key={c.id}
                        onClick={() => { setSelectedCompany(c); setSelectedAudience(null); setShowCompanyDropdown(false) }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-blue-500/10 font-medium">
                        {c.company_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedCompany?.audiences?.length > 0 && (
            <div className="mt-3">
              <p className={`text-xs font-medium mb-2 flex items-center gap-1 ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                <Users size={12} /> Select target audience
              </p>
              <div className="space-y-2">
                {selectedCompany.audiences.map((a: any, i: number) => (
                  <button key={i}
                    onClick={() => setSelectedAudience(selectedAudience?.role === a.role ? null : a)}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition-all
                      ${selectedAudience?.role === a.role
                        ? 'border-blue-500 bg-blue-500/10'
                        : dark ? 'border-zinc-700 hover:border-zinc-600' : 'border-zinc-200 hover:border-zinc-300'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{a.role}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
                        a.tier === 'executive' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                        a.tier === 'director' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        a.tier === 'manager' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                        {a.seniority}
                      </span>
                    </div>
                    <p className={dark ? 'text-zinc-400' : 'text-zinc-500'}>{a.narrative_style}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Crowd Insights Opt-in */}
        <div className={`p-4 rounded-2xl border ${dark ? 'bg-purple-950/20 border-purple-900/30' : 'bg-purple-50 border-purple-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-purple-500/10">
              <Users size={14} className="text-purple-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">Contribute to Crowd-Sourced Insights</p>
              <p className={`text-xs ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Help build industry trends by sharing anonymized patterns from your data
              </p>
            </div>
            <button onClick={() => setShowPrivacyModal(true)}
              className="flex items-center gap-1 text-xs text-blue-500 hover:underline shrink-0">
              <Info size={12} /> Learn more
            </button>
          </div>

          {!canOptIn ? (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <ShieldAlert size={13} />
              Opt-in disabled — sensitive data detected. Remove PII columns and re-upload to enable.
            </div>
          ) : (
            <>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={optIn} onChange={e => setOptIn(e.target.checked)}
                  className="mt-0.5 accent-purple-500" />
                <span className={`text-xs leading-relaxed ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                  Yes, contribute my anonymized data to crowd-sourced insights. All proprietary information, brands, and identifying details will be removed.
                </span>
              </label>
              <p className={`text-xs mt-2 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                🔒 Privacy: Your company name, brands, and proprietary data are never shared
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}