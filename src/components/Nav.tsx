"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Özet" },
  { href: "/nakit-akis", label: "Nakit Akış" },
  { href: "/projeksiyon", label: "Projeksiyon" },
  { href: "/islemler", label: "İşlemler" },
  { href: "/yukle", label: "Ekstre Yükle" },
  { href: "/hesaplar", label: "Hesaplar & Kartlar" },
  { href: "/planlama", label: "Düzenli & Krediler" },
  { href: "/kategoriler", label: "Kategoriler" },
  { href: "/ayarlar", label: "Ayarlar" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cx(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm",
              active ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
