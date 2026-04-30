export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function BacklogItemRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/library/${id}`);
}
