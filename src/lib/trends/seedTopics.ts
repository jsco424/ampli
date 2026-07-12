// Phase 1 seed list — 18 topics across 3 categories, per the spec's
// "15-20 seed topics across 3 categories" MVP scope. Auto, Education, and
// Finance chosen as a reasonable starting set — swap these for whichever
// categories actually overlap most with your existing Crowd Insights
// client base once that data is available to check against.
//
// This is a one-time seed — after running it, edit topics directly in the
// trend_topics table (add/deactivate) rather than re-running this file.

export interface SeedTopic {
  topic: string
  category: 'auto' | 'education' | 'home' | 'finance' | 'travel' | 'tech'
  wikipedia_article: string
  reddit_subreddits: string[]
  reddit_query: string
  youtube_query: string
}

export const SEED_TOPICS: SeedTopic[] = [
  // ── Auto ──────────────────────────────────────────────────────────────
  {
    topic: 'Tesla Model 3',
    category: 'auto',
    wikipedia_article: 'Tesla_Model_3',
    reddit_subreddits: ['teslamotors', 'cars'],
    reddit_query: 'Model 3',
    youtube_query: 'Tesla Model 3 review',
  },
  {
    topic: 'Electric Vehicle Tax Credit',
    category: 'auto',
    wikipedia_article: 'Government_incentives_for_fuel_efficient_vehicles_in_the_United_States',
    reddit_subreddits: ['electricvehicles', 'personalfinance'],
    reddit_query: 'EV tax credit',
    youtube_query: 'EV tax credit explained',
  },
  {
    topic: 'Toyota RAV4',
    category: 'auto',
    wikipedia_article: 'Toyota_RAV4',
    reddit_subreddits: ['toyota', 'cars'],
    reddit_query: 'RAV4',
    youtube_query: 'Toyota RAV4 review',
  },
  {
    topic: 'Ford F-150',
    category: 'auto',
    wikipedia_article: 'Ford_F-Series',
    reddit_subreddits: ['f150', 'trucks'],
    reddit_query: 'F-150',
    youtube_query: 'Ford F-150 review',
  },
  {
    topic: 'Used Car Prices',
    category: 'auto',
    wikipedia_article: 'Used_car',
    reddit_subreddits: ['cars', 'whatcarshouldIbuy'],
    reddit_query: 'used car prices',
    youtube_query: 'used car market 2026',
  },
  {
    topic: 'Car Insurance Rates',
    category: 'auto',
    wikipedia_article: 'Vehicle_insurance',
    reddit_subreddits: ['personalfinance', 'insurance'],
    reddit_query: 'car insurance rates',
    youtube_query: 'car insurance rates rising',
  },
  // ── Education ─────────────────────────────────────────────────────────
  {
    topic: 'FAFSA',
    category: 'education',
    wikipedia_article: 'FAFSA',
    reddit_subreddits: ['fafsa', 'financialaid', 'college'],
    reddit_query: 'FAFSA',
    youtube_query: 'FAFSA 2026 guide',
  },
  {
    topic: 'Community College',
    category: 'education',
    wikipedia_article: 'Community_college',
    reddit_subreddits: ['college', 'communitycollege'],
    reddit_query: 'community college',
    youtube_query: 'community college worth it',
  },
  {
    topic: 'Student Loan Forgiveness',
    category: 'education',
    wikipedia_article: 'Public_Service_Loan_Forgiveness',
    reddit_subreddits: ['studentloans', 'personalfinance'],
    reddit_query: 'student loan forgiveness',
    youtube_query: 'student loan forgiveness update',
  },
  {
    topic: 'College Application',
    category: 'education',
    wikipedia_article: 'Common_Application',
    reddit_subreddits: ['ApplyingToCollege'],
    reddit_query: 'college application',
    youtube_query: 'college application tips',
  },
  {
    topic: 'Trade School',
    category: 'education',
    wikipedia_article: 'Vocational_school',
    reddit_subreddits: ['tradeworkers', 'skilledtrades'],
    reddit_query: 'trade school',
    youtube_query: 'trade school vs college',
  },
  {
    topic: 'SAT/ACT Test Prep',
    category: 'education',
    wikipedia_article: 'SAT',
    reddit_subreddits: ['SAT', 'ACT'],
    reddit_query: 'test prep',
    youtube_query: 'SAT prep 2026',
  },
  // ── Finance ───────────────────────────────────────────────────────────
  {
    topic: 'High Yield Savings Account',
    category: 'finance',
    wikipedia_article: 'High-yield_savings_account',
    reddit_subreddits: ['personalfinance', 'churning'],
    reddit_query: 'high yield savings',
    youtube_query: 'best high yield savings account',
  },
  {
    topic: 'Roth IRA',
    category: 'finance',
    wikipedia_article: 'Roth_IRA',
    reddit_subreddits: ['personalfinance', 'investing'],
    reddit_query: 'Roth IRA',
    youtube_query: 'Roth IRA explained',
  },
  {
    topic: 'Mortgage Rates',
    category: 'finance',
    wikipedia_article: 'Mortgage_loan',
    reddit_subreddits: ['personalfinance', 'realestate'],
    reddit_query: 'mortgage rates',
    youtube_query: 'mortgage rates forecast',
  },
  {
    topic: 'Credit Card Rewards',
    category: 'finance',
    wikipedia_article: 'Credit_card',
    reddit_subreddits: ['CreditCards', 'churning'],
    reddit_query: 'credit card rewards',
    youtube_query: 'best credit card rewards 2026',
  },
  {
    topic: 'Buy Now Pay Later',
    category: 'finance',
    wikipedia_article: 'Buy_now,_pay_later',
    reddit_subreddits: ['personalfinance'],
    reddit_query: 'buy now pay later',
    youtube_query: 'buy now pay later debt',
  },
  {
    topic: 'Emergency Fund',
    category: 'finance',
    wikipedia_article: 'Emergency_fund',
    reddit_subreddits: ['personalfinance'],
    reddit_query: 'emergency fund',
    youtube_query: 'how much emergency fund',
  },
]
