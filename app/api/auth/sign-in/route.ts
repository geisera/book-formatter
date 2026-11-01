import {NextRequest,NextResponse} from "next/server";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export async function POST(req:NextRequest){
 if(!url||!key)return NextResponse.json({error:"Authentication is not configured."},{status:503});
 let data:{email?:string;password?:string};
 try{data=await req.json();}catch{return NextResponse.json({error:"Invalid request."},{status:400});}
 if(typeof data.email!=="string"||typeof data.password!=="string"||data.email.length>320||data.password.length>1024)
 return NextResponse.json({error:"Invalid credentials."},{status:400});
 try{
  const res=await fetch(url+"/auth/v1/token?grant_type=password",{
   method:"POST",headers:{"apikey":key,"Content-Type":"application/json"},
   body:JSON.stringify({email:data.email,password:data.password}),cache:"no-store"
  });
  const result=await res.json() as {access_token?:string;expires_in?:number;error_description?:string;msg?:string};
  if(!res.ok||!result.access_token)return NextResponse.json({error:result.error_description||result.msg||"Sign-in failed."},{status:401});
  const verified=await fetch(url+"/auth/v1/user",{headers:{"apikey":key,"Authorization":"Bearer "+result.access_token},cache:"no-store"});
  if(!verified.ok)return NextResponse.json({error:"Unable to verify sign-in."},{status:401});
  const response=NextResponse.json({ok:true});
  response.cookies.set("bf_access",result.access_token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:Math.min(result.expires_in||3600,3600)});
  return response;
 }catch{return NextResponse.json({error:"Authentication provider unavailable."},{status:502});}
}
