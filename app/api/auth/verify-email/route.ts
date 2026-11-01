import {NextRequest,NextResponse} from "next/server";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export async function POST(req:NextRequest){
 if(!url||!key)return NextResponse.json({error:"Authentication unavailable."},{status:503});
 let token:string|undefined;
 try{const body=await req.json() as {access_token?:string};token=body.access_token;}catch{}
 if(typeof token!=="string"||token.length>8192)return NextResponse.json({error:"Invalid confirmation token."},{status:400});
 try{
  const response=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!response.ok)return NextResponse.json({error:"Confirmation link is invalid or expired."},{status:401});
  const user=await response.json() as {email_confirmed_at?:string|null};
  if(!user.email_confirmed_at)return NextResponse.json({error:"This email address has not been confirmed."},{status:403});
  return NextResponse.json({confirmed:true},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Unable to verify email confirmation."},{status:502});}
}
