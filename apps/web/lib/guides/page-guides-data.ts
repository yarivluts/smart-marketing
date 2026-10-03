export interface MarketingTerm {
  term: string;
  simpleDefinition: string;
  analogy: string;
  whyItMatters: string;
  formulaOrExample?: string;
}

export interface PageGuideData {
  pageKey: string;
  title: string;
  subtitle: string;
  badge: string;
  simpleExplanation: {
    whatItIs: string;
    whyYouCare: string;
    plainEnglishSummary: string;
  };
  terms: MarketingTerm[];
  theory: {
    coreConcept: string;
    economicPrinciples: string[];
    commonMistakes: string[];
    industryBenchmark?: string;
  };
  actionPlaybook: {
    dailyRoutine: string[];
    redFlags: string[];
    recommendedActions: string[];
  };
  copilotQueryPrompt: string;
}

export const PAGE_GUIDES_EN: Record<string, PageGuideData> = {
  pulse: {
    pageKey: 'pulse',
    title: 'Executive Pulse & Command Center',
    subtitle: 'The 30,000-foot view of your revenue, ad spend, and live customer conversions.',
    badge: 'Executive Overview',
    simpleExplanation: {
      whatItIs:
        'This is the flight deck of your business. It brings together your marketing ad spend, paying customer conversions, and revenue velocity into a single real-time dashboard.',
      whyYouCare:
        'Instead of logging into 5 different platforms (Meta, Google, Stripe, GA4, HubSpot) and guessing if today was profitable, Pulse tells you immediately whether you are making or losing money.',
      plainEnglishSummary:
        'Think of this page as your speedometer and fuel gauge. If spend is higher than revenue pacing, or conversion rates suddenly drop, you can catch it intraday before burning your monthly budget.',
    },
    terms: [
      {
        term: 'Blended ROAS (Return On Ad Spend)',
        simpleDefinition: 'Total attributed revenue divided by total ad spend across all channels combined.',
        analogy: 'If you put $1 into a vending machine and it gives you back $3.50 worth of snacks, your ROAS is 3.5x.',
        whyItMatters: 'Tells you if your overall marketing machine is profitable or losing money.',
        formulaOrExample: 'ROAS = Total Revenue / Total Spend (e.g., $35,000 / $10,000 = 3.5x)',
      },
      {
        term: 'Blended CAC (Customer Acquisition Cost)',
        simpleDefinition: 'The average amount of marketing money spent to acquire one single paying customer.',
        analogy: 'If you spent $1,000 on bait and gas and caught 10 fish, each fish cost you $100.',
        whyItMatters: 'If your CAC is higher than what customers pay you, your business loses money with every sale.',
        formulaOrExample: 'Blended CAC = Total Marketing Spend / New Paying Customers',
      },
      {
        term: 'MRR Velocity',
        simpleDefinition: 'The speed and acceleration at which new Monthly Recurring Revenue is being added.',
        analogy: 'Like the speedometer in a sports car — it shows how fast your recurring cash engine is accelerating.',
        whyItMatters: 'Investors and founders look at velocity to forecast whether the company will hit year-end targets.',
        formulaOrExample: 'Net New MRR = (New MRR + Expansion MRR) - (Churned MRR + Contraction MRR)',
      },
      {
        term: 'Intraday Spend Pacing',
        simpleDefinition: 'How evenly your daily ad budget is being consumed throughout the 24 hours of the day.',
        analogy: 'Pacing yourself during a marathon so you do not burn all your stamina in the first 2 miles.',
        whyItMatters: 'Prevents ad networks from dumping your entire daily budget on low-quality clicks at 3 AM.',
      },
    ],
    theory: {
      coreConcept:
        'Real-time feedback loops beat post-mortem spreadsheets. Modern digital ad algorithms (Meta & Google) adjust bids by the minute; monitoring them daily instead of monthly keeps acquisition costs down.',
      economicPrinciples: [
        'Law of Diminishing Returns: Increasing ad spend by 2x rarely doubles sales; monitoring blended returns shows the optimal spend ceiling.',
        'Golden Unit Economics Ratio: Customer Lifetime Value (LTV) should be at least 3x your Customer Acquisition Cost (LTV:CAC >= 3:1).',
      ],
      commonMistakes: [
        'Looking only at vanity metrics (likes, impressions, clicks) rather than paying customer conversions.',
        'Pausing campaigns too quickly based on a single slow morning instead of looking at statistical trends.',
      ],
      industryBenchmark: 'Healthy SaaS companies maintain a Blended ROAS above 3.0x and CAC payback under 12 months.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'Check the live conversion ticker to ensure real transactions are landing.',
        'Verify that today spend is pacing proportionally to the time of day.',
        'Inspect the Blended ROAS scorecard against your minimum target threshold.',
      ],
      redFlags: [
        'Spend is above 75% by midday with zero paying customer conversions.',
        'Blended CAC jumped more than 30% week-over-week without an intentional campaign experiment.',
      ],
      recommendedActions: [
        'If ROAS is above 4.0x: ask Copilot to scale your top-performing campaign budget by 15-20%.',
        'If CAC is spiking: review the Funnel page to identify which onboarding step has higher drop-off.',
      ],
    },
    copilotQueryPrompt: 'What is our current blended CAC and ROAS today, and which campaign is delivering the highest return?',
  },

  campaigns: {
    pageKey: 'campaigns',
    title: 'Ad Cockpit & Cross-Channel Campaigns',
    subtitle: 'Manage paid advertising across Google, Meta, and TikTok with live spend and creative fatigue tracking.',
    badge: 'Marketing & Ad Cockpit',
    simpleExplanation: {
      whatItIs:
        'This page shows all your active paid ad campaigns from Google, Meta (Facebook/Instagram), and TikTok in one organized cockpit. You can toggle campaigns on/off and scale budgets directly.',
      whyYouCare:
        'Different ad platforms report different numbers and try to take all the credit. This cockpit gives you the objective truth on which ad creatives and channels actually generate sales.',
      plainEnglishSummary:
        'Imagine having all your billboard, radio, and social media campaigns on one control board. You can see which creative image is tired, which headline brings buyers, and change budgets with 1 click.',
    },
    terms: [
      {
        term: 'CAC (Customer Acquisition Cost)',
        simpleDefinition: 'The specific cost on this campaign to generate one converted customer.',
        analogy: 'How much you paid to get one customer through the door from this specific billboard.',
        whyItMatters: 'Allows you to compare whether Google Search is cheaper or more expensive than Meta Video.',
        formulaOrExample: 'Campaign Spend / Conversions = Campaign CAC',
      },
      {
        term: 'ROAS (Return On Ad Spend)',
        simpleDefinition: 'The dollars generated for every dollar spent on this specific campaign.',
        analogy: 'If you give an employee $100 and they bring back $400 in contracts, that is 4x ROAS.',
        whyItMatters: 'The gold standard efficiency metric for advertising.',
        formulaOrExample: 'Attributed Sales Revenue / Ad Spend',
      },
      {
        term: 'Creative Fatigue',
        simpleDefinition: 'When an audience has seen your ad image or video too many times and stops clicking.',
        analogy: 'Hearing the same catchy radio song 50 times in one day until it becomes annoying background noise.',
        whyItMatters: 'Fatigued ads cost more per click. Swapping new creative images resets the performance.',
      },
      {
        term: 'Retargeting vs. Prospecting',
        simpleDefinition: 'Prospecting talks to strangers who never heard of you; Retargeting reminds people who already visited.',
        analogy: 'Prospecting is handing out flyers on the street; Retargeting is calling someone who asked for a quote yesterday.',
        whyItMatters: 'Retargeting usually has much higher ROAS, but you need prospecting to feed new people into the top.',
      },
    ],
    theory: {
      coreConcept:
        'Creative is the new targeting. With privacy changes and AI bidding algorithms, having engaging, high-converting video and image variations matters more than complex audience tweaking.',
      economicPrinciples: [
        'Ad Wear-out Effect: High frequency (>3.5 impressions per user) causes CTR to plummet and CPA to climb.',
        'Marginal Cost per Acquisition: Scaling a single campaign too fast floods the audience, increasing your marginal CAC.',
      ],
      commonMistakes: [
        'Scaling budgets by 100% overnight (which resets the ad platform AI learning phase). Increase by 15-25% at a time.',
        'Keeping the same image or video running for 6 months without testing new variants.',
      ],
      industryBenchmark: 'Top B2B SaaS campaigns achieve 3.5x - 5.0x ROAS with CTRs above 1.8%.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'Check the Creative Fatigue radar for any campaigns flagged in Amber or Red.',
        'Compare Meta vs Google ROAS to see where today spend is most effective.',
        'Review AI Proactive Recommendations for quick budget shifts.',
      ],
      redFlags: [
        'Campaign frequency is above 4.0 and CTR has dropped below 0.8%.',
        'Spend is high but 0 conversions recorded over 48 hours.',
      ],
      recommendedActions: [
        'For high-fatigue ads: click the creative thumbnail to swap in a fresh visual asset.',
        'For winning campaigns (ROAS > 4.0x): click inline budget edit and increase by 20%.',
      ],
    },
    copilotQueryPrompt: 'Which campaigns currently have the highest creative fatigue and what budget rebalancing do you recommend?',
  },

  funnel: {
    pageKey: 'funnel',
    title: 'Conversion Funnel & Goal Velocity',
    subtitle: 'Track visitor progression through each step of your onboarding and identify where users drop off.',
    badge: 'Product & Telemetry',
    simpleExplanation: {
      whatItIs:
        'A visual map showing the journey a customer takes: from first clicking an ad, to visiting your website, starting signup, and finally becoming a paying subscriber.',
      whyYouCare:
        'If you spend $10,000 on ads to get 1,000 visitors, but 90% leave on step 2, you just wasted $9,000. Finding and fixing the broken step fixes your business.',
      plainEnglishSummary:
        'Think of a funnel like a physical store: 100 people walk by the window, 40 step inside, 15 try on a shirt, and 5 buy it. This page tells you exactly which fitting room door is stuck.',
    },
    terms: [
      {
        term: 'Conversion Rate (CVR)',
        simpleDefinition: 'The percentage of users who successfully move from one step to the next.',
        analogy: 'Out of 10 basketball shots, if you make 4, your conversion rate is 40%.',
        whyItMatters: 'A 1% increase in conversion rate can double your profit without spending a dime more on ads.',
        formulaOrExample: '(Users Completing Step / Users Entering Step) * 100',
      },
      {
        term: 'Drop-off / Churn Point',
        simpleDefinition: 'The exact step where the highest percentage of visitors abandon the process.',
        analogy: 'A hole in a bucket where water is leaking out before it reaches the garden.',
        whyItMatters: 'Shows you where user frustration, confusion, or technical bugs are happening.',
      },
      {
        term: 'Micro-Conversion',
        simpleDefinition: 'Small commitments a user makes before buying (like verifying email or uploading a logo).',
        analogy: 'Saying yes to coffee before agreeing to get married.',
        whyItMatters: 'Users who complete 2 micro-conversions are 5x more likely to purchase.',
      },
      {
        term: 'Goal Linear Pace',
        simpleDefinition: 'Whether your current daily conversion rate is fast enough to hit this month target.',
        analogy: 'Checking if your train is on schedule to reach the station on time.',
        whyItMatters: 'Gives you advance warning on day 10 of the month instead of surprising you on day 30.',
      },
    ],
    theory: {
      coreConcept:
        'Friction kills conversions. Every extra form field, slow page load, or confusing button cuts your conversion rate by 10-20%. Optimizing the funnel multiplies the return on all marketing channels.',
      economicPrinciples: [
        'Compounding Conversion Lift: Improving 3 funnel steps by 10% each results in a 33% overall revenue increase.',
        'Top vs Bottom Leverage: Fixing bottom-of-funnel checkout issues yields immediate cash; fixing top-of-funnel builds long-term pipeline.',
      ],
      commonMistakes: [
        'Pouring more ad spend into a leaky funnel instead of fixing the onboarding flow.',
        'Asking for credit card details too early before the user has seen any product value.',
      ],
      industryBenchmark: 'Top B2B SaaS funnels convert 35-45% from visit to trial, and 15-25% from trial to paid.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'Check Overall Conversion percentage against the 30-day baseline.',
        'Inspect the step with the red warning indicator to see today drop-off rate.',
        'Review Goal Thermometer cards to ensure milestones are marked On Track.',
      ],
      redFlags: [
        'A sudden drop of more than 15% in step 2 (signup) usually means an API error or broken form.',
        'Mobile conversion rate is less than half of desktop conversion rate.',
      ],
      recommendedActions: [
        'If signup drop-off is high: reduce required form fields and enable Google/GitHub 1-click login.',
        'If trial-to-paid is low: set up an automated email sequence prompting the user to activate key features.',
      ],
    },
    copilotQueryPrompt: 'Where is the highest drop-off in our conversion funnel right now, and what steps will improve it?',
  },

  cohorts: {
    pageKey: 'cohorts',
    title: '12/24-Month Acquisition Cohort & Breakeven Matrix',
    subtitle: 'Track historical customer payback periods and cash maturation curves across monthly signup groups.',
    badge: 'Economics & Cohorts',
    simpleExplanation: {
      whatItIs:
        'This matrix groups customers by the month they joined (a cohort) and tracks how much money they have paid you over 1, 3, 6, 12, and 24 months compared to what it cost to acquire them.',
      whyYouCare:
        'Most SaaS companies lose money on day 1 because ad costs are higher than the first month subscription. This page shows you the exact month your customers pay off their acquisition debt and become pure profit.',
      plainEnglishSummary:
        'Think of each month signups like planting an apple orchard. Month 1 costs money for seeds and water. By Month 5, the trees start bearing fruit. This matrix tells you how long until you make your money back.',
    },
    terms: [
      {
        term: 'Acquisition Cohort',
        simpleDefinition: 'A group of customers who all signed up during the exact same calendar month.',
        analogy: 'The high school graduating class of 2024 — they all entered at the same time and can be tracked over years.',
        whyItMatters: 'Allows you to see if your product and marketing are getting better or worse over time.',
      },
      {
        term: 'CAC Payback Period',
        simpleDefinition: 'The number of months it takes for a customer subscription payments to equal what you spent to get them.',
        analogy: 'If you buy a rental property for $100k and it yields $10k/year in rent, payback is 10 years.',
        whyItMatters: 'The shorter the payback, the faster you can reinvest cash into buying more ads without running out of money.',
        formulaOrExample: 'Breakeven reached when Cumulative Revenue >= Initial Acquisition Spend',
      },
      {
        term: 'Net Revenue Retention (NRR)',
        simpleDefinition: 'The percentage of recurring revenue retained from a cohort over time, including upgrades and cancellations.',
        analogy: 'If you start with 100 cows, and next year you have 110 cows (because calves outweighed any lost cows), NRR is 110%.',
        whyItMatters: 'If NRR is over 100%, your business grows every year even if you stop acquiring new customers completely.',
      },
      {
        term: 'Breakeven Month (M0..M24)',
        simpleDefinition: 'The milestone period (e.g. Month 4) where cumulative revenue crosses 100% of marketing spend.',
        analogy: 'The exact day you pay off your car loan and start keeping 100% of your paycheck.',
        whyItMatters: 'Fast breakeven (<6 months) is the hallmark of elite high-growth companies.',
      },
    ],
    theory: {
      coreConcept:
        'SaaS growth is an engine of delayed gratification. Businesses that understand their cohort payback curves can safely outspend competitors on advertising because they know the cash will mature predictably over 12 months.',
      economicPrinciples: [
        'Compound Net Retention: Cohorts with expansion revenue curve upward like a smile rather than degrading flatly.',
        'Capital Efficiency: A 5-month payback cycle allows recycling the same $10,000 ad budget twice in a single year.',
      ],
      commonMistakes: [
        'Panicking over Month 1 negative cash flow when the cohort consistently breaks even in Month 4.',
        'Failing to separate annual upfront subscriptions from monthly recurring plans in payback calculations.',
      ],
      industryBenchmark: 'Healthy SMB SaaS recovers CAC within 5-9 months; Enterprise SaaS within 12-16 months.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'Review the average payback scorecard (target: under 6 months).',
        'Scan the matrix rows from top to bottom: newer cohorts should show green faster than older cohorts.',
        'Check M6 and M12 retention percentages for stability.',
      ],
      redFlags: [
        'A recent cohort is retaining less than 70% by Month 3 (signals product dissatisfaction or onboarding issues).',
        'Payback period creeping up from 5 months to 9+ months over consecutive quarters.',
      ],
      recommendedActions: [
        'If payback is fast (<4 months): aggressively scale marketing budget because capital is recycling quickly.',
        'If Month 1 retention drops: review customer support tickets from that cohort to find common cancellation reasons.',
      ],
    },
    copilotQueryPrompt: 'What is our average CAC payback period across the last 12 cohorts, and which cohort was fastest to breakeven?',
  },

  attribution: {
    pageKey: 'attribution',
    title: 'Multi-Touch Attribution Matrix',
    subtitle: 'Understand the complete customer journey across all touchpoints using game-theoretic Shapley value modeling.',
    badge: 'Marketing & Ad Cockpit',
    simpleExplanation: {
      whatItIs:
        'Attribution answers the question: "Which marketing channel deserves the credit when a customer buys?" This matrix compares traditional simple models with modern AI game theory.',
      whyYouCare:
        'Most platforms lie: Meta says Meta made the sale; Google says Google made the sale. Traditional Last-Click ignores the Facebook video that introduced the customer, causing you to cancel the wrong ad.',
      plainEnglishSummary:
        'Think of a soccer goal. The defender steals the ball, the midfielder makes a brilliant pass, and the striker kicks it into the net. Last-click gives 100% credit to the striker. Multi-touch gives credit to everyone who contributed to the goal.',
    },
    terms: [
      {
        term: 'First-Touch Attribution',
        simpleDefinition: 'Gives 100% of the sale credit to the very first ad or link the customer ever clicked.',
        analogy: 'Giving all the credit to the person who introduced you to your spouse.',
        whyItMatters: 'Great for evaluating brand awareness and top-of-funnel discovery campaigns.',
      },
      {
        term: 'Last-Touch Attribution',
        simpleDefinition: 'Gives 100% of the sale credit to the final link clicked right before the purchase.',
        analogy: 'Giving all the credit for winning a marathon to the final step over the finish line.',
        whyItMatters: 'Often overvalues branded Google Search and discounts social discovery video ads.',
      },
      {
        term: 'Shapley Value (Data-Driven)',
        simpleDefinition: 'A Nobel Prize-winning mathematical model that calculates the true incremental contribution of every channel.',
        analogy: 'Calculating the exact salary bonus each basketball player earned based on how the team scored with vs without them on the court.',
        whyItMatters: 'The fairest, most accurate way to distribute marketing budget across channels.',
      },
      {
        term: 'Lookback Window (30d / 60d / 90d)',
        simpleDefinition: 'How far back in time the system looks to find ad clicks that led to a sale.',
        analogy: 'Remembering all recommendations a friend made over the last 60 days before you bought the book.',
        whyItMatters: 'B2B software purchases take weeks; a 7-day window misses 80% of real touchpoints.',
      },
    ],
    theory: {
      coreConcept:
        'Modern buyers rarely buy on first sight. They see an ad on Meta, read a blog on Google, get an email, and eventually search on Google Brand. Cutting top-of-funnel channels because of low last-click ROAS causes overall sales to collapse 3 weeks later.',
      economicPrinciples: [
        'Omnichannel Synergy: Customers touched by 2+ marketing channels convert at 3x the rate of single-channel visitors.',
        'Incrementality: The true test of a marketing dollar is whether the sale would have happened anyway without it.',
      ],
      commonMistakes: [
        'Relying solely on Google Analytics default Last-Click and turning off Meta prospecting campaigns.',
        'Double-counting revenue because both ad platforms claim the exact same transaction.',
      ],
      industryBenchmark: 'In healthy SaaS marketing, 40-50% of revenue touches social discovery first and search last.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'Compare Shapley Share against Last-Touch Share for each channel.',
        'Look at Top Converting Pathways to see typical customer touch sequences.',
        'Verify that your lookback window (60d) matches your real sales cycle length.',
      ],
      redFlags: [
        'A channel has high first-touch share but zero last-touch or retargeting follow-up (leads are being abandoned).',
        'Google Brand Search claims 80% of revenue when brand awareness is actually driven by social ads.',
      ],
      recommendedActions: [
        'Reallocate budget toward channels with high Shapley ROAS even if their Last-Touch looks modest.',
        'Build retargeting sequences for users who entered via high-volume top-of-funnel channels.',
      ],
    },
    copilotQueryPrompt: 'Compare our Shapley attribution share against last-click for Meta and Google. Which channel is being undervalued?',
  },

  'churn-reasons': {
    pageKey: 'churn-reasons',
    title: 'Customer Churn & Retention Intelligence',
    subtitle: 'Analyze subscription cancellations, identify primary drivers, and prevent voluntary and involuntary customer loss.',
    badge: 'MRR & Revenue Intelligence',
    simpleExplanation: {
      whatItIs:
        'This screen monitors every customer who cancels their subscription or stops paying, categorizing the underlying reasons and tracking survival rates over time.',
      whyYouCare:
        'Acquiring a new customer costs 5x more than keeping an existing one. If you have 5% monthly churn, you lose half your customers every single year. Solving churn is the fastest way to compound enterprise value.',
      plainEnglishSummary:
        'Think of your business as a bath tub. If the drain is wide open, you have to run the faucet at maximum blast just to keep the water level constant. Fixing churn puts the plug in the drain.',
    },
    terms: [
      {
        term: 'Gross Churn vs. Net Churn',
        simpleDefinition: 'Gross churn is the total money lost from cancellations; Net churn subtracts expansion money from existing customers.',
        analogy: 'If 2 people leave your party but 3 people bring a friend, your net headcount still grew.',
        whyItMatters: 'Top SaaS companies achieve negative net churn (existing accounts expand faster than others leave).',
        formulaOrExample: 'Gross Churn = Churned MRR / Starting MRR; Net Churn = (Churned - Expansion) / Starting MRR',
      },
      {
        term: 'Involuntary Churn',
        simpleDefinition: 'When a customer wants to stay, but their credit card fails, expires, or gets declined by their bank.',
        analogy: 'Getting locked out of your apartment because you accidentally grabbed the wrong keys, not because you moved out.',
        whyItMatters: 'Accounts for 20-40% of all SaaS churn and can be almost completely fixed with automated payment retries.',
      },
      {
        term: 'Customer Survival Rate',
        simpleDefinition: 'The percentage of customers from a cohort who remain active subscribers after N days or months.',
        analogy: 'A medical survival curve tracking how many patients remain healthy year after year.',
        whyItMatters: 'Shows whether churn happens immediately on day 14 (bad onboarding) or after month 9 (contract end).',
      },
      {
        term: 'Exit Survey Categorization',
        simpleDefinition: 'Direct customer feedback collected during the cancellation flow (e.g. Too expensive, Missing feature).',
        analogy: 'An exit interview when an employee leaves the company.',
        whyItMatters: 'Gives the product and marketing teams precise, actionable feedback on what needs to be fixed.',
      },
    ],
    theory: {
      coreConcept:
        'Retention is a product and activation problem, not a cancellation flow problem. Customers decide whether they will stay within the first 72 hours of using your product. Churn at month 6 is usually caused by poor onboarding on day 1.',
      economicPrinciples: [
        'Compounding Magic of Retention: Reducing monthly churn from 3% to 1.5% doubles the valuation of a SaaS company in 3 years.',
        'High-Value Churn Concentration: Losing 1 enterprise customer at $2,000/mo hurts more than losing 20 starter customers at $50/mo.',
      ],
      commonMistakes: [
        'Treating all churn as voluntary disinterest when a large portion is simply expired credit cards.',
        'Making cancellation impossible or frustrating, which leads to chargeback disputes and merchant penalties.',
      ],
      industryBenchmark: 'Healthy B2B SaaS maintains Gross Churn under 1.5-2.0% per month and Net Churn under 0%.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'Review the Top Churn Drivers chart for any emerging trends.',
        'Check Involuntary Churn count and verify automated dunning retries are active.',
        'Inspect high-MRR cancellations from yesterday.',
      ],
      redFlags: [
        'Monthly gross churn spikes above 3.5%.',
        'More than 30% of churn reasons cite "Product too difficult to use".',
      ],
      recommendedActions: [
        'For involuntary churn: ensure automated email reminders and Stripe Smart Retries are enabled on the Billing Ops page.',
        'For "Missing feature" churn: review customer feature requests and prioritize high-revenue roadmap items.',
      ],
    },
    copilotQueryPrompt: 'What was our gross and net churn last month, and what are the top 3 cancellation reasons reported by customers?',
  },

  mcp: {
    pageKey: 'mcp',
    title: 'Model Context Protocol (MCP) Hub & AI Connectors',
    subtitle: 'Connect Claude Desktop, Cursor, and autonomous AI agents directly to your analytics database over Streamable HTTP.',
    badge: 'Data & Integrations',
    simpleExplanation: {
      whatItIs:
        'The Model Context Protocol (MCP) is an open industry standard that lets external AI tools (like Claude Desktop, Cursor, or your own Python/Node scripts) talk directly and securely to GrowthOS.',
      whyYouCare:
        'Instead of copying and pasting CSV files into ChatGPT and hoping it does the math right, MCP gives AI agents read/write tools to inspect your live database, calculate real metrics, and execute approved actions.',
      plainEnglishSummary:
        'Think of MCP as an official USB cable between your favorite AI assistant and your business data. With this cable plugged in, you can simply type to Claude: "Check my ROAS on Meta and scale the budget to $250", and Claude executes it safely.',
    },
    terms: [
      {
        term: 'Model Context Protocol (MCP)',
        simpleDefinition: 'An open protocol designed by Anthropic allowing AI models to interact with external tools and databases.',
        analogy: 'A universal electrical plug adapter that allows any appliance to plug into any power outlet safely.',
        whyItMatters: 'Guarantees your AI answers questions using live, mathematically verified data instead of hallucinating.',
      },
      {
        term: 'Streamable HTTP (JSON-RPC 2.0)',
        simpleDefinition: 'The modern web transport protocol used to exchange commands and data between the AI and GrowthOS.',
        analogy: 'A secure walkie-talkie channel where both sides verify each message with zero confusion.',
        whyItMatters: 'Works over standard HTTPS without requiring complicated local server setups or open firewall ports.',
      },
      {
        term: 'OAuth 2.1 & Scopes',
        simpleDefinition: 'The security system where you grant permissions (like "Read Analytics" or "Propose Actions") to specific AI apps.',
        analogy: 'A hotel keycard that lets you into your room and the gym, but does not open the hotel bank vault.',
        whyItMatters: 'Protects your company: AI tools can only see the specific project you authorize and cannot delete accounts.',
      },
      {
        term: 'Human-In-The-Loop (HITL) Execution',
        simpleDefinition: 'A safety guarantee where AI agents can propose changes, but a human must click Approve before money is spent.',
        analogy: 'A co-pilot in an airplane who suggests changing altitude, but the captain must confirm and touch the controls.',
        whyItMatters: 'Gives you all the speed of AI automation with zero risk of autonomous mistakes.',
      },
    ],
    theory: {
      coreConcept:
        'Autonomous agents require deterministic tools, not fuzzy text prompts. By giving the AI access to 13 discrete, strongly typed tools (`query_metric`, `query_funnel`, `propose_action`), the agent operates with 100% mathematical fidelity.',
      economicPrinciples: [
        'Zero-Latency Decision Making: Operators can query complex cohort matrices in 2 seconds via natural language instead of submitting BI tickets.',
        'Auditability & Compliance: Every command issued by an AI agent is cryptographically logged with user identity and timestamp.',
      ],
      commonMistakes: [
        'Sharing raw admin API keys in public code repositories instead of using OAuth 2.1 authorization.',
        'Assuming AI agents can execute arbitrary code without guardrails. All actions in GrowthOS are bounded by spend caps.',
      ],
      industryBenchmark: 'Enterprise teams using MCP report a 70% reduction in ad hoc data requests to engineering.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'Check the live MCP endpoint status indicator (should display Streamable HTTP green pulse).',
        'Review active OAuth client grants and revoke any unused tokens.',
        'Use the in-browser Live Handshake Tester to measure round-trip latency (<60ms).',
      ],
      redFlags: [
        'An unrecognized OAuth client is listed under Active Grants.',
        'Live handshake test returns an HTTP 500 error or latency above 2,000ms.',
      ],
      recommendedActions: [
        'To connect Claude Desktop: copy the pre-filled JSON config snippet from the Claude tab into your config file.',
        'To test capabilities: ask our inline AI Copilot in the bottom-right corner to query your CAC or funnel.',
      ],
    },
    copilotQueryPrompt: 'What tools are available in our MCP server, and how do I connect Claude Desktop or Cursor?',
  },

  'cost-guardrails': {
    pageKey: 'cost-guardrails',
    title: 'Autonomous Spend Protection & Guardrails',
    subtitle: 'Automated safety nets that prevent runaway ad spend, detect anomalous bidding, and enforce budget ceilings.',
    badge: 'MRR & Revenue Intelligence',
    simpleExplanation: {
      whatItIs:
        'A protection console where you set maximum daily and monthly spending limits. If an ad platform algorithm goes haywire or someone types $10,000 instead of $100, the system automatically pauses the campaign.',
      whyYouCare:
        'Every digital marketer has heard horror stories of a zero being added to a daily budget, waking up to a $25,000 credit card bill. Guardrails ensure that can never happen to your company.',
      plainEnglishSummary:
        'Think of this as the circuit breaker box in your house. If an electrical wire surges, the breaker flips automatically so your house does not catch fire. These are financial circuit breakers for your ad accounts.',
    },
    terms: [
      {
        term: 'Hard Spend Cap',
        simpleDefinition: 'An absolute maximum dollar limit that cannot be exceeded under any circumstances.',
        analogy: 'A prepaid debit card that stops working the second the balance hits zero.',
        whyItMatters: 'Guarantees your monthly credit card bill will never exceed your allocated marketing budget.',
      },
      {
        term: 'Daily Anomaly Threshold',
        simpleDefinition: 'Flags campaigns that spend more than X% above their historical average in a short time window.',
        analogy: 'Your bank sending you an SMS alert when a transaction happens in another country.',
        whyItMatters: 'Catches automated bidding bugs before thousands of dollars are wasted.',
      },
      {
        term: 'Target ROAS Floor',
        simpleDefinition: 'The minimum acceptable return on ad spend. If performance falls below this floor, an alert or pause triggers.',
        analogy: 'A stop-loss order on the stock market that automatically sells if the price drops too low.',
        whyItMatters: 'Prevents low-converting campaigns from silently burning money.',
      },
      {
        term: 'Autonomous Kill Switch',
        simpleDefinition: 'A single emergency button that instantly pauses all active paid ads across all connected platforms.',
        analogy: 'The big red emergency stop button on an industrial factory conveyor belt.',
        whyItMatters: 'Provides total peace of mind during server downtime or product outages.',
      },
    ],
    theory: {
      coreConcept:
        'Algorithmic ad platforms (Google Smart Bidding, Meta Advantage+) are designed to spend your entire budget. Without hard guardrails, optimization bugs or seasonal bidding spikes will aggressively drain your capital.',
      economicPrinciples: [
        'Downside Protection: Protecting capital during downturns is more mathematically important than squeezing an extra 2% out of winning ads.',
        'Margin Defense: Ensuring customer acquisition never exceeds gross product margins.',
      ],
      commonMistakes: [
        'Setting guardrails too tight (<5% variance), which causes false-alarm pauses during normal high-volume shopping hours.',
        'Not setting up team SMS or Slack webhook notifications for circuit breaker events.',
      ],
      industryBenchmark: 'Growth-stage startups maintain a daily spend anomaly threshold of 25-35% variance.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'Check the Spend Protection status indicator to ensure guardrails are Active.',
        'Verify today cumulative spend against the monthly allocated budget cap.',
        'Review any recent anomaly alerts in the activity log.',
      ],
      redFlags: [
        'A circuit breaker was triggered and a high-performing campaign is paused unintentionally.',
        'Spend has exceeded 85% of monthly budget with more than 10 days remaining in the month.',
      ],
      recommendedActions: [
        'If an ad platform has an API bug: click Engage Kill Switch to freeze all campaigns instantly.',
        'If scaling: adjust the daily budget ceiling upwards in 20% increments to allow controlled expansion.',
      ],
    },
    copilotQueryPrompt: 'Are all our cost guardrails active, and what is our current spend pacing relative to our monthly cap?',
  },

  integrations: {
    pageKey: 'integrations',
    title: 'Integrations Hub & Data Streaming',
    subtitle: 'Connect your billing, ad networks, telemetry SDK, and CRM to establish a deterministic first-party data pipeline.',
    badge: 'Data & Integrations',
    simpleExplanation: {
      whatItIs:
        'The central connection hub linking GrowthOS to your external tools: Stripe for revenue, Google & Meta for ad spend, and our JavaScript SDK for website visitor tracking.',
      whyYouCare:
        'GrowthOS does not rely on third-party tracking cookies or estimated guesswork. By plugging in your actual billing and ad streams, every chart and AI metric is calculated from real raw events.',
      plainEnglishSummary:
        'Think of your business like a modern electric car. This hub connects the battery sensors, the motor sensors, and the GPS so the dashboard computer can tell you your exact range and performance.',
    },
    terms: [
      {
        term: 'First-Party Data Stream',
        simpleDefinition: 'Data collected directly between you and your customers on your own domain, without relying on third-party cookies.',
        analogy: 'Your personal guestbook at a private event, rather than asking a stranger outside who attended.',
        whyItMatters: 'Immune to ad-blockers, iOS privacy changes, and browser cookie restrictions.',
      },
      {
        term: 'Webhook Receiver',
        simpleDefinition: 'An automated digital notification sent by Stripe or an ad network the microsecond a payment or click occurs.',
        analogy: 'A doorbell that rings the moment a package is placed on your front porch.',
        whyItMatters: 'Ensures dashboards update in real time instead of waiting for slow daily batch jobs.',
      },
      {
        term: 'Data Ingestion Health',
        simpleDefinition: 'A monitoring check verifying that incoming events match expected schemas and have valid timestamps.',
        analogy: 'A quality inspector checking that raw ingredients are fresh before they enter the kitchen.',
        whyItMatters: 'Prevents corrupted or duplicate events from distorting your CAC and revenue calculations.',
      },
      {
        term: 'Cryptographic Signing Secret',
        simpleDefinition: 'A private security key used to prove that a webhook genuinely came from Stripe or Google and was not forged.',
        analogy: 'A wax seal on a royal letter verifying its authenticity.',
        whyItMatters: 'Protects your database from unauthorized or malicious fake events.',
      },
    ],
    theory: {
      coreConcept:
        'Garbage in, garbage out. Advanced attribution models and AI copilots are completely useless if the underlying data stream is missing subscriptions or miscounting ad spend. A verified first-party pipeline is the foundation of modern growth.',
      economicPrinciples: [
        'Data Completeness: Missing 10% of checkout events inflates your reported CAC by 11% and causes you to under-invest in good ads.',
        'Deterministic Matching: Server-side email and user ID matching achieves 98%+ attribution accuracy vs 65% for client-side cookies.',
      ],
      commonMistakes: [
        'Connecting ad platforms but forgetting to connect billing, leaving the system blind to actual revenue.',
        'Ignoring "Degraded" integration warnings when an OAuth token expires.',
      ],
      industryBenchmark: 'Top SaaS platforms maintain data ingestion latency under 5 seconds with 99.9% uptime.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'Check the Integrations Health strip: ensure all connected pipelines show a green Connected badge.',
        'Check the Missing Integrations tab to see if any viewed dashboards lack required raw streams.',
        'Use the Send Mock Event button to test live ingestion after configuring a new connector.',
      ],
      redFlags: [
        'A connector shows a red Degraded badge (usually an expired API key or rotated webhook secret).',
        'Ingestion health shows 0 events received over the past 24 hours.',
      ],
      recommendedActions: [
        'If Stripe is missing: click 1-Click Connect to import historical subscriptions and enable real LTV calculation.',
        'If telemetry is missing: copy the 1-line `<script>` tag into your website `<head>` to start tracking funnels.',
      ],
    },
    copilotQueryPrompt: 'Which integrations are currently active in our project, and are any required data streams missing?',
  },

  default: {
    pageKey: 'default',
    title: 'GrowthOS Page & Analytics Guide',
    subtitle: 'Clear explanations, essential marketing terms, and actionable steps to help you master this screen.',
    badge: 'GrowthOS Guide',
    simpleExplanation: {
      whatItIs:
        'This screen is an integral component of your GrowthOS operating system, designed to give you clarity, control, and actionable intelligence over your customer acquisition and revenue.',
      whyYouCare:
        'Modern growth requires aligning marketing spend, product engagement, and financial retention. Understanding the numbers on this page enables you to make fast, confident business decisions.',
      plainEnglishSummary:
        'Whether you are reviewing metrics, setting up integrations, or managing ad campaigns, this screen translates raw customer data into actionable business leverage.',
    },
    terms: [
      {
        term: 'KPI (Key Performance Indicator)',
        simpleDefinition: 'A primary metric used to evaluate the success of an organization or specific marketing activity.',
        analogy: 'The scoreboard in a football game — it tells you whether you are winning or losing.',
        whyItMatters: 'Focuses your team on the few numbers that genuinely move the business forward.',
      },
      {
        term: 'Unit Economics',
        simpleDefinition: 'The direct revenues and costs associated with a single unit of your business (typically one customer).',
        analogy: 'Calculating if selling a single cup of lemonade brings in more money than the lemons and sugar cost.',
        whyItMatters: 'If your unit economics are broken, growing faster only accelerates bankruptcy.',
      },
      {
        term: 'First-Party Tracking',
        simpleDefinition: 'Collecting customer data directly on your own infrastructure rather than relying on external third-party cookies.',
        analogy: 'Writing down your customer orders in your own private ledger instead of asking the post office who visited.',
        whyItMatters: 'Protects privacy while ensuring 100% accurate measurement across modern web browsers.',
      },
    ],
    theory: {
      coreConcept:
        'Sustainable growth comes from systems, not lucky one-off tactics. Aligning your customer acquisition cost (CAC) with retention cohorts and real cash payback builds a resilient, profitable business.',
      economicPrinciples: [
        'Velocity & Momentum: Fast iteration cycles on campaigns and funnels compound into massive annual advantages.',
        'Data Transparency: Eliminating information silos between marketing, product, and finance.',
      ],
      commonMistakes: [
        'Optimizing for short-term vanity metrics instead of sustainable customer lifetime value.',
        'Making major budget changes without verifying that tracking and telemetry are working correctly.',
      ],
      industryBenchmark: 'World-class SaaS companies maintain LTV:CAC ratios greater than 3:1 and net retention above 100%.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'Inspect top-level KPI cards for unexpected fluctuations.',
        'Verify that data filters and timeframes match the comparison period you need.',
        'Review proactive AI recommendations or alerts displayed on this screen.',
      ],
      redFlags: [
        'Sudden drops in volume with no corresponding change in spend or product updates.',
        'Missing integration alerts indicating that reporting is running on incomplete data.',
      ],
      recommendedActions: [
        'Click the AI Copilot button in the bottom corner to ask questions or execute actions on this screen.',
        'Refer back to this guide whenever you encounter an unfamiliar term or metric formula.',
      ],
    },
    copilotQueryPrompt: 'Can you give me an executive overview of what this page shows and what actions I should consider taking?',
  },
};

