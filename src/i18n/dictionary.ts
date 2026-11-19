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
  | 'demoFirstLoginChange';

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
    moduleDashboardDesc: 'Sales & training dashboard for team leaders.',
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
    moduleDashboardDesc: 'টিম লিডারদের জন্য সেলস ও ট্রেনিং ড্যাশবোর্ড।',
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
  },
};
