// Canonical fields: one shared vocabulary for the columns people upload.
//
// Nobody uploads a column called ROAS. They upload Spend and Revenue, and the
// metric is calculated from those. This file holds:
//
//   1. CANONICAL_FIELDS   the base fields (dimensions and measures) with the
//                         names people actually use for them
//   2. DERIVED_METRICS    metrics calculated from base fields (ROAS, CTR, CPA ...)
//   3. matchColumns()     maps an uploaded column to a canonical field, with a
//                         confidence score and, when unsure, the likely candidates
//   4. missingForMetrics()  tells the user which field is missing for a metric
//
// Everything here is pure and runs in the browser, so matching is instant and
// no column names leave the page unless a column genuinely cannot be placed
// (see /api/map-columns).

export type FieldKind = 'dimension' | 'measure'
export type FieldUnit = 'currency' | 'count' | 'percent' | 'multiple' | 'text' | 'date' | 'number'

export interface CanonicalField {
  key: string
  label: string
  kind: FieldKind
  group: string
  unit: FieldUnit
  synonyms: string[]
  // A ratio the user already has as a column (for example "Cost per click").
  derived?: boolean
}

const f = (
  key: string,
  label: string,
  kind: FieldKind,
  group: string,
  unit: FieldUnit,
  synonyms: string[],
  derived = false
): CanonicalField => ({ key, label, kind, group, unit, synonyms, derived })