export const PAGE_GUIDES_HE: Record<string, PageGuideData> = {
  pulse: {
    pageKey: 'pulse',
    title: 'דופק עסקי ומרכז בקרה ראשי',
    subtitle: 'מבט-על מלא על ההכנסות, הוצאות הפרסום, והמרות הלקוחות בזמן אמת.',
    badge: 'סקירת הנהלה',
    simpleExplanation: {
      whatItIs:
        'זהו לוח המחוונים הראשי של העסק שלך. הוא מרכז את כל הוצאות הפרסום (Meta, Google), המרות של לקוחות משלמים, ומהירות ההכנסות במקום אחד ובזמן אמת.',
      whyYouCare:
        'במקום להתחבר ל-5 מערכות שונות (מטא, גוגל, סטרייפ, אנליטיקס) ולנחש האם היום היה רווחי, הדופק העסקי מראה לך מיד האם העסק מרוויח או מפסיד.',
      plainEnglishSummary:
        'חשבו על מסך זה כמו מד המהירות ומד הדלק במכונית. אם ההוצאות גבוהות מקצב ההכנסות, או ששיעור ההמרה צונח, תזהו זאת תוך שעות ולא בסוף החודש כשהתקציב כבר בוזבז.',
    },
    terms: [
      {
        term: 'ROAS משוקלל (החזר על הוצאות פרסום)',
        simpleDefinition: 'סך כל ההכנסות חלקי סך כל הוצאות הפרסום בכל הערוצים יחד.',
        analogy: 'אם הכנסת 100 ₪ למכונת חטיפים והיא הוציאה לך מוצרים בשווי 350 ₪, ה-ROAS שלך הוא 3.5x.',
        whyItMatters: 'מראה באופן ברור האם כל מנגנון השיווק שלך רווחי או מפסיד כסף.',
        formulaOrExample: 'ROAS = סך הכנסות / סך הוצאות פרסום (למשל: 35,000 ₪ / 10,000 ₪ = 3.5x)',
      },
      {
        term: 'CAC משוקלל (עלות רכישת לקוח)',
        simpleDefinition: 'הסכום הממוצע שהוצאת בשיווק כדי להביא לקוח משלם אחד חדש.',
        analogy: 'אם הוצאת 1,000 ₪ על פיתיון ודלק לדייג ותפסת 10 דגים, כל דג עלה לך 100 ₪.',
        whyItMatters: 'אם ה-CAC גבוה ממה שהלקוח משלם לך, העסק מפסיד כסף בכל מכירה נוספת.',
        formulaOrExample: 'CAC = סך הוצאות שיווק / מספר לקוחות משלמים חדשים',
      },
      {
        term: 'קצב צמיחת MRR',
        simpleDefinition: 'המהירות והתאוצה שבה מתווספת הכנסה חודשית קבועה חוזרת (MRR).',
        analogy: 'כמו מד תאוצה במכונית ספורט — מראה באיזו מהירות מנוע המזומנים הקבוע שלך מאיץ.',
        whyItMatters: 'משקיעים ומנהלים בוחנים מדד זה כדי לחזות האם החברה תעמוד ביעדי סוף השנה שלה.',
        formulaOrExample: 'MRR נטו = (MRR חדש + הרחבות) פחות (ביטולים ונטישה)',
      },
      {
        term: 'קצב הוצאה יומי (Intraday Pacing)',
        simpleDefinition: 'האופן שבו תקציב הפרסום היומי שלך מתחלק על פני 24 שעות היממה.',
        analogy: 'שמירה על קצב ריצה מבוקר במרתון כדי לא לשרוף את כל האנרגיה בשני הקילומטרים הראשונים.',
        whyItMatters: 'מונע מפייסבוק או גוגל לשרוף את כל התקציב היומי שלך על קליקים לא איכותיים ב-3 לפנות בוקר.',
      },
    ],
    theory: {
      coreConcept:
        'לולאות משוב בזמן אמת מנצחות דוחות אקסל שנבדקים בדיעבד. אלגוריתמי הפרסום המודרניים מתאימים מחירים בכל דקה; בקרה יומית שומרת על עלויות רכישה נמוכות.',
      economicPrinciples: [
        'חוק התפוקה השולית הפוחתת: הכפלת תקציב הפרסום פי 2 לעיתים נדירות מכפילה את המכירות; מעקב רציף מציג את תקרת התקציב האופטימלית.',
        'יחס יחידת הכלכלה המושלם: שווי חיי לקוח (LTV) חייב להיות לפחות פי 3 מעלות רכישתו (LTV:CAC >= 3:1).',
      ],
      commonMistakes: [
        'התמקדות במדדי לייקים וקליקים חסרי ערך כספי במקום בלקוחות משלמים בפועל.',
        'עצירת קמפיינים בבהלה אחרי בוקר איטי אחד בלבד במקום להתבונן במגמה הסטטיסטית השבועית.',
      ],
      industryBenchmark: 'חברות SaaS בריאות שומרות על ROAS משוקלל מעל 3.0x וזמן החזר CAC מתחת ל-12 חודשים.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'בדקו את טיקר ההמרות החי כדי לוודא שעסקאות אמיתיות נקלטות במערכת.',
        'וודאו שקצב ההוצאה עד שעות הצהריים תואם את מסגרת התקציב היומית.',
        'השוו את ה-ROAS המשוקלל ליעד הרווחיות המינימלי שהגדרתם.',
      ],
      redFlags: [
        'נשרפו מעל 75% מהתקציב היומי עד 12:00 בצהריים עם 0 המרות משלמות.',
        'ה-CAC המשוקלל זינק בלמעלה מ-30% שבוע-מול-שבוע ללא ניסוי מכוון.',
      ],
      recommendedActions: [
        'אם ה-ROAS גבוה מ-4.0x: בקשו מסוכן ה-AI להגדיל את תקציב הקמפיין המוביל ב-15-20%.',
        'אם ה-CAC מזנק: עברו למסך המשפך כדי לבדוק באיזה שלב בהרשמה המשתמשים נוטשים.',
      ],
    },
    copilotQueryPrompt: 'מה ה-CAC וה-ROAS המשוקלל שלנו היום, ואיזה קמפיין מניב את התשואה הגבוהה ביותר?',
  },

  campaigns: {
    pageKey: 'campaigns',
    title: 'לוח בקרת קמפיינים ופרסום',
    subtitle: 'ניהול קמפיינים ממומנים ב-Google, Meta ו-TikTok עם מעקב עייפות קריאייטיב והוצאות בזמן אמת.',
    badge: 'שיווק וקמפיינים',
    simpleExplanation: {
      whatItIs:
        'מסך זה מציג את כל קמפייני המודעות הפעילים שלך ב-Google, Meta (פייסבוק/אינסטגרם) ו-TikTok במקום אחד. ניתן להפעיל/להשהות קמפיינים ולשנות תקציבים ישירות.',
      whyYouCare:
        'רשתות פרסום נוטות לייחס לעצמן את כל הקרדיט על כל מכירה. לוח בקרה זה מציג את האמת האובייקטיבית אילו מודעות וקריאייטיבים באמת מייצרים לקוחות משלמים.',
      plainEnglishSummary:
        'חשבו על זה כעל לוח פיקוד מרכזי לכל שלטי החוצות, הרדיו והפרסומות שלכם. תוכלו לראות איזו תמונה התעייפה, איזה סרטון מוכר הכי טוב, ולהגדיל תקציב בלחיצה אחת.',
    },
    terms: [
      {
        term: 'CAC של קמפיין',
        simpleDefinition: 'עלות רכישת לקוח ספציפית לקמפיין זה בלבד.',
        analogy: 'כמה כסף עלה לך להביא לקוח משלם אחד מהשלט הספציפי הזה באיילון.',
        whyItMatters: 'מאפשר להשוות בקלות האם קמפיין חיפוש בגוגל זול או יקר יותר מסרטון בפייסבוק.',
        formulaOrExample: 'הוצאות הקמפיין / מספר לקוחות משלמים מהקמפיין',
      },
      {
        term: 'ROAS (החזר על הוצאות פרסום)',
        simpleDefinition: 'כמה שקלים הכנסת על כל שקל שהושקע בקמפיין זה.',
        analogy: 'אם נתת לעובד 100 ₪ והוא חזר עם חוזים חתומים בשווי 400 ₪, ה-ROAS הוא 4x.',
        whyItMatters: 'מדד היעילות החשוב ביותר להשוואת קמפיינים.',
        formulaOrExample: 'הכנסות מקמפיין / הוצאות קמפיין',
      },
      {
        term: 'עייפות קריאייטיב (Creative Fatigue)',
        simpleDefinition: 'מצב שבו קהל היעד ראה את המודעה יותר מדי פעמים ומפסיק להקליק עליה.',
        analogy: 'לשמוע את אותו שיר ברדיו 50 פעמים ביום עד שהוא הופך לרעש רקע מעצבן.',
        whyItMatters: 'מודעות עייפות גורמות לעלייה חדה במחיר לקליק. החלפת תמונה מחזירה את הביצועים לשיא.',
      },
      {
        term: 'ריטרגטינג לעומת פרוספקטינג',
        simpleDefinition: 'פרוספקטינג פונה לזרים שלא שמעו עליך מעולם; ריטרגטינג מזכיר לאנשים שכבר ביקרו באתר.',
        analogy: 'פרוספקטינג זה חלוקת פליירים ברחוב; ריטרגטינג זה להתקשר למישהו שביקש אתמול הצעת מחיר.',
        whyItMatters: 'לריטרגטינג יש בדרך כלל ROAS גבוה בהרבה, אבל חייבים פרוספקטינג כדי להביא אנשים חדשים.',
      },
    ],
    theory: {
      coreConcept:
        'הקריאייטיב הוא מנגנון הטרגוט החדש. בעידן האלגוריתמים המבוססים על AI במטא וגוגל, גיוון ויזואלי בסרטונים ובתמונות משפיע על ההצלחה הרבה יותר מהגדרות טרגוט קהלים מסורתיות.',
      economicPrinciples: [
        'שחיקת מודעות: תדירות חשיפה מעל 3.5 גורמת לירידה חדה ב-CTR ולעלייה בעלות לליד.',
        'עלות שולית: הגדלת תקציב מהירה מדי מציפה את הקהל ומייקרת את מחיר הלקוח הנוסף.',
      ],
      commonMistakes: [
        'הכפלת תקציב קמפיין ב-100% ביום אחד (מה שמאפס את שלב הלמידה של האלגוריתם). הגדילו ב-15-20% בלבד בכל פעם.',
        'השארת אותה מודעת תמונה במשך חודשים ללא בדיקת וריאציות חדשות.',
      ],
      industryBenchmark: 'קמפיינים מובילים משיגים ROAS של 3.5x עד 5.0x עם שיעור הקלקה (CTR) מעל 1.8%.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'בדקו את רדאר עייפות הקריאייטיב לגבי מודעות המסומנות בכתום או באדום.',
        'השוו את ה-ROAS בין מטא לגוגל כדי לראות איפה התקציב עובד הכי יעיל היום.',
        'עיינו בהמלצות ה-AI להסטת תקציבים מהירה.',
      ],
      redFlags: [
        'תדירות מודעה חצתה 4.0 ושיעור ההקלקה צנח מתחת ל-0.8%.',
        'הוצאה תקציבית גבוהה לאורך 48 שעות ללא אף המרה.',
      ],
      recommendedActions: [
        'במודעות עם עייפות גבוהה: לחצו על תמונת המודעה והחליפו אותה בווריאנט קריאייטיב רענן.',
        'בקמפיינים מנצחים (ROAS > 4.0x): ערכו את התקציב היומי והעלו אותו ב-20%.',
      ],
    },
    copilotQueryPrompt: 'לאילו קמפיינים יש כרגע עייפות קריאייטיב גבוהה ואיזו הסטת תקציב מומלצת?',
  },

  funnel: {
    pageKey: 'funnel',
    title: 'משפך המרה וקצב יעדים',
    subtitle: 'מעקב אחר התקדמות המבקרים בכל שלב בתהליך ההרשמה וזיהוי מדויק של נקודות הנטישה.',
    badge: 'מוצר ומדידה',
    simpleExplanation: {
      whatItIs:
        'מפה ויזואלית של המסע שהלקוח עובר: מלחיצה על המודעה, ביקור באתר, התחלת הרשמה, ועד לתשלום והפיכה ללקוח קבוע.',
      whyYouCare:
        'אם השקעת 10,000 ₪ כדי להביא 1,000 מבקרים, אך 90% מהם נוטשים בשלב השני, שרפת 9,000 ₪ לחינם. זיהוי ותיקון השלב השבור מציל את העסק.',
      plainEnglishSummary:
        'דמיינו חנות בגדים: 100 אנשים עוברים ליד חלון הראווה, 40 נכנסים, 15 מודדים חולצה, ו-5 משלמים בקופה. מסך זה מראה לכם בדיוק איזה תא מדידה תקוע ומבריח קונים.',
    },
    terms: [
      {
        term: 'שיעור המרה (Conversion Rate)',
        simpleDefinition: 'אחוז המשתמשים שעוברים בהצלחה משלב אחד לשלב הבא אחריו.',
        analogy: 'אם מתוך 10 זריקות לסל קלעת 4, שיעור ההמרה שלך הוא 40%.',
        whyItMatters: 'שיפור של 1% בלבד בשיעור ההמרה יכול להכפיל את הרווח בלי להוציא שקל נוסף על פרסום.',
        formulaOrExample: '(משתמשים שהשלימו שלב / משתמשים שנכנסו לשלב) * 100',
      },
      {
        term: 'נקודת נטישה (Drop-off)',
        simpleDefinition: 'השלב הספציפי שבו האחוז הגבוה ביותר של מבקרים עוזב ולא ממשיך.',
        analogy: 'חור בתחתית דלי מים שדרכו המים דולפים לפני שהם מגיעים להשקות את העציץ.',
        whyItMatters: 'מצביע בדיוק איפה המשתמשים נתקלים בבלבול, בטפסים ארוכים מדי, או בתקלות טכניות.',
      },
      {
        term: 'מיקרו-המרה (Micro-Conversion)',
        simpleDefinition: 'פעולות קטנות שהמשתמש מבצע בדרך (כמו אימות מייל או העלאת לוגו) לפני הרכישה הסופית.',
        analogy: 'להסכים להיפגש לכוס קפה לפני שמחליטים להתחתן.',
        whyItMatters: 'משתמשים שמשלימים 2 מיקרו-המרות הם בעלי סבירות גבוהה פי 5 להפוך למשלמים.',
      },
      {
        term: 'קצב עמידה ביעד (Linear Pace)',
        simpleDefinition: 'חישוב האם קצב ההמרות הנוכחי מהיר מספיק כדי להגיע ליעד שנקבע לסוף החודש.',
        analogy: 'בדיקה האם הרכבת נוסעת במהירות הנכונה כדי להגיע לתחנה בזמן.',
        whyItMatters: 'נותן התרעה מוקדמת כבר ביום ה-10 לחודש במקום להיות מופתעים ביום ה-30.',
      },
    ],
    theory: {
      coreConcept:
        'חיכוך הורג המרות. כל שדה מיותר בטופס, טעינת דף איטית או כפתור לא ברור מפחיתים את שיעור ההמרה ב-10-20%. ייעול המשפך מכפיל את התשואה של כל ערוצי השיווק יחד.',
      economicPrinciples: [
        'אפקט ההכפלה: שיפור של 3 שלבים במשפך ב-10% כל אחד מביא לעלייה כוללת של מעל 33% בהכנסות.',
        'מינוף תחתית המשפך: תיקון דף התשלום מייצר מזומנים מיידיים; שיפור דף הנחיתה בונה מאגר עתידי.',
      ],
      commonMistakes: [
        'הזרמת עוד תקציבי פרסום לתוך משפך דולף במקום לתקן את חוויית ההרשמה תחילה.',
        'בקשת פרטי כרטיס אשראי מוקדם מדי, לפני שהמשתמש חווה את הערך של המוצר.',
      ],
      industryBenchmark: 'משפכי SaaS מובילים ממירים 35-45% מביקור לגרסת ניסיון, ו-15-25% מניסיון ללקוח משלם.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'בדקו את אחוז ההמרה הכולל ביחס לממוצע של 30 הימים האחרונים.',
        'סרקו את שלבי המשפך וחפשו את השלב המסומן בנורת אזהרה אדומה.',
        'וודאו שכרטיסי מדחום היעדים מסומנים כ-On Track (עומדים בקצב).',
      ],
      redFlags: [
        'ירידה פתאומית של יותר מ-15% בהמרת שלב ההרשמה (מעידה לרוב על תקלת שרת או טופס שבור).',
        'שיעור ההמרה במכשירים ניידים נמוך ממחצית שיעור ההמרה במחשב.',
      ],
      recommendedActions: [
        'אם הנטישה בהרשמה גבוהה: צמצמו שדות חובה ואפשרו התחברות בלחיצה אחת עם Google/GitHub.',
        'אם ההמרה לתשלום נמוכה: שלחו רצף מיילים אוטומטי המדריך את המשתמש איך להפעיל את הפיצ\'רים המובילים.',
      ],
    },
    copilotQueryPrompt: 'איפה נקודת הנטישה הגבוהה ביותר במשפך ההמרה שלנו כרגע, ואיך מומלץ לשפר אותה?',
  },

  cohorts: {
    pageKey: 'cohorts',
    title: 'מטריצת קוהורטים והחזר השקעה (12/24 חודשים)',
    subtitle: 'מעקב אחר זמן החזר עלות רכישת לקוח (CAC Payback) והבשלת הכנסות לאורך חודשי הרשמה.',
    badge: 'כלכלה וקוהורטים',
    simpleExplanation: {
      whatItIs:
        'מטריצה זו מקבצת לקוחות לפי החודש שבו הם הצטרפו (קוהורט) ועוקבת כמה כסף הם שילמו לאורך חודשים 1, 3, 6, 12 ו-24, בהשוואה לעלות הפרסום שהושקעה ברכישתם.',
      whyYouCare:
        'מרבית חברות ה-SaaS מפסידות כסף ביום הראשון כי עלות הפרסום גבוהה ממחיר החודש הראשון של המנוי. מסך זה מראה לכם בדיוק באיזה חודש הלקוחות מחזירים את ההשקעה והופכים לרווח טהור.',
      plainEnglishSummary:
        'חשבו על כל חודש הרשמה כמו נטיעת מטע תפוחים. בחודש הראשון יש הוצאות על שתילים והשקיה. בחודש החמישי העצים מתחילים להניב פירות. המטריצה מראה מתי החזרתם את ההשקעה.',
    },
    terms: [
      {
        term: 'קוהורט רכישה (Acquisition Cohort)',
        simpleDefinition: 'קבוצת לקוחות שהצטרפו כולם באותו חודש קלנדרי בדיוק.',
        analogy: 'מחזור סיום בבית ספר (למשל "מחזור 2024") — כולם התחילו יחד וניתן לעקוב אחר הישגיהם לאורך שנים.',
        whyItMatters: 'מאפשר לראות האם המוצר והשיווק שלך משתפרים מחודש לחודש או מידרדרים.',
      },
      {
        term: 'זמן החזר CAC (Payback Period)',
        simpleDefinition: 'מספר החודשים שלוקח לתשלומי הלקוח להשתוות לסכום שהוצאת בשיווק כדי להביא אותו.',
        analogy: 'אם קנית דירה להשקעה במיליון ₪ והיא מניבה 100,000 ₪ בשנה שכירות, ההחזר הוא 10 שנים.',
        whyItMatters: 'ככל שההחזר מהיר יותר, כך תוכל למחזר את כספי הפרסום מהר יותר ולהאיץ צמיחה.',
        formulaOrExample: 'נקודת האיזון מושגת כאשר: סך ההכנסות המצטברות >= סך הוצאות הרכישה',
      },
      {
        term: 'שימור הכנסות נטו (NRR)',
        simpleDefinition: 'אחוז ההכנסות החודשיות שנשמר מקוהורט מסוים, כולל שדרוגים וביטולים.',
        analogy: 'אם התחלת עם 100 פרות, ושנה אחרי זה יש לך 110 (כי נולדו עגלים יותר ממה שמתו), ה-NRR הוא 110%.',
        whyItMatters: 'אם ה-NRR מעל 100%, העסק שלך גדל בכל שנה גם אם תפסיק להביא לקוחות חדשים לחלוטין.',
      },
      {
        term: 'חודש איזון (Breakeven)',
        simpleDefinition: 'החודש (למשל חודש 4) שבו סך ההכנסות המצטברות עבר את ה-100% מעלות השיווק.',
        analogy: 'היום שבו סיימת להחזיר את ההלוואה על הרכב וכל המשכורת נשארת אצלך.',
        whyItMatters: 'איזון מהיר (פחות מ-6 חודשים) הוא סימן ההיכר של חברות צמיחה יוצאות דופן.',
      },
    ],
    theory: {
      coreConcept:
        'צמיחת SaaS מתבססת על דחיית סיפוקים מושכלת. חברות שמבינות את עקומת ההחזר שלהן יכולות להוציא בביטחון יותר מהמתחרים על שיווק, כי הן יודעות שהכסף יחזור בוודאות לאורך 12 חודשים.',
      economicPrinciples: [
        'אפקט ההתרחבות: קוהורטים עם שדרוגי מנויים מתעקלים כלפי מעלה בצורת חיוך במקום לדעוך כלפי מטה.',
        'יעילות הון: החזר בתוך 5 חודשים מאפשר להשקיע את אותו תקציב פרסום של 10,000 ₪ יותר מפעמיים בשנה אחת.',
      ],
      commonMistakes: [
        'כניסה ללחץ מתזרים מזומנים שלילי בחודש הראשון כשהקוהורט מגיע לרווחיות יציבה בחודש הרביעי.',
        'ערבוב תשלומים שנתיים מראש עם מנויים חודשיים בחישוב קצב ההחזר.',
      ],
      industryBenchmark: 'בחברות B2B SaaS מצטיינות, זמן החזר ה-CAC עומד על 5-8 חודשים לחברות קטנות ו-12-14 חודשים לארגונים.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'בדקו את כרטיס זמן החזר ה-CAC הממוצע (יעד: פחות מ-6 חודשים).',
        'סרקו את שורות המטריצה: קוהורטים חדשים צריכים להפוך לירוקים מהר יותר מקוהורטים ישנים.',
        'בדקו את שיעורי השימור בחודשים M6 ו-M12.',
      ],
      redFlags: [
        'קוהורט עדכני שומר על פחות מ-70% לקוחות בחודש 3 (מעיד על בעיית שביעות רצון במוצר).',
        'זמן ההחזר מתארך ברציפות מ-5 חודשים ל-9 חודשים ומעלה.',
      ],
      recommendedActions: [
        'אם ההחזר מהיר במיוחד (פחות מ-4 חודשים): הגדילו תקציבי שיווק בביטחון כי ההון מתמחזר במהירות.',
        'אם השימור בחודש 1 צונח: נתחו את פניות התמיכה של אותו קוהורט כדי למצוא את סיבת הביטולים.',
      ],
    },
    copilotQueryPrompt: 'מהו זמן החזר ה-CAC הממוצע שלנו ב-12 הקוהורטים האחרונים, ואיזה חודש הגיע הכי מהר לרווחיות?',
  },

  attribution: {
    pageKey: 'attribution',
    title: 'מטריצת ייחוס רב-ערוצית (Attribution)',
    subtitle: 'הבנת מסע הלקוח המלא בכל נקודות המגע באמצעות מודל ערכי שפלי מתורת המשחקים.',
    badge: 'שיווק וקמפיינים',
    simpleExplanation: {
      whatItIs:
        'מסך זה עונה על השאלה: "איזה ערוץ שיווקי ראוי לקרדיט כאשר לקוח קונה?" המטריצה משווה בין מודלים פשטניים ישנים לבין מודל AI מבוסס תורת המשחקים.',
      whyYouCare:
        'פייסבוק טוענת שפייסבוק הביאה את הלקוח; גוגל טוענת שגוגל הביאה אותו. מודלים מסורתיים מתעלמים מהסרטון שחשף את הלקוח בפעם הראשונה וגורמים לכם לסגור קמפיינים מצוינים.',
      plainEnglishSummary:
        'חשבו על שער במשחק כדורגל: הבלם חוטף כדור, הקשר מוסר מסירה גאונית, והחלוץ בועט לרשת. מודל ישן נותן 100% מהקרדיט לחלוץ. מודל רב-ערוצי מחלק את הקרדיט בצדק בין כל מי שבישל את השער.',
    },
    terms: [
      {
        term: 'מגע ראשון (First-Touch)',
        simpleDefinition: 'מעניק 100% מהקרדיט על המכירה למודעה הראשונה שהלקוח אי פעם הקליק עליה.',
        analogy: 'לתת את כל הקרדיט למי שהכיר בינך לבין בן/בת הזוג שלך.',
        whyItMatters: 'מצוין למדידת קמפיינים של מודעות ראשונית וחשיפה רחבה.',
      },
      {
        term: 'מגע אחרון (Last-Touch)',
        simpleDefinition: 'מעניק 100% מהקרדיט לקליק האחרון שהתרחש רגע לפני הרכישה בקופה.',
        analogy: 'לתת את כל הקרדיט על ניצחון במרתון לצעד האחרון שחצה את קו הסיום.',
        whyItMatters: 'נוטה לייחס חשיבות מופרזת לחיפושי שם המותג בגוגל ולהתעלם מסרטוני חשיפה במטא.',
      },
      {
        term: 'ערכי שפלי (Shapley Values)',
        simpleDefinition: 'מודל מתמטי זוכה פרס נובל שמחשב את התרומה השולית האמיתית של כל ערוץ.',
        analogy: 'חישוב הבונוס המדויק לכל שחקן כדורסל על סמך איך הקבוצה קלעה כשהוא היה על המגרש לעומת כשישב על הספסל.',
        whyItMatters: 'הדרך ההוגנת והמדויקת ביותר לחלק את תקציב השיווק בין הערוצים השונים.',
      },
      {
        term: 'חלון ייחוס (Lookback Window)',
        simpleDefinition: 'כמה ימים אחורה המערכת מחפשת קליקים ומודעות שהובילו לרכישה.',
        analogy: 'לזכור את כל ההמלצות שחבר נתן לך ב-60 הימים האחרונים לפני שקנית את הספר.',
        whyItMatters: 'רכישות תוכנה B2B לוקחות שבועות; חלון קצר של 7 ימים מפספס 80% מהתמונה.',
      },
    ],
    theory: {
      coreConcept:
        'קונים מודרניים אינם רוכשים ממבט ראשון. הם רואים מודעה במטא, קוראים מאמר בגוגל, מקבלים מייל, ולבסוף מחפשים את שם המותג. כיבוי קמפיינים מוקדמים רק בגלל ROAS נמוך במגע אחרון יגרום לקריסת המכירות שבועיים אחר כך.',
      economicPrinciples: [
        'סינרגיה רב-ערוצית: לקוחות שנחשפו ל-2 ערוצים ומעלה ממירים פי 3 מלקוחות של ערוץ בודד.',
        'אינקרמנטליות: המבחן האמיתי להשקעת שיווק הוא האם המכירה הייתה מתרחשת ממילא בלעדיה.',
      ],
      commonMistakes: [
        'הסתמכות בלעדית על ברירת המחדל של גוגל אנליטיקס וכיבוי קמפייני וידאו בפייסבוק שמזינים את המשפך.',
        'ספירה כפולה של הכנסות כי שתי הפלטפורמות מייחסות לעצמן את אותה העסקה בדיוק.',
      ],
      industryBenchmark: 'בשיווק SaaS בריא, 40-50% מההכנסות נוגעות תחילה בערוצי סושיאל ורק בסוף בגוגל חיפוש.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'השוו את אחוז שפלי (Shapley) מול אחוז המגע האחרון עבור כל ערוץ.',
        'בדקו את רצפי המגע הנפוצים ביותר (Top Converting Pathways).',
        'וודאו שחלון הייחוס (60 יום) תואם את אורך מחזור המכירה האמיתי שלכם.',
      ],
      redFlags: [
        'לערוץ יש חשיפה ראשונית גבוהה אך 0 המרות במגע אחרון (הלידים ננטשים ללא ריטרגטינג).',
        'גוגל מותג טוען ל-80% מהמכירות כאשר המודעות בכלל נוצרה מסרטוני טיקטוק ופייסבוק.',
      ],
      recommendedActions: [
        'הסיטו תקציב לערוצים בעלי ROAS שפלי גבוה גם אם ביצועי המגע האחרון שלהם נראים צנועים.',
        'הקימו קמפייני ריטרגטינג ייעודיים למי שנחשף דרך ערוצי המודעות הראשונית המובילים.',
      ],
    },
    copilotQueryPrompt: 'השווה את חלוקת שפלי מול מגע אחרון בין מטא לגוגל. איזה ערוץ מקבל פחות קרדיט ממה שמגיע לו?',
  },

  'churn-reasons': {
    pageKey: 'churn-reasons',
    title: 'מודיעין נטישת לקוחות ושימור',
    subtitle: 'ניתוח סיבות ביטול מנויים, זיהוי גורמי שורש, ומניעת נטישה יזומה ונטישה טכנית.',
    badge: 'הכנסות ו-MRR',
    simpleExplanation: {
      whatItIs:
        'מסך זה מנטר כל לקוח שמבטל את המנוי או מפסיק לשלם, ממיין את הסיבות לביטול, ועוקב אחר שיעורי ההישרדות של הלקוחות לאורך זמן.',
      whyYouCare:
        'הבאת לקוח חדש עולה פי 5 מלשמור על לקוח קיים. נטישה של 5% בחודש פירושה שאתם מאבדים מחצית מהלקוחות שלכם בכל שנה. פתרון הנטישה הוא הדרך המהירה ביותר להכפיל את שווי החברה.',
      plainEnglishSummary:
        'חשבו על העסק שלכם כמו אמבטיה. אם פתח הניקוז פתוח לרווחה, אתם חייבים לפתוח את הברז במלוא העוצמה רק כדי שהמים לא ייגמרו. עצירת הנטישה סוגרת את פתח הניקוז.',
    },
    terms: [
      {
        term: 'נטישה גולמית מול נטישה נטו',
        simpleDefinition: 'נטישה גולמית היא סך ההכנסות שאבדו מביטולים; נטישה נטו מקזזת שדרוגים מלקוחות קיימים.',
        analogy: 'אם 2 אנשים עוזבים את המסיבה שלך אבל 3 אנשים מביאים איתם חבר נוסף, מספר המוזמנים הכללי גדל.',
        whyItMatters: 'חברות מובילות מגיעות לנטישה נטו שלילית (הכנסות מלקוחות קיימים גדלות יותר מהביטולים).',
        formulaOrExample: 'נטישה גולמית = כסף שאבד / הכנסות תחילת חודש; נטישה נטו = (אובדן פחות שדרוגים) / הכנסות',
      },
      {
        term: 'נטישה לא-רצונית (טכנית)',
        simpleDefinition: 'כאשר לקוח רוצה להישאר מנוי, אך כרטיס האשראי שלו נדחה, פג תוקף או נחסם על ידי הבנק.',
        analogy: 'להינעל מחוץ לדירה כי שכחת את המפתחות, לא כי החלטת לעבור דירה.',
        whyItMatters: 'מהווה 20-40% מכלל הנטישה וניתנת לפתרון כמעט מלא באמצעות מערכת ניסיונות חיוב חכמה.',
      },
      {
        term: 'עקומת הישרדות לקוחות',
        simpleDefinition: 'אחוז הלקוחות מקוהורט מסוים שממשיכים להיות מנויים פעילים כעבור ימים או חודשים.',
        analogy: 'עקומת הישרדות רפואית המראה כמה מטופלים נשארים בריאים לחלוטין שנה אחר שנה.',
        whyItMatters: 'מראה האם הנטישה קורית מיד בשבועיים הראשונים (אונבורדינג לקוי) או רק בסוף השנה.',
      },
      {
        term: 'סקר נטישה (Exit Survey)',
        simpleDefinition: 'משוב ישיר שנאסף מהלקוח בזמן תהליך ביטול המנוי (יקר מדי, חסר פיצ\'ר וכו\').',
        analogy: 'ראיון עזיבה שעושים לעובד שמסיים את עבודתו בחברה.',
        whyItMatters: 'מספק לצוותי הפיתוח והשיווק מידע מדויק מה דורש תיקון מיידי במוצר.',
      },
    ],
    theory: {
      coreConcept:
        'שימור הוא בעיית מוצר ואונבורדינג, לא בעיית מסך ביטול. לקוחות מחליטים האם יישארו ב-72 השעות הראשונות לשימוש במוצר. נטישה בחודש ה-6 נובעת בדרך כלל מהפעלה גרועה ביום ה-1.',
      economicPrinciples: [
        'כוחו של שימור מצטבר: הפחתת נטישה חודשית מ-3% ל-1.5% מכפילה את שווי חברת ה-SaaS תוך 3 שנים.',
        'ריכוזיות נטישה: אובדן לקוח ארגוני של 2,000$ לחודש כואב יותר מאיבוד 20 לקוחות מתחילים של 50$ לחודש.',
      ],
      commonMistakes: [
        'התייחסות לכל נטישה כאילו הלקוח לא מרוצה, בעוד שבמקרים רבים מדובר פשוט בכרטיס אשראי שפג תוקפו.',
        'הפיכת תהליך הביטול לבלתי אפשרי, מה שגורם להכחשות עסקה (Chargebacks) ולקנסות מחברות האשראי.',
      ],
      industryBenchmark: 'חברות B2B SaaS בריאות שומרות על נטישה גולמית מתחת ל-1.5-2.0% בחודש ונטישה נטו מתחת ל-0%.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'בדקו את תרשים סיבות הנטישה המובילות לזיהוי מגמות חדשות.',
        'וודאו שמערכת שחזור התשלומים האוטומטית פעילה עבור נטישה טכנית.',
        'עיינו ברשימת הביטולים בעלי שווי MRR גבוה מהיממה האחרונה.',
      ],
      redFlags: [
        'הנטישה החודשית הגולמית מזנקת מעל 3.5%.',
        'יותר מ-30% מהמבטלים מדווחים ש"המוצר מורכב מדי לשימוש".',
      ],
      recommendedActions: [
        'לנטישה טכנית: וודאו שתזכורות אוטומטיות וניסיונות חיוב חכמים (Stripe Smart Retries) מופעלים בדף התשלומים.',
        'לנטישה בגלל "פיצ\'ר חסר": בדקו את בקשות הפיצ\'רים של הלקוחות ותעדפו אותן בתוכנית העבודה.',
      ],
    },
    copilotQueryPrompt: 'מה הייתה הנטישה הגולמית והנטו שלנו בחודש שעבר, ומהן 3 סיבות הביטול הנפוצות ביותר?',
  },

  mcp: {
    pageKey: 'mcp',
    title: 'מרכז ה-Model Context Protocol (MCP) וחיבורי AI',
    subtitle: 'חיבור Claude Desktop, Cursor וסוכני AI ישירות למסד הנתונים האנליטי שלך מעל Streamable HTTP.',
    badge: 'נתונים ואינטגרציות',
    simpleExplanation: {
      whatItIs:
        'ה-Model Context Protocol (MCP) הוא תקן תעשייה פתוח שמאפשר לכלי AI חיצוניים (כמו Claude Desktop, Cursor או סקריפטים עצמאיים) לתקשר ישירות ובאופן מאובטח עם GrowthOS.',
      whyYouCare:
        'במקום לייצא קבצי אקסל ידנית ל-ChatGPT ולקוות שהוא לא יטעה בחישובים, MCP מעניק לסוכן ה-AI כלים מוגדרים לתשאל נתונים חיים, לחשב מדדים רשמיים, ולבצע פעולות שאושרו.',
      plainEnglishSummary:
        'חשבו על MCP כעל כבל USB רשמי ומאובטח שמחבר בין עוזר ה-AI שלכם לבין מסד הנתונים של העסק. לאחר החיבור תוכלו פשוט לכתוב לקלוד: "בדוק את ה-ROAS במטא והעלה את התקציב ל-250$", והוא יבצע זאת בבטחה.',
    },
    terms: [
      {
        term: 'Model Context Protocol (MCP)',
        simpleDefinition: 'פרוטוקול פתוח שפותח על ידי חברת Anthropic המאפשר למודלי AI להפעיל כלים ומסדי נתונים חיצוניים.',
        analogy: 'מתאם שקע חשמל אוניברסלי שמאפשר לכל מכשיר להתחבר לכל שקע בעולם בבטחה.',
        whyItMatters: 'מבטיח שה-AI עונה תשובות על סמך נתונים מתמטיים מאומתים מהמערכת במקום להמציא מידע.',
      },
      {
        term: 'Streamable HTTP (JSON-RPC 2.0)',
        simpleDefinition: 'פרוטוקול התקשורת המודרני שבו מועברות הפקודות והנתונים בין ה-AI לבין GrowthOS.',
        analogy: 'ערוץ קשר מאובטח במכשיר קשר שבו שני הצדדים מוודאים הבנה של כל משפט ברמת דיוק מוחלטת.',
        whyItMatters: 'פועל בצורה חלקה מעל HTTPS ללא צורך בהתקנת שרתים מקומיים או פתיחת פורטים מסוכנים ברשת.',
      },
      {
        term: 'הרשאות OAuth 2.1 ו-Scopes',
        simpleDefinition: 'מנגנון אבטחה שבו אתם מאשרים במדויק אילו פעולות כלי ה-AI מורשה לבצע (למשל: קריאת דוחות בלבד).',
        analogy: 'כרטיס כניסה אלקטרוני במלון שפותח רק את החדר שלך ואת חדר הכושר, אך לא את חדר הכספות של המלון.',
        whyItMatters: 'שומר על ביטחון העסק: ה-AI יכול לראות אך ורק את הפרויקט שהרשיתם ואינו יכול למחוק חשבונות.',
      },
      {
        term: 'אישור אנושי בתהליך (Human-In-The-Loop)',
        simpleDefinition: 'עיקרון אבטחה שבו ה-AI יכול להציע שינויים (כמו שינוי תקציב), אך רק לחיצה אנושית מאשרת את הביצוע בפועל.',
        analogy: 'טייס משנה במטוס שמציע לשנות גובה, אך הקברניט חייב לאשר וללחוץ על המתג בפועל.',
        whyItMatters: 'מעניק את כל יתרונות המהירות של ה-AI עם 0% סיכון לטעויות אוטונומיות.',
      },
    ],
    theory: {
      coreConcept:
        'סוכני AI אוטונומיים זקוקים לכלים מוגדרים ולא להוראות טקסט כלליות. מתן גישה ל-13 כלי MCP מדויקים (`query_metric`, `query_funnel`, `propose_action`) מאפשר לסוכן לפעול בדיוק מתמטי של 100%.',
      economicPrinciples: [
        'קבלת החלטות באפס זמן: מנהלים יכולים לתשאל מטריצות קוהורטים מורכבות תוך 2 שניות במקום להמתין ימים לצוות אנליסטים.',
        'שקיפות ותיעוד מלא: כל פקודה שמבוצעת על ידי AI נרשמת ביומן אבטחה מוצפן עם זהות המשתמש ושעת הפעולה.',
      ],
      commonMistakes: [
        'שיתוף מפתחות API סודיים בקוד ציבורי במקום להשתמש באימות OAuth 2.1 מאובטח.',
        'הנחה שה-AI יכול לשנות תקציבים ללא גבול. כל הפעולות ב-GrowthOS מוגנות באמצעות תקרות תקציב חסינות.',
      ],
      industryBenchmark: 'ארגונים המשתמשים ב-MCP מדווחים על ירידה של 70% בבקשות שליפת דוחות ידניות לצוותי פיתוח.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'וודאו שמחוון ה-Streamable HTTP מציג נורת דופק ירוקה (מחובר).',
        'עיינו ברשימת ההרשאות הפעילות ובטלו גישה של לקוחות שאינם בשימוש.',
        'השתמשו בבודק הלחיצה החיה בדפדפן כדי למדוד זמני תגובה (פחות מ-60 מילישניות).',
      ],
      redFlags: [
        'מופיע יישום בלתי מוכר תחת רשימת החיבורים המאושרים.',
        'בדיקת התקשורת החיה מציגה שגיאה 500 או זמן תגובה מעל 2,000 מילישניות.',
      ],
      recommendedActions: [
        'לחיבור Claude Desktop: העתיקו את קטע הגדרות ה-JSON המוכנות מלשונית Claude לתוך קובץ ההגדרות שלכם.',
        'לבדיקת היכולות: שאלו את סוכן ה-AI בפינה התחתונה שאלות על ה-CAC או על משפך ההמרה.',
      ],
    },
    copilotQueryPrompt: 'אילו כלי MCP זמינים בשרת שלנו, ואיך מחברים את Claude Desktop או Cursor?',
  },

  'cost-guardrails': {
    pageKey: 'cost-guardrails',
    title: 'בקרת עלויות והגנה אוטונומית על תקציבים',
    subtitle: 'רשתות ביטחון אוטומטיות למניעת חריגות תקציב, זיהוי אנומליות במכרזים, ואכיפת תקרות הוצאה.',
    badge: 'הכנסות ו-MRR',
    simpleExplanation: {
      whatItIs:
        'לוח הגנה שבו מגדירים תקרות הוצאה יומיות וחודשיות. אם אלגוריתם של פייסבוק או גוגל משתגע, או שמישהו בטעות הקליד תקציב יומי של 10,000 ₪ במקום 100 ₪, המערכת משהה את הקמפיין מיד.',
      whyYouCare:
        'לכל מנהל שיווק יש סיפור אימה על אפס מיותר שנוסף בטעות לתקציב והסתיים בחשבון אשראי מנופח בבוקר. מנגנון הגרדרילס מבטיח שזה לעולם לא יקרה בעסק שלך.',
      plainEnglishSummary:
        'חשבו על זה כמו ארון הפקקים והממסר הראשי בבית. אם יש קצר חשמלי, הפקק קופץ אוטומטית כדי שהבית לא יישרף. אלו פקקי ביטחון פיננסיים לחשבונות הפרסום שלכם.',
    },
    terms: [
      {
        term: 'תקרת הוצאה קשיחה (Hard Spend Cap)',
        simpleDefinition: 'מגבלת תקציב עליונה מוחלטת שלא ניתן לעבור בשום מצב.',
        analogy: 'כרטיס דביט נטען שמפסיק לעבוד ברגע שהיתרה מגיעה לאפס.',
        whyItMatters: 'מבטיח שחשבון האשראי החודשי לעולם לא יחרוג מתקציב השיווק שאושר בהנהלה.',
      },
      {
        term: 'סף אנומליה יומי',
        simpleDefinition: 'מתריע ומשהה קמפיינים שמוציאים מעל X% מהממוצע ההיסטורי שלהם בפרק זמן קצר.',
        analogy: 'הודעת SMS מחברת האשראי כשמתבצעת עסקה חריגה במדינה אחרת.',
        whyItMatters: 'עוצר תקלות מכרזים אלגוריתמיות לפני שאלפי שקלים נשרפים לחינם.',
      },
      {
        term: 'רצפת ROAS מינימלית',
        simpleDefinition: 'ההחזר המינימלי שמקובל עליך. אם הביצועים צונחים מתחת לרצפה זו, הקמפיין מופסק אוטומטית.',
        analogy: 'פקודת Stop-Loss בבורסה שמוכרת מניה אם היא יורדת מתחת למחיר מסוים.',
        whyItMatters: 'מונע מקמפיינים כושלים לשרוף כספים בשקט לאורך זמן.',
      },
      {
        term: 'מתג חירום ראשי (Kill Switch)',
        simpleDefinition: 'כפתור חירום בודד שמשהה מיידית את כל הפרסום הממומן בכל הרשתות בלחיצה אחת.',
        analogy: 'כפתור החירום האדום הגדול שמכבה את כל מכונות המפעל במקרה תקלה.',
        whyItMatters: 'מעניק שקט נפשי מוחלט במקרה של קריסת אתר, תקלת שרתים או השבתה בלתי צפויה.',
      },
    ],
    theory: {
      coreConcept:
        'רשתות הפרסום מתוכננות להוציא את כל התקציב שהגדרתם. ללא חומות הגנה חיצוניות, באגים באופטימיזציה או זינוקים עונתיים במחירי המכרזים יחסלו את שולי הרווח שלכם.',
      economicPrinciples: [
        'הגנה על ההון: מניעת הפסדים חדים בימים חלשים חשובה מתמטית יותר מסחיטת עוד 2% בימים חזקים.',
        'הגנה על שולי הרווח: שמירה על כך שעלות הבאת הלקוח לעולם לא תעלה על הרווח הגולמי של המוצר.',
      ],
      commonMistakes: [
        'הגדרת גבולות הדוקים מדי (פחות מ-5% סטייה), מה שגורם להשהיות שווא בשעות קניות עמוסות במיוחד.',
        'אי חיבור התראות SMS או וובהוק ל-Slack עבור אירועי קפיצת פקק.',
      ],
      industryBenchmark: 'חברות סטארטאפ בצמיחה מגדירות סף אנומליה של 25-35% סטייה מההוצאה ההיסטורית.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'וודאו שמחוון הגנת העלויות מציג סטטוס ירוק ופעיל.',
        'בדקו את ההוצאה המצטברת מתחילת החודש ביחס לתקרה שהוגדרה.',
        'עיינו ביומן הפעילות לבדיקת התראות אנומליה מהיממה האחרונה.',
      ],
      redFlags: [
        'פקק ביטחון קפץ וקמפיין מנצח הושבת ללא כוונה.',
        'נשרפו מעל 85% מתקציב החודש כשנותרו עוד מעל 10 ימים לסוף החודש.',
      ],
      recommendedActions: [
        'במקרה של תקלת אתר כוללת: לחצו על כפתור מתג החירום כדי להקפיא את כל המודעות מיד.',
        'בשלב הרחבת פעילות: הגדילו את תקרת התקציב בקפיצות מבוקרות של 20% בכל פעם.',
      ],
    },
    copilotQueryPrompt: 'האם כל מנגנוני הגנת העלויות פעילים, ומה קצב ההוצאה החודשי שלנו ביחס לתקרה?',
  },

  integrations: {
    pageKey: 'integrations',
    title: 'מרכז אינטגרציות והזרמת נתונים',
    subtitle: 'חיבור מערכות סליקה, רשתות פרסום, SDK ומערכות CRM ליצירת צינור נתוני צד-ראשון אמין.',
    badge: 'נתונים ואינטגרציות',
    simpleExplanation: {
      whatItIs:
        'מרכז החיבורים המקשר בין GrowthOS לכלים החיצוניים שלכם: Stripe להכנסות, Google ו-Meta להוצאות פרסום, וספריית ה-JavaScript לניטור מבקרים באתר.',
      whyYouCare:
        'GrowthOS אינה מסתמכת על עוגיות מעקב צד-שלישי או על הערכות משוערות. חיבור ישיר של מערכות הסליקה והפרסום מבטיח שכל גרף ומדד מבוססים על אירועים ועסקאות אמיתיות.',
      plainEnglishSummary:
        'חשבו על העסק שלכם כמו רכב חשמלי חכם. מרכז זה מחבר את חיישני הסוללה, המנוע וה-GPS כך שמחשב הרכב יציג בדיוק את הטווח, המהירות והביצועים האמיתיים שלכם.',
    },
    terms: [
      {
        term: 'נתוני צד-ראשון (First-Party Data)',
        simpleDefinition: 'מידע שנאסף ישירות בין העסק שלך ללקוחות שלך בדומיין שלך, ללא תלות בעוגיות צד-שלישי.',
        analogy: 'ספר האורחים הפרטי במסיבה שלך, במקום לשאול עובר אורח ברחוב מי נכנס.',
        whyItMatters: 'חסין לחלוטין מפני חוסמי פרסומות, מגבלות אפל (iOS) ושינויי פרטיות בדפדפנים.',
      },
      {
        term: 'וובהוק (Webhook)',
        simpleDefinition: 'הודעה דיגיטלית אוטומטית ש-Stripe או גוגל שולחות למערכת בדיוק במיקרו-שנייה שבה בוצע תשלום.',
        analogy: 'פעמון דלת שמצלצל ברגע המדויק שבו השליח מניח את החבילה על מפתן הבית.',
        whyItMatters: 'מבטיח שהדוחות מתעדכנים בזמן אמת במקום להמתין לעדכון לילי איטי.',
      },
      {
        term: 'תקינות קליטת נתונים (Ingestion Health)',
        simpleDefinition: 'בדיקת בקרה המוודאת שאירועים נכנסים מכילים את כל השדות הנדרשים ותאריכים תקינים.',
        analogy: 'מפקח איכות שבודק שחומרי הגלם טריים ותקינים לפני שהם נכנסים למטבח המסעדה.',
        whyItMatters: 'מונע מנתונים כפולים או משובשים לעוות את חישובי ה-CAC והרווח.',
      },
      {
        term: 'מפתח חתימה קריפטוגרפי (Signing Secret)',
        simpleDefinition: 'קוד אבטחה סודי המוכיח שההודעה אכן הגיעה מ-Stripe ולא נשלחה על ידי מתחזה.',
        analogy: 'חותמת שעווה מלכותית על מכתב המאשרת את מקוריותו ללא צל של ספק.',
        whyItMatters: 'מגן על מסד הנתונים שלכם מפני אירועי תשלום מזויפים.',
      },
    ],
    theory: {
      coreConcept:
        'מידע שגוי בכניסה מניב תוצאות שגויות ביציאה (GIGO). מודלי ייחוס מתקדמים וסוכני AI חסרי תועלת אם צינור הנתונים מפספס עסקאות או סופר הוצאות לא נכונות. צינור נתונים מאומת הוא הבסיס לכל החלטה עסקית.',
      economicPrinciples: [
        'שלמות נתונים: פספוס של 10% מעסקאות הסליקה מנפח את ה-CAC המדווח ב-11% וגורם לכם לעצור מודעות מנצחות בטעות.',
        'התאמה בצד השרת: זיהוי עסקאות באמצעות כתובת אימייל ומזהה משתמש בשרת מגיע ל-98% דיוק לעומת 65% בעוגיות דפדפן.',
      ],
      commonMistakes: [
        'חיבור רשתות פרסום אך שכחת חיבור מערכת הסליקה, מה שמשאיר את המערכת עיוורת לגבי הכנסות אמיתיות.',
        'התעלמות מהתראות "סטטוס מנוון" (Degraded) כאשר פג תוקפו של טוקן חיבור.',
      ],
      industryBenchmark: 'מערכות מובילות שומרות על זמן קליטת אירוע של פחות מ-5 שניות עם זמינות שרת של 99.9%.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'בדקו את שורת בריאות האינטגרציות: וודאו שכל הצינורות המחוברים מציגים תג ירוק.',
        'עיינו בלשונית החיבורים החסרים כדי לראות האם יש דוחות שחסרים להם נתונים.',
        'השתמשו בכפתור "שלח אירוע בדיקה" כדי לאמת קליטה לאחר הגדרת חיבור חדש.',
      ],
      redFlags: [
        'מחבר מציג תג אדום (לרוב מפתח API שפג תוקפו או סיסמת וובהוק ששונתה).',
        'מדד קליטת האירועים מציג 0 אירועים שנקלטו במהלך 24 השעות האחרונות.',
      ],
      recommendedActions: [
        'אם Stripe אינו מחובר: לחצו על התחברות מהירה לייבוא מנויים היסטוריים ולחישוב LTV אמיתי.',
        'אם ה-SDK חסר: העתיקו את שורת ה-`<script>` לתוך ה-`<head>` של האתר שלכם להתחלת מעקב.',
      ],
    },
    copilotQueryPrompt: 'אילו אינטגרציות פעילות כרגע בפרויקט, והאם חסרים לנו זרמי נתונים חיוניים?',
  },

  default: {
    pageKey: 'default',
    title: 'מדריך מסך ומונחי שיווק של GrowthOS',
    subtitle: 'הסברים פשוטים, מילון מונחים חיוני, וצעדים מעשיים שיעזרו לך להפיק את המרב ממסך זה.',
    badge: 'מדריך GrowthOS',
    simpleExplanation: {
      whatItIs:
        'מסך זה הוא חלק בלתי נפרד ממערכת ההפעלה GrowthOS, שנועד להעניק לך בהירות, שליטה ומידע עסקי קונקרטי על רכישת לקוחות והכנסות.',
      whyYouCare:
        'צמיחה מודרנית מחייבת התאמה בין הוצאות שיווק, מעורבות במוצר, ושימור פיננסי. הבנת המספרים במסך זה מאפשרת לקבל החלטות מהירות ובטוחות.',
      plainEnglishSummary:
        'בין אם אתם בוחנים מדדים, מגדירים אינטגרציות או מנהלים קמפיינים, מסך זה מתרגם נתוני לקוחות גולמיים לתועלת עסקית ברורה.',
    },
    terms: [
      {
        term: 'מדד ביצוע מרכזי (KPI)',
        simpleDefinition: 'מדד מוביל המשמש להערכת הצלחה של פעילות עסקית או קמפיין שיווקי.',
        analogy: 'לוח התוצאות במשחק כדורגל — מראה ברגע אחד האם אתם מנצחים או מפסידים.',
        whyItMatters: 'ממקד את הצוות במספרים המעטים שבאמת מזיזים את המחט בעסק.',
      },
      {
        term: 'יחידת כלכלה (Unit Economics)',
        simpleDefinition: 'ההכנסות והעלויות הישירות המשויכות ליחידה בסיסית אחת בעסק (בדרך כלל לקוח בודד).',
        analogy: 'חישוב האם מכירת כוס לימונדה אחת מכניסה יותר כסף ממה שעלו הלימונים והסוכר.',
        whyItMatters: 'אם יחידת הכלכלה מפסידה כסף, צמיחה מהירה יותר רק תאיץ את פשיטת הרגל.',
      },
      {
        term: 'מעקב צד-ראשון',
        simpleDefinition: 'איסוף נתוני פעילות לקוחות ישירות על התשתית שלכם ללא הסתמכות על עוגיות חיצוניות.',
        analogy: 'רישום הזמנות הלקוחות בפנקס הפרטי שלכם במקום לשאול זרים מי ביקר בחנות.',
        whyItMatters: 'שומר על פרטיות המשתמש ומבטיח 100% דיוק במדידה בכל הדפדפנים המודרניים.',
      },
    ],
    theory: {
      coreConcept:
        'צמיחה בת-קיימא נובעת מתשתיות ומערכות, לא ממהלכים מקריים חד-פעמיים. התאמה בין עלות רכישת לקוח (CAC) לבין שימור לקוחות והחזר מזומנים אמיתי בונה עסק רווחי וחסין.',
      economicPrinciples: [
        'מהירות ותנופה: מחזורי למידה ושיפור מהירים בקמפיינים ובמשפכים מצטברים ליתרון תחרותי עצום.',
        'שקיפות נתונים: שבירת חומות המידע בין השיווק, המוצר והכספים.',
      ],
      commonMistakes: [
        'אופטימיזציה למדדי לייקים שטחיים במקום לרווחיות חיי לקוח אמיתית.',
        'ביצוע שינויי תקציב משמעותיים לפני שווידאתם שמערכות המדידה פועלות בתקינות מלאה.',
      ],
      industryBenchmark: 'חברות SaaS מובילות שומרות על יחס שווי לקוח לעלות רכישה (LTV:CAC) של מעל 3:1 ושימור נטו מעל 100%.',
    },
    actionPlaybook: {
      dailyRoutine: [
        'בדקו את כרטיסי המדדים המרכזיים בראש הדף לזיהוי תנודות בלתי צפויות.',
        'וודאו שסינוני התאריכים והפילטרים תואמים את תקופת ההשוואה הנדרשת לכם.',
        'עיינו בהמלצות סוכן ה-AI ובהתראות המוצגות במסך.',
      ],
      redFlags: [
        'ירידה חדה בהיקף הפעילות ללא שינוי מכוון בתקציבים או בעדכוני גרסה במוצר.',
        'התראת אינטגרציה חסרה המעידה על כך שהדוחות מתבססים על נתונים חלקיים.',
      ],
      recommendedActions: [
        'לחצו על כפתור סוכן ה-AI בפינה התחתונה כדי לשאול שאלות או לבצע פעולות במסך זה.',
        'חזרו למדריך זה בכל פעם שאתם נתקלים במונח שיווקי או בנוסחה שאינה ברורה לכם.',
      ],
    },
    copilotQueryPrompt: 'תוכל לתת לי סקירת מנהלים על מה שמסך זה מציג ואילו פעולות כדאי לי לשקול לבצע?',
  },
};

