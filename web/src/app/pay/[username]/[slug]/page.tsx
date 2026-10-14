"use client";

import { useParams } from "next/navigation";
import { PayView } from "../PayView";

export default function SlugPayPage() {
  const params = useParams<{ username: string; slug: string }>();
  return (
    <PayView
      username={decodeURIComponent(params.username || "").toLowerCase()}
      slug={decodeURIComponent(params.slug || "").toLowerCase()}
    />
  );
}
