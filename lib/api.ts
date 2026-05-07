export function setupFetchInterceptor() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const isInternal = url.startsWith("/") || url.startsWith(window.location.origin);

    const res = await originalFetch(input, init);

    if (res.status === 401 && isInternal) {
      localStorage.removeItem("auth_token");
      window.location.href = "/";
    }

    return res;
  };
}