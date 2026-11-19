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
  | 'loginSubtitle'
  | 'employeeId'
  | 'employeeIdPlaceholder'
  | 'pin'
  | 'pinPlaceholder'
  | 'signIn'
  | 'signingIn'
  | 'demoNoticeTitle'
  | 'demoNoticeBody'
  | 'demoUser'
  | 'errorWrongPin'
  | 'errorAttemptsLeft'
  | 'errorLocked'
  | 'errorUnknownUser'
  | 'errorNotConfigured'
  | 'errorSessionExpired'
  | 'lockedMinutes'
  | 'changePinTitle'
  | 'changePinSubtitle'
  | 'newPin'
  | 'confirmPin'
  | 'changePinButton'
  | 'errorPinMismatch'
  | 'errorPinInvalid'
  | 'errorPinSame'
  | 'greetingMorning'
  | 'greetingAfternoon'
  | 'greetingEvening'
  | 'homeSubtitle'
  | 'demoDataBadge'
  | 'widgetFollowups'
  | 'widgetFollowupsEmpty'
  | 'widgetDues'
  | 'widgetDuesEmpty'
  | 'widgetLearning'
  | 'widgetLearningEmpty'
  | 'widgetBusiness'
  | 'widgetBusinessEmpty'
  | 'followupsDue'
  | 'duesThisWeek'
  | 'learningInProgress'
  | 'businessThisMonth'
  | 'teamSectionTitle'
  | 'teamSectionSubtitle'
  | 'modulesTitle'
  | 'modulesSubtitle'
  | 'openTool'
  | 'opensInThisTab'
  | 'comingSoon'
  | 'proposalsSoon'
  | 'profileTitle'
  | 'profileName'
  | 'profileRole'
  | 'profileLanguage'
  | 'profileVersion'
  | 'signOut'
  | 'consoleTitle'
  | 'consoleSoon'
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
  | 'pageLeadsIntro'
  | 'pageLearningIntro'
  | 'pageCalculatorsIntro'
  | 'pageDashboardIntro'
  | 'pageProposalsIntro'
  | 'pageProposalsNote'
  | 'backHome'
  | 'courseProgress'
  | 'teamMembers'
  | 'teamLearningInProgress'
  | 'demoRoleNote'
  | 'demoFirstLoginChange'
  // Milestone 3 — Dashboard (Sales Command Center summary)
  | 'dashboardLiveFrom'
  | 'dashboardOrgWide'
  | 'dashboardLastSynced'
  | 'dashboardRefresh'
  | 'dashboardRefreshing'
  | 'dashboardSalesTitle'
  | 'dashboardSalesSubtitle'
  | 'dashboardTrainingTitle'
  | 'dashboardTrainingSubtitle'
  | 'dashboardLeadersTitle'
  | 'dashboardLeadersSubtitle'
  | 'dashboardUnassigned'
  | 'dashboardUnassignedNote'
  | 'dashboardOpenFull'
  | 'dashboardLoading'
  | 'dashboardLoadError'
  | 'dashboardLoadErrorDetail'
  | 'dashboardRetry'
  | 'dashboardRefreshFailed'
  | 'dashboardSessionsUnavailable'
  | 'dashboardNoLeaders'
  | 'kpiNewPremium'
  | 'kpiPolicyQty'
  | 'kpiLifetimePremium'
  | 'kpiActiveProducers'
  | 'kpiAvgPremiumFa'
  | 'kpiAvgPolicyFa'
  | 'kpiTotalSessions'
  | 'kpiTotalParticipants'
  | 'kpiTotalCost'
  | 'kpiFaTrained'
  | 'kpiSubAllProducers'
  | 'kpiSubNewPolicies'
  | 'kpiSubAllTime'
  | 'kpiSubFaActive'
  | 'kpiSubPerActiveFa'
  | 'kpiSubAllSessions'
  | 'kpiSubTotalTrained'
  | 'kpiSubFaTrained'
  | 'trainingDetailTitle'
  | 'trainingBasic'
  | 'trainingReview'
  | 'trainingFoundation'
  | 'trainingGap'
  | 'trainingGapSub'
  | 'trainingGapSubOne'
  | 'leadersPolicies'
  // Milestone 3 — Due-premium widget (demo data)
  | 'dueWidgetTitle'
  | 'dueWidgetDemoNote'
  | 'dueWidgetDueThisWeek'
  | 'dueWidgetOverdue'
  | 'dueWidgetShowing'
  | 'dueWidgetBacklog'
  | 'dueWidgetDueOn';

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
    loginSubtitle: 'One login for all your tools',
    employeeId: 'Employee ID',
    employeeIdPlaceholder: 'e.g. 9990001',
    pin: 'PIN / Password',
    pinPlaceholder: '6-digit PIN',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    demoNoticeTitle: 'DEMO — for testing only',
    demoNoticeBody:
      'Demo sign-in is enabled in this build. Use a demo account below. No real employee data is used.',
    demoUser: 'Demo',
    errorWrongPin: 'Wrong PIN. Please try again.',
    errorAttemptsLeft: 'attempts left before lockout',
    errorLocked: 'Account locked after 5 wrong attempts.',
    errorUnknownUser: 'Employee ID not found.',
    errorNotConfigured: 'Sign-in is not configured in this build.',
    errorSessionExpired: 'Your session expired. Please sign in again.',
    lockedMinutes: 'Try again in {minutes} minutes.',
    changePinTitle: 'Set a new PIN',
    changePinSubtitle:
      'This is your first sign-in with a temporary PIN. Set a new 6-digit PIN to continue.',
    newPin: 'New PIN',
    confirmPin: 'Confirm new PIN',
    changePinButton: 'Save new PIN & continue',
    errorPinMismatch: 'The two PINs do not match.',
    errorPinInvalid: 'PIN must be exactly 6 digits.',
    errorPinSame: 'New PIN must be different from the temporary PIN.',
    greetingMorning: 'Good morning',
    greetingAfternoon: 'Good afternoon',
    greetingEvening: 'Good evening',
    homeSubtitle: 'Here is your day at a glance.',
    demoDataBadge: 'DEMO DATA',
    widgetFollowups: "Today's follow-ups",
    widgetFollowupsEmpty: 'No follow-ups due today',
    widgetDues: 'Dues this week',
    widgetDuesEmpty: 'No premiums due this week',
    widgetLearning: 'Learning in progress',
    widgetLearningEmpty: 'No course in progress',
    widgetBusiness: "This month's business",
    widgetBusinessEmpty: 'No business recorded this month',
    followupsDue: 'follow-ups due',
    duesThisWeek: 'premiums due',
    learningInProgress: 'in progress',
    businessThisMonth: 'FYCP this month',
    teamSectionTitle: 'Your team',
    teamSectionSubtitle: 'Team totals for your downline.',
    modulesTitle: 'Your tools',
    modulesSubtitle: 'Everything opens in this tab.',
    openTool: 'Open',
    opensInThisTab: 'Opens in this tab',
    comingSoon: 'Coming soon',
    proposalsSoon: 'Link to confirm with IT',
    profileTitle: 'Profile',
    profileName: 'Name',
    profileRole: 'Role',
    profileLanguage: 'Language',
    profileVersion: 'App version',
    signOut: 'Sign out',
    consoleTitle: 'T&D Console',
    consoleSoon: 'Console in a later milestone',
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
    pageLeadsIntro: 'Your leads, follow-ups and reminders live in LeadFlow.',
    pageLearningIntro: 'Your courses, quizzes and certificates live in the Learning Hub.',
    pageCalculatorsIntro: 'Premium, SDPP and income calculators.',
    pageDashboardIntro: 'Production, product mix and team contribution.',
    pageProposalsIntro: 'Proposal submission stays with the official agent portal (IT-owned).',
    pageProposalsNote: 'The production portal link is not confirmed yet. Please check with IT.',
    backHome: 'Back to Home',
    courseProgress: 'course progress',
    teamMembers: 'team members',
    teamLearningInProgress: '{count} team members learning in progress',
    demoRoleNote: 'Demo view for this role — real data arrives in a later milestone.',
    demoFirstLoginChange: 'first-login PIN change',
    dashboardLiveFrom: 'Live from Sales Command Center',
    dashboardOrgWide: 'Organisation-wide',
    dashboardLastSynced: 'Last synced {time}',
    dashboardRefresh: 'Refresh',
    dashboardRefreshing: 'Refreshing…',
    dashboardSalesTitle: 'Sales',
    dashboardSalesSubtitle: 'All producers · all time',
    dashboardTrainingTitle: 'Training',
    dashboardTrainingSubtitle: 'Sessions and field-force training',
    dashboardLeadersTitle: 'Top General Managers',
    dashboardLeadersSubtitle: 'By new premium · active producers only',
    dashboardUnassigned: 'Unassigned',
    dashboardUnassignedNote: 'Premiums with no GM recorded',
    dashboardOpenFull: 'Open the full dashboard',
    dashboardLoading: 'Loading live dashboard…',
    dashboardLoadError: 'Could not load the live dashboard.',
    dashboardLoadErrorDetail:
      'Check your connection and try again, or open the full Sales Command Center.',
    dashboardRetry: 'Try again',
    dashboardRefreshFailed: 'Refresh failed — showing data from {time}',
    dashboardSessionsUnavailable: 'Session data unavailable',
    dashboardNoLeaders: 'No ranked managers yet',
    kpiNewPremium: 'New premium',
    kpiPolicyQty: 'Policies',
    kpiLifetimePremium: 'Lifetime premium',
    kpiActiveProducers: 'Active producers',
    kpiAvgPremiumFa: 'Avg premium / FA',
    kpiAvgPolicyFa: 'Avg policies / FA',
    kpiTotalSessions: 'Training sessions',
    kpiTotalParticipants: 'Participants',
    kpiTotalCost: 'Training cost',
    kpiFaTrained: 'FAs trained',
    kpiSubAllProducers: 'All producers',
    kpiSubNewPolicies: 'New policies',
    kpiSubAllTime: 'All time',
    kpiSubFaActive: 'FA tier, active status',
    kpiSubPerActiveFa: 'Per active FA',
    kpiSubAllSessions: 'All sessions',
    kpiSubTotalTrained: 'Total trained',
    kpiSubFaTrained: '{count} of {total} active FAs',
    trainingDetailTitle: 'Training detail',
    trainingBasic: 'Basic done',
    trainingReview: 'Review done',
    trainingFoundation: 'Foundation done',
    trainingGap: 'Training gap',
    trainingGapSub: '{count} active FAs not yet trained',
    trainingGapSubOne: '1 active FA not yet trained',
    leadersPolicies: '{count} policies',
    dueWidgetTitle: 'Due premiums',
    dueWidgetDemoNote:
      'Demo data — live dues arrive with the Due & Lapse connection in a later milestone.',
    dueWidgetDueThisWeek: 'Due this week',
    dueWidgetOverdue: 'Overdue',
    dueWidgetShowing: 'Showing {shown} of {total} dues',
    dueWidgetBacklog: 'Backlog {amount}',
    dueWidgetDueOn: 'Due {date}',
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
    loginSubtitle: 'সব টুলের জন্য একটি লগইন',
    employeeId: 'কর্মচারী আইডি',
    employeeIdPlaceholder: 'যেমন 9990001',
    pin: 'পিন / পাসওয়ার্ড',
    pinPlaceholder: '৬ সংখ্যার পিন',
    signIn: 'সাইন ইন',
    signingIn: 'সাইন ইন হচ্ছে…',
    demoNoticeTitle: 'ডেমো — শুধুমাত্র পরীক্ষার জন্য',
    demoNoticeBody:
      'এই বিল্ডে ডেমো সাইন-ইন চালু আছে। নিচের ডেমো অ্যাকাউন্ট ব্যবহার করুন। কোনো বাস্তব কর্মচারী তথ্য ব্যবহৃত হয় না।',
    demoUser: 'ডেমো',
    errorWrongPin: 'ভুল পিন। আবার চেষ্টা করুন।',
    errorAttemptsLeft: 'বার চেষ্টা বাকি আছে, তারপর লক হবে',
    errorLocked: '৫ বার ভুল চেষ্টার পর অ্যাকাউন্ট লক হয়েছে।',
    errorUnknownUser: 'কর্মচারী আইডি পাওয়া যায়নি।',
    errorNotConfigured: 'এই বিল্ডে সাইন-ইন কনফিগার করা হয়নি।',
    errorSessionExpired: 'আপনার সেশন শেষ হয়ে গেছে। আবার সাইন ইন করুন।',
    lockedMinutes: '{minutes} মিনিট পরে আবার চেষ্টা করুন।',
    changePinTitle: 'নতুন পিন সেট করুন',
    changePinSubtitle:
      'অস্থায়ী পিন দিয়ে এটি আপনার প্রথম সাইন-ইন। চালিয়ে যেতে নতুন ৬ সংখ্যার পিন সেট করুন।',
    newPin: 'নতুন পিন',
    confirmPin: 'নতুন পিন নিশ্চিত করুন',
    changePinButton: 'নতুন পিন সংরক্ষণ করুন',
    errorPinMismatch: 'দুটি পিন মিলছে না।',
    errorPinInvalid: 'পিন অবশ্যই ঠিক ৬ সংখ্যার হতে হবে।',
    errorPinSame: 'নতুন পিন অস্থায়ী পিন থেকে আলাদা হতে হবে।',
    greetingMorning: 'শুভ সকাল',
    greetingAfternoon: 'শুভ অপরাহ্ন',
    greetingEvening: 'শুভ সন্ধ্যা',
    homeSubtitle: 'এক নজরে আপনার দিন।',
    demoDataBadge: 'ডেমো ডেটা',
    widgetFollowups: 'আজকের ফলো-আপ',
    widgetFollowupsEmpty: 'আজ কোনো ফলো-আপ নেই',
    widgetDues: 'এই সপ্তাহের বকেয়া',
    widgetDuesEmpty: 'এই সপ্তাহে কোনো প্রিমিয়াম বকেয়া নেই',
    widgetLearning: 'চলমান লার্নিং',
    widgetLearningEmpty: 'কোনো কোর্স চলমান নেই',
    widgetBusiness: 'এই মাসের ব্যবসা',
    widgetBusinessEmpty: 'এই মাসে কোনো ব্যবসা রেকর্ড হয়নি',
    followupsDue: 'টি ফলো-আপ বকেয়া',
    duesThisWeek: 'টি প্রিমিয়াম বকেয়া',
    learningInProgress: 'চলমান',
    businessThisMonth: 'এই মাসে এফওয়াইসিপি',
    teamSectionTitle: 'আপনার টিম',
    teamSectionSubtitle: 'আপনার ডাউনলাইনের টিম মোট।',
    modulesTitle: 'আপনার টুলস',
    modulesSubtitle: 'সবকিছু এই ট্যাবেই খুলবে।',
    openTool: 'খুলুন',
    opensInThisTab: 'এই ট্যাবেই খুলবে',
    comingSoon: 'শীঘ্রই আসছে',
    proposalsSoon: 'লিংক আইটির সঙ্গে নিশ্চিত করতে হবে',
    profileTitle: 'প্রোফাইল',
    profileName: 'নাম',
    profileRole: 'ভূমিকা',
    profileLanguage: 'ভাষা',
    profileVersion: 'অ্যাপ সংস্করণ',
    signOut: 'সাইন আউট',
    consoleTitle: 'টি অ্যান্ড ডি কনসোল',
    consoleSoon: 'কনসোল পরের মাইলস্টোনে আসবে',
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
    pageLeadsIntro: 'আপনার লিডস, ফলো-আপ ও রিমাইন্ডার লিডফ্লোতে থাকে।',
    pageLearningIntro: 'আপনার কোর্স, কুইজ ও সার্টিফিকেট লার্নিং হাবে থাকে।',
    pageCalculatorsIntro: 'প্রিমিয়াম, এসডিপিপি ও ইনকাম ক্যালকুলেটর।',
    pageDashboardIntro: 'প্রোডাকশন, প্রোডাক্ট মিক্স ও টিম অবদান।',
    pageProposalsIntro: 'প্রপোজাল জমা অফিসিয়াল এজেন্ট পোর্টালেই থাকে (আইটির তত্ত্বাবধানে)।',
    pageProposalsNote: 'প্রোডাকশন পোর্টালের লিংক এখনো নিশ্চিত হয়নি। আইটির সঙ্গে যোগাযোগ করুন।',
    backHome: 'হোমে ফিরুন',
    courseProgress: 'কোর্স অগ্রগতি',
    teamMembers: 'টিম সদস্য',
    teamLearningInProgress: '{count} জন টিম মেম্বার শিখছেন',
    demoRoleNote: 'এই ভূমিকার ডেমো ভিউ — বাস্তব ডেটা পরের মাইলস্টোনে আসবে।',
    demoFirstLoginChange: 'প্রথম সাইন-ইনে পিন পরিবর্তন',
    dashboardLiveFrom: 'সেলস কমান্ড সেন্টার থেকে লাইভ',
    dashboardOrgWide: 'সারা প্রতিষ্ঠানজুড়ে',
    dashboardLastSynced: 'সর্বশেষ সিঙ্ক {time}',
    dashboardRefresh: 'রিফ্রেশ',
    dashboardRefreshing: 'রিফ্রেশ হচ্ছে…',
    dashboardSalesTitle: 'সেলস',
    dashboardSalesSubtitle: 'সব প্রোডিউসার · সর্বমোট',
    dashboardTrainingTitle: 'ট্রেনিং',
    dashboardTrainingSubtitle: 'সেশন ও ফিল্ড ফোর্স ট্রেনিং',
    dashboardLeadersTitle: 'শীর্ষ জেনারেল ম্যানেজার',
    dashboardLeadersSubtitle: 'নতুন প্রিমিয়াম অনুযায়ী · শুধুমাত্র সক্রিয় প্রোডিউসার',
    dashboardUnassigned: 'বরাদ্দহীন',
    dashboardUnassignedNote: 'যেসব প্রিমিয়ামের জিএম রেকর্ড নেই',
    dashboardOpenFull: 'পূর্ণ ড্যাশবোর্ড খুলুন',
    dashboardLoading: 'লাইভ ড্যাশবোর্ড লোড হচ্ছে…',
    dashboardLoadError: 'লাইভ ড্যাশবোর্ড লোড করা যায়নি।',
    dashboardLoadErrorDetail:
      'আপনার সংযোগ পরীক্ষা করে আবার চেষ্টা করুন, অথবা পূর্ণ সেলস কমান্ড সেন্টার খুলুন।',
    dashboardRetry: 'আবার চেষ্টা করুন',
    dashboardRefreshFailed: 'রিফ্রেশ ব্যর্থ — {time}-এর ডেটা দেখানো হচ্ছে',
    dashboardSessionsUnavailable: 'সেশন ডেটা পাওয়া যায়নি',
    dashboardNoLeaders: 'এখনো কোনো র‍্যাঙ্ক করা ম্যানেজার নেই',
    kpiNewPremium: 'নতুন প্রিমিয়াম',
    kpiPolicyQty: 'পলিসি',
    kpiLifetimePremium: 'লাইফটাইম প্রিমিয়াম',
    kpiActiveProducers: 'সক্রিয় প্রোডিউসার',
    kpiAvgPremiumFa: 'গড় প্রিমিয়াম / এফএ',
    kpiAvgPolicyFa: 'গড় পলিসি / এফএ',
    kpiTotalSessions: 'ট্রেনিং সেশন',
    kpiTotalParticipants: 'অংশগ্রহণকারী',
    kpiTotalCost: 'ট্রেনিং খরচ',
    kpiFaTrained: 'প্রশিক্ষিত এফএ',
    kpiSubAllProducers: 'সব প্রোডিউসার',
    kpiSubNewPolicies: 'নতুন পলিসি',
    kpiSubAllTime: 'সর্বমোট',
    kpiSubFaActive: 'এফএ টিয়ার, সক্রিয়',
    kpiSubPerActiveFa: 'সক্রিয় এফএ প্রতি',
    kpiSubAllSessions: 'সব সেশন',
    kpiSubTotalTrained: 'মোট প্রশিক্ষিত',
    kpiSubFaTrained: '{total} জন সক্রিয় এফএর মধ্যে {count} জন',
    trainingDetailTitle: 'ট্রেনিং বিস্তারিত',
    trainingBasic: 'বেসিক সম্পন্ন',
    trainingReview: 'রিভিউ সম্পন্ন',
    trainingFoundation: 'ফাউন্ডেশন সম্পন্ন',
    trainingGap: 'ট্রেনিং ঘাটতি',
    trainingGapSub: '{count} জন সক্রিয় এফএ এখনো প্রশিক্ষিত নন',
    trainingGapSubOne: '1 জন সক্রিয় এফএ এখনো প্রশিক্ষিত নন',
    leadersPolicies: '{count}টি পলিসি',
    dueWidgetTitle: 'বকেয়া প্রিমিয়াম',
    dueWidgetDemoNote:
      'ডেমো ডেটা — লাইভ বকেয়া পরের মাইলস্টোনে ডিউ অ্যান্ড ল্যাপস সংযোগের সঙ্গে আসবে।',
    dueWidgetDueThisWeek: 'এই সপ্তাহে বকেয়া',
    dueWidgetOverdue: 'মেয়াদোত্তীর্ণ',
    dueWidgetShowing: '{total}টি বকেয়ার মধ্যে {shown}টি দেখানো হচ্ছে',
    dueWidgetBacklog: 'বকেয়া {amount}',
    dueWidgetDueOn: '{date}-এ বকেয়া',
  },
};
