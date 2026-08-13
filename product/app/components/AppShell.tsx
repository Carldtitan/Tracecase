"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

const navItems = [
  { label: "Overview", icon: "home", href: "/app" },
  { label: "Cases", icon: "cases", href: "/app/cases" },
  { label: "Runs", icon: "activity", href: "/app/runs" },
  { label: "Repositories", icon: "folder", href: "/app/repositories" },
  { label: "Connections", icon: "connections", href: "/app/connections" },
  { label: "Settings", icon: "settings", href: "/app/settings" },
] as const;

type ShellUser = { name: string; email?: string; image?: string };

export function AppShell({ children, projectName, user }: { children: React.ReactNode; projectName: string; user: ShellUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const initials = user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const panel = sidebarRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const menuButton = menuButtonRef.current;
    const focusable = () => [...(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])];
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      (previous ?? menuButton)?.focus();
    };
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <aside ref={sidebarRef} className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} aria-label="Private dashboard navigation" role={isMobile ? "dialog" : undefined} aria-modal={isMobile && menuOpen ? true : undefined} inert={isMobile && !menuOpen ? true : undefined}>
        <div className="brand-row">
          <Link className="brand" href="/app" aria-label="Tracecase overview">
            <span className="brand-mark" aria-hidden="true">T</span>
            <span>Tracecase</span>
          </Link>
          <button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><Icon name="close" /></button>
        </div>

        <div className="workspace-label">
          <span>Project</span>
          <strong>{projectName}</strong>
        </div>

        <nav className="side-nav">
          {navItems.map((item) => {
            const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            return (
              <Link className={`nav-item ${active ? "nav-active" : ""}`} href={item.href} key={item.label} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <Link className="account-link" href="/app/settings" aria-label="Open account settings">
            {user.image ? <Image className="avatar-image" src={user.image} alt="" width={36} height={36} /> : <span className="avatar" aria-hidden="true">{initials}</span>}
            <span className="account-copy"><strong>{user.name}</strong><span>{user.email ?? "GitHub account"}</span></span>
            <Icon className="account-more" name="chevron-right" />
          </Link>
        </div>
      </aside>

      {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

      <div className="app-main">
        <header className="mobile-header">
          <button ref={menuButtonRef} className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen}><Icon name="menu" /></button>
          <Link className="brand brand-mobile" href="/app"><span className="brand-mark" aria-hidden="true">T</span><span>Tracecase</span></Link>
          <span className="mobile-spacer" />
        </header>
        {children}
      </div>
    </div>
  );
}