/**
 * Resolves the appropriate page guide data based on explicit pageKey or current route pathname.
 */
export function getPageGuide(pageKeyOrPath: string, locale: 'en' | 'he' = 'en'): PageGuideData {
  const dictionary = locale === 'he' ? PAGE_GUIDES_HE : PAGE_GUIDES_EN;
  const key = resolvePageKey(pageKeyOrPath);
  return dictionary[key] || dictionary.default;
}

/**
 * Normalizes URL pathnames or explicit keys to canonical page guide keys.
 */
export function resolvePageKey(input: string): string {
  if (!input) return 'default';
  const clean = input.toLowerCase().trim();

  if (clean.includes('/campaigns')) return 'campaigns';
  if (clean.includes('/funnel')) return 'funnel';
  if (clean.includes('/cohorts')) return 'cohorts';
  if (clean.includes('/attribution')) return 'attribution';
  if (clean.includes('/churn-reasons') || clean.includes('/churn')) return 'churn-reasons';
  if (clean.includes('/mcp')) return 'mcp';
  if (clean.includes('/cost-guardrails') || clean.includes('/guardrails')) return 'cost-guardrails';
  if (clean.includes('/integrations')) return 'integrations';
  if (clean.includes('/setup-checklist')) return 'integrations';
  if (clean.includes('/win-rules')) return 'pulse';
  if (clean.includes('/experiments')) return 'campaigns';
  if (clean.includes('/billing-ops-feed') || clean.includes('/billing')) return 'pulse';
  if (clean.includes('/dashboard')) return 'pulse';

  // Direct keys
  if (PAGE_GUIDES_EN[clean]) return clean;

  return 'pulse';
}
