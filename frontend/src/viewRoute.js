export function getView(pathname = "/") {
  if (/^\/expenses\/?$/.test(pathname)) return "expenses";
  return /^\/shopping\/?$/.test(pathname) ? "shopping" : "trips";
}
