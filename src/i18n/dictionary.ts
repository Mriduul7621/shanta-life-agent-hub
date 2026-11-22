export type Lang = 'bn' | 'en';

export type DictKey =
  | 'appName'
  | 'appTagline'
  | 'navHome'
  | 'navLeads'
  | 'navLearning'
  | 'navCalculators'
  | 'navDashboard'
  | 'navProposals'
  | 'navProfile'
  | 'navHomeShort'
  | 'navLeadsShort'
  | 'navLearningShort'
  | 'navCalculatorsShort'
  | 'navDashboardShort'
  | 'navProfileShort'
  | 'loginTitle'
  | 'employeeId'
  | 'loginIdentifier'
  | 'loginIdentifierPlaceholder'
  | 'pin'
  | 'pinPlaceholder'
  | 'passwordPlaceholder'
  | 'forgotCredential'
  | 'signIn'
  | 'signingIn'
  | 'errorWrongPin'
  | 'errorAttemptsLeft'
  | 'errorLocked'
  | 'errorUnknownUser'
  | 'errorNotConfigured'
  | 'errorSessionExpired'
  | 'errorNoLmsRecord'
  | 'errorInactive'
  | 'errorMustChange'
  | 'errorUnavailable'
  | 'changeInLearningHub'
  | 'lockedMinutes'
  | 'greetingMorning'
  | 'greetingAfternoon'
  | 'greetingEvening'
  | 'widgetFollowups'
  | 'widgetFollowupsEmpty'
  | 'widgetDues'
  | 'widgetDuesEmpty'
  | 'widgetLearning'
  | 'widgetLearningEmpty'
  | 'widgetLearningMonth'
  | 'widgetLearningMonthEmpty'
  | 'widgetBusiness'
  | 'widgetBusinessEmpty'
  | 'businessPoliciesSub'
  | 'businessPoliciesSubOne'
  | 'followupsDue'
  | 'learningInProgress'
  | 'teamSectionTitle'
  | 'modulesTitle'
  | 'openTool'
  | 'opensInThisTab'
  | 'comingSoon'
  | 'proposalsSoon'
  | 'moduleSummaryTitle'
  | 'goToLeadManagement'
  | 'goToLearning'
  | 'profileTitle'
  | 'profileName'
  | 'profileRole'
  | 'profileLanguage'
  | 'profileVersion'
  | 'signOut'
  | 'consoleTitle'
  | 'roleEmployee'
  | 'roleTeamLead'
  | 'roleManager'
  | 'roleAdmin'
  | 'moduleLeadsDesc'
  | 'moduleLearningDesc'
  | 'modulePremiumDesc'
  | 'moduleSdppDesc'
  | 'moduleIncomeDesc'
  | 'moduleDashboardDesc'
  | 'moduleProposalsDesc'
  | 'groupLeads'
  | 'groupLearning'
  | 'groupCalculators'
  | 'groupDashboard'
  | 'groupProposals'
  | 'backHome'
  | 'courseProgress'
  | 'teamMembers'
  | 'teamLearningInProgress'
  // Retail Dashboard — scoped retail KPIs (replaces the SCC summary)
  | 'dashboardPageTitle'
  | 'dashboardScopeOwn'
  | 'dashboardScopeTeam'
  | 'dashboardScopeSubtree'
  | 'dashboardScopeOrg'
  | 'dashboardRefresh'
  | 'dashboardRefreshing'
  | 'dashboardBusinessTitle'
  | 'dashboardLeadersReportsTitle'
  | 'dashboardLeadersBeTitle'
  | 'dashboardUnassigned'
  | 'dashboardUnassignedNote'
  | 'dashboardOpenFull'
  | 'dashboardLoading'
  | 'dashboardLoadError'
  | 'dashboardLoadErrorDetail'
  | 'dashboardRetry'
  | 'dashboardRefreshFailed'
  | 'dashboardNoLeaders'
  | 'dashboardEmptyTitle'
  | 'dashboardEmptyNoCode'
  | 'dashboardEmptyNoRows'
  | 'kpiTotalPremium'
  | 'kpiFycp'
  | 'kpiPolicyQty'
  | 'kpiDuePremium'
  | 'kpiPersistency'
  | 'kpiActiveFas'
  | 'kpiActiveFasValue'
  | 'kpiSubNewPolicies'
  | 'kpiSubRatios'
  | 'kpiSubPersistency'
  | 'kpiSubNoPolicies'
  | 'kpiSubActiveFas'
  | 'leadersPolicies'
  // Milestone 3 — Due-premium widget
  | 'dueWidgetTitle'
  | 'dueWidgetOverdue'
  | 'dueWidgetDueOn'
  | 'dueWidgetUpcomingTitle'
  | 'dueWidgetNoUpcoming'
  | 'dueWidgetNoOverdue'
  // Phase 2 — live feeds (LeadFlow / Learning Hub / retail dues)
  | 'feedLoadError'
  | 'feedRetry'
  | 'moduleLoading'
  | 'moduleLoadError'
  | 'moduleLoadErrorDetail'
  | 'leadsDuesLoading'
  | 'leadsDuesUnavailable'
  | 'widgetDuesMonth'
  | 'widgetDuesMonthEmpty'
  | 'duesThisMonth'
  | 'dueWidgetPoliciesDue'
  | 'dueWidgetMonthLabel'
  | 'leadsOverdue'
  | 'leadsOpen'
  | 'leadsConverted'
  | 'leadsNewLeads'
  | 'learningCompleted'
  | 'learningCertificates'
  | 'learningCredits'
  | 'learningEnrolled'
  // Time-frame filter
  | 'periodLabel'
  | 'periodToday'
  | 'periodThisMonth'
  | 'periodLast3Months'
  | 'periodLast6Months'
  | 'periodThisYear'
  | 'periodAllTime'
  | 'periodCustom'
  | 'periodCustomFrom'
  | 'periodCustomTo'
  | 'periodCustomInvalid'
  | 'snapshotNow'
  | 'kpiSubCumulative'
  // Login page (Learning Hub pattern: photo panel + splash)
  | 'loginPanelEyebrow'
  | 'loginPanelHeadline'
  | 'loginPanelValue1'
  | 'loginPanelValue2'
  | 'loginPanelValue3'
  | 'splashLoading'
  // Android app download promo (Mahadi 2026-11-21)
  | 'androidPromoTitle'
  | 'androidPromoBody'
  | 'androidPromoDownload'
  | 'androidPromoNotNow'
  | 'androidPromoClose'
  | 'androidDownloadLink';

