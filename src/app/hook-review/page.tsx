import { redirect } from "next/navigation";

/** Halaman lama /hook-review sudah berganti nama menjadi Generate Content. */
export default function HookReviewRedirect() {
  redirect("/generate-content");
}
