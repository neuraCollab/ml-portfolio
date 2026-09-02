import React, { useEffect, useState } from 'react';
import { LucideIcon } from 'lucide-react';

export interface ProjectSectionNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface ProjectSectionNavProps {
  items: ProjectSectionNavItem[];
  /** Active-item accent color class, e.g. 'text-emerald-400'. Should match the project's ProjectSection accentClassName. */
  accentClassName?: string;
}

/**
 * Sticky mini table-of-contents for a project page's 10 sections. Scroll-jumps
 * on click and highlights whichever section is currently in view via
 * IntersectionObserver -- pages get long with 10 sections each, so this lets a
 * recruiter jump straight to e.g. Metrics or Results without scrolling past
 * everything else.
 */
export const ProjectSectionNav: React.FC<ProjectSectionNavProps> = ({ items, accentClassName = 'text-indigo-400' }) => {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 }
    );
    items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav
      className="lg:sticky lg:top-20 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible bg-slate-900 border border-slate-800 rounded-xl p-2 lg:w-48 shrink-0 lg:self-start lg:max-h-[calc(100vh-6rem)]"
      aria-label="Section navigation"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => scrollTo(item.id)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition shrink-0 ${
            activeId === item.id ? `bg-slate-800 ${accentClassName}` : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <item.icon className="w-3.5 h-3.5 shrink-0" />
          {item.label}
        </button>
      ))}
    </nav>
  );
};