export const CANONICAL_FIELDS: CanonicalField[] = [
  // ── time
  f('date', 'Date', 'dimension', 'Time', 'date', [
    'date',
    'day',
    'order date',
    'transaction date',
    'report date',
    'reporting date',
    'created at',
    'created date',
    'timestamp',
    'week',
    'week of',
    'week start',
    'month',
    'month of',
    'quarter',
    'period',
    'year',
    'fiscal period',
    'fiscal quarter',
  ]),

  // ── marketing dimensions
  f('channel', 'Channel', 'dimension', 'Marketing', 'text', [
    'channel',
    'marketing channel',
    'media channel',
    'traffic source',
    'source',
    'source medium',
    'medium',
    'utm source',
    'utm medium',
    'acquisition channel',
  ]),
  f('campaign', 'Campaign', 'dimension', 'Marketing', 'text', [
    'campaign',
    'campaign name',
    'campaign id',
    'ad campaign',
    'initiative',
  ]),
  f('ad_group', 'Ad group', 'dimension', 'Marketing', 'text', [
    'ad group',
    'ad set',
    'adset',
    'ad set name',
    'ad group name',
  ]),
  f('ad_creative', 'Ad or creative', 'dimension', 'Marketing', 'text', [
    'ad',
    'ad name',
    'creative',
    'creative name',
    'ad creative',
    'asset name',
  ]),
  f('keyword', 'Keyword', 'dimension', 'Marketing', 'text', [
    'keyword',
    'search term',
    'query',
    'search query',
  ]),
  f('placement', 'Placement', 'dimension', 'Marketing', 'text', [
    'placement',
    'ad placement',
    'publisher',
    'site',
    'network',
  ]),
  f('device', 'Device', 'dimension', 'Marketing', 'text', [
    'device',
    'device type',
    'device category',
    'platform type',
  ]),
  f('platform', 'Platform', 'dimension', 'Marketing', 'text', [
    'platform',
    'ad platform',
    'social platform',
    'publisher platform',
  ]),
  f('audience', 'Audience or segment', 'dimension', 'Marketing', 'text', [
    'audience',
    'segment',
    'customer segment',
    'audience name',
    'targeting',
  ]),
  f('offer', 'Offer or promo code', 'dimension', 'Marketing', 'text', [
    'offer',
    'promo',
    'promo code',
    'coupon',
    'coupon code',
    'discount code',
    'promotion',
  ]),

  // ── customer dimensions
  f('customer_id', 'Customer ID', 'dimension', 'Customer', 'text', [
    'customer id',
    'user id',
    'userid',
    'account id',
    'member id',
    'client id',
    'cust id',
    'shopper id',
  ]),
  f('customer_type', 'New vs returning', 'dimension', 'Customer', 'text', [
    'new vs returning',
    'customer type',
    'new or returning',
    'user type',
    'visitor type',
    'new returning',
    'cohort type',
  ]),
  f('cohort', 'Cohort', 'dimension', 'Customer', 'text', [
    'cohort',
    'signup month',
    'signup cohort',
    'acquisition month',
    'join month',
  ]),
  f('plan', 'Plan or tier', 'dimension', 'Customer', 'text', [
    'plan',
    'tier',
    'subscription plan',
    'plan type',
    'pricing tier',
    'membership level',
    'loyalty tier',
  ]),
  f('age_group', 'Age band', 'dimension', 'Customer', 'text', [
    'age',
    'age group',
    'age band',
    'age range',
    'age bracket',
  ]),
  f('gender', 'Gender', 'dimension', 'Customer', 'text', ['gender', 'sex']),

  // ── geography
  f('country', 'Country', 'dimension', 'Geography', 'text', ['country', 'country code', 'nation']),
  f('state', 'State or region', 'dimension', 'Geography', 'text', [
    'state',
    'state code',
    'region',
    'province',
    'territory',
  ]),
  f('dma', 'DMA', 'dimension', 'Geography', 'text', [
    'dma',
    'dma name',
    'market',
    'metro',
    'metro area',
  ]),
  f('city', 'City', 'dimension', 'Geography', 'text', ['city', 'town']),
  f('store', 'Store or location', 'dimension', 'Geography', 'text', [
    'store',
    'store name',
    'store id',
    'location',
    'branch',
    'outlet',
  ]),

  // ── product dimensions
  f('product', 'Product', 'dimension', 'Product', 'text', [
    'product',
    'product name',
    'item',
    'item name',
    'sku',
    'sku name',
    'product id',
  ]),
  f('category', 'Category', 'dimension', 'Product', 'text', [
    'category',
    'product category',
    'department',
    'product type',
    'vertical',
  ]),
  f('brand', 'Brand', 'dimension', 'Product', 'text', ['brand', 'brand name', 'manufacturer']),

  // ── experiment
  f('test_group', 'Treatment vs control', 'dimension', 'Experiment', 'text', [
    'treatment vs control',
    'test group',
    'control group',
    'treatment',
    'control',
    'variant',
    'test vs control',
    'ab group',
    'experiment group',
    'holdout',
    'exposed',
    'test cell',
    'cell',
  ]),

  // ── sales and ops dimensions
  f('rep', 'Rep or owner', 'dimension', 'Sales', 'text', [
    'rep',
    'sales rep',
    'owner',
    'account owner',
    'account manager',
    'agent',
  ]),
  f('team', 'Team', 'dimension', 'Sales', 'text', ['team', 'sales team', 'squad', 'business unit']),
  f('stage', 'Pipeline stage', 'dimension', 'Sales', 'text', [
    'stage',
    'pipeline stage',
    'deal stage',
    'funnel stage',
  ]),

  // ── cost measures
  f('spend', 'Spend', 'measure', 'Cost', 'currency', [
    'spend',
    'ad spend',
    'media spend',
    'marketing spend',
    'amount spent',
    'spent',
    'media cost',
    'ad cost',
    'total spend',
    'cost usd',
    'investment',
    'media investment',
    'paid spend',
  ]),
  f('budget', 'Budget', 'measure', 'Cost', 'currency', [
    'budget',
    'planned spend',
    'daily budget',
    'campaign budget',
    'allocated budget',
  ]),
  f('cogs', 'Cost of goods', 'measure', 'Cost', 'currency', [
    'cogs',
    'cost of goods',
    'cost of goods sold',
    'product cost',
    'unit cost',
    'cost of sales',
  ]),
  f('discount', 'Discount amount', 'measure', 'Cost', 'currency', [
    'discount',
    'discount amount',
    'promo amount',
    'markdown',
    'coupon amount',
  ]),
  f('shipping_cost', 'Shipping cost', 'measure', 'Cost', 'currency', [
    'shipping cost',
    'freight',
    'shipping',
    'delivery cost',
    'fulfillment cost',
  ]),
  f('fees', 'Fees', 'measure', 'Cost', 'currency', [
    'fees',
    'fee',
    'processing fee',
    'transaction fee',
    'platform fee',
  ]),

  // ── reach measures
  f('impressions', 'Impressions', 'measure', 'Reach', 'count', [
    'impressions',
    'imps',
    'impr',
    'views',
    'ad impressions',
    'ad views',
  ]),
  f('reach', 'Reach', 'measure', 'Reach', 'count', [
    'reach',
    'unique reach',
    'people reached',
    'unique viewers',
  ]),
  f('sessions', 'Sessions', 'measure', 'Reach', 'count', [
    'sessions',
    'visits',
    'site visits',
    'website sessions',
    'traffic',
  ]),
  f('users', 'Users', 'measure', 'Reach', 'count', [
    'users',
    'unique users',
    'visitors',
    'unique visitors',
    'active users',
    'mau',
    'dau',
  ]),
  f('page_views', 'Page views', 'measure', 'Reach', 'count', [
    'page views',
    'pageviews',
    'screen views',
    'pv',
  ]),
  f('video_views', 'Video views', 'measure', 'Reach', 'count', [
    'video views',
    'video plays',
    'views 3s',
    'thruplays',
  ]),

  // ── engagement measures
  f('clicks', 'Clicks', 'measure', 'Engagement', 'count', [
    'clicks',
    'link clicks',
    'ad clicks',
    'all clicks',
    'click',
    'outbound clicks',
  ]),
  f('likes', 'Likes', 'measure', 'Engagement', 'count', ['likes', 'reactions']),
  f('shares', 'Shares', 'measure', 'Engagement', 'count', ['shares', 'reposts', 'retweets']),
  f('comments', 'Comments', 'measure', 'Engagement', 'count', ['comments', 'replies']),
  f('saves', 'Saves', 'measure', 'Engagement', 'count', ['saves', 'bookmarks']),
  f('time_on_site', 'Time on site', 'measure', 'Engagement', 'number', [
    'time on site',
    'avg session duration',
    'session duration',
    'time spent',
    'dwell time',
  ]),
  f('bounces', 'Bounces', 'measure', 'Engagement', 'count', ['bounces', 'bounced sessions']),

  // ── conversion event measures
  f('conversions', 'Conversions', 'measure', 'Conversions', 'count', [
    'conversions',
    'conv',
    'conversion',
    'results',
    'actions',
    'goal completions',
    'total conversions',
  ]),
  f('leads', 'Leads', 'measure', 'Conversions', 'count', [
    'leads',
    'lead',
    'form fills',
    'form submissions',
    'mqls',
    'sqls',
    'inquiries',
    'enquiries',
  ]),
  f('signups', 'Signups', 'measure', 'Conversions', 'count', [
    'signups',
    'sign ups',
    'sign up',
    'registrations',
    'new signups',
    'accounts created',
    'new accounts',
  ]),
  f('trials', 'Trials started', 'measure', 'Conversions', 'count', [
    'trials',
    'trial starts',
    'trials started',
    'free trials',
  ]),
  f('add_to_carts', 'Add to carts', 'measure', 'Conversions', 'count', [
    'add to cart',
    'add to carts',
    'carts',
    'carts created',
    'adds to cart',
    'atc',
  ]),
  f('checkouts', 'Checkouts started', 'measure', 'Conversions', 'count', [
    'checkouts',
    'checkouts started',
    'initiated checkout',
    'begin checkout',
  ]),
  f('orders', 'Orders', 'measure', 'Conversions', 'count', [
    'orders',
    'order',
    'order count',
    'purchases',
    'purchase',
    'transactions',
    'transaction',
    'number of orders',
    'checkouts completed',
  ]),
  f('installs', 'Installs', 'measure', 'Conversions', 'count', [
    'installs',
    'app installs',
    'downloads',
    'app downloads',
  ]),
  f('applications', 'Applications', 'measure', 'Conversions', 'count', [
    'applications',
    'apps submitted',
    'applicants',
  ]),
  f('receipts', 'Receipts submitted', 'measure', 'Conversions', 'count', [
    'receipts',
    'receipts submitted',
    'receipts scanned',
    'receipts analyzed',
  ]),
  f('subscriptions', 'Subscriptions', 'measure', 'Conversions', 'count', [
    'subscriptions',
    'new subscriptions',
    'subscribers added',
    'subscribes',
  ]),
  f('cancellations', 'Cancellations', 'measure', 'Conversions', 'count', [
    'cancellations',
    'cancels',
    'cancelled',
    'canceled',
  ]),
  f('units_sold', 'Units sold', 'measure', 'Conversions', 'count', [
    'units',
    'units sold',
    'quantity',
    'qty',
    'items sold',
  ]),

  // ── money in
  f('revenue', 'Revenue', 'measure', 'Revenue', 'currency', [
    'revenue',
    'net revenue',
    'gross revenue',
    'total revenue',
    'sales revenue',
    'revenue usd',
    'conversion value',
    'purchase value',
    'purchase revenue',
    'attributed revenue',
    'turnover',
    'sales amount',
  ]),
  f('order_value', 'Order value', 'measure', 'Revenue', 'currency', [
    'order value',
    'order total',
    'order amount',
    'basket value',
    'cart value',
    'transaction value',
  ]),
  f('signup_fee', 'Signup fee', 'measure', 'Revenue', 'currency', [
    'signup fee',
    'sign up fee',
    'enrollment fee',
    'registration fee',
    'activation fee',
    'onboarding fee',
  ]),
  f('subscription_fee', 'Subscription fee', 'measure', 'Revenue', 'currency', [
    'subscription fee',
    'monthly fee',
    'membership fee',
    'subscription revenue',
    'mrr',
    'arr',
    'recurring revenue',
  ]),
  f('gross_profit', 'Gross profit', 'measure', 'Revenue', 'currency', [
    'gross profit',
    'profit',
    'net profit',
    'contribution margin',
    'gross margin amount',
  ]),
  f('refunds', 'Refunds', 'measure', 'Revenue', 'currency', [
    'refunds',
    'refund amount',
    'returns amount',
    'chargebacks',
    'refunded',
  ]),
  f('returns', 'Returns', 'measure', 'Revenue', 'count', [
    'returns',
    'returned orders',
    'return count',
    'items returned',
  ]),

  // ── customer counts
  f('new_customers', 'New customers', 'measure', 'Customers', 'count', [
    'new customers',
    'new users',
    'new buyers',
    'first time customers',
    'customers acquired',
    'acquisitions',
    'new accounts won',
  ]),
  f('customers', 'Customers', 'measure', 'Customers', 'count', [
    'customers',
    'buyers',
    'active customers',
    'subscribers',
    'members',
    'accounts',
    'customer count',
  ]),
  f('customers_start', 'Customers at start', 'measure', 'Customers', 'count', [
    'customers at start',
    'starting customers',
    'beginning customers',
    'opening customers',
    'customers start of period',
  ]),
  f('customers_end', 'Customers at end', 'measure', 'Customers', 'count', [
    'customers at end',
    'ending customers',
    'closing customers',
    'customers end of period',
  ]),
  f('churned', 'Churned customers', 'measure', 'Customers', 'count', [
    'churned',
    'churned customers',
    'lost customers',
    'customers lost',
    'cancelled customers',
    'attrition count',
  ]),

  // ── sales pipeline
  f('opportunities', 'Opportunities', 'measure', 'Sales', 'count', [
    'opportunities',
    'opps',
    'deals created',
    'pipeline deals',
  ]),
  f('pipeline_value', 'Pipeline value', 'measure', 'Sales', 'currency', [
    'pipeline value',
    'pipeline',
    'pipeline amount',
    'weighted pipeline',
  ]),
  f('closed_won', 'Closed won', 'measure', 'Sales', 'count', [
    'closed won',
    'won',
    'deals won',
    'wins',
    'won deals',
  ]),
  f('quota', 'Quota', 'measure', 'Sales', 'currency', ['quota', 'target', 'goal', 'sales target']),

  // ── quality
  f('rating', 'Rating', 'measure', 'Quality', 'number', [
    'rating',
    'star rating',
    'review score',
    'avg rating',
    'average rating',
    'stars',
  ]),
  f('nps', 'NPS score', 'measure', 'Quality', 'number', ['nps', 'net promoter score', 'nps score']),
  f('responses', 'Survey responses', 'measure', 'Quality', 'count', [
    'responses',
    'survey responses',
    'respondents',
    'replies received',
  ]),
  f('tickets', 'Support tickets', 'measure', 'Quality', 'count', [
    'tickets',
    'support tickets',
    'cases',
    'help requests',
  ]),

  // ── ratios people often already have as a column
  f(
    'roas',
    'ROAS',
    'measure',
    'Efficiency',
    'multiple',
    ['roas', 'return on ad spend', 'return on advertising spend', 'ad return'],
    true
  ),
  f('roi', 'ROI', 'measure', 'Efficiency', 'percent', ['roi', 'return on investment'], true),
  f(
    'ctr',
    'Click through rate',
    'measure',
    'Efficiency',
    'percent',
    ['ctr', 'click through rate', 'clickthrough rate', 'click rate', 'click thru rate'],
    true
  ),
  f(
    'cpc',
    'Cost per click',
    'measure',
    'Efficiency',
    'currency',
    ['cpc', 'cost per click', 'avg cpc', 'average cpc'],
    true
  ),
  f(
    'cpm',
    'Cost per thousand',
    'measure',
    'Efficiency',
    'currency',
    ['cpm', 'cost per mille', 'cost per thousand', 'cost per 1000 impressions'],
    true
  ),
  f(
    'cpa',
    'Cost per acquisition',
    'measure',
    'Efficiency',
    'currency',
    [
      'cpa',
      'cost per acquisition',
      'cost per action',
      'cost per conversion',
      'cost per result',
      'cost per order',
      'cost per purchase',
      'cost per signup',
      'cost per install',
    ],
    true
  ),
  f('cpl', 'Cost per lead', 'measure', 'Efficiency', 'currency', ['cpl', 'cost per lead'], true),
  f(
    'cac',
    'Customer acquisition cost',
    'measure',
    'Efficiency',
    'currency',
    ['cac', 'customer acquisition cost', 'cost per customer', 'cost per new customer'],
    true
  ),
  f(
    'conversion_rate',
    'Conversion rate',
    'measure',
    'Efficiency',
    'percent',
    [
      'conversion rate',
      'cvr',
      'conv rate',
      'cr',
      'purchase rate',
      'signup rate',
      'lead conversion rate',
    ],
    true
  ),
  f(
    'aov',
    'Average order value',
    'measure',
    'Efficiency',
    'currency',
    [
      'aov',
      'average order value',
      'avg order value',
      'basket size',
      'avg basket',
      'average basket',
    ],
    true
  ),
  f(
    'arpu',
    'Revenue per user',
    'measure',
    'Efficiency',
    'currency',
    ['arpu', 'revenue per user', 'average revenue per user', 'arpa', 'revenue per customer'],
    true
  ),
  f(
    'ltv',
    'Lifetime value',
    'measure',
    'Efficiency',
    'currency',
    ['ltv', 'clv', 'lifetime value', 'customer lifetime value'],
    true
  ),
  f(
    'cart_abandonment_rate',
    'Cart abandonment rate',
    'measure',
    'Efficiency',
    'percent',
    ['cart abandonment', 'cart abandonment rate', 'abandonment rate', 'abandoned cart rate'],
    true
  ),
  f(
    'churn_rate',
    'Churn rate',
    'measure',
    'Efficiency',
    'percent',
    ['churn', 'churn rate', 'attrition rate', 'attrition'],
    true
  ),
  f(
    'retention_rate',
    'Retention rate',
    'measure',
    'Efficiency',
    'percent',
    ['retention', 'retention rate', 'repeat rate', 'repeat purchase rate'],
    true
  ),
  f(
    'gross_margin',
    'Gross margin',
    'measure',
    'Efficiency',
    'percent',
    ['margin', 'gross margin', 'margin pct', 'margin percent', 'profit margin'],
    true
  ),
  f(
    'engagement_rate',
    'Engagement rate',
    'measure',
    'Efficiency',
    'percent',
    ['engagement rate', 'engagement', 'interaction rate'],
    true
  ),
  f(
    'frequency',
    'Frequency',
    'measure',
    'Efficiency',
    'number',
    ['frequency', 'avg frequency', 'average frequency'],
    true
  ),
  f(
    'win_rate',
    'Win rate',
    'measure',
    'Efficiency',
    'percent',
    ['win rate', 'close rate', 'closing rate'],
    true
  ),
  f(
    'refund_rate',
    'Refund rate',
    'measure',
    'Efficiency',
    'percent',
    ['refund rate', 'return rate'],
    true
  ),
]

