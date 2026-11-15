import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import HomePage from "./home";

// The app picks its language from ?lang=; shared pt links get the Portuguese card.
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  if ((await searchParams).lang !== "pt") return {};
  const title = "SkyBlink: estrelas se movem. Aqui está a prova.";
  const description = "Imagens reais do céu feitas pelo SPHEREx, da NASA, temporada após temporada, para você ver com seus próprios olhos quais estrelas estão em movimento.";
  const images = [{ url: "/og-pt.png", width: 1200, height: 630, alt: "SkyBlink: duas imagens do SPHEREx da Estrela de Barnard, com um ano de diferença, mostrando que ela se moveu" }];
  return {
    title: "SkyBlink: veja estrelas se movendo em imagens do SPHEREx, da NASA",
    description,
    openGraph: { title, description, images, locale: "pt_BR", siteName: "SkyBlink", type: "website" },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

// Metadata reads ?lang=, so tell Next this page is per-request (its suggested fix for blocking metadata).
async function PerRequest() {
  await connection();
  return null;
}

export default function Page() {
  return (
    <>
      <Suspense>
        <PerRequest />
      </Suspense>
      <HomePage />
    </>
  );
}
