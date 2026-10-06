import type { CSSProperties } from "react";

type IconProps = { className?: string };

const sidebarIcons = import.meta.glob<string>("../../../fonte/util/barra_lateral/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function sidebarIconUrl(fileName: string): string | undefined {
  const target = `/${fileName}`.toLowerCase();
  return Object.entries(sidebarIcons).find(([p]) => p.toLowerCase().endsWith(target))?.[1];
}

function SidebarIcon({ file }: { file: string }) {
  const src = sidebarIconUrl(file);
  if (!src) return null;
  const style: CSSProperties = {
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
  };
  return <span className="nav-icon-mask" style={style} aria-hidden />;
}

export function IconHome() {
  return <SidebarIcon file="Report.png" />;
}

export function IconCalendar() {
  return <SidebarIcon file="Planejamento.png" />;
}

export function IconPie() {
  return <SidebarIcon file="status.png" />;
}

export function IconCode() {
  return <SidebarIcon file="execucoes.png" />;
}

export function IconBug() {
  return <SidebarIcon file="falhas.png" />;
}

export function IconSettings({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconChevron({ flipped }: { flipped?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: flipped ? "rotate(180deg)" : undefined }}
      aria-hidden
    >
      <path d="M10 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
