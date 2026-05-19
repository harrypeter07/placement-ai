export const siteConfig = {
  name: "PlaceMint AI",
  description:
    "AI-powered placement management platform that monitors Telegram groups, extracts deadlines, and keeps you ahead of every opportunity.",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  links: {
    github: "https://github.com",
    docs: "/docs",
  },
  nav: {
    main: [
      { title: "Features", href: "#features" },
      { title: "How it works", href: "#workflow" },
      { title: "Integrations", href: "#integrations" },
      { title: "FAQ", href: "#faq" },
    ],
  },
  dashboard: {
    student: [
      { title: "Overview", href: "/dashboard", icon: "LayoutDashboard" },
      { title: "Placements", href: "/dashboard/deadlines", icon: "Clock" },
      { title: "Calendar", href: "/dashboard/calendar", icon: "Calendar" },
      { title: "Notifications", href: "/dashboard/notifications", icon: "Bell" },
      { title: "Automation", href: "/dashboard/automation", icon: "Zap" },
      { title: "Eligibility", href: "/dashboard/eligibility", icon: "CheckCircle" },
      { title: "Resume Analyzer", href: "/dashboard/resume", icon: "FileText" },
      { title: "Analytics", href: "/dashboard/analytics", icon: "BarChart3" },
      { title: "Settings", href: "/dashboard/settings", icon: "Settings" },
    ],
    admin: [
      { title: "Overview", href: "/admin", icon: "LayoutDashboard" },
      { title: "Students", href: "/admin/students", icon: "Users" },
      { title: "Broadcasts", href: "/admin/broadcasts", icon: "Megaphone" },
      { title: "Analytics", href: "/admin/analytics", icon: "BarChart3" },
    ],
  },
};
