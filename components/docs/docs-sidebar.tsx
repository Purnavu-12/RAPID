"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TocItem } from "@/lib/docs";

interface DocsSidebarProps {
  toc: TocItem[];
}

export function DocsSidebar({ toc }: DocsSidebarProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>("");

  // Scroll-spy: highlight the heading currently in view.
  useEffect(() => {
    const callback: IntersectionObserverCallback = (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveId(entry.target.id);
        }
      }
    };

    const observer = new IntersectionObserver(callback, {
      root: null,
      rootMargin: "0px 0px -60% 0px",
      threshold: 0.1,
    });

    document
      .querySelectorAll(".md-content h2[id], .md-content h3[id]")
      .forEach((h) => observer.observe(h));

    return () => observer.disconnect();
  }, []);

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <nav className="w-full md:w-64 md:flex md:flex-col md:sticky md:top-20 md:self-start md:overflow-y-auto md:max-h-screen scrollbar-thin">
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase mb-4">
        On this page
      </p>
      <ol className="space-y-1">
        {toc.map((item) => (
          <SidebarSection
            key={item.id}
            item={item}
            activeId={activeId}
            openId={openId}
            onToggle={toggle}
          />
        ))}
      </ol>
    </nav>
  );
}

function SidebarSection({
  item,
  activeId,
  openId,
  onToggle,
}: {
  item: TocItem;
  activeId: string;
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  const hasChildren = item.children && item.children.length > 0;
  // A section is expanded if the user toggled it open OR if it contains
  // (or is) the heading currently in view.
  const isOpen =
    openId === item.id ||
    (hasChildren &&
      item.children.some((c) => c.id === activeId || c.children?.some((cc) => cc.id === activeId)));
  const isActive = activeId === item.id;

  const labelClasses =
    "block text-sm py-1.5 pr-4 pl-3 hover:text-foreground transition-colors";
  const activeClasses = isActive
    ? "text-primary font-medium"
    : "text-muted-foreground/70";
  const indent = item.level > 2 ? "md:ml-" + (item.level - 2) * 2 : "";

  return (
    <>
      <li className={`${indent} ${isActive ? "bg-foreground/[0.03]" : ""}`}>
        <a
          href={"#" + item.id}
          className={`${labelClasses} ${activeClasses} flex items-center justify-between`}
          onClick={() => {
            if (hasChildren) onToggle(item.id);
            else onToggle(item.id);
          }}
        >
          <span>{item.text}</span>
          {hasChildren && (
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 text-muted-foreground/50 transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          )}
        </a>
      </li>
      {hasChildren && isOpen && (
        <ul className="ml-4 md:ml-5 border-l border-foreground/5 pl-2 md:pl-4 space-y-1">
          {item.children.map((child) => (
            <li key={child.id} className={activeId === child.id ? "bg-foreground/[0.03]" : ""}>
              <a
                href={"#" + child.id}
                className={`${labelClasses} ${
                  activeId === child.id ? "text-primary font-medium" : "text-muted-foreground/70"
                }`}
              >
                {child.text}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
