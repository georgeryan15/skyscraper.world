import ManhattanMap from "@/components/manhattan-map";
import { connection } from "next/server";
import { getBuildings } from "@/lib/db";

export default async function Home() {
  await connection();
  const buildings = await getBuildings();
  return <ManhattanMap buildings={buildings} />;
}
