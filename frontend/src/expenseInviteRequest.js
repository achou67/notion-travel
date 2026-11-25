export async function inviteRequest(input, options = {}) {
  const response = await fetch("/api/expense-invites", {
    cache: "no-store",
    ...(input && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
    ...options
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || "目前無法處理旅伴邀請，請稍後再試。");
  return data;
}
