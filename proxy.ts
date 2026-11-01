import {NextRequest,NextResponse} from "next/server";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export async function proxy(request:NextRequest){
  const pathname=request.nextUrl.pathname;
  if(pathname.startsWith("/auth")||pathname.startsWith("/api/auth")||pathname.startsWith("/_next/")||pathname==="/favicon.ico")return NextResponse.next();
  if(!url||!key)return NextResponse.redirect(new URL("/auth/",request.url));
  const access=request.cookies.get("bf_access")?.value;
  if(access){
    try{
      const result=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+access},cache:"no-store",signal:AbortSignal.timeout(6000)});
      if(result.ok)return NextResponse.next();
    }catch{}
  }
  const next=new URL("/auth/",request.url);
  if(pathname!=="/")next.searchParams.set("next",pathname);
  const response=NextResponse.redirect(next);
  response.cookies.delete("bf_access");
  return response;
}
export const config={matcher:["/","/help/:path*"]};
