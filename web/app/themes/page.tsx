import { redirect } from "next/navigation";
import { listThemes } from "@/lib/themes-data";

// One theme in v1 — the index just forwards to it. With N themes this becomes a picker.
export default function ThemesIndexPage() {
  const themes = listThemes();
  redirect(`/themes/${themes[0]?.code ?? "ai"}`);
}
