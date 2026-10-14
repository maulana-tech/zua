"use client";

import { useParams } from "next/navigation";
import { PayView } from "./PayView";

export default function PayPage() {
  const params = useParams<{ username: string }>();
  return (
    <PayView
      username={decodeURIComponent(params.username || "").toLowerCase()}
    />
  );
}
