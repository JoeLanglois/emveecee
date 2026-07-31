import type { Context, MiddlewareHandler } from "hono";

export interface LiveReloadOptions {
  /** Internal endpoint prefix. Defaults to `/__site` and must begin with `/`. */
  readonly path?: string;
  /** Browser polling interval in milliseconds. Defaults to 500. */
  readonly interval?: number;
  /** Skip injection for selected requests. HTMX requests are skipped by default. */
  readonly ignore?: (context: Context) => boolean;
}

const marker = "data-site-live-reload";

function clientScript(version: string, versionPath: string, interval: number) {
  return `let version=${JSON.stringify(version)};
const versionPath=${JSON.stringify(versionPath)};
const interval=${interval};
let html;
const styles=new Map();
const probe=async url=>{
  const next=new URL(url,location.href);
  next.searchParams.set("__site_probe",Date.now());
  const response=await fetch(next,{cache:"no-store"});
  if(!response.ok)throw new Error(String(response.status));
  return response.text();
};
const page=async()=>{
  const response=await fetch(location.href,{cache:"no-store"});
  if(!response.ok)throw new Error(String(response.status));
  return response.text();
};
const stylesheetLinks=()=>[...document.querySelectorAll('link[rel~="stylesheet"][href]')]
  .filter(link=>new URL(link.href,location.href).origin===location.origin);
const readStyles=async()=>Promise.all(stylesheetLinks().map(async link=>{
  try{return [link,await probe(link.href)]}catch{return [link,undefined]}
}));
const initialize=async()=>{
  try{html=await page()}catch{}
  for(const [link,content] of await readStyles())if(content!==undefined)styles.set(link,content);
};
const update=async()=>{
  let changedStyle=false;
  for(const [link,content] of await readStyles()){
    if(content===undefined)continue;
    const previous=styles.get(link);
    styles.set(link,content);
    if(previous!==undefined&&previous!==content){
      const href=new URL(link.href,location.href);
      href.searchParams.set("__site_reload",Date.now());
      link.href=href;
      changedStyle=true;
    }
  }
  try{
    const response=await fetch(versionPath,{cache:"no-store"});
    if(!response.ok)return;
    const nextVersion=await response.text();
    if(nextVersion===version)return;
    const nextHtml=await page();
    if(html!==undefined&&nextHtml!==html){location.reload();return}
    html=nextHtml;
    version=nextVersion;
  }catch{}
};
await initialize();
setInterval(update,interval);`;
}

/** Inject browser live reload into full HTML responses during development. */
export function liveReload(options: LiveReloadOptions = {}): MiddlewareHandler {
  const path = (options.path ?? "/__site").replace(/\/$/, "");
  const interval = options.interval ?? 500;
  const ignore = options.ignore ?? (context =>
    context.req.header("HX-Request") === "true");

  if (!path.startsWith("/")) throw new Error("liveReload path must begin with /");
  if (!Number.isFinite(interval) || interval < 100) {
    throw new Error("liveReload interval must be at least 100ms");
  }

  const version = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const versionPath = `${path}/version`;
  const scriptPath = `${path}/client.js`;
  const script = clientScript(version, versionPath, interval);

  return async (context, next) => {
    const pathname = new URL(context.req.url).pathname;
    if (pathname === versionPath) {
      return context.text(version, 200, { "Cache-Control": "no-store" });
    }
    if (pathname === scriptPath) {
      return context.body(script, 200, {
        "Cache-Control": "no-store",
        "Content-Type": "text/javascript; charset=UTF-8",
      });
    }

    await next();

    const response = context.res;
    const contentType = response.headers.get("Content-Type") ?? "";
    if (
      ignore(context) ||
      !contentType.toLowerCase().startsWith("text/html") ||
      response.headers.has("Content-Encoding")
    ) return;

    const source = await response.text();
    if (source.includes(marker)) return;

    const tag = `<script type="module" src="${scriptPath}" ${marker}></script>`;
    const endBody = source.toLowerCase().lastIndexOf("</body>");
    const body = endBody < 0
      ? `${source}${tag}`
      : `${source.slice(0, endBody)}${tag}${source.slice(endBody)}`;
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    context.res = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