export const FIELD_BY_KEY: Record<string, CanonicalField> = Object.fromEntries(
  CANONICAL_FIELDS.map((c) => [c.key, c])
)

// ── derived metrics ─────────────────────────────────────────────────────────
// A derived metric is calculated from base fields. Each slot lists the fields
// that can fill it, in order of preference: Cost per acquisition can divide by
// conversions, orders or signups, whichever the file has.

export interface DerivedMetric {
  key: string
  label: string
  formula: string
  slots: { name: string; options: string[] }[]
  unit: FieldUnit
  // t(name) returns the summed value of the field chosen for that slot.
  calc: (t: (slot: string) => number | undefined) => number | null
}

const safeDiv = (a?: number, b?: number): number | null =>
  a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b) || b === 0
    ? null
    : a / b

export const DERIVED_METRICS: DerivedMetric[] = [
  {
    key: 'roas',
    label: 'ROAS',
    formula: 'Revenue ÷ Spend',
    unit: 'multiple',
    slots: [
      { name: 'revenue', options: ['revenue', 'order_value', 'subscription_fee', 'signup_fee'] },
      { name: 'spend', options: ['spend'] },
    ],
    calc: (t) => safeDiv(t('revenue'), t('spend')),
  },
  {
    key: 'roi',
    label: 'ROI',
    formula: '(Revenue − Spend) ÷ Spend',
    unit: 'percent',
    slots: [
      { name: 'revenue', options: ['revenue', 'order_value', 'subscription_fee', 'signup_fee'] },
      { name: 'spend', options: ['spend'] },
    ],
    calc: (t) => {
      const r = safeDiv((t('revenue') ?? NaN) - (t('spend') ?? NaN), t('spend'))
      return r === null ? null : r * 100
    },
  },
  {
    key: 'ctr',
    label: 'Click through rate',
    formula: 'Clicks ÷ Impressions',
    unit: 'percent',
    slots: [
      { name: 'clicks', options: ['clicks'] },
      { name: 'impressions', options: ['impressions'] },
    ],
    calc: (t) => {
      const r = safeDiv(t('clicks'), t('impressions'))
      return r === null ? null : r * 100
    },
  },
  {
    key: 'cpc',
    label: 'Cost per click',
    formula: 'Spend ÷ Clicks',
    unit: 'currency',
    slots: [
      { name: 'spend', options: ['spend'] },
      { name: 'clicks', options: ['clicks'] },
    ],
    calc: (t) => safeDiv(t('spend'), t('clicks')),
  },
  {
    key: 'cpm',
    label: 'Cost per thousand',
    formula: 'Spend ÷ Impressions × 1,000',
    unit: 'currency',
    slots: [
      { name: 'spend', options: ['spend'] },
      { name: 'impressions', options: ['impressions'] },
    ],
    calc: (t) => {
      const r = safeDiv(t('spend'), t('impressions'))
      return r === null ? null : r * 1000
    },
  },
  {
    key: 'cpa',
    label: 'Cost per acquisition',
    formula: 'Spend ÷ Conversions',
    unit: 'currency',
    slots: [
      { name: 'spend', options: ['spend'] },
      {
        name: 'conversions',
        options: ['conversions', 'orders', 'signups', 'installs', 'applications', 'subscriptions'],
      },
    ],
    calc: (t) => safeDiv(t('spend'), t('conversions')),
  },
  {
    key: 'cpl',
    label: 'Cost per lead',
    formula: 'Spend ÷ Leads',
    unit: 'currency',
    slots: [
      { name: 'spend', options: ['spend'] },
      { name: 'leads', options: ['leads'] },
    ],
    calc: (t) => safeDiv(t('spend'), t('leads')),
  },
  {
    key: 'cac',
    label: 'Customer acquisition cost',
    formula: 'Spend ÷ New customers',
    unit: 'currency',
    slots: [
      { name: 'spend', options: ['spend'] },
      { name: 'new_customers', options: ['new_customers'] },
    ],
    calc: (t) => safeDiv(t('spend'), t('new_customers')),
  },
  {
    key: 'conversion_rate',
    label: 'Conversion rate',
    formula: 'Conversions ÷ Clicks',
    unit: 'percent',
    slots: [
      { name: 'conversions', options: ['conversions', 'orders', 'signups', 'leads'] },
      { name: 'clicks', options: ['clicks', 'sessions'] },
    ],
    calc: (t) => {
      const r = safeDiv(t('conversions'), t('clicks'))
      return r === null ? null : r * 100
    },
  },
  {
    key: 'aov',
    label: 'Average order value',
    formula: 'Revenue ÷ Orders',
    unit: 'currency',
    slots: [
      { name: 'revenue', options: ['revenue', 'order_value'] },
      { name: 'orders', options: ['orders'] },
    ],
    calc: (t) => safeDiv(t('revenue'), t('orders')),
  },
  {
    key: 'arpu',
    label: 'Revenue per user',
    formula: 'Revenue ÷ Customers',
    unit: 'currency',
    slots: [
      { name: 'revenue', options: ['revenue', 'subscription_fee'] },
      { name: 'customers', options: ['customers', 'users'] },
    ],
    calc: (t) => safeDiv(t('revenue'), t('customers')),
  },
  {
    key: 'cart_abandonment_rate',
    label: 'Cart abandonment rate',
    formula: '1 − Orders ÷ Carts',
    unit: 'percent',
    slots: [
      { name: 'orders', options: ['orders'] },
      { name: 'carts', options: ['add_to_carts', 'checkouts'] },
    ],
    calc: (t) => {
      const r = safeDiv(t('orders'), t('carts'))
      return r === null ? null : (1 - r) * 100
    },
  },
  {
    key: 'churn_rate',
    label: 'Churn rate',
    formula: 'Churned ÷ Customers at start',
    unit: 'percent',
    slots: [
      { name: 'churned', options: ['churned', 'cancellations'] },
      { name: 'start', options: ['customers_start', 'customers'] },
    ],
    calc: (t) => {
      const r = safeDiv(t('churned'), t('start'))
      return r === null ? null : r * 100
    },
  },
  {
    key: 'gross_margin',
    label: 'Gross margin',
    formula: '(Revenue − Cost of goods) ÷ Revenue',
    unit: 'percent',
    slots: [
      { name: 'revenue', options: ['revenue'] },
      { name: 'cogs', options: ['cogs'] },
    ],
    calc: (t) => {
      const r = safeDiv((t('revenue') ?? NaN) - (t('cogs') ?? NaN), t('revenue'))
      return r === null ? null : r * 100
    },
  },
  {
    key: 'frequency',
    label: 'Frequency',
    formula: 'Impressions ÷ Reach',
    unit: 'number',
    slots: [
      { name: 'impressions', options: ['impressions'] },
      { name: 'reach', options: ['reach'] },
    ],
    calc: (t) => safeDiv(t('impressions'), t('reach')),
  },
  {
    key: 'win_rate',
    label: 'Win rate',
    formula: 'Closed won ÷ Opportunities',
    unit: 'percent',
    slots: [
      { name: 'won', options: ['closed_won'] },
      { name: 'opps', options: ['opportunities'] },
    ],
    calc: (t) => {
      const r = safeDiv(t('won'), t('opps'))
      return r === null ? null : r * 100
    },
  },
  {
    key: 'refund_rate',
    label: 'Refund rate',
    formula: 'Refunds ÷ Revenue',
    unit: 'percent',
    slots: [
      { name: 'refunds', options: ['refunds'] },
      { name: 'revenue', options: ['revenue'] },
    ],
    calc: (t) => {
      const r = safeDiv(t('refunds'), t('revenue'))
      return r === null ? null : r * 100
    },
  },
]

