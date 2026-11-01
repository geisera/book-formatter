"use client";
import {useState} from "react";
type Mode="sign-in"|"sign-up"|"reset";
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
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      if(!configured)throw Error("Authentication is not configured. Contact the site administrator.");
      const target=mode==="sign-in"?"/auth/v1/token?grant_type=password":mode==="sign-up"?"/auth/v1/signup":"/auth/v1/recover";
      const response=await fetch(endpoint+target,{
        method:"POST",headers:{"apikey":publishable!,"Content-Type":"application/json"},
        body:JSON.stringify(mode==="reset"?{email}:{email,password})
      });
      const result=await response.json() as {error_description?:string;msg?:string;message?:string;access_token?:string;refresh_token?:string};
      if(!response.ok)throw Error(result.error_description||result.msg||result.message||"Authentication request failed.");
      if(mode==="sign-in"){
        if(!result.access_token)throw Error("No session returned. Check that your email is confirmed.");
        // Phase 1 proves provider identity; an authenticated workspace will follow once server-side guards exist.
        setMessage("Sign-in succeeded. Authenticated workspace access is not enabled yet.");
      }else if(mode==="sign-up"){
        setMessage("Registration submitted. Check your email for a confirmation link.");
      }else{setMessage("If an account exists, password recovery instructions have been sent.");}
    }catch(e){setError(e instanceof Error?e.message:"Authentication failed.");}
    finally{setBusy(false);}
  }
  return <main className="auth-page">
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">BOOK FORMATTER</p>
      <h1 id="auth-title">{mode==="sign-in"?"Sign in":mode==="sign-up"?"Create account":"Reset password"}</h1>
      <p>Account authentication is separate from manuscript storage. Your books remain local to this browser.</p>
      {!configured?<p role="alert" className="alert">Authentication is awaiting Supabase project configuration.</p>:null}
      {error?<p role="alert" className="alert">{error}</p>:null}
      {message?<p role="status">{message}</p>:null}
      <form onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
        {mode!=="reset"?<label>Password<input type="password" minLength={8} autoComplete={mode==="sign-up"?"new-password":"current-password"} required value={password} onChange={e=>setPassword(e.target.value)}/></label>:null}
        <button type="submit" className="primary" disabled={!configured||busy}>{busy?"Working…":mode==="sign-in"?"Sign in":mode==="sign-up"?"Register":"Send recovery email"}</button>
      </form>
      <div className="auth-options">
        <button type="button" onClick={()=>{setMode("sign-in");setError("");setMessage("");}}>Sign in</button>
        <button type="button" onClick={()=>{setMode("sign-up");setError("");setMessage("");}}>Register</button>
        <button type="button" onClick={()=>{setMode("reset");setError("");setMessage("");}}>Forgot password?</button>
      </div>
      <a href="/">Back to Book Formatter</a>
    </section>
  </main>;
}
