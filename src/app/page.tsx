import { MoodboardApp } from "@/components/MoodboardApp";

export default async function Home({
  searchParams
}: {
  searchParams?: Promise<{
    project?: string;
  }>;
}) {
  const params = await searchParams;
  return <MoodboardApp initialProjectId={params?.project ?? null} />;
}
