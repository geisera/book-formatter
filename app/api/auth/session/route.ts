import {NextRequest,NextResponse} from "next/server";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export async function POST(req:NextRequest){
  if(!url||!key)return NextResponse.json({error:"Authentication unavailable."},{status:503});
  let data:{access_token?:string;expires_in?:number};
  try{data=await req.json();}catch{return NextResponse.json({error:"Invalid request."},{status:400});}
  if(typeof data.access_token!=="string"||data.access_token.length>8192)return NextResponse.json({error:"Invalid token."},{status:400});
  try{
    const result=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+data.access_token},cache:"no-store",signal:AbortSignal.timeout(8000)});
    if(!result.ok)return NextResponse.json({error:"This sign-in link has expired or is invalid."},{status:401});
    const user=await result.json() as {email_confirmed_at?:string|null};
    if(!user.email_confirmed_at)return NextResponse.json({error:"Please confirm your email address before signing in."},{status:403});
    const response=NextResponse.json({ok:true});
    response.cookies.set("bf_access",data.access_token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:Math.min(Math.max(Number(data.expires_in)||3600,1),3600)});
    return response;
  }catch{return NextResponse.json({error:"Unable to verify authentication."},{status:502});}
}