// ── name normalization ──────────────────────────────────────────────────────

const NOISE = new Set([
  'total',
  'sum',
  'amount',
  'amt',
  'number',
  'num',
  'no',
  'of',
  'the',
  'usd',
  'count',
  'all',
])

export function normalizeName(raw: string): string {
  return String(raw || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[\(\[][^\)\]]*[\)\]]/g, ' ')
    .toLowerCase()
    .replace(/[_\-./\\:]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function coreTokens(norm: string): string[] {
  const toks = norm.split(' ').filter(Boolean)
  const core = toks.filter((t) => !NOISE.has(t))
  return core.length > 0 ? core : toks
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 2) return 3
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
  return dp[a.length][b.length]
}

// Names that could honestly mean more than one thing. These never map
// silently: the user is asked, with these as the first options.
const AMBIGUOUS: Record<string, { candidates: string[]; note: string }> = {
  cost: {
    candidates: ['spend', 'cogs', 'shipping_cost'],
    note: 'Cost can be ad spend, cost of goods or shipping.',
  },
  costs: {
    candidates: ['spend', 'cogs', 'shipping_cost'],
    note: 'Costs can be ad spend, cost of goods or shipping.',
  },
  'cash flow': {
    candidates: ['revenue', 'gross_profit', 'order_value'],
    note: 'Cash flow can be revenue, profit or revenue per order.',
  },
  cashflow: {
    candidates: ['revenue', 'gross_profit', 'order_value'],
    note: 'Cash flow can be revenue, profit or revenue per order.',
  },
  amount: {
    candidates: ['revenue', 'spend', 'order_value'],
    note: 'Amount can be money in or money out.',
  },
  value: {
    candidates: ['revenue', 'order_value', 'pipeline_value'],
    note: 'Value can mean several kinds of money.',
  },
  total: { candidates: ['revenue', 'orders', 'spend'], note: 'Total can mean money or a count.' },
  income: { candidates: ['revenue', 'gross_profit'], note: 'Income can be revenue or profit.' },
  earnings: { candidates: ['revenue', 'gross_profit'], note: 'Earnings can be revenue or profit.' },
  payments: {
    candidates: ['revenue', 'order_value', 'fees'],
    note: 'Payments can be money in or fees.',
  },
  sales: {
    candidates: ['revenue', 'orders', 'units_sold'],
    note: 'Sales can be dollars, orders or units.',
  },
  results: {
    candidates: ['conversions', 'orders', 'leads'],
    note: 'Results can be purchases, signups or leads.',
  },
  users: {
    candidates: ['users', 'customers', 'sessions'],
    note: 'Users can be visitors or paying customers.',
  },
  visits: {
    candidates: ['sessions', 'users', 'page_views'],
    note: 'Visits can be sessions or unique visitors.',
  },
  views: {
    candidates: ['impressions', 'page_views', 'video_views'],
    note: 'Views can be ad impressions, page views or video views.',
  },
  engagement: {
    candidates: ['engagement_rate', 'clicks', 'likes'],
    note: 'Engagement can be a rate or a count.',
  },
  growth: {
    candidates: ['revenue', 'customers', 'sessions'],
    note: 'Growth needs a base measure to compare against.',
  },
  performance: {
    candidates: ['revenue', 'conversions', 'roas'],
    note: 'Performance is not one measure.',
  },
  budget: { candidates: ['budget', 'spend'], note: 'Budget is the plan, not what was spent.' },
}

