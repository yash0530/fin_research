"use server";

import { revalidatePath } from "next/cache";
import { acceptProposal, rejectProposal } from "@/lib/theme-proposals-data";

export async function handleAcceptProposal(id: string) {
  const success = await acceptProposal(id);
  if (success) {
    revalidatePath("/themes");
    revalidatePath("/themes/[code]", "layout");
  }
  return { success };
}

export async function handleRejectProposal(id: string) {
  const success = await rejectProposal(id);
  if (success) {
    revalidatePath("/themes");
    revalidatePath("/themes/[code]", "layout");
  }
  return { success };
}
