import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Giriş yap | Campus Live",
  description: "Okul e-postanızla giriş yapın; bölgelerin doluluğu için bildirim alın.",
};

export default function LoginPage() {
  return <LoginForm />;
}