// ── matching ────────────────────────────────────────────────────────────────

export type MatchStatus = 'auto' | 'review' | 'question' | 'custom'
export type MatchLayer = 'exact' | 'fuzzy' | 'values' | 'ai' | 'remembered' | 'user' | 'none'

export interface ColumnInput {
  name: string
  role?: 'date' | 'metric' | 'dimension' | 'unknown'
  // up to 50 non empty sample values
  values: any[]
}

export interface ColumnMatch {
  column: string
  field: string | null
  confidence: number
  status: MatchStatus
  layer: MatchLayer
  candidates: string[]
  note?: string
}

export const AUTO_THRESHOLD = 0.85
export const REVIEW_THRESHOLD = 0.55

interface SynIndex {
  exact: Map<string, string>
  list: { syn: string; key: string; tokens: string[] }[]
}

let _index: SynIndex | null = null
function synIndex(): SynIndex {
  if (_index) return _index
  const exact = new Map<string, string>()
  const list: SynIndex['list'] = []
  for (const c of CANONICAL_FIELDS) {
    for (const s of [c.label, ...c.synonyms]) {
      const n = normalizeName(s)
      if (!n) continue
      if (!exact.has(n)) exact.set(n, c.key)
      list.push({ syn: n, key: c.key, tokens: n.split(' ') })
    }
  }
  // longest synonyms first so "cost per click" wins over "cost"
  list.sort((a, b) => b.syn.length - a.syn.length)
  _index = { exact, list }
  return _index
}

