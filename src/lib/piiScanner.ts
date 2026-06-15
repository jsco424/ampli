export interface PIIScanResult {
  hasPII: boolean
  findings: string[]
  riskLevel: 'none' | 'low' | 'medium' | 'high'
}

// Sensitive column header keywords
const SENSITIVE_HEADERS = [
  'email', 'phone', 'mobile', 'ssn', 'social_security', 'dob', 'birth',
  'password', 'credit_card', 'card_number', 'address', 'street', 'zip',
  'postal', 'first_name', 'last_name', 'full_name', 'customer_name',
  'user_name', 'account_number', 'bank', 'routing', 'ip_address',
  'device_id', 'passport', 'license', 'gender', 'race', 'ethnicity',
  'salary', 'income', 'net_worth', 'medical', 'health', 'diagnosis'
]

// PII patterns
const PII_PATTERNS: { name: string; pattern: RegExp; risk: 'low' | 'medium' | 'high' }[] = [
  { name: 'Email addresses', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, risk: 'high' },
  { name: 'Phone numbers', pattern: /(\+?1?\s?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g, risk: 'high' },
  { name: 'SSN patterns', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, risk: 'high' },
  { name: 'Credit card numbers', pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, risk: 'high' },
  { name: 'IP addresses', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, risk: 'medium' },
  { name: 'Dates of birth', pattern: /\b(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d{2}\b/g, risk: 'medium' },
  { name: 'ZIP codes', pattern: /\b\d{5}(?:-\d{4})?\b/g, risk: 'low' },
]

export function scanForPII(csvText: string): PIIScanResult {
  const findings: string[] = []
  let highRisk = false
  let mediumRisk = false

  // Check headers
  const firstLine = csvText.split('\n')[0].toLowerCase()
  const headers = firstLine.split(',').map(h => h.trim().replace(/"/g, ''))

  for (const header of headers) {
    for (const sensitive of SENSITIVE_HEADERS) {
      if (header.includes(sensitive)) {
        findings.push(`Sensitive column detected: "${header}"`)
        highRisk = true
        break
      }
    }
  }

  // Check data patterns
  for (const { name, pattern, risk } of PII_PATTERNS) {
    const matches = csvText.match(pattern)
    if (matches && matches.length > 0) {
      // ZIP codes are common in data — only flag if many
      if (name === 'ZIP codes' && matches.length < 5) continue
      // IP addresses — only flag if looks like real IPs
      if (name === 'IP addresses' && matches.every(m => {
        const parts = m.split('.').map(Number)
        return parts.some(p => p > 255)
      })) continue

      findings.push(`${name} found (${matches.length} instance${matches.length > 1 ? 's' : ''})`)
      if (risk === 'high') highRisk = true
      if (risk === 'medium') mediumRisk = true
    }
  }

  const riskLevel = highRisk ? 'high' : mediumRisk ? 'medium' : findings.length > 0 ? 'low' : 'none'

  return {
    hasPII: findings.length > 0,
    findings,
    riskLevel,
  }
}

export function getRiskColor(level: PIIScanResult['riskLevel']) {
  switch (level) {
    case 'high': return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', badge: 'bg-red-500' }
    case 'medium': return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500' }
    case 'low': return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', badge: 'bg-yellow-500' }
    default: return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500' }
  }
}