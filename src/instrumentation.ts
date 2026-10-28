/** 서버가 처음 뜰 때 한 번 실행된다. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