const RATIO_WORDS = new Set(['per', 'rate', 'ratio', 'pct', 'percent', 'avg', 'average', 'share'])

function valueStats(values: any[]) {
  const nums = values
    .map((v) => (typeof v === 'number' ? v : NaN))
    .filter((v) => Number.isFinite(v))
  if (nums.length === 0) return null
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const intShare = nums.filter((n) => Number.isInteger(n)).length / nums.length
  return { min, max, intShare, n: nums.length }
}

function nameMatch(raw: string): {
  field: string | null
  confidence: number
  candidates: string[]
  layer: MatchLayer
  note?: string
} {
  const norm = normalizeName(raw)
  if (!norm) return { field: null, confidence: 0, candidates: [], layer: 'none' }
  const idx = synIndex()
  const toks = norm.split(' ')
  const core = coreTokens(norm)
  const coreStr = core.join(' ')

  const amb = AMBIGUOUS[norm] || AMBIGUOUS[coreStr]
  if (amb)
    return {
      field: null,
      confidence: 0.45,
      candidates: amb.candidates,
      layer: 'exact',
      note: amb.note,
    }

  const hit = idx.exact.get(norm) || idx.exact.get(coreStr)
  if (hit) return { field: hit, confidence: 0.95, candidates: [hit], layer: 'exact' }

  // multiword synonym fully contained in the column name
  const hasRatioWord = toks.some((t) => RATIO_WORDS.has(t))
  for (const e of idx.list) {
    if (e.tokens.length >= 2 && e.tokens.every((t) => toks.includes(t))) {
      return { field: e.key, confidence: 0.72, candidates: [e.key], layer: 'fuzzy' }
    }
  }
  // single word synonym inside the name, only when the name is not a ratio phrase
  if (!hasRatioWord) {
    for (const e of idx.list) {
      if (e.tokens.length === 1 && e.syn.length >= 4 && core.includes(e.syn)) {
        const amb2 = AMBIGUOUS[e.syn]
        if (amb2)
          return {
            field: null,
            confidence: 0.45,
            candidates: amb2.candidates,
            layer: 'fuzzy',
            note: amb2.note,
          }
        return { field: e.key, confidence: 0.62, candidates: [e.key], layer: 'fuzzy' }
      }
    }
  }
  // typos: close to a single word or short phrase synonym
  if (coreStr.length >= 5) {
    let best: { key: string; d: number } | null = null
    for (const e of idx.list) {
      if (e.syn.length < 5) continue
      const d = editDistance(coreStr, e.syn)
      const limit = e.syn.length >= 9 ? 2 : 1
      if (d <= limit && (!best || d < best.d)) best = { key: e.key, d }
    }
    if (best) return { field: best.key, confidence: 0.76, candidates: [best.key], layer: 'fuzzy' }
  }
  return { field: null, confidence: 0, candidates: [], layer: 'none' }
}

