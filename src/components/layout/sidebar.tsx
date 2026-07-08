"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, MessageSquareText, Newspaper, Ear, Swords, Radar,
  Lightbulb, Wand2, FileText, Bell, PlugZap, Settings, Activity, Menu, X,
  MapPin, Share2, SpellCheck, BarChart3, ListChecks, LayoutGrid, BookOpen, Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_GROUPS: { title: string; items: { href: string; label: string; icon: typeof Menu }[] }[] = [
  {
    title: "Monitoring",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/mentions", label: "All Mentions", icon: MessageSquareText },
      { href: "/media-tone", label: "Media Tone", icon: Newspaper },
      { href: "/social-listening", label: "Social Listening", icon: Ear },
      { href: "/buzz-geo", label: "Buzz Geo", icon: MapPin },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { href: "/content-breakdown", label: "Content Breakdown", icon: LayoutGrid },
      { href: "/sociograph", label: "Sociograph", icon: Share2 },
      { href: "/slang", label: "Slang Intelligence", icon: SpellCheck },
      { href: "/accounts", label: "Account Engagement", icon: BarChart3 },
      { href: "/competitor-watch", label: "Competitor Watch", icon: Swords },
      { href: "/trend-radar", label: "Trend Radar", icon: Radar },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/content-ideas", label: "Content Ideas", icon: Lightbulb },
      { href: "/generate-content", label: "Generate Content", icon: Wand2 },
      { href: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/alerts", label: "Alerts", icon: Bell },
      { href: "/sources", label: "Sources", icon: PlugZap },
      { href: "/crawl-jobs", label: "Crawl Jobs", icon: ListChecks },
      { href: "/guide", label: "Panduan Metrik", icon: BookOpen },
      { href: "/ai-usage", label: "Token Meter", icon: Coins },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav aria-label="Navigasi utama" className="flex flex-col gap-4 px-3">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== "/" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Tutup menu" : "Buka menu"}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg lg:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r bg-card py-4">
            <BrandMark />
            {nav}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r bg-card py-4 lg:flex">
        <BrandMark />
        {nav}
        <div className="mt-auto px-6 pt-6 text-xs text-muted-foreground">
          Multi-source brand intelligence
        </div>
      </aside>
    </>
  );
}

function BrandMark() {
  return (
    <div className="mb-5 flex items-center gap-2 px-6">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Activity className="h-4 w-4" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-bold leading-tight">Brand Pulse OS</p>
        <p className="text-xs text-muted-foreground">Brand Intelligence</p>
      </div>
    </div>
  );
}