export const dict: Record<Lang, Record<DictKey, string>> = {
  en: {
    appName: 'Agent Hub',
    appTagline: 'Shanta Life Insurance PLC',
    navHome: 'Home',
    navLeads: 'Leads',
    navLearning: 'Learning',
    navCalculators: 'Calculators',
    navDashboard: 'Dashboard',
    navProposals: 'Proposals',
    navProfile: 'Profile',
    navHomeShort: 'Home',
    navLeadsShort: 'Leads',
    navLearningShort: 'Learn',
    navCalculatorsShort: 'Calc',
    navDashboardShort: 'Dash',
    navProfileShort: 'Profile',
    loginTitle: 'Sign in to Agent Hub',
    employeeId: 'Employee ID',
    loginIdentifier: 'Employee ID or email',
    loginIdentifierPlaceholder: 'e.g. 2025019 or name@shantalife.com',
    pin: 'PIN / Password',
    pinPlaceholder: '6-digit PIN',
    passwordPlaceholder: 'Password',
    forgotCredential: 'Forgot PIN or password?',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    errorWrongPin: 'Wrong PIN or password. Please try again.',
    errorAttemptsLeft: 'attempts left before lockout',
    errorLocked: 'Account locked after 5 wrong attempts.',
    errorUnknownUser: 'Employee ID not found.',
    errorNotConfigured: 'Sign-in is not configured in this build.',
    errorSessionExpired: 'Your session expired. Please sign in again.',
    errorNoLmsRecord:
      'No Learning Hub record found for this Employee ID. Please contact the Training & Development team.',
    errorInactive: 'This account is inactive. Please contact the Training & Development team.',
    errorMustChange:
      'Your PIN or password is temporary. Please change it in the Learning Hub first, then sign in here.',
    errorUnavailable: 'Sign-in is temporarily unavailable. Please try again in a moment.',
    changeInLearningHub: 'Change it in the Learning Hub',
    lockedMinutes: 'Try again in {minutes} minutes.',
    greetingMorning: 'Good morning',
    greetingAfternoon: 'Good afternoon',
    greetingEvening: 'Good evening',
    widgetFollowups: "Today's follow-ups",
    widgetFollowupsEmpty: 'No follow-ups due today',
    widgetDues: 'Dues this week',
    widgetDuesEmpty: 'No premiums due this week',
    widgetLearning: 'Learning in progress',
    widgetLearningEmpty: 'No course in progress',
    widgetLearningMonth: 'Learning this month',
    widgetLearningMonthEmpty: 'No learning this month',
    widgetBusiness: "This month's business",
    widgetBusinessEmpty: 'No business recorded this month',
    businessPoliciesSub: '{count} policies',
    businessPoliciesSubOne: '1 policy',
    followupsDue: 'follow-ups due',
    learningInProgress: 'in progress',
    teamSectionTitle: 'Your team',
    modulesTitle: 'Your tools',
    openTool: 'Open',
    opensInThisTab: 'Opens in this tab',
    comingSoon: 'Coming soon',
    proposalsSoon: 'Link to confirm with IT',
    moduleSummaryTitle: 'Summary',
    goToLeadManagement: 'Go to Lead Management',
    goToLearning: 'Go to Learning',
    profileTitle: 'Profile',
    profileName: 'Name',
    profileRole: 'Role',
    profileLanguage: 'Language',
    profileVersion: 'App version',
    signOut: 'Sign out',
    consoleTitle: 'T&D Console',
    roleEmployee: 'Employee',
    roleTeamLead: 'Team Lead',
    roleManager: 'Manager',
    roleAdmin: 'Admin / T&D',
    moduleLeadsDesc: 'Leads, follow-ups, reminders and Lead360.',
    moduleLearningDesc: 'Courses, quizzes and certificates.',
    modulePremiumDesc: 'Premium calculator for all products.',
    moduleSdppDesc: 'SDPP maturity value projection, all payment modes.',
    moduleIncomeDesc: 'Agent income / commission illustration.',
    moduleDashboardDesc: 'Retail sales, recruitment, persistency and due premium by BE/GM.',
    moduleProposalsDesc: 'Proposal submission stays with the official agent portal.',
    groupLeads: 'Leads',
    groupLearning: 'Learning',
    groupCalculators: 'Calculators',
    groupDashboard: 'Dashboard',
    groupProposals: 'Proposals',
    backHome: 'Back to Home',
    courseProgress: 'course progress',
    teamMembers: 'team members',
    teamLearningInProgress: '{count} team members learning in progress',
    dashboardPageTitle: 'Retail Sales Dashboard',
    dashboardScopeOwn: 'Own data',
    dashboardScopeTeam: 'Own + team',
    dashboardScopeSubtree: 'Own + subtree',
    dashboardScopeOrg: 'Org-wide',
    dashboardRefresh: 'Refresh',
    dashboardRefreshing: 'Refreshing…',
    dashboardBusinessTitle: 'Business overview',
    dashboardLeadersReportsTitle: 'Top team members',
    dashboardLeadersBeTitle: 'Top Business Executives',
    dashboardUnassigned: 'Unassigned',
    dashboardUnassignedNote: 'Premiums that cannot be placed under a person in scope',
    dashboardOpenFull: 'Open the full dashboard',
    dashboardLoading: 'Loading the dashboard…',
    dashboardLoadError: 'Could not load the dashboard.',
    dashboardLoadErrorDetail:
      'Check your connection and try again, or open the full Retail Sales Dashboard.',
    dashboardRetry: 'Try again',
    dashboardRefreshFailed: 'Refresh failed — showing data from {time}',
    dashboardNoLeaders: 'No business in scope yet',
    dashboardEmptyTitle: 'No sales data in scope',
    dashboardEmptyNoCode:
      'No producer code is linked to this Employee ID yet. Ask T&D or your admin to link your code.',
    dashboardEmptyNoRows: 'No business recorded in your scope yet.',
    kpiTotalPremium: 'Total premium received',
    kpiFycp: 'FYCP',
    kpiPolicyQty: 'Policies',
    kpiDuePremium: 'Due premium — this month',
    kpiPersistency: 'Persistency',
    kpiActiveFas: 'Active field FAs',
    kpiActiveFasValue: '{active} of {total}',
    kpiSubNewPolicies: 'New policies',
    kpiSubRatios: 'Deferred {deferred}% · Renewal {renewal}%',
    kpiSubPersistency: '{inf} of {all} inforce',
    kpiSubNoPolicies: 'No policies in scope',
    kpiSubActiveFas: 'Sold at least once (all-time)',
    leadersPolicies: '{count} policies',
    dueWidgetTitle: 'Due premiums',
    dueWidgetOverdue: 'Overdue',
    dueWidgetDueOn: 'Due {date}',
    dueWidgetUpcomingTitle: 'Upcoming dues',
    dueWidgetNoUpcoming: 'No upcoming dues',
    dueWidgetNoOverdue: 'No overdue premiums',
    feedLoadError: 'Could not load this data.',
    feedRetry: 'Try again',
    moduleLoading: 'Loading…',
    moduleLoadError: 'Could not load the data.',
    moduleLoadErrorDetail: 'Check your connection and try again.',
    leadsDuesLoading: 'Loading dues…',
    leadsDuesUnavailable: 'Dues unavailable',
    widgetDuesMonth: 'Dues this month',
    widgetDuesMonthEmpty: 'No premiums due this month',
    duesThisMonth: 'premiums due this month',
    dueWidgetPoliciesDue: '{count} policies due',
    dueWidgetMonthLabel: 'Due in {month}',
    leadsOverdue: 'Overdue follow-ups',
    leadsOpen: 'Open leads',
    leadsConverted: 'Converted',
    leadsNewLeads: 'New leads',
    learningCompleted: 'Courses completed',
    learningCertificates: 'Certificates',
    learningCredits: 'Knowledge Credit',
    learningEnrolled: 'Courses enrolled',
    periodLabel: 'Time frame',
    periodToday: 'Today',
    periodThisMonth: 'This month',
    periodLast3Months: 'Last 3 months',
    periodLast6Months: 'Last 6 months',
    periodThisYear: 'This year',
    periodAllTime: 'All time',
    periodCustom: 'Custom',
    periodCustomFrom: 'From',
    periodCustomTo: 'To',
    periodCustomInvalid: 'Pick a valid date range (up to 2 years, ending today).',
    snapshotNow: 'Now',
    kpiSubCumulative: 'Cumulative',
    loginPanelEyebrow: 'AGENT HUB',
    loginPanelHeadline: 'From lead to sale — all in one place.',
    loginPanelValue1: 'Every lead, from first call to closed sale',
    loginPanelValue2: 'Learning built for the field — courses, quizzes, certificates',
    loginPanelValue3: 'Your numbers, analysed — sales, dues, performance',
    splashLoading: 'Loading Agent Hub…',
    androidPromoTitle: 'Get the Android app',
    androidPromoBody: 'Install the app for one-tap access from your home screen.',
    androidPromoDownload: 'Download',
    androidPromoNotNow: 'Not now',
    androidPromoClose: 'Close',
    androidDownloadLink: 'Download Android app',
  },
  bn: {
    appName: 'এজেন্ট হাব',
    appTagline: 'শান্তা লাইফ ইন্স্যুরেন্স পিএলসি',
    navHome: 'হোম',
    navLeads: 'লিডস',
    navLearning: 'লার্নিং',
    navCalculators: 'ক্যালকুলেটর',
    navDashboard: 'ড্যাশবোর্ড',
    navProposals: 'প্রপোজাল',
    navProfile: 'প্রোফাইল',
    navHomeShort: 'হোম',
    navLeadsShort: 'লিডস',
    navLearningShort: 'লার্ন',
    navCalculatorsShort: 'ক্যালক',
    navDashboardShort: 'ড্যাশ',
    navProfileShort: 'প্রোফাইল',
    loginTitle: 'এজেন্ট হাবে সাইন ইন করুন',
    employeeId: 'কর্মচারী আইডি',
    loginIdentifier: 'কর্মচারী আইডি বা ইমেইল',
    loginIdentifierPlaceholder: 'যেমন 2025019 বা name@shantalife.com',
    pin: 'পিন / পাসওয়ার্ড',
    pinPlaceholder: '৬ সংখ্যার পিন',
    passwordPlaceholder: 'পাসওয়ার্ড',
    forgotCredential: 'পিন বা পাসওয়ার্ড ভুলে গেছেন?',
    signIn: 'সাইন ইন',
    signingIn: 'সাইন ইন হচ্ছে…',
    errorWrongPin: 'ভুল পিন বা পাসওয়ার্ড। আবার চেষ্টা করুন।',
    errorAttemptsLeft: 'বার চেষ্টা বাকি আছে, তারপর লক হবে',
    errorLocked: '৫ বার ভুল চেষ্টার পর অ্যাকাউন্ট লক হয়েছে।',
    errorUnknownUser: 'কর্মচারী আইডি পাওয়া যায়নি।',
    errorNotConfigured: 'এই বিল্ডে সাইন-ইন কনফিগার করা হয়নি।',
    errorSessionExpired: 'আপনার সেশন শেষ হয়ে গেছে। আবার সাইন ইন করুন।',
    errorNoLmsRecord:
      'এই কর্মচারী আইডির জন্য কোনো লার্নিং হাব রেকর্ড পাওয়া যায়নি। প্রশিক্ষণ ও উন্নয়ন টিমের সাথে যোগাযোগ করুন।',
    errorInactive: 'এই অ্যাকাউন্টটি নিষ্ক্রিয়। প্রশিক্ষণ ও উন্নয়ন টিমের সাথে যোগাযোগ করুন।',
    errorMustChange:
      'আপনার পিন বা পাসওয়ার্ড অস্থায়ী। প্রথমে লার্নিং হাবে পরিবর্তন করুন, তারপর এখানে সাইন ইন করুন।',
    errorUnavailable: 'সাইন-ইন সাময়িকভাবে অনুপলব্ধ। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
    changeInLearningHub: 'লার্নিং হাবে পরিবর্তন করুন',
    lockedMinutes: '{minutes} মিনিট পরে আবার চেষ্টা করুন।',
    greetingMorning: 'শুভ সকাল',
    greetingAfternoon: 'শুভ অপরাহ্ন',
    greetingEvening: 'শুভ সন্ধ্যা',
    widgetFollowups: 'আজকের ফলো-আপ',
    widgetFollowupsEmpty: 'আজ কোনো ফলো-আপ নেই',
    widgetDues: 'এই সপ্তাহের বকেয়া',
    widgetDuesEmpty: 'এই সপ্তাহে কোনো প্রিমিয়াম বকেয়া নেই',
    widgetLearning: 'চলমান লার্নিং',
    widgetLearningEmpty: 'কোনো কোর্স চলমান নেই',
    widgetLearningMonth: 'এই মাসের লার্নিং',
    widgetLearningMonthEmpty: 'এই মাসে কোনো লার্নিং নেই',
    widgetBusiness: 'এই মাসের ব্যবসা',
    widgetBusinessEmpty: 'এই মাসে কোনো ব্যবসা রেকর্ড হয়নি',
    businessPoliciesSub: '{count}টি পলিসি',
    businessPoliciesSubOne: '{count}টি পলিসি',
    followupsDue: 'টি ফলো-আপ বকেয়া',
    learningInProgress: 'চলমান',
    teamSectionTitle: 'আপনার টিম',
    modulesTitle: 'আপনার টুলস',
    openTool: 'খুলুন',
    opensInThisTab: 'এই ট্যাবেই খুলবে',
    comingSoon: 'শীঘ্রই আসছে',
    proposalsSoon: 'লিংক আইটির সঙ্গে নিশ্চিত করতে হবে',
    moduleSummaryTitle: 'সারসংক্ষেপ',
    goToLeadManagement: 'লিড ম্যানেজমেন্টে যান',
    goToLearning: 'লার্নিং-এ যান',
    profileTitle: 'প্রোফাইল',
    profileName: 'নাম',
    profileRole: 'ভূমিকা',
    profileLanguage: 'ভাষা',
    profileVersion: 'অ্যাপ সংস্করণ',
    signOut: 'সাইন আউট',
    consoleTitle: 'টি অ্যান্ড ডি কনসোল',
    roleEmployee: 'কর্মচারী',
    roleTeamLead: 'টিম লিড',
    roleManager: 'ম্যানেজার',
    roleAdmin: 'অ্যাডমিন / টি অ্যান্ড ডি',
    moduleLeadsDesc: 'লিডস, ফলো-আপ, রিমাইন্ডার এবং লিড৩৬০।',
    moduleLearningDesc: 'কোর্স, কুইজ এবং সার্টিফিকেট।',
    modulePremiumDesc: 'সব প্রোডাক্টের প্রিমিয়াম ক্যালকুলেটর।',
    moduleSdppDesc: 'সব পেমেন্ট মোডে এসডিপিপি ম্যাচুরিটি ভ্যালু প্রজেকশন।',
    moduleIncomeDesc: 'এজেন্ট আয় / কমিশন চিত্র।',
    moduleDashboardDesc: 'বিই/জিএম অনুযায়ী রিটেইল সেলস, রিক্রুটমেন্ট, পারসিসটেন্সি ও বকেয়া প্রিমিয়াম।',
    moduleProposalsDesc: 'প্রপোজাল জমা অফিসিয়াল এজেন্ট পোর্টালেই থাকে।',
    groupLeads: 'লিডস',
    groupLearning: 'লার্নিং',
    groupCalculators: 'ক্যালকুলেটর',
    groupDashboard: 'ড্যাশবোর্ড',
    groupProposals: 'প্রপোজাল',
    backHome: 'হোমে ফিরুন',
    courseProgress: 'কোর্স অগ্রগতি',
    teamMembers: 'টিম সদস্য',
    teamLearningInProgress: '{count} জন টিম মেম্বার শিখছেন',
    dashboardPageTitle: 'রিটেইল সেলস ড্যাশবোর্ড',
    dashboardScopeOwn: 'নিজের ডেটা',
    dashboardScopeTeam: 'নিজের + টিম',
    dashboardScopeSubtree: 'নিজের + অধীনস্থ সংগঠন',
    dashboardScopeOrg: 'সারা প্রতিষ্ঠানজুড়ে',
    dashboardRefresh: 'রিফ্রেশ',
    dashboardRefreshing: 'রিফ্রেশ হচ্ছে…',
    dashboardBusinessTitle: 'ব্যবসার সারসংক্ষেপ',
    dashboardLeadersReportsTitle: 'শীর্ষ টিম মেম্বার',
    dashboardLeadersBeTitle: 'শীর্ষ বিজনেস এক্সিকিউটিভ',
    dashboardUnassigned: 'বরাদ্দহীন',
    dashboardUnassignedNote: 'যেসব প্রিমিয়াম এই স্কোপে কারো অধীনে বসানো যায়নি',
    dashboardOpenFull: 'পূর্ণ ড্যাশবোর্ড খুলুন',
    dashboardLoading: 'ড্যাশবোর্ড লোড হচ্ছে…',
    dashboardLoadError: 'ড্যাশবোর্ড লোড করা যায়নি।',
    dashboardLoadErrorDetail:
      'আপনার সংযোগ পরীক্ষা করে আবার চেষ্টা করুন, অথবা পূর্ণ রিটেইল সেলস ড্যাশবোর্ড খুলুন।',
    dashboardRetry: 'আবার চেষ্টা করুন',
    dashboardRefreshFailed: 'রিফ্রেশ ব্যর্থ — {time}-এর ডেটা দেখানো হচ্ছে',
    dashboardNoLeaders: 'এই স্কোপে এখনো কোনো ব্যবসা নেই',
    dashboardEmptyTitle: 'এই স্কোপে কোনো সেলস ডেটা নেই',
    dashboardEmptyNoCode:
      'এই এমপ্লয়ি আইডির সাথে এখনো কোনো প্রোডিউসার কোড যুক্ত হয়নি। আপনার কোড যুক্ত করতে টি অ্যান্ড ডি বা অ্যাডমিনের সাথে যোগাযোগ করুন।',
    dashboardEmptyNoRows: 'আপনার স্কোপে এখনো কোনো ব্যবসা রেকর্ড হয়নি।',
    kpiTotalPremium: 'মোট প্রাপ্ত প্রিমিয়াম',
    kpiFycp: 'এফওয়াইসিপি',
    kpiPolicyQty: 'পলিসি',
    kpiDuePremium: 'বকেয়া প্রিমিয়াম — এই মাসে',
    kpiPersistency: 'পারসিস্টেন্সি',
    kpiActiveFas: 'সক্রিয় ফিল্ড এফএ',
    kpiActiveFasValue: '{total} জনের মধ্যে {active} জন',
    kpiSubNewPolicies: 'নতুন পলিসি',
    kpiSubRatios: 'ডেফার্ড {deferred}% · রিনিউয়াল {renewal}%',
    kpiSubPersistency: '{all}টির মধ্যে {inf}টি ইনফোর্স',
    kpiSubNoPolicies: 'এই স্কোপে কোনো পলিসি নেই',
    kpiSubActiveFas: 'অন্তত একবার বিক্রি করেছেন',
    leadersPolicies: '{count}টি পলিসি',
    dueWidgetTitle: 'বকেয়া প্রিমিয়াম',
    dueWidgetOverdue: 'মেয়াদোত্তীর্ণ',
    dueWidgetDueOn: '{date}-এ বকেয়া',
    dueWidgetUpcomingTitle: 'আসন্ন বকেয়া',
    dueWidgetNoUpcoming: 'কোনো আসন্ন বকেয়া নেই',
    dueWidgetNoOverdue: 'কোনো মেয়াদোত্তীর্ণ প্রিমিয়াম নেই',
    feedLoadError: 'এই ডেটা লোড করা যায়নি।',
    feedRetry: 'আবার চেষ্টা করুন',
    moduleLoading: 'লোড হচ্ছে…',
    moduleLoadError: 'ডেটা লোড করা যায়নি।',
    moduleLoadErrorDetail: 'আপনার সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।',
    leadsDuesLoading: 'বকেয়া লোড হচ্ছে…',
    leadsDuesUnavailable: 'বকেয়া তথ্য পাওয়া যায়নি',
    widgetDuesMonth: 'এই মাসের বকেয়া',
    widgetDuesMonthEmpty: 'এই মাসে কোনো প্রিমিয়াম বকেয়া নেই',
    duesThisMonth: 'এই মাসে বকেয়া প্রিমিয়াম',
    dueWidgetPoliciesDue: '{count}টি পলিসি বকেয়া',
    dueWidgetMonthLabel: '{month}-এ বকেয়া',
    leadsOverdue: 'মেয়াদোত্তীর্ণ ফলো-আপ',
    leadsOpen: 'খোলা লিড',
    leadsConverted: 'কনভার্টেড',
    leadsNewLeads: 'নতুন লিড',
    learningCompleted: 'সম্পন্ন কোর্স',
    learningCertificates: 'সার্টিফিকেট',
    learningCredits: 'নলেজ ক্রেডিট',
    learningEnrolled: 'ভর্তি কোর্স',
    periodLabel: 'সময়সীমা',
    periodToday: 'আজ',
    periodThisMonth: 'এই মাস',
    periodLast3Months: 'গত ৩ মাস',
    periodLast6Months: 'গত ৬ মাস',
    periodThisYear: 'এই বছর',
    periodAllTime: 'সর্বমোট',
    periodCustom: 'নিজস্ব',
    periodCustomFrom: 'শুরু',
    periodCustomTo: 'শেষ',
    periodCustomInvalid: 'সঠিক তারিখের পরিসর দিন (সর্বোচ্চ ২ বছর, আজ পর্যন্ত)।',
    snapshotNow: 'এখন',
    kpiSubCumulative: 'সব মিলিয়ে',
    loginPanelEyebrow: 'এজেন্ট হাব',
    loginPanelHeadline: 'লিড থেকে সেল — সব এক জায়গায়।',
    loginPanelValue1: 'প্রতিটি লিড — প্রথম কল থেকে সেল পর্যন্ত',
    loginPanelValue2: 'ফিল্ডের জন্য শেখা — কোর্স, কুইজ, সার্টিফিকেট',
    loginPanelValue3: 'তোমার সংখ্যা, বিশ্লেষণসহ — সেল, বকেয়া, পারফরম্যান্স',
    splashLoading: 'এজেন্ট হাব লোড হচ্ছে…',
    androidPromoTitle: 'অ্যান্ড্রয়েড অ্যাপটি নিন',
    androidPromoBody: 'হোম স্ক্রিন থেকে এক ট্যাপে খুলতে অ্যাপটি ইনস্টল করুন।',
    androidPromoDownload: 'ডাউনলোড',
    androidPromoNotNow: 'এখন নয়',
    androidPromoClose: 'বন্ধ করুন',
    androidDownloadLink: 'অ্যান্ড্রয়েড অ্যাপ ডাউনলোড করুন',
  },
};