// One column to a match. Layer 3 looks at the values: a field that should be a
// dollar amount but holds numbers between 0 and 1 is probably a rate, and a
// count that holds decimals is probably not a count. Those get downgraded so
// the user is asked instead of trusting the name.
export function matchColumn(col: ColumnInput): ColumnMatch {
  const nm = nameMatch(col.name)
  const stats = valueStats(col.values)
  let { confidence } = nm
  let note = nm.note
  let layer = nm.layer

  if (nm.field && stats) {
    const fld = FIELD_BY_KEY[nm.field]
    if (
      fld.kind === 'measure' &&
      fld.unit === 'currency' &&
      stats.max <= 1 &&
      stats.intShare < 0.5
    ) {
      confidence = Math.min(confidence, 0.5)
      note = `The values run between ${stats.min} and ${stats.max}, which looks more like a rate than money.`
      layer = 'values'
    } else if (fld.kind === 'measure' && fld.unit === 'count' && stats.intShare < 0.6) {
      confidence = Math.min(confidence, 0.5)
      note = 'The values have decimals, which is unusual for a count.'
      layer = 'values'
    }
    if (fld.kind === 'dimension' && col.role === 'metric' && fld.unit === 'text') {
      confidence = Math.min(confidence, 0.5)
      note = 'This column holds numbers, which is unusual for a label.'
      layer = 'values'
    }
  }

  const status: MatchStatus =
    !nm.field && nm.candidates.length === 0
      ? 'custom'
      : confidence >= AUTO_THRESHOLD
        ? 'auto'
        : confidence >= REVIEW_THRESHOLD
          ? 'review'
          : 'question'

  return {
    column: col.name,
    field: status === 'question' || status === 'custom' ? null : nm.field,
    confidence,
    status,
    layer,
    candidates:
      nm.field && !nm.candidates.includes(nm.field)
        ? [nm.field, ...nm.candidates]
        : nm.candidates.length
          ? nm.candidates
          : nm.field
            ? [nm.field]
            : [],
    note,
  }
}

