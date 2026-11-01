"use client";
import {useEffect,useState} from "react";
type Mode="sign-in"|"sign-up"|"reset"|"magic-link";
const endpoint=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export default function AuthPage(){
  const [mode,setMode]=useState<Mode>("sign-in");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const configured=!!endpoint&&!!publishable;
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get("mode")==="sign-up")setMode("sign-up");
    const authError=params.get("error_description")||params.get("error");
    if(authError)setError(authError);
    else if(params.get("confirmed")==="true")setMessage("Email confirmed successfully. Your address is verified. Sign in to access your workspace.");
    if(authError||params.has("confirmed"))window.history.replaceState(null,"","/auth/");
  },[]);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      if(!configured)throw Error("Authentication is not configured. Contact the site administrator.");
      const target=mode==="sign-in"?"/auth/v1/token?grant_type=password":mode==="sign-up"?"/auth/v1/signup?redirect_to="+encodeURIComponent(window.location.origin+"/auth/callback/?flow=confirm"):mode==="magic-link"?"/auth/v1/otp?redirect_to="+encodeURIComponent(window.location.origin+"/auth/callback/"):"/auth/v1/recover";
      const response=await fetch(mode==="sign-in"?"/api/auth/sign-in":endpoint+target,{
        method:"POST",headers:{"apikey":publishable!,"Content-Type":"application/json"},credentials:"same-origin",
        body:JSON.stringify(mode==="reset"?{email}:mode==="magic-link"?{email,create_user:false}:{email,password})
      });
      const result=await response.json() as {error_description?:string;msg?:string;message?:string;error?:string};
      if(!response.ok)throw Error(result.error||result.error_description||result.msg||result.message||"Authentication request failed.");
      if(mode==="sign-in"){
        window.location.assign("/workspace/");
      }else if(mode==="magic-link"){
        setMessage("If this email belongs to an account, a one-time sign-in link is on its way. Open the link on the device where you want to access your workspace. Check Spam or Promotions if necessary.");
      }else if(mode==="sign-up"){
        setMessage("Check your inbox for a confirmation email. Open its confirmation link to verify your address. You will then return to BookStitcher to sign in. Also check Spam or Promotions if it does not arrive promptly.");
      }else{setMessage("If an account exists, password recovery instructions have been sent.");}
    }catch(e){setError(e instanceof Error?e.message:"Authentication failed.");}
    finally{setBusy(false);}
  }
  return <main className="auth-page">
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">BOOK FORMATTER</p>
      <h1 id="auth-title">{mode==="sign-in"?"Sign in":mode==="sign-up"?"Create account":mode==="magic-link"?"Email sign-in link":"Reset password"}</h1>
      <p>Account authentication is separate from manuscript storage. Your books remain local to this browser.</p>
      {mode==="magic-link"?<p className="auth-confirm-note">Enter the email address of an existing account. We’ll send a one-time sign-in link; no password required. Open the link to complete sign-in on the device where you want to work.</p>:null}
      {mode==="sign-up"?<p className="auth-confirm-note"><strong>Email confirmation required.</strong> After registering, check your inbox and click the verification link from Book Formatter before attempting to sign in.</p>:null}
      {!configured?<p role="alert" className="alert">Authentication is awaiting Supabase project configuration.</p>:null}
      {error?<p role="alert" className="alert">{error}</p>:null}
      {message?<p role="status">{message}</p>:null}
      <form onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
        {mode!=="reset"&&mode!=="magic-link"?<label>Password<input type="password" minLength={8} autoComplete={mode==="sign-up"?"new-password":"current-password"} required value={password} onChange={e=>setPassword(e.target.value)}/></label>:null}
        <button type="submit" className="primary" disabled={!configured||busy}>{busy?"Working…":mode==="sign-in"?"Sign in":mode==="sign-up"?"Register":mode==="magic-link"?"Email me a sign-in link":"Send recovery email"}</button>
      </form>
      <div className="auth-options">
        <button type="button" onClick={()=>{setMode("sign-in");setError("");setMessage("");}}>Sign in</button>
        <button type="button" onClick={()=>{setMode("sign-up");setError("");setMessage("");}}>Register</button>
        <button type="button" onClick={()=>{setMode("magic-link");setError("");setMessage("");}}>Sign in without password</button>
        <button type="button" onClick={()=>{setMode("reset");setError("");setMessage("");}}>Forgot password?</button>
      </div>
      <a href="/">Back to Book Formatter home</a>
    </section>
  </main>;
}
