"use client";

import React, { useEffect, useState } from "react";

interface Section {
  id: string;
  label: string;
}

interface SectionNavProps {
  sections: Section[];
  className?: string;
}

export function SectionNav({ sections, className = "" }: SectionNavProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const handleScroll = () => {
      let currentSectionId = "";
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          // If the top of the section is near the top of the viewport
          if (rect.top <= 120) {
            currentSectionId = section.id;
          }
        }
      }
      if (currentSectionId) {
        setActiveId(currentSectionId);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Initial check
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className={`ui-sectionnav ${className}`}>
      {sections.map((section) => (
        <button
          key={section.id}
          onClick={() => scrollTo(section.id)}
          className={`ui-sectionnav-btn ${
            activeId === section.id
              ? "ui-sectionnav-btn--active"
              : "ui-sectionnav-btn--inactive"
          }`}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
