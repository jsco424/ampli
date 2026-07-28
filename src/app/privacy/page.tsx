// DRAFT — this is a starting point grounded in ampli's actual current
// data practices, not a finished legal document. It has NOT been reviewed
// by an attorney and should not be treated as compliant on its own. Every
// [CONFIRM: ...] marker below flags something James needs to fill in,
// decide, or verify — most importantly the actual data retention period,
// which isn't a decision an AI assistant should make on your behalf.
// Get this reviewed by a real privacy attorney before it goes live.

'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const LAST_UPDATED = 'July 2026' // [CONFIRM: update this date whenever the policy actually changes]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <nav className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-6 border-b border-zinc-200 bg-white/95 backdrop-blur-xl">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to ampli
        </Link>
      </nav>

      <main className="pt-24 px-6 max-w-2xl mx-auto pb-24">
        <h1 className="text-3xl font-black tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-sm text-zinc-400 mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10 text-sm leading-relaxed text-zinc-600">
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">Introduction</h2>
            <p>
              This policy describes how ampli collects, uses, and protects information when you use
              our platform to analyze data and generate presentations. It applies to anyone who
              creates an account or uses ampli's services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">Information we collect</h2>
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-zinc-800">Account information</p>
                <p>
                  Your name, email address, and billing information, collected and managed through
                  our authentication provider, Clerk, and our payment processor, Stripe.
                </p>
              </div>
              <div>
                <p className="font-semibold text-zinc-800">Data you upload</p>
                <p>
                  Spreadsheets and data files you upload for analysis, along with the summaries,
                  findings, charts, and presentations ampli generates from that data on your behalf.
                </p>
              </div>
              <div>
                <p className="font-semibold text-zinc-800">Usage information</p>
                <p>
                  How you use ampli, including which features you access and how many credits you
                  use each month, so we can operate the service and enforce plan limits fairly.
                </p>
              </div>
              <div>
                <p className="font-semibold text-zinc-800">Company research</p>
                <p>
                  If you use our company research tool, the URLs you submit and the resulting
                  research are stored to your account so you can reference them later.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">How we use your information</h2>
            <p>We use the information above to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Analyze your uploaded data and generate verified findings and presentations</li>
              <li>Operate your account, enforce plan limits, and process payments</li>
              <li>Provide industry benchmarking, if you choose to opt in (see below)</li>
              <li>Maintain and improve the reliability and security of the platform</li>
              <li>Respond to support requests</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">Who we share information with</h2>
            <p className="mb-3">
              We do not sell your information. We do share it with the following service providers,
              each of whom processes it only to help us operate ampli, not for their own independent
              purposes:
            </p>
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-zinc-800">Anthropic</p>
                <p>
                  Your uploaded data summary is sent to Anthropic's API to perform the actual
                  analysis that powers ampli's findings and insights.
                </p>
              </div>
              <div>
                <p className="font-semibold text-zinc-800">Gamma</p>
                <p>
                  Text content from your analysis, such as findings and summary statistics, is sent
                  to Gamma's API to generate your exported presentation. Your raw uploaded data
                  itself is not sent to Gamma.
                </p>
              </div>
              <div>
                <p className="font-semibold text-zinc-800">Supabase</p>
                <p>Our database and file storage provider, where your account data is stored.</p>
              </div>
              <div>
                <p className="font-semibold text-zinc-800">Clerk</p>
                <p>Our authentication and billing provider.</p>
              </div>
              <div>
                <p className="font-semibold text-zinc-800">Vercel</p>
                <p>Our hosting provider.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">
              Crowd Insights and Company Benchmarks
            </h2>
            <p className="mb-3">
              <span className="font-semibold text-zinc-800">Crowd Insights</span> is entirely opt
              in. If you choose to contribute, a summary of your data's metrics is added to a
              shared, anonymized benchmark pool used to show industry comparisons to other users.
              Before anything is added to this pool, an automated step removes brand names, company
              names, and other identifying details, so only anonymized patterns are ever shared,
              never your raw data or anything that identifies you or your clients.
            </p>
            <p>
              <span className="font-semibold text-zinc-800">Company Benchmarks</span> works
              differently: your own metrics over time are visible to other people on your team who
              share your company's email domain, so your organization can track its own performance
              together. This is never shared outside your own company.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">Data retention</h2>
            <p>
              [CONFIRM: state the actual retention period here — for example, "we retain your data
              for as long as your account remains active, and for [X days/months] after account
              closure" — this is a real decision to make deliberately, not something to leave as a
              placeholder once this goes live.]
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">Your rights</h2>
            <p className="mb-3">
              Depending on where you live, you may have the right to access, correct, export, or
              delete the personal information we hold about you. To exercise any of these rights,
              contact us at the email below and we will respond within a reasonable timeframe.
            </p>
            <p>
              [CONFIRM: if this needs to state a specific response timeframe required by law in your
              jurisdiction, e.g. 30 days under GDPR, add that here once confirmed with legal
              counsel.]
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">Cookies</h2>
            <p>
              ampli uses cookies required for authentication, provided by Clerk, to keep you signed
              in. [CONFIRM: if any analytics, advertising, or other non essential tracking is added
              in the future, this section needs to be updated and a consent mechanism added before
              those cookies fire.]
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">Children's privacy</h2>
            <p>
              ampli is not directed at children and is not intended for use by anyone under 16. We
              do not knowingly collect information from children.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">Changes to this policy</h2>
            <p>
              We may update this policy from time to time. We will update the date at the top of
              this page when we do, and for material changes, we will make a reasonable effort to
              notify active users directly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-3">Contact us</h2>
            <p>
              Questions about this policy or your data can be sent to{' '}
              <a href="mailto:support@am-pli.com" className="text-blue-600 hover:underline">
                support@am-pli.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