export function matchColumns(
  cols: ColumnInput[],
  remembered: Record<string, string> = {}
): ColumnMatch[] {
  const out = cols.map((c) => {
    const rem = remembered[normalizeName(c.name)]
    if (rem && (FIELD_BY_KEY[rem] || rem === 'custom')) {
      return {
        column: c.name,
        field: rem === 'custom' ? null : rem,
        confidence: 1,
        status: (rem === 'custom' ? 'custom' : 'auto') as MatchStatus,
        layer: 'remembered' as MatchLayer,
        candidates: rem === 'custom' ? [] : [rem],
      }
    }
    return matchColumn(c)
  })
  // Two columns on the same date or ID style field are fine. Two on the same
  // measure (Spend and Budget both mapped to spend) are summed later, so flag
  // the weaker one for review rather than guessing which is right.
  const seen = new Map<string, ColumnMatch>()
  for (const m of out) {
    if (!m.field || m.status === 'custom') continue
    const fld = FIELD_BY_KEY[m.field]
    if (!fld || fld.kind !== 'measure') continue
    const prev = seen.get(m.field)
    if (prev && prev.layer !== 'remembered' && m.layer !== 'remembered') {
      const weaker = prev.confidence >= m.confidence ? m : prev
      if (weaker.status === 'auto') weaker.status = 'review'
      weaker.note = `${prev.column} and ${m.column} both look like ${fld.label}. They will be added together.`
    } else if (!prev) seen.set(m.field, m)
  }
  return out
}

// ── what can be calculated ──────────────────────────────────────────────────

export type FieldMapping = Record<string, string> // column name -> canonical key

export interface MetricAvailability {
  metric: DerivedMetric
  // column names filling each slot, when available
  sources: Record<string, string[]>
  fields: Record<string, string>
  missing: string[] // slot names with no mapped field
  haveAny: boolean
}

export function metricAvailability(
  mapping: FieldMapping,
  existingColumns: string[] = []
): MetricAvailability[] {
  const byField = new Map<string, string[]>()
  for (const [col, key] of Object.entries(mapping)) {
    if (!key || key === 'custom') continue
    byField.set(key, [...(byField.get(key) || []), col])
  }
  const existing = new Set(existingColumns.map(normalizeName))
  return DERIVED_METRICS.filter(
    (m) => !byField.has(m.key) && !existing.has(normalizeName(m.label))
  ).map((metric) => {
    const sources: Record<string, string[]> = {}
    const fields: Record<string, string> = {}
    const missing: string[] = []
    let haveAny = false
    for (const slot of metric.slots) {
      const opt = slot.options.find((o) => byField.has(o))
      if (opt) {
        sources[slot.name] = byField.get(opt)!
        fields[slot.name] = opt
        haveAny = true
      } else missing.push(slot.name)
    }
    return { metric, sources, fields, missing, haveAny }
  })
}

export function slotLabel(metric: DerivedMetric, slotName: string): string {
  const slot = metric.slots.find((s) => s.name === slotName)
  if (!slot) return slotName
  const labels = slot.options.slice(0, 2).map((o) => FIELD_BY_KEY[o]?.label.toLowerCase() || o)
  return labels.join(' or ')
}

export function measureOptions(): CanonicalField[] {
  return CANONICAL_FIELDS.filter((c) => c.kind === 'measure')
}

export function allOptions(): CanonicalField[] {
  return CANONICAL_FIELDS
}

// Unmatched numeric columns are the ones worth a closer look by the AI layer.
export function needsAiLook(m: ColumnMatch, col: ColumnInput): boolean {
  return (m.status === 'custom' && col.role === 'metric') || m.status === 'question'
}

// Names used for calculated metrics. Short codes where ampli's benchmark code
// already treats the name as a rate (ROAS, CTR, CPC and so on), so a derived
// metric is stored as a level and not as a growth figure.
export const METRIC_DISPLAY_NAME: Record<string, string> = {
  roas: 'ROAS',
  roi: 'ROI',
  ctr: 'CTR',
  cpc: 'CPC',
  cpm: 'CPM',
  cpa: 'CPA',
  cpl: 'CPL',
  cac: 'CAC',
  aov: 'AOV',
  arpu: 'ARPU',
  conversion_rate: 'Conversion rate',
  cart_abandonment_rate: 'Cart abandonment rate',
  churn_rate: 'Churn rate',
  gross_margin: 'Gross margin',
  frequency: 'Frequency',
  win_rate: 'Win rate',
  refund_rate: 'Refund rate',
}
