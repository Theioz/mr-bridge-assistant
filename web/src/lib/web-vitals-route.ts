// Route key for a web-vitals row (#445): the pathname with record ids collapsed, so a metric
// groups by page ("/backlog/:id"), not by the record that happened to be open.

const ID_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z0-9_-]{20,})$/i;

export function vitalsRoute(pathname: string): string {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  if (!parts.length) return "/";
  return "/" + parts.map((p) => (ID_SEGMENT.test(p) ? ":id" : p)).join("/");
}
